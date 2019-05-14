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

createElement 方法实际上是对 _createElement 方法的封装，在调用_createElement创建Vnode之前，会对传入的参数进行处理。灵活的用法是：当没有data数据时，参数会往前填充。
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
Vue既然暴露给用户用render函数去写渲染模板，就需要考虑用户操作带来的不确定性，所以在生成Vnode的过程中，_createElement会先进行数据规范的检测，将不合法的数据类型提前暴露给用户。接下来将列举几个容易犯错误的实际场景，方便理解源码中如何处理这类错误的。

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
这些规范都会在创建Vnode节点之前发现并报错，源代码如下：
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
    // 后续操作
  }
```

##### 4.3.2 子节点children规范化
