>为了深入的介绍响应式系统的内部实现原理，我们花了一整节的篇幅介绍了数据如何初始化成为响应式对象的过程，其中包括```data, computed,props```等数据。上一节的介绍以构建思路为主，对细节化繁为简，并在文章的后半部分在保留源码结构的前提下构建了一个以```data```为数据的响应式系统。有了这些铺垫，这节将深入分析响应式系统的核心。

### 7.5 相关概念
先简单回顾一下几个重要的概念：
- 1. ```Observer```类，实例化一个```Observer```类会通过```Object.defineProperty```对数据的```getter,setter```方法进行改写，在```getter```阶段进行**依赖的收集**,在数据发生更改阶段，触发```setter```方法进行**依赖的更新**
- 2. ```watcher```类，实例化```watcher```类相当于创建一个依赖，简单的理解是数据在哪一个地方使用就产生了一个依赖。前面提到的渲染wathcer便是数据在渲染dom时产生的一个依赖。
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
    // 这一部分的逻辑是针对深层次的对象，如果对象的属性是一个对象，则会递归调用实例化Observe类，让其属性值也转换为响应式对象
    var childOb = !shallow && observe(val);
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: true,s
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
主要看```getter```的逻辑，我们知道当```data```中属性值被访问时，会被的```getter```函数拦截，而数据被访问的典型场景是页面渲染时读取并渲染所需要的数据。在[深入剖析Vue源码 - 实例挂载,编译流程](https://juejin.im/post/5ccafd4d51882540d472a90e)的挂载流程中，```$mount```**实例挂载的最后阶段会创建一个渲染```watcher```**,与此同时触发```getter```进入依赖收集阶段。依赖收集阶段总结来说会做下面几件事：
- 1. **为当前的渲染```watcher```添加拥有的依赖收集器**。
- 2. **为当前的数据收集需要监听的依赖**
如何理解这两点？我们看代码中会执行```dep.depend()```,这是```Dep```这个类定义在原型上的方法。
```
Dep.prototype.depend = function depend () {
    if (Dep.target) {
      Dep.target.addDep(this);
    }
  };
```
```Dep.target```为当前执行的```watcher```,在当前渲染阶段，```Dep.target```为组件挂载时实例化的渲染```watcher```,因此```depend```方法又会调用当前```watcher```的addDep为```watcher```添加依赖收集器。

```
Watcher.prototype.addDep = function addDep (dep) {
    var id = dep.id;
    if (!this.newDepIds.has(id)) {
      // newDepIds和newDeps记录watcher拥有的数据
      this.newDepIds.add(id);
      this.newDeps.push(dep);
      // 避免重复添加同一个data收集器
      if (!this.depIds.has(id)) {
        dep.addSub(this);
      }
    }
  };
```
其中```newDepIds```是具有唯一成员是```Set```数据结构，```newDeps```是数组，他们用来记录当前```watcher```所拥有的数据，这一过程会进行逻辑判断，避免同一数据添加多次。
```
Dep.prototype.addSub = function addSub (sub) {
  //将当前watcher添加到数据依赖收集器中
    this.subs.push(sub);
};
```
```addSub```为每个数据依赖收集器，添加需要被监听的```watcher```。
- 3. **遇到属性值为对象时，为该对象的每个值收集依赖**
- 4. **遇到属性值为数组时，进行特殊处理**，这点放到后面讲。


##### 7.7.2 派发更新
在分析依赖收集的过程中，可能会有不少困惑，为什么要维护这么多的关系？实际在数据更新时，这些关系会起到什么作用？带着疑惑，我们来看看派发更新的过程。
在数据发生改变时，会执行定义好的```setter```方法，我们先看源码。
```
Object.defineProperty(obj,key, {
  ···
  set: function reactiveSetter (newVal) {
      var value = getter ? getter.call(obj) : val;
      // 新值和旧值相等时，跳出操作
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      ···
      // 新值为对象时，会为新对象进行依赖收集过程
      childOb = !shallow && observe(newVal);
      dep.notify();
    }
})
```
派发更新阶段会做一下几件事：
- 1. **数据相等不进行任何派发更新操作**
- 2. **新值为对象时，会对该值的属性进行依赖收集过程**
- 3. **通知该数据收集的```watcher```,遍历每个```watcher```进行数据更新**
这个阶段是调用该数据依赖收集器的```dep.notify```方法进行更新的派发。
```
Dep.prototype.notify = function notify () {
    var subs = this.subs.slice();
    if (!config.async) {
      // 根据依赖的id进行排序
      subs.sort(function (a, b) { return a.id - b.id; });
    }
    for (var i = 0, l = subs.length; i < l; i++) {
      // 遍历每个依赖，进行更新数据操作。
      subs[i].update();
    }
  };
```
- 4. **更新时会将每个watcher推到队列中，等待下一个tick到来时取除每个watcher进行run操作**

```
 Watcher.prototype.update = function update () {
    ···
    queueWatcher(this);
  };
```
```queueWatcher```方法的调用，会将数据所收集的依赖依次推到```queue```数组中,数组会在下一个事件循环```'tick'```中根据缓冲结果进行视图更新。而在执行视图更新过程中，难免会因为数据的改变而在渲染模板上添加新的依赖，这样又会执行```queueWatcher```的过程。所以需要有一个标志位来记录是否处于异步更新过程的队列中。这个标志位为```flushing```,当处于异步更新过程时，新增的```watcher```会插入到```queue```中。
```
function queueWatcher (watcher) {
    var id = watcher.id;
    // 保证同一个watcher只执行一次
    if (has[id] == null) {
      has[id] = true;
      if (!flushing) {
        queue.push(watcher);
      } else {
        var i = queue.length - 1;
        while (i > index && queue[i].id > watcher.id) {
          i--;
        }
        queue.splice(i + 1, 0, watcher);
      }
      ···
      nextTick(flushSchedulerQueue);
    }
  }
```
```nextTick```的原理和实现先不讲，概括来说，```nextTick```会缓冲多个数据处理过程，等到下一个事件循环```tick```中再去执行```DOM```操作，**它的原理，本质是利用事件循环的微任务队列实现异步更新**。


当下一个```tick```到来时，会执行```flushSchedulerQueue```方法，它会拿到收集的```queue```数组，这是一个```watcher```的集合，之后对依赖进行排序。为什么进行排序呢？源码中注释了三点：
- 4.1. 组件创建是先父后子，所有组件的更新也是先父后子，因此需要保证父的渲染```watcher```优先于子的渲染```watcher```更新。
- 4.2. **用户定义watcher对数据的监听，这一阶段会创建一个user watcher,user watcher 和渲染watcher执行也有先后，user watcher优先**，```user watcher```放到后面讲。

- 4.3. 如果一个组件在父组件的 ```watcher``` 执行阶段被销毁，那么它对应的 ```watcher``` 执行都可以被跳过，因此这也是保证父要优先子执行的原因。


```
function flushSchedulerQueue () {
    currentFlushTimestamp = getNow();
    flushing = true;
    var watcher, id;
    // 对queue的watcher进行排序
    queue.sort(function (a, b) { return a.id - b.id; });
    // 循环执行queue.length，为了确保由于渲染时添加新的依赖导致queue的长度不断改变。
    for (index = 0; index < queue.length; index++) {
      watcher = queue[index];
      // 如果watcher定义了before的配置，则优先执行before方法
      if (watcher.before) {
        watcher.before();
      }
      id = watcher.id;
      has[id] = null;
      watcher.run();
      // in dev build, check and stop circular updates.
      if (has[id] != null) {
        circular[id] = (circular[id] || 0) + 1;
        if (circular[id] > MAX_UPDATE_COUNT) {
          warn(
            'You may have an infinite update loop ' + (
              watcher.user
                ? ("in watcher with expression \"" + (watcher.expression) + "\"")
                : "in a component render function."
            ),
            watcher.vm
          );
          break
        }
      }
    }

    // keep copies of post queues before resetting state
    var activatedQueue = activatedChildren.slice();
    var updatedQueue = queue.slice();
    // 重置恢复状态，清空队列
    resetSchedulerState();

    // 视图改变后，调用其他钩子
    callActivatedHooks(activatedQueue);
    callUpdatedHooks(updatedQueue);

    // devtool hook
    /* istanbul ignore if */
    if (devtools && config.devtools) {
      devtools.emit('flush');
    }
  }
```
```flushSchedulerQueue```阶段，重要的过程可以总结为四点：
- 1. ```queue```中的```watcher```进行排序，原因上面已经总结。
- 2. 遍历```watcher```,如果当前```watcher```有```before```配置，则执行```before```方法，对应分析，在渲染```watcher```实例化时，我们传递了```before```函数，即在下个```tick```更新视图前，会调用```beforeUpdate```生命周期钩子。
```
new Watcher(vm, updateComponent, noop, {
  before: function before () {
    if (vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'beforeUpdate');
    }
  }
}, true /* isRenderWatcher */);
```
- 3. 执行```watcher.run```进行修改的操作。
- 4. 重置恢复状态，这个阶段会将一些流程控制的状态变量恢复为初始值，并清空记录```watcher```的队列。


重点看看```watcher.run()```的操作。
```
Watcher.prototype.run = function run () {
    if (this.active) {
      var value = this.get();
      if ( value !== this.value || isObject(value) || this.deep ) {
        // 设置新值
        var oldValue = this.value;
        this.value = value;
        // 针对user watcher，暂时不分析
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue);
          } catch (e) {
            handleError(e, this.vm, ("callback for watcher \"" + (this.expression) + "\""));
          }
        } else {
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  };
```
首先会执行```watcher.prototype.get```的方法，得到数据变化后的当前值，之后会对新值做判断，如果满足新旧值不等，新值是对象类型，```deep```模式的任一条件，则执行```cb```,```cb```为实例化```watcher```时传入的回调。

在分析```get```方法前，回头看看```watcher```构造函数的几个属性定义
```
var watcher = function Watcher(
  vm, // 组件实例
  expOrFn, // 执行函数
  cb, // 回调
  options, // 配置
  isRenderWatcher // 是否为渲染watcher
) {
  this.vm = vm;
    if (isRenderWatcher) {
      vm._watcher = this;
    }
    vm._watchers.push(this);
    // options
    if (options) {
      this.deep = !!options.deep;
      this.user = !!options.user;
      this.lazy = !!options.lazy;
      this.sync = !!options.sync;
      this.before = options.before;
    } else {
      this.deep = this.user = this.lazy = this.sync = false;
    }
    this.cb = cb;
    this.id = ++uid$2; // uid for batching
    this.active = true;
    this.dirty = this.lazy; // for lazy watchers
    this.deps = [];
    this.newDeps = [];
    this.depIds = new _Set();
    this.newDepIds = new _Set();
    this.expression = expOrFn.toString();
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn;
    } else {
      this.getter = parsePath(expOrFn);
      if (!this.getter) {
        this.getter = noop;
        warn(
          "Failed watching path: \"" + expOrFn + "\" " +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        );
      }
    }
    // lazy为计算属性标志，当watcher为计算watcher时，不会理解执行get方法进行求值
    this.value = this.lazy
      ? undefined
      : this.get();
  
}
```
方法```get```的定义如下：
```
Watcher.prototype.get = function get () {
    pushTarget(this);
    var value;
    var vm = this.vm;
    try {
      value = this.getter.call(vm, vm);
    } catch (e) {
     ···
    } finally {
      ···
      // 把Dep.target恢复到上一个状态，依赖收集过程完成
      popTarget();
      this.cleanupDeps();
    }
    return value
  };
```
```get```方法会执行```this.getter```进行求值，在当前渲染```watcher```的条件下,```getter```会执行视图更新的操作。这一阶段会**根据数据变化重新渲染页面组件**
```
new Watcher(vm, updateComponent, noop, { before: () => {} }, true);

updateComponent = function () {
  vm._update(vm._render(), hydrating);
};
```

执行完```getter```方法后，最后一步会进行依赖的清除，也就是```cleanupDeps```的过程。

> 列举一个场景： 我们经常会使用```v-if```来进行模板的切换，奇幻过程中会执行不同的模板渲染，如果A模板监听a数据，B模板监听b数据，当渲染模板B时，如果不进行旧依赖的清除，在B模板的场景下，a数据的变化同样会引起依赖的重新渲染更新，这会造成性能的浪费。因此旧依赖的清除在优化阶段是有必要。

```
// 依赖清除的过程
  Watcher.prototype.cleanupDeps = function cleanupDeps () {
    var i = this.deps.length;
    while (i--) {
      var dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
    }
    var tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  };
```

把上面分析的总结成两个点
- 5. **执行run操作会执行getter方法也就是重新计算新值，针对渲染watcher而言，会重新执行updateComponent进行视图更新**
- 6. **重新计算getter后，会进行依赖的清除**

至此```data```的依赖收集和派发更新介绍完毕。

### 7.8 computed
##### 7.8.1 依赖收集
```computed```的初始化过程，**会遍历```computed```的每一个属性值，并为没有给属性实例化一个```computed watcher```**
```
watchers[key] = new Watcher(
  vm,
  getter || noop,
  noop,
  computedWatcherOptions
);
// computed watcher的标志是，lazy属性为true
var computedWatcherOptions = { lazy: true };
```

与```data```相似，```computed```的初始化在创建```watcher```之后也需要将```computed```的每一个属性值转化为响应式数据。具体的定义如下：
```
function defineComputed (target,key,userDef) {
  // 非服务端渲染会对getter进行缓存
  var shouldCache = !isServerRendering();
  if (typeof userDef === 'function') {
    // 
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  if (sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        ("Computed property \"" + key + "\" was assigned to but it has no setter."),
        this
      );
    };
  }
  Object.defineProperty(target, key, sharedPropertyDefinition);
}
```
在非服务端渲染的情形，计算属性的计算结果会被缓存，缓存的意义在于，**只有在相关响应式数据发生变化时，```computed```才会重新求值，其余情况多次访问计算属性的值都会返回之前计算的结果，这就是缓存的优化**，```computed```属性执行两种写法，一种是函数的写法，另一种是对象的写法，其中对象的写法需要提供```getter```和```setter```方法。

当访问到```computed```属性时，会触发```getter```方法进行依赖收集，看看```createComputedGetter```的实现。
```
function createComputedGetter (key) {
    return function computedGetter () {
      var watcher = this._computedWatchers && this._computedWatchers[key];
      if (watcher) {
        if (watcher.dirty) {
          watcher.evaluate();
        }
        if (Dep.target) {
          watcher.depend();
        }
        return watcher.value
      }
    }
  }
```
```createComputedGetter```返回的函数在执行过程中会先拿到属性的```computed watcher```,```watcher```的```dirty```是标志该```watcher```为```computed watcher```，所以会执行```evaluate```方法。
```
Watcher.prototype.evaluate = function evaluate () {
    // 对于计算属性而言 evaluate的作用是执行计算回调
    this.value = this.get();
    this.dirty = false;
  };
```
```get```方法前面介绍过，会调用实例化```watcher```时传递的执行函数，在```computer watcher```的场景下，执行函数是计算属性的计算函数，他可以是一个函数，也可以是对象的```getter```方法。

> 列举一个场景避免和data的处理脱钩，```computed```在计算阶段，如果访问到```data```数据的其他属性值，会触发```data```数据的```getter```方法进行依赖收集，根据前面分析，```data```的```Dep```收集器会将当前```watcher```作为依赖进行收集，而这个```watcher```就是```computed watcher```，并且会为当前的```watcher```添加依赖收集器```Dep```


回到计算执行函数的```this.get()```方法，```getter```执行完毕后同样会进行依赖的清除，原理和目的参考```data```阶段的分析。


```get```执行完毕后会进入```watcher.depend```进行依赖的收集。收集过程和```data```一致,为利用数据的依赖收集器```Dep```为当前的需要计算的属性添加需要监听的```watcher```。

##### 7.8.2 派发更新

计算属性的变化，往往是由于数据所依赖的数据发生改变导致的。