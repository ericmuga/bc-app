import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const token      = ref(localStorage.getItem('bc_token') || null)
  const user       = ref(JSON.parse(localStorage.getItem('bc_user') || 'null'))
  const isLoggedIn = computed(() => !!token.value)

  function _persist(data) {
    token.value = data.token
    user.value  = data.user
    localStorage.setItem('bc_token', data.token)
    localStorage.setItem('bc_user',  JSON.stringify(data.user))
  }

  /** Local bcrypt login */
  async function login(username, password) {
    const { data } = await axios.post('/api/auth/login', { username, password })
    _persist(data)
  }

  /** Active Directory login */
  async function loginAD(username, password) {
    const { data } = await axios.post('/api/auth/login-ad', { username, password })
    _persist(data)
  }

  function logout() {
    token.value = null
    user.value  = null
    localStorage.removeItem('bc_token')
    localStorage.removeItem('bc_user')
  }

  return { token, user, isLoggedIn, login, loginAD, logout }
})
