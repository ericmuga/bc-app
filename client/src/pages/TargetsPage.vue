<template>
  <div class="targets-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Daily Sales Targets</h2>
        <p class="text-muted text-sm">Set per-item daily targets for the shop. Upload from Excel/CSV or copy from a previous date. Achievement view compares against actual POS + manual sales.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="set">Set targets</Tab>
        <Tab value="achievement">Achievement</Tab>
      </TabList>
      <TabPanels>
        <!-- ── Set targets ─────────────────────────────────────────── -->
        <TabPanel value="set">
          <div class="filters">
            <div class="filter-field">
              <label>Date</label>
              <DatePicker v-model="targetDate" date-format="yy-mm-dd" />
            </div>
            <div class="filter-field" style="flex:1"></div>
            <Button label="Add line"  icon="pi pi-plus"  @click="addBlankLine" />
            <Button label="Upload CSV" icon="pi pi-upload" severity="info" @click="openUpload" />
            <Button label="Copy from previous date" icon="pi pi-copy" severity="secondary" @click="openCopy" />
            <Button label="Save changes" icon="pi pi-save" severity="success"
                    :disabled="!dirtyLines.length" :loading="savingBatch" @click="saveAll" />
          </div>

          <DataTable :value="rows" dataKey="key" size="small" :loading="loading"
                     responsive-layout="scroll" :paginator="true" :rows="50">
            <Column header="Item No" style="width:200px">
              <template #body="{ data }">
                <AutoComplete
                  :model-value="data.itemNo"
                  @update:model-value="(v) => onItemChange(data, v)"
                  :suggestions="lookupSuggestions"
                  option-label="itemNo"
                  :force-selection="false"
                  size="small"
                  fluid
                  @complete="(e) => filterLookup(e.query)"
                  @option-select="(e) => pickItem(data, e.value)">
                  <template #option="{ option }">
                    <div style="display:flex;gap:8px">
                      <strong style="min-width:80px">{{ option.itemNo }}</strong>
                      <span>{{ option.description }}</span>
                    </div>
                  </template>
                </AutoComplete>
              </template>
            </Column>
            <Column field="description" header="Description" style="min-width:200px">
              <template #body="{ data }">
                <InputText v-model="data.description" size="small" fluid @input="markDirty(data)" />
              </template>
            </Column>
            <Column header="Target Qty" style="width:130px">
              <template #body="{ data }">
                <InputNumber v-model="data.targetQty" :minFractionDigits="2" mode="decimal" size="small" fluid
                             @input="onQtyChange(data)" />
              </template>
            </Column>
            <Column header="Target Value" style="width:140px;text-align:right">
              <template #body="{ data }">
                <InputNumber v-model="data.targetValue" :minFractionDigits="2" mode="decimal" size="small" fluid
                             @input="markDirty(data)" />
              </template>
            </Column>
            <Column header="Notes" style="min-width:160px">
              <template #body="{ data }">
                <InputText v-model="data.notes" size="small" fluid @input="markDirty(data)" />
              </template>
            </Column>
            <Column header="" style="width:50px">
              <template #body="{ data, index }">
                <Button icon="pi pi-times" text severity="danger" size="small" @click="removeLine(index, data)" />
              </template>
            </Column>
            <template #footer>
              <div class="totals-row">
                <span>{{ rows.length }} target line(s)</span>
                <span style="margin-left:auto">
                  Total Qty: <strong>{{ n(totalQty) }}</strong>
                  · Total Value: <strong>{{ n(totalValue) }}</strong>
                </span>
              </div>
            </template>
          </DataTable>
        </TabPanel>

        <!-- ── Achievement ─────────────────────────────────────────── -->
        <TabPanel value="achievement">
          <div class="filters">
            <div class="filter-field"><label>From</label><DatePicker v-model="achFrom" date-format="yy-mm-dd" /></div>
            <div class="filter-field"><label>To</label>  <DatePicker v-model="achTo"   date-format="yy-mm-dd" /></div>
            <Button label="Run" icon="pi pi-play" @click="loadAchievement" :loading="loadingAch" />
          </div>

          <DataTable :value="achievement" size="small" :loading="loadingAch" responsive-layout="scroll" :paginator="true" :rows="50">
            <Column field="targetDate" header="Date" style="width:120px">
              <template #body="{ data }">{{ fmtDate(data.targetDate) }}</template>
            </Column>
            <Column field="itemNo"      header="Item No" style="width:120px" />
            <Column field="description" header="Description" style="min-width:200px" />
            <Column header="Target Qty"  style="width:120px;text-align:right">
              <template #body="{ data }">{{ n(data.targetQty) }}</template>
            </Column>
            <Column header="Actual Qty"  style="width:120px;text-align:right">
              <template #body="{ data }">{{ n(data.actualQty) }}</template>
            </Column>
            <Column header="Qty %"       style="width:90px;text-align:right">
              <template #body="{ data }"><strong :class="achColor(data.achievementQty)">{{ data.achievementQty.toFixed(1) }}%</strong></template>
            </Column>
            <Column header="Target Value" style="width:130px;text-align:right">
              <template #body="{ data }">{{ n(data.targetValue) }}</template>
            </Column>
            <Column header="Actual Value" style="width:130px;text-align:right">
              <template #body="{ data }">{{ n(data.actualValue) }}</template>
            </Column>
            <Column header="Value %"     style="width:90px;text-align:right">
              <template #body="{ data }"><strong :class="achColor(data.achievementValue)">{{ data.achievementValue.toFixed(1) }}%</strong></template>
            </Column>
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Upload CSV -->
    <Dialog v-model:visible="upload.visible" header="Upload targets from CSV" :modal="true" :style="{ width: '720px' }">
      <p class="text-muted text-sm">
        CSV columns (header row required, in any order):
        <strong>itemNo, description, targetQty, targetValue, notes</strong>.
        If <code>targetValue</code> is blank, it's auto-calculated as <code>targetQty × catalogue unit price</code>.
      </p>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input ref="uploadFileRef" type="file" accept=".csv,text/csv" @change="onUploadFile" style="flex:1" />
        <Button label="Download template" icon="pi pi-download" text size="small" @click="downloadTemplate" />
      </div>
      <p v-if="upload.parseError" class="text-sm" style="color:#b91c1c;margin-top:4px">{{ upload.parseError }}</p>

      <DataTable v-if="upload.lines.length" :value="upload.lines" size="small" style="margin-top:10px"
                 :scrollable="true" scrollHeight="260px">
        <Column header="#" style="width:50px"><template #body="{ index }">{{ index + 1 }}</template></Column>
        <Column field="itemNo"      header="Item No" style="width:120px" />
        <Column field="description" header="Description" style="min-width:200px" />
        <Column field="targetQty"   header="Qty"   style="width:90px;text-align:right" />
        <Column field="targetValue" header="Value" style="width:120px;text-align:right">
          <template #body="{ data }">{{ n(data.targetValue) }}</template>
        </Column>
      </DataTable>
      <div v-if="upload.result" style="margin-top:10px">
        <Message :severity="upload.result.failed ? 'warn' : 'success'" :closable="false">
          Posted {{ upload.result.posted }} · Failed {{ upload.result.failed }}
          <ul v-if="upload.result.errors?.length" style="margin:4px 0 0 18px">
            <li v-for="(e, i) in upload.result.errors" :key="i">Row {{ e.row }} ({{ e.itemNo }}): {{ e.error }}</li>
          </ul>
        </Message>
      </div>

      <template #footer>
        <Button label="Close" text @click="upload.visible = false" />
        <Button label="Post batch" icon="pi pi-send" severity="success"
                :disabled="!upload.lines.length" :loading="upload.posting" @click="postUpload" />
      </template>
    </Dialog>

    <!-- Copy from another date -->
    <Dialog v-model:visible="copyDlg.visible" header="Copy targets from another date" :modal="true" :style="{ width: '440px' }">
      <p class="text-muted text-sm">Pick the date to copy targets from. They'll be applied to <strong>{{ fmtDate(targetDate) }}</strong>.</p>
      <div class="form-row" style="margin-top:8px">
        <label>Copy from</label>
        <DatePicker v-model="copyDlg.fromDate" date-format="yy-mm-dd" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="copyDlg.visible = false" />
        <Button label="Copy" icon="pi pi-copy" severity="success"
                :loading="copyDlg.busy" @click="doCopy" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import Button       from 'primevue/button'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import DatePicker   from 'primevue/datepicker'
