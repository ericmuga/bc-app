<template>
  <div class="bc-reports-layout">
    <aside class="slicer-panel">
      <div class="slicer-header">
        <i class="pi pi-sliders-h" />
        <span>Report Filters</span>
        <Button icon="pi pi-refresh" text rounded size="small" @click="resetFilters" style="margin-left:auto" />
      </div>

      <details class="filter-box" open>
        <summary>Date Window</summary>
        <div class="filter-body">
          <label class="slicer-label">Posting Date From</label>
          <DatePicker v-model="filters.dateFrom" date-format="yy-mm-dd" show-icon fluid @date-select="onDateChange" />
          <label class="slicer-label">Posting Date To</label>
          <DatePicker v-model="filters.dateTo" date-format="yy-mm-dd" show-icon fluid @date-select="onDateChange" />
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Scope</summary>
        <div class="filter-body">
          <label class="slicer-label">Companies</label>
          <div v-for="c in ALL_COMPANIES" :key="c" class="slicer-check">
            <Checkbox :model-value="filters.companies.includes(c)" :input-id="`co-${c}`" binary @update:model-value="toggleCompany(c, $event)" />
            <label :for="`co-${c}`">{{ c }}</label>
          </div>
          <label class="slicer-label">Document Types</label>
          <div v-for="dt in DOC_TYPE_OPTIONS" :key="dt.value" class="slicer-check">
            <Checkbox :model-value="filters.docTypes.includes(dt.value)" :input-id="`dt-${dt.value}`" binary @update:model-value="toggleDocType(dt.value, $event)" />
            <label :for="`dt-${dt.value}`">{{ dt.label }}</label>
          </div>
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Classification</summary>
        <div class="filter-body">
          <label class="slicer-label">Product Type</label>
          <div v-for="pt in PRODUCT_TYPE_OPTIONS" :key="pt.value" class="slicer-check">
            <RadioButton v-model="filters.productType" :input-id="`pt-${pt.value}`" :value="pt.value" />
            <label :for="`pt-${pt.value}`">{{ pt.label }}</label>
          </div>
          <label class="slicer-label">Market Type</label>
          <div v-for="g in GEN_BUS_OPTIONS" :key="g.value" class="slicer-check">
            <RadioButton v-model="filters.genBusMode" :input-id="`gb-${g.value}`" :value="g.value" />
            <label :for="`gb-${g.value}`">{{ g.label }}</label>
          </div>
        </div>
      </details>

      <details class="filter-box" :open="isWeekOnWeek">
        <summary>Week On Week</summary>
        <div class="filter-body">
          <label class="slicer-label">Compare By</label>
          <div v-for="opt in WEEK_DIMENSION_OPTIONS" :key="opt.value" class="slicer-check">
            <RadioButton v-model="filters.weekDimension" :input-id="`wd-${opt.value}`" :value="opt.value" />
            <label :for="`wd-${opt.value}`">{{ opt.label }}</label>
          </div>
          <label class="slicer-label">Days Of Week</label>
          <div v-for="day in DAY_OPTIONS" :key="day.value" class="slicer-check">
            <Checkbox :model-value="filters.daysOfWeek.includes(day.value)" :input-id="`day-${day.value}`" binary @update:model-value="toggleDay(day.value, $event)" />
            <label :for="`day-${day.value}`">{{ day.label }}</label>
          </div>
        </div>
      </details>

      <details class="filter-box" :open="isProductPerformance">
        <summary>Product Performance</summary>
        <div class="filter-body">
          <label class="slicer-label">Customer</label>
          <input v-model.trim="filters.customerQuery" class="filter-input" placeholder="Customer no. or name" />
          <label class="slicer-label">Item No</label>
          <input v-model.trim="filters.itemQuery" class="filter-input" placeholder="Item no. or common item" />
        </div>
      </details>

      <Button label="Run Report" icon="pi pi-play" class="run-btn" :loading="loading" @click="runReport" />
    </aside>

    <div class="report-main">
      <div class="tab-bar">
        <button v-for="tab in TABS" :key="tab.value" class="tab-btn" :class="{ active: reportType === tab.value }" @click="switchReport(tab.value)">
          <i :class="tab.icon" /> {{ tab.label }}
        </button>
      </div>

      <div class="toolbar" v-if="loading || rawRows.length">
        <div v-if="isMatrixReport" class="view-toggle">
          <button v-for="v in VIEW_OPTIONS" :key="v.value" class="view-btn" :class="{ active: viewMode === v.value }" @click="viewMode = v.value">
            {{ v.label }}
          </button>
        </div>
        <div v-if="periodLabel" class="period-pill">{{ periodLabel }}</div>
        <div class="kpi-strip" v-if="summaryCards.length">
          <div v-for="card in summaryCards" :key="card.label" class="kpi-card">
            <span class="kpi-label">{{ card.label }}</span>
            <span class="kpi-val" :class="card.className">{{ card.value }}</span>
          </div>
        </div>
        <Button icon="pi pi-download" text size="small" :disabled="!rawRows.length" @click="exportExcel" style="margin-left:auto" />
      </div>

      <Message v-if="error" severity="error" :closable="false" class="mx">{{ error }}</Message>
      <Message v-if="noAccess" severity="warn" :closable="false" class="mx">Your account does not have access to BC Reports.</Message>
      <div v-if="!loading && !error && !noAccess && !rawRows.length" class="empty-state">
        <i class="pi pi-chart-bar" style="font-size:3rem;opacity:.25" />
        <p>Select filters and click <strong>Run Report</strong></p>
      </div>
      <div v-if="loading" class="skeleton-wrap">
        <Skeleton height="2rem" class="mb" v-for="n in 8" :key="n" />
      </div>

      <div v-if="!loading && isMatrixReport && matrixRows.length" class="matrix-wrap">
        <DataTable :value="matrixRows" show-gridlines size="small" scroll-height="calc(100vh - 220px)" scrollable :row-class="rowClass">
          <Column :header="dimLabel" field="GroupKey" frozen style="min-width:170px" />
          <template v-for="co in activeCompanies" :key="co">
            <Column :header="`${co} Qty`" class="num-col" style="min-width:100px">
              <template #body="{ data }">{{ fmt(data[co]?.Qty) }}</template>
            </Column>
            <Column :header="`${co} Amount`" class="num-col" style="min-width:120px">
              <template #body="{ data }">{{ fmtAmt(data[co]?.Amount) }}</template>
            </Column>
          </template>
          <Column header="Total Qty" class="num-col" style="min-width:110px">
            <template #body="{ data }">{{ fmt(data._totQty) }}</template>
          </Column>
          <Column header="Total Amount" class="num-col" style="min-width:130px">
            <template #body="{ data }">{{ fmtAmt(data._totAmount) }}</template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isWeekOnWeek && weekRows.length" class="matrix-wrap">
        <Message v-if="reportMeta.usesLatestTwoWeeksOnly" severity="info" :closable="false" class="inline-message">
          The selected range spans more than two weeks, so only the latest full week and the previous week are compared.
        </Message>
        <DataTable :value="weekRows" show-gridlines size="small" scroll-height="calc(100vh - 250px)" scrollable>
          <Column :header="weekDimensionLabel" field="GroupKey" frozen style="min-width:190px" />
          <Column header="Prev Qty"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
          <Column header="Current Qty"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Qty Var"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
          <Column header="Prev Amount"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
          <Column header="Current Amount"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <Column header="Variance"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
          <Column header="Trend">
            <template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isProductPerformance && productGroups.length" class="product-wrap">
        <div class="highlight-row">
          <div class="highlight-card">
            <span class="kpi-label">Top Gainer</span>
            <strong>{{ topGainer?.ProductKey || '–' }}</strong>
            <span>{{ topGainer?.ProductDescription || 'No product data' }}</span>
            <strong class="positive">{{ topGainer ? signedFmt(topGainer.VarianceAmount) : '–' }}</strong>
          </div>
          <div class="highlight-card">
            <span class="kpi-label">Top Loser</span>
            <strong>{{ topLoser?.ProductKey || '–' }}</strong>
            <span>{{ topLoser?.ProductDescription || 'No product data' }}</span>
            <strong class="negative">{{ topLoser ? signedFmt(topLoser.VarianceAmount) : '–' }}</strong>
          </div>
        </div>

        <details v-for="group in productGroups" :key="group.GroupKey" class="product-group" :open="group === productGroups[0]">
          <summary>
            <div class="group-head">
              <div>
                <strong>{{ group.GroupKey }}</strong>
                <span>{{ group.products.length }} products</span>
              </div>
              <div class="group-metrics">
                <span>{{ fmtAmt(group.PreviousAmount) }}</span>
                <span>{{ fmtAmt(group.CurrentAmount) }}</span>
                <span :class="varianceClass(group.VarianceAmount)">{{ signedFmt(group.VarianceAmount) }}</span>
              </div>
            </div>
          </summary>
          <div class="filter-body">
            <DataTable :value="group.products" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Item" field="ProductKey" style="min-width:160px" />
              <Column header="Description" field="ProductDescription" style="min-width:240px" />
              <Column header="Prev Qty"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
              <Column header="Current Qty"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
              <Column header="Prev Amount"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
              <Column header="Current Amount"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
              <Column header="Variance"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
              <Column header="Trend"><template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template></Column>
            </DataTable>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { bcReportsApi } from '@/services/bcReports.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import DatePicker from 'primevue/datepicker'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import * as XLSX from 'xlsx'

