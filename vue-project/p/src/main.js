// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'

debugger
Vue.component('my-test', {
  template: '<div>{{test}}</div>',
  data () {
    return {
      test: 1212
    }
  }
})
console.log(Vue.component('my-test'))
/* eslint-disable no-new */
var vm = new Vue({
  el: '#app',
  template: '<div id="app"><span>4324324</span><my-test/></div>'
})
console.log(vm)
