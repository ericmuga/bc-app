<template>
  <div class="ld-page">
    <div class="ld-head">
      <div>
        <h2>Legacy Downloads</h2>
        <p class="sub">Read-only exports from the <strong>legacy Business Central</strong> databases. Pick a source and dataset, filter, preview, then download CSV or Excel.</p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Source / dataset / filters -->
    <div class="ld-filters">
      <div class="f"><label>Source</label>
        <Select v-model="source" :options="sourceOptions" option-label="label" option-value="value"
          placeholder="Select source…" class="fi" @change="onSourceChange" /></div>
      <div class="f"><label>Dataset</label>
        <Select v-model="dataset" :options="datasetOptions" option-label="label" option-value="value"
          placeholder="Select dataset…" class="fi" :disabled="!source" @change="onDatasetChange" /></div>

      <div class="f"><label>Posting date from</label>
        <DatePicker v-model="filters.dateFrom" dateFormat="yy-mm-dd" showIcon iconDisplay="input" class="fi" /></div>
      <div class="f"><label>Posting date to</label>
        <DatePicker v-model="filters.dateTo" dateFormat="yy-mm-dd" showIcon iconDisplay="input" class="fi" /></div>

      <!-- dataset-specific filters, driven by the registry -->
      <div class="f" v-for="ff in datasetFilters" :key="ff.key">
        <label>{{ ff.label }}</label>
        <InputText v-model="filters[ff.key]" :placeholder="ff.label" class="fi sm" @keyup.enter="run(1)" />
      </div>

      <!-- Detail / Summary toggle (only for datasets that declare a summary) -->
      <div class="f" v-if="selectedDataset?.hasSummary">
        <label>View</label>
        <div class="mode-toggle">
          <button class="mt-btn" :class="{ active: mode === 'detail' }" @click="setMode('detail')">Detail</button>
          <button class="mt-btn" :class="{ active: mode === 'summary' }" @click="setMode('summary')">{{ selectedDataset.summaryLabel || 'Summary' }}</button>
        </div>
      </div>

      <Button icon="pi pi-search" label="Run" size="small" :loading="loading" :disabled="!dataset" @click="run(1)" />
      <div class="spacer" />
      <span v-if="hasRun" class="dl-mode-tag">{{ mode === 'summary' ? (selectedDataset?.summaryLabel || 'Summary') : 'Detail' }}</span>
      <Button icon="pi pi-file" label="CSV" size="small" severity="secondary" :disabled="!hasRun || downloading" :loading="downloading === 'csv'" @click="download('csv')" />
      <Button icon="pi pi-file-excel" label="Excel" size="small" severity="secondary" :disabled="!hasRun || downloading" :loading="downloading === 'xlsx'" @click="download('xlsx')" />
    </div>

    <div v-if="!hasRun" class="run-prompt">
      <i class="pi pi-filter" /> Choose a source and dataset, set your filters, then click <strong>Run</strong>.
    </div>

    <div v-if="hasRun" class="ld-totals">
      <div class="tot"><span class="k">Matching rows</span><span class="v">{{ total.toLocaleString() }}</span></div>
      <div class="tot"><span class="k">Page</span><span class="v">{{ page }} / {{ pageCount }}</span></div>
    </div>
    <p v-if="truncNote" class="cap-note"><i class="pi pi-exclamation-triangle" /> {{ truncNote }}</p>

    <DataTable v-if="hasRun" :value="rows" :loading="loading" lazy paginator
      :rows="pageSize" :totalRecords="total" :first="(page - 1) * pageSize"
      :rowsPerPageOptions="[25, 50, 100, 200]" size="small" scrollable scrollHeight="flex"
      class="ld-table" @page="onPage">
      <template #empty><div class="empty">No rows for the current filters.</div></template>
      <Column v-for="c in columns" :key="c" :field="c" :header="c" sortable />
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { legacyReportsApi } from '@/services/legacyReports.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'

const toast = useToast()

const catalogue = ref([])         // [{ key, label, datasets: [...] }]
const source = ref(null)
const dataset = ref(null)
const filters = reactive({ dateFrom: null, dateTo: null, documentNo: '', vendorNo: '', customerNo: '', glAccountNo: '', sourceCode: '' })

const mode = ref('detail')
const rows = ref([])
const columns = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const downloading = ref(null)
const hasRun = ref(false)
const error = ref(null)
const truncNote = ref(null)

const sourceOptions = computed(() => catalogue.value.map((s) => ({ label: s.label, value: s.key })))
const selectedSource = computed(() => catalogue.value.find((s) => s.key === source.value) || null)
const datasetOptions = computed(() => (selectedSource.value?.datasets || []).map((d) => ({ label: d.label, value: d.key })))
const selectedDataset = computed(() => selectedSource.value?.datasets.find((d) => d.key === dataset.value) || null)
const datasetFilters = computed(() => selectedDataset.value?.filters || [])
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function resetResults() {
  hasRun.value = false
  rows.value = []
  columns.value = []
  total.value = 0
  page.value = 1
  truncNote.value = null
}
function onSourceChange() { dataset.value = null; mode.value = 'detail'; resetResults() }
function onDatasetChange() { mode.value = 'detail'; resetResults() }
function setMode(m) {
  if (mode.value === m) return
  mode.value = m
  if (hasRun.value) run(1)
}