const ALL_COMPANIES = ['FCL', 'CM', 'FLM', 'RMK']
const DOC_TYPE_OPTIONS = [
  { value: 'invoice', label: 'Posted Invoices' },
  { value: 'credit', label: 'Credit Memos' },
  { value: 'unposted', label: 'Unposted Orders' },
  { value: 'pda', label: 'PDA Archive' },
]
const PRODUCT_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Own Product' },
  { value: 'third', label: 'Third Party' },
]
const GEN_BUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'local', label: 'Local' },
  { value: 'foreign', label: 'Foreign' },
]
const WEEK_DIMENSION_OPTIONS = [
  { value: 'postingGroup', label: 'Posting Group' },
  { value: 'sector', label: 'Sector' },
]
const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]
const TABS = [
  { value: 'postingGroup', label: 'By Posting Group', icon: 'pi pi-tag' },
  { value: 'sector', label: 'By Sector', icon: 'pi pi-sitemap' },
  { value: 'salesperson', label: 'By Salesperson', icon: 'pi pi-user' },
  { value: 'route', label: 'By Route', icon: 'pi pi-map-marker' },
  { value: 'weekOnWeek', label: 'Week On Week', icon: 'pi pi-chart-line' },
  { value: 'productPerformance', label: 'Product Performance', icon: 'pi pi-box' },
]
const VIEW_OPTIONS = [
  { value: 'net', label: 'Net' },
  { value: 'sales', label: 'Sales Only' },
  { value: 'credits', label: 'Credits Only' },
]
const SALES_TYPES = ['Invoice', 'Unposted', 'PDA']
const CREDIT_TYPES = ['Credit Memo']

