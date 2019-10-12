<template>
  <div>child
    <async :coms="coms"></async>
  </div>
</template>
<script>

import async from './async.js'

export default {
  name: "child1",
  data() {
    return {
      name: ""
    };
  },
  components: {
    async
  },
  watch: {
    $route() {
      this.name = this.$route.name;
    }
  },
  computed: {
    coms: {
      get() {
        if (this.name) return () => import(`./_${this.name}`);
      },
      set() {}
    }
  },
  created() {
    this.name = this.$route.name;
  }
};
</script>