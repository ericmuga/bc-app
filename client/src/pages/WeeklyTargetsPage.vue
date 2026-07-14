<template>
  <div class="wt-page">
    <div class="wt-head">
      <div>
        <h2>Weekly Domestic Sales Targets</h2>
        <p class="sub">Targets in <strong>FCLWHS.FACT_WEEKLYTARGETS</strong>, grain: Company · Customer · Ship-to · Item · Month.</p>
      </div>
      <div class="head-actions">
        <Button icon="pi pi-download" label="Template" size="small" severity="secondary" @click="downloadTemplate" />
        <Button icon="pi pi-sitemap" label="Generate split" size="small" severity="secondary" @click="openSplit" />
        <Button icon="pi pi-upload" label="Upload" size="small" @click="openUpload" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Filters -->
    <div class="wt-filters">
      <div class="f"><label>Month</label>
        <Select v-model="filter.month" :options="months" show-clear placeholder="All months" class="fi" @change="load" /></div>
      <div class="f"><label>Company</label>
        <Select v-model="filter.company" :options="companyOptions" show-clear placeholder="All" class="fi" @change="load" /></div>
      <div class="f"><label>Search</label>
        <InputText v-model="filter.q" placeholder="Customer / item / ship-to…" class="fi" @keyup.enter="load" /></div>
      <div class="f"><label>Group by</label>
        <Select v-model="groupBy" :options="groupOptions" option-label="label" option-value="value" class="fi" /></div>
      <Button icon="pi pi-search" label="Run" size="small" :loading="loading" @click="load" />
      <div class="spacer" />
      <Button icon="pi pi-file-excel" label="Export" size="small" severity="secondary" :disabled="!rows.length" @click="exportView" />
    </div>

    <!-- Totals -->
    <div class="wt-totals">
      <div class="tot"><span class="k">Rows</span><span class="v">{{ view.length.toLocaleString() }}</span></div>
      <div class="tot"><span class="k">Volume (Kgs)</span><span class="v">{{ fmt(totalVol) }}</span></div>
      <div class="tot"><span class="k">Value</span><span class="v">{{ fmt(totalVal) }}</span></div>
    </div>

    <DataTable :value="view" :loading="loading" paginator :rows="25" size="small" responsiveLayout="scroll" class="wt-table">
      <template #empty><div class="empty">No targets for the current filters.</div></template>
      <template v-if="groupBy === 'none'">
        <Column field="MonthNameSorted" header="Month" style="width:90px" sortable />
        <Column field="Company" header="Co." style="width:70px" sortable />
        <Column field="CustomerNo" header="Customer" sortable />
        <Column field="ShipToCode" header="Ship-to" sortable />
        <Column field="ItemNo" header="Item" sortable />
        <Column field="VolTargetKgs" header="Vol (Kg)" sortable class="num"><template #body="{ data }">{{ fmt(data.VolTargetKgs) }}</template></Column>
        <Column field="ValTarget" header="Value" sortable class="num"><template #body="{ data }">{{ fmt(data.ValTarget) }}</template></Column>
      </template>
      <template v-else>
        <Column field="key" :header="groupLabel" sortable />
        <Column field="count" header="Rows" style="width:90px" sortable class="num" />
        <Column field="vol" header="Vol (Kg)" sortable class="num"><template #body="{ data }">{{ fmt(data.vol) }}</template></Column>
        <Column field="val" header="Value" sortable class="num"><template #body="{ data }">{{ fmt(data.val) }}</template></Column>
      </template>
    </DataTable>

    <!-- Split dialog -->
    <Dialog v-model:visible="split.open" modal header="Generate target split" :style="{ width: '620px' }">
      <p class="text-sm muted">Splits bulk volume (Kgs) across the base month's mix, proportional to each Customer · Ship-to · Item. Value is derived from the base month's price per kg. Export = posting group EXPORT (FCL) / BEXPORT (CM).</p>
      <div class="split-grid">
        <div class="f"><label>Base month (mix)</label>
          <Select v-model="split.baseMonth" :options="months" placeholder="Select…" class="fi" /></div>
        <div class="f"><label>Target month</label>
          <InputText v-model="split.targetMonth" placeholder="2026-07" class="fi" /></div>
        <div class="f"><label>Domestic total (Kgs)</label>
          <InputText v-model="split.domesticVol" class="fi" /></div>
        <div class="f"><label>Export total (Kgs)</label>
          <InputText v-model="split.exportVol" class="fi" /></div>
        <div class="f"><label>Export base: BC sales months</label>
          <InputText v-model="split.exportSalesMonths" class="fi" /></div>
      </div>
      <Message v-if="split.error" severity="error" :closable="false">{{ split.error }}</Message>
      <div v-if="split.summary" class="split-summary">
        <div><span class="k">Rows</span> {{ split.summary.rowCount.toLocaleString() }}</div>
        <div><span class="k">Domestic base</span> {{ fmt(split.summary.domesticBaseVol) }} → {{ fmt(split.summary.domesticTargetVol) }} Kg</div>
        <div><span class="k">Export base</span> {{ fmt(split.summary.exportBaseVol) }} → {{ fmt(split.summary.exportTargetVol) }} Kg</div>
        <div><span class="k">Out volume</span> {{ fmt(split.summary.outVol) }} Kg</div>
        <div><span class="k">Out value</span> {{ fmt(split.summary.outVal) }}</div>
        <div v-if="split.summary.exportBaseVol === 0" class="warn"><i class="pi pi-exclamation-triangle" /> Export base is 0 — export customers aren't in the base month, so the export total won't be applied. Domestic split is fine.</div>
      </div>
      <DataTable v-if="split.sample.length" :value="split.sample.slice(0, 30)" size="small" class="up-preview">
        <Column field="Company" header="Co." /><Column field="CustomerNo" header="Cust" />
        <Column field="ShipToCode" header="Ship" /><Column field="ItemNo" header="Item" />
        <Column field="VolTargetKgs" header="Vol"><template #body="{ data }">{{ fmt(data.VolTargetKgs) }}</template></Column>
        <Column field="ValTarget" header="Value"><template #body="{ data }">{{ fmt(data.ValTarget) }}</template></Column>
      </DataTable>
      <template #footer>
        <Button label="Cancel" text @click="split.open = false" />
        <Button label="Preview" icon="pi pi-eye" severity="secondary" :loading="split.busy" @click="runSplit(false)" />
        <Button label="Commit to DB" icon="pi pi-database" :disabled="!split.summary" :loading="split.busy" @click="runSplit(true)" />
      </template>
    </Dialog>

    <!-- Upload dialog -->
    <Dialog v-model:visible="upload.open" modal header="Upload targets" :style="{ width: '760px' }">
      <p class="text-sm muted">Upload an .xlsx/.csv with columns: <code>CustomerNo, ShipToCode, ItemNo, VolTargetKgs, ValTarget, Company, Outlet, MonthNameSorted</code>. WatermarkLoadedAt is set automatically.</p>
      <div class="up-controls">
        <input type="file" accept=".xlsx,.xls,.csv" @change="onFile" />
        <div class="mode">
          <label><input type="radio" value="replace" v-model="upload.mode" /> Replace month(s)</label>
          <label><input type="radio" value="append" v-model="upload.mode" /> Append</label>
        </div>
      </div>
      <Message v-if="upload.error" severity="error" :closable="false">{{ upload.error }}</Message>
      <div v-if="upload.rows.length" class="up-summary">
        Parsed <strong>{{ upload.rows.length.toLocaleString() }}</strong> rows · months:
        <strong>{{ [...new Set(upload.rows.map(r => r.MonthNameSorted).filter(Boolean))].join(', ') || '—' }}</strong>
      </div>
      <DataTable v-if="upload.rows.length" :value="upload.rows.slice(0, 50)" size="small" class="up-preview">
        <Column v-for="c in TARGET_COLS" :key="c" :field="c" :header="c" />
      </DataTable>
      <template #footer>
        <Button label="Cancel" text @click="upload.open = false" />
        <Button :label="upload.mode === 'replace' ? 'Replace & upload' : 'Append & upload'" icon="pi pi-cloud-upload"
                :disabled="!upload.rows.length" :loading="upload.busy" @click="submitUpload" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import * as XLSX from 'xlsx'
