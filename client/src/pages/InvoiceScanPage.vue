<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">Invoice Scan</h2>
      <p class="text-muted text-sm">Scan barcode or search by invoice number</p>
    </div>

    <!-- Search bar -->
    <div class="bc-card search-bar">
      <InputText
        v-model="query"
        placeholder="Scan or type invoice number…"
        class="search-input"
        autofocus
        @keyup.enter="lookup"
      />
      <Button icon="pi pi-search" label="Find" @click="lookup" :loading="searching" />
      <Button v-if="doc" icon="pi pi-times" text severity="secondary" @click="clear" />
    </div>

    <!-- Skeleton -->
    <div v-if="searching" class="bc-card mt-4">
      <Skeleton height="24px" class="mb-2" />
      <Skeleton height="16px" width="60%" class="mb-4" />
      <Skeleton height="160px" />
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="bc-card mt-4 not-found">
      <i class="pi pi-search-minus" style="font-size:32px;color:var(--bc-text-muted)" />
      <p>No invoice found for <strong>{{ query }}</strong></p>
    </div>

    <!-- Document card -->
    <div v-else-if="doc" class="mt-4">

      <!-- COPY banner -->
      <div v-if="isCopy" class="copy-banner">
        <i class="pi pi-exclamation-triangle" style="font-size:18px;flex-shrink:0" />
        <div>
          <strong>COPY — Already Confirmed</strong>
          <div class="text-sm mt-1">
            Confirmed by <strong>{{ copyDetails?.confirmedBy }}</strong>
            on {{ fmtDate(copyDetails?.confirmedAt) }}. This scan has been logged.
          </div>
        </div>
      </div>

      <div class="bc-card" :class="{ 'card-warning': isCopy }">
        <!-- Header -->
        <div class="doc-header">
          <div>
            <div class="doc-no mono">{{ doc.header.InvoiceNo }}</div>
            <div class="text-muted text-sm">
              Original order: <span class="mono">{{ doc.header.OriginalOrderNo }}</span>
            </div>
            <div class="doc-customer">{{ doc.header.CustomerName }}</div>
            <div class="text-muted text-sm">{{ doc.header.CustomerNo }}</div>
          </div>
          <div class="doc-meta">
            <StatusBadge :status="doc.header.Status" />
            <div class="meta-grid">
              <span class="text-muted text-sm">Invoiced</span>
              <span class="text-sm">{{ fmtDate(doc.header.InvoicedAt) }}</span>
              <span class="text-muted text-sm">E-TIMS No</span>
              <span class="text-sm mono">{{ doc.header.ETIMSInvoiceNo || '—' }}</span>
              <span v-if="doc.header.QRCodeUrl" class="text-muted text-sm">QR Code URL</span>
              <span v-if="doc.header.QRCodeUrl" class="text-sm mono qrcode-url">{{ doc.header.QRCodeUrl }}</span>
              <span class="text-muted text-sm">Salesperson</span>
              <span class="text-sm">{{ doc.header.SalespersonCode || '—' }}</span>
              <span class="text-muted text-sm">Route</span>
              <span class="text-sm">{{ doc.header.RouteCode || '—' }}</span>
              <span class="text-muted text-sm">Sector</span>
              <span class="text-sm">{{ doc.header.SectorCode || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Lines -->
        <div class="mt-4">
          <DocumentLines :lines="doc.lines" />
        </div>

        <!-- Actions -->
        <div class="actions mt-4">
          <Button
            v-if="doc.header.Status !== 'Confirmed'"
            label="Confirm Invoice"
            icon="pi pi-check"
            severity="success"
            :loading="confirming"
            @click="doConfirm"
          />
          <Button
            v-else
            label="Already Confirmed"
            icon="pi pi-lock"
            severity="secondary"
            disabled
          />
          <Button
            label="Audit Trail"
            icon="pi pi-history"
            text severity="secondary"
            @click="toggleAudit"
          />
        </div>

        <AuditLog v-if="showAudit" :log="auditLog" class="mt-4" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button    from 'primevue/button'
import Skeleton  from 'primevue/skeleton'
import DocumentLines from '@/components/base/DocumentLines.vue'
import StatusBadge   from '@/components/base/StatusBadge.vue'
import AuditLog      from '@/components/base/AuditLog.vue'
import { invoicesApi } from '@/services/api.js'
import { useConfirmDocument } from '@/composables/useConfirmDocument.js'
import { watchDebounced }     from '@/composables/useDebounce.js'

const route     = useRoute()
const query     = ref('')
const doc       = ref(null)
const notFound  = ref(false)
const searching = ref(false)
const showAudit = ref(false)

const { confirming, isCopy, copyDetails, auditLog, confirm, loadAudit, reset } =
  useConfirmDocument(
    (no) => invoicesApi.confirm(no),
    (no) => invoicesApi.audit(no),
    'Invoice'
  )

// Auto-trigger lookup 50ms after query changes (supports barcode scanners)
watchDebounced(query, (val) => { if (val.trim()) lookup() }, 50)

onMounted(() => {
  if (route.query.no) {
    query.value = String(route.query.no)
    lookup()
  }
})

async function lookup() {
  const raw = query.value.trim()
  if (!raw) return
  searching.value = true
  notFound.value  = false
  doc.value       = null
  reset()
  try {
    const isUrl = raw.startsWith('http')
    const { data } = isUrl
      ? await invoicesApi.getByQRCode(raw)
      : await invoicesApi.get(raw)
    doc.value = data
    await loadAudit(data.header.InvoiceNo)
  } catch (e) {
    if (e.response?.status === 404) notFound.value = true
  } finally {
    searching.value = false
  }
}

async function doConfirm() {
  const result = await confirm(doc.value.header.InvoiceNo)
  if (result.confirmed) doc.value.header.Status = 'Confirmed'
  if (result.copy)      showAudit.value = true
}

function toggleAudit() {
  showAudit.value = !showAudit.value
  if (showAudit.value && doc.value) loadAudit(doc.value.header.InvoiceNo)
}

function clear() {
  doc.value       = null
  query.value     = ''
  notFound.value  = false
  showAudit.value = false
  reset()
}

const fmtDate = (v) => v ? new Date(v).toLocaleString('en-KE')    : '—'
</script>

<style scoped>
.page-header  { margin-bottom: 20px; }
.page-title   { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
.search-bar   { display: flex; gap: 10px; align-items: center; padding: 14px 16px; }
.search-input { flex: 1; font-size: 15px; }
.not-found    { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px; text-align: center; color: var(--bc-text-muted); }
.copy-banner  { display: flex; align-items: flex-start; gap: 14px; padding: 14px 18px; background: var(--bc-warning-bg); border: 1px solid var(--bc-warning-border); border-radius: 10px; color: var(--bc-warning); margin-bottom: 12px; }
.card-warning { border-color: var(--bc-warning-border) !important; }
.doc-header   { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.doc-no       { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
.doc-customer { font-size: 16px; margin-top: 4px; }
.doc-meta     { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.meta-grid    { display: grid; grid-template-columns: auto auto; gap: 4px 16px; text-align: right; }
.qrcode-url   { word-break: break-all; max-width: 280px; color: var(--bc-text-muted); user-select: all; }
.actions      { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
</style>
