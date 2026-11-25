<template>
  <div class="report-panel">
    <div class="filters">
      <div class="filter-field"><label>From</label><input v-model="f.dateFrom" type="date" class="date-in" /></div>
      <div class="filter-field"><label>To</label><input v-model="f.dateTo" type="date" class="date-in" /></div>
      <div class="filter-field wide">
        <label>Items (source or portion)</label>
        <MultiSelect v-model="f.items" :options="itemOptions" option-label="label" option-value="value" filter
                     :max-selected-labels="2" placeholder="All items" display="chip" fluid :virtual-scroller-options="{ itemSize: 34 }" />
      </div>
      <div class="filter-field">
        <label>Source item</label>
        <Select v-model="f.sourceItemNo" :options="sourceOptions" option-label="label" option-value="value" filter show-clear
                placeholder="Any" fluid />
      </div>
      <div class="filter-field narrow">
        <label>Status</label>
        <Select v-model="f.status" :options="statusOpts" option-label="label" option-value="value" fluid />
      </div>
      <div class="filter-field">
        <label>Search</label>
        <InputText v-model="f.q" placeholder="No / description" fluid @keydown.enter="run" />
      </div>
      <label v-if="isManager" class="chk"><input v-model="f.allShops" type="checkbox" /> All shops</label>
      <label class="chk"><input v-model="f.varianceOnly" type="checkbox" /> Only items with variance</label>
      <Button label="Run" icon="pi pi-play" :loading="loading" @click="run" />
      <Button label="Excel" icon="pi pi-file-excel" severity="secondary" :disabled="!ran" @click="exportXlsx" />
      <Button label="PDF" icon="pi pi-file-pdf" severity="secondary" :disabled="!ran" @click="exportPdf" />
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error = ''">{{ error }}</Message>

    <div v-if="ran" class="kpis">
      <div class="kpi"><span>Portionings</span><strong>{{ portionings.length }}</strong></div>
      <div class="kpi"><span>Source qty</span><strong>{{ n(kpi.srcQty) }}</strong></div>
      <div class="kpi"><span>Portioned qty</span><strong>{{ n(kpi.outQty) }}</strong></div>
      <div class="kpi"><span>Yield</span><strong>{{ kpi.srcQty ? `${n(kpi.outQty / kpi.srcQty * 100)}%` : '—' }}</strong></div>
      <div class="kpi"><span>Cutting loss</span><strong :class="varClass(kpi.lossQty)">{{ n(kpi.lossQty) }}</strong></div>
      <div class="kpi"><span>Sales value</span><strong>{{ n(totals.salesValue) }}</strong></div>
      <div class="kpi"><span>Unaccounted qty</span><strong :class="varClass(totals.varianceQty)">{{ n(totals.varianceQty) }}</strong></div>
      <div class="kpi"><span>Unaccounted value</span><strong :class="varClass(totals.varianceValue)">{{ n(totals.varianceValue) }}</strong></div>
    </div>

    <div v-if="ran" class="view-toggle">
      <button :class="{ active: view === 'items' }" @click="view = 'items'">By item</button>
      <button :class="{ active: view === 'portionings' }" @click="view = 'portionings'">By portioning (yield)</button>
    </div>

    <DataTable v-if="ran && view === 'items'" :value="summaryRows" size="small" responsive-layout="scroll" removable-sort
               paginator :rows="50" :rows-per-page-options="[25, 50, 100, 500]">
      <Column field="itemNo" header="Item" sortable style="width:110px" />
      <Column field="description" header="Description" sortable style="min-width:200px" />
      <Column field="uom" header="UoM" style="width:60px" />
      <Column field="producedQty" header="Portioned" sortable class="num-col"><template #body="{ data }">{{ n(data.producedQty) }}</template></Column>
      <Column field="producedValue" header="Portioned value" sortable class="num-col"><template #body="{ data }">{{ n(data.producedValue) }}</template></Column>
      <Column field="salesQty" header="Sold" sortable class="num-col"><template #body="{ data }">{{ n(data.salesQty) }}</template></Column>
      <Column field="salesValue" header="Sales value" sortable class="num-col"><template #body="{ data }">{{ n(data.salesValue) }}</template></Column>
      <Column field="writeOffQty" header="Written off" sortable class="num-col"><template #body="{ data }">{{ n(data.writeOffQty) }}</template></Column>
      <Column field="finalStockQty" header="Final count" sortable class="num-col">
        <template #body="{ data }">{{ data.finalStockQty == null ? '—' : n(data.finalStockQty) }}<div v-if="data.lastCountDate" class="sub">{{ data.lastCountDate }}</div></template>
      </Column>
      <Column field="varianceQty" header="Unaccounted" sortable class="num-col">
        <template #body="{ data }"><strong :class="varClass(data.varianceQty)">{{ n(data.varianceQty) }}</strong></template>
      </Column>
      <Column field="varianceValue" header="Unaccounted value" sortable class="num-col">
        <template #body="{ data }"><strong :class="varClass(data.varianceValue)">{{ n(data.varianceValue) }}</strong></template>
      </Column>
      <ColumnGroup type="footer">
        <Row>
          <Column footer="Totals" :colspan="3" />
          <Column :footer="n(totals.producedQty)" class="num-col" />
          <Column :footer="n(totals.producedValue)" class="num-col" />
          <Column :footer="n(totals.salesQty)" class="num-col" />
          <Column :footer="n(totals.salesValue)" class="num-col" />
          <Column :footer="n(totals.writeOffQty)" class="num-col" />
          <Column :footer="n(totals.finalStockQty)" class="num-col" />
          <Column :footer="n(totals.varianceQty)" class="num-col" />
          <Column :footer="n(totals.varianceValue)" class="num-col" />
        </Row>
      </ColumnGroup>
      <template #empty><div class="empty">No items match these filters.</div></template>
    </DataTable>

    <DataTable v-if="ran && view === 'portionings'" :value="portionings" v-model:expanded-rows="expanded" data-key="portioningId"
               size="small" responsive-layout="scroll" removable-sort paginator :rows="50">
      <Column expander style="width:40px" />
      <Column field="portioningDate" header="Date" sortable style="width:100px" />
      <Column field="portioningNo" header="No" sortable style="width:150px" />
      <Column field="shopCode" header="Shop" sortable style="width:70px" />
      <Column field="sourceDocNo" header="From" sortable style="width:150px" />
      <Column field="sourceDescription" header="Source item" sortable style="min-width:180px">
        <template #body="{ data }">{{ data.sourceDescription }} <span class="sub">{{ data.sourceItemNo }}</span></template>
      </Column>
      <Column field="sourceQty" header="Source qty" sortable class="num-col"><template #body="{ data }">{{ n(data.sourceQty) }}</template></Column>
      <Column field="sourceCost" header="Source cost" sortable class="num-col"><template #body="{ data }">{{ n(data.sourceCost) }}</template></Column>
      <Column field="outputQty" header="Portioned qty" sortable class="num-col"><template #body="{ data }">{{ n(data.outputQty) }}</template></Column>
      <Column field="outputValue" header="Portioned value" sortable class="num-col"><template #body="{ data }">{{ n(data.outputValue) }}</template></Column>
      <Column field="yieldPct" header="Yield %" sortable class="num-col"><template #body="{ data }">{{ data.yieldPct == null ? '—' : n(data.yieldPct) }}</template></Column>
      <Column field="lossQty" header="Loss qty" sortable class="num-col">
        <template #body="{ data }"><span :class="varClass(data.lossQty)">{{ n(data.lossQty) }}</span></template>
      </Column>
      <Column field="status" header="Status" style="width:80px">
        <template #body="{ data }"><Tag :value="data.status" :severity="data.status === 'posted' ? 'success' : 'info'" /></template>
      </Column>
      <template #expansion="{ data }">
        <table class="mini">
          <thead><tr><th>Portion</th><th>Description</th><th class="num">Qty</th><th>UoM</th><th class="num">Value</th></tr></thead>
          <tbody>
            <tr v-for="l in data.lines" :key="l.itemNo"><td>{{ l.itemNo }}</td><td>{{ l.description }}</td><td class="num">{{ n(l.quantity) }}</td><td>{{ l.uom }}</td><td class="num">{{ n(l.value) }}</td></tr>
          </tbody>
        </table>
      </template>
      <template #empty><div class="empty">No portionings match these filters.</div></template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ColumnGroup from 'primevue/columngroup'
