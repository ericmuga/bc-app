<template>
  <div class="page">
    <div class="page-header flex justify-between items-center">
      <div>
        <h2 class="page-title">Reports</h2>
        <p class="text-muted text-sm">Confirmed order &amp; invoice summaries with drill-down</p>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: tab === 'summary' }"    @click="tab = 'summary'">
        <i class="pi pi-table" /> Summary
      </button>
      <button class="tab-btn" :class="{ active: tab === 'salesperson' }" @click="switchTab('salesperson')">
        <i class="pi pi-user" /> By Salesperson
      </button>
      <button class="tab-btn" :class="{ active: tab === 'route' }"       @click="switchTab('route')">
        <i class="pi pi-map-marker" /> By Route
      </button>
      <button class="tab-btn" :class="{ active: tab === 'sector' }"        @click="switchTab('sector')">
        <i class="pi pi-tag" /> By Sector
      </button>
      <button class="tab-btn" :class="{ active: tab === 'postingGroup' }" @click="switchTab('postingGroup')">
        <i class="pi pi-tag" /> By Posting Group
      </button>
    </div>

    <!-- ── SUMMARY TAB ─────────────────────────────────────────────────── -->
    <template v-if="tab === 'summary'">
      <!-- Controls bar -->
      <div class="bc-card controls-bar">
        <div class="source-toggle">
          <button class="toggle-btn" :class="{ active: source === 'orders' }"
            @click="source = 'orders'; load()">Orders</button>
          <button class="toggle-btn" :class="{ active: source === 'invoices' }"
            @click="source = 'invoices'; load()">Invoices</button>
        </div>
        <Select v-model="groupBy" :options="groupOptions" option-label="label" option-value="value"
          style="width:200px" @change="load" />
        <DatePicker v-model="dateFrom" placeholder="From" date-format="yy-mm-dd" show-icon @date-select="load" />
        <DatePicker v-model="dateTo"   placeholder="To"   date-format="yy-mm-dd" show-icon @date-select="load" />
        <Button label="Run"   icon="pi pi-play"  @click="load" :loading="loading" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load(true)" :loading="loading" />
        <Button label="Clear" icon="pi pi-times" text @click="clearFilters" />
        <Button icon="pi pi-download" text severity="secondary" v-tooltip="'Export to CSV'"
          :disabled="!rows.length" @click="exportSummary" />
      </div>

      <!-- KPI strip -->
      <div class="kpi-strip" v-if="rows.length">
        <div class="kpi-card">
          <span class="kpi-label">Groups</span>
          <span class="kpi-val mono">{{ rows.length }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Documents</span>
          <span class="kpi-val mono">{{ totalDocs }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Qty</span>
          <span class="kpi-val mono">{{ fmt(totalQty) }}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Qty Base</span>
          <span class="kpi-val mono">{{ fmt(totalQtyBase) }}</span>
        </div>
        <div class="kpi-card highlight">
          <span class="kpi-label">Total Amount</span>
          <span class="kpi-val mono">{{ fmtCurrency(totalAmount) }}</span>
        </div>
      </div>

      <!-- Summary table -->
      <div class="bc-card mt-4" style="padding:0;overflow:hidden" v-if="rows.length || loading">
        <DataTable :value="rows" :loading="loading" dataKey="GroupKey" row-hover
          sort-field="TotalLineAmount" :sort-order="-1" class="summary-table">
          <template #empty>
            <div class="table-empty">No data — adjust filters and click Run</div>
          </template>
          <Column field="GroupKey" :header="groupLabel" sortable>
            <template #body="{ data }">
              <span class="group-key">{{ data.GroupKey || '(blank)' }}</span>
            </template>
          </Column>
          <Column field="DocumentCount" header="Docs" sortable style="width:80px;text-align:right" header-style="text-align:right">
            <template #body="{ data }"><span class="mono">{{ data.DocumentCount }}</span></template>
          </Column>
          <Column field="TotalQuantity" header="Total Qty" sortable style="width:120px;text-align:right" header-style="text-align:right">
            <template #body="{ data }"><span class="mono">{{ fmt(data.TotalQuantity) }}</span></template>
          </Column>
          <Column field="TotalQuantityBase" header="Qty Base" sortable style="width:120px;text-align:right" header-style="text-align:right">
            <template #body="{ data }"><span class="mono">{{ fmt(data.TotalQuantityBase) }}</span></template>
          </Column>
          <Column field="TotalLineAmount" header="Amount" sortable style="width:160px;text-align:right" header-style="text-align:right">
            <template #body="{ data }">
              <span class="mono amount">{{ fmtCurrency(data.TotalLineAmount) }}</span>
            </template>
          </Column>
          <Column header="" style="width:140px">
            <template #body="{ data }">
              <div class="amount-bar-wrap">
                <div class="amount-bar" :style="{ width: pct(data.TotalLineAmount) + '%' }" />
              </div>
            </template>
          </Column>
          <Column header="" style="width:110px">
            <template #body="{ data }">
              <Button v-if="canDrillSource" label="Show lines" icon="pi pi-chevron-right" text size="small" @click="drillDown(data.GroupKey)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-else class="bc-card mt-4 empty-state">
        <i class="pi pi-chart-bar" style="font-size:40px;color:var(--bc-text-muted)" />
        <p>Select filters and click <strong>Run</strong> to generate a report.</p>
      </div>
    </template>

    <!-- ── ANALYSIS TABS (Salesperson / Route) ───────────────────────────── -->
    <template v-else>
      <!-- Date filter bar -->
      <div class="bc-card controls-bar">
        <DatePicker v-model="analysisFrom" placeholder="From" date-format="yy-mm-dd" show-icon />
        <DatePicker v-model="analysisTo"   placeholder="To"   date-format="yy-mm-dd" show-icon />
        <Button label="Apply" icon="pi pi-filter" @click="loadAnalysis" :loading="analysisLoading" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadAnalysis(true)" :loading="analysisLoading" />
        <Button label="Clear" icon="pi pi-times"  text @click="clearAnalysis" />
        <Button icon="pi pi-download" text severity="secondary" v-tooltip="'Export to CSV'"
          :disabled="!analysisOrders.length && !analysisInvoices.length" @click="exportAnalysis" />
      </div>

      <!-- Two panels side by side -->
      <div class="analysis-grid mt-4">
        <!-- Orders panel -->
        <div class="analysis-panel bc-card">
          <div class="panel-title">
            <i class="pi pi-list" />
            Orders (Confirmed) — {{ tab === 'salesperson' ? 'By Salesperson' : tab === 'route' ? 'By Route' : tab === 'sector' ? 'By Sector' : 'By Posting Group' }}
            <span class="panel-count text-muted text-sm">{{ analysisOrders.length }} groups</span>
          </div>
          <div v-if="analysisLoading" class="panel-loading">
            <div class="skeleton-bar" v-for="i in 5" :key="i" :style="{ width: (80 - i * 10) + '%' }" />
          </div>
          <div v-else-if="!analysisOrders.length" class="panel-empty text-muted">No confirmed orders</div>
          <div v-else class="bar-chart">
            <div
              v-for="row in analysisOrders" :key="row.GroupKey"
              class="bar-row"
              :class="{ disabled: !canViewOrderDocs }"
              @click="canViewOrderDocs && drillDownAnalysis(row.GroupKey, 'orders')"
            >
              <div class="bar-label">{{ row.GroupKey || '(blank)' }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill bar-orders"
                  :style="{ width: analysisPct(row.TotalLineAmount, maxAnalysisOrders) + '%' }"
                />
              </div>
              <div class="bar-value">
                <span class="mono">{{ fmtCurrency(row.TotalLineAmount) }}</span>
                <span class="text-muted text-sm">{{ fmt(row.TotalQuantityBase) }} qty</span>
              </div>
            </div>
          </div>
          <div class="panel-footer" v-if="analysisOrders.length">
            <span class="text-muted text-sm">Total</span>
            <div style="display:flex;gap:12px;align-items:center">
              <span class="mono text-muted text-sm">{{ fmt(analysisOrders.reduce((s, r) => s + (+r.TotalQuantityBase || 0), 0)) }} qty</span>
              <span class="mono" style="font-weight:700;color:var(--bc-primary-light)">
                {{ fmtCurrency(analysisOrders.reduce((s, r) => s + (+r.TotalLineAmount || 0), 0)) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Invoices panel -->
        <div class="analysis-panel bc-card">
          <div class="panel-title">
            <i class="pi pi-file-check" />
            Invoices (Confirmed) — {{ tab === 'salesperson' ? 'By Salesperson' : tab === 'route' ? 'By Route' : tab === 'sector' ? 'By Sector' : 'By Posting Group' }}
            <span class="panel-count text-muted text-sm">{{ analysisInvoices.length }} groups</span>
          </div>
          <div v-if="analysisLoading" class="panel-loading">
            <div class="skeleton-bar" v-for="i in 5" :key="i" :style="{ width: (80 - i * 10) + '%' }" />
          </div>
          <div v-else-if="!analysisInvoices.length" class="panel-empty text-muted">No confirmed invoices</div>
          <div v-else class="bar-chart">
            <div
              v-for="row in analysisInvoices" :key="row.GroupKey"
              class="bar-row"
              :class="{ disabled: !canViewInvoiceDocs }"
              @click="canViewInvoiceDocs && drillDownAnalysis(row.GroupKey, 'invoices')"
            >
              <div class="bar-label">{{ row.GroupKey || '(blank)' }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill bar-invoices"
                  :style="{ width: analysisPct(row.TotalLineAmount, maxAnalysisInvoices) + '%' }"
                />
              </div>
              <div class="bar-value">
                <span class="mono">{{ fmtCurrency(row.TotalLineAmount) }}</span>
                <span class="text-muted text-sm">{{ fmt(row.TotalQuantityBase) }} qty</span>
              </div>
            </div>
          </div>
          <div class="panel-footer" v-if="analysisInvoices.length">
            <span class="text-muted text-sm">Total</span>
            <div style="display:flex;gap:12px;align-items:center">
              <span class="mono text-muted text-sm">{{ fmt(analysisInvoices.reduce((s, r) => s + (+r.TotalQuantityBase || 0), 0)) }} qty</span>
              <span class="mono" style="font-weight:700;color:var(--bc-primary-light)">
                {{ fmtCurrency(analysisInvoices.reduce((s, r) => s + (+r.TotalLineAmount || 0), 0)) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Drill-down drawer ───────────────────────────────────────────── -->
    <Drawer v-model:visible="drawerVisible" position="right" style="width:740px"
      :header="`${currentDrillLabel}: ${selectedGroup}`">
      <div class="drawer-controls">
        <span class="text-muted text-sm">{{ drawerRows.length }} document(s)</span>
      </div>
      <DataTable :value="drawerRows" :loading="drawerLoading" :dataKey="drawerDocField"
        size="small" row-hover class="drawer-table">
        <template #empty><div class="table-empty">No documents</div></template>
        <Column :field="drawerDocField" :header="drawerDocField === 'OrderNo' ? 'Order No' : 'Invoice No'" style="width:150px">
          <template #body="{ data }">
            <span class="mono link" @click="openScanFromDrawer(data)">{{ data[drawerDocField] }}</span>
          </template>
        </Column>
        <Column field="CustomerName" header="Customer" />
        <Column field="OrderDate"    header="Date"   style="width:100px">
          <template #body="{ data }">{{ fmtDay(data.OrderDate) }}</template>
        </Column>
        <Column field="Status"       header="Status" style="width:110px">
          <template #body="{ data }"><StatusBadge :status="data.Status" /></template>
        </Column>
        <Column header="" style="width:90px">
          <template #body="{ data }">
            <Button icon="pi pi-list" text size="small" @click="loadLines(data[drawerDocField])" v-tooltip="'View lines'" />
          </template>
        </Column>
      </DataTable>

      <div v-if="linesDocNo" class="lines-panel">
        <div class="lines-header">
          Lines for <span class="mono">{{ linesDocNo }}</span>
          <Button icon="pi pi-times" text size="small" @click="linesDocNo = null" style="margin-left:auto" />
        </div>
        <div v-if="linesLoading">
          <Skeleton height="18px" class="mb-2" v-for="i in 3" :key="i" />
        </div>
        <DocumentLines v-else :lines="currentLines" />
      </div>
    </Drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Button     from 'primevue/button'
import Select     from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Drawer     from 'primevue/drawer'
import Skeleton   from 'primevue/skeleton'
import { useAuthStore } from '@/stores/auth.js'
import StatusBadge   from '@/components/base/StatusBadge.vue'
import DocumentLines from '@/components/base/DocumentLines.vue'
import { ordersApi, invoicesApi } from '@/services/api.js'
import { exportCsv, todayStr } from '@/utils/exportCsv.js'
import { canAccessInvoices, canAccessOrders } from '@/lib/access.js'

const router = useRouter()
const auth = useAuthStore()

// ── Tab state ───────────────────────────────────────────────────────────────
const tab = ref('summary')

// ── Summary tab state ───────────────────────────────────────────────────────
const source   = ref('orders')
const groupBy  = ref('CustomerNo')
const dateFrom = ref(null)
const dateTo   = ref(null)
const rows     = ref([])
const loading  = ref(false)

const groupOptions = [
  { label: 'Customer No',    value: 'CustomerNo' },
  { label: 'Customer Name',  value: 'CustomerName' },
  { label: 'Salesperson',    value: 'SalespersonCode' },
  { label: 'Route',          value: 'RouteCode' },
  { label: 'Sector',         value: 'SectorCode' },
  { label: 'Posting Group',  value: 'PostingGroup' },
  { label: 'Date',           value: 'OrderDate' },
]

const groupLabel = computed(() => groupOptions.find(o => o.value === groupBy.value)?.label ?? groupBy.value)
const api        = computed(() => source.value === 'orders' ? ordersApi : invoicesApi)
const docNoField = computed(() => source.value === 'orders' ? 'OrderNo' : 'InvoiceNo')
const canViewOrderDocs = computed(() => canAccessOrders(auth.user?.role))
const canViewInvoiceDocs = computed(() => canAccessInvoices(auth.user?.role))
const canDrillSource = computed(() => source.value === 'orders' ? canViewOrderDocs.value : canViewInvoiceDocs.value)

const totalDocs    = computed(() => rows.value.reduce((s, r) => s + (+r.DocumentCount    || 0), 0))
const totalQty     = computed(() => rows.value.reduce((s, r) => s + (+r.TotalQuantity    || 0), 0))
const totalQtyBase = computed(() => rows.value.reduce((s, r) => s + (+r.TotalQuantityBase|| 0), 0))
const totalAmount  = computed(() => rows.value.reduce((s, r) => s + (+r.TotalLineAmount  || 0), 0))
const maxAmount    = computed(() => Math.max(...rows.value.map(r => +r.TotalLineAmount || 0), 1))

async function load(refresh = false) {
  loading.value = true
  try {
    const params = {
      groupBy: groupBy.value,
      refresh: refresh ? 1 : 0,
      ...(dateFrom.value ? { dateFrom: fmtParam(dateFrom.value) } : {}),
      ...(dateTo.value   ? { dateTo:   fmtParam(dateTo.value) }   : {}),
    }
    const { data } = await api.value.summary(params)
    rows.value = data
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  dateFrom.value = null
  dateTo.value   = null
  rows.value     = []
}

// ── Analysis tab state ──────────────────────────────────────────────────────
const analysisFrom     = ref(null)
const analysisTo       = ref(null)
const analysisLoading  = ref(false)
const analysisOrders   = ref([])
const analysisInvoices = ref([])

const analysisGroupBy = computed(() => {
  if (tab.value === 'salesperson')  return 'SalespersonCode'
  if (tab.value === 'sector')       return 'SectorCode'
  if (tab.value === 'postingGroup') return 'PostingGroup'
  return 'RouteCode'
})
const maxAnalysisOrders   = computed(() => Math.max(...analysisOrders.value.map(r => +r.TotalLineAmount || 0), 1))
const maxAnalysisInvoices = computed(() => Math.max(...analysisInvoices.value.map(r => +r.TotalLineAmount || 0), 1))

function switchTab(t) {
  tab.value = t
  loadAnalysis()
}

async function loadAnalysis(refresh = false) {
  analysisLoading.value = true
  analysisOrders.value  = []
  analysisInvoices.value = []
  try {
    const params = {
      groupBy: analysisGroupBy.value,
      refresh: refresh ? 1 : 0,
      ...(analysisFrom.value ? { dateFrom: fmtParam(analysisFrom.value) } : {}),
      ...(analysisTo.value   ? { dateTo:   fmtParam(analysisTo.value) }   : {}),
    }
    const [ordersRes, invoicesRes] = await Promise.all([
      ordersApi.summary(params),
      invoicesApi.summary(params),
    ])
    analysisOrders.value   = ordersRes.data
    analysisInvoices.value = invoicesRes.data
  } catch (err) {
    console.error(err)
  } finally {
    analysisLoading.value = false
  }
}

function clearAnalysis() {
  analysisFrom.value     = null
  analysisTo.value       = null
  analysisOrders.value   = []
  analysisInvoices.value = []
  loadAnalysis()
}

// ── Drill-down drawer ────────────────────────────────────────────────────────
const drawerVisible  = ref(false)
const drawerRows     = ref([])
const drawerLoading  = ref(false)
const selectedGroup  = ref('')
const drawerDocField = ref('OrderNo')
const currentDrillLabel = ref('')
const linesDocNo     = ref(null)
const currentLines   = ref([])
const linesLoading   = ref(false)

const groupParamMap = {
  CustomerNo:      'customerNo',
  CustomerName:    'q',
  SalespersonCode: 'salesperson',
  RouteCode:       'route',
  SectorCode:      'sector',
  OrderDate:       'dateFrom',
}

async function drillDown(groupKey) {
  currentDrillLabel.value = groupLabel.value
  drawerDocField.value    = docNoField.value
  await openDrawer(groupKey, groupBy.value, api.value, dateFrom.value, dateTo.value)
}

async function drillDownAnalysis(groupKey, sourceType) {
  const labelMap = { SalespersonCode: 'Salesperson', RouteCode: 'Route', SectorCode: 'Sector' }
  currentDrillLabel.value = labelMap[analysisGroupBy.value] ?? analysisGroupBy.value
  drawerDocField.value    = sourceType === 'orders' ? 'OrderNo' : 'InvoiceNo'
  const apiSource         = sourceType === 'orders' ? ordersApi : invoicesApi
  await openDrawer(groupKey, analysisGroupBy.value, apiSource, analysisFrom.value, analysisTo.value)
}

async function openDrawer(groupKey, dimension, apiSource, from, to) {
  if ((apiSource === ordersApi && !canViewOrderDocs.value) || (apiSource === invoicesApi && !canViewInvoiceDocs.value)) return
  selectedGroup.value  = groupKey
  drawerVisible.value  = true
  drawerLoading.value  = true
  linesDocNo.value     = null
  currentLines.value   = []
  try {
    const paramKey = groupParamMap[dimension] ?? 'q'
    const params = {
      [paramKey]: groupKey,
      status: 'Confirmed',
      ...(from ? { dateFrom: fmtParam(from) } : {}),
      ...(to   ? { dateTo:   fmtParam(to) }   : {}),
    }
    if (dimension === 'OrderDate') params.dateTo = groupKey
    const { data } = await apiSource.list(params)
    drawerRows.value = data
  } finally {
    drawerLoading.value = false
  }
}

async function loadLines(docNo) {
  if ((drawerDocField.value === 'OrderNo' && !canViewOrderDocs.value) || (drawerDocField.value !== 'OrderNo' && !canViewInvoiceDocs.value)) return
  linesDocNo.value   = docNo
  linesLoading.value = true
  currentLines.value = []
  try {
    const apiSource  = drawerDocField.value === 'OrderNo' ? ordersApi : invoicesApi
    const { data }   = await apiSource.get(docNo)
    currentLines.value = data.lines
  } finally {
    linesLoading.value = false
  }
}

function openScanFromDrawer(row) {
  const no = row[drawerDocField.value]
  if (drawerDocField.value === 'OrderNo') {
    if (!canViewOrderDocs.value) return
    router.push({ name: 'OrderScan',   query: { no } })
  } else {
    if (!canViewInvoiceDocs.value) return
    router.push({ name: 'InvoiceScan', query: { no } })
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

const summaryColumns = [
  { key: 'GroupKey',          label: 'Group' },
  { key: 'DocumentCount',     label: 'Documents' },
  { key: 'TotalQuantity',     label: 'Total Qty' },
  { key: 'TotalQuantityBase', label: 'Total Qty Base' },
  { key: 'TotalLineAmount',   label: 'Amount' },
]

function exportSummary() {
  const label = groupLabel.value.replace(/\s+/g, '-').toLowerCase()
  exportCsv(`${source.value}-summary-${label}-${todayStr()}.csv`, rows.value, summaryColumns)
}

function exportAnalysis() {
  const dim = analysisGroupBy.value.replace(/Code$/, '').toLowerCase()
  if (analysisOrders.value.length)
    exportCsv(`orders-analysis-${dim}-${todayStr()}.csv`, analysisOrders.value, summaryColumns)
  if (analysisInvoices.value.length)
    exportCsv(`invoices-analysis-${dim}-${todayStr()}.csv`, analysisInvoices.value, summaryColumns)
}

// ── Formatters ───────────────────────────────────────────────────────────────
const fmt         = (v) => Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCurrency = (v) => `KES ${fmt(v)}`
const fmtDay      = (v) => v ? new Date(v).toLocaleDateString('en-KE') : '—'
const fmtParam    = (v) => v instanceof Date ? v.toISOString().slice(0, 10) : v
const pct         = (v) => maxAmount.value ? Math.round((+v / maxAmount.value) * 100) : 0
const analysisPct = (v, max) => max ? Math.round((+v / max) * 100) : 0
</script>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title  { font-size: 22px; font-weight: 700; margin-bottom: 2px; }

/* Tab bar */
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--bc-border);
  margin-bottom: 20px;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--bc-text-muted);
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: -1px;
}
.tab-btn:hover  { color: var(--bc-text); }
.tab-btn.active { color: var(--bc-primary-light); border-bottom-color: var(--bc-primary-light); }
.tab-btn .pi    { font-size: 13px; }

/* Controls bar */
.controls-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
}
.source-toggle {
  display: flex;
  border: 1px solid var(--bc-border);
  border-radius: 8px;
  overflow: hidden;
}
.toggle-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--bc-text-muted);
  transition: all 0.15s;
}
.toggle-btn.active { background: var(--bc-primary); color: #fff; }

/* KPI strip */
.kpi-strip { display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.kpi-card {
  background: var(--bc-surface-card);
  border: 1px solid var(--bc-border);
  border-radius: 10px;
  padding: 10px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
}
.kpi-card.highlight { border-color: var(--bc-primary); }
.kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bc-text-muted); }
.kpi-val   { font-size: 20px; font-weight: 700; color: var(--bc-text); }
.kpi-card.highlight .kpi-val { color: var(--bc-primary-light); }

/* Summary table */
.summary-table { font-size: 13px; }
.table-empty   { text-align: center; padding: 40px; color: var(--bc-text-muted); }
.group-key     { font-weight: 600; }
.amount        { font-weight: 700; color: var(--bc-primary-light); }
.link          { cursor: pointer; color: var(--bc-primary-light); text-decoration: underline; text-decoration-style: dotted; }

.amount-bar-wrap { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.amount-bar      { height: 100%; background: var(--bc-primary-light); border-radius: 3px; transition: width 0.3s ease; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 60px; text-align: center; color: var(--bc-text-muted);
}

/* Analysis grid */
.analysis-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .analysis-grid { grid-template-columns: 1fr; }
}

.analysis-panel { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--bc-text);
}
.panel-title .pi { color: var(--bc-primary-light); font-size: 15px; }
.panel-count { margin-left: auto; }

.panel-empty {
  text-align: center;
  padding: 30px 0;
}

/* Skeleton bars */
.panel-loading { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
.skeleton-bar  { height: 28px; background: var(--bc-surface-raised); border-radius: 6px; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* Horizontal bar chart */
.bar-chart { display: flex; flex-direction: column; gap: 8px; }
.bar-row {
  display: grid;
  grid-template-columns: 110px 1fr 130px;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
}
.bar-row:hover { background: var(--bc-surface-raised); padding-left: 6px; }
.bar-row.disabled { cursor: default; }
.bar-row.disabled:hover { background: transparent; padding-left: 0; }

.bar-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  height: 10px;
  background: rgba(255,255,255,0.06);
  border-radius: 5px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.4s ease;
  min-width: 2px;
}
.bar-orders   { background: linear-gradient(90deg, var(--bc-primary) 0%, var(--bc-primary-light) 100%); }
.bar-invoices { background: linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%); }

.bar-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 12px;
  color: var(--bc-text);
  white-space: nowrap;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--bc-border);
  font-size: 13px;
}

/* Drawer */
.drawer-controls { margin-bottom: 12px; }
.drawer-table    { font-size: 13px; }

.lines-panel {
  margin-top: 20px;
  border: 1px solid var(--bc-border);
  border-radius: 10px;
  overflow: hidden;
}
.lines-header {
  padding: 10px 14px;
  background: var(--bc-surface-raised);
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--bc-border);
}
</style>
