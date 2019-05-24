> 继上一节内容，我们将```Vue```复杂的挂载流程通过图解流程，代码分析的方式简单梳理了一遍，其中也讲到了模板编译的大致流程，然而在挂载的核心处，我们并没有分析模板编译后函数如何渲染为可视化的```DOM```节点。这一节，我们将重新回到```Vue```实例挂载的最后一个环节：渲染```DOM```节点。在渲染真实DOM的过程中，```Vue```引进了虚拟```DOM```的概念，虚拟```DOM```作为```JS```对象和真实```DOM```中间的一个缓冲存，极大的优化了```JS```频繁操作```DOM```的性能问题，接下来我们将慢慢展开分析。

### 4.1 Virtual DOM

##### 4.1.1 浏览器的渲染流程
当浏览器接收到一个```Html```文件时，JS引擎和浏览器的渲染引擎便开始工作了。从渲染引擎的角度，它首先会将```html```文件解析成一个```DOM```树，与此同时，浏览器将识别并加载```CSS```样式，并和```DOM```树一起合并为一个渲染树。有了渲染树后，渲染引擎将计算所有元素的位置信息，最后通过绘制，在屏幕上打印最终的内容。而```JS```引擎的作用是通过```DOM```相关的```API```去操作```DOM```对象，而当我们操作```DOM```时，很容易触发到渲染引擎的回流或者重绘。
- 回流： 当我们对```DOM```的修改引发了元素尺寸的变化时，浏览器需要重新计算元素的大小和位置，最后将重新计算的结果绘制出来，这个过程称为回流。
- 重绘： 当我们对```DOM```的修改只单纯改变元素的颜色时，浏览器此时并不需要重新计算元素的大小和位置，而只要重新绘制新样式。这个过程称为重绘。

**很显然回流比重绘更加耗费性能**

通过了解浏览器基本的渲染机制，我们很容易联想到当不断的通过```JS```修改```DOM```时，不经意间会触发到渲染引擎的回流或者重绘，而这个性能开销是非常巨大的。因此为了降低开销，我们可以做的是尽可能减少```DOM```操作。

##### 4.1.2 缓冲层-虚拟DOM
虚拟```DOM```是优化频繁操作```DOM```引发性能问题的产物。虚拟```DOM```(下面称为```Virtual DOM```)是将页面的状态抽象为```JS```对象的形式，本质上是```JS```和真实```DOM```的中间层，当我们想用```JS```脚本大批量进行```DOM```操作时，会优先作用于```Virtual DOM```这个```JS```对象，最后通过对比将要改动的部分通知并更新到真实的```DOM```。尽管最终还是操作真实的```DOM```，但```Virtual DOM```可以将多个改动合并成一个批量的操作，从而减少 ```dom``` 重排的次数，进而缩短了生成渲染树和绘制所花的时间。

我们看一个真实的```DOM```包含了什么：

