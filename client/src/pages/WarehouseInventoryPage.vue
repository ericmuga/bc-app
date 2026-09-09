<template>
  <div class="inv-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Inventory Analytics</h2>
        <p class="text-muted text-sm">
          Item-ledger statistics from the warehouse (FCLWHS) — by location, item, posting group,
          entry type, spread over time. Quantity, cost and sales value.
        </p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-2">{{ error }}</Message>

    <!-- ── Filters ─────────────────────────────────────────────────────────── -->
    <section class="card filters">
      <div class="f-row">
        <div class="f"><label>From</label><DatePicker v-model="from" dateFormat="yy-mm-dd" showIcon fluid /></div>
        <div class="f"><label>To</label><DatePicker v-model="to" dateFormat="yy-mm-dd" showIcon fluid /></div>
        <div class="f"><label>Company</label>
          <MultiSelect v-model="f.companies" :options="dims.companies" placeholder="All" filter display="chip" fluid />
        </div>
        <div class="f"><label>Entry types</label>
          <MultiSelect v-model="f.entryTypes" :options="dims.entryTypes" optionLabel="name" optionValue="code" placeholder="All" display="chip" fluid />
        </div>
      </div>
      <div class="f-row">
        <div class="f grow"><label>Locations</label>
          <MultiSelect v-model="f.locations" :options="dims.locations" optionLabel="label" optionValue="code" :filterFields="['code','name']" placeholder="All locations" filter display="chip" fluid :maxSelectedLabels="6" />
        </div>
        <div class="f grow"><label>Inventory posting groups</label>
          <MultiSelect v-model="f.postingGroups" :options="dims.postingGroups" placeholder="All groups" filter display="chip" fluid :maxSelectedLabels="6" />
        </div>
        <div class="f grow"><label>Items</label>
          <MultiSelect v-model="f.items" :options="itemOptions" optionLabel="label" optionValue="no"
            placeholder="All items" filter display="chip" fluid :maxSelectedLabels="4" :loading="itemsLoading"
            :filterFields="['no','name']" :virtualScrollerOptions="{ itemSize: 36 }" resetFilterOnHide />
        </div>
      </div>
    </section>

    <!-- ── Shape ───────────────────────────────────────────────────────────── -->
    <section class="card shape">
      <div class="s"><label>View</label>
        <SelectButton v-model="viewType" :options="VIEWS" optionLabel="label" optionValue="key" :allowEmpty="false" />
      </div>
      <div class="s"><label>Group by</label>
        <MultiSelect v-model="groupBy" :options="DIMS" optionLabel="label" optionValue="key" display="chip" placeholder="Pick dimensions" fluid />
      </div>
      <div class="s"><label>Date spread</label>
        <SelectButton v-model="granularity" :options="GRAINS" optionLabel="label" optionValue="key" :allowEmpty="false" />
      </div>
      <div class="s"><label>Metric</label>
        <SelectButton v-model="metric" :options="METRICS" optionLabel="label" optionValue="key" :allowEmpty="false" />
      </div>
      <div class="s"><label>Rows</label>
        <label class="top-chk"><input type="checkbox" v-model="topOnly" /> Top 20</label>
      </div>
      <div class="s run">
        <Button label="Run report" icon="pi pi-play" :loading="loading" @click="run" />
        <Button label="Excel" icon="pi pi-file-excel" severity="secondary" outlined :disabled="!rows.length" @click="exportXlsx" />
      </div>
    </section>

    <!-- ── Totals ──────────────────────────────────────────────────────────── -->
    <section v-if="result" class="totals">
      <div class="tot"><span>Quantity</span><b>{{ fmt(result.totals.quantity) }}</b></div>
      <div class="tot"><span>Cost</span><b>{{ fmt(result.totals.cost) }}</b></div>
      <div class="tot"><span>Sales</span><b>{{ fmt(result.totals.sales) }}</b></div>
      <div class="tot"><span>Entries</span><b>{{ fmt(result.totals.entries) }}</b></div>
      <div class="tot muted"><span>Rows</span><b>{{ result.rowCount }}</b></div>
    </section>

    <!-- ── Chart views ─────────────────────────────────────────────────────── -->
    <section v-if="result && viewType !== 'table' && rows.length" class="card">
      <p class="text-muted text-sm mb-2">
        <b>{{ metricLabel }}</b>
        <template v-if="viewType === 'line'"> over time · one line per {{ groupLabel }}</template>
        <template v-else> by {{ groupLabel }}</template>
      </p>
      <InventoryChart :type="viewType" :categories="chartCategories" :xLabels="buckets"
        :series="chartSeries" :metricLabel="metricLabel" :valueFmt="fmt" />
    </section>

    <!-- ── Flat table (no date spread) ─────────────────────────────────────── -->
    <section v-if="result && viewType === 'table' && granularity === 'none'" class="card">
      <DataTable :value="flatRows" size="small" scrollable scrollHeight="520px" :loading="loading" removableSort :paginator="!topOnly" :rows="50" :rowsPerPageOptions="[50,100,250]">
        <Column v-for="d in activeDims" :key="d.key" :field="d.key" :header="d.label" sortable>
          <template #body="{ data }">{{ dimVal(data, d.key) }}</template>
        </Column>
        <Column field="quantity" header="Quantity" sortable class="num" headerClass="num-h"><template #body="{ data }">{{ fmt(data.quantity) }}</template></Column>
        <Column field="cost"     header="Cost"     sortable class="num" headerClass="num-h"><template #body="{ data }">{{ fmt(data.cost) }}</template></Column>
        <Column field="sales"    header="Sales"    sortable class="num" headerClass="num-h"><template #body="{ data }">{{ fmt(data.sales) }}</template></Column>
        <Column field="entries"  header="Entries"  sortable class="num" headerClass="num-h"><template #body="{ data }">{{ fmt(data.entries) }}</template></Column>
      </DataTable>
    </section>

    <!-- ── Pivot table (spread by date) ────────────────────────────────────── -->
    <section v-if="result && viewType === 'table' && granularity !== 'none'" class="card">
      <p class="text-muted text-sm mb-2">Cells show <b>{{ metricLabel }}</b> · {{ granularity }} buckets.</p>
      <div class="pivot-wrap">
        <DataTable :value="pivotTop" size="small" scrollable scrollHeight="520px" :loading="loading" :paginator="!topOnly" :rows="50" :rowsPerPageOptions="[50,100,250]">
          <Column field="__label" header="" frozen style="min-width:220px">
            <template #body="{ data }"><span class="pivot-label">{{ data.__label }}</span></template>
          </Column>
          <Column v-for="b in buckets" :key="b" :field="b" :header="b" class="num" headerClass="num-h">
            <template #body="{ data }">{{ data[b] ? fmt(data[b]) : '' }}</template>
          </Column>
          <Column field="__total" header="Total" class="num total-col" headerClass="num-h total-col"><template #body="{ data }">{{ fmt(data.__total) }}</template></Column>
        </DataTable>
      </div>
    </section>

    <div v-if="result && !rows.length" class="empty text-muted">No movements match these filters.</div>
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
import Message     from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import XLSX from 'xlsx-js-style'
import InventoryChart from '@/components/InventoryChart.vue'
import { warehouseApi } from '@/services/warehouse.js'

