<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Kitchen Stock Take</h2>
        <p class="text-muted text-sm">Count raw materials and finished cooked products. Open a take for a date range, enter physical counts, then submit for a manager to approve &amp; post the variance.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="New Stock Take" icon="pi pi-plus" @click="newTakeVisible=true" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <DataTable :value="takes" dataKey="StockTakeId" size="small" :loading="loading"
      selection-mode="single" @row-click="openTake" responsive-layout="scroll">
      <Column field="StockTakeNo" header="No"       style="width:160px" />
      <Column field="ShopCode"    header="Shop"     style="width:90px" />
      <Column field="DateFrom"    header="From"     style="width:120px"><template #body="{data}">{{ fmtDate(data.DateFrom) }}</template></Column>
      <Column field="DateTo"      header="To"       style="width:120px"><template #body="{data}">{{ fmtDate(data.DateTo) }}</template></Column>
      <Column field="LineCount"   header="Items"    style="width:70px;text-align:right" />
      <Column field="Status" header="Status" style="width:100px">
        <template #body="{ data }"><Tag :value="data.Status" :severity="statusSeverity(data.Status)" /></template>
      </Column>
      <Column field="CreatedAt" header="Created" style="min-width:140px">
        <template #body="{ data }">{{ fmtTime(data.CreatedAt) }}</template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="newTakeVisible" header="New Kitchen Stock Take" :modal="true" :style="{ width:'420px' }" class="st-dark-dialog">
      <p class="text-muted text-sm" style="margin:0 0 10px">Lines are limited to recipe items — raw materials and finished cooked products.</p>
      <div class="form-row">
        <label>From</label>
        <DatePicker v-model="newDateFrom" date-format="yy-mm-dd" fluid />
      </div>
      <div class="form-row">
        <label>To</label>
        <DatePicker v-model="newDateTo" date-format="yy-mm-dd" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="newTakeVisible=false" />
        <Button label="Create" icon="pi pi-check" :loading="creating" @click="createTake" />
      </template>
    </Dialog>

    <Dialog v-model:visible="editorVisible" :header="editorHeader" :modal="true" :style="{ width:'1100px' }" class="st-dark-dialog">
      <div v-if="current" class="editor">
        <div class="editor-meta">
          <span><strong>{{ current.stockTakeNo }}</strong> · {{ fmtDate(current.dateFrom) }} → {{ fmtDate(current.dateTo) }}</span>
          <Tag :value="current.status" :severity="statusSeverity(current.status)" />
        </div>

        <DataTable :value="current.lines" size="small" responsive-layout="scroll" :scrollable="true" scrollHeight="500px">
          <Column field="itemNo" header="No" style="width:90px;min-width:90px" />
          <Column field="description" header="Description" style="min-width:180px" />
          <Column header="Expected" style="width:90px;text-align:right">
            <template #body="{ data }"><strong>{{ n(data.expectedStock) }}</strong></template>
          </Column>
          <Column header="Physical" style="width:110px">
            <template #body="{ data }">
              <input v-if="editable" type="number" step="0.01"
                v-model.number="data.physicalStock" @blur="persistLine(data)" class="line-input" />
              <span v-else>{{ data.physicalStock == null ? '—' : n(data.physicalStock) }}</span>
            </template>
          </Column>
          <Column header="Variance" style="width:90px;text-align:right">
            <template #body="{ data }">
              <span :class="varianceClass(data)">{{ data.physicalStock == null ? '—' : n(computeVariance(data)) }}</span>
            </template>
          </Column>
          <Column header="Comments" style="min-width:160px">
            <template #body="{ data }">
              <input v-if="editable" type="text" v-model="data.comments" @blur="persistLine(data)" class="line-input" placeholder="Optional…" />
              <span v-else>{{ data.comments }}</span>
            </template>
          </Column>
        </DataTable>
      </div>

      <template #footer>
        <Button label="Close" text @click="editorVisible=false" />
        <Button v-if="editable" label="Submit for approval" icon="pi pi-send" severity="info"
                :loading="acting" @click="submitForApproval" />
        <span v-else-if="current?.status==='pending-approval'" class="text-muted text-sm">Waiting for a manager to approve &amp; post.</span>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button    from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column    from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import Tag       from 'primevue/tag'
import Dialog    from 'primevue/dialog'
import Message   from 'primevue/message'
import { stockApi } from '@/services/pos.js'

const takes = ref([]); const loading = ref(false); const error = ref('')
const newTakeVisible = ref(false); const editorVisible = ref(false)
const current = ref(null); const acting = ref(false); const creating = ref(false)

const today = new Date()
const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
const newDateFrom = ref(weekAgo); const newDateTo = ref(today)

const editable     = computed(() => current.value?.status === 'open')
const editorHeader = computed(() => current.value ? `Stock Take ${current.value.stockTakeNo}` : 'Stock Take')

