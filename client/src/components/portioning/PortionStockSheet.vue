<template>
  <div class="sheet-panel">
    <div class="panel-actions">
      <Button v-if="canManage" label="New Stock Sheet" icon="pi pi-plus" @click="openNew" />
      <Button v-if="canManage" label="Upload sales & stock" icon="pi pi-upload" severity="info" @click="openUpload" />
      <div class="filter-inline">
        <label>From</label><input v-model="filterFrom" type="date" class="date-in" />
        <label>To</label><input v-model="filterTo" type="date" class="date-in" />
      </div>
      <Button label="Refresh" icon="pi pi-refresh" severity="secondary" :loading="loading" @click="load" />
    </div>
    <p class="text-muted text-sm hint">
      One sheet per date: enter sales, write-offs and the final stock count. Anything not accounted for is the
      variance. Sales already captured on the POS terminal are pre-filled. Posting updates shop stock.
    </p>

    <Message v-if="error" severity="error" :closable="true" @close="error = ''">{{ error }}</Message>

    <DataTable :value="sheets" dataKey="SheetId" size="small" :loading="loading" responsive-layout="scroll"
               paginator :rows="20" selection-mode="single" @row-click="(e) => openSheet(e.data.SheetId)">
      <Column field="SheetNo" header="No" style="width:170px" />
      <Column header="As at" style="width:110px"><template #body="{ data }">{{ day(data.AsAtDate) }}</template></Column>
      <Column header="Period from" style="width:110px"><template #body="{ data }">{{ day(data.PeriodFrom) }}</template></Column>
      <Column field="ShopCode" header="Shop" style="width:80px" />
      <Column field="LineCount" header="Items" style="width:70px;text-align:right" />
      <Column header="Sales" style="width:100px;text-align:right"><template #body="{ data }">{{ n(data.SalesQty) }}</template></Column>
      <Column header="Write-off" style="width:100px;text-align:right"><template #body="{ data }">{{ n(data.WriteOffQty) }}</template></Column>
      <Column header="Variance" style="width:100px;text-align:right">
        <template #body="{ data }"><span :class="varClass(data.VarianceQty)">{{ n(data.VarianceQty) }}</span></template>
      </Column>
      <Column header="Variance value" style="width:120px;text-align:right">
        <template #body="{ data }"><span :class="varClass(data.VarianceValue)">{{ n(data.VarianceValue) }}</span></template>
      </Column>
      <Column field="Source" header="Source" style="width:80px" />
      <Column header="Status" style="width:90px">
        <template #body="{ data }"><Tag :value="data.Status" :severity="data.Status === 'posted' ? 'success' : 'info'" /></template>
      </Column>
    </DataTable>

    <!-- New sheet -->
    <Dialog v-model:visible="newDlg.visible" header="New Stock Sheet" :modal="true" :style="{ width: '460px' }">
      <div class="form-row"><label>Stock take as at</label><input v-model="newDlg.asAtDate" type="date" class="date-in" /></div>
      <div class="form-row">
        <label>Period from <span class="text-muted">(blank = day after the last posted sheet)</span></label>
        <input v-model="newDlg.periodFrom" type="date" class="date-in" />
      </div>
      <div class="form-row">
        <label>Items to pre-fill</label>
        <Select v-model="newDlg.scope" :options="scopeOpts" option-label="label" option-value="value" fluid />
      </div>
      <div class="form-row"><label>Notes</label><InputText v-model="newDlg.notes" fluid /></div>
      <template #footer>
        <Button label="Cancel" text @click="newDlg.visible = false" />
        <Button label="Create" icon="pi pi-check" :loading="saving" :disabled="!newDlg.asAtDate" @click="createSheet" />
      </template>
    </Dialog>

    <!-- Sheet editor -->
    <Dialog v-model:visible="editor.visible" :header="editor.data ? `Stock Sheet ${editor.data.sheetNo}` : 'Stock Sheet'"
            :modal="true" :style="{ width: '1180px' }" maximizable>
      <div v-if="editor.data" class="editor">
        <div class="editor-meta">
          <span>
            <strong>{{ editor.data.shopCode }}</strong> · period
            <input v-if="editable" v-model="editor.data.periodFrom" type="date" class="date-in sm" />
            <strong v-else>{{ editor.data.periodFrom }}</strong>
            → <strong>{{ editor.data.asAtDate }}</strong>
          </span>
          <Tag :value="editor.data.status" :severity="editor.data.status === 'posted' ? 'success' : 'info'" />
        </div>

        <div v-if="editable" class="line-add-row">
          <div class="line-add">
            <input v-model="itemQuery" type="text" class="line-add-input"
                   placeholder="Add item — search by No or description, Enter to add"
                   @input="filterItems" @focus="showDrop = true" @blur="hideDrop"
                   @keydown.enter.prevent="addFirst" />
            <div v-if="showDrop && suggestions.length" class="line-add-drop">
              <div v-for="it in suggestions" :key="it.itemNo" class="line-add-opt" @mousedown.prevent="addItem(it)">
                <span class="line-add-name">{{ it.description }}</span>
                <span class="line-add-no">{{ it.itemNo }} · {{ it.unitOfMeasure || 'KG' }}</span>
              </div>
            </div>
          </div>
          <input v-model="lineSearch" type="text" class="line-add-input narrow" placeholder="Filter lines…" />
        </div>

        <div class="sheet-scroll">
          <table class="sheet-table">
            <thead>
              <tr>
                <th>Item</th><th>Description</th><th>UoM</th>
                <th class="num" title="On hand at the start of the period">Opening</th>
                <th class="num" title="Received / portioned / adjusted in the period">In</th>
                <th class="num">Sales</th>
                <th class="num">Write-off</th>
                <th class="num" title="Opening + In − Sales − Write-off">Expected</th>
                <th class="num">Final count</th>
                <th class="num" title="Expected − Final count (positive = unaccounted loss)">Variance</th>
                <th class="num">Price</th>
                <th class="num">Var. value</th>
                <th>Comment</th>
                <th v-if="editable"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in visibleLines" :key="l.itemNo">
                <td class="mono">{{ l.itemNo }}</td>
                <td>{{ l.description }}</td>
                <td>{{ l.unitOfMeasure }}</td>
                <td class="num">{{ n(l.openingQty) }}</td>
                <td class="num">{{ n(l.inQty) }}</td>
                <td class="num">
                  <input v-if="editable" v-model.number="l.salesQty" type="number" step="0.01" min="0" class="qty-in"
                         :title="`POS-recorded: ${n(l.recordedSalesQty)}`" />
                  <span v-else>{{ n(l.salesQty) }}</span>
                  <div v-if="l.recordedSalesQty" class="sub">POS {{ n(l.recordedSalesQty) }}</div>
                </td>
                <td class="num">
                  <input v-if="editable" v-model.number="l.writeOffQty" type="number" step="0.01" min="0" class="qty-in" />
                  <span v-else>{{ n(l.writeOffQty) }}</span>
                </td>
                <td class="num">{{ n(expected(l)) }}</td>
                <td class="num">
                  <input v-if="editable" v-model.number="l.countQty" type="number" step="0.01" min="0" class="qty-in count"
                         placeholder="count" />
                  <span v-else>{{ l.countQty == null ? '—' : n(l.countQty) }}</span>
                </td>
                <td class="num"><strong :class="varClass(variance(l))">{{ l.countQty === '' || l.countQty == null ? '—' : n(variance(l)) }}</strong></td>
                <td class="num">{{ n(l.unitPrice) }}</td>
                <td class="num"><span :class="varClass(variance(l))">{{ l.countQty === '' || l.countQty == null ? '—' : n(variance(l) * Number(l.unitPrice || 0)) }}</span></td>
                <td>
                  <input v-if="editable" v-model="l.comment" type="text" class="cmt-in" placeholder="Optional" />
                  <span v-else class="text-muted">{{ l.comment }}</span>
                </td>
                <td v-if="editable"><Button icon="pi pi-times" text severity="danger" size="small" @click="removeLine(l)" /></td>
              </tr>
              <tr v-if="!editor.data.lines.length">
                <td :colspan="editable ? 14 : 13" class="empty-row">No items yet. Add items above.</td>
              </tr>
            </tbody>
            <tfoot v-if="editor.data.lines.length">
              <tr>
                <td colspan="5"><strong>Totals</strong></td>
                <td class="num"><strong>{{ n(tot.sales) }}</strong></td>
                <td class="num"><strong>{{ n(tot.wo) }}</strong></td>
                <td class="num"><strong>{{ n(tot.expected) }}</strong></td>
                <td class="num"><strong>{{ n(tot.count) }}</strong></td>
                <td class="num"><strong :class="varClass(tot.variance)">{{ n(tot.variance) }}</strong></td>
                <td></td>
                <td class="num"><strong :class="varClass(tot.value)">{{ n(tot.value) }}</strong></td>
                <td :colspan="editable ? 2 : 1"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="form-row" style="margin-top:6px">
          <label>Notes</label>
          <InputText v-if="editable" v-model="editor.data.notes" fluid />
          <span v-else class="text-muted">{{ editor.data.notes || '—' }}</span>
        </div>
      </div>
      <template #footer>
        <Button v-if="editor.data" label="Excel" icon="pi pi-file-excel" severity="secondary" text @click="exportSheetXlsx" />
        <Button v-if="editable" label="Delete draft" icon="pi pi-trash" severity="danger" text :loading="saving" @click="removeSheet" />
        <Button label="Close" text @click="editor.visible = false" />
        <Button v-if="editable" label="Save Draft" icon="pi pi-save" text :loading="saving" @click="save()" />
        <Button v-if="editable" label="Save & Post" icon="pi pi-send" severity="success" :loading="saving"
                :disabled="!editor.data?.lines.length" @click="post" />
      </template>
    </Dialog>

    <!-- Upload -->
    <Dialog v-model:visible="up.visible" header="Upload sales & stock by date" :modal="true" :style="{ width: '860px' }">
      <p class="text-muted text-sm" style="margin-top:0">
        Excel or CSV with a header row. Columns: <strong>date, itemNo, sales, writeOff, finalStock, comment</strong>
        (only date and itemNo are required). One stock sheet is created per date and works the same as a
        sheet entered by hand. An existing draft for that date is updated.
      </p>
      <div style="display:flex;gap:8px;align-items:center">
        <input ref="fileRef" type="file" accept=".xlsx,.xls,.csv" style="flex:1" @change="onFile" />
        <Button label="Download template" icon="pi pi-download" text size="small" @click="downloadTemplate" />
      </div>
      <p v-if="up.parseError" class="err-text">{{ up.parseError }}</p>

      <DataTable v-if="up.rows.length" :value="up.rows" size="small" scrollable scroll-height="260px" style="margin-top:10px">
        <Column field="date" header="Date" style="width:110px" />
        <Column field="itemNo" header="Item" style="width:120px" />
        <Column header="Description" style="min-width:160px"><template #body="{ data }">{{ descFor(data.itemNo) }}</template></Column>
        <Column header="Sales" style="width:90px;text-align:right"><template #body="{ data }">{{ data.salesQty ?? '—' }}</template></Column>
        <Column header="Write-off" style="width:90px;text-align:right"><template #body="{ data }">{{ data.writeOffQty ?? '—' }}</template></Column>
        <Column header="Final stock" style="width:100px;text-align:right"><template #body="{ data }">{{ data.countQty ?? '—' }}</template></Column>
        <Column field="comment" header="Comment" style="min-width:120px" />
      </DataTable>
      <div v-if="up.rows.length" class="editor-meta" style="margin-top:6px">
        <span class="text-muted text-sm">{{ up.rows.length }} row(s) across {{ upDates }} date(s)</span>
        <label class="chk"><input v-model="up.autoPost" type="checkbox" /> Post the sheets immediately</label>
      </div>

      <Message v-if="up.result" :severity="up.result.failed ? 'warn' : 'success'" :closable="false" style="margin-top:10px">
        <div v-for="r in up.result.results" :key="r.date">
          {{ r.date }}: <template v-if="r.error"><strong>failed</strong> — {{ r.error }}</template>
          <template v-else>{{ r.sheetNo }} ({{ r.status }}, {{ r.lines }} items)</template>
        </div>
        <div v-for="(e, i) in up.result.errors" :key="`e${i}`">Row {{ e.row }} ({{ e.itemNo }}): {{ e.error }}</div>
      </Message>
      <template #footer>
        <Button label="Close" text @click="up.visible = false" />
        <Button label="Upload" icon="pi pi-send" severity="success" :disabled="!up.rows.length" :loading="up.posting" @click="doUpload" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import * as XLSX from 'xlsx'
