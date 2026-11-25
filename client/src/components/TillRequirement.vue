<template>
  <div v-if="error" class="till-notice" role="alert">
    <p>Could not check your cash till: {{ error }}</p>
    <Button label="Retry" @click="check" />
  </div>
  <div v-else-if="action" class="till-notice" role="alert">
    <h3>{{ action === 'close' ? 'Close your previous cash till' : 'Open today’s cash till' }}</h3>
    <p v-if="action === 'close'">Till {{ session?.sessionNo }} was opened on {{ openedDate }}. Close it, then open a till for today before continuing.</p>
    <p v-else>Your account requires a cash till for today. Open it before continuing.</p>
    <Button v-if="route.path !== '/pos/till'" :label="action === 'close' ? 'Go to Close Till' : 'Go to Open Till'" @click="router.push('/pos/till')" />
  </div>
  <p v-else-if="!checked">Checking cash till…</p>
  <slot v-if="checked && !error && (!action || route.path === '/pos/till')" />
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import api from '@/services/api.js'
import { useAuthStore } from '@/stores/auth.js'
import { isTillExempt } from '../../../shared/tillRequirement.mjs'
const auth = useAuthStore()
const route = useRoute(), router = useRouter()
const checked = ref(false), action = ref(null), session = ref(null), error = ref('')
const openedDate = computed(() => session.value?.openedAt ? new Date(session.value.openedAt).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' }) : '')
let pending = false, timer
async function check() {
  // Subworkers cannot access POS endpoints and never need a cash till.
  if (isTillExempt(auth.user)) {
    action.value = null
    session.value = null
    error.value = ''
    checked.value = true
    return
  }
  if (pending) return
  pending = true
  try {
    const { data } = await api.get('/pos/till/requirement')
    action.value = data.action
    session.value = data.session
    error.value = ''
    checked.value = true
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { pending = false }
}
watch(() => route.fullPath, check)
onMounted(() => {
  check()
  timer = setInterval(check, 60000)
  window.addEventListener('focus', check)
  window.addEventListener('till-changed', check)
})
onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('focus', check)
  window.removeEventListener('till-changed', check)
})
</script>
<style scoped>
.till-notice { margin: 20px; padding: 20px; background: var(--bc-surface-card); border: 2px solid var(--bc-primary); border-radius: 8px; }
</style>
