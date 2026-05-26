<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Stock Take</h2>
        <p class="text-muted text-sm">Open a new stock take for a date range, enter physical counts, complete to post variance adjustments.</p>
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

    <!-- ── New stock take dialog ─────────────────────────────────── -->
    <Dialog v-model:visible="newTakeVisible" header="New Stock Take" :modal="true" :style="{ width:'420px' }">
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

    <!-- ── Stock take editor ─────────────────────────────────────── -->
    <Dialog v-model:visible="editorVisible" :header="editorHeader" :modal="true" :style="{ width:'1100px' }">
      <div v-if="current" class="editor">
        <div class="editor-meta">
          <span><strong>{{ current.stockTakeNo }}</strong> · {{ fmtDate(current.dateFrom) }} → {{ fmtDate(current.dateTo) }}</span>
          <Tag :value="current.status" :severity="statusSeverity(current.status)" />
        </div>

        <DataTable :value="current.lines" size="small" responsive-layout="scroll" :scrollable="true" scrollHeight="500px">
          <Column field="itemNo" header="No" style="width:90px;min-width:90px" />
          <Column field="description" header="Description" style="min-width:180px" />
          <Column header="Opening" style="width:80px;text-align:right">
            <template #body="{ data }">{{ n(data.openingStock) }}</template>
          </Column>
          <Column header="Increases" style="width:90px;text-align:right">
            <template #body="{ data }"><span class="num pos">{{ n(data.increasesQty) }}</span></template>
          </Column>
          <Column header="Decreases" style="width:90px;text-align:right">
            <template #body="{ data }"><span class="num neg">{{ n(data.decreasesQty) }}</span></template>
          </Column>
          <Column header="Expected" style="width:90px;text-align:right">
            <template #body="{ data }"><strong>{{ n(data.expectedStock) }}</strong></template>
          </Column>
          <Column header="Physical" style="width:110px">
            <template #body="{ data }">
              <input v-if="editable" type="number" step="0.01"
                v-model.number="data.physicalStock"
                @blur="persistLine(data)"
                class="line-input" />
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
              <input v-if="editable" type="text"
                v-model="data.comments"
                @blur="persistLine(data)"
                class="line-input" placeholder="Optional…" />
              <span v-else>{{ data.comments }}</span>
            </template>
          </Column>
          <Column header="" style="width:50px">
            <template #body="{ data }">
              <Button icon="pi pi-list" text size="small" v-tooltip="'Show transactions'"
                @click="showTxns(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <template #footer>
        <Button label="Close" text @click="editorVisible=false" />
        <Button v-if="canExportBc"
                label="Export BC Physical Inventory Journal" icon="pi pi-file-excel" severity="secondary"
                :loading="exportingBc" @click="downloadBcJournal" />
        <Button v-if="editable"
                label="Submit for approval" icon="pi pi-send" severity="info"
                :loading="acting" @click="submitForApproval" />
        <Button v-if="canApproveTake"
                label="Approve & Post Variance" icon="pi pi-check" severity="success"
                :loading="acting" @click="approveTake" />
      </template>
    </Dialog>

    <!-- ── Item transactions drill-down ──────────────────────────── -->
    <Dialog v-model:visible="txnsVisible" :header="txnsHeader" :modal="true" :style="{ width:'620px' }">
      <DataTable :value="txns" size="small" responsive-layout="scroll">
        <Column field="date" header="Date" style="width:110px">
          <template #body="{ data }">{{ fmtDate(data.date) }}</template>
        </Column>
        <Column field="type" header="Type" style="width:120px" />
        <Column header="Qty" style="width:90px;text-align:right">
          <template #body="{ data }">
            <span :class="data.quantity > 0 ? 'num pos' : 'num neg'">{{ n(data.quantity) }}</span>
          </template>
        </Column>
        <Column field="referenceNo" header="Ref" style="min-width:140px" />
        <Column field="notes" header="Notes" style="min-width:140px" />
      </DataTable>
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

