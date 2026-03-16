import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ordersApi } from '@/services/api.js'

export const useOrdersStore = defineStore('orders', () => {
  const list    = ref([])
  const current = ref(null)
  const audit   = ref([])
  const summary = ref([])
  const loading = ref(false)

  async function fetchList(params = {}) {
    loading.value = true
    try {
      const { data } = await ordersApi.list(params)
      list.value = data
    } finally { loading.value = false }
  }

  async function fetchOne(orderNo) {
    loading.value = true
    try {
      const { data } = await ordersApi.get(orderNo)
      current.value = data
      return data
    } finally { loading.value = false }
  }

  async function fetchAudit(orderNo) {
    const { data } = await ordersApi.audit(orderNo)
    audit.value = data
    return data
  }

  async function confirm(orderNo) {
    const { data } = await ordersApi.confirm(orderNo)
    return data
  }

  async function fetchSummary(params = {}) {
    loading.value = true
    try {
      const { data } = await ordersApi.summary(params)
      summary.value = data
    } finally { loading.value = false }
  }

  return { list, current, audit, summary, loading, fetchList, fetchOne, fetchAudit, confirm, fetchSummary }
})

