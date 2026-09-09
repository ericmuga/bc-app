<template>
  <div class="sp-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Stock Position by Location</h2>
        <p class="text-muted text-sm">
          Opening balance at a location by item, movements broken out by entry type (± per type),
          and the closing position. Opening + movements = closing. Toggle Quantity / Cost.
        </p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-2">{{ error }}</Message>

    <!-- ── Filters ─────────────────────────────────────────────────────────── -->
    <section class="card filters">
      <div class="f-row">
        <div class="f grow"><label>Location(s) *</label>
          <MultiSelect v-model="f.locations" :options="dims.locations" optionLabel="label" optionValue="code"
            :filterFields="['code','name']" placeholder="Pick a location" filter display="chip" fluid :maxSelectedLabels="4" />
        </div>
        <div class="f"><label>Opening as at</label><DatePicker v-model="from" dateFormat="yy-mm-dd" showIcon fluid /></div>
        <div class="f"><label>Closing as at</label><DatePicker v-model="to" dateFormat="yy-mm-dd" showIcon fluid /></div>
      </div>
      <div class="f-row">
        <div class="f"><label>Company</label>
          <MultiSelect v-model="f.companies" :options="dims.companies" placeholder="All" filter display="chip" fluid />
        </div>
        <div class="f grow"><label>Inventory posting groups</label>
          <MultiSelect v-model="f.postingGroups" :options="dims.postingGroups" placeholder="All groups" filter display="chip" fluid :maxSelectedLabels="6" />
        </div>
        <div class="f grow"><label>Items</label>
          <MultiSelect v-model="f.items" :options="itemOptions" optionLabel="label" optionValue="no"
            placeholder="All items" filter display="chip" fluid :maxSelectedLabels="4" :loading="itemsLoading"
            :filterFields="['no','name']" :virtualScrollerOptions="{ itemSize: 36 }" resetFilterOnHide />
        </div>
        <div class="f run">
          <Button label="Run" icon="pi pi-play" :loading="loading" @click="run" />
          <Button label="Excel" icon="pi pi-file-excel" severity="secondary" outlined :disabled="!rows.length" @click="exportXlsx" />
        </div>
      </div>
    </section>

    <div v-if="result" class="bar-row">
      <span class="bl">Metric</span>
      <SelectButton v-model="metric" :options="METRICS" optionLabel="label" optionValue="key" :allowEmpty="false" />
      <span class="bl">View</span>
      <SelectButton v-model="viewType" :options="VIEWS" optionLabel="label" optionValue="key" :allowEmpty="false" />
      <label class="top-chk"><input type="checkbox" v-model="topOnly" /> Top 20</label>
      <span class="asof text-muted text-sm">
        Opening &lt; <b>{{ result.dateFrom }}</b> · movements <b>{{ result.dateFrom }}</b> → <b>{{ result.dateTo }}</b> · {{ result.rowCount }} item(s)
      </span>
    </div>

    <!-- ── Chart view (closing position by item) ───────────────────────────── -->
    <section v-if="result && rows.length && viewType !== 'table'" class="card">
      <p class="text-muted text-sm mb-2"><b>Closing {{ metricLabel }}</b> by item{{ topOnly ? ' — top 20' : '' }}</p>
      <InventoryChart :type="viewType" :categories="chartCategories" :metricLabel="'Closing ' + metricLabel" :valueFmt="fmt" />
    </section>

    <!-- ── Stock card (one metric at a time) ───────────────────────────────── -->
    <section v-if="result && rows.length && viewType === 'table'" class="card report-wrap">
      <DataTable :value="viewRows" v-model:filters="filters" filterDisplay="menu" size="small" scrollable scrollHeight="560px"
                 :loading="loading" removableSort sortField="close" :sortOrder="-1"
                 :paginator="!topOnly" :rows="100" :rowsPerPageOptions="[100,250,500]">
        <Column field="item" header="Item" frozen sortable :showFilterMatchModes="false" style="min-width:230px">
          <template #body="{ data }"><span class="it">{{ data.item }}</span><span v-if="data.itemName" class="itn"> — {{ data.itemName }}</span></template>
          <template #filter="{ filterModel }"><InputText v-model="filterModel.value" placeholder="item / name" /></template>
          <template #footer>TOTAL</template>
        </Column>
        <Column v-if="multiLoc" field="location" header="Loc" sortable :showFilterMatchModes="false" style="min-width:90px">
          <template #filter="{ filterModel }"><InputText v-model="filterModel.value" placeholder="location" /></template>
        </Column>
        <Column field="opening" header="Opening" sortable dataType="numeric" class="num" headerClass="num-h">
          <template #body="{ data }">{{ fmt(data.opening) }}</template>
          <template #filter="{ filterModel }"><InputNumber v-model="filterModel.value" placeholder="≥" /></template>
          <template #footer>{{ fmt(dTotals.opening) }}</template>
        </Column>
        <Column v-for="et in etPresent" :key="et.code" :field="'et' + et.code" :header="et.name" sortable dataType="numeric" class="num" headerClass="num-h">
          <template #body="{ data }"><span :class="signCls(data['et' + et.code])">{{ fmt(data['et' + et.code]) }}</span></template>
          <template #filter="{ filterModel }"><InputNumber v-model="filterModel.value" placeholder="≥" /></template>
          <template #footer><span :class="signCls(dTotals['et' + et.code])">{{ fmt(dTotals['et' + et.code]) }}</span></template>
        </Column>
        <Column field="close" header="Closing" sortable dataType="numeric" class="num close-col" headerClass="num-h close-col">
          <template #body="{ data }">{{ fmt(data.close) }}</template>
          <template #filter="{ filterModel }"><InputNumber v-model="filterModel.value" placeholder="≥" /></template>
          <template #footer>{{ fmt(dTotals.close) }}</template>
        </Column>
      </DataTable>
      <p class="text-muted text-sm legend-note">Showing <b>{{ metricLabel }}</b>. Green = increase, red = decrease. Click a header to sort; use the funnel to filter (≥ value).</p>
    </section>

    <div v-else-if="result" class="empty text-muted">No stock or movements for this location in the period.</div>
    <div v-else class="empty text-muted">Pick a location and press <b>Run</b>.</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import DataTable   from 'primevue/datatable'
