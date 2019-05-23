// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'

debugger
Vue.component('21', {
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
  template: '<div id="app"><my-test/></div>'
})
console.log(vm)
