
1. 解析AST阶段,父占位符节点遇到节点内置元素会正常解析

2. 子组件vnode创建阶段，子占位符节点内的插槽内容会在componentOptions.child属性中

3. 创建真实节点阶段,会执行实例化子组件的过程，此时子组件实例的$options属性会有_renderChildren属性记录插槽内容。



4. 在子组件初始化阶段，会有initRender的过程，
```vm.$slots = resolveSlots(options._renderChildren, renderContext);```会拿到之前父占位符节点记录的```_renderChildren```插槽内容,保留在$slots属性中，slot如果没有默认名称，则为default
> 4218 resolveSlots


5. 子组件的init过程同样会经历template模板到真实dom阶段。
在解析AST阶段，slot标签和其他普通标签的处理方式相同，没有什么特别之处，依旧以普通标签去解析。不同之处在于AST生成render函数阶段，针对slot标签的处理，会通过_t函数进行包裹，其中要处理slotName的值。


6. 有了前面两步的处理，render函数执行阶段，遇到_t 函数可以通过$scopedSlots拿到组件父元素上的插槽内容。最终Vnode树最终将父元素的插槽替换掉子组件的slot组件。 renderSlot

编译作用域：
父级模板里的所有内容都是在父级作用域中编译的；子模板里的所有内容都是在子作用域中编译的。


后备内容：


### 10. 3 具名插槽
如果我们需要多个插槽，并且父组件中每个模板对应子组件中每个插槽的位置，这时可以使用```<slot>```的```name```属性，用法也很简单：
```
var child = {
  template: `<div class="child"><slot name="header"></slot><slot name="footer"></slot></div>`,
}
var vm = new Vue({
  el: '#app',
  components: {
    child
  },
  template: `<div id="app"><child><template v-slot:header><span>头部</span></template><template v-slot:footer><span>底部</span></template></child></div>`,
})
```
渲染结果：
```
<div class="child"><span>头部</span><span>底部</span></div>
```
前面花了大量的篇幅介绍了基本插槽的用法，接下来针对具名插槽，我们看看源码实现中不同的地方。

##### 10.3.1 

？ createComponent
```
if (isTrue(Ctor.options.abstract)) {
  // abstract components do not keep anything
  // other than props & listeners & slot

  // work around flow
  var slot = data.slot;
  data = {};
  if (slot) {
    data.slot = slot;
  }
}
```

具名插槽的render函数
```
with(this){return _c('div',{attrs:{"id":"app"}},[_c('child',{scopedSlots:_u([{key:"header",fn:function(){return [_c('span',[_v("头部")])]},proxy:true},{key:"footer",fn:function(){return [_c('span',[_v("底部")])]},proxy:true}])})],1)}
```
最终以**data属性**的形式存储在scopedSlots属性中，它并不再以componentOptions.child的形式保留在父组件中





子组件在解析成AST树阶段，slot标签的name属性会解析成slotName属性，生成render函数的generate阶段遇到子元素tag为```slot```阶段依旧会执行```genSlot```过程。由于slotName的存在
渲染插槽时有scopedSlotFn，所以执行另外的分支。



作用域插槽的原理

和具名插槽类似，render函数阶段生成的fn值，会将子组件传递给父组件的变量名以参数的形式传递。

子组件实例化阶段,ast生成阶段，处理子组件传递给父组件的属性，genSlot, render函数最终生成
```_t("default",[_v(_s(user.lastName))],{"user":user})```

