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
