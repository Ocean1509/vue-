
1. 解析AST阶段,父占位符节点遇到节点内置元素会正常解析

2. 子组件vnode创建阶段，子占位符节点内的插槽内容会在componentOptions.child属性中

3. 创建真实节点阶段,会执行实例化子组件的过程，此时子组件实例的$options属性会有_renderChildren属性记录插槽内容。



4. 在子组件初始化阶段，会有initRender的过程，
```vm.$slots = resolveSlots(options._renderChildren, renderContext);```会拿到之前父占位符节点记录的```_renderChildren```插槽内容,保留在$slots属性中，slot如果没有默认名称，则为default
> 4218 resolveSlots


5. 子组件的init过程同样会经历template模板到真实dom阶段。
在解析AST阶段，slot标签和其他普通标签的处理方式相同，没有什么特别之处，依旧以普通标签去解析。不同之处在于AST生成render函数阶段，针对slot标签的处理，会通过_t函数进行包括，其中要处理slotName的值。


6.有了前面两步的处理，render函数执行阶段，遇到_t 函数可以通过$scopedSlots拿到组件父元素上的插槽内容。最终Vnode树最终将父元素的插槽替换掉子组件的slot组件。


父级模板里的所有内容都是在父级作用域中编译的；子模板里的所有内容都是在子作用域中编译的。





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