import InputText    from 'primevue/inputtext'
import InputNumber  from 'primevue/inputnumber'
import AutoComplete from 'primevue/autocomplete'
import Dialog       from 'primevue/dialog'
import Message      from 'primevue/message'
import Tabs         from 'primevue/tabs'
import TabList      from 'primevue/tablist'
import Tab          from 'primevue/tab'
import TabPanels    from 'primevue/tabpanels'
import TabPanel     from 'primevue/tabpanel'
import { targetsApi, posApi } from '@/services/pos.js'

const today = new Date()
const tab        = ref('set')
const targetDate = ref(today)
const rows       = ref([])
const loading    = ref(false)
const savingBatch = ref(false)
const error      = ref('')

const catalogue        = ref([])
const lookupSuggestions = ref([])

const dirty = new Set()
function markDirty(data) { if (data.key) dirty.add(data.key) }
const dirtyLines = computed(() => rows.value.filter(r => dirty.has(r.key) || !r.targetId))

function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('en-KE') : '' }
function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const totalQty   = computed(() => rows.value.reduce((s, r) => s + Number(r.targetQty || 0),   0))
const totalValue = computed(() => rows.value.reduce((s, r) => s + Number(r.targetValue || 0), 0))

function filterLookup(q) {
  const ql = String(q || '').trim().toLowerCase()
  if (!ql) { lookupSuggestions.value = catalogue.value.slice(0, 10); return }
  lookupSuggestions.value = catalogue.value
    .filter(i => i.itemNo.toLowerCase().includes(ql) || i.description.toLowerCase().includes(ql))
    .slice(0, 12)
}
function onItemChange(data, v) {
  if (v && typeof v === 'object') pickItem(data, v)
  else { data.itemNo = String(v || '').toUpperCase(); markDirty(data) }
}
function pickItem(data, val) {
  if (!val) return
  data.itemNo      = val.itemNo
  data.description = val.description || data.description
  data._unitPrice  = Number(val.unitPrice || 0)
  if (!data.targetValue && data.targetQty) data.targetValue = Math.round(data._unitPrice * data.targetQty * 100) / 100
  markDirty(data)
}
function onQtyChange(data) {
  if (data._unitPrice && (!data.targetValue || data._lastQty * data._unitPrice === data.targetValue)) {
    data.targetValue = Math.round(data._unitPrice * Number(data.targetQty || 0) * 100) / 100
  }
  data._lastQty = Number(data.targetQty || 0)
  markDirty(data)
}