function ymd(d) {
  if (!d) return undefined
  if (typeof d === 'string') return d
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function filterPayload() {
  return {
    dateFrom: ymd(filters.dateFrom),
    dateTo: ymd(filters.dateTo),
    documentNo: filters.documentNo,
    vendorNo: filters.vendorNo,
    customerNo: filters.customerNo,
    glAccountNo: filters.glAccountNo,
    sourceCode: filters.sourceCode,
  }
}

async function run(toPage = 1) {
  if (!source.value || !dataset.value) return
  loading.value = true; error.value = null; truncNote.value = null
  try {
    const { data } = await legacyReportsApi.run({
      source: source.value, dataset: dataset.value,
      filters: filterPayload(), page: toPage, pageSize: pageSize.value, mode: mode.value,
    })
    rows.value = data.rows || []
    columns.value = data.columns || (rows.value[0] ? Object.keys(rows.value[0]) : [])
    total.value = data.total || 0
    page.value = data.page || toPage
    pageSize.value = data.pageSize || pageSize.value
    hasRun.value = true
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}

function onPage(e) {
  pageSize.value = e.rows
  run(e.page + 1)
}

async function download(format) {
  if (!source.value || !dataset.value) return
  downloading.value = format; error.value = null
  try {
    const res = await legacyReportsApi.download({
      source: source.value, dataset: dataset.value, filters: filterPayload(), format, mode: mode.value,
    })
    const trunc = res.headers['x-truncated']
    if (trunc) {
      const cap = (res.headers['x-total-count'] || '?')
      truncNote.value = `Download was capped — matched ${Number(cap).toLocaleString()} rows but only the first rows were exported (${trunc}). Narrow your filters for the full set.`
      toast.add({ severity: 'warn', summary: 'Export truncated', detail: truncNote.value, life: 8000 })
    }
    const blob = new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `legacy-${source.value}-${dataset.value}-${mode.value}-${ymd(new Date())}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    // error responses come back as a Blob when responseType is blob
    let msg = e.message
    try { if (e.response?.data instanceof Blob) msg = JSON.parse(await e.response.data.text()).error } catch { /* ignore */ }
    error.value = msg
  } finally {
    downloading.value = null
  }
}

async function loadCatalogue() {
  try {
    const { data } = await legacyReportsApi.sources()
    catalogue.value = data.sources || []
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  }
}

loadCatalogue()
</script>

<style scoped>
/* Solid theme surface behind the (transparent) table cells + matching text token,
   exactly like the Sales Reports page — without it the transparent cells sit on the
   white content area while text uses the light --bc-text token, masking the text. */
.ld-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; height: 100%; background: var(--bc-surface); color: var(--bc-text); }
.ld-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.ld-head h2 { margin: 0; font-size: 20px; }
.ld-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; }
.ld-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; padding: 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; }
.ld-filters .f { display: flex; flex-direction: column; gap: 3px; }
.ld-filters label { font-size: 11px; font-weight: 600; color: #475467; }
.fi { min-width: 170px; }
.fi.sm { min-width: 130px; }
.spacer { flex: 1; }
.ld-totals { display: flex; gap: 10px; }
.tot { display: flex; flex-direction: column; padding: 8px 14px; background: #eef2f7; border: 1px solid #dfe4ec; border-radius: 8px; min-width: 130px; }
.tot .k { font-size: 11px; text-transform: uppercase; color: #667085; }
.tot .v { font-size: 17px; font-weight: 800; color: #1e40af; }
.cap-note { margin: -4px 0 0; font-size: 12px; color: #b45309; }
.run-prompt { padding: 28px; text-align: center; color: #6b7280; background: #f8fafc; border: 1px dashed #d1d5db; border-radius: 10px; }
.ld-table { flex: 1; min-height: 0; }
.empty { padding: 28px; text-align: center; color: var(--bc-text-muted); }

/* Detail / Summary segmented toggle (mirrors BcReports view-toggle) */
.mode-toggle { display: inline-flex; border: 1px solid var(--bc-border); border-radius: 8px; overflow: hidden; }
.mt-btn { border: none; background: var(--bc-surface-card); color: var(--bc-text-muted); font-size: 12px; font-weight: 700; padding: 7px 12px; cursor: pointer; }
.mt-btn + .mt-btn { border-left: 1px solid var(--bc-border); }
.mt-btn.active { background: var(--bc-primary); color: #fff; }
.dl-mode-tag { align-self: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--bc-text-muted); padding: 0 4px; }

/* ── Table theming — mirror the Sales Reports (/bc-reports) DataTable so the two
      pages read as one high-contrast dark surface. Uses the shared --bc-* tokens
      defined globally in assets/main.css. ─────────────────────────────────────── */
.ld-table :deep(.p-datatable),
.ld-table :deep(.p-datatable-table),
.ld-table :deep(.p-datatable-tbody > tr) { background: transparent !important; }
.ld-table :deep(.p-datatable-tbody > tr > td) { color: var(--bc-text) !important; background: transparent !important; padding: 6px 10px !important; border-color: var(--bc-border) !important; }
.ld-table :deep(.p-datatable-tbody > tr:nth-child(even) > td) { background: rgba(255,255,255,0.03) !important; }
.ld-table :deep(.p-datatable-tbody > tr:hover > td) { background: rgba(255,255,255,0.06) !important; }
.ld-table :deep(.p-datatable-thead > tr > th) { background: var(--bc-surface-raised) !important; color: var(--bc-text) !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .04em; padding: 8px 10px !important; border-color: var(--bc-border) !important; }
.ld-table :deep(.p-datatable-header),
.ld-table :deep(.p-paginator) { background: var(--bc-surface-card) !important; color: var(--bc-text) !important; border-color: var(--bc-border) !important; }

@media (prefers-color-scheme: dark) {
  .ld-head .sub { color: #94a3b8; }
  .ld-filters { background: #1a2231; border-color: #2c3a4f; }
  .ld-filters label { color: #cbd5e1; }
  .tot { background: #1f2937; border-color: #2c3a4f; }
  .tot .k { color: #94a3b8; }
  .tot .v { color: #93c5fd; }
}
</style>
