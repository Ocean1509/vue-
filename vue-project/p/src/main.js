// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import test from './test'


console.log(test)
debugger

Vue.component('my-test', {
  template: '<div>{{test}}</div>',
  data () {
    return {
      test: 1212
    }
  }
})
// console.log(Vue.component('my-test'))
/* eslint-disable no-new */
var vm = new Vue({
  el: '#app',
  components: {
    test
  },
  template: '<div id="app"><span>4324324</span><test><test/></div>'
})
console.log(vm)