const auth = useAuthStore()
const loading = ref(false)
const error = ref(null)
const noAccess = ref(false)
const rawRows = ref([])
const reportMeta = ref({})
const reportType = ref('postingGroup')
const viewMode = ref('net')

function defaultDate(offsetDays = 1) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}

const filters = ref({
  dateFrom: defaultDate(1),
  dateTo: defaultDate(1),
  companies: [...ALL_COMPANIES],
  docTypes: ['invoice', 'credit', 'unposted', 'pda'],
  productType: 'all',
  genBusMode: 'all',
  weekDimension: 'postingGroup',
  daysOfWeek: DAY_OPTIONS.map((d) => d.value),
  customerQuery: '',
  itemQuery: '',
})

const isMatrixReport = computed(() => ['postingGroup', 'sector', 'salesperson', 'route'].includes(reportType.value))
const isWeekOnWeek = computed(() => reportType.value === 'weekOnWeek')
const isProductPerformance = computed(() => reportType.value === 'productPerformance')
const dimLabel = computed(() => ({ postingGroup: 'Posting Group', sector: 'Sector', salesperson: 'Salesperson', route: 'Route' }[reportType.value] || 'Group'))
const weekDimensionLabel = computed(() => filters.value.weekDimension === 'sector' ? 'Sector' : 'Posting Group')
const periodLabel = computed(() => {
  if (isWeekOnWeek.value && reportMeta.value.currentWeekStart) return `${reportMeta.value.previousWeekStart} to ${reportMeta.value.previousWeekEnd} vs ${reportMeta.value.currentWeekStart} to ${reportMeta.value.currentWeekEnd}`
  if (isProductPerformance.value && reportMeta.value.currentFrom) return `${reportMeta.value.previousFrom} to ${reportMeta.value.previousTo} vs ${reportMeta.value.currentFrom} to ${reportMeta.value.currentTo}`
  return ''
})