![](https://user-gold-cdn.xitu.io/2019/5/16/16abfb7f49d8afec?w=1253&h=403&f=png&s=87622)
浏览器将一个真实```DOM```设计得很复杂，不仅包含了自身的属性描述，大小位置等定义，也囊括了```DOM```拥有的浏览器事件等。正因为如此复杂的结构，我们频繁去操作```DOM```或多或少会带来浏览器性能问题。而作为数据和真实```DOM```之间的一层缓冲，```Virtual DOM``` 只是用来映射到真实```DOM```的渲染，因此不需要包含操作 ```DOM``` 的方法，只要在对象中重点关注几个属性即可。
```
// 真实DOM
<div id="real"><span>dom</span></div>

// 真实DOM对应的JS对象
{
    tag: 'div',
    data: {
        id: 'real'
    },
    children: [{
        tag: 'span',
        children: 'dom'
    }]
}
```

### 4.2 Vnode
Vue源码在渲染机制的优化上，同样引进了```virtual dom```的概念，它是用```Vnode```这个构造函数去描述一个```DOM```节点。

##### 4.2.1 Vnode构造函数
```
var VNode = function VNode (tag,data,children,text,elm,context,componentOptions,asyncFactory) {
    this.tag = tag; // 标签
    this.data = data;  // 数据
    this.children = children; // 子节点
    this.text = text;
    ···
    ···
  };
```
```Vnode```定义的属性也差不多有20几个，这里列举大部分属性，只重点关注几个关键属性：标签名，数据，子节点。其他的属性都是用来扩展Vue的灵活性。

除此之外，源码中还定义了Vnode的其他方法

##### 4.2.2 创建Vnode注释节点 
```
// 创建注释vnode节点
var createEmptyVNode = function (text) {
    if ( text === void 0 ) text = '';

    var node = new VNode();
    node.text = text;
    node.isComment = true; // 标记注释节点
    return node
};
```

##### 4.2.3 创建Vnode文本节点
```
// 创建文本vnode节点
function createTextVNode (val) {
    return new VNode(undefined, undefined, undefined, String(val))
}
```
##### 4.2.4 克隆vnode
vnode的克隆只是一层浅拷贝，不会对子节点进行深度克隆。
```
function cloneVNode (vnode) {
    var cloned = new VNode(
      vnode.tag,
      vnode.data,
      vnode.children && vnode.children.slice(),
      vnode.text,
      vnode.elm,
      vnode.context,
      vnode.componentOptions,
      vnode.asyncFactory
    );
    ···
    return cloned
  }
```

### 4.3 Vnode的创建
先简单回顾一下挂载的流程，挂载的过程调用的是```Vue```实例上```$mount```方法，而```$mount```的核心是```mountComponent```方法。在这之前，如果我们传递的是```template```模板，会经过一系列的模板编译过程，并根据不同平台生成对应代码，浏览器对应的是```render```函数;如果传递的是```render```函数，则忽略模板编译过程。有了```render```函数后，调用```vm._render()```方法会将```render```函数转化为```Virtual DOM```，最终利用```vm._update()```将```Virtual DOM```渲染为真实的```DOM```。

```
Vue.prototype.$mount = function(el, hydrating) {
    ···
    return mountComponent(this, el)
}
function mountComponent() {
    ···
    updateComponent = function () {
        vm._update(vm._render(), hydrating);
    };
}

```
```vm._render()```方法会**将render函数转化为Virtual DOM**,我们看源码中如何定义的。
```
// 引入Vue时，执行renderMixin方法，该方法定义了Vue原型上的几个方法，其中一个便是 _render函数
renderMixin();//
function renderMixin() {
    Vue.prototype._render = function() {
        var ref = vm.$options;
        var render = ref.render;
        ···
        try {
            vnode = render.call(vm._renderProxy, vm.$createElement);
        } catch (e) {
            ···
        }
        ···
        return vnode
    }
}
```
抛开其他代码，_render函数的核心是```render.call(vm._renderProxy, vm.$createElement)```部分，```vm.$createElement```方法会作为render函数的参数传入。**这个参数也是在手写```render```函数时使用的```createElement```参数的由来**
```
new Vue({
    el: '#app',
    render: function(createElement) {
        return createElement('div', {}, this.message)
    },
    data() {
        return {
            message: 'dom'
        }
    }
})
```
```vm.$createElement``` 是```Vue```中```initRender```所定义的方法,其中 ```vm._c``` 是```template```内部编译成```render```函数时调用的方法，```vm.$createElement```是手写```render```函数时调用的方法。两者的唯一区别是：内部生成的```render```方法可以保证子节点都是```Vnode```(下面有特殊的场景)，而手写的```render```需要一些检验和转换。

```
function initRender(vm) {
    vm._c = function(a, b, c, d) { return createElement(vm, a, b, c, d, false); }
    vm.$createElement = function (a, b, c, d) { return createElement(vm, a, b, c, d, true); };
}
```

```createElement``` 方法实际上是对 ```_createElement``` 方法的封装，在调用```_createElement```创建```Vnode```之前，会对传入的参数进行处理。例如当没有```data```数据时，参数会往前填充。
```
function createElement (
    context, // vm 实例
    tag, // 标签
    data, // 节点相关数据，属性
    children, // 子节点
    normalizationType,
    alwaysNormalize // 区分内部编译生成的render还是手写render
  ) {
    // 对传入参数做处理，可以没有data，如果没有data，则将第三个参数作为第四个参数使用，往上类推。
    if (Array.isArray(data) || isPrimitive(data)) {
      normalizationType = children;
      children = data;
      data = undefined;
    }
    // 根据是alwaysNormalize 区分是内部编译使用的，还是用户手写render使用的
    if (isTrue(alwaysNormalize)) {
      normalizationType = ALWAYS_NORMALIZE;
    }
    return _createElement(context, tag, data, children, normalizationType) // 真正生成Vnode的方法
  }
```

##### 4.3.1 数据规范检测
```Vue```既然暴露给用户用```render```函数去写渲染模板，就需要考虑用户操作带来的不确定性，因此在生成```Vnode```的过程中，```_createElement```会先进行数据规范的检测，将不合法的数据类型错误提前暴露给用户。接下来将列举几个容易犯错误的实际场景，方便理解源码中如何处理这类错误的。

- 1. 用响应式对象做节点属性
```
new Vue({
    el: '#app',
    render: function (createElement, context) {
       return createElement('div', this.observeData, this.show)
    },
    data() {
        return {
            show: 'dom',
            observeData: {
                attr: {
                    id: 'test'
                }
            }
        }
    }
})
```
- 2. 特殊属性key为非字符串，数字类型
```
new Vue({
    el: '#app',
    render: function(createElement) {
        return createElement('div', { key: this.lists }, this.lists.map(l => {
           return createElement('span', l.name)
        }))
    },
    data() {
        return {
            lists: [{
              name: '111'
            },
            {
              name: '222'
            }
          ],
        }
    }
})
```
这些规范都会在创建```Vnode```节点之前发现并报错，源代码如下：
```
function _createElement (context,tag,data,children,normalizationType) {
    // 数据对象不能是定义在Vue data属性中的响应式数据。
    if (isDef(data) && isDef((data).__ob__)) {
      warn(
        "Avoid using observed data object as vnode data: " + (JSON.stringify(data)) + "\n" +
        'Always create fresh vnode data objects in each render!',
        context
      );
      return createEmptyVNode() // 返回注释节点
    }
    // 针对动态组件 :is 的特殊处理，组件相关知识放到特定章节分析。
    if (isDef(data) && isDef(data.is)) {
      tag = data.is;
    }
    if (!tag) {
      // 防止动态组件 :is 属性设置为false时，需要做特殊处理
      return createEmptyVNode()
    }
    // key值只能为string，number这些原始数据类型
    if (isDef(data) && isDef(data.key) && !isPrimitive(data.key)
    ) {
      {
        warn(
          'Avoid using non-primitive value as key, ' +
          'use string/number value instead.',
          context
        );
      }
    }
    ···
    // 省略后续操作
  }
```

##### 4.3.2 子节点children规范化
```Virtual DOM```需要保证每一个子节点都是```Vnode```类型,这里分两种场景。
- 1.```render```函数编译，理论上通过```render```函数编译生成的都是```Vnode```类型，但是有一个例外，函数式组件返回的是一个数组(关于组件，以及函数式组件内容，我们放到专门讲组件的时候专题分析),这个时候```Vue```的处理是将整个```children```拍平。
- 2.用户定```render```函数，这个时候也分为两种情况，一个是```chidren```为文本节点，这时候通过前面介绍的```createTextVNode``` 创建一个文本节点的 ```VNode```; 另一种相对复杂，当```children```中有v-for的时候会出现嵌套数组，这时候的处理逻辑是，遍历```children```，对每个节点进行判断，如果依旧是数组，则继续递归调用，直到类型为基础类型时，调用```createTextVnode```方法转化为```Vnode```。这样经过递归，```children```变成了一个类型为```Vnode```的数组。
```
function _createElement() {
    ···
    if (normalizationType === ALWAYS_NORMALIZE) {
      // 用户定义render函数
      children = normalizeChildren(children);
    } else if (normalizationType === SIMPLE_NORMALIZE) {
      // render 函数是编译生成的
      children = simpleNormalizeChildren(children);
    }
}

// 处理编译生成的render 函数
function simpleNormalizeChildren (children) {
    for (var i = 0; i < children.length; i++) {
        // 子节点为数组时，进行开平操作，压成一维数组。
        if (Array.isArray(children[i])) {
        return Array.prototype.concat.apply([], children)
        }
    }
    return children
}

// 处理用户定义的render函数
function normalizeChildren (children) {
    // 递归调用，直到子节点是基础类型，则调用创建文本节点Vnode
    return isPrimitive(children)
      ? [createTextVNode(children)]
      : Array.isArray(children)
        ? normalizeArrayChildren(children)
        : undefined
  }

// 判断是否基础类型
function isPrimitive (value) {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'symbol' ||
      typeof value === 'boolean'
    )
  }
```

=== 进行数据检测和组件规范化后，接下来通过```new VNode```便可以生成一棵```VNode``树。===具体细节由于篇幅原因，不展开分析。


### 4.4 虚拟Vnode映射成真实DOM - update
回到 ```updateComponent```的最后一个过程,虚拟的```DOM```树```virtual dom```生成后，调用```Vue```原型上```_update```方法，将虚拟```DOM```映射成为真实的```DOM```。
```
updateComponent = function () {
    // render生成虚拟DOM，update渲染真实DOM
    vm._update(vm._render(), hydrating);
};
```
从源码上可以知道，```update```主要有两个调用时机，一个是初次数据渲染时，另一个是数据更新时触发真实```DOM```更新。这一节只分析初次渲染的操作，数据更新放到响应式系统中展开。
```
function lifecycleMixin() {
    Vue.prototype._update = function (vnode, hydrating) {
        var vm = this;
        var prevEl = vm.$el;
        var prevVnode = vm._vnode; // prevVnode为旧vnode节点
        // 通过是否有旧节点判断是初次渲染还是数据更新
        if (!prevVnode) {
            // 初次渲染
            vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false)
        } else {
            // 数据更新
            vm.$el = vm.__patch__(prevVnode, vnode);
        }
}
```
```_update```的核心是```__patch__```方法，而```__patch__```来源于:
```  
// 浏览器端才有DOM，服务端没有dom，所以patch为一个空函数
  Vue.prototype.__patch__ = inBrowser ? patch : noop;
```
```patch```方法又是```createPatchFunction```方法的返回值，```createPatchFunction```内部定义了一系列辅助的方法，但其核心是通过调用```createEle```方法，```createEle```会调用一系列封装好的原生```DOM```的```API```进行```dom```操作，创建节点，插入子节点，递归创建一个完整的```DOM```树并插入到```Body```中。这部分逻辑分支较为复杂，在源码上打```debugger```并根据实际场景跑不同的分支有助于理解这部分的逻辑。内容较多就不一一展开。

### 总结
这一节分析了```mountComponent```的两个核心方法，```render```和```update```,他们分别完成对```render```函数转化为```Virtual DOM```和将```Virtual DOM```映射为真实```DOM``` 的过程。整个渲染过程逻辑相对也是比较清晰的。

</br>

- [深入剖析Vue源码 - 选项合并(上)](https://juejin.im/post/5c8f40af6fb9a070f90aaf8f)
- [深入剖析Vue源码 - 选项合并(下)](https://juejin.im/post/5c91e960f265da60f30d44ca)
- [深入剖析Vue源码 - 数据代理，关联子父组件](https://juejin.im/post/5ca44c6151882543fb5ac95f)
- [深入剖析Vue源码 - 实例挂载,编译流程](https://juejin.im/post/5ccafd4d51882540d472a90e)