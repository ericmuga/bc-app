<template>
  <div class="bc-reports-layout">
    <!-- ── SLICER PANEL ──────────────────────────────────────────────── -->
    <aside class="slicer-panel">
      <div class="slicer-header">
        <i class="pi pi-filter" />
        <span>Filters</span>
        <Button icon="pi pi-refresh" text rounded size="small"
          v-tooltip="'Reset'" @click="resetFilters" style="margin-left:auto" />
      </div>

      <!-- Date range -->
      <div class="slicer-group">
        <label class="slicer-label">Posting Date From</label>
        <DatePicker v-model="filters.dateFrom" date-format="yy-mm-dd"
          show-icon fluid @date-select="onDateChange" />
      </div>
      <div class="slicer-group">
        <label class="slicer-label">Posting Date To</label>
        <DatePicker v-model="filters.dateTo" date-format="yy-mm-dd"
          show-icon fluid @date-select="onDateChange" />
      </div>

      <!-- Companies -->
      <div class="slicer-group">
        <label class="slicer-label">Companies</label>
        <div v-for="c in ALL_COMPANIES" :key="c" class="slicer-check">
          <Checkbox
            :model-value="filters.companies.includes(c)"
            :input-id="`co-${c}`"
            binary
            @update:model-value="toggleCompany(c, $event)"
          />
          <label :for="`co-${c}`">{{ c }}</label>
        </div>
      </div>

      <!-- Document types -->
      <div class="slicer-group">
        <label class="slicer-label">Document Types</label>
        <div v-for="dt in DOC_TYPE_OPTIONS" :key="dt.value" class="slicer-check">
          <Checkbox
            :model-value="filters.docTypes.includes(dt.value)"
            :input-id="`dt-${dt.value}`"
            binary
            @update:model-value="toggleDocType(dt.value, $event)"
          />
          <label :for="`dt-${dt.value}`">{{ dt.label }}</label>
        </div>
      </div>

      <!-- Product type -->
      <div class="slicer-group">
        <label class="slicer-label">Product Type</label>
        <div v-for="pt in PRODUCT_TYPE_OPTIONS" :key="pt.value" class="slicer-check">
          <RadioButton
            v-model="filters.productType"
            :input-id="`pt-${pt.value}`"
            :value="pt.value"
          />
          <label :for="`pt-${pt.value}`">{{ pt.label }}</label>
        </div>
      </div>

      <!-- Gen Bus Posting Group -->
      <div class="slicer-group">
        <label class="slicer-label">Market Type</label>
        <div v-for="g in GEN_BUS_OPTIONS" :key="g.value" class="slicer-check">
          <RadioButton
            v-model="filters.genBusMode"
            :input-id="`gb-${g.value}`"
            :value="g.value"
          />
          <label :for="`gb-${g.value}`">{{ g.label }}</label>
        </div>
      </div>

      <Button label="Run Report" icon="pi pi-play" class="run-btn"
        :loading="loading" @click="runReport" />
    </aside>

    <!-- ── MAIN AREA ─────────────────────────────────────────────────── -->
    <div class="report-main">

      <!-- Tab bar -->
      <div class="tab-bar">
        <button v-for="tab in TABS" :key="tab.value"
          class="tab-btn" :class="{ active: reportType === tab.value }"
          @click="switchReport(tab.value)">
          <i :class="tab.icon" /> {{ tab.label }}
        </button>
      </div>

      <!-- View + export toolbar -->
      <div class="toolbar" v-if="rawRows.length || loading">
        <div class="view-toggle">
          <button v-for="v in VIEW_OPTIONS" :key="v.value"
            class="view-btn" :class="{ active: viewMode === v.value }"
            @click="viewMode = v.value">
            {{ v.label }}
          </button>
        </div>
        <div class="kpi-strip" v-if="grandTotal.Amount !== 0 || grandTotal.Qty !== 0">
          <div class="kpi-card">
            <span class="kpi-label">Groups</span>
            <span class="kpi-val">{{ matrixRows.length }}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Qty</span>
            <span class="kpi-val">{{ fmt(grandTotal.Qty) }}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Amount</span>
            <span class="kpi-val amount">{{ fmtAmt(grandTotal.Amount) }}</span>
          </div>
        </div>
        <Button icon="pi pi-download" text size="small" v-tooltip="'Export Excel'"
          :disabled="!matrixRows.length" @click="exportExcel" style="margin-left:auto" />
      </div>

      <!-- Error / no-access -->
      <Message v-if="error"    severity="error" :closable="false" class="mx">{{ error }}</Message>
      <Message v-if="noAccess" severity="warn"  :closable="false" class="mx">
        Your account does not have access to BC Reports.
        Ask an admin to assign you the <strong>analyst</strong> role.
      </Message>

      <!-- Empty / skeleton -->
      <div v-if="!loading && !error && !noAccess && !rawRows.length" class="empty-state">
        <i class="pi pi-chart-bar" style="font-size:3rem;opacity:.25" />
        <p>Select filters and click <strong>Run Report</strong></p>
      </div>
      <div v-if="loading" class="skeleton-wrap">
        <Skeleton height="2rem" class="mb" v-for="n in 8" :key="n" />
      </div>

      <!-- Matrix table -->
      <div v-if="!loading && matrixRows.length" class="matrix-wrap">
        <DataTable :value="matrixRows" show-gridlines size="small"
          scroll-height="calc(100vh - 220px)" scrollable
          :row-class="rowClass">

          <!-- Group key (frozen) -->
          <Column :header="dimLabel" field="GroupKey" frozen style="min-width:170px">
            <template #body="{ data }">
              <strong v-if="data._isTotal">{{ data.GroupKey }}</strong>
              <span v-else>{{ data.GroupKey }}</span>
            </template>
          </Column>

          <!-- Per-company columns -->
          <template v-for="co in activeCompanies" :key="co">
            <Column :header="`${co} Qty`" class="num-col" style="min-width:100px">
              <template #body="{ data }">
                <span :class="numClass(data[co]?.Qty)">{{ fmt(data[co]?.Qty) }}</span>
              </template>
            </Column>
            <Column :header="`${co} Amount`" class="num-col amt-col" style="min-width:120px">
              <template #body="{ data }">
                <span :class="numClass(data[co]?.Amount)">{{ fmtAmt(data[co]?.Amount) }}</span>
              </template>
            </Column>
          </template>

          <!-- Grand total columns -->
          <Column header="Total Qty" class="num-col tot-col" style="min-width:110px">
            <template #body="{ data }">
              <span :class="numClass(data._totQty)">{{ fmt(data._totQty) }}</span>
            </template>
          </Column>
          <Column header="Total Amount" class="num-col tot-col amt-col" style="min-width:130px">
            <template #body="{ data }">
              <span :class="numClass(data._totAmount)">{{ fmtAmt(data._totAmount) }}</span>
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { bcReportsApi } from '@/services/bcReports.js'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Button     from 'primevue/button'
import Checkbox   from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import DatePicker from 'primevue/datepicker'
import Skeleton   from 'primevue/skeleton'
import Message    from 'primevue/message'
import * as XLSX  from 'xlsx'

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_COMPANIES = ['FCL', 'CM', 'FLM', 'RMK']