const activeCompanies = computed(() => {
  const seen = new Set(rawRows.value.map((r) => r.Company))
  return ALL_COMPANIES.filter((c) => seen.has(c))
})

const visibleRows = computed(() => {
  if (viewMode.value === 'sales') return rawRows.value.filter((r) => SALES_TYPES.includes(r.DocType))
  if (viewMode.value === 'credits') return rawRows.value.filter((r) => CREDIT_TYPES.includes(r.DocType))
  return rawRows.value
})

const matrixRows = computed(() => {
  if (!isMatrixReport.value || !visibleRows.value.length) return []
  const map = new Map()
  for (const row of visibleRows.value) {
    if (!map.has(row.GroupKey)) map.set(row.GroupKey, { GroupKey: row.GroupKey })
    const entry = map.get(row.GroupKey)
    if (!entry[row.Company]) entry[row.Company] = { Qty: 0, Amount: 0 }
    const sign = viewMode.value === 'credits' ? -1 : 1
    entry[row.Company].Qty += sign * (Number(row.Qty) || 0)
    entry[row.Company].Amount += sign * (Number(row.Amount) || 0)
  }
  const rows = [...map.values()].map((row) => {
    row._totQty = activeCompanies.value.reduce((sum, co) => sum + (row[co]?.Qty || 0), 0)
    row._totAmount = activeCompanies.value.reduce((sum, co) => sum + (row[co]?.Amount || 0), 0)
    return row
  }).sort((a, b) => b._totAmount - a._totAmount)
  const total = { GroupKey: 'TOTAL', _isTotal: true }
  for (const co of activeCompanies.value) {
    total[co] = { Qty: rows.reduce((sum, row) => sum + (row[co]?.Qty || 0), 0), Amount: rows.reduce((sum, row) => sum + (row[co]?.Amount || 0), 0) }
  }
  total._totQty = rows.reduce((sum, row) => sum + row._totQty, 0)
  total._totAmount = rows.reduce((sum, row) => sum + row._totAmount, 0)
  rows.push(total)
  return rows
})