async function load() {
  loading.value = true; error.value = ''
  try { takes.value = (await stockApi.listTakes()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { loading.value = false }
}
function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
async function createTake() {
  creating.value = true; error.value = ''
  try {
    const { data } = await stockApi.createTake({
      dateFrom: isoDate(newDateFrom.value), dateTo: isoDate(newDateTo.value), itemScope: 'bom',
    })
    const id = data.StockTakeId || data.stockTakeId
    current.value = (await stockApi.getTake(id)).data
    newTakeVisible.value = false; editorVisible.value = true
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { creating.value = false }
}
async function openTake(e) {
  try { current.value = (await stockApi.getTake(e.data.StockTakeId)).data; editorVisible.value = true }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
}
function computeVariance(line) {
  if (line.physicalStock == null) return null
  return Number(line.physicalStock) - Number(line.expectedStock)
}
function varianceClass(line) {
  const v = computeVariance(line)
  if (v == null || v === 0) return 'num'
  return v > 0 ? 'num pos' : 'num neg'
}
let saveTimer = null
function persistLine(line) {
  if (!editable.value || !line.lineId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try { await stockApi.updateTakeLine(current.value.stockTakeId, line.lineId, { physicalStock: line.physicalStock, comments: line.comments || null }) }
    catch (e) { error.value = e.response?.data?.error ?? e.message }
  }, 400)
}
async function flushPendingLineEdits() {
  if (saveTimer) clearTimeout(saveTimer)
  for (const l of current.value.lines) {
    if (l.physicalStock != null) {
      await stockApi.updateTakeLine(current.value.stockTakeId, l.lineId, { physicalStock: l.physicalStock, comments: l.comments || null })
    }
  }
}
async function submitForApproval() {
  acting.value = true; error.value = ''
  try {
    await flushPendingLineEdits()
    await stockApi.submitTake(current.value.stockTakeId)
    current.value = (await stockApi.getTake(current.value.stockTakeId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('en-KE') : '' }
function fmtTime(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle:'short', timeStyle:'short' }) : '' }
function n(v) { return Number(v || 0).toFixed(2) }
function statusSeverity(s) {
  return { open: 'info', 'pending-approval': 'warn', completed: 'success', cancelled: 'secondary' }[s] ?? 'secondary'
}
onMounted(load)
</script>

<style scoped>
.stock-page { padding: 16px 20px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; } .text-sm { font-size:13px; } .mb-3 { margin-bottom:12px; }
.editor { display:flex; flex-direction:column; gap:12px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; }
.form-row { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.form-row label { font-size:13px; font-weight:500; }
.line-input { width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none; text-align:right; background:#fff; color:#111827; }
.line-input::placeholder { color:#94a3b8; }
.line-input:focus { border-color:#2563eb; }
.num.pos { color:#15803d; font-weight:600; } .num.neg { color:#b91c1c; font-weight:600; }
.stock-page :deep(.p-datatable) { border:1px solid #374151; border-radius:8px; overflow:hidden; }
.stock-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; font-weight:700; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr) { background:#1f2937 !important; color:#e5e7eb !important; }
.stock-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#232f3e !important; }
.stock-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
</style>

<style>
.st-dark-dialog.p-dialog { background:#fff; border:1px solid #d0d5dd; box-shadow:0 12px 40px rgba(15,23,42,0.28); }
.st-dark-dialog.p-dialog .p-dialog-header { background:#f1f5f9 !important; color:#111827 !important; border-bottom:1px solid #e2e8f0; }
.st-dark-dialog.p-dialog .p-dialog-title { font-weight:700; font-size:16px; color:#111827 !important; }
.st-dark-dialog.p-dialog .p-dialog-header .p-dialog-header-icon { color:#334155 !important; }
.st-dark-dialog.p-dialog .p-dialog-content { background:#fff !important; color:#111827 !important; }
.st-dark-dialog.p-dialog .p-dialog-footer { background:#f8fafc !important; border-top:1px solid #e2e8f0; }
.st-dark-dialog .editor-meta { color:#111827 !important; }
.st-dark-dialog .text-muted { color:#475569 !important; }
.st-dark-dialog .p-inputtext, .st-dark-dialog .p-datepicker-input, .st-dark-dialog .line-input { background:#fff !important; color:#111827 !important; border-color:#cbd5e1 !important; color-scheme:light; }
.st-dark-dialog .line-input::placeholder { color:#94a3b8; }
.st-dark-dialog .p-datatable-thead > tr > th { background:#f1f5f9 !important; color:#111827 !important; border-bottom:1px solid #e2e8f0 !important; }
.st-dark-dialog .p-datatable-tbody > tr { background:#fff !important; color:#111827 !important; }
.st-dark-dialog .p-datatable-tbody > tr > td { background:#fff !important; color:#111827 !important; border-bottom:1px solid #eef2f6 !important; }
.st-dark-dialog .p-datatable-tbody > tr:nth-child(even) > td { background:#f8fafc !important; }
.st-dark-dialog .p-datatable-tbody > tr:hover > td { background:#eff6ff !important; }
body > .p-dialog-mask:has(.st-dark-dialog) { background:rgba(15,23,42,0.55); }
</style>
