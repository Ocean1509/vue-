vue里面有哪些内置组件，为什么要有内置组件，内置组件什么时候注册的，编译时有哪些不同? component本质上不是一个内置组件，起到动态组件的作用是属性值为is的props

### 12.1 动态组件
##### 12.1 基本用法
```
// vue
<div id="app">
  <button @click="changeTabs('child1')">child1</button>
  <button @click="changeTabs('child2')">child2</button>
  <button @click="changeTabs('child3')">child3</button>
  <component :is="chooseTabs">
  </component>
</div>
// js
var child1 = {
  template: '<div>content1</div>',
}
var child2 = {
  template: '<div>content2</div>'
}
var child3 = {
  template: '<div>content3</div>'
}
var vm = new Vue({
  el: '#app',
  components: {
    child1,
    child2,
    child3
  },
  methods: {
    changeTabs(tab) {
      this.chooseTabs = tab;
    }
  }
})
```

```processComponent```
```
//  针对动态组件的解析
function processComponent (el) {
  var binding;
  // 拿到is属性所对应的值
  if ((binding = getBindingAttr(el, 'is'))) {
    // ast树上多了component的属性
    el.component = binding;
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true;
  }
}
```
```component```是动态组件在```ast```阶段的标志
最终的ast树：
> 图


子组件的render函数
```"with(this){return _c('div',{attrs:{"id":"app"}},[_c('child1',[_v(_s(test))])],1)}"```

动态组件的render函数

```"with(this){return _c('div',{attrs:{"id":"app"}},[_c(chooseTabs,{tag:"component"})],1)}"```

```genComponent```
- 1. ast阶段新增component属性，标志动态组件
- 2. 产生render函数阶段由于component属性的存在，走genComponent分支，genComponent会针对动态组件的执行函数会进行特殊的处理，和普通组件不同的是，_c的第一个参数不再是不变的字符串，而是指定的变量。
- 3. render到vnode阶段和组件的流程相同，只是字符串换成了变量，并有{ tag: 'component' }的data属性。chooseTabs此时取的是child1，因此会执行子组件的创建挂载流程。

##### 疑惑：
可能由于自己对源码的理解还不够透彻,读了动态组件的创建流程之后，心中一直有一个疑问，从原理的过程分析，动态组件的核心其实是```is```这个关键字，它在编译阶段就以```component```属性将该组件定义为动态组件，而```component```作为标签的关键字好像并没有特别大的用途，只要有```is```关键字的存在，组件标签名设置为任意自定义标签都可以达到动态组件的效果(```componenta, componentb```)。这个字符串仅以```{ tag: 'component' }```的形式存在于```vnode```的```data```属性存在。所以希望有大佬能解答我这个疑惑，为什么要有这个```component```关键字？



### 12.2 内联模板
由于动态组件除了有```is```作为传值外，还可以有```inline-template```作为配置,借此前提，刚好可以理清楚```Vue```中内联模板的原理和设计思想。```Vue```在官网有一句醒目的话。提示我们```inline-template``` 会让模板的作用域变得更加难以理解。因此建议能使用```template```选项来定义模板，而不是用内联模板的形式。
我们先简单调整上面的例子，从使用角度上入手：
```
// html
<div id="app">
  <button @click="changeTabs('child1')">child1</button>
  <button @click="changeTabs('child2')">child2</button>
  <button @click="changeTabs('child3')">child3</button>
  <component :is="chooseTabs" inline-template>
    <span>{{test}}</span>
  </component>
</div>
// js
var child1 = {
  data() {
    return {
      test: 'content1'
    }
  }
}
var child2 = {
  data() {
    return {
      test: 'content2'
    }
  }
}
var child3 = {
  data() {
    return {
      test: 'content3'
    }
  }
}
var vm = new Vue({
  el: '#app',
  components: {
    child1,
    child2,
    child3
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
例子中达到的效果和文章第一个例子一致，很明显和以往认知最大的差异在于，父组件里的环境可以访问到子组件内部的环境变量。初看觉得挺不可思议的。我们回忆一下之前父组件访问到子组件的情形，从大的方向上有两个。
**- 1. 采用事件机制，子组件通过```$emit```事件，将子组件的状态告知父组件，达到父访问到子的目的。**
**- 2. 利用作用域插槽的方式，将子的变量通过```props```的形式传递给父，而父通过```v-slot```的语法糖去接收，而我们之前分析的结果是，这种方式本质上还是通过事件派发的形式去通知父组件。**

父无法访问到子环境的变量其实核心的原则是：
**父级模板里的所有内容都是在父级作用域中编译的；子模板里的所有内容都是在子作用域中编译的。**
而内联模板到底有什么奇特的地方呢？我们接着往下看：


回到```ast```解析阶段，前面分析针对动态组件的解析，关键在于```processComponent```函数对```is```属性的处理，其中还有一个关键是对```inline-template```的处理，它会在```ast```树上增加```inlineTemplate```属性。
```
//  针对动态组件的解析
  function processComponent (el) {
    var binding;
    // 拿到is属性所对应的值
    if ((binding = getBindingAttr(el, 'is'))) {
      // ast树上多了component的属性
      el.component = binding;
    }
    // 添加inlineTemplate属性
    if (getAndRemoveAttr(el, 'inline-template') != null) {
      el.inlineTemplate = true;
    }
  }
```


render函数生成阶段由于```inlineTemplate```的存在，父的render函数的子节点为```null```
```
function genComponent (componentName,el,state) {
  // 拥有inlineTemplate属性时，children为null
  var children = el.inlineTemplate ? null : genChildren(el, state, true);
  return ("_c(" + componentName + "," + (genData$2(el, state)) + (children ? ("," + children) : '') + ")")
}
```
**这一步处理，决定了```inline-template```下的模板不是在父组件阶段编译的。**


```"_c('div',{attrs:{"id":"app"}},[_c(chooseTabs,{tag:"component",inlineTemplate:{render:function(){with(this){return _c('span',[_v(_s(test))])}},staticRenderFns:[]}})],1)"```

```inlineTemplate```作为```data```属性存在



vnode 过程
```
{
  data: {
    inlineTemplate: {
      render: function() {}
    },
    tag: 'component'
  }
}
```



```createComponentInstanceForVnode```