import Row from 'primevue/row'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { yieldApi } from '@/services/pos.js'

const props = defineProps({
  catalogue: { type: Array, default: () => [] },
  isManager: { type: Boolean, default: false },
})

function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const now = new Date()
const f = reactive({
  dateFrom: isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
  dateTo: isoLocal(now),
  items: [], sourceItemNo: null, status: 'posted', q: '', allShops: false, varianceOnly: false,
})
const statusOpts = [
  { label: 'Posted', value: 'posted' }, { label: 'Draft', value: 'draft' }, { label: 'All', value: 'all' },
]

const loading = ref(false)
const ran = ref(false)
const error = ref('')
const view = ref('items')
const expanded = ref({})
const summary = ref([])
const portionings = ref([])
const seenSources = ref([])

const itemOptions = computed(() => props.catalogue.map((i) => ({ label: `${i.itemNo} — ${i.description}`, value: i.itemNo })))
const sourceOptions = computed(() => {
  const m = new Map(seenSources.value.map((s) => [s.itemNo, s.description]))
  return [...m.entries()].map(([value, d]) => ({ label: `${value} — ${d}`, value }))
})

const summaryRows = computed(() => f.varianceOnly
  ? summary.value.filter((r) => Math.abs(Number(r.varianceQty || 0)) > 0.00005)
  : summary.value)
