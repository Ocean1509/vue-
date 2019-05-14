> 在[深入剖析Vue源码 - 实例挂载,编译流程](https://juejin.im/post/5ccafd4d51882540d472a90e)这一节中，我们将Vue复杂的挂载流程通过图解流程，代码分析的方式简单的梳理了一遍，其中讲到了模板编译的大致流程，在挂载的核心处，我们并没有对编译后函数的渲染过程深入分析。这一节，我们重新回到Vue实例挂载的最后一个流程，如何将编译后的render函数渲染到页面，成为用户所看到真正的DOM节点。

### 4.1 Virtual DOM

##### 4.1.1 浏览器的渲染流程
当浏览器接收到一个Html文件时，JS引擎和浏览器的渲染引擎便开始工作了。从渲染引擎的角度，它首先会将html文件解析成一个DOM树，与此同时，浏览器将识别并加载CSS样式，并和DOM树一起合并为一个渲染树。有了渲染树后，渲染引擎将计算所有元素的位置信息，最后通过绘制，在屏幕上打印最终的内容。JS引擎的作用是通过角度去操作DOM对象，而当我们操作DOM时，很容易触发到渲染引擎的回流或者重绘。
- 回流： 当我们对DOM的修改引发了元素尺寸的变化时，浏览器需要重新计算元素的大小和位置，最后将重新计算的结果绘制出来，这个过程称为回流
- 重绘： 当我们对DOM的修改单纯改变元素的颜色时，浏览器此时并不需要重新计算元素的大小和位置，而只要重新绘制新样式。这个过程称为重绘。很显然回流并重绘更加耗费性能。

有了浏览器渲染机制的知识，我们很容易连想到当通过JS不断的修改DOM时，不经意间会触发到渲染引擎的回流或者重绘，而这个性能开销是非常巨大的。为了降低开销，我们可以做的是尽可能减少DOM操作。

##### 4.1.2 缓冲层-虚拟DOM
虚拟DOM(下面称为Virtual DOM)是将页面的状态抽象为JS对象的形式，本质上是JS和真实DOM的中间层，当我们想用JS脚本大批量进行DOM操作时，会优先作用于Virtual DOM这个JS对象，最后通过对比将要改动的部分通知并更新到真实的DOM。尽管最终还是操作真实的DOM，但Virtual DOM可以将多个改动都合并成一个批量的操作，从而减少 dom 重排的次数，进而缩短了生成渲染树和绘制所花的时间。

我们看一个真实的DOM包含了什么：
>图
浏览器将一个真实DOM设计得很复杂，不仅包含了自身的属性描述，大小位置相关的属性定义，以及DOM拥有的浏览器事件等等，正因为如此复杂的结构，我们频繁去操作DOM或多或少会带来浏览器性能问题。而作为数据和真实DOM之间的一层缓冲，Virtual 只是用来映射到真实DOM的渲染，因此不需要包含操作 DOM 的方法，只要在对象中重点关注几个属性即可。
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
Vue源码在渲染机制的优化上，同样利用了virtual dom的概念，它是用Vnode去描述一个DOM节点。

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
Vnode定义的属性也差不多有20几个，这里列举的时候都省略了，这里只要重点关注几个关键属性：标签名，数据，子节点。其他的属性都是用来扩展Vue的灵活性。

除此之外，源码中还定义了Vnode的其他方法

##### 4.2.2 Vnode注释节点 
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

##### 4.2.3 Vnode注释节点
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

### 4.3 render函数生成Vnode
重新回顾一下挂载的流程，挂载的过程调用的是Vue实例上$mount方法，而$mount的核心是mountComponent方法。在这之前，如果传递的是template模板，会经过一系列的模板编译过程，并根据不同平台生成对应代码，浏览器对应的是render函数，如果传递是render函数，则忽略模板编译过程，此后通过vm._render()方法将render函数转化为Virtual DOM，最终利用vm._update()将Virtual DOM渲染为真实的DOM。

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
因此```vm._render()```是将render函数转化为Virtual DOM,我们看源码中如何定义的。
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
抛开其他代码，_render函数的核心是```render.call(vm._renderProxy, vm.$createElement)```部分，vm.$createElement方法作为render函数执行的参数。从源码中我们可以知道在手写render函数时，其中createElement的来源。
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
vm.$createElement 是引入Vue脚本时执行initRender所定义的方法,其中 vm._c 是template内部编译成render函数时调用的方法，vm.$createElement是手写render函数时调用的方法。后面分析可以知道，两者的唯一区别是：内部生成的render方法可以保证所有的子节点都是Vnode，而手写的render需要一些检验和转换。

```
function initRender(vm) {
    vm._c = function(a, b, c, d) { return createElement(vm, a, b, c, d, false); }
    vm.$createElement = function (a, b, c, d) { return createElement(vm, a, b, c, d, true); };
}
```