import { weeklyTargetsApi } from '@/services/weeklyTargets.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'

const toast = useToast()
const TARGET_COLS = ['CustomerNo', 'ShipToCode', 'ItemNo', 'VolTargetKgs', 'ValTarget', 'Company', 'Outlet', 'MonthNameSorted']
const companyOptions = ['FCL', 'CM', 'FLM', 'RMK']
const groupOptions = [
  { label: 'None (detail)', value: 'none' },
  { label: 'Company', value: 'Company' },
  { label: 'Customer', value: 'CustomerNo' },
  { label: 'Ship-to', value: 'ShipToCode' },
  { label: 'Item', value: 'ItemNo' },
  { label: 'Month', value: 'MonthNameSorted' },
]

const rows = ref([])
const months = ref([])
const loading = ref(false)
const error = ref(null)
const groupBy = ref('none')
const filter = reactive({ month: null, company: null, q: '', limit: 20000 })

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })
const groupLabel = computed(() => groupOptions.find(g => g.value === groupBy.value)?.label || 'Group')

const view = computed(() => {
  if (groupBy.value === 'none') return rows.value
  const map = new Map()
  for (const r of rows.value) {
    const key = r[groupBy.value] ?? '(blank)'
    if (!map.has(key)) map.set(key, { key, count: 0, vol: 0, val: 0 })
    const g = map.get(key); g.count++; g.vol += Number(r.VolTargetKgs || 0); g.val += Number(r.ValTarget || 0)
  }
  return [...map.values()].sort((a, b) => b.val - a.val)
})
const totalVol = computed(() => rows.value.reduce((t, r) => t + Number(r.VolTargetKgs || 0), 0))
const totalVal = computed(() => rows.value.reduce((t, r) => t + Number(r.ValTarget || 0), 0))

