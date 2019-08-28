> Vue组件的另一个重要概念是插槽，它允许你以一种不同于严格的父子关系的方式组合组件。插槽为你提供了一个将内容放置到新位置或使组件更通用的出口。这一节将深入插槽的实现细节，领略普通插槽和2.6新修改的作用域插槽原理。文章的思路想围绕着官网对插槽的介绍思路走，可以先熟悉[插槽介绍](https://cn.vuejs.org/v2/guide/components-slots.html)。

### 10.1 普通插槽
插槽将```<slot></slot>```作为子组件承载分发的载体，简单的用法如下
##### 10.1.1 基础用法
```
var child = {
  template: `<div class="child"><slot></slot></div>`
}
var vm = new Vue({
  el: '#app',
  components: {
    child
  },
  template: `<div id="app"><child>test</child></div>`
})
// 最终渲染结果
<div class="child">test</div>
```
##### 10.1.2 组件挂载原理
首先回顾一下前面文章对组件相关渲染流程的介绍，简单总结一下几点：
1. 从根实例入手进行实例的挂载，如果有手写的```render```函数，则直接进入```$mount```流程。
2. 只有```template```模板则需要对模板进行解析，这里分为两个阶段，一个是将模板解析为```AST```树，另一个是根据不同平台生成执行代码，例如```render```函数。
3. ```$mount```流程分为两步，第一步是将```render```函数生成```Vnode```树，子组件会以```vue-componet-```为```tag```标记，另一步是把```Vnode```渲染成真正的DOM节点。
4. 创建真实节点过程中，如果遇到子的占位符组件会进行子组件的实例化过程，这个过程又将回到流程的第一步。
接下来我们对```slot```的分析将围绕这四个具体的流程展开，对流程详细的分析，可以参考[深入剖析Vue源码 - 组件基础](https://juejin.im/post/5cee4ba4518825092c715438)小节。

##### 10.1.3 父组件处理
回到组件实例流程中，父的占位符组件在模板的解析和```render```函数的生成阶段没有特殊的差异，这里就跳过不讲。```render```函数在生成```Vnode```阶段，对于子组件```Vnode```的处理在```createComponent```函数中，这个函数前面也分析了好多次，这里也不做赘述，我们看看最终生成```Vnode```的代码：
```
// 创建子组件过程
  function createComponent (
    Ctor, // 子类构造器
    data,
    context, // vm实例
    children, // 子节点
    tag // 子组件占位符
  ){
    ···
    var vnode = new VNode(
      ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
      data, undefined, undefined, undefined, context,
      { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
      asyncFactory
    );
  }
// Vnode构造器
var VNode = function VNode (tag,data,children,text,elm,context,componentOptions,asyncFactory) {
  ···
  this.componentOptions = componentOptions; // 子组件的选项相关
}
```
从代码中可以发现，父占位符节点下需要分发到子组件的内容，会**以```children```属性的形式存储在子```Vnode```的```componentOptions```属性中，这是第一步的重点**。

##### 10.1.4 子组件流程
根据大方向流程，父```Vnode```在渲染真实节点过程遇到子```Vnode```会实例化子组件并进行一系列子组件的渲染流程。子组件初始化会先调用```init```方法，```initInternalComponent```方法会对拿到父组件的配置信息，并将它赋值给子组件的选项配置。
```
Vue.prototype._init = function(options) {
  if (options && options._isComponent) {
    initInternalComponent(vm, options);
  }
  initRender(vm)
}
function initInternalComponent (vm, options) {
    var opts = vm.$options = Object.create(vm.constructor.options);
    var parentVnode = options._parentVnode;
    opts.parent = options.parent;
    opts._parentVnode = parentVnode;

    var vnodeComponentOptions = parentVnode.componentOptions;
    opts.propsData = vnodeComponentOptions.propsData;
    opts._parentListeners = vnodeComponentOptions.listeners;
    // 父组件需要分发的内容赋值给子选项配置的_renderChildren
    opts._renderChildren = vnodeComponentOptions.children;
    opts._componentTag = vnodeComponentOptions.tag;

    if (options.render) {
      opts.render = options.render;
      opts.staticRenderFns = options.staticRenderFns;
    }
  }
```
最终在**子组件实例的配置中拿到了父组件保存的分发内容，记录在```$options._renderChildren```中，这是第二步的重点**。

```_init```过程还有一个步骤需要说明，在子组件的```initRender```过程中,会**将配置的```_renderChildren```属性做规范化处理，并将他赋值给实例上的```$slot```属性，这是第三步的重点**。

```
function initRender(vm) {
  ···
  vm.$slots = resolveSlots(options._renderChildren, renderContext);// $slots拿到了子占位符节点的_renderchildren(即需要分发的内容)，保留作为子实例的属性
}

function resolveSlots (children,context) {
    // children是父组件需要分发到子组件的Vnode节点，如果不存在，则没有分发内容
    if (!children || !children.length) {
      return {}
    }
    var slots = {};
    for (var i = 0, l = children.length; i < l; i++) {
      var child = children[i];
      var data = child.data;
      // remove slot attribute if the node is resolved as a Vue slot node
      if (data && data.attrs && data.attrs.slot) {
        delete data.attrs.slot;
      }
      // named slots should only be respected if the vnode was rendered in the
      // same context.
      // 分支1为具名插槽的逻辑，放后分析
      if ((child.context === context || child.fnContext === context) &&
        data && data.slot != null
      ) {
        var name = data.slot;
        var slot = (slots[name] || (slots[name] = []));
        if (child.tag === 'template') {
          slot.push.apply(slot, child.children || []);
        } else {
          slot.push(child);
        }
      } else {
      // 核心逻辑是构造{ default: [children] }对象返回
        (slots.default || (slots.default = [])).push(child);
      }
    }
    return slots
  }
```
其中具名插槽的逻辑后面会说到，普通插槽会以数组的形式赋值给```default```属性，并以```$slot```属性的形式保存在子组件的实例中。

随后子组件也会走挂载的流程，同样会经历```template```模板到```render```函数，再到```Vnode```,最后渲染真实```DOM```的过程。解析```AST```阶段，```slot```标签和其他普通标签处理相同，**不同之处在于```AST```生成```render```函数阶段，对```slot```标签的处理，会使用```_t函数```进行包裹。这是关键步骤的第四步**

大致流程简单梳理如下
```
// ast 生成 render函数
var code = generate(ast, options);
// generate实现
function generate(ast, options) {
  var state = new CodegenState(options);
  var code = ast ? genElement(ast, state) : '_c("div")';
  return {
    render: ("with(this){return " + code + "}"),
    staticRenderFns: state.staticRenderFns
  }
}
// genElement实现
function genElement(el, state) {
  if (el.tag === 'slot') {
    return genSlot(el, state)
  }
}
// 核心genSlot原理
function genSlot (el, state) {
    // slotName记录着插槽的唯一标志名，默认为default
    var slotName = el.slotName || '"default"';
    // 如果子组件的插槽还有子元素，则会递归调执行子元素的创建过程
    var children = genChildren(el, state);
    // 通过_t函数包裹
    var res = "_t(" + slotName + (children ? ("," + children) : '');
    // 具名插槽的其他处理
    ···    
    return res + ')'
  }
```
最终子组件的```render```函数如下：
```"with(this){return _c('div',{staticClass:"child"},[_t("default")],2)}"```

**第五步到了子组件渲染为```Vnode```的过程。```render```函数执行阶段，```_t()```函数相应的执行，它真正的执行内容在```renderSlot```函数中，它会在Vnode树中进行分发内容的替换**，具体看看实现逻辑。
```
Vue.prototype._render = function() {
  var _parentVnode = ref._parentVnode;
  if (_parentVnode) {
    // slots的规范化处理并赋值给$scopedSlots属性。
    vm.$scopedSlots = normalizeScopedSlots(
      _parentVnode.data.scopedSlots,
      vm.$slots, // 记录父组件的插槽内容
      vm.$scopedSlots
    );
  }
}
```
````normalizeScopedSlots```的逻辑较长，但并不是本节的重点，这里跳过该段源码的分析。拿到```$scopedSlots```属性后会执行真正的```render```,其中```_t```的执行逻辑如下：
```
// 渲染slot组件内容
  function renderSlot (
    name,
    fallback, // slot插槽后备内容
    props, // 子传给父的值
    bindObject
  ) {
    // scopedSlotFn拿到父组件插槽的执行函数，默认slotname为default
    var scopedSlotFn = this.$scopedSlots[name];
    var nodes;
    if (scopedSlotFn) { // scoped slot
      props = props || {};
      if (bindObject) {
        if (!isObject(bindObject)) {
          warn(
            'slot v-bind without argument expects an Object',
            this
          );
        }
        props = extend(extend({}, bindObject), props);
      }
      // 执行时将子组件传递给父组件的值传入fn
      nodes = scopedSlotFn(props) || fallback;
    } else {
      // 如果父占位符组件没有插槽内容，this.$slots不会有值，此时vnode节点为后备内容节点。
      nodes = this.$slots[name] || fallback;
    }

    var target = props && props.slot;
    if (target) {
      return this.$createElement('template', { slot: target }, nodes)
    } else {
      return nodes
    }
  }
```
```renderSlot```执行过程会拿到父组件需要分发的内容，最终```Vnode```树将父元素的插槽替换掉子组件的```slot```组件。

**最后一步就是子组件真实节点的渲染了，这点没有什么特别点，和以往介绍的流程一致**。

至此，一个完整且简单的插槽流程分析完毕。接下来看看深层次的用法。

### 10.2 具有后备内容的插槽
有时为一个插槽设置具体的后备 (也就是默认的) 内容是很有用的，它只会在没有提供内容的时候被渲染。查看源码发现后备内容插槽的逻辑很好理解。
```
var child = {
  template: `<div class="child"><slot>后备内容</slot></div>`
}
var vm = new Vue({
  el: '#app',
  components: {
    child
  },
  template: `<div id="app"><child></child></div>`
})
// 最终渲染结果
<div class="child">后备内容</div>
```
父组件没有需要分发的内容，子组件会默认显示插槽里面的内容。源码中的不同体现在下面的几点。
1. 父组件渲染过程由于没有需要分发的子节点，所以不再需要拥有```componentOptions.children```属性来记录内容。
2. 子组件也拿不到```$slot```属性的内容.
3. 子组件的```render```函数最后在```_t```函数参数会携带第二个参数，该参数以数组的形式传入```slot```插槽的后备内容。例```with(this){return _c('div',{staticClass:"child"},[_t("default",[_v("test")])],2)}```
4. 渲染```slot```组件内容，执行```renderSlot```函数时，第二个参数```fallback```有值，且```this.$slots```没值，```vnode```会直接返回后备内容作为渲染对象。
```
    //fallback为后备内容
    // 如果父占位符组件没有插槽内容，this.$slots不会有值，此时vnode节点为后备内容节点。
    nodes = this.$slots[name] || fallback;
```
最终，在父组件没有提供内容时，```slot```的后备内容被渲染。


### 10.3 编译作用域的理解
父组件中插槽的内容是不能访问到子组件作用域的数据的，Vue官网也提供了一条规则
>  父级模板里的所有内容都是在父级作用域中编译的；子模板里的所有内容都是在子作用域中编译的。