const totals = computed(() => {
  const t = { producedQty: 0, producedValue: 0, salesQty: 0, salesValue: 0, writeOffQty: 0, finalStockQty: 0, varianceQty: 0, varianceValue: 0 }
  for (const r of summaryRows.value) for (const k of Object.keys(t)) t[k] += Number(r[k] || 0)
  return t
})
const kpi = computed(() => portionings.value.reduce((a, p) => {
  a.srcQty += p.sourceQty; a.outQty += p.outputQty; a.lossQty += p.lossQty; return a
}, { srcQty: 0, outQty: 0, lossQty: 0 }))

async function run() {
  loading.value = true; error.value = ''
  try {
    const { data } = await yieldApi.portioningReport({
      dateFrom: f.dateFrom, dateTo: f.dateTo,
      items: f.items.join(',') || undefined,
      sourceItemNo: f.sourceItemNo || undefined,
      status: f.status, q: f.q || undefined,
      allShops: f.allShops ? '1' : undefined,
    })
    summary.value = data.summary || []
    portionings.value = data.portionings || []
    const known = new Map(seenSources.value.map((s) => [s.itemNo, s]))
    for (const p of portionings.value) known.set(p.sourceItemNo, { itemNo: p.sourceItemNo, description: p.sourceDescription })
    seenSources.value = [...known.values()]
    ran.value = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.value = false }
}

