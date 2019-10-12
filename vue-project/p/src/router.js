import Vue from 'vue';
import Router from 'vue-router';
import test from './test.vue'
import child from './child.vue'

Vue.use(Router);


export default new Router({
  routes: [{
    path: '/',
    component: test,
    children: [{
      path: 'child1',
      name: 'child1',
      component: child
    }, {
      path: 'child2',
      name: 'child2',
      component: child
    }]
  }]
});