const toast = useToast()

const DIMS = [
  { key: 'location',     label: 'Location' },
  { key: 'item',         label: 'Item' },
  { key: 'postingGroup', label: 'Posting Group' },
  { key: 'entryType',    label: 'Entry Type' },
  { key: 'company',      label: 'Company' },
]
const GRAINS = [
  { key: 'none', label: 'None' }, { key: 'day', label: 'Day' }, { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' },
]
const METRICS = [
  { key: 'quantity', label: 'Quantity' }, { key: 'cost', label: 'Cost' }, { key: 'sales', label: 'Sales' },
]
const VIEWS = [
  { key: 'table', label: 'Table' }, { key: 'bar', label: 'Bar' }, { key: 'line', label: 'Line' }, { key: 'pie', label: 'Pie' },
]

const error = ref('')
const loading = ref(false)
const dims = reactive({ companies: [], locations: [], postingGroups: [], entryTypes: [] })
const f = reactive({ companies: [], locations: [], postingGroups: [], entryTypes: [], items: [] })
const itemOptions = ref([])
const itemsLoading = ref(false)
const groupBy = ref(['location', 'entryType'])
const granularity = ref('none')
const metric = ref('quantity')
const viewType = ref('table')
const topOnly = ref(false)

const today = new Date()
const to = ref(new Date(today))
const from = ref(new Date(today.getTime() - 90 * 86400000))

const result = ref(null)
const rows = computed(() => result.value?.rows || [])
// Quick Top-20: the 20 rows with the largest magnitude in the selected metric.
const flatRows = computed(() => {
  if (!topOnly.value) return rows.value
  return [...rows.value].sort((a, b) => Math.abs(Number(b[metric.value] || 0)) - Math.abs(Number(a[metric.value] || 0))).slice(0, 20)
})
const activeDims = computed(() => DIMS.filter(d => (result.value?.dims || []).includes(d.key)))
const metricLabel = computed(() => METRICS.find(m => m.key === metric.value)?.label || 'Quantity')
const groupLabel = computed(() => activeDims.value.map(d => d.label).join(' · ') || 'Location')

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })
const ymd = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : d
function dimVal(row, key) {
  if (key === 'entryType') return row.entryTypeName ?? row.entryType
  if (key === 'item') return row.item + (row.itemName ? ` — ${row.itemName}` : '')
  if (key === 'location') return row.location + (row.locationName ? ` — ${row.locationName}` : '')
  return row[key] ?? ''
}