import Column      from 'primevue/column'
import Button      from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import SelectButton from 'primevue/selectbutton'
import DatePicker  from 'primevue/datepicker'
import InputText   from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message     from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import XLSX from 'xlsx-js-style'
import InventoryChart from '@/components/InventoryChart.vue'
import { warehouseApi } from '@/services/warehouse.js'

const toast = useToast()
const METRICS = [{ key: 'qty', label: 'Quantity' }, { key: 'cost', label: 'Cost' }]
const VIEWS = [{ key: 'table', label: 'Table' }, { key: 'bar', label: 'Bar' }, { key: 'pie', label: 'Pie' }]

const error = ref('')
const loading = ref(false)
const dims = reactive({ companies: [], locations: [], postingGroups: [], entryTypes: [] })
const f = reactive({ locations: [], companies: [], postingGroups: [], items: [] })
const itemOptions = ref([])
const itemsLoading = ref(false)
const metric = ref('qty')
const viewType = ref('table')
const topOnly = ref(false)

const today = new Date()
const to = ref(new Date(today))
const from = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const result = ref(null)
const rows = computed(() => result.value?.rows || [])
const etPresent = computed(() => result.value?.entryTypesPresent || [])
const multiLoc = computed(() => (f.locations?.length || 0) !== 1)
const metricLabel = computed(() => metric.value === 'qty' ? 'Quantity' : 'Cost')

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })
const ymd = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : d
const signCls = (v) => v < 0 ? 'neg' : v > 0 ? 'pos' : 'zero'
const pick = (o, k) => metric.value === 'qty' ? o[k + 'Qty'] : o[k + 'Cost']

// Flatten to plain per-metric fields so every column sorts & filters natively.
const displayRows = computed(() => rows.value.map((r) => {
  const o = { item: r.item, itemName: r.itemName, location: r.location, opening: pick(r, 'open'), close: pick(r, 'close') }
  for (const et of etPresent.value) o['et' + et.code] = metric.value === 'qty' ? r.mov[et.code].qty : r.mov[et.code].cost
  return o
}))
const dTotals = computed(() => {
  const t = result.value?.totals
  if (!t) return { opening: 0, close: 0 }
  const o = { opening: metric.value === 'qty' ? t.openQty : t.openCost, close: metric.value === 'qty' ? t.closeQty : t.closeCost }
  for (const et of etPresent.value) o['et' + et.code] = metric.value === 'qty' ? t.mov[et.code].qty : t.mov[et.code].cost
  return o
})

// Quick Top-20 by closing magnitude (in the selected metric).
const viewRows = computed(() => {
  if (!topOnly.value) return displayRows.value
  return [...displayRows.value].sort((a, b) => Math.abs(Number(b.close || 0)) - Math.abs(Number(a.close || 0))).slice(0, 20)
})
// Chart categories: closing position per item.
const chartCategories = computed(() => viewRows.value.map((r) => ({
  label: r.item + (r.itemName ? ' — ' + r.itemName : ''), value: Number(r.close || 0),
})))

const filters = ref({})
function buildFilters() {
  const base = {
    item:     { value: null, matchMode: 'contains' },
    location: { value: null, matchMode: 'contains' },
    opening:  { value: null, matchMode: 'gte' },
    close:    { value: null, matchMode: 'gte' },
  }
  for (const et of etPresent.value) base['et' + et.code] = { value: null, matchMode: 'gte' }
  filters.value = base
}

async function loadDims() {
  try { Object.assign(dims, (await warehouseApi.invDimensions()).data) }
  catch (e) { error.value = e.response?.data?.error || e.message }
}
async function loadItems() {
  itemsLoading.value = true
  try {
    itemOptions.value = (await warehouseApi.invItems(f.companies.join(',') || undefined)).data.items || []
    const keep = new Set(itemOptions.value.map(i => i.no)); f.items = f.items.filter(x => keep.has(x))
  } catch { /* non-fatal */ } finally { itemsLoading.value = false }
}
watch(() => f.companies.slice().sort().join(','), loadItems)

