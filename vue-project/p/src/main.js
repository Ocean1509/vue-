// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import test from './test'
// import test from './test'
import loading from './loading'
import router from './router'
import App from './App'
// var promiseEvent = new Promise((resolve, reject) => {
//   setTimeout(() => {
//     reject('0000000')
//   }, 1000);
// })

// Vue.component('my-test', {
//   template: '<div>{{test}}</div>',
//   data () {
//     return {
//       test: 1212
//     }
//   },
//   beforeMount () {
//     console.log('chilren beforeMount')
//   },
//   mounted () {
//     console.log('chilren mounted')
//   },
//   beforeDestroy () {
//     console.log('chilren beforeDestory')
//   }
// })
// /* eslint-disable no-new */
// var vm = new Vue({
//   el: '#app',
//   components: {
//     test
//   },
//   template: '<div id="app"><span>4324324</span><my-test></my-test></div>',
//   beforeMount() {
//     console.log('Vue beforeMount');
//     return promiseEvent.then(res => {
//       console.log(res)
//     })
//   },
//   mounted() {
//     console.log('Vue mounted')
//   },
//   beforeDestroy() {
//     console.log('Vue beforeDestory')
//   }
// })
// console.log(vm)
// Vue.component('my-test', {
//   template: '<span>loading···</span>',
//   data () {
//     return {
//       test: '123'
//     }
//   }
// })
// Vue.component('my-test', function(resolve, reject) {
//   // require.ensure([], function () {
//   //   resolve(require('./test.vue'));
//   // }, 'list');
//   require(['./test.vue'], resolve)
// })

// const AsyncComponent = () => ({
//   // 需要加载的组件 (应该是一个 `Promise` 对象)
//   component: import('./test.vue'),
//   // 异步组件加载时使用的组件
//   loading: loading,
//   // 加载失败时使用的组件
//   error: loading,
//   // 展示加载时组件的延时时间。默认值是 200 (毫秒)
//   delay: 2000,
//   // 如果提供了超时时间且组件加载也超时了，
//   // 则使用加载失败时使用的组件。默认值是：`Infinity`
//   timeout: 300
// })

// Vue.component('async-example', AsyncComponent)
// Vue.component('my-test', function() {
//   return {
//     component: import('./test.vue'),
//     // 异步组件加载时使用的组件
//     loading: loading,
//     // 加载失败时使用的组件
//     // error: ErrorComponent,
//     // 展示加载时组件的延时时间。默认值是 200 (毫秒)
//     delay: 20000,
//     // 如果提供了超时时间且组件加载也超时了，
//     // 则使用加载失败时使用的组件。默认值是：`Infinity`
//     timeout: 3000
//   }
// })
// var vm = new Vue({
//   el: '#app',
//   template: '<div id="app"><async-example></async-example></div>',
// })

// import test from './test'
// Vue.component('test', function (resolve, reject) {
//   require.ensure([], function () {
//     resolve(require('./test.vue'));
//   }, 'test');
// })
// var vm = new Vue({
//   el: '#app',
//   components: {
//     test
//   },
//   template: '<div id="app"><test></test></div>'
// })

var vm = new Vue({
  el: '#app',
  router,
  template: '<App/>',
  components: {
    App
  },
})
console.log(vm)