const DOC_TYPE_OPTIONS = [
  { value: 'invoice',  label: 'Posted Invoices' },
  { value: 'credit',   label: 'Credit Memos'    },
  { value: 'unposted', label: 'Unposted Orders' },
  { value: 'pda',      label: 'PDA Archive'     },
]

const PRODUCT_TYPE_OPTIONS = [
  { value: 'all',   label: 'All'         },
  { value: 'own',   label: 'Own Product' },
  { value: 'third', label: 'Third Party' },
]

const GEN_BUS_OPTIONS = [
  { value: 'all',     label: 'All'     },
  { value: 'local',   label: 'Local'   },
  { value: 'foreign', label: 'Foreign' },
]

const TABS = [
  { value: 'postingGroup',  label: 'By Posting Group', icon: 'pi pi-tag'        },
  { value: 'sector',        label: 'By Sector',         icon: 'pi pi-sitemap'   },
  { value: 'salesperson',   label: 'By Salesperson',    icon: 'pi pi-user'      },
  { value: 'route',         label: 'By Route',          icon: 'pi pi-map-marker'},
]

const VIEW_OPTIONS = [
  { value: 'net',     label: 'Net'          },
  { value: 'sales',   label: 'Sales Only'   },
  { value: 'credits', label: 'Credits Only' },
]