const takes         = ref([])
const loading       = ref(false)
const error         = ref('')
const newTakeVisible = ref(false)
const editorVisible = ref(false)
const current       = ref(null)
const acting        = ref(false)
const creating      = ref(false)

const today = new Date()
const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
const newDateFrom = ref(monthAgo)
const newDateTo   = ref(today)

const txnsVisible = ref(false)
const txns        = ref([])
const txnsHeader  = ref('Transactions')

const editable      = computed(() => current.value?.status === 'open')
const editorHeader  = computed(() => current.value ? `Stock Take ${current.value.stockTakeNo}` : 'Stock Take')

import { useAuthStore } from '@/stores/auth.js'
const auth          = useAuthStore()
const canApproveTake = computed(() =>
  current.value?.status === 'pending-approval' &&
  ['admin', 'shop-admin'].includes(auth.user?.role)
)
const canExportBc   = computed(() =>
  ['pending-approval', 'completed'].includes(current.value?.status) &&
  ['admin', 'shop-admin'].includes(auth.user?.role)
)
const exportingBc   = ref(false)

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
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function createTake() {
  creating.value = true; error.value = ''
  try {
    const { data } = await stockApi.createTake({
      dateFrom: isoDate(newDateFrom.value),
      dateTo:   isoDate(newDateTo.value),
    })
    const id = data.StockTakeId || data.stockTakeId
    current.value = (await stockApi.getTake(id)).data
    newTakeVisible.value = false
    editorVisible.value  = true
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { creating.value = false }
}

async function openTake(e) {
  const id = e.data.StockTakeId
  try {
    current.value = (await stockApi.getTake(id)).data
    editorVisible.value = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
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
    try {
      await stockApi.updateTakeLine(current.value.stockTakeId, line.lineId, {
        physicalStock: line.physicalStock,
        comments:      line.comments || null,
      })
    } catch (e) { error.value = e.response?.data?.error ?? e.message }
  }, 400)
}

async function flushPendingLineEdits() {
  if (saveTimer) clearTimeout(saveTimer)
  for (const l of current.value.lines) {
    if (l.physicalStock != null) {
      await stockApi.updateTakeLine(current.value.stockTakeId, l.lineId, {
        physicalStock: l.physicalStock, comments: l.comments || null,
      })
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

async function approveTake() {
  if (!confirm('Approve this stock take? Variance movements will be posted.')) return
  acting.value = true; error.value = ''
  try {
    await stockApi.approveTake(current.value.stockTakeId)
    current.value = (await stockApi.getTake(current.value.stockTakeId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

async function downloadBcJournal() {
  if (!current.value) return
  exportingBc.value = true
  try {
    const res = await stockApi.takeBcJournalCsv(current.value.stockTakeId, {})
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `phys-inv-journal-${current.value.stockTakeNo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { exportingBc.value = false }
}

// Legacy single-step path retained for back-compat (button no longer rendered).
async function completeTake() {
  acting.value = true; error.value = ''
  try {
    await flushPendingLineEdits()
    await stockApi.completeTake(current.value.stockTakeId)
    current.value = (await stockApi.getTake(current.value.stockTakeId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

async function showTxns(line) {
  try {
    txnsHeader.value = `${line.description} — transactions`
    const { data } = await stockApi.itemTxns({
      itemNo:   line.itemNo,
      dateFrom: isoDate(current.value.dateFrom),
      dateTo:   isoDate(current.value.dateTo),
    })
    txns.value = data
    txnsVisible.value = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
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
.text-muted { color:#888; }
.text-sm    { font-size:13px; }
.mb-3       { margin-bottom:12px; }

.editor { display:flex; flex-direction:column; gap:12px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; }

.form-row { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.form-row label { font-size:13px; font-weight:500; }

.line-input { width:100%; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px; font-size:12px; outline:none; text-align:right; }
.line-input:focus { border-color:#2563eb; }

.num.pos { color:#15803d; font-weight:600; }
.num.neg { color:#b91c1c; font-weight:600; }
</style>
