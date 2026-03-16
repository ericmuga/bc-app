<template>
  <div>
    <Tabs value="list">
      <TabList>
        <Tab value="list">Document List</Tab>
        <Tab value="summary">Summary</Tab>
      </TabList>

      <TabPanels>
        <!-- LIST TAB -->
        <TabPanel value="list">
          <div class="filter-bar">
            <InputText v-model="filters.q" placeholder="Search…" @keyup.enter="load()" />
            <DatePicker v-model="filters.dateFrom" placeholder="From date" date-format="yy-mm-dd" show-icon />
            <DatePicker v-model="filters.dateTo"   placeholder="To date"   date-format="yy-mm-dd" show-icon />
            <Select v-model="filters.status" :options="statusOptions" option-label="label" option-value="value"
              placeholder="Status" show-clear style="width:140px" />
            <Button label="Search" icon="pi pi-search" @click="load()" :loading="loading" />
            <Button label="Reset"  icon="pi pi-refresh" severity="secondary" @click="reset()" />
          </div>

          <DataTable :value="rows" :loading="loading" row-hover paginator :rows="20"
            :rows-per-page-options="[10,20,50]" data-key="Id"
            v-model:expanded-rows="expandedRows" @row-expand="onExpand" @row-collapse="onCollapse"
            class="base-doc-table">
            <Column expander style="width:3rem" />
            <slot name="columns" />
            <Column field="CustomerName"    header="Customer" />
            <Column field="SalespersonCode" header="Salesperson" style="width:130px" />
            <Column field="RouteCode"       header="Route"        style="width:100px" />
            <Column field="SectorCode"      header="Sector"       style="width:100px" />
            <Column header="Status" style="width:120px">
              <template #body="{ data }"><StatusBadge :status="data.Status" /></template>
            </Column>
            <template #expansion="{ data }">
              <div class="expansion-wrap">
                <p class="expansion-title">Lines — {{ data[docNoField] }}</p>
                <div v-if="expandLoading[data[docNoField]]">
                  <Skeleton height="18px" class="mb-1" v-for="i in 3" :key="i" />
                </div>
                <DocumentLines v-else :lines="expandedLines[data[docNoField]] || []" />
              </div>
            </template>
            <template #empty><div class="table-empty">No documents found.</div></template>
          </DataTable>
        </TabPanel>

        <!-- SUMMARY TAB -->
        <TabPanel value="summary">
          <div class="filter-bar">
            <Select v-model="summaryGroupBy" :options="groupByOptions" option-label="label" option-value="value"
              placeholder="Group by" style="width:180px" />
            <DatePicker v-model="summaryDateFrom" placeholder="From date" date-format="yy-mm-dd" show-icon />
            <DatePicker v-model="summaryDateTo"   placeholder="To date"   date-format="yy-mm-dd" show-icon />
            <Button label="Generate" icon="pi pi-chart-bar" @click="loadSummary()" :loading="summaryLoading" />
          </div>

          <DataTable :value="summaryRows" :loading="summaryLoading" show-gridlines striped-rows
            paginator :rows="30" sort-mode="multiple" class="summary-table">
            <Column field="GroupKey"          :header="summaryGroupBy"   sortable />
            <Column field="DocumentCount"     header="Docs"              style="width:80px;text-align:right"  sortable />
            <Column field="TotalQuantity"     header="Total Qty"         style="width:130px;text-align:right" sortable>
              <template #body="{ data }"><span class="mono">{{ fmt(data.TotalQuantity) }}</span></template>
            </Column>
            <Column field="TotalQuantityBase" header="Qty Base"          style="width:130px;text-align:right" sortable>
              <template #body="{ data }"><span class="mono">{{ fmt(data.TotalQuantityBase) }}</span></template>
            </Column>
            <Column field="TotalLineAmount"   header="Total Amount"      style="width:160px;text-align:right" sortable>
              <template #body="{ data }"><span class="mono amount">{{ money(data.TotalLineAmount) }}</span></template>
            </Column>
          </DataTable>

          <div v-if="summaryRows.length" class="totals-bar">
            <span class="total-item">Docs: <strong>{{ grandTotals.docs }}</strong></span>
            <span class="total-item">Qty: <strong class="mono">{{ fmt(grandTotals.qty) }}</strong></span>
            <span class="total-item">Qty Base: <strong class="mono">{{ fmt(grandTotals.qtyBase) }}</strong></span>
            <span class="total-item total-amount">Total: <strong class="mono">{{ money(grandTotals.amount) }}</strong></span>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import Tabs       from 'primevue/tabs'