const weekRows = computed(() => isWeekOnWeek.value ? rawRows.value.map(normalizeRow).sort((a, b) => b.VarianceAmount - a.VarianceAmount) : [])
const productRows = computed(() => isProductPerformance.value ? rawRows.value.map(normalizeRow).sort((a, b) => b.VarianceAmount - a.VarianceAmount) : [])
const productGroups = computed(() => {
  const groups = new Map()
  for (const row of productRows.value) {
    if (!groups.has(row.GroupKey)) groups.set(row.GroupKey, { GroupKey: row.GroupKey, PreviousAmount: 0, CurrentAmount: 0, VarianceAmount: 0, products: [] })
    const group = groups.get(row.GroupKey)
    group.products.push(row)
    group.PreviousAmount += row.PreviousAmount
    group.CurrentAmount += row.CurrentAmount
    group.VarianceAmount += row.VarianceAmount
  }
  return [...groups.values()].map((g) => ({ ...g, products: g.products.sort((a, b) => b.VarianceAmount - a.VarianceAmount) })).sort((a, b) => b.VarianceAmount - a.VarianceAmount)
})
const topGainer = computed(() => productRows.value.find((row) => row.VarianceAmount >= 0) || productRows.value[0] || null)
const topLoser = computed(() => [...productRows.value].reverse().find((row) => row.VarianceAmount <= 0) || productRows.value.at(-1) || null)

const summaryCards = computed(() => {
  if (isMatrixReport.value && matrixRows.value.length) {
    const total = matrixRows.value.find((row) => row._isTotal)
    return total ? [
      { label: 'Groups', value: String(matrixRows.value.length - 1) },
      { label: 'Qty', value: fmt(total._totQty) },
      { label: 'Amount', value: fmtAmt(total._totAmount), className: 'positive' },
    ] : []
  }
  if (isWeekOnWeek.value && weekRows.value.length) {
    const prev = weekRows.value.reduce((sum, row) => sum + row.PreviousAmount, 0)
    const curr = weekRows.value.reduce((sum, row) => sum + row.CurrentAmount, 0)
    const variance = curr - prev
    return [
      { label: 'Groups', value: String(weekRows.value.length) },
      { label: 'Prev Amount', value: fmtAmt(prev) },
      { label: 'Current Amount', value: fmtAmt(curr) },
      { label: 'Variance', value: signedFmt(variance), className: variance >= 0 ? 'positive' : 'negative' },
    ]
  }
  if (isProductPerformance.value && productRows.value.length) {
    const variance = productRows.value.reduce((sum, row) => sum + row.VarianceAmount, 0)
    return [
      { label: 'Posting Groups', value: String(productGroups.value.length) },
      { label: 'Products', value: String(productRows.value.length) },
      { label: 'Current Amount', value: fmtAmt(productRows.value.reduce((sum, row) => sum + row.CurrentAmount, 0)) },
      { label: 'Net Movement', value: signedFmt(variance), className: variance >= 0 ? 'positive' : 'negative' },
    ]
  }
  return []
})

function normalizeRow(row) {
  return {
    ...row,
    PreviousQty: Number(row.PreviousQty || 0),
    CurrentQty: Number(row.CurrentQty || 0),
    VarianceQty: Number(row.VarianceQty || 0),
    PreviousAmount: Number(row.PreviousAmount || 0),
    CurrentAmount: Number(row.CurrentAmount || 0),
    VarianceAmount: Number(row.VarianceAmount || 0),
  }
}