async function loadCatalogue() {
  if (catalogue.value.length) return
  try {
    const { data } = await posApi.getItems()
    catalogue.value = data.flatMap(c => c.items)
  } catch {}
}

async function load() {
  loading.value = true; error.value = ''
  try {
    const day = isoDate(targetDate.value)
    const { data } = await targetsApi.list({ dateFrom: day, dateTo: day })
    rows.value = data.map(r => ({
      key:         r.TargetId,
      targetId:    r.TargetId,
      itemNo:      r.ItemNo,
      description: r.Description || '',
      targetQty:   Number(r.TargetQty),
      targetValue: Number(r.TargetValue),
      notes:       r.Notes || '',
      _unitPrice:  Number(r.UnitPrice || 0),
    }))
    dirty.clear()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loading.value = false
  }
}

let _ki = 0
function addBlankLine() {
  rows.value.push({
    key: `new-${++_ki}`, targetId: null, itemNo: '', description: '',
    targetQty: 0, targetValue: 0, notes: '', _unitPrice: 0,
  })
  dirty.add(rows.value[rows.value.length - 1].key)
}
async function removeLine(idx, data) {
  if (data.targetId) {
    try { await targetsApi.remove(data.targetId) } catch (e) { error.value = e.response?.data?.error ?? e.message; return }
  }
  rows.value.splice(idx, 1)
  dirty.delete(data.key)
}

async function saveAll() {
  if (!dirtyLines.value.length) return
  savingBatch.value = true; error.value = ''
  try {
    const lines = dirtyLines.value.map(r => ({
      itemNo: r.itemNo, description: r.description,
      targetQty: r.targetQty, targetValue: r.targetValue, notes: r.notes,
    }))
    await targetsApi.uploadBatch({
      targetDate: isoDate(targetDate.value),
      lines,
    })
    await load()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    savingBatch.value = false
  }
}

