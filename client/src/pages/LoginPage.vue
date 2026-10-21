<template>
  <div class="login-wrap">
    <div class="login-card bc-card">
      <img class="login-logo" src="/branding/bc-console.png" alt="BC Console commerce and analytics" width="88" height="88" />
      <h1 class="login-title">BC Console</h1>
      <p class="login-sub text-muted">{{ workerMode ? 'Use the worker code and passcode set by your dispatch supervisor' : 'Sign in with your domain credentials' }}</p><label><input type="checkbox" v-model="workerMode" /> Login as subworker</label>

      <div class="field">
        <label>{{ workerMode ? 'Worker code' : 'Domain username' }}</label>
        <InputText
          v-model="form.username"
          :placeholder="workerMode ? 'Worker code' : 'Username or user@domain'"
          class="w-full"
          autofocus
          @keyup.enter="submit"
        />
      </div>

      <div class="field">
        <label>{{ workerMode ? 'Passcode' : 'Password' }}</label>
        <Password
          v-model="form.password"
          placeholder="••••••"
          class="w-full"
          :feedback="false"
          toggle-mask
          @keyup.enter="submit"
        />
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <Button
        :label="workerMode ? 'Login as subworker' : 'Sign in with Active Directory'"
        icon="pi pi-building"
        class="w-full"
        :loading="loading"
        @click="submit"
      />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute }     from 'vue-router'
import InputText from 'primevue/inputtext'
import Password  from 'primevue/password'
import Button    from 'primevue/button'
import Message   from 'primevue/message'
import { useAuthStore } from '@/stores/auth.js'
import {workerLanding} from '../../../shared/dispatchWorkerRoutes.mjs'

const auth    = useAuthStore()
const router  = useRouter()
const loading = ref(false)
const error   = ref(''), workerMode=ref(useRoute().query.worker==='1')
const form    = reactive({ username: '', password: '' })

async function submit() {
  if(loading.value)return
  error.value   = ''
  loading.value = true
  try {
    if(workerMode.value)await auth.loginWorker(form.username,form.password)
    else await auth.loginAD(form.username, form.password)
    await router.replace(auth.user?.role==='dispatch-worker' ? workerLanding(auth.user) : '/')
  } catch (e) {
    error.value = e.response?.data?.error || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bc-surface);
}

.login-card {
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-logo  { align-self: center; display: block; width: 88px; height: 88px; object-fit: contain; }
.login-title { text-align: center; font-size: 22px; font-weight: 700; margin: 0; }
.login-sub   { text-align: center; margin: -8px 0 4px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--bc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