async function loadDims() {
  try {
    const { data } = await warehouseApi.invDimensions()
    Object.assign(dims, data)
  } catch (e) { error.value = e.response?.data?.error || e.message }
}

// Item picker — narrowed to the selected companies ("spruce out" by company).
async function loadItems() {
  itemsLoading.value = true
  try {
    const { data } = await warehouseApi.invItems(f.companies.join(',') || undefined)
    itemOptions.value = data.items || []
    const keep = new Set(itemOptions.value.map(i => i.no))
    f.items = f.items.filter(x => keep.has(x))   // drop picks no longer in the narrowed list
  } catch { /* non-fatal — leave prior options */ }
  finally { itemsLoading.value = false }
}
watch(() => f.companies.slice().sort().join(','), loadItems)

async function run() {
  loading.value = true; error.value = ''
  try {
    const body = {
      dateFrom: ymd(from.value), dateTo: ymd(to.value),
      companies: f.companies, locations: f.locations, postingGroups: f.postingGroups, entryTypes: f.entryTypes,
      items: f.items,
      groupBy: groupBy.value.length ? groupBy.value : ['location'],
      granularity: granularity.value,
    }
    const { data } = await warehouseApi.invReport(body)
    result.value = data
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

// ── Pivot (date spread) ──────────────────────────────────────────────────────
const buckets = computed(() => {
  if (granularity.value === 'none') return []
  return [...new Set(rows.value.map(r => r.bucket).filter(Boolean))].sort()
})
const pivotRows = computed(() => {
  if (granularity.value === 'none') return []
  const map = new Map()
  for (const r of rows.value) {
    const label = activeDims.value.map(d => dimVal(r, d.key)).join(' · ') || '(all)'
    if (!map.has(label)) map.set(label, { __label: label, __total: 0 })
    const row = map.get(label)
    const v = Number(r[metric.value] || 0)
    row[r.bucket] = (row[r.bucket] || 0) + v
    row.__total += v
  }
  return [...map.values()].sort((a, b) => b.__total - a.__total)
})
const pivotTop = computed(() => topOnly.value ? pivotRows.value.slice(0, 20) : pivotRows.value)

// ── Chart datasets ───────────────────────────────────────────────────────────
// Bar / Pie: collapse rows to one value per group-label, summing the metric.
const chartCategories = computed(() => {
  const map = new Map()
  for (const r of rows.value) {
    const label = activeDims.value.map(d => dimVal(r, d.key)).join(' · ') || '(all)'
    map.set(label, (map.get(label) || 0) + Number(r[metric.value] || 0))
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }))
})
// Line: one series per group-label, points aligned to the sorted date buckets.
const chartSeries = computed(() => {
  if (granularity.value === 'none') return []
  const bk = buckets.value
  const idx = new Map(bk.map((b, i) => [b, i]))
  const map = new Map()
  for (const r of rows.value) {
    const label = activeDims.value.map(d => dimVal(r, d.key)).join(' · ') || '(all)'
    if (!map.has(label)) map.set(label, new Array(bk.length).fill(0))
    const i = idx.get(r.bucket)
    if (i != null) map.get(label)[i] += Number(r[metric.value] || 0)
  }
  return [...map.entries()].map(([label, points]) => ({ label, points }))
})

