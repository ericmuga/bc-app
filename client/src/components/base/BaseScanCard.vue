<template>
  <div class="scan-card">
    <!-- Search bar -->
    <div class="search-bar">
      <IconField class="search-field">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="docNo"
          :placeholder="placeholder"
          class="w-full"
          size="large"
          autofocus
          @keyup.enter="handleSearch"
        />
      </IconField>
      <Button label="Search" icon="pi pi-search" size="large" @click="handleSearch" :loading="loading" />
      <Button v-if="doc" icon="pi pi-times" size="large" severity="secondary" text @click="handleReset" />
    </div>

    <!-- Error -->
    <Message v-if="error" severity="error" class="mx-4 mb-3" :closable="false">{{ error }}</Message>

    <!-- Skeleton -->
    <div v-if="loading && !doc" class="p-4">
      <Skeleton height="2rem" class="mb-2" />
      <Skeleton height="2rem" class="mb-2" />
      <Skeleton height="10rem" />
    </div>

    <!-- Document card -->
    <div v-if="doc" class="doc-card" :class="{ 'is-copy': isCopy }">

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

      <!-- Header fields (injected by parent) -->
      <div class="header-grid">
        <slot name="header-fields" :header="doc.header" />
        <div class="field">
          <span class="label">Status</span>
          <StatusBadge :status="doc.header.Status" />
        </div>
      </div>

      <!-- Lines table -->
      <div class="lines-wrap">
        <DocumentLines :lines="doc.lines" />
      </div>

      <!-- Audit log -->
      <AuditLog v-if="auditLog.length" :log="auditLog" />

      <!-- Action bar -->
      <div class="action-bar">
        <Button
          v-if="doc.header.Status !== 'Confirmed'"
          label="Confirm"
          icon="pi pi-check"
          severity="success"
          size="large"
          :loading="confirming"
          @click="handleConfirm"
        />
        <Button
          v-else
          label="Already Confirmed"
          icon="pi pi-lock"
          severity="secondary"
          size="large"
          disabled
        />
        <Button
          label="Audit Trail"
          icon="pi pi-history"
          text severity="secondary"
          @click="toggleAudit"
        />
        <slot name="extra-actions" :doc="doc" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import IconField  from 'primevue/iconfield'
import InputIcon  from 'primevue/inputicon'
import InputText  from 'primevue/inputtext'
import Button     from 'primevue/button'
import Message    from 'primevue/message'
import Skeleton   from 'primevue/skeleton'
import StatusBadge   from './StatusBadge.vue'
import DocumentLines from './DocumentLines.vue'
import AuditLog      from './AuditLog.vue'
import { useConfirmDocument } from '@/composables/useConfirmDocument.js'

const props = defineProps({
  getFn:       { type: Function, required: true },
  confirmFn:   { type: Function, required: true },
  auditFn:     { type: Function, required: true },
  docNoField:  { type: String,   required: true },
  placeholder: { type: String,   default: 'Scan or enter document number…' },
  docType:     { type: String,   default: 'Document' },
})

const emit = defineEmits(['confirmed', 'copy-logged'])

const docNo      = ref('')
const doc        = ref(null)
const error      = ref(null)
const loading    = ref(false)
const showAudit  = ref(false)

const { confirming, isCopy, copyDetails, auditLog, confirm, loadAudit, reset } =
  useConfirmDocument(props.confirmFn, props.auditFn, props.docType)

async function handleSearch() {
  const no = docNo.value.trim()
  if (!no) return
  loading.value = true
  error.value   = null
  doc.value     = null
  reset()
  try {
    const { data } = await props.getFn(no)
    doc.value = data
    await loadAudit(no)
  } catch (e) {
    if (e.response?.status === 404) error.value = `"${no}" not found.`
    else error.value = e.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}

async function handleConfirm() {
  const no = doc.value?.header?.[props.docNoField]
  if (!no) return
  const result = await confirm(no)
  if (result.confirmed) {
    doc.value.header.Status = 'Confirmed'
    emit('confirmed', no)
  }
  if (result.copy) {
    showAudit.value = true
    emit('copy-logged', no)
  }
}

function toggleAudit() {
  showAudit.value = !showAudit.value
  if (showAudit.value && doc.value) {
    loadAudit(doc.value.header[props.docNoField])
  }
}

function handleReset() {
  docNo.value     = ''
  doc.value       = null
  error.value     = null
  showAudit.value = false
  reset()
}

const fmtDate = (v) => v ? new Date(v).toLocaleString('en-KE') : '—'
</script>

<style scoped>
.scan-card { border:1px solid var(--bc-border); border-radius:12px; background:var(--bc-surface-card); overflow:hidden; }

.search-bar { display:flex; gap:10px; align-items:center; padding:16px; border-bottom:1px solid var(--bc-border); }
.search-field { flex:1; }

.doc-card.is-copy { border-top:3px solid var(--bc-warning); }

.copy-banner {
  display:flex; align-items:flex-start; gap:14px;
  padding:14px 18px;
  background:var(--bc-warning-bg);
  border-bottom:1px solid var(--bc-warning-border);
  color:var(--bc-warning);
}

.header-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(190px,1fr));
  gap:12px 20px;
  padding:16px 18px;
  border-bottom:1px solid var(--bc-border);
}
.field  { display:flex; flex-direction:column; gap:4px; }
.label  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--bc-text-muted); }

.lines-wrap { padding:0 18px 16px; }

.action-bar {
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
  padding:14px 18px;
  background:var(--bc-surface-raised);
  border-top:1px solid var(--bc-border);
}
</style>
