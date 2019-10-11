> 在上一节[]()中，我们详细的阐述了```keep-alive```组件内部的选项定义以及初始渲染的流程。初始渲染流程最关键的一步是对渲染的组件```Vnode```进行缓存，其中也包括了组件的真实节点。有了第一次的缓存，当再次渲染时，```keep-alive```又拥有哪些魔法呢？接下来我们将彻底揭开这一层面纱。

### 13.5 准备工作
在上一节对```keep-alive```组件的分析，是从我画的一个流程图开始的。如果不想回过头看上一节的内容，可以参考以下的简单总结。
- 1. ```keep-alive```是源码内部定义的组件选项配置，它会先注册为全局组件供开发者直接使用，其中```render```函数定义了它的渲染过程
- 2. 和普通组件一致，当父在创建真实节点的过程中，遇到```keep-alive```的组件会进行组件的初始化和实例化。
- 3. 实例化会执行挂载```$mount```的过程，这一步会执行```keep-alive```选项中的```render```函数。
- 4. ```render```函数在初始渲染时，会将渲染的子```Vnode```进行缓存。同时对应的子真实节点也相应被缓存起来。

那么，当再次需要渲染到已经被渲染过的组件时，```keep-alive```的处理又有什么不同呢？

##### 13.5.1 基础使用
为了文章的完整性，我依旧把基础的使用展示出来，其中加入了生命周期的使用，方便后续对```keep-alive```生命周期的分析。
```
<div id="app">
    <button @click="changeTabs('child1')">child1</button>
    <button @click="changeTabs('child2')">child2</button>
    <keep-alive>
        <component :is="chooseTabs">
        </component>
    </keep-alive>
</div>
var child1 = {
    template: '<div><button @click="add">add</button><p>{{num}}</p></div>',
    data() {
        return {
            num: 1
        }
    },
    methods: {
        add() {
            this.num++
        }
    },
    mounted() {
        console.log('child1 mounted')
    },
    activated() {
        console.log('child1 activated')
    },
    deactivated() {
        console.log('child1 deactivated')
    }
}
var child2 = {
    template: '<div>child2</div>',
    mounted() {
        console.log('child2 mounted')
    },
    activated() {
        console.log('child2 activated')
    },
    deactivated() {
        console.log('child2 deactivated')
    }
}

var vm = new Vue({
    el: '#app',
    components: {
        child1,
        child2,
    },
    data() {
        return {
            chooseTabs: 'child1',
        }
    },
    methods: {
        changeTabs(tab) {
            this.chooseTabs = tab;
        }
    }
})
```
##### 13.5.2 流程图
和首次渲染的分析一致，再次渲染的过程我依旧画了一个简单的流程图。
> 图

### 13.6 流程分析
##### 13.6.1 重新渲染组件
再次渲染的流程从数据改变说起，在这个例子中，动态组件中```chooseTabs```数据的变化会引起依赖派发依赖更新的过程(这个系列有三篇文章详细介绍了vue响应式系统的底层实现，感兴趣的同学可以借鉴)。简单来说，```chooseTabs```这个数据在初始化阶段会收集使用到该数据的相关依赖。当数据发生改变时，收集过的依赖会进行派发更新操作。

其中，父组件中负责挂载过程的依赖会被执行，即执行父组件的```vm._update(vm._render(), hydrating);```。```_render```和```_update```分别代表两个过程，其中```_render```函数会根据数据的变化为组件生成新的```Vnode```节点，而```_update```最终会为新的```Vnode```生成真实的节点。而在生成真实节点的过程中，会利用```vitrual dom```的```diff```算法对前后```vnode```节点进行对比，使之尽可能少的更改真实节点，这一部分内容可以回顾[深入剖析Vue源码 - 来，跟我一起实现diff算法!](https://juejin.im/post/5d3967a56fb9a07efc49cca1)，里面详细阐述了利用```diff```算法进行节点差异对比的思路。

```patch```是新旧```Vnode```对比的过程，而```patchVnode```是其中核心的步骤，我们忽略```patchVnode```其他的流程，关注到其中对子组件执行```prepatch```钩子的过程中。

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
执行```prepatch```钩子时会拿到新旧组件的实例并执行```updateChildComponent```函数。而```updateChildComponent```会对针对新的组件实例对旧实例进行状态的更新，包括```props,listeners```等，最终会调用```vue```提供的全局```vm.$forceUpdate()```进行实例的重新渲染。

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
    // 更新旧的状态，不分析这个过程
    ···
    // 迫使实例重新渲染。
    vm.$forceUpdate();
}
```

先看看```$forceUpdate```做了什么操作。```$forceUpdate```是源码对外暴露的一个api，他们迫使```Vue```实例重新渲染，本质上本质上是调用并执行实例所收集的依赖，在例子中```watcher```对应的是```keep-alive```的```vm._update(vm._render(), hydrating);```过程。
```
Vue.prototype.$forceUpdate = function () {
      var vm = this;
      if (vm._watcher) {
        vm._watcher.update();
      }
    };
