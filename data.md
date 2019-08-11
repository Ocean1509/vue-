> 上一节，我们深入分析了以```data```为数据创建响应式系统的过程，并对其中依赖收集和派发更新的过程进行了详细的分析。然而在使用和分析过程中依然存在或多或少的问题，这一节我们将针对这些问题展开分析，这也将作为响应式系统分析的完结篇。

### 7.8.数组检测
在[深入剖析Vue源码 - 数据代理，关联子父组件](https://juejin.im/post/5ca44c6151882543fb5ac95f)这一节中，已经详细介绍了```vue```数据代理的技术是利用了```Object.defineProperty```,有了```Object.defineProperty```方法，我们可以方便的利用存取描述符中的```getter/setter```来进行数据的监听,在```get,set```钩子中分别做不同的操作，达到数据拦截的目的。然而```Object.defineProperty```的```get,set```方法只能检测到对象属性的变化，对于数组的变化(例如插入删除数组元素等操作)，```Object.defineProperty```却无法检测,这也是利用```Object.defineProperty```进行数据监控的缺陷，虽然```es6```中的```proxy```可以完美解决这一问题，但毕竟有兼容性问题，所以我们还需要研究```Vue```中如何对数组进行监听检测。

##### 7.8.1 数组方法的重写
数组的改变不能再通过数据的```setter```方法去监听数组的变化，所以只能通过调用数组方法后对数据进行额外的处理。```Vue```为所有数组操作的方法重新改写了定义。
```
var arrayProto = Array.prototype;
// 新建一个继承于Array的对象
var arrayMethods = Object.create(arrayProto);

// 数组拥有的方法
var methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
];
```
```arrayMethods```是基于原始```Array```类为原型继承的一个对象类，因此也拥有数组的所有方法，接下来对新数组类的方法进行改写。
```
methodsToPatch.forEach(function (method) {
  // 缓冲原始数组的方法
  var original = arrayProto[method];
  // 利用Object.defineProperty对方法的执行进行改写
  def(arrayMethods, method, function mutator () {});
});

function def (obj, key, val, enumerable) {
    Object.defineProperty(obj, key, {
      value: val,
      enumerable: !!enumerable,
      writable: true,
      configurable: true
    });
  }

```

当调用新对象的数组方法时，会调用```mutator```方法,具体执行内容，我们放到数组的派发更新中介绍。


新建了一个定制化的数组类```arrayMethods```后,如何在调用数组方法时指向这个新的类，这是下一步的重点。

回到数据初始化，也就是```initData```阶段,上一篇内容花了大篇幅介绍过，数据初始化会为```data```数据创建一个```Observer```类，当时我们只讲述了```Observer```类会为每个非数组的属性进行数据拦截，重新定义```getter,setter```,而对数组的分析处理则留下来了空白。现在再回头看看对数组的处理。

```
var Observer = function Observer (value) {
  this.value = value;
  this.dep = new Dep();
  this.vmCount = 0;
  // 将__ob__属性设置成不可枚举属性。外部无法通过遍历获取。
  def(value, '__ob__', this);
  // 数组处理
  if (Array.isArray(value)) {
    if (hasProto) {
      protoAugment(value, arrayMethods);
    } else {
      copyAugment(value, arrayMethods, arrayKeys);
    }
    this.observeArray(value);
  } else {
  // 对象处理
    this.walk(value);
  }
}
```
数组的处理会根据```hasProto```的判断执行```protoAugment, copyAugment```过程，```hasProto```用来判断当前环境下是否支持```__proto__```属性。

```
var hasProto = '__proto__' in {};
```

当支持```__proto__```时，执行```protoAugment```会将当前数组的原型指向新的数组类```arrayMethods```,不支持```__proto__```时，则通过代理设置，在访问数组方法时代理访问新数组类中的数组方法。
```
//直接通过原型指向的方式

function protoAugment (target, src) {
  target.__proto__ = src;
}

// 通过数据代理的方式
function copyAugment (target, src, keys) {
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    def(target, key, src[key]);
  }
}
```
有了这两步的处理，接下来我们在实例内部调用```push, unshift```等数组的方法时，会执行```arrayMethods```类的方法。这也是数组进行依赖收集和派发更新的核心。


##### 7.8.2 依赖收集
由于数据初始化阶段会利用```Object.definePrototype```进行数据访问的改写，数组的访问同样适用，因此当访问到的数据是数组时，会被```getter```拦截处理，这里针对数组进行特殊处理。
```
function defineReactive() {
  ···
  var childOb = !shallow && observe(val);

  Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        get: function reactiveGetter () {
          var value = getter ? getter.call(obj) : val;
          if (Dep.target) {
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
        set() {}
}
 
```
```childOb```是标志属性值是否为基础类型的标志，```observe```遇到基本类型数据直接返回，不做任何处理，遇到对象和数组则会递归实例化```Observer```，最终返回```Observer```实例。而实例化```Observer```又回到之前的老流程：
  **添加```__ob__```属性，如果遇到数组则进行原型重指向，遇到对象则定义```getter,setter```，这一过程前面分析过，就不再阐述。**


在访问到数组时，由于```childOb```的存在，会执行```childOb.dep.depend();```进行依赖收集，该```Observer```实例的```dep```属性会收集当前的```watcher```作为依赖保存，这就是依赖收集的过程。

我们可以通过截图看最终依赖收集的结果。其中Observer

> 图


##### 7.8.3 派发更新
当调用数组的方法改变数组元素时，数据的```setter```方法是无法拦截的，所以我们唯一可以拦截的过程就是调用数组方法的时候，前面介绍过，数组方法的调用会代理到新类```arrayMethods```的方法中,而```arrayMethods```的数组方法是进行重写过的。具体我们看他的定义。

```
 methodsToPatch.forEach(function (method) {
    var original = arrayProto[method];
    def(arrayMethods, method, function mutator () {
      var args = [], len = arguments.length;
      while ( len-- ) args[ len ] = arguments[ len ];
      // 执行原数组方法
      var result = original.apply(this, args);
      var ob = this.__ob__;
      var inserted;
      switch (method) {
        case 'push':
        case 'unshift':
          inserted = args;
          break
        case 'splice':
          inserted = args.slice(2);
          break
      }
      if (inserted) { ob.observeArray(inserted); }
      // notify change
      ob.dep.notify();
      return result
    });
  });

```
```mutator```是重写的数组方法，首先会调用原始的数组方法进行运算，这保证了与原始数组类型的方法一致性，```args```保存了数组方法调用传递的参数。之后取出数组的```__ob__```也就是之前保存的```Observer```实例，调用```ob.dep.notify();```进行依赖的派发更新，前面知道了。```Observer```实例的```dep```是```Dep```的实例，他收集了需要监听的```watcher```依赖，而```notify```会对依赖进行重新计算并更新。具体看```Dep.prototype.notify = function notify () {}```函数的分析，这里也不重复赘述。

回到代码中，```inserted```变量用来标志数组是否是增加了元素，如果增加的元素不是原始类型，而是数组对象类型，则需要触发```observeArray```方法，对每个元素进行依赖收集。

**总的来说。数组的改变不会触发```setter```进行依赖更新，所以```Vue```创建了一个新的数组类，重写了数组的方法，将数组方法指向了新的数组类。同时在返回到数组时依旧触发```getter```进行依赖收集，在更改数组时，触发数组新方法运算，并进行依赖的派发。**

现在我们回过头看看Vue的官方文档对于数组检测时的注意事项：
> Vue 不能检测以下数组的变动
  当你利用索引直接设置一个数组项时，例如：vm.items[indexOfItem] = newValue
  当你修改数组的长度时，例如：vm.items.length = newLength

有了上诉的分析，数组的这些设置方式确实不会触发派发更新的过程。 



### 7.9 对象检测异常
我们在实际开发中经常遇到一种场景，对象```test: { a: 1 }```要添加一个属性```b```,这时如果我们使用```test.b = 2```的方式去添加，这个过程```Vue```是无法检测到的，理由也很简单。我们在对对象进行依赖收集的时候，会为对象的每个属性都进行收集依赖，而直接通过```test.b```添加的新属性并没有依赖收集的过程，因此当之后数据```b```发证改变时也不会进行依赖的更新。

```Vue```中为了解决这一问题，提供了```Vue.set(object, propertyName, value)```和```vm.$set(object, propertyName, value)```方法，我们看具体怎么完成新属性的依赖收集过程。
```
Vue.set = set
function set (target, key, val) {
    //target必须为非空对象
    if (isUndef(target) || isPrimitive(target)
    ) {
      warn(("Cannot set reactive property on undefined, null, or primitive value: " + ((target))));
    }
    // 数组场景，调用重写的splice方法，对新添加属性收集依赖。
    if (Array.isArray(target) && isValidArrayIndex(key)) {
      target.length = Math.max(target.length, key);
      target.splice(key, 1, val);
      return val
    }
    // 新增对象的属性存在时，直接返回新属性，触发依赖收集
    if (key in target && !(key in Object.prototype)) {
      target[key] = val;
      return val
    }
    // 拿到目标源的Observer 实例
    var ob = (target).__ob__;
    if (target._isVue || (ob && ob.vmCount)) {
      warn(
        'Avoid adding reactive properties to a Vue instance or its root $data ' +
        'at runtime - declare it upfront in the data option.'
      );
      return val
    }
    // 目标源对象本身不是一个响应式对象，则不需要处理
    if (!ob) {
      target[key] = val;
      return val
    }
    // 手动调用defineReactive，为新属性设置getter,setter
    defineReactive$$1(ob.value, key, val);
    ob.dep.notify();
    return val
  }
```
按照分支分为不同的四个处理逻辑：
- 1. 目标对象必须为非空的对象，可以是数组，否则抛出异常。
- 2. 如果目标对象是数组时，调用数组的```splice```方法，而前面分析数组检测时，遇到数组新增元素的场景，会调用```ob.observeArray(inserted)```对数组新增的元素收集依赖。
- 3. 新增的属性值在原对象中已经存在，则手动访问新的属性值，这一过程会触发依赖收集。
- 4. 手动定义新属性的```getter,setter```方法，并通过```notify```触发依赖更新。


### 7.10 nextTick

在上一节的内容中，我们说到数据修改时会触发```setter```方法进行依赖的派发更新，而更新时会将每个```watcher```推到队列中，等待下一个```tick```到来时再执行```DOM```的渲染更新操作。这个就是异步更新的过程。为了说明异步更新的概念，需要牵扯到浏览器的事件循环机制和最优的渲染时机问题。由于这不是文章的主线，我只用简单的总结表述。

##### 7.10.1 事件循环机制

- 1. 完整的事件循环机制需要了解两种异步队列：```macro-task```和```micro-task```
- 2. ```macro-task```常见的有 ```setTimeout, setInterval, setImmediate, script脚本, I/O操作，UI渲染```
- 3. ```micro-task```常见的有 ```promise, process.nextTick, MutationObserver```等
- 4. 完整事件循环流程为：
  - 4.1 ```micro-task```空，```macro-task```队列只有```script```脚本，推出```macro-task```的```script```任务执行，脚本执行期间产生的```macro-task，micro-task```推到对应的队列中
  - 4.2 执行全部```macro-task```里的微任务事件
  - 4.3 执行```DOM```操作，渲染更新页面
  - 4.4 执行```web worker```等相关任务
  - 4.5 循环，取出```macro-task```中一个宏任务事件执行，重复4的操作。


  从上面的流程中我们可以发现，最好的渲染过程发生在微任务队列的执行过程中，此时他离页面渲染过程最近，因此我们可以借助微任务队列来实现异步更新，它可以让复杂批量的运算操作运行在JS层面，而视图的渲染只关心最终的结果，这大大降低了性能的损耗。
  
  举一个这一做法好处的例子： 
    由于```Vue```是数据驱动视图更新渲染，如果我们在一个操作中重复对一个响应式数据进行计算，例如 在一个循环中执行```this.num ++ ```一千次，由于响应式系统的存在，数据变化触发```setter```，```setter```触发依赖派发更新，更新调用```run```进行视图的重新渲染。这一次循环，视图渲染要执行一千次，很明显这是很浪费性能的，我们只需要关注最后第一千次在界面上更新的结果而已。所以利用异步更新显得格外重要。

##### 7.10.2 基本实现

  ```Vue```用一个```queue```收集依赖的执行，在下次微任务执行的时候统一执行```queue```中```Watcher```的```run```操作,与此同时，相同```id```的```watcher```不会重复添加到```queue```中,因此也不会重复执行多次的视图渲染。我们看```nextTick```的实现。

```
// 原型上定义的方法
Vue.prototype.$nextTick = function (fn) {
  return nextTick(fn, this)
};
// 构造函数上定义的方法
Vue.nextTick = nextTick;

// 实际的定义
var callbacks = [];
function nextTick (cb, ctx) {
    var _resolve;
    // callbacks是维护微任务的数组。
    callbacks.push(function () {
      if (cb) {
        try {
          cb.call(ctx);
        } catch (e) {
          handleError(e, ctx, 'nextTick');
        }
      } else if (_resolve) {
        _resolve(ctx);
      }
    });
    if (!pending) {
      pending = true;
      // 将维护的队列推到微任务队列中维护
      timerFunc();
    }
    // nextTick没有传递参数，且浏览器支持Promise,则返回一个promise对象
    if (!cb && typeof Promise !== 'undefined') {
      return new Promise(function (resolve) {
        _resolve = resolve;
      })
    }
  }
```

```nextTick```定义为一个函数，使用方式为```Vue.nextTick( [callback, context] )```,当```callback```经过```nextTick```封装后，```callback```会在下一个```tick```中执行调用。从实现上，```callbacks```是一个维护了需要在下一个```tick```中执行的任务的队列，它的每个元素都是需要执行的函数。```pending```是判断是否在等待执行微任务队列的标志。而```timerFunc```是真正将任务队列推到微任务队列中的函数。我们看```timerFunc```的实现。

- 1. 如果浏览器执行```Promise```,那么默认以```Promsie```将执行过程推到微任务队列中。
```
var timerFunc;

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  var p = Promise.resolve();
  timerFunc = function () {
    p.then(flushCallbacks);
    // 手机端的兼容代码
    if (isIOS) { setTimeout(noop); }
  };
  // 使用微任务队列的标志
  isUsingMicroTask = true;
}
```
```flushCallbacks```是异步更新的函数，他会取出callbacks数组的每一个任务，执行任务，具体定义如下：
```
function flushCallbacks () {
  pending = false;
  var copies = callbacks.slice(0);
  // 取出callbacks数组的每一个任务，执行任务
  callbacks.length = 0;
  for (var i = 0; i < copies.length; i++) {
    copies[i]();
  }
}
```

- 2. 不支持```promise```,支持```MutataionObserver```
```
else if (!isIE && typeof MutationObserver !== 'undefined' && (
    isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]'
  )) {
    var counter = 1;
    var observer = new MutationObserver(flushCallbacks);
    var textNode = document.createTextNode(String(counter));
    observer.observe(textNode, {
      characterData: true
    });
    timerFunc = function () {
      counter = (counter + 1) % 2;
      textNode.data = String(counter);
    };
    isUsingMicroTask = true;
  }
```

- 3. 支持```setImmediate```
```
 else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
    // Fallback to setImmediate.
    // Techinically it leverages the (macro) task queue,
    // but it is still a better choice than setTimeout.
    timerFunc = function () {
      setImmediate(flushCallbacks);
    };
  }
```
- 4. 所有微任务类型的方法都不适合，则使用宏任务队列
```
else {
  timerFunc = function () {
    setTimeout(flushCallbacks, 0);
  };
}
```

当```nextTick```不传递任何参数时，可以作为一个```promise```用，例如：
```
nextTick().then(() => {})
```

##### 7.10.3 使用场景
说了这么多原理性的东西，回过头来看看```nextTick```的使用场景，由于异步更新的原理，我们在某一时间改变的数据并不会触发视图的更新，而是需要等下一个```tick```到来时才会更新视图，下面是一个典型场景：

```
<input v-if="show" type="text" ref="myInput">

// js
data() {
  show: false
},
mounted() {
  this.show = true;
  this.$refs.myInput.focus();// 报错
}
```
数据改变时，视图并不会同时改变，因此需要使用```nextTick```
```
mounted() {
  this.show = true;
  this.$nextTick(function() {
    this.$refs.myInput.focus();// 正常
  })
}
```


**讲完响应式系统几个关键的问题，接下来，回到分析响应式系统的主线，上一节分析的是```data```,后面补上```computed,watch```的响应式构建过程。**

### 7.8 computed
##### 7.8.1 依赖收集
```computed```的初始化过程，**会遍历```computed```的每一个属性值，并为每一个属性实例化一个```computed watcher```**
```
function initComputed() {
  ···
  for(var key in computed) {
    watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      );
  }
}

// computed watcher的标志，lazy属性为true
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

1. 计算数据依赖的数据发生更新,通过数据依赖收集器dep的notify方法，对每个收集的依赖进行状态更新。
2. 遇到computed watcher不会立刻执行依赖派发更新，而是通过dirty进行标记
3. 由于数据拥有渲染watcher这个依赖，所以会执行updateComponent进行视图重新渲染。render过程中访问到计算属性又会对计算属性重新求值，保证改变前后两个值不同时才会更新下视图



watch
  依赖收集
  1. watch数据初始化时会执行createWacher，createWatcher会调用原型上的$watch方法,即手动创建一个user watcher,
  2. user watcher 在创建完毕后会执行一次getter求值,
此时的getter只是一个需要监听的字符串，它可以是单纯一个属性值，也可以是以对象.属性的形式存在。
  3. getter过程中会手动调用数据，触发数据的getter方法进行依赖收集，依赖收集首先将data属性的Dep收集器将user watcher作为依赖进行收集
  4. 接着为数据的Dep添加当前user watcher依赖