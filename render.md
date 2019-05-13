> 在[深入剖析Vue源码 - 实例挂载,编译流程](https://juejin.im/post/5ccafd4d51882540d472a90e)这一节中，我们将Vue复杂的挂载流程通过图解流程，代码分析的方式简单的梳理了一遍，其中讲到了模板编译的大致流程，在挂载的核心处，我们并没有对编译后函数的渲染过程深入分析。这一节中，我们重新回到Vue实例挂载的最后一个流程，如何将编译后的render函数渲染到页面，成为用户所看到真正的DOM节点。

### 4.1 Virtual DOM

就是在数据和真实 DOM 之间建立了一层缓冲

DOM 通常被视为一棵树，元素则是这棵树上的节点（node）

通过 VD 的比较，我们可以将多个操作合并成一个批量的操作，从而减少 dom 重排的次数，进而缩短了生成渲染树和绘制所花的时间
### 4.1
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