const SALES_TYPES   = ['Invoice', 'Unposted', 'PDA']
const CREDIT_TYPES  = ['Credit Memo']

// ── State ────────────────────────────────────────────────────────────────────

const auth         = useAuthStore()
const loading      = ref(false)
const error        = ref(null)
const noAccess     = ref(false)
const rawRows      = ref([])
const reportType   = ref('postingGroup')
const viewMode     = ref('net')
const genBusPGOptions = ref([])

function defaultDate(offsetDays = 1) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}

const filters = ref({
  dateFrom:    defaultDate(1),
  dateTo:      defaultDate(1),
  companies:   [...ALL_COMPANIES],
  docTypes:    ['invoice', 'credit', 'unposted', 'pda'],
  productType: 'all',    // 'all' | 'own' | 'third'
  genBusMode:  'all',    // 'all' | 'local' | 'foreign'
})

// ── Computed ─────────────────────────────────────────────────────────────────

const dimLabel = computed(() => {
  const map = { postingGroup: 'Posting Group', sector: 'Sector',
                salesperson: 'Salesperson', route: 'Route' }
  return map[reportType.value] || 'Group'
})

/** Companies that appear in this result set */
const activeCompanies = computed(() => {
  const seen = new Set(rawRows.value.map(r => r.Company))
  return ALL_COMPANIES.filter(c => seen.has(c))
})

/** Filter raw rows according to viewMode */
const visibleRows = computed(() => {
  if (viewMode.value === 'sales')   return rawRows.value.filter(r => SALES_TYPES.includes(r.DocType))
  if (viewMode.value === 'credits') return rawRows.value.filter(r => CREDIT_TYPES.includes(r.DocType))
  return rawRows.value
})

/** Pivot flat rows → matrix for DataTable */
const matrixRows = computed(() => {
  if (!visibleRows.value.length) return []

  const map = new Map()
  for (const row of visibleRows.value) {
    if (!map.has(row.GroupKey)) map.set(row.GroupKey, { GroupKey: row.GroupKey })
    const entry = map.get(row.GroupKey)
    if (!entry[row.Company]) entry[row.Company] = { Qty: 0, Amount: 0, DocCount: 0 }
    // Credits mode: flip sign so they show as positive
    const sign = (viewMode.value === 'credits') ? -1 : 1
    entry[row.Company].Qty      += sign * (Number(row.Qty)      || 0)
    entry[row.Company].Amount   += sign * (Number(row.Amount)   || 0)
    entry[row.Company].DocCount += Number(row.DocCount) || 0
  }

  const rows = [...map.values()].map(r => {
    r._totQty    = activeCompanies.value.reduce((s, co) => s + (r[co]?.Qty    || 0), 0)
    r._totAmount = activeCompanies.value.reduce((s, co) => s + (r[co]?.Amount || 0), 0)
    return r
  })
  rows.sort((a, b) => b._totAmount - a._totAmount)

  // TOTAL row
  const tot = { GroupKey: 'TOTAL', _isTotal: true }
  for (const co of activeCompanies.value) {
    tot[co] = {
      Qty:    rows.reduce((s, r) => s + (r[co]?.Qty    || 0), 0),
      Amount: rows.reduce((s, r) => s + (r[co]?.Amount || 0), 0),
    }
  }
  tot._totQty    = rows.reduce((s, r) => s + r._totQty,    0)
  tot._totAmount = rows.reduce((s, r) => s + r._totAmount, 0)
  rows.push(tot)
  return rows
})

