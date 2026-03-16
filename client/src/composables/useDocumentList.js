/**
 * composables/useDocumentList.js
 * Shared filter + load state for Orders and Invoices list pages.
 */
import { ref, reactive } from 'vue'

const toISO = (v) => {
  if (!v) return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return v
}

export function useDocumentList(listFn) {
  const rows    = ref([])
  const loading = ref(false)
  const error   = ref(null)
  const filters = reactive({ q: '', dateFrom: null, dateTo: null, status: '' })

  async function load(extra = {}) {
    loading.value = true
    error.value   = null
    try {
      const params = {}
      if (filters.q)        params.q        = filters.q
      if (filters.dateFrom) params.dateFrom  = toISO(filters.dateFrom)
      if (filters.dateTo)   params.dateTo    = toISO(filters.dateTo)
      if (filters.status)   params.status    = filters.status
      Object.assign(params, extra)

      const { data } = await listFn(params)
      rows.value = data
    } catch (err) {
      error.value = err.response?.data?.error || err.message
    } finally {
      loading.value = false
    }
  }

  function reset() {
    filters.q        = ''
    filters.dateFrom = null
    filters.dateTo   = null
    filters.status   = ''
    load()
  }

  return { rows, loading, error, filters, load, reset }
}