function filterText() {
  const parts = [`${f.dateFrom} to ${f.dateTo}`, `status: ${f.status}`]
  if (f.items.length) parts.push(`items: ${f.items.join(', ')}`)
  if (f.sourceItemNo) parts.push(`source: ${f.sourceItemNo}`)
  if (f.q) parts.push(`search: ${f.q}`)
  if (f.allShops) parts.push('all shops')
  if (f.varianceOnly) parts.push('variance only')
  return parts.join(' · ')
}
const SUM_COLS = [
  ['itemNo', 'Item'], ['description', 'Description'], ['uom', 'UoM'], ['producedQty', 'Portioned'], ['producedValue', 'Portioned value'],
  ['salesQty', 'Sold'], ['salesValue', 'Sales value'], ['writeOffQty', 'Written off'], ['finalStockQty', 'Final count'],
  ['varianceQty', 'Unaccounted'], ['varianceValue', 'Unaccounted value'],
]
const PORT_COLS = [
  ['portioningDate', 'Date'], ['portioningNo', 'No'], ['shopCode', 'Shop'], ['sourceDocNo', 'From'], ['sourceItemNo', 'Source item'],
  ['sourceDescription', 'Source description'], ['sourceQty', 'Source qty'], ['sourceCost', 'Source cost'], ['outputQty', 'Portioned qty'],
  ['outputValue', 'Portioned value'], ['yieldPct', 'Yield %'], ['lossQty', 'Loss qty'], ['lossValue', 'Loss value'], ['status', 'Status'],
]
function exportXlsx() {
  const wb = XLSX.utils.book_new()
  const sumAoa = [[`Portioning report — ${filterText()}`], [], SUM_COLS.map((c) => c[1]),
    ...summaryRows.value.map((r) => SUM_COLS.map(([k]) => r[k] ?? '')),
    ['Totals', '', '', totals.value.producedQty, totals.value.producedValue, totals.value.salesQty, totals.value.salesValue,
      totals.value.writeOffQty, totals.value.finalStockQty, totals.value.varianceQty, totals.value.varianceValue]]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumAoa), 'By item')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PORT_COLS.map((c) => c[1]),
    ...portionings.value.map((p) => PORT_COLS.map(([k]) => p[k] ?? ''))]), 'By portioning')
  const lines = [['Date', 'No', 'Shop', 'Source item', 'Portion item', 'Description', 'Qty', 'UoM', 'Value']]
  for (const p of portionings.value) for (const l of p.lines) lines.push([p.portioningDate, p.portioningNo, p.shopCode, p.sourceItemNo, l.itemNo, l.description, l.quantity, l.uom, l.value])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lines), 'Portion lines')
  XLSX.writeFile(wb, `portioning-report-${f.dateFrom}_${f.dateTo}.xlsx`)
}
function exportPdf() {
  const pdf = new jsPDF('l', 'mm', 'a4')
  pdf.setFontSize(14); pdf.text('Portioning Report', 14, 14)
  pdf.setFontSize(9); pdf.text(filterText(), 14, 20)
  const fmt = (k, v) => (typeof v === 'number' ? n(v) : (v ?? ''))
  pdf.autoTable({
    head: [SUM_COLS.map((c) => c[1])],
    body: summaryRows.value.map((r) => SUM_COLS.map(([k]) => (k === 'finalStockQty' && r[k] == null ? '—' : fmt(k, r[k])))),
    foot: [['Totals', '', '', n(totals.value.producedQty), n(totals.value.producedValue), n(totals.value.salesQty), n(totals.value.salesValue),
      n(totals.value.writeOffQty), n(totals.value.finalStockQty), n(totals.value.varianceQty), n(totals.value.varianceValue)]],
    startY: 25, styles: { fontSize: 7.5 }, headStyles: { fillColor: [15, 113, 115] }, footStyles: { fillColor: [229, 231, 235], textColor: 20 },
    columnStyles: Object.fromEntries(SUM_COLS.map((c, i) => [i, i >= 3 ? { halign: 'right' } : {}])),
  })
  if (portionings.value.length) {
    pdf.addPage()
    pdf.setFontSize(12); pdf.text('Yield by portioning', 14, 14)
    const cols = PORT_COLS.filter(([k]) => k !== 'sourceDescription')
    pdf.autoTable({
      head: [cols.map((c) => c[1])],
      body: portionings.value.map((p) => cols.map(([k]) => (k === 'yieldPct' && p[k] == null ? '—' : fmt(k, p[k])))),
      startY: 19, styles: { fontSize: 7.5 }, headStyles: { fillColor: [15, 113, 115] },
    })
  }
  pdf.save(`portioning-report-${f.dateFrom}_${f.dateTo}.pdf`)
}

function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function varClass(v) { return Number(v) > 0.00005 ? 'num-neg' : Number(v) < -0.00005 ? 'num-pos' : '' }

onMounted(run)
</script>

<style scoped>
.filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; padding:8px 0 12px; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:150px; }
.filter-field.wide { min-width:260px; max-width:340px; }
.filter-field.narrow { min-width:110px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }
.date-in { padding:7px 8px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:#fff; color:#111827; }
.chk { display:flex; gap:6px; align-items:center; font-size:13px; color:#111827; padding-bottom:8px; }
.kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-bottom:12px; }
.kpi { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; }
.kpi span { font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:.03em; }
.kpi strong { font-size:16px; color:#111827; }
.view-toggle { display:flex; gap:4px; margin-bottom:8px; }
.view-toggle button { padding:6px 12px; border:1px solid #d1d5db; background:#fff; color:#374151; border-radius:6px; font-size:13px; cursor:pointer; }
.view-toggle button.active { background:#1d4ed8; border-color:#1d4ed8; color:#fff; }
.report-panel :deep(.num-col) { text-align:right; }
.sub { font-size:11px; color:#6b7280; }
.num-neg { color:#b91c1c; }
.num-pos { color:#15803d; }
.empty { padding:20px; text-align:center; color:#9ca3af; }
.mini { width:100%; border-collapse:collapse; font-size:12.5px; margin:4px 0 4px 40px; max-width:760px; }
.mini th, .mini td { padding:4px 8px; border-bottom:1px solid #f3f4f6; text-align:left; }
.mini .num { text-align:right; }
</style>
