事件销毁在组件销毁的时候自动销毁？

1. 监听原生DOM事件

2. 监听自定义组件 emit事件


在监听原生 DOM 事件时，方法以事件为唯一的参数。如果使用内联语句，语句可以访问一个 $event 属性：v-on:click="handle('ok', $event)"。


组件有原生dom事件和自定义事件，而普通节点只有原生dom事件，组件区分原生和自定义事件的标志是.native


1. 模板编译


解析修饰符

添加事件，子优先于父

### 1. 模板编译
Vue在挂载实例前，有相当多的工作是进行模板的编译，将```template```模板进行编译，解析成```AST```树，在转换成平台所需的代码，对于客户端而言，就是```render```函数，有了```render```函数才能进入实例挂载过程。而对于事件而言，我们经常使用```v-on```或者```@```在模板上绑定事件。因此对事件的第一步处理，就是在编译阶段收集事件指令。

从一个简单的用法分析编译阶段收集的信息：
```
<div id="app">
    <div v-on:click.stop="doThis">点击</div>
    <span>{{count}}</span>
</div>
<script>
var vm = new Vue({
    el: '#app',
    data() {
        return {
            count: 1
        }
    },
    methods: {
        doThis() {
            ++this.count
        }
    }
})
</script>
```

编译的入口在```var ast = parse(template.trim(), options);```中，具体可参考[深入剖析Vue源码 - 实例挂载,编译流程](https://juejin.im/post/5ccafd4d51882540d472a90e)这节，```parse```通过拆分模板字符串，对其解析为一个```AST```树，其中对于属性的解析后的处理，在```processAttr```中,其中分支较多，我们只分析例子中的流程和一些重要的分支。

```
function processAttrs (el) {
    var list = el.attrsList;
    var i, l, name, rawName, value, modifiers, syncGen, isDynamic;
    for (i = 0, l = list.length; i < l; i++) {
      name = rawName = list[i].name; // v-on:click
      value = list[i].value; // doThis
      if (dirRE.test(name)) { // 匹配v-或者@开头的指令
        el.hasBindings = true;
        modifiers = parseModifiers(name.replace(dirRE, ''));// parseModifiers('on:click')
        if (modifiers) {
          name = name.replace(modifierRE, '');
        }
        if (bindRE.test(name)) { // v-bind分支
          // ...留到v-bind指令时分析
        } else if (onRE.test(name)) { // v-on分支
          name = name.replace(onRE, ''); // 拿到真正的事件click
          isDynamic = dynamicArgRE.test(name);// 动态事件绑定
          if (isDynamic) {
            name = name.slice(1, -1);
          }
          addHandler(el, name, value, modifiers, false, warn$2, list[i], isDynamic);
        } else { // normal directives
         // 其他指令相关逻辑
      } else {}
    }
  }
```
```processAttrs```的逻辑虽然较多，但是理解起来较为简单，通过正则匹配到事件指令相关内容，包括事件本身，事件回调以及事件修饰符。最终通过```addHandler```方法，为```AST```树添加事件相关的属性。而```addHandler```另一个重要功能是对事件修饰符进行特殊处理。
```
// el是当前解析的AST树
function addHandler (el,name,value,modifiers,important,warn,range,dynamic) {
    modifiers = modifiers || emptyObject;
    // passive 和 prevent不能同时使用，可以参照官方文档说明
    if (
      warn &&
      modifiers.prevent && modifiers.passive
    ) {
      warn(
        'passive and prevent can\'t be used together. ' +
        'Passive handler can\'t prevent default event.',
        range
      );
    }
    // 这部分的逻辑会对特殊的修饰符做字符串拼接的处理，以备后续的使用
    if (modifiers.right) {
      if (dynamic) {
        name = "(" + name + ")==='click'?'contextmenu':(" + name + ")";
      } else if (name === 'click') {
        name = 'contextmenu';
        delete modifiers.right;
      }
    } else if (modifiers.middle) {
      if (dynamic) {
        name = "(" + name + ")==='click'?'mouseup':(" + name + ")";
      } else if (name === 'click') {
        name = 'mouseup';
      }
    }
    if (modifiers.capture) {
      delete modifiers.capture;
      name = prependModifierMarker('!', name, dynamic);
    }
    if (modifiers.once) {
      delete modifiers.once;
      name = prependModifierMarker('~', name, dynamic);
    }
    /* istanbul ignore if */
    if (modifiers.passive) {
      delete modifiers.passive;
      name = prependModifierMarker('&', name, dynamic);
    }
    // events 用来记录绑定的事件
    var events;
    if (modifiers.native) {
      delete modifiers.native;
      events = el.nativeEvents || (el.nativeEvents = {});
    } else {
      events = el.events || (el.events = {});
    }

    var newHandler = rangeSetItem({ value: value.trim(), dynamic: dynamic }, range);
    if (modifiers !== emptyObject) {
      newHandler.modifiers = modifiers;
    }

    var handlers = events[name];
    /* istanbul ignore if */
    // 绑定的事件可以多个，回调也可以多个，最终会合并到数组中
    if (Array.isArray(handlers)) {
      important ? handlers.unshift(newHandler) : handlers.push(newHandler);
    } else if (handlers) {
      events[name] = important ? [newHandler, handlers] : [handlers, newHandler];
    } else {
      events[name] = newHandler;
    }
    el.plain = false;
  }
```
最终转换的```AST```树如下：
> 图-----------------

### 2. render函数
```AST```树解析完毕后，接下来会生成```render函数```, 即```var code = generate(ast, options);```
```
function generate (ast,options) {
    var state = new CodegenState(options);
    var code = ast ? genElement(ast, state) : '_c("div")';
    return {
      render: ("with(this){return " + code + "}"), // with函数
      staticRenderFns: state.staticRenderFns
    }
  }
```
其中核心的处理在```getElement```中,而对于普通模板的编译在```genData```函数中处理，同样分析只针对事件相关的处理，从前面解析出的```AST```树明显看出，```AST```树中多了```events```的属性,```genHandlers```函数会为```event```属性做逻辑处理。
```
function genData (el, state) {
    var data = '{';

    // directives first.
    // directives may mutate the el's other properties before they are generated.
    var dirs = genDirectives(el, state);
    if (dirs) { data += dirs + ','; }
    //其他处理
    ···

    // event handlers
    if (el.events) {
      data += (genHandlers(el.events, false)) + ",";
    }

    ···

    return data
  }
```
```genHandlers```的逻辑，会遍历解析好的```AST```树，拿到```event```对象属性，并根据属性上的事件对象拼接成字符串。
```
function genHandlers (events,isNative) {
    var prefix = isNative ? 'nativeOn:' : 'on:';
    var staticHandlers = "";
    var dynamicHandlers = "";
    // 遍历ast树解析好的event对象
    for (var name in events) {
      //genHandler本质上是将事件对象转换成可拼接的字符串
      var handlerCode = genHandler(events[name]);
      if (events[name] && events[name].dynamic) {
        dynamicHandlers += name + "," + handlerCode + ",";
      } else {
        staticHandlers += "\"" + name + "\":" + handlerCode + ",";
      }
    }
    staticHandlers = "{" + (staticHandlers.slice(0, -1)) + "}";
    if (dynamicHandlers) {
      return prefix + "_d(" + staticHandlers + ",[" + (dynamicHandlers.slice(0, -1)) + "])"
    } else {
      return prefix + staticHandlers
    }
  }
// 事件模板书写匹配
var isMethodPath = simplePathRE.test(handler.value); // doThis
var isFunctionExpression = fnExpRE.test(handler.value); // () => {} or function() {}
var isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, '')); // doThis($event)


function genHandler (handler) {
    if (!handler) {
      return 'function(){}'
    }
    // 事件绑定可以多个，多个在解析ast树时会以数组的形式存在，如果有多个则会递归调用getHandler方法返回数组。
    if (Array.isArray(handler)) {
      return ("[" + (handler.map(function (handler) { return genHandler(handler); }).join(',')) + "]")
    }
    // value： doThis 可以有三种方式
    var isMethodPath = simplePathRE.test(handler.value); // doThis
    var isFunctionExpression = fnExpRE.test(handler.value); // () => {} or function() {}
    var isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, '')); // doThis($event)

    // 没有任何修饰符
    if (!handler.modifiers) {
      // 符合函数定义规范，则直接返回调用函数名 doThis
      if (isMethodPath || isFunctionExpression) {
        return handler.value
      }
      // 不符合则通过function函数封装返回
      return ("function($event){" + (isFunctionInvocation ? ("return " + (handler.value)) : handler.value) + "}") // inline statement
    } else {
    // 包含修饰符的场景
    }
  }
```
模板中事件的写法有三种,分别对应上诉上个正则匹配的内容。
- 1. ```<div @click="doThis"></div>```
- 2. ```<div @click="doThis($event)"></div>```
- 3. ```<div @click="()=>{}"></div> <div @click="function(){}"></div>```

上述对事件对象的转换，如果事件不带任何修饰符，并且满足正确的模板写法，则直接返回调用事件名，如果不满足，则有可能是```<div @click="console.log(11)"></div>```的写法，此时会封装到```function($event){}```中。

包含修饰符的场景较多，我们单独列出分析。以上文中的例子说明，```modifiers: { stop: true }```会拿到```stop```对应需要添加的逻辑脚本```'$event.stopPropagation();'```,并将它添加到函数字符串中返回。
```
function genHandler() {
  // ···
  } else {
    var code = '';
    var genModifierCode = '';
    var keys = [];
    // 遍历modifiers上记录的修饰符
    for (var key in handler.modifiers) {
      if (modifierCode[key]) {
        // 根据修饰符添加对应js的代码
        genModifierCode += modifierCode[key];
        // left/right
        if (keyCodes[key]) {
          keys.push(key);
        }
        // 针对exact的处理
      } else if (key === 'exact') {
        var modifiers = (handler.modifiers);
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(function (keyModifier) { return !modifiers[keyModifier]; })
            .map(function (keyModifier) { return ("$event." + keyModifier + "Key"); })
            .join('||')
        );
      } else {
        keys.push(key);
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys);
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode;
    }
    // 根据三种不同的书写模板返回不同的字符串
    var handlerCode = isMethodPath
      ? ("return " + (handler.value) + "($event)")
      : isFunctionExpression
        ? ("return (" + (handler.value) + ")($event)")
        : isFunctionInvocation
          ? ("return " + (handler.value))
          : handler.value;
    return ("function($event){" + code + handlerCode + "}")
  }
}
var modifierCode = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard("$event.target !== $event.currentTarget"),
  ctrl: genGuard("!$event.ctrlKey"),
  shift: genGuard("!$event.shiftKey"),
  alt: genGuard("!$event.altKey"),
  meta: genGuard("!$event.metaKey"),
  left: genGuard("'button' in $event && $event.button !== 0"),
  middle: genGuard("'button' in $event && $event.button !== 1"),
  right: genGuard("'button' in $event && $event.button !== 2")
};
```

经过这一转行后，生成的```with```封装的```render```函数如下：
```
"_c('div',{attrs:{"id":"app"}},[_c('div',{on:{"click":function($event){$event.stopPropagation();return doThis($event)}}},[_v("点击")]),_v(" "),_c('span',[_v(_s(count))])])"
```

### 3. 事件绑定

