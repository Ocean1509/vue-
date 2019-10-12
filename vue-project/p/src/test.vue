<template>
    <div>
        <a href="#" @click="tot('child1')">child1</a>
        <a href="#" @click="tot('child2')">child2</a>
        <router-view></router-view>
    </div>
</template>
<script>
export default {
    name: 'test',
    methods: {
        tot(params) {
            this.$router.push({ name: params })
        }
    }
}
</script>

