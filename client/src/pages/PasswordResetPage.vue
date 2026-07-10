<template>
  <div class="reset-wrap">
    <div class="reset-card bc-card">
      <div class="reset-logo">⬡</div>
      <h1 class="reset-title">Password Reset</h1>
      <p class="reset-sub text-muted">
        Self-service AD password reset. Enter your domain username to begin.
      </p>

      <!-- progress dots -->
      <div class="reset-steps">
        <span :class="['step', { active: step >= 1, done: step > 1 }]">1. Identify</span>
        <span :class="['step', { active: step >= 2, done: step > 2 }]">2. Verify</span>
        <span :class="['step', { active: step >= 3, done: step > 3 }]">3. New password</span>
      </div>

      <!-- ── Step 1: username ───────────────────────────────────────────── -->
      <template v-if="step === 1">
        <div class="field">
          <label>Domain username</label>
          <InputText v-model="form.username" placeholder="jdoe" autofocus @keyup.enter="submitRequest" />
        </div>
        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        <Button label="Send verification code" icon="pi pi-send" :loading="loading"
                @click="submitRequest" class="w-full" />
      </template>

      <!-- ── Step 2: OTP verification ───────────────────────────────────── -->
      <template v-else-if="step === 2">
        <p class="text-muted text-sm reset-blurb">
          If your account is eligible, a verification code has been sent.
          <template v-if="challengeInfo?.tier === 'privileged'">
            <br /><strong>This account requires dual-channel verification.</strong>
            You must enter the code sent to your email AND the code sent to your phone.
          </template>
        </p>

        <!-- Email OTP -->
        <div v-if="challengeInfo?.channels?.email" class="otp-block">
          <label>
            Email code
            <span class="text-muted text-sm">→ {{ challengeInfo.channels.email.masked }}</span>
            <span v-if="verified.email" class="pr-ok-pill">✓ verified</span>
          </label>
          <div class="otp-row">
            <InputText v-model="form.emailOtp" :disabled="verified.email" maxlength="10" inputmode="numeric"
                       placeholder="••••••" @keyup.enter="verifyChannel('email')" />
            <Button v-if="!verified.email" label="Verify" icon="pi pi-check" :loading="verifying.email"
                    @click="verifyChannel('email')" />
          </div>
        </div>

        <!-- SMS OTP -->
        <div v-if="challengeInfo?.channels?.sms" class="otp-block">
          <label>
            SMS code
            <span class="text-muted text-sm">→ {{ challengeInfo.channels.sms.masked }}</span>
            <span v-if="verified.sms" class="pr-ok-pill">✓ verified</span>
          </label>
          <div class="otp-row">
            <InputText v-model="form.smsOtp" :disabled="verified.sms" maxlength="10" inputmode="numeric"
                       placeholder="••••••" @keyup.enter="verifyChannel('sms')" />
            <Button v-if="!verified.sms" label="Verify" icon="pi pi-check" :loading="verifying.sms"
                    @click="verifyChannel('sms')" />
          </div>
        </div>

        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

        <div class="reset-actions">
          <Button label="Resend codes" icon="pi pi-refresh" text :disabled="resendDisabled" @click="resend" />
          <span v-if="resendCountdown > 0" class="text-muted text-sm">resend in {{ resendCountdown }}s</span>
          <Button label="Start over" icon="pi pi-times" text severity="secondary" @click="reset" />
        </div>
      </template>

      <!-- ── Step 3: new password ───────────────────────────────────────── -->
      <template v-else-if="step === 3">
        <p class="text-muted text-sm reset-blurb">
          Choose a new password. It must meet the domain policy: minimum 8 characters,
          uppercase, lowercase, digit and symbol; must not contain your username.
        </p>
        <div class="field">
          <label>New password</label>
          <Password v-model="form.newPassword" toggle-mask :feedback="true" :strongRegex="strongRegex" />
        </div>
        <div class="field">
          <label>Confirm new password</label>
          <Password v-model="form.confirmPassword" toggle-mask :feedback="false" @keyup.enter="submitComplete" />
        </div>
        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        <Button label="Reset password" icon="pi pi-lock-open" :loading="loading"
                @click="submitComplete" class="w-full" />
      </template>

      <!-- ── Step 4: success ────────────────────────────────────────────── -->
      <template v-else-if="step === 4">
        <Message severity="success" :closable="false">
          Your password has been reset successfully. You may now sign in with your new password.
        </Message>
        <Button label="Go to sign in" icon="pi pi-sign-in" class="w-full" @click="goLogin" />
      </template>

      <div class="reset-footer">
        <RouterLink to="/login" class="link">Back to sign in</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Password  from 'primevue/password'
import Button    from 'primevue/button'
import Message   from 'primevue/message'
import { passwordResetApi } from '@/services/api.js'

const router = useRouter()

const step    = ref(1)
const loading = ref(false)
const error   = ref('')

const form = reactive({
  username: '',
  emailOtp: '',
  smsOtp:   '',
  newPassword: '',
  confirmPassword: '',
})

const challengeInfo = ref(null)   // { challengeId, tier, channels: { email, sms }, expiresInMinutes }
const verified      = reactive({ email: false, sms: false })
const verifying     = reactive({ email: false, sms: false })
const resetToken    = ref('')