async function loadMonths() {
  try { months.value = (await weeklyTargetsApi.months()).data || [] } catch { /* non-fatal */ }
}
async function load() {
  loading.value = true; error.value = null
  try { rows.value = (await weeklyTargetsApi.list(filter)).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

// ── Upload ──
const upload = reactive({ open: false, rows: [], mode: 'replace', busy: false, error: null })
const ALIASES = {
  CustomerNo: ['customerno', 'customer no', 'customer', 'cust no', 'custno'],
  ShipToCode: ['shiptocode', 'ship-to code', 'ship to code', 'shipto', 'ship-to'],
  ItemNo: ['itemno', 'item no', 'item', 'item code'],
  VolTargetKgs: ['voltargetkgs', 'vol target kgs', 'volume', 'vol', 'kgs', 'target kgs'],
  ValTarget: ['valtarget', 'val target', 'value', 'value target', 'target value'],
  Company: ['company', 'co', 'coy'],
  Outlet: ['outlet'],
  MonthNameSorted: ['monthnamesorted', 'month', 'monthname', 'period'],
}
function normalizeRow(raw) {
  const lower = {}
  for (const [k, v] of Object.entries(raw)) lower[String(k).trim().toLowerCase()] = v
  const out = {}
  for (const [col, aliases] of Object.entries(ALIASES)) {
    for (const a of [col.toLowerCase(), ...aliases]) { if (lower[a] !== undefined) { out[col] = lower[a]; break } }
  }
  // Auto-build Outlet if absent
  if (!out.Outlet && out.CustomerNo) out.Outlet = `${out.CustomerNo}_${out.ShipToCode || ''}_${out.Company || ''}`
  return out
}
function openUpload() { upload.open = true; upload.rows = []; upload.error = null }
function onFile(e) {
  const file = e.target.files?.[0]; if (!file) return
  upload.error = null
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
      upload.rows = json.map(normalizeRow).filter(r => r.CustomerNo || r.ItemNo)
      if (!upload.rows.length) upload.error = 'No rows recognised — check the column headers.'
    } catch (err) { upload.error = err.message }
  }
  reader.readAsArrayBuffer(file)
}
async function submitUpload() {
  upload.busy = true; upload.error = null
  try {
    const { data } = await weeklyTargetsApi.upload(upload.rows, upload.mode)
    toast.add({ severity: 'success', summary: 'Uploaded', detail: `${data.inserted} inserted, ${data.deleted} replaced (${data.mode}).`, life: 4000 })
    upload.open = false
    loadMonths(); load()
  } catch (e) { upload.error = e.response?.data?.error || e.message }
  finally { upload.busy = false }
}