```

##### 13.6.2 重用缓存组件
由于```vm.$forceUpdate()```会强迫```keep-alive```组件进行重新渲染，因此```keep-alive```组件会再一次执行```render```过程。这一次由于第一次对```vnode```的缓存，```keep-alive```在实例的```cache```对象中找到了缓存的组件。

```
// keepalive组件选项
var keepAlive = {
    name: 'keep-alive',
    abstract: true,
    render: function render () {
      // 拿到keep-alive下插槽的值
      var slot = this.$slots.default;
      // 第一个vnode节点
      var vnode = getFirstComponentChild(slot);
      // 拿到第一个组件实例
      var componentOptions = vnode && vnode.componentOptions;
      // keep-alive的第一个子组件实例存在
      if (componentOptions) {
        // check pattern
        //拿到第一个vnode节点的name
        var name = getComponentName(componentOptions);
        var ref = this;
        var include = ref.include;
        var exclude = ref.exclude;
        // 通过判断子组件是否满足缓存匹配
        if (
          // not included
          (include && (!name || !matches(include, name))) ||
          // excluded
          (exclude && name && matches(exclude, name))
        ) {
          return vnode
        }

        var ref$1 = this;
        var cache = ref$1.cache;
        var keys = ref$1.keys;
        var key = vnode.key == null ? componentOptions.Ctor.cid + (componentOptions.tag ? ("::" + (componentOptions.tag)) : '')
          : vnode.key;
        if (cache[key]) {
          // 直接取出缓存组件
          vnode.componentInstance = cache[key].componentInstance;
          // keys命中的组件名移到数组末端
          remove(keys, key);
          keys.push(key);
        } else {
        // 初次渲染时，将vnode缓存
          cache[key] = vnode;
          keys.push(key);
          // prune oldest entry
          if (this.max && keys.length > parseInt(this.max)) {
            pruneCacheEntry(cache, keys[0], keys, this._vnode);
          }
        }

        vnode.data.keepAlive = true;
      }
      return vnode || (slot && slot[0])
    }
}

```
```render```函数前面逻辑可以参考前一篇文章，由于```cache```对象中存储了再次使用的```vnode```对象，所以直接通过```cache[key]```取出缓存的组件实例并赋值给```vnode```的```componentInstance```属性。可能在读到这里的时候，会对源码中```keys```这个数组的作用，以及```pruneCacheEntry```的功能有疑惑，这里我们放到文章末尾讲缓存优化策略时解答。


##### 13.6.3 真实节点的替换

执行了```keep-alive```组件的```_render```过程，接下来是```_update```产生真实的节点，同样的，```keep-alive```下有```child1```子组件，所以```_update```过程会调用```createComponent```递归创建子组件```vnode```,这个过程在初次渲染时也有分析过，我们可以对比一下，再次渲染时流程有哪些不同。

```
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    // vnode为缓存的vnode
      var i = vnode.data;
      if (isDef(i)) {
        // 此时isReactivated为true
        var isReactivated = isDef(vnode.componentInstance) && i.keepAlive;
        if (isDef(i = i.hook) && isDef(i = i.init)) {
          i(vnode, false /* hydrating */);
        }
        if (isDef(vnode.componentInstance)) {
          // 其中一个作用是保留真实dom到vnode中
          initComponent(vnode, insertedVnodeQueue);
          insert(parentElm, vnode.elm, refElm);
          if (isTrue(isReactivated)) {
            reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
          }
          return true
        }
      }
    }
```
此时的```vnode```是缓存取出的子组件```vnode```，并且由于在第一次渲染时对组件进行了标记```vnode.data.keepAlive = true;```,所以```isReactivated```值为```true```,```i.init```依旧会执行子组件的初始化过程。但是这个过程由于有缓存，所以执行过程也不完全相同。
```
var componentVNodeHooks = {
    init: function init (vnode, hydrating) {
      if (
        vnode.componentInstance &&
        !vnode.componentInstance._isDestroyed &&
        vnode.data.keepAlive
      ) {
        // 当有keepAlive标志时，执行prepatch钩子
        var mountedNode = vnode; // work around flow
        componentVNodeHooks.prepatch(mountedNode, mountedNode);
      } else {
        var child = vnode.componentInstance = createComponentInstanceForVnode(
          vnode,
          activeInstance
        );
        child.$mount(hydrating ? vnode.elm : undefined, hydrating);
      }
    },
}
```
显然因为有```keepAlive```的标志，所以子组件不再走挂载流程，只是执行```prepatch```钩子对组件状态进行更新。并且很好的利用了缓存```vnode```之前保留的真实节点进行节点的替换。具体可以看```reactivateComponent```的逻辑。


### 13.7 生命周期
我们通过实例来观察```keep-alive```生命周期和普通组件的不同

在我们从```child1```切换到```child2```,再切回```child1```时，```chil1```不会再执行```mounted```钩子，只会执行```activated```钩子，而```child2```也不会执行```destoryed```钩子，只会执行```deactivated```钩子，这是为什么呢？




如果数据最近被访问过，那么将来被访问的几率也更高