// ── Upload CSV ─────────────────────────────────────────────────────────────
const uploadFileRef = ref(null)
const upload = reactive({ visible: false, lines: [], parseError: '', posting: false, result: null })
function openUpload() {
  upload.visible = true; upload.lines = []; upload.parseError = ''; upload.result = null
  if (uploadFileRef.value) uploadFileRef.value.value = ''
}
function downloadTemplate() {
  const csv = '﻿itemNo,description,targetQty,targetValue,notes\r\nKG-FIL-RIB,Pork ribs,10,6500,\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'targets-template.csv'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '')
  const out = []; let cur = []; let buf = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i+1] === '"') { buf += '"'; i++ }
      else if (ch === '"') inQ = false
      else buf += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { cur.push(buf); buf = '' }
      else if (ch === '\r') {}
      else if (ch === '\n') { cur.push(buf); out.push(cur); cur = []; buf = '' }
      else buf += ch
    }
  }
  if (buf.length || cur.length) { cur.push(buf); out.push(cur) }
  return out.filter(r => r.length && r.some(c => String(c).trim() !== ''))
}
function onUploadFile(ev) {
  upload.parseError = ''; upload.result = null; upload.lines = []
  const file = ev.target?.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const rowsCsv = parseCsv(String(reader.result || ''))
    if (rowsCsv.length < 2) { upload.parseError = 'CSV must include a header row and at least one data row.'; return }
    const header = rowsCsv[0].map(h => String(h).trim().toLowerCase())
    const idx = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
    const cItem = idx('itemno', 'item no', 'sku')
    const cDesc = idx('description', 'desc', 'name')
    const cQty  = idx('targetqty', 'qty', 'quantity')
    const cVal  = idx('targetvalue', 'value', 'amount')
    const cNote = idx('notes', 'note', 'comment')
    if (cItem < 0 || cQty < 0) { upload.parseError = 'CSV must include itemNo and targetQty columns.'; return }
    const out = []
    for (let r = 1; r < rowsCsv.length; r++) {
      const row = rowsCsv[r]
      const itemNo = String(row[cItem] || '').trim().toUpperCase(); if (!itemNo) continue
      out.push({
        itemNo,
        description: String(row[cDesc] || '').trim(),
        targetQty:   Number(row[cQty] || 0),
        targetValue: row[cVal] != null && row[cVal] !== '' ? Number(row[cVal]) : null,
        notes:       cNote >= 0 ? String(row[cNote] || '') : '',
      })
    }
    upload.lines = out
    if (!out.length) upload.parseError = 'No usable rows after parsing.'
  }
  reader.readAsText(file)
}
async function postUpload() {
  upload.posting = true; upload.result = null
  try {
    const { data } = await targetsApi.uploadBatch({
      targetDate: isoDate(targetDate.value),
      lines:      upload.lines,
    })
    upload.result = data
    if (data?.posted) await load()
  } catch (e) {
    upload.parseError = e.response?.data?.error ?? e.message
  } finally {
    upload.posting = false
  }
}

// ── Copy from previous date ───────────────────────────────────────────────
const copyDlg = reactive({ visible: false, fromDate: today, busy: false })
function openCopy() {
  // Default to yesterday
  const y = new Date(targetDate.value); y.setDate(y.getDate() - 1)
  copyDlg.fromDate = y; copyDlg.visible = true
}
async function doCopy() {
  copyDlg.busy = true
  try {
    const { data } = await targetsApi.copy({
      fromDate: isoDate(copyDlg.fromDate),
      toDate:   isoDate(targetDate.value),
    })
    copyDlg.visible = false
    error.value = data?.copied ? '' : 'No targets found on that date.'
    await load()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    copyDlg.busy = false
  }
}

// ── Achievement ───────────────────────────────────────────────────────────
const achFrom = ref(today)
const achTo   = ref(today)
const achievement = ref([])
const loadingAch  = ref(false)
function achColor(p) { if (p >= 100) return 'num pos'; if (p >= 75) return 'num warn'; return 'num neg' }
async function loadAchievement() {
  loadingAch.value = true
  try {
    const { data } = await targetsApi.achievement({
      dateFrom: isoDate(achFrom.value),
      dateTo:   isoDate(achTo.value),
    })
    achievement.value = data
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loadingAch.value = false
  }
}

watch(targetDate, load)
watch(tab, (val) => { if (val === 'achievement') loadAchievement() })

onMounted(async () => {
  await loadCatalogue()
  await load()
})
</script>

<style scoped>
.targets-page {
  padding: 16px 20px; background:#f4f6f8; color:#111827; color-scheme:light;
  min-height: calc(100vh - 56px);
}
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title  { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted  { color:#6b7280; }
.text-sm     { font-size:13px; }
.mb-3        { margin-bottom:12px; }

.filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin: 14px 0; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }

.totals-row { display:flex; gap:18px; padding:8px 12px; font-size:13px; flex-wrap:wrap; background:#f3f4f6; }

.num.pos  { color:#15803d; }
.num.warn { color:#b45309; }
.num.neg  { color:#b91c1c; }

.targets-page :deep(.p-inputtext),
.targets-page :deep(.p-inputnumber-input),
.targets-page :deep(.p-select),
.targets-page :deep(.p-datepicker-input),
.targets-page :deep(.p-autocomplete-input) {
  background: #ffffff !important; color: #111827 !important; border-color: #d1d5db !important;
  color-scheme: light;
}
.targets-page :deep(.p-datatable-thead > tr > th)  { background: #f3f4f6 !important; color: #111827 !important; }
.targets-page :deep(.p-datatable-tbody > tr > td)  { background: #ffffff !important; color: #111827 !important; }
</style>
