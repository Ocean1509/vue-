
深入剖析Vue源码 - 数据代理，关联子父组件


> 简单回顾一下这个系列的前两节，前两节花了大篇幅讲了vue在初始化时进行的选项合并。选项配置是vue实例化的第一步，针对不同类型的选项，vue提供的丰富选项配置策略以保证用户可以使用不同丰富的配置选项。而在这一节中，我们会分析选项合并后的又两步重要的操作： 数据代理和关联子父组件关系，分别对应的处理过程为initProxy和initLifecycle。这章节的知识点也为后续的响应式系统介绍和模板渲染做铺垫。

### 2.1 Object.defineProperty和Proxy
在介绍这一章的源码分析之前，我们需要掌握一下贯穿整个vue数据代理,监控的技术核心：Object.defineProperty 和 Proxy
##### 2.1.1 Object.defineProperty
> 官方定义：Object.defineProperty()方法会直接在一个对象上定义一个新属性，或者修改一个对象的现有属性， 并返回这个对象。
基本用法： Object.defineProperty(obj, prop, descriptor)

我们可以用来精确添加或修改对象的属性，只需要在descriptor中将属性特性描述清楚，descriptor的属性描述符有两种形式，一种是数据描述符，另一种是存取描述符。

数据描述符

- configurable：数据是否可删除
- enumerable：属性是否可枚举
- value：属性值,默认为undefined
- writable：属性是否可读写

存取描述符

- configurable：数据可改变
- enumerable：可枚举
- get:一个给属性提供 getter 的方法，如果没有 getter 则为 undefined。
- set:一个给属性提供 setter 的方法，如果没有 setter 则为 undefined。

**注意: 数据描述符的value，writable 和 存取描述符的get, set属性不能同时存在，否则会抛出异常。**
有了Object.defineProperty方法，我们可以方便的利用存取描述符中的getter/setter来进行数据监听,在get,set钩子中分别做不同的操作，这是vue双向数据绑定原理的雏形，我们会在响应式系统的源码分析时具体阐述。
```
var o = {}
var value;
Object.defineProperty(o, 'a', {
    get() {
        console.log('获取值')
        return value
    },
    set(v) {
        console.log('设置值')
        value = v
    }
})
o.a = 'sss' 
// 设置值
console.log(o.a)
// 获取值
// 'sss'

```
然而Object.defineProperty的get和set方法只能观测到对象属性的变化，对于数组类型的变化并不能检测到，这是用Object.defineProperty进行数据监控的缺陷，而vue中对于数组类型的方法做了特殊的处理。
es6的proxy可以完美的解决这一类问题。

