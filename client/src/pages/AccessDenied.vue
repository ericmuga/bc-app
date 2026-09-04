<template>
  <div class="no-access">
    <i class="pi pi-lock" />
    <h2>Access denied</h2>
    <p>Your account does not have access to this page<span v-if="fromPath"> ({{ fromPath }})</span>.</p>
    <p class="hint">If you believe you should have access, ask an administrator to grant your role permission.</p>
    <Button label="Go to my home" icon="pi pi-home" @click="goHome" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
const route = useRoute()
const router = useRouter()
const fromPath = computed(() => route.query.from || '')
function goHome() { router.replace('/') }
</script>

<style scoped>
.no-access { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; text-align:center; padding:40px; color:var(--bc-text, #e2e8f0); background:var(--bc-surface, #151b28); }
.no-access i { font-size:52px; color:#f87171; }
.no-access h2 { margin:0; font-size:22px; font-weight:800; }
.no-access p { margin:0; color:var(--bc-text-muted, #94a3b8); max-width:440px; }
.no-access .hint { font-size:12px; }
</style>