async function run() {
  if (!f.locations.length) { error.value = 'Pick at least one location.'; return }
  loading.value = true; error.value = ''
  try {
    const { data } = await warehouseApi.invStockCard({
      locations: f.locations, dateFrom: ymd(from.value), dateTo: ymd(to.value),
      companies: f.companies, postingGroups: f.postingGroups, items: f.items,
    })
    result.value = data
    buildFilters()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

function exportXlsx() {
  const ets = etPresent.value
  const head = ['Location', 'Item', 'Name', 'Open Qty', 'Open Cost']
  for (const e of ets) head.push(`${e.name} Qty`, `${e.name} Cost`)
  head.push('Close Qty', 'Close Cost')
  const body = rows.value.map((r) => {
    const line = [r.location, r.item, r.itemName, r.openQty, r.openCost]
    for (const e of ets) line.push(r.mov[e.code].qty, r.mov[e.code].cost)
    line.push(r.closeQty, r.closeCost)
    return line
  })
  const t = result.value.totals
  const tot = ['', 'TOTAL', '', t.openQty, t.openCost]
  for (const e of ets) tot.push(t.mov[e.code].qty, t.mov[e.code].cost)
  tot.push(t.closeQty, t.closeCost)
  const ws = XLSX.utils.aoa_to_sheet([head, ...body, tot])
  for (let c = 0; c < head.length; c++) { const ref = XLSX.utils.encode_cell({ r: 0, c }); if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1D4ED8' } } } }
  ws['!freeze'] = { xSplit: 2, ySplit: 1 }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stock Position')
  XLSX.writeFile(wb, `stock-position-${(f.locations[0] || 'loc')}-${ymd(to.value)}.xlsx`)
  toast.add({ severity: 'success', summary: 'Exported', life: 3000 })
}

onMounted(async () => { await loadDims(); await loadItems() })
</script>

<style scoped>
.sp-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; background: #151b28; min-height: 100%; color: #e8eef7; }
.page-title { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #f8fafc; }
.text-muted { color: #94a6bf; } .text-sm { font-size: 13px; } .mb-2 { margin-bottom: 8px; }
.card { background: #1b2233; border: 1px solid #324256; border-radius: 10px; padding: 14px 16px; }
.filters .f-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.filters .f-row:last-child { margin-bottom: 0; }
.f { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
.f.grow { flex: 1 1 240px; }
.f.run { flex-direction: row; align-items: flex-end; gap: 8px; margin-left: auto; }
.f label { font-size: 11px; font-weight: 700; color: #94a6bf; text-transform: uppercase; letter-spacing: .04em; }
.bar-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bl { font-size: 11px; font-weight: 700; color: #94a6bf; text-transform: uppercase; letter-spacing: .04em; }
.top-chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #e8eef7; cursor: pointer; }
.asof { padding: 0 2px; }
.report-wrap { padding: 10px 12px; }
.legend-note { margin: 8px 2px 0; }
.it { font-weight: 600; color: #f8fafc; } .itn { color: #94a6bf; }
.empty { padding: 24px; text-align: center; color: #94a6bf; }
.pos { color: #4ade80; } .neg { color: #f87171; } .zero { color: #cbd6e6; }

/* ── Dark navy DataTable ─────────────────────────────────────────────────── */
:deep(.p-datatable), :deep(.p-datatable-table-container), :deep(.p-datatable-table), :deep(.p-datatable-tbody > tr) { background: #1b2233 !important; }
:deep(.p-datatable-tbody > tr > td) { color: #f8fafc !important; background: #1b2233 !important; padding: 5px 10px !important; border-color: #324256 !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background: #212a3d !important; }
:deep(.p-datatable-tbody > tr:hover > td) { background: rgba(255,255,255,0.06) !important; }
:deep(.p-datatable-thead > tr > th) { background: #243247 !important; color: #f8fafc !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .03em; padding: 8px 10px !important; border-color: #324256 !important; position: sticky; top: 0; z-index: 3; }
:deep(td.num), :deep(.num) { text-align: right; font-variant-numeric: tabular-nums; }
:deep(th.num-h .p-datatable-column-header-content) { justify-content: flex-end; }
:deep(.p-datatable-tfoot > tr > td) { position: sticky; bottom: 0; z-index: 3; background: #243247 !important; color: #fff !important; border-color: #324256 !important; padding: 6px 10px !important; font-weight: 700; text-align: right; }
:deep(.p-datatable-frozen-column) { background: #1b2233 !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td.p-datatable-frozen-column) { background: #212a3d !important; }
:deep(td.close-col), :deep(th.close-col) { background: #1e2b45 !important; }
:deep(.p-paginator) { background: #1b2233 !important; color: #f8fafc !important; border-color: #324256 !important; }
</style>