import TabList    from 'primevue/tablist'
import Tab        from 'primevue/tab'
import TabPanels  from 'primevue/tabpanels'
import TabPanel   from 'primevue/tabpanel'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import InputText  from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Select     from 'primevue/select'
import Button     from 'primevue/button'
import Skeleton   from 'primevue/skeleton'
import StatusBadge   from './StatusBadge.vue'
import DocumentLines from './DocumentLines.vue'

const props = defineProps({
  api:        { type: Object, required: true },
  docNoField: { type: String, required: true },
  statusOptions: {
    type: Array,
    default: () => [
      { label: 'Open',      value: 'Open' },
      { label: 'Confirmed', value: 'Confirmed' },
    ]
  }
})

// List state
const rows    = ref([])
const loading = ref(false)
const filters = reactive({ q: '', dateFrom: null, dateTo: null, status: '' })

async function load() {
  loading.value = true
  try {
    const { data } = await props.api.list(buildParams(filters))
    rows.value = data
  } finally { loading.value = false }
}
function reset() {
  Object.assign(filters, { q: '', dateFrom: null, dateTo: null, status: '' })
  load()
}

// Expanded lines
const expandedRows  = ref([])
const expandedLines = ref({})
const expandLoading = ref({})

async function onExpand({ data }) {
  const docNo = data[props.docNoField]
  if (expandedLines.value[docNo]) return
  expandLoading.value[docNo] = true
  try {
    const { data: doc } = await props.api.get(docNo)
    expandedLines.value[docNo] = doc.lines || []
  } finally { expandLoading.value[docNo] = false }
}
function onCollapse({ data }) { delete expandedLines.value[data[props.docNoField]] }

// Summary state
const summaryRows    = ref([])
const summaryLoading = ref(false)
const summaryGroupBy  = ref('CustomerNo')
const summaryDateFrom = ref(null)
const summaryDateTo   = ref(null)

const groupByOptions = [
  { label: 'Customer',    value: 'CustomerNo' },
  { label: 'Salesperson', value: 'SalespersonCode' },
  { label: 'Route',       value: 'RouteCode' },
  { label: 'Sector',      value: 'SectorCode' },
  { label: 'Date',        value: 'OrderDate' },
]

async function loadSummary() {
  summaryLoading.value = true
  try {
    const { data } = await props.api.summary({
      groupBy: summaryGroupBy.value,
      ...buildParams({ dateFrom: summaryDateFrom.value, dateTo: summaryDateTo.value }),
    })
    summaryRows.value = data
  } finally { summaryLoading.value = false }
}

const grandTotals = computed(() => ({
  docs:    summaryRows.value.reduce((s, r) => s + (+r.DocumentCount     || 0), 0),
  qty:     summaryRows.value.reduce((s, r) => s + (+r.TotalQuantity     || 0), 0),
  qtyBase: summaryRows.value.reduce((s, r) => s + (+r.TotalQuantityBase || 0), 0),
  amount:  summaryRows.value.reduce((s, r) => s + (+r.TotalLineAmount   || 0), 0),
}))

function buildParams({ q, dateFrom, dateTo, status } = {}) {
  const p = {}
  if (q)        p.q        = q
  if (dateFrom) p.dateFrom = toISO(dateFrom)
  if (dateTo)   p.dateTo   = toISO(dateTo)
  if (status)   p.status   = status
  return p
}
const toISO  = (v) => v instanceof Date ? v.toISOString().slice(0, 10) : v
const fmt    = (v) => Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const money  = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

defineExpose({ load, reset })
</script>

<style scoped>
.filter-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:14px 0 16px; }
.base-doc-table, .summary-table { font-size:13px; }
.table-empty { text-align:center; padding:40px; color:var(--bc-text-muted); }
.expansion-wrap { padding:12px 16px; background:var(--bc-surface-raised); border-radius:8px; }
.expansion-title { font-size:12px; font-weight:700; color:var(--bc-text-muted); margin-bottom:10px; }
.totals-bar { display:flex; gap:24px; justify-content:flex-end; align-items:center;
  margin-top:12px; padding:10px 16px; background:var(--bc-surface-raised);
  border:1px solid var(--bc-border); border-radius:8px; font-size:13px; }
.total-item { color:var(--bc-text-muted); }
.total-item strong { color:var(--bc-text); }
.total-amount strong { color:var(--bc-primary-light); font-size:15px; }
.amount { color:var(--bc-primary-light); font-weight:700; }
</style>
