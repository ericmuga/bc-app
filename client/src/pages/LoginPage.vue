<template>
  <div class="login-wrap">
    <div class="login-card bc-card">
      <div class="login-logo">⬡</div>
      <h1 class="login-title">BC Sales Console</h1>
      <p class="login-sub text-muted">Sign in with your domain credentials</p>

      <div class="field">
        <label>Domain username</label>
        <InputText
          v-model="form.username"
          placeholder="jdoe  (not jdoe@domain.com)"
          class="w-full"
          autofocus
          @keyup.enter="submit"
        />
      </div>

      <div class="field">
        <label>Password</label>
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
        label="Sign in with Active Directory"
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
import { useRouter }     from 'vue-router'
import InputText from 'primevue/inputtext'
import Password  from 'primevue/password'
import Button    from 'primevue/button'
import Message   from 'primevue/message'
import { useAuthStore } from '@/stores/auth.js'

const auth    = useAuthStore()
const router  = useRouter()
const loading = ref(false)
const error   = ref('')
const form    = reactive({ username: '', password: '' })

async function submit() {
  error.value   = ''
  loading.value = true
  try {
    await auth.loginAD(form.username, form.password)
    router.push('/')
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

.login-logo  { font-size: 36px; color: var(--bc-primary-light); line-height: 1; }
.login-title { font-size: 22px; font-weight: 700; margin: 0; }
.login-sub   { margin: -8px 0 4px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--bc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