const toDateStr = (date) => (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10)
const fmt = (val, dec = 2) => val == null || val === '' ? '–' : Number(val).toLocaleString('en-KE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtAmt = (val) => fmt(val, 2)
const signedFmt = (val) => `${Number(val) >= 0 ? '+' : ''}${fmt(val, 2)}`
const varianceClass = (val) => Number(val) >= 0 ? 'positive' : 'negative'
const trendClass = (val) => Number(val) > 0 ? 'positive' : Number(val) < 0 ? 'negative' : 'neutral'
const trendLabel = (val) => Number(val) > 0 ? 'Increase' : Number(val) < 0 ? 'Decrease' : 'Flat'
const rowClass = (data) => data._isTotal ? 'total-row' : ''

function toggleCompany(company, checked) {
  const list = [...filters.value.companies]
  if (checked) { if (!list.includes(company)) list.push(company) } else { filters.value.companies = list.filter((value) => value !== company); return }
  filters.value.companies = list
}

function toggleDocType(docType, checked) {
  const list = [...filters.value.docTypes]
  if (checked) { if (!list.includes(docType)) list.push(docType) } else { filters.value.docTypes = list.filter((value) => value !== docType); return }
  filters.value.docTypes = list
}

function toggleDay(day, checked) {
  const list = [...filters.value.daysOfWeek]
  if (checked) { if (!list.includes(day)) list.push(day) } else { filters.value.daysOfWeek = list.filter((value) => value !== day); return }
  filters.value.daysOfWeek = list.sort((a, b) => a - b)
}

function resetFilters() {
  filters.value = {
    dateFrom: defaultDate(1),
    dateTo: defaultDate(1),
    companies: [...ALL_COMPANIES],
    docTypes: ['invoice', 'credit', 'unposted', 'pda'],
    productType: 'all',
    genBusMode: 'all',
    weekDimension: 'postingGroup',
    daysOfWeek: DAY_OPTIONS.map((d) => d.value),
    customerQuery: '',
    itemQuery: '',
  }
  rawRows.value = []
  reportMeta.value = {}
  error.value = null
}

function onDateChange() {
  if (rawRows.value.length) runReport()
}

function switchReport(type) {
  reportType.value = type
  rawRows.value = []
  reportMeta.value = {}
  viewMode.value = 'net'
  runReport()
}

async function runReport() {
  const role = auth.user?.role
  if (role !== 'admin' && role !== 'analyst') { noAccess.value = true; return }
  noAccess.value = false
  error.value = null
  loading.value = true
  rawRows.value = []
  reportMeta.value = {}
  try {
    const thirdParty = filters.value.productType === 'own' ? 0 : filters.value.productType === 'third' ? 1 : null
    const { data } = await bcReportsApi.run(reportType.value, {
      dimension: filters.value.weekDimension,
      dateFrom: toDateStr(filters.value.dateFrom),
      dateTo: toDateStr(filters.value.dateTo),
      companies: filters.value.companies,
      docTypes: filters.value.docTypes,
      daysOfWeek: filters.value.daysOfWeek,
      thirdParty,
      genBusMode: filters.value.genBusMode,
      customerQuery: filters.value.customerQuery,
      itemQuery: filters.value.itemQuery,
    })
    rawRows.value = Array.isArray(data) ? data : (data.rows || [])
    reportMeta.value = Array.isArray(data) ? {} : (data.meta || {})
  } catch (err) {
    if (err.response?.status === 403) noAccess.value = true
    else error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

function exportExcel() {
  const wb = XLSX.utils.book_new()
  if (isMatrixReport.value) {
    const headers = [dimLabel.value, ...activeCompanies.value.flatMap((co) => [`${co} Qty`, `${co} Amount`]), 'Total Qty', 'Total Amount']
    const rows = matrixRows.value.map((row) => [row.GroupKey, ...activeCompanies.value.flatMap((co) => [row[co]?.Qty ?? '', row[co]?.Amount ?? '']), row._totQty, row._totAmount])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), dimLabel.value)
  } else if (isWeekOnWeek.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekRows.value), 'WeekOnWeek')
  } else if (isProductPerformance.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows.value), 'ProductPerformance')
  }
  XLSX.writeFile(wb, `bc-${reportType.value}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

onMounted(() => {
  if (['admin', 'analyst'].includes(auth.user?.role)) runReport()
  else noAccess.value = true
})
</script>

<style scoped>
.bc-reports-layout { display:flex; height:100%; overflow:hidden; background:#f3f6fb; font-size:13px; }
.slicer-panel { width:270px; min-width:270px; background:#fff; border-right:1px solid #dbe3ee; padding:12px; overflow-y:auto; }
.slicer-header { display:flex; align-items:center; gap:8px; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#5b6575; margin-bottom:10px; }
.filter-box { border:1px solid #dbe3ee; border-radius:10px; background:#fbfdff; margin-bottom:10px; overflow:hidden; }
.filter-box summary { list-style:none; cursor:pointer; padding:10px 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#4b5565; }
.filter-box summary::-webkit-details-marker { display:none; }
.filter-body { padding:10px 12px; }
.slicer-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#738096; margin:0 0 6px; }
.slicer-check { display:flex; align-items:center; gap:7px; padding:3px 0; }
.filter-input { width:100%; border:1px solid #ced6e0; border-radius:8px; padding:9px 10px; font-size:12.5px; margin-bottom:10px; }
.run-btn { width:100%; margin-top:8px; }
.report-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
.tab-bar { display:flex; gap:4px; padding:10px 14px 0; background:#fff; border-bottom:1px solid #dbe3ee; flex-wrap:wrap; }
.tab-btn { display:flex; align-items:center; gap:7px; padding:8px 14px; border:none; border-radius:10px 10px 0 0; background:transparent; cursor:pointer; font-size:12.5px; color:#687487; font-weight:600; }
.tab-btn.active { background:#1d4ed8; color:#fff; }
.toolbar { display:flex; align-items:center; gap:12px; padding:8px 14px; background:#fff; border-bottom:1px solid #dbe3ee; flex-wrap:wrap; }
.view-toggle { display:flex; gap:2px; }
.view-btn { padding:4px 12px; border:1px solid #d0d5dd; background:#fff; border-radius:4px; cursor:pointer; font-size:12px; }
.view-btn.active { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
.period-pill { padding:6px 10px; border-radius:999px; background:#eef4ff; color:#24407a; font-size:12px; }
.kpi-strip { display:flex; gap:10px; flex-wrap:wrap; }
.kpi-card, .highlight-card { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:10px; background:#f8fbff; border:1px solid #dde7f3; }
.kpi-label { font-size:10px; color:#667085; text-transform:uppercase; letter-spacing:.05em; }
.kpi-val { font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; }
.positive { color:#166534; }
.negative { color:#b42318; }
.neutral { color:#475467; }
.empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#98a2b3; gap:10px; }
.skeleton-wrap, .matrix-wrap, .product-wrap { padding:12px 14px; }
.matrix-wrap { flex:1; overflow:hidden; }
.highlight-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:12px; }
.product-group { border:1px solid #dbe3ee; border-radius:12px; background:#fff; margin-bottom:10px; overflow:hidden; }
.product-group summary { list-style:none; cursor:pointer; padding:12px; }
.product-group summary::-webkit-details-marker { display:none; }
.group-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.group-head span { display:block; color:#667085; font-size:12px; }
.group-metrics { display:flex; gap:16px; font-weight:700; font-variant-numeric:tabular-nums; }
.trend-pill { display:inline-flex; align-items:center; justify-content:center; min-width:72px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
.trend-pill.positive { background:#dcfce7; }
.trend-pill.negative { background:#fee4e2; }
.trend-pill.neutral { background:#eaecf0; }
.mx, .inline-message { margin:8px 14px; }
.mb { margin-bottom:6px !important; }
:deep(.p-datatable-tbody > tr > td) { color:#101828 !important; background:#fff !important; padding:6px 10px !important; border-color:#e4e7ec !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#f8fafc !important; }
:deep(.p-datatable-tbody > tr.total-row > td) { background:#1d4ed8 !important; color:#fff !important; font-weight:700 !important; }
:deep(.p-datatable-thead > tr > th) { background:#243247 !important; color:#f8fafc !important; font-size:11px !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px !important; border-color:#324256 !important; }
:deep(.num-col) { text-align:right !important; }
@media (max-width:980px) {
  .bc-reports-layout { flex-direction:column; }
  .slicer-panel { width:100%; min-width:100%; border-right:0; border-bottom:1px solid #dbe3ee; }
  .group-head, .toolbar { flex-direction:column; align-items:flex-start; }
}
</style>
