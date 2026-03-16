import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoicesApi } from '@/services/api.js'

export const useInvoicesStore = defineStore('invoices', () => {
  const list    = ref([])
  const current = ref(null)
  const audit   = ref([])
  const summary = ref([])
  const loading = ref(false)

  async function fetchList(params = {}) {
    loading.value = true
    try {
      const { data } = await invoicesApi.list(params)
      list.value = data
    } finally { loading.value = false }
  }

  async function fetchOne(invoiceNo) {
    loading.value = true
    try {
      const { data } = await invoicesApi.get(invoiceNo)
      current.value = data
      return data
    } finally { loading.value = false }
  }

  async function fetchAudit(invoiceNo) {
    const { data } = await invoicesApi.audit(invoiceNo)
    audit.value = data
    return data
  }

  async function confirm(invoiceNo) {
    const { data } = await invoicesApi.confirm(invoiceNo)
    return data
  }

  async function fetchSummary(params = {}) {
    loading.value = true
    try {
      const { data } = await invoicesApi.summary(params)
      summary.value = data
    } finally { loading.value = false }
  }

  return { list, current, audit, summary, loading, fetchList, fetchOne, fetchAudit, confirm, fetchSummary }
})