##### 2.1.2 Proxy
Proxy 是es6的语法，和Object.defineProperty一样，也是用于修改某些操作的默认行为，但是和Object.defineProperty不同的是，**Proxy针对目标对象，会创建一个新的实例对象，并将目标对象代理到新的实例对象上，** 本质的区别就是多了一层代理，外界对该对象的访问，都必须先通过这层拦截，因此提供了一种机制，可以对外界的访问进行过滤和改写。外界通过操作新的实例对象从而操作真正的目标对象。针对getter和setter的基本用法如下:
```
var obj = {}
var nobj = new Proxy(obj, {
    get(target, property) {
        console.log('获取值')
        return target[property]
    },
    set(target, key, value) {
        console.log('设置值')
        return target[key]
    }
})
nobj.a = 1111 // 通过操作代理对象从而映射到目标对象上
// 设置值
// 获取值
// 1111
console.log(nobj.a)
```
Proxy 支持的拦截操作有13种之多，具体可以参照[Proxy](http://es6.ruanyifeng.com/#docs/proxy),上面提到，Object.defineProperty的get和set方法并不能监测到数组的变化，而Proxy是否能做到呢？
```
var arr = [1, 2, 3]
let obj = new Proxy(arr, {
    get: function (target, key, receiver) {
        console.log("获取数组");
        return Reflect.get(target, key, receiver);
    },
    set: function (target, key, receiver) {
        console.log('设置数组');
        return Reflect.set(target, key, receiver);
    }
})

obj.push(222) 
// '获取数组'
// '设置数组'

```
显然proxy可以很容易的监听到数组的变化。

### 2.2 initProxy
有了这些理论基础，我们往下看vue的源码，在初始化合并选项后，vue接下来的操作是为vm实例设置一层代理，代理的目的是为**vue在模板渲染时进行一层数据筛选**。如果浏览器不支持Proxy，这层代理检验数据则会失效。(检测数据会放到其他地方检测)
```
{
    // 对vm实例进行一层代理
    initProxy(vm);
}
// 代理函数
var initProxy = function initProxy (vm) {
    // 浏览器如果支持es6原生的proxy，则会进行实例的代理，这层代理会在模板渲染时对一些非法或者不存在的字符串进行判断，做数据的过滤筛选。
    if (hasProxy) {
        var options = vm.$options;
        var handlers = options.render && options.render._withStripped
            ? getHandler
            : hasHandler;
        // 代理vm实例到vm属性_renderProxy
        vm._renderProxy = new Proxy(vm, handlers);
    } else {
        vm._renderProxy = vm;
    }
};

如何判断浏览器支持原生proxy
// 是否支持Symbol 和 Reflect
var hasSymbol =
    typeof Symbol !== 'undefined' && isNative(Symbol) &&
    typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys);
function isNative (Ctor) {
    // Proxy本身是构造函数，且Proxy.toString === 'function Proxy() { [native code] }'
    return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}
``` 

看到这里时，心中会有几点疑惑。
- 什么时候会触发这层代理进行数据检测？
- getHandler 和 hasHandler的场景分别是什么？

要解决这个疑惑，我们接着往下看：

- 1.在组件的更新渲染时会调用vm实例的render方法(具体模板引擎如何工作，我们放到相关专题在分析),我们观察到，vm实例的render方法在调用时会触发这一层的代理。
```
Vue.prototype._render = function () {
    ···
    // 调用vm._renderProxy
    vnode = render.call(vm._renderProxy, vm.$createElement);
}
```
也就是说模板引擎```<div>{{message}}</div>```的渲染显示，会通过Proxy这层代理对数据进行过滤，并对非法数据进行报错提醒。

- 2.handers函数会根据options.render 和 options.render._withStripped执行不同的代理函数getHandler,hasHandler。当使用类似webpack这样的打包工具时，我们将使用vue-loader进行模板编译，这个时候options.render 是存在的，并且_withStripped的属性也会设置为true，关于编译版本和运行版本的区别不在这一章节展开。先大致了解使用场景即可。


##### 2.2.1 代理场景
接着上面的问题，vm实例代理时会根据是否是编译的版本决定使用hasHandler或者getHandler，我们先默认使用的是编译版本，因此我们单独分析hasHandler的处理函数,getHandler的分析类似。
```
var hasHandler = {
    // key in obj或者with作用域时，会触发has的钩子
    has: function has (target, key) {
        ···
    }
};
```
hasHandler函数定义了has的钩子，前面介绍过proxy有多达13个钩子，has是其中一个，它用来拦截propKey in proxy的操作，返回一个布尔值。除了拦截 in 操作符外，has钩子同样可以用来拦截with语句下的作用对象。例如
```
var obj = {
    a: 1
}
var nObj = new Proxy(obj, {
    has(target, key) {
        console.log(target) // { a: 1 }
        console.log(key) // a
        return true
    }
})

with(nObj) {
    a = 2
}
```
而在vue的render函数的内部，本质上也是调用了with语句,当调用with语句时，该作用域下变量的访问都会触发has钩子，这也是模板渲染时会触发代理拦截的原因。

```
var vm = new Vue({
    el: '#app'     
})
console.log(vm.$options.render)

//输出, 模板渲染使用with语句
ƒ anonymous() {
    with(this){return _c('div',{attrs:{"id":"app"}},[_v(_s(message)+_s(_test))])}
}
```
再次思考：我们知道[with语句](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/with)是不推荐使用的,一个最主要的原因是性能问题，查找不是变量属性的变量，较慢的速度会影响性能一系列性能问题。

[官方](https://github.com/vuejs/vue/issues/4115)给出的解释是: 为了减少编译器代码大小和复杂度,并且也提供了通过vue-loader这类构建工具，不含with的版本。


##### 2.2.2 代理检测过程
接着上面的分析，在模板引擎render渲染时，由于with语句的存在，访问变量时会触发has钩子函数，该函数会进行数据的检测，比如模板上的变量是否是实例中所定义，是否包含_, $这类vue内部保留关键字为开头的变量。同时模板上的变量将允许出现javascript的保留变量对象，例如Math, Number, parseFloat等。
```
var hasHandler = {
    has: function has (target, key) {
        var has = key in target;
        // isAllowed用来判断模板上出现的变量是否合法。
        var isAllowed = allowedGlobals(key) ||
            (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data));
            // _和$开头的变量不允许出现在定义的数据中，因为他是vue内部保留属性的开头。
        // warnReservedPrefix警告不能以$ _开头的变量
        // warnNonPresent 警告模板出现的变量在vue实例中未定义
        if (!has && !isAllowed) {
            if (key in target.$data) { warnReservedPrefix(target, key); }
            else { warnNonPresent(target, key); }
        }
        return has || !isAllowed
    }
};

// 模板中允许出现的非vue实例定义的变量
var allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
);
```

### 2.3 initLifecycle
分析完initProxy方法后，接下来是initLifecycle的过程。简单概括，initLifecycle的目的是将当前实例添加到父实例的```$children```属性中，并设置自身的```$parent```属性指向父实例。这为后续子父组件之间的通信提供了桥梁。举一个具体的应用场景：
```
<div id="app">
    <component-a></component-a>
</div>
Vue.component('component-a', {
    template: '<div>a</div>'
})
var vm = new Vue({ el: '#app'})
console.log(vm) // 将实例对象输出
``` 
由于vue实例向上没有父实例，所以```vm.$parent```为undefined，vm的```$children```属性指向子组件componentA 的实例。

![](https://user-gold-cdn.xitu.io/2019/4/3/169e1cbf43f024e6?w=734&h=201&f=png&s=23678)

子组件componentA的 ```$parent```属性指向它的父级vm实例，它的```$children```属性指向为空

![](https://user-gold-cdn.xitu.io/2019/4/3/169e1cd342cb543b?w=780&h=200&f=png&s=22827)


源码解析如下: 
```
function initLifecycle (vm) {
    var options = vm.$options;
    // 子组件注册时，会把父组件的实例挂载到自身选项的parent上
    var parent = options.parent;
    // 如果是子组件，并且该组件不是抽象组件时，将该组件的实例添加到父组件的$parent属性上，如果父组件是抽象组件，则一直往上层寻找，直到该父级组件不是抽象组件，并将，将该组件的实例添加到父组件的$parent属性
    if (parent && !options.abstract) {
        while (parent.$options.abstract && parent.$parent) {
        parent = parent.$parent;
        }
        parent.$children.push(vm);
    }
    // 将自身的$parent属性指向父实例。
    vm.$parent = parent;
    vm.$root = parent ? parent.$root : vm;

    vm.$children = [];
    vm.$refs = {};

    vm._watcher = null;
    vm._inactive = null;
    vm._directInactive = false;
    // 该实例是否挂载
    vm._isMounted = false;
    // 该实例是否被销毁
    vm._isDestroyed = false;
    // 该实例是否正在被销毁
    vm._isBeingDestroyed = false;
}

```
最后简单讲讲抽象组件，在vue中有很多内置的抽象组件，例如```<keep-alive></keep-alive>,<slot><slot>```等，这些抽象组件并不会出现在子父级的路径上，并且它们也不会参与DOM的渲染。

</br>
</br>

- [深入剖析Vue源码 - 选项合并(上)](https://juejin.im/post/5c8f40af6fb9a070f90aaf8f)
- [深入剖析Vue源码 - 选项合并(下)](https://juejin.im/post/5c91e960f265da60f30d44ca)