import { yieldApi } from '@/services/pos.js'

const props = defineProps({
  canManage: { type: Boolean, default: false },
  catalogue: { type: Array, default: () => [] },   // flat PosItems [{ itemNo, description, unitOfMeasure, unitPrice }]
})

const todayIso = () => isoLocal(new Date())
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthStart = () => { const d = new Date(); return isoLocal(new Date(d.getFullYear(), d.getMonth() - 2, 1)) }

const sheets = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const filterFrom = ref(monthStart())
const filterTo = ref(todayIso())

const scopeOpts = [
  { label: 'Portioned items with stock or activity', value: 'portioned' },
  { label: 'Every item with stock or activity', value: 'all' },
  { label: 'None — I will add items', value: 'none' },
]

async function load() {
  loading.value = true
  try { sheets.value = (await yieldApi.listSheets({ dateFrom: filterFrom.value || undefined, dateTo: filterTo.value || undefined })).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.value = false }
}

// ── New sheet ───────────────────────────────────────────────────────────────
const newDlg = reactive({ visible: false, asAtDate: todayIso(), periodFrom: '', scope: 'portioned', notes: '' })
function openNew() { Object.assign(newDlg, { visible: true, asAtDate: todayIso(), periodFrom: '', scope: 'portioned', notes: '' }) }
async function createSheet() {
  saving.value = true; error.value = ''
  try {
    const { data } = await yieldApi.createSheet({
      asAtDate: newDlg.asAtDate, periodFrom: newDlg.periodFrom || null, scope: newDlg.scope, notes: newDlg.notes || null,
    })
    newDlg.visible = false
    await load()
    await openSheet(data.SheetId)
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

// ── Editor ──────────────────────────────────────────────────────────────────
const editor = reactive({ visible: false, data: null })
const editable = computed(() => props.canManage && editor.data?.status === 'draft')
const lineSearch = ref('')
const visibleLines = computed(() => {
  const q = lineSearch.value.trim().toLowerCase()
  const lines = editor.data?.lines || []
  return q ? lines.filter((l) => `${l.itemNo} ${l.description}`.toLowerCase().includes(q)) : lines
})

async function openSheet(id) {
  error.value = ''
  try {
    editor.data = (await yieldApi.getSheet(id)).data
    lineSearch.value = ''
    editor.visible = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v))
const expected = (l) => num(l.openingQty) + num(l.inQty) - num(l.salesQty) - num(l.writeOffQty)
const variance = (l) => (l.countQty === '' || l.countQty == null ? 0 : expected(l) - num(l.countQty))
const tot = computed(() => {
  const t = { sales: 0, wo: 0, expected: 0, count: 0, variance: 0, value: 0 }
  for (const l of editor.data?.lines || []) {
    t.sales += num(l.salesQty); t.wo += num(l.writeOffQty); t.expected += expected(l)
    t.count += num(l.countQty); t.variance += variance(l); t.value += variance(l) * num(l.unitPrice)
  }
  return t
})

function linesPayload() {
  return editor.data.lines.map((l) => ({
    itemNo: l.itemNo, description: l.description, unitOfMeasure: l.unitOfMeasure,
    salesQty: num(l.salesQty), writeOffQty: num(l.writeOffQty),
    countQty: l.countQty === '' || l.countQty == null ? null : Number(l.countQty),
    comment: l.comment || null,
  }))
}
async function save(quiet = false) {
  saving.value = true; if (!quiet) error.value = ''
  try {
    editor.data = (await yieldApi.saveSheetLines(editor.data.sheetId, {
      lines: linesPayload(), periodFrom: editor.data.periodFrom, notes: editor.data.notes,
    })).data
    await load()
    return true
  } catch (e) { error.value = e.response?.data?.error ?? e.message; return false }
  finally { saving.value = false }
}
async function post() {
  const missing = editor.data.lines.filter((l) => l.countQty === '' || l.countQty == null)
  if (missing.length) { error.value = `Enter the final count for ${missing.length} item(s) before posting.`; return }
  if (!confirm(`Post ${editor.data.sheetNo}? Sales, write-offs and the count variance will be posted to shop stock as at ${editor.data.asAtDate}.`)) return
  if (!(await save(true))) return
  saving.value = true
  try {
    editor.data = (await yieldApi.postSheet(editor.data.sheetId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}
async function removeSheet() {
  if (!confirm(`Delete draft ${editor.data.sheetNo}?`)) return
  saving.value = true
  try { await yieldApi.deleteSheet(editor.data.sheetId); editor.visible = false; await load() }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

const itemQuery = ref('')
const suggestions = ref([])
const showDrop = ref(false)
function hideDrop() { setTimeout(() => { showDrop.value = false }, 150) }
function filterItems() {
  const q = itemQuery.value.trim().toLowerCase()
  suggestions.value = q ? props.catalogue.filter((i) => `${i.itemNo} ${i.description}`.toLowerCase().includes(q)).slice(0, 10) : []
}
function addFirst() { if (suggestions.value.length) addItem(suggestions.value[0]) }
function addItem(it) {
  if (!editor.data.lines.some((l) => l.itemNo === it.itemNo)) {
    editor.data.lines.push({
      itemNo: it.itemNo, description: it.description, unitOfMeasure: it.unitOfMeasure || 'KG',
      openingQty: 0, inQty: 0, recordedSalesQty: 0, recordedWriteOffQty: 0,
      salesQty: 0, writeOffQty: 0, countQty: null, unitPrice: Number(it.unitPrice || 0), comment: '',
    })
    // Saving pulls the item's opening / in / POS sales from the ledger.
    save(true)
  }
  itemQuery.value = ''; suggestions.value = []; showDrop.value = false
}
function removeLine(l) { editor.data.lines = editor.data.lines.filter((x) => x !== l) }

function exportSheetXlsx() {
  const s = editor.data
  const aoa = [
    ['Item', 'Description', 'UoM', 'Opening', 'In', 'Sales', 'POS sales', 'Write-off', 'Expected', 'Final count', 'Variance', 'Unit price', 'Variance value', 'Comment'],
    ...s.lines.map((l) => [l.itemNo, l.description, l.unitOfMeasure, num(l.openingQty), num(l.inQty), num(l.salesQty), num(l.recordedSalesQty),
      num(l.writeOffQty), expected(l), l.countQty == null ? '' : num(l.countQty), variance(l), num(l.unitPrice), variance(l) * num(l.unitPrice), l.comment || '']),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Stock sheet')
  XLSX.writeFile(wb, `stock-sheet-${s.shopCode}-${s.asAtDate}.xlsx`)
}

// ── Upload ──────────────────────────────────────────────────────────────────
const fileRef = ref(null)
const up = reactive({ visible: false, rows: [], parseError: '', autoPost: false, posting: false, result: null })
const upDates = computed(() => new Set(up.rows.map((r) => r.date)).size)
function openUpload() {
  Object.assign(up, { visible: true, rows: [], parseError: '', autoPost: false, posting: false, result: null })
  if (fileRef.value) fileRef.value.value = ''
}
function descFor(itemNo) { return props.catalogue.find((c) => c.itemNo === itemNo)?.description || '' }
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['date', 'itemNo', 'sales', 'writeOff', 'finalStock', 'comment'],
    [todayIso(), 'J31031706', 12.5, 0.4, 30, ''],
  ])
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stock sheet')
  XLSX.writeFile(wb, 'portioning-stock-sheet-template.xlsx')
}
function toIsoDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) return isoLocal(v)
  if (typeof v === 'number') {   // Excel serial date
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)   // DD/MM/YYYY (Kenyan convention)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
function onFile(ev) {
  up.parseError = ''; up.result = null; up.rows = []
  const file = ev.target?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onerror = () => { up.parseError = 'Could not read the file' }
  reader.onload = () => {
    try {
      const wb = XLSX.read(reader.result, { type: 'array', cellDates: true })
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
      const norm = (k) => String(k).toLowerCase().replace(/[^a-z]/g, '')
      const pick = (row, ...names) => {
        for (const [k, v] of Object.entries(row)) if (names.includes(norm(k))) return v
        return undefined
      }
      const numOrNull = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))
      const rows = []
      raw.forEach((r, i) => {
        const itemNo = String(pick(r, 'itemno', 'item', 'sku', 'no') ?? '').trim().toUpperCase()
        if (!itemNo) return
        const date = toIsoDate(pick(r, 'date', 'asat', 'asatdate', 'stockdate'))
        if (!date) { up.parseError = `Row ${i + 2}: unreadable date`; return }
        rows.push({
          date, itemNo,
          salesQty: numOrNull(pick(r, 'sales', 'salesqty', 'sold', 'qtysold')),
          writeOffQty: numOrNull(pick(r, 'writeoff', 'writeoffqty', 'writeoffs', 'waste')),
          countQty: numOrNull(pick(r, 'finalstock', 'stock', 'closingstock', 'count', 'countqty', 'stocktake')),
          comment: pick(r, 'comment', 'comments', 'notes') ?? null,
        })
      })
      up.rows = rows
      if (!rows.length && !up.parseError) up.parseError = 'No usable rows — check the header row (date, itemNo, …).'
    } catch (e) { up.parseError = e.message }
  }
  reader.readAsArrayBuffer(file)
}
async function doUpload() {
  up.posting = true; up.result = null
  try {
    const { data } = await yieldApi.uploadSheets({ rows: up.rows, autoPost: up.autoPost })
    up.result = { ...data, failed: data.errors.length + data.results.filter((r) => r.error).length }
    await load()
  } catch (e) { up.parseError = e.response?.data?.error ?? e.message }
  finally { up.posting = false }
}

function day(v) { return v ? String(v).slice(0, 10) : '' }
function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function varClass(v) { return Number(v) > 0.00005 ? 'num-neg' : Number(v) < -0.00005 ? 'num-pos' : '' }

onMounted(load)
defineExpose({ load })
</script>

<style scoped>
.panel-actions { display:flex; gap:8px; padding:8px 0 4px; align-items:center; flex-wrap:wrap; }
.filter-inline { display:flex; gap:6px; align-items:center; margin-left:auto; font-size:12px; color:#374151; }
.hint { margin:0 0 10px; }
.text-muted { color:#6b7280; }
.text-sm { font-size:13px; }
.date-in { padding:6px 8px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:#fff; color:#111827; }
.date-in.sm { padding:2px 6px; font-size:12px; }
.editor { display:flex; flex-direction:column; gap:10px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; }
.form-row { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
.form-row label { font-size:12px; font-weight:600; color:#374151; }
.line-add-row { display:flex; gap:8px; align-items:center; }
.line-add { position:relative; flex:1; }
.line-add-input { width:100%; padding:8px 10px; border:1.5px solid #d1d5db; border-radius:6px; font-size:13px; outline:none; background:#fff; color:#111827; }
.line-add-input.narrow { max-width:220px; }
.line-add-input:focus { border-color:#2563eb; }
.line-add-drop { position:absolute; top:100%; left:0; right:0; background:#fff; border:1.5px solid #d1d5db; border-radius:6px;
  box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:100; max-height:240px; overflow-y:auto; margin-top:4px; }
.line-add-opt { display:flex; justify-content:space-between; padding:8px 12px; cursor:pointer; border-bottom:1px solid #f3f4f6; font-size:13px; }
.line-add-opt:hover { background:#eff6ff; }
.line-add-name { font-weight:500; color:#111827; }
.line-add-no { color:#6b7280; font-size:12px; }
.sheet-scroll { max-height:58vh; overflow:auto; border:1px solid #e5e7eb; border-radius:8px; }
.sheet-table { width:100%; border-collapse:collapse; font-size:12.5px; color:#111827; background:#fff; }
.sheet-table th { position:sticky; top:0; background:#f3f4f6; font-weight:600; text-align:left; padding:7px 8px; border-bottom:1px solid #e5e7eb; white-space:nowrap; z-index:1; }
.sheet-table td { padding:5px 8px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
.sheet-table tfoot td { position:sticky; bottom:0; background:#f9fafb; border-top:1px solid #e5e7eb; }
.sheet-table .num { text-align:right; white-space:nowrap; }
.sheet-table .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; }
.sheet-table .empty-row { text-align:center; color:#9ca3af; padding:16px; font-style:italic; }
.qty-in { width:84px; padding:3px 6px; text-align:right; border:1px solid #d1d5db; border-radius:4px; font-size:12.5px; background:#fff; color:#111827; }
.qty-in.count { border-color:#93c5fd; background:#eff6ff; }
.cmt-in { width:150px; padding:3px 6px; border:1px solid #d1d5db; border-radius:4px; font-size:12.5px; background:#fff; color:#111827; }
.sub { font-size:10.5px; color:#6b7280; }
.num-neg { color:#b91c1c; font-weight:600; }
.num-pos { color:#15803d; font-weight:600; }
.err-text { color:#b91c1c; font-size:13px; margin-top:4px; }
.chk { display:flex; gap:6px; align-items:center; font-size:13px; color:#111827; }
</style>