const grandTotal = computed(() => {
  const t = matrixRows.value.find(r => r._isTotal)
  return t ? { Qty: t._totQty, Amount: t._totAmount } : { Qty: 0, Amount: 0 }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const toDateStr = d =>
  (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

const fmt = (val, dec = 2) =>
  val == null || val === '' ? '–'
    : Number(val).toLocaleString('en-KE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtAmt = val => fmt(val, 2)

function rowClass(data) {
  return data._isTotal ? 'total-row' : ''
}

function numClass(val) {
  if (val == null) return 'num-dash'
  return Number(val) < 0 ? 'num negative' : 'num'
}

// ── Actions ───────────────────────────────────────────────────────────────────

function toggleCompany(c, checked) {
  const list = [...filters.value.companies]
  if (checked) { if (!list.includes(c)) list.push(c) }
  else         { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1) }
  filters.value.companies = list
}

function toggleDocType(dt, checked) {
  const list = [...filters.value.docTypes]
  if (checked) { if (!list.includes(dt)) list.push(dt) }
  else         { const i = list.indexOf(dt); if (i >= 0) list.splice(i, 1) }
  filters.value.docTypes = list
}

function resetFilters() {
  filters.value.dateFrom    = defaultDate(1)
  filters.value.dateTo      = defaultDate(1)
  filters.value.companies   = [...ALL_COMPANIES]
  filters.value.docTypes    = ['invoice', 'credit', 'unposted', 'pda']
  filters.value.productType = 'all'
  filters.value.genBusMode  = 'all'
  rawRows.value = []
  error.value   = null
}

function onDateChange() {
  if (rawRows.value.length) runReport()
}

function switchReport(type) {
  reportType.value = type
  rawRows.value    = []
  viewMode.value   = 'net'
  runReport()
}

async function runReport() {
  const role = auth.user?.role
  if (role !== 'admin' && role !== 'analyst') { noAccess.value = true; return }
  noAccess.value = false
  error.value    = null
  loading.value  = true
  rawRows.value  = []
  try {
    const thirdParty = filters.value.productType === 'own'   ? 0
                     : filters.value.productType === 'third' ? 1
                     : null

    const { data } = await bcReportsApi.run(reportType.value, {
      dateFrom:   toDateStr(filters.value.dateFrom),
      dateTo:     toDateStr(filters.value.dateTo),
      companies:  filters.value.companies,
      docTypes:   filters.value.docTypes,
      thirdParty,
      genBusMode: filters.value.genBusMode,
    })
    rawRows.value = data
  } catch (err) {
    if (err.response?.status === 403) noAccess.value = true
    else error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

async function loadSlicers() {
  try {
    const { data } = await bcReportsApi.genBusPGs(filters.value.companies)
    genBusPGOptions.value = data
  } catch { /* silent */ }
}

function exportExcel() {
  const label = dimLabel.value
  const headers = [
    label,
    ...activeCompanies.value.flatMap(co => [`${co} Qty`, `${co} Amount`]),
    'Total Qty', 'Total Amount',
  ]
  const rows = matrixRows.value.map(r => [
    r.GroupKey,
    ...activeCompanies.value.flatMap(co => [r[co]?.Qty ?? '', r[co]?.Amount ?? '']),
    r._totQty, r._totAmount,
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, label)
  XLSX.writeFile(wb, `bc-${reportType.value}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

onMounted(async () => {
  await loadSlicers()
  if (['admin','analyst'].includes(auth.user?.role)) runReport()
  else noAccess.value = true
})
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────── */
.bc-reports-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #f0f2f5;
  font-size: 13px;
}

/* ── Slicer panel ───────────────────────────────────────────────────── */
.slicer-panel {
  width: 210px;
  min-width: 210px;
  background: #fff;
  border-right: 1px solid #d0d5dd;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.slicer-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #667085;
  margin-bottom: 12px;
}
.slicer-group { margin-bottom: 14px; }
.slicer-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #667085;
  margin-bottom: 5px;
}
.slicer-check {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  font-size: 12.5px;
  color: #344054;
  cursor: pointer;
}
.slicer-check label { cursor: pointer; }
.run-btn { width: 100%; margin-top: 8px; }

/* ── Main area ──────────────────────────────────────────────────────── */
.report-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Tab bar ────────────────────────────────────────────────────────── */
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  background: #fff;
  border-bottom: 2px solid #e4e7ec;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12.5px;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  color: #667085;
  transition: color .15s, border-color .15s;
  font-weight: 500;
}
.tab-btn.active  { color: #1d4ed8; border-bottom-color: #1d4ed8; font-weight: 700; }
.tab-btn:hover:not(.active) { color: #344054; }

/* ── Toolbar ────────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: #fff;
  border-bottom: 1px solid #e4e7ec;
  flex-wrap: wrap;
}
.view-toggle { display: flex; gap: 2px; }
.view-btn {
  padding: 4px 12px;
  border: 1px solid #d0d5dd;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #344054;
  transition: all .15s;
}
.view-btn:first-child { border-radius: 4px 0 0 4px; }
.view-btn:last-child  { border-radius: 0 4px 4px 0; }
.view-btn:not(:first-child) { border-left: none; }
.view-btn.active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; font-weight: 600; }

/* KPIs */
.kpi-strip { display: flex; gap: 0; }
.kpi-card {
  display: flex;
  flex-direction: column;
  padding: 2px 16px 2px 4px;
  border-right: 1px solid #e4e7ec;
}
.kpi-label { font-size: 10px; color: #667085; text-transform: uppercase; letter-spacing: .05em; }
.kpi-val   { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-val.amount { color: #1d4ed8; }

/* ── Empty / skeleton ───────────────────────────────────────────────── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #98a2b3;
  gap: 10px;
}
.skeleton-wrap { padding: 12px; }
.mb { margin-bottom: 6px !important; }

/* ── Matrix table ───────────────────────────────────────────────────── */
.matrix-wrap {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px;
}

/* Row colors — always visible, not just on hover */
:deep(.p-datatable-tbody > tr > td) {
  color: #101828 !important;
  background: #ffffff !important;
  padding: 5px 10px !important;
  border-color: #e4e7ec !important;
}
:deep(.p-datatable-tbody > tr:nth-child(even) > td) {
  background: #f3f4f6 !important;
}
:deep(.p-datatable-tbody > tr:hover > td) {
  background: #dbeafe !important;
  color: #1e3a8a !important;
}
:deep(.p-datatable-tbody > tr.total-row > td) {
  background: #1d4ed8 !important;
  color: #ffffff !important;
  font-weight: 700 !important;
}
:deep(.p-datatable-thead > tr > th) {
  background: #1e293b !important;
  color: #f1f5f9 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: 8px 10px !important;
  white-space: nowrap;
  border-color: #334155 !important;
}

/* number cells */
:deep(.num-col) { text-align: right !important; }
:deep(.num-col .p-column-header-content) { justify-content: flex-end; }
:deep(.tot-col th) { background: #0f172a !important; }

.num      { font-variant-numeric: tabular-nums; }
.num-dash { color: #98a2b3; }
.negative { color: #dc2626; font-weight: 600; }
.amt-col  { color: #1d4ed8; }

.mx { margin: 8px 12px; }
</style>
