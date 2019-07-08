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