// ── Split ──
const split = reactive({ open: false, baseMonth: null, targetMonth: '', domesticVol: '684000', exportVol: '87000', exportSalesMonths: '3', busy: false, error: null, summary: null, sample: [] })
function openSplit() {
  split.open = true; split.error = null; split.summary = null; split.sample = []
  if (!split.baseMonth && months.value.length) split.baseMonth = months.value[0]
}
async function runSplit(commit) {
  split.busy = true; split.error = null
  try {
    const body = { baseMonth: split.baseMonth, targetMonth: split.targetMonth,
      domesticVol: Number(split.domesticVol) || 0, exportVol: Number(split.exportVol) || 0,
      exportSalesMonths: Number(split.exportSalesMonths) || 3, commit }
    const { data } = await weeklyTargetsApi.split(body)
    if (commit) {
      toast.add({ severity: 'success', summary: 'Split written', detail: `${data.inserted} rows into ${data.summary.targetMonth} (${data.deleted} replaced).`, life: 5000 })
      split.open = false; loadMonths(); load()
    } else {
      split.summary = data.summary; split.sample = data.sample || []
    }
  } catch (e) { split.error = e.response?.data?.error || e.message }
  finally { split.busy = false }
}

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([{ CustomerNo: '', ShipToCode: '', ItemNo: '', VolTargetKgs: '', ValTarget: '', Company: '', Outlet: '', MonthNameSorted: '2026-07' }])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Targets')
  XLSX.writeFile(wb, 'weekly-targets-template.xlsx')
}
function exportView() {
  const data = groupBy.value === 'none' ? rows.value : view.value
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Targets')
  XLSX.writeFile(wb, `weekly-targets-${filter.month || 'all'}.xlsx`)
}

loadMonths(); load()
</script>

<style scoped>
.wt-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.wt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.wt-head h2 { margin: 0; font-size: 20px; }
.wt-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; }
.head-actions { display: flex; gap: 8px; }
.wt-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; padding: 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; }
.wt-filters .f { display: flex; flex-direction: column; gap: 3px; }
.wt-filters label { font-size: 11px; font-weight: 600; color: #475467; }
.fi { min-width: 160px; }
.spacer { flex: 1; }
.wt-totals { display: flex; gap: 10px; }
.tot { display: flex; flex-direction: column; padding: 8px 14px; background: #eef2f7; border: 1px solid #dfe4ec; border-radius: 8px; min-width: 130px; }
.tot .k { font-size: 11px; text-transform: uppercase; color: #667085; }
.tot .v { font-size: 17px; font-weight: 800; color: #1e40af; }
.wt-table :deep(.num), .num { text-align: right; font-variant-numeric: tabular-nums; }
.empty { padding: 28px; text-align: center; color: #9ca3af; }
.muted { color: #6b7280; }
.up-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0; }
.up-controls .mode { display: flex; gap: 14px; font-size: 13px; }
.up-summary { margin: 6px 0; font-size: 13px; }
.up-preview { margin-top: 8px; }
.split-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
.split-grid .f { display: flex; flex-direction: column; gap: 3px; }
.split-grid label { font-size: 11px; font-weight: 600; color: #475467; }
.split-summary { display: flex; flex-direction: column; gap: 3px; font-size: 13px; margin: 8px 0; padding: 8px 10px; background: #f8fafc; border-radius: 8px; }
.split-summary .k { display: inline-block; min-width: 130px; color: #667085; }
.split-summary .warn { color: #b45309; margin-top: 4px; }

@media (prefers-color-scheme: dark) {
  .wt-head .sub, .muted { color: #94a3b8; }
  .wt-filters { background: #1a2231; border-color: #2c3a4f; }
  .wt-filters label { color: #cbd5e1; }
  .tot { background: #1f2937; border-color: #2c3a4f; }
  .tot .k { color: #94a3b8; }
  .tot .v { color: #93c5fd; }
}
</style>
