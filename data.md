>为了深入的介绍响应式系统的内部实现原理，我们花了一整节的篇幅介绍了数据如何初始化成为响应式对象的过程，其中包括```data, computed,props```等数据。上一节的介绍以构建思路为主，对细节化繁为简，并在文章的后半部分在保留源码结构的前提下构建了一个以```data```为数据的响应式系统。有了这些铺垫，这节将深入分析响应式系统的核心。

### 7.5 相关概念
先简单回顾一下几个重要的概念：
- 1. Observer类，实例化一个Observer类会通过```Object.defineProperty```对数据的```getter,setter```方法进行改写，在```getter```阶段进行**依赖的收集**,在数据发生更改阶段，触发```setter```方法进行**依赖的更新**
- 2. watcher类，实例化watcher类相当于创建一个依赖，简单的理解是数据在哪一个地方使用就产生了一个依赖。前面提到的渲染wathcer便是数据在渲染dom时产生的一个依赖。
- 3. Dep类，既然```watcher```理解为每个数据需要监听的依赖，那么对这些依赖的收集和通知则需要另一个类来管理，这个类便是```Dep```,```Dep```需要做的只有两件事，收集依赖和派发更新依赖。
这是响应式系统构建的三个基本核心概念，也是这一节的基础，如果还没有印象，则需要回顾[深入剖析Vue源码 - 响应式系统构建(上)](https://juejin.im/post/5d072a10518825092c7171c4)一文。


### 7.6 问题思考
接下来我会带着以下几个疑问开始分析：
- 1. 实例化```Dep```发生在什么时候。前面已经知道，```Dep```是作为依赖的容器，那么这个容器什么时候产生的呢？
- 2. ```Dep```收集了什么类型的依赖？即```watcher```作为依赖的分类有哪些，分别是什么场景，以及区别在哪里？
- 3. ```Observer```这个类具体对```getter,setter```方法做了哪些事情
- 4. 手写的```watch```和页面数据渲染监听的```watch```如果同时监听到数据的变化，优先级怎么排。
- 5. 有了依赖的收集是不是还有依赖的解除，依赖的解除有哪些逻辑的优化

带着这几个问题，我们分别对不同数据类型的依赖收集和派发更新过程做具体的分析。

### 7.7 data
##### 7.7.1 依赖收集
```data```在初始化阶段会实例化一个```Observer```类，这个类的定义如下:(当```data```类型为数组时，我们暂且跳过，等后续再分析。)
```
var Observer = function Observer (value) {
    ···
    // 将__ob__属性设置成不可枚举属性。外部无法通过遍历获取。
    def(value, '__ob__', this);
    // 数组处理
    if (Array.isArray(value)) {
        ···
    } else {
      // 对象处理
      this.walk(value);
    }
  };
```
```__ob__```属性是作为响应式对象的标志，```def```方法确保了该属性是不可枚举属性，即外界无法通过遍历获取该属性值。除了标志响应式对象外，```Observer```类还调用了原型上```walk```方法，对遍历对象上每个属性，进行```getter,setter```的重写
```
Observer.prototype.walk = function walk (obj) {
    // 获取对象所有属性，遍历调用defineReactive$$1进行改写
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
        defineReactive$$1(obj, keys[i]);
    }
};
```
```defineReactive$$1```是响应式构建的核心，它会先**实例化一个Dep类，即为每个数据都创建一个依赖的管理**，之后利用```Object.defineProperty```重写```getter,setter```方法。这里我们只分析依赖收集的代码。
```
function defineReactive$$1 (obj,key,val,customSetter,shallow) {
    // 每个数据实例化一个Dep类，创建一个依赖的管理
    var dep = new Dep();

    var property = Object.getOwnPropertyDescriptor(obj, key);
    // 属性必须满足可配置
    if (property && property.configurable === false) {
      return
    }
    // cater for pre-defined getter/setters
    var getter = property && property.get;
    var setter = property && property.set;
    // 这一部分的逻辑是针对深层次的对象，如果对象的属性是一个对象，则
    var childOb = !shallow && observe(val);
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: true,
      get: function reactiveGetter () {
        var value = getter ? getter.call(obj) : val;
        if (Dep.target) {
          // 为当前watcher添加dep数据
          dep.depend();
          if (childOb) {
            childOb.dep.depend();
            if (Array.isArray(value)) {
              dependArray(value);
            }
          }
        }
        return value
      },
      set: function reactiveSetter (newVal) {}
    });
  }
```
