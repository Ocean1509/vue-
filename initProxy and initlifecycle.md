

### 2.1 Object.defineProperty和Proxy
在介绍这一章的源码分析之前，我们需要掌握一下贯穿整个vue数据代理,监控的技术核心：Object.defineProperty 和 Proxy
##### 2.1.1 Object.defineProperty
> 官方定义：Object.defineProperty()方法会直接在一个对象上定义一个新属性，或者修改一个对象的现有属性， 并返回这个对象。
基本用法： Object.defineProperty(obj, prop, descriptor)

我们可以用来精确添加或修改对象的属性，只需要在descriptor中将属性特性描述清楚，descriptor的属性描述符有两种形式，一种是数据描述符，另一种是存取描述符

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

==注意: 数据描述符的value，writable 和 存取描述符的get, set属性不能同时存在，否则会抛出异常。==
因此我们可以利用存取描述符中的getter/setter来进行数据监听,我们可以在get,set分别做不同的操作，只是vue双向数据绑定原理的雏形，我们会在响应式系统的源码分析时具体阐述。
```
var o = {}
var value
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
然而Object.defineProperty的get和set方法只能观测到对象属性的变化，对于数组类型的变化并不能监听到，这是用Object.defineProperty进行数据监控的缺陷，而es6的proxy可以完美的解决这一类问题。

##### 2.1.2 Proxy
Proxy 是es6的语法，和Object.defineProperty一样，也是用于修改某些操作的默认行为，但是和Object.defineProperty不同的是，==Proxy对象针对目标对象，会创建一个新的实例对象，并将目标对象代理到新的实例对象上，== 本质的区别就是多了一层代理，外界对该对象的访问，都必须先通过这层拦截，因此提供了一种机制，可以对外界的访问进行过滤和改写。外界通过操作新的实例对象从而操作真正的目标对象。针对getter和setter的基本用法如下
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
nobj.a = 1111
// 设置值
// 获取值
// 1111
console.log(nobj.a)
```
Proxy 支持的拦截操作有多达13种之多，具体可以参照[!Proxy](http://es6.ruanyifeng.com/#docs/proxy),在上面提到，Object.defineProperty的get和set方法并不能监测到数组的变化，而Proxy是否能做到呢？
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

### 2.3 initProxy
初始化合并选项之后，vue接下来的操作是将为vm实例设置一层代理，代理的目的是为vue在模板渲染时进行一层数据筛选。如果浏览器不支持Proxy，这层代理检验数据则会失效。
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
```
看到这里时，心中会有几点疑惑。
- 什么时候会触发这层代理进行数据检测？
- getHandler 和 hasHandler的场景分别是什么？

如何解决这个疑惑，我们接着往下看：

##### 2.3.1 模板渲染
我们发现，在vue的模板引擎的渲染

// 如何判断浏览器支持原生proxy

```
// 是否支持Symbol 和 Reflect
var hasSymbol =
    typeof Symbol !== 'undefined' && isNative(Symbol) &&
    typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys);
function isNative (Ctor) {
    // Proxy本身是构造函数，且Proxy.toString === 'function Proxy() { [native code] }'
    return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}
``` 