import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const token       = ref(localStorage.getItem('bc_token') || null)
  const user        = ref(JSON.parse(localStorage.getItem('bc_user') || 'null'))
  // Admin-only UI preview: lets a real admin temporarily see the app as
  // another role. The JWT and server-side authorization always remain on
  // the actual `user.role` — this is a client-side layout switch only.
  const impersonatedRole = ref(localStorage.getItem('bc_impersonated_role') || null)

  const isLoggedIn    = computed(() => !!token.value)
  const actualRole    = computed(() => user.value?.role || null)
  const isGlobalAdmin = computed(() => actualRole.value === 'admin')
  const effectiveRole = computed(() =>
    (isGlobalAdmin.value && impersonatedRole.value) || actualRole.value
  )

  function _persist(data) {
    token.value = data.token
    user.value  = data.user
    localStorage.setItem('bc_token', data.token)
    localStorage.setItem('bc_user',  JSON.stringify(data.user))
    // Clear any prior impersonation when a new session starts
    impersonatedRole.value = null
    localStorage.removeItem('bc_impersonated_role')
  }

  async function login(username, password) {
    const { data } = await axios.post('/api/auth/login', { username, password })
    _persist(data)
  }
  async function loginAD(username, password) {
    const { data } = await axios.post('/api/auth/login-ad', { username, password })
    _persist(data)
  }

  function logout() {
    token.value = null
    user.value  = null
    impersonatedRole.value = null
    localStorage.removeItem('bc_token')
    localStorage.removeItem('bc_user')
    localStorage.removeItem('bc_impersonated_role')
  }

  /** Admin-only: pretend to be another role for UI preview. Pass null to clear. */
  function setImpersonatedRole(role) {
    if (!isGlobalAdmin.value) return
    if (role && role !== actualRole.value) {
      impersonatedRole.value = role
      localStorage.setItem('bc_impersonated_role', role)
    } else {
      impersonatedRole.value = null
      localStorage.removeItem('bc_impersonated_role')
    }
  }

  return {
    token, user, isLoggedIn,
    actualRole, effectiveRole, isGlobalAdmin, impersonatedRole,
    login, loginAD, logout,
    setImpersonatedRole,
  }
})