function exportXlsx() {
  let aoa
  if (granularity.value === 'none') {
    const head = [...activeDims.value.map(d => d.label), 'Quantity', 'Cost', 'Sales', 'Entries']
    aoa = [head, ...rows.value.map(r => [
      ...activeDims.value.map(d => dimVal(r, d.key)),
      +Number(r.quantity || 0).toFixed(2), +Number(r.cost || 0).toFixed(2), +Number(r.sales || 0).toFixed(2), Number(r.entries || 0),
    ])]
  } else {
    const head = ['Group', ...buckets.value, 'Total']
    aoa = [head, ...pivotRows.value.map(r => [
      r.__label, ...buckets.value.map(b => r[b] != null ? +Number(r[b]).toFixed(2) : ''), +Number(r.__total).toFixed(2),
    ])]
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  for (let c = 0; c < aoa[0].length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1D4ED8' } } }
  }
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
  XLSX.writeFile(wb, `inventory-${granularity.value}-${ymd(from.value)}_${ymd(to.value)}.xlsx`)
  toast.add({ severity: 'success', summary: 'Exported', life: 3000 })
}

onMounted(async () => { await loadDims(); await loadItems(); await run() })
</script>

<style scoped>
/* Dark navy theme — matches Sales Reports / Finance Reports. */
.inv-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; background: #151b28; min-height: 100%; color: #e8eef7; }
.page-title { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #f8fafc; }
.text-muted { color: #94a6bf; } .text-sm { font-size: 13px; } .mb-2 { margin-bottom: 8px; }
.card { background: #1b2233; border: 1px solid #324256; border-radius: 10px; padding: 14px 16px; }
.filters .f-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.filters .f-row:last-child { margin-bottom: 0; }
.f { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
.f.grow { flex: 1 1 300px; }
.f label, .s label { font-size: 11px; font-weight: 700; color: #94a6bf; text-transform: uppercase; letter-spacing: .04em; }
.shape { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-end; }
.s { display: flex; flex-direction: column; gap: 6px; }
.s.run { margin-left: auto; flex-direction: row; gap: 8px; align-items: flex-end; }
.totals { display: flex; gap: 10px; flex-wrap: wrap; }
.tot { background: #243247; border: 1px solid #324256; border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; min-width: 120px; }
.tot span { font-size: 11px; color: #94a6bf; text-transform: uppercase; }
.tot b { font-size: 18px; color: #f8fafc; }
.tot.muted { background: #1b2233; }
.pivot-label { font-weight: 600; }
.empty { padding: 24px; text-align: center; color: #94a6bf; }
.top-chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #e8eef7; cursor: pointer; height: 34px; }

/* ── Deep PrimeVue overrides — dark navy tables (the analysis rows) ─────────── */
:deep(.p-datatable),
:deep(.p-datatable-table-container),
:deep(.p-datatable-table),
:deep(.p-datatable-tbody > tr) { background: #1b2233 !important; }
:deep(.p-datatable-tbody > tr > td) { color: #f8fafc !important; background: #1b2233 !important; padding: 6px 10px !important; border-color: #324256 !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background: #212a3d !important; }
:deep(.p-datatable-tbody > tr:hover > td) { background: rgba(255,255,255,0.06) !important; }
:deep(.p-datatable-thead > tr > th) { background: #243247 !important; color: #f8fafc !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .04em; padding: 8px 10px !important; border-color: #324256 !important; position: sticky; top: 0; z-index: 3; }
:deep(.p-paginator) { background: #1b2233 !important; color: #f8fafc !important; border-color: #324256 !important; }
:deep(.p-paginator .p-paginator-page.p-highlight) { background: #1d4ed8 !important; color: #fff !important; }
:deep(td.num) { text-align: right; font-variant-numeric: tabular-nums; }
/* Right-align the header label (its content is a flex row, so text-align won't move it). */
:deep(th.num-h .p-datatable-column-header-content) { justify-content: flex-end; }
:deep(td.total-col), :deep(th.total-col) { font-weight: 700; background: #243247 !important; color: #fff !important; }
/* Frozen first column keeps the dark fill so it doesn't flash white while scrolling */
:deep(.p-datatable-frozen-column) { background: #1b2233 !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td.p-datatable-frozen-column) { background: #212a3d !important; }
</style>
