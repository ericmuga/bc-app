<template>
  <div class="login-wrap">
    <div class="login-card bc-card">
      <div class="login-logo">⬡</div>
      <h1 class="login-title">BC Sales Console</h1>
      <p class="login-sub text-muted">Sign in to continue</p>

      <!-- Auth method toggle -->
      <div class="method-toggle">
        <button
          class="method-btn"
          :class="{ active: method === 'local' }"
          @click="method = 'local'; error = ''"
        >
          <i class="pi pi-user" />
          Local
        </button>
        <button
          class="method-btn"
          :class="{ active: method === 'ad' }"
          @click="method = 'ad'; error = ''"
        >
          <i class="pi pi-building" />
          Active Directory
        </button>
      </div>

      <!-- AD hint -->
      <p v-if="method === 'ad'" class="ad-hint text-muted text-sm">
        Use your Windows / domain credentials.
        Enter your username without the domain prefix.
      </p>

      <div class="field">
        <label>{{ method === 'ad' ? 'Domain username' : 'Username' }}</label>
        <InputText
          v-model="form.username"
          :placeholder="method === 'ad' ? 'jdoe  (not jdoe@domain.com)' : 'admin'"
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
        :label="method === 'ad' ? 'Sign in with Active Directory' : 'Sign in'"
        :icon="method === 'ad' ? 'pi pi-building' : 'pi pi-sign-in'"
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
const method  = ref('local')   // 'local' | 'ad'
const loading = ref(false)
const error   = ref('')
const form    = reactive({ username: '', password: '' })

async function submit() {
  error.value   = ''
  loading.value = true
  try {
    if (method.value === 'ad') {
      await auth.loginAD(form.username, form.password)
    } else {
      await auth.login(form.username, form.password)
    }
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

/* Auth method toggle */
.method-toggle {
  display: flex;
  border: 1px solid var(--bc-border);
  border-radius: 8px;
  overflow: hidden;
}
.method-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--bc-text-muted);
  transition: background 0.15s, color 0.15s;
}
.method-btn:hover  { background: var(--bc-surface-raised); color: var(--bc-text); }
.method-btn.active { background: var(--bc-primary); color: #fff; }
.method-btn .pi    { font-size: 13px; }

.ad-hint {
  margin: -6px 0 2px;
  line-height: 1.5;
}

/* Fields */
.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--bc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