const resendCountdown = ref(0)
let   resendTimer     = null

const resendDisabled = computed(() => resendCountdown.value > 0)

// At least: 8 chars, upper, lower, digit, symbol — PrimeVue Password component
// uses this regex for the "strong" indicator
const strongRegex = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$'

function startResendCountdown(sec = 60) {
  resendCountdown.value = sec
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCountdown.value -= 1
    if (resendCountdown.value <= 0) { clearInterval(resendTimer); resendTimer = null }
  }, 1000)
}
onUnmounted(() => { if (resendTimer) clearInterval(resendTimer) })

async function submitRequest() {
  error.value = ''
  const u = form.username.trim()
  if (!u) { error.value = 'Username is required'; return }
  loading.value = true
  try {
    const { data } = await passwordResetApi.request(u)
    // Server always replies generically. If challengeId is present, the account
    // is eligible; otherwise the user still sees a "code sent" message.
    if (data?.challengeId) {
      challengeInfo.value = data
      step.value = 2
      startResendCountdown(60)
    } else {
      // Show the generic message and stay on step 1 so we don't expose
      // whether the account was eligible. But we also need to give the user
      // a path forward — show a banner that says "If eligible, check inbox".
      error.value = data?.message || 'If the account is eligible, a verification code will be sent.'
    }
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.message || 'Unable to start reset'
  } finally {
    loading.value = false
  }
}

async function verifyChannel(channel) {
  error.value = ''
  const otp = channel === 'email' ? form.emailOtp : form.smsOtp
  if (!otp?.trim()) { error.value = 'Enter the code first'; return }
  verifying[channel] = true
  try {
    const { data } = await passwordResetApi.verifyOtp({
      challengeId: challengeInfo.value.challengeId,
      channel,
      otp: otp.trim(),
    })
    if (data.status === 'ready') {
      verified[channel] = true
      resetToken.value = data.resetToken
      step.value = 3
    } else if (data.status === 'need-more') {
      verified.email = Boolean(data.verified?.email)
      verified.sms   = Boolean(data.verified?.sms)
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Verification failed'
  } finally {
    verifying[channel] = false
  }
}

async function resend() {
  error.value = ''
  if (resendDisabled.value) return
  const channels = challengeInfo.value?.channels
  const channel = channels?.email && channels?.sms ? 'both' : (channels?.email ? 'email' : 'sms')
  try {
    const { data } = await passwordResetApi.resendOtp({
      challengeId: challengeInfo.value.challengeId,
      channel,
    })
    startResendCountdown(data?.cooldownSeconds || 60)
  } catch (e) {
    error.value = e.response?.data?.error || 'Unable to resend code'
  }
}

async function submitComplete() {
  error.value = ''
  if (!form.newPassword || form.newPassword !== form.confirmPassword) {
    error.value = 'Passwords do not match'; return
  }
  loading.value = true
  try {
    await passwordResetApi.complete({
      resetToken: resetToken.value,
      newPassword: form.newPassword,
    })
    step.value = 4
  } catch (e) {
    error.value = e.response?.data?.error || 'Password reset failed'
  } finally {
    loading.value = false
  }
}

function reset() {
  step.value = 1
  error.value = ''
  challengeInfo.value = null
  resetToken.value = ''
  verified.email = false; verified.sms = false
  form.emailOtp = ''; form.smsOtp = ''
  form.newPassword = ''; form.confirmPassword = ''
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null }
  resendCountdown.value = 0
}

function goLogin() { router.push('/login') }
</script>

<style scoped>
.reset-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bc-surface);
}
.reset-card {
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.reset-logo  { font-size: 36px; color: var(--bc-primary-light); line-height: 1; }
.reset-title { font-size: 22px; font-weight: 700; margin: 0; }
.reset-sub   { margin: -8px 0 4px; }
.reset-blurb { margin: 0 0 4px; }

.reset-steps { display:flex; justify-content:space-between; font-size:11px; color:var(--bc-text-muted); margin-bottom:4px; }
.reset-steps .step { padding:2px 6px; border-radius:8px; }
.reset-steps .step.active { color: var(--bc-text); font-weight:600; }
.reset-steps .step.done   { color: var(--bc-primary-light); }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--bc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display:flex; align-items:center; gap:8px;
}

.otp-block { display:flex; flex-direction:column; gap:6px; padding:10px; border:1px solid var(--bc-border,#e4e7ec); border-radius:8px; }
.otp-row   { display:flex; gap:8px; align-items:center; }
.otp-row > .p-inputtext { flex:1; font-family:monospace; letter-spacing:.4em; }

.pr-ok-pill { font-size:10px; background:#d1fae5; color:#065f46; padding:1px 8px; border-radius:8px; font-weight:700; margin-left:auto; }

.reset-actions { display:flex; align-items:center; gap:10px; justify-content:flex-end; }
.reset-footer  { display:flex; justify-content:center; margin-top:8px; }
.link { color: var(--bc-primary-light); text-decoration:none; font-size:13px; }
.link:hover { text-decoration:underline; }
</style>
