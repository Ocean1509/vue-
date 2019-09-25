### 13.5 缓存渲染
我们通过上面的分析直到了```keep-alive```在初始渲染组件时缓存了组件的```vnode```以及对应的真实节点。当再次需要渲染到已经被渲染过的组件时，```keep-alive```的处理又有什么不同呢？
##### 13.5.1 流程图
> 图

和首次渲染的分析一致，再次渲染的过程我依然画了一个简单的流程图。

回到文章开头的例子，动态组件中```chooseTabs```数据的变化会引起派发依赖更新的过程(这个系列有三篇文章详细介绍了vue响应式系统的底层实现，感兴趣的同学可以借鉴)。总结来说，```chooseTabs```在初始化阶段会收集使用到这个数据的依赖，在数据发生变化时会触发依赖进行更新。其中父组件的```vm._update(vm._render(), hydrating);```会执行。```_render```会根据数据的变化对视图重新进行```vnode```的生成，而```_update```会进行前后```vnode```的对比，根据变化去响应真实节点的变化，这一部分内容可以回顾[深入剖析Vue源码 - 来，跟我一起实现diff算法!](https://juejin.im/post/5d3967a56fb9a07efc49cca1)。
```Vnode```对比是```patch```过程，这个过程是从子到父，当遇到```keep-alive```下的子组件改变时，相应的会执行子的```patchVnode```对新旧节点进行对比，对对比的结果改变真实的```dom```节点。

```
function patchVnode (oldVnode,vnode,insertedVnodeQueue,ownerArray,index,removeOnly) {
    ···
    // 新vnode  执行prepatch钩子
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
        i(oldVnode, vnode);
    }
    ···
}
```
忽略```patchVnode```的其他过程，关键的一步在于它会执行新组件的```prepatch```钩子，执行钩子时会拿到新旧组件的实例执行```updateChildComponent```函数。而```updateChildComponent```会对新组件的一系列过程进行更新，包括```props,listeners```等，最终会调用```vue```提供的全局```vm.$forceUpdate()```进行实例的重新喧嚷。

```
var componentVNodeHooks = {
    // 之前分析的init钩子 
    init: function() {},
    prepatch: function prepatch (oldVnode, vnode) {
        // 新组件实例
      var options = vnode.componentOptions;
      // 旧组件实例
      var child = vnode.componentInstance = oldVnode.componentInstance;
      updateChildComponent(
        child,
        options.propsData, // updated props
        options.listeners, // updated listeners
        vnode, // new parent vnode
        options.children // new children
      );
    },
}

function updateChildComponent() {
    ···
    // 迫使实例重新渲染。
    vm.$forceUpdate();
}
```

##### 13.5.2 使用缓存组件
```keep-alive```实例执行```vm.$forceUpdate()```时会对实例进行重新渲染，此时又会执行组件的```render```过程。这一次根据组件名可以在```cache```上找到保留的```vnode```对象，所以直接取出缓存组件实例赋值给```vnode```的```componentInstance```属性。
```
if (cache[key]) {
    // 直接取出缓存组件
    vnode.componentInstance = cache[key].componentInstance;
    // keys命中的组件名移到数组末端
    remove(keys, key);
    keys.push(key);
}
```

```keep-alive```组件的```render```函数执行完，又到了```patch```过程，我们可以仔细对比这个过程和第一次执行的区别。
- 1. 此时组件的```vnode.data.keepAlive = true```，所以```isReactivated```变量为```true```,所以在子组件执行```init```钩子时，不会在对组件进行实例化以及```$mount```的过程。
- 2. 
$fourceupdate



如果数据最近被访问过，那么将来被访问的几率也更高