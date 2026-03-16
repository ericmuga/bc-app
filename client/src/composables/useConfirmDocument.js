/**
 * composables/useConfirmDocument.js
 *
 * Shared confirm / copy-detection flow used by all scan pages and BaseScanCard.
 * Both Order and Invoice scanning use this — zero duplication.
 */
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'

export function useConfirmDocument(confirmFn, auditFn, docType = 'Document') {
  const toast        = useToast()
  const confirming   = ref(false)
  const isCopy       = ref(false)
  const copyDetails  = ref(null)
  const auditLog     = ref([])

  async function confirm(docNo) {
    confirming.value  = true
    isCopy.value      = false
    copyDetails.value = null
    try {
      await confirmFn(docNo)
      toast.add({
        severity: 'success',
        summary:  `${docType} Confirmed`,
        detail:   `${docNo} confirmed successfully.`,
        life:     4000,
      })
      return { confirmed: true, copy: false }
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'ALREADY_CONFIRMED') {
        isCopy.value      = true
        copyDetails.value = { confirmedAt: data.confirmedAt, confirmedBy: data.confirmedBy }
        toast.add({
          severity: 'warn',
          summary:  'Duplicate Scan — COPY',
          detail:   `${docNo} was already confirmed by ${data.confirmedBy}.`,
          life:     6000,
        })
        await loadAudit(docNo)
        return { confirmed: false, copy: true }
      }
      toast.add({
        severity: 'error',
        summary:  'Confirm Failed',
        detail:   data?.error || err.message,
        life:     5000,
      })
      return { confirmed: false, copy: false }
    } finally {
      confirming.value = false
    }
  }

  async function loadAudit(docNo) {
    try {
      const { data } = await auditFn(docNo)
      auditLog.value = data
    } catch {
      auditLog.value = []
    }
  }

  /** Reset all state — call this when clearing a search */
  function reset() {
    isCopy.value      = false
    copyDetails.value = null
    auditLog.value    = []
    confirming.value  = false
  }

  return { confirming, isCopy, copyDetails, auditLog, confirm, loadAudit, reset }
}
