<template>
  <div class="reports-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">POS Reports</h2>
        <p class="text-muted text-sm">Pick a report, set the period, and run. Each report can be exported to Excel (CSV) or PDF.</p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <div class="reports-layout">
      <!-- Left: report selector -->
      <aside class="reports-side">
        <div v-for="r in reports" :key="r.key"
             class="report-tab"
             :class="{ active: tab === r.key }"
             @click="setTab(r.key)">
          <i :class="r.icon" />
          <div>
            <div class="report-name">{{ r.label }}</div>
            <div class="report-desc">{{ r.desc }}</div>
          </div>
        </div>
      </aside>

      <!-- Right: filters + result -->
      <section class="reports-main">
        <div class="filters">
          <div class="filter-field"><label>From</label><DatePicker v-model="dateFrom" date-format="yy-mm-dd" /></div>
          <div class="filter-field"><label>To</label>  <DatePicker v-model="dateTo"   date-format="yy-mm-dd" /></div>
          <div v-if="tab === 'stockPosition'" class="filter-field" style="min-width:160px">
            <label>Item No (optional)</label>
            <InputText v-model="itemNo" placeholder="Drill into one item" />
          </div>
          <Button label="Run" icon="pi pi-play" @click="run" :loading="loading" />
          <Button label="Excel" icon="pi pi-file-excel" severity="secondary"
                  :disabled="!rows.length" :loading="exporting" @click="downloadCsv" />
          <Button label="PDF" icon="pi pi-file-pdf" severity="secondary"
                  :disabled="!rows.length" @click="downloadPdf" />
        </div>

        <!-- Bar chart (top-N inline SVG, no extra deps) -->
        <div v-if="rows.length && chartConfig" class="chart-card">
          <div class="chart-title">{{ chartConfig.title }}</div>
          <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="chart-svg" preserveAspectRatio="xMidYMid meet">
            <g v-for="(b, i) in chartBars" :key="b.label">
              <rect :x="b.x" :y="b.y" :width="barW" :height="b.h" :fill="b.color" rx="2" />
              <text :x="b.x + barW / 2" :y="chartH - 14" text-anchor="middle" font-size="9" fill="#374151">
                {{ b.shortLabel }}
              </text>
              <text :x="b.x + barW / 2" :y="b.y - 3" text-anchor="middle" font-size="9" fill="#111827">
                {{ b.valueLabel }}
              </text>
            </g>
          </svg>
        </div>

        <DataTable :value="rows" size="small" :loading="loading" responsive-layout="scroll" :paginator="true" :rows="50">
          <Column v-for="c in columns" :key="c.field" :field="c.field" :header="c.header"
                  :style="c.style || ''">
            <template #body="{ data }">
              <span v-if="c.format === 'num'">{{ Number(data[c.field] || 0).toFixed(2) }}</span>
              <strong v-else-if="c.format === 'numStrong'">{{ Number(data[c.field] || 0).toFixed(2) }}</strong>
              <span v-else>{{ data[c.field] }}</span>
            </template>
          </Column>
          <template #footer>
            <div v-if="rows.length" class="totals-row">
              <span>Rows: <strong>{{ rows.length }}</strong></span>
              <span v-for="t in totals" :key="t.label">{{ t.label }}: <strong>{{ Number(t.value || 0).toFixed(2) }}</strong></span>
            </div>
          </template>
        </DataTable>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button       from 'primevue/button'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import DatePicker   from 'primevue/datepicker'
import InputText    from 'primevue/inputtext'
import Message      from 'primevue/message'
import { posReportsApi } from '@/services/pos.js'
import { useAuthStore }  from '@/stores/auth.js'
import { jsPDF }         from 'jspdf'
import 'jspdf-autotable'

const auth   = useAuthStore()
const isMgr  = computed(() => ['admin', 'shop-admin'].includes(auth.user?.role))

const today      = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const dateFrom   = ref(monthStart)
const dateTo     = ref(today)
const itemNo     = ref('')
const tab        = ref('stockPosition')
const rows       = ref([])
const loading    = ref(false)
const exporting  = ref(false)
const error      = ref('')

const reports = computed(() => {
  const list = [
    { key: 'stockPosition',  icon: 'pi pi-box',          label: 'Stock position',  desc: 'Opening + entry-type movements + closing' },
    { key: 'salesByItem',    icon: 'pi pi-shopping-bag', label: 'Sales by item',   desc: 'POS + manual sales unioned, by item' },
    { key: 'salesByContact', icon: 'pi pi-user',         label: 'Sales by contact', desc: 'POS-paid orders grouped by contact' },
    { key: 'cashMovement',   icon: 'pi pi-money-bill',   label: 'Cash movement',    desc: 'Till sessions: opening, sales, in/out, expected vs declared' },
  ]
  if (isMgr.value) list.push({ key: 'shopComparison', icon: 'pi pi-th-large', label: 'Shop comparison', desc: 'All-shops sales totals' })
  return list
})

const columns = computed(() => {
  switch (tab.value) {
    case 'stockPosition':
      return [
        { field: 'itemNo',      header: 'Item No',      style: 'width:120px' },
        { field: 'description', header: 'Description',  style: 'min-width:180px' },
        { field: 'opening',     header: 'Opening',      style: 'width:100px;text-align:right', format: 'num' },
        { field: 'transferIn',  header: 'Transfer In',  style: 'width:110px;text-align:right', format: 'num' },
        { field: 'positiveAdj', header: '+ Adj',        style: 'width:90px;text-align:right',  format: 'num' },
        { field: 'portionIn',   header: 'Portion In',   style: 'width:100px;text-align:right', format: 'num' },
        { field: 'sales',       header: 'Sales',        style: 'width:100px;text-align:right', format: 'num' },
        { field: 'writeOff',    header: 'Write-off',    style: 'width:100px;text-align:right', format: 'num' },
        { field: 'portionOut',  header: 'Portion Out',  style: 'width:100px;text-align:right', format: 'num' },
        { field: 'negativeAdj', header: '− Adj',        style: 'width:90px;text-align:right',  format: 'num' },
        { field: 'closing',     header: 'Closing',      style: 'width:110px;text-align:right', format: 'numStrong' },
      ]
    case 'salesByItem':
      return [
        { field: 'itemNo',      header: 'Item No',     style: 'width:120px' },
        { field: 'description', header: 'Description', style: 'min-width:200px' },
        { field: 'qty',         header: 'Qty',         style: 'width:100px;text-align:right', format: 'num' },
        { field: 'value',       header: 'Value',       style: 'width:130px;text-align:right', format: 'numStrong' },
      ]
    case 'salesByContact':
      return [
        { field: 'contactNo',   header: 'Contact No',   style: 'width:130px' },
        { field: 'contactName', header: 'Contact Name', style: 'min-width:200px' },
        { field: 'orders',      header: 'Orders',       style: 'width:100px;text-align:right' },
        { field: 'value',       header: 'Value',        style: 'width:130px;text-align:right', format: 'numStrong' },
      ]
    case 'shopComparison':
      return [
        { field: 'shopCode', header: 'Shop',     style: 'width:120px' },
        { field: 'shopName', header: 'Name',     style: 'min-width:200px' },
        { field: 'orders',   header: 'Orders',   style: 'width:100px;text-align:right' },
        { field: 'value',    header: 'Value',    style: 'width:130px;text-align:right', format: 'numStrong' },
      ]
    case 'cashMovement':
      return [
        { field: 'sessionNo',       header: 'Session',     style: 'width:140px' },
        { field: 'shopCode',        header: 'Shop',        style: 'width:90px' },
        { field: 'cashierName',     header: 'Cashier',     style: 'min-width:140px' },
        { field: 'paymentTypeName', header: 'Tender',      style: 'width:120px' },
        { field: 'opening',         header: 'Opening',     style: 'width:100px;text-align:right', format: 'num' },
        { field: 'sales',           header: 'Sales',       style: 'width:110px;text-align:right', format: 'num' },
        { field: 'cashIn',          header: 'Cash in',     style: 'width:100px;text-align:right', format: 'num' },
        { field: 'cashOut',         header: 'Cash out',    style: 'width:100px;text-align:right', format: 'num' },
        { field: 'expected',        header: 'Expected',    style: 'width:120px;text-align:right', format: 'numStrong' },
        { field: 'declared',        header: 'Declared',    style: 'width:120px;text-align:right', format: 'num' },
        { field: 'variance',        header: 'Variance',    style: 'width:110px;text-align:right', format: 'num' },
      ]
  }
  return []
})

const totals = computed(() => {
  if (!rows.value.length) return []
  switch (tab.value) {
    case 'salesByItem':
    case 'salesByContact':
    case 'shopComparison':
      return [{ label: 'Total Value', value: rows.value.reduce((s, r) => s + Number(r.value || 0), 0) }]
    case 'stockPosition':
      return [
        { label: 'Total Sales', value: rows.value.reduce((s, r) => s + Number(r.sales || 0), 0) },
        { label: 'Total Closing', value: rows.value.reduce((s, r) => s + Number(r.closing || 0), 0) },
      ]
  }
  return []
})

// ── Top-10 bar chart (no chart lib) ───────────────────────────────────────
const chartW = 720, chartH = 220, padL = 30, padR = 16, padT = 24, padB = 36
const barW   = 36
const colors = ['#2563eb','#0f7173','#15803d','#9333ea','#ea580c','#0891b2','#65a30d','#b45309','#dc2626','#7c3aed']

const chartConfig = computed(() => {
  switch (tab.value) {
    case 'stockPosition':  return { title: 'Top items by closing stock', valueField: 'closing', labelField: 'description' }
    case 'salesByItem':    return { title: 'Top items by sales value',   valueField: 'value',   labelField: 'description' }
    case 'salesByContact': return { title: 'Top contacts by value',      valueField: 'value',   labelField: 'contactName' }
    case 'shopComparison': return { title: 'Sales value per shop',       valueField: 'value',   labelField: 'shopName' }
    case 'cashMovement':   return { title: 'Cash sales per session',     valueField: 'sales',   labelField: 'sessionNo' }
  }
  return null
})

const chartBars = computed(() => {
  if (!chartConfig.value) return []
  const top = rows.value.slice(0, 10)
  const max = Math.max(1, ...top.map(r => Number(r[chartConfig.value.valueField] || 0)))
  const innerH = chartH - padT - padB
  const span = chartW - padL - padR
  const step = top.length > 1 ? span / top.length : span / 1
  return top.map((r, i) => {
    const v   = Number(r[chartConfig.value.valueField] || 0)
    const h   = Math.max(1, (v / max) * innerH)
    const x   = padL + step * i + (step - barW) / 2
    const y   = padT + (innerH - h)
    const lbl = String(r[chartConfig.value.labelField] || '')
    return {
      x, y, h,
      color: colors[i % colors.length],
      label: lbl,
      shortLabel: lbl.length > 10 ? lbl.slice(0, 9) + '…' : lbl,
      valueLabel: v >= 1000 ? `${Math.round(v / 100) / 10}k` : v.toFixed(0),
    }
  })
})

function setTab(k) { tab.value = k; rows.value = [] }

function isoDate(d) {
  if (!d) return null; if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function commonParams() {
  const p = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value) }
  if (tab.value === 'stockPosition' && itemNo.value.trim()) p.itemNo = itemNo.value.trim().toUpperCase()
  return p
}

async function run() {
  loading.value = true; error.value = ''; rows.value = []
  try {
    const fn = {
      stockPosition:  posReportsApi.stockPosition,
      salesByItem:    posReportsApi.salesByItem,
      salesByContact: posReportsApi.salesByContact,
      shopComparison: posReportsApi.shopComparison,
      cashMovement:   posReportsApi.cashMovement,
    }[tab.value]
    const { data } = await fn(commonParams())
    // cashMovement returns { rows, sessions, totals } — others return arrays directly
    rows.value = Array.isArray(data) ? data : (data?.rows || [])
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally { loading.value = false }
}

async function downloadCsv() {
  exporting.value = true
  try {
    const slug = { stockPosition: 'stock-position', salesByItem: 'sales-by-item',
                   salesByContact: 'sales-by-contact', shopComparison: 'shop-comparison',
                   cashMovement: 'cash-movement' }[tab.value]
    const res = await posReportsApi.csv(slug, commonParams())
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${slug}-${commonParams().dateFrom}_${commonParams().dateTo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally { exporting.value = false }
}

function downloadPdf() {
  if (!rows.value.length) return
  const pdf = new jsPDF('l', 'mm', 'a4')
  const slug = { stockPosition: 'Stock Position', salesByItem: 'Sales by Item',
                 salesByContact: 'Sales by Contact', shopComparison: 'Shop Comparison',
                 cashMovement: 'Cash Movement' }[tab.value]
  pdf.setFontSize(14); pdf.text(slug, 14, 14)
  pdf.setFontSize(10); pdf.text(`Period: ${commonParams().dateFrom} → ${commonParams().dateTo}`, 14, 21)
  const head = [columns.value.map(c => c.header)]
  const body = rows.value.map(r => columns.value.map(c =>
    c.format === 'num' || c.format === 'numStrong' ? Number(r[c.field] || 0).toFixed(2) : (r[c.field] ?? '')
  ))
  pdf.autoTable({ head, body, startY: 26, styles: { fontSize: 8 }, headStyles: { fillColor: [15, 113, 115] } })
  pdf.save(`${slug.toLowerCase().replace(/\s+/g, '-')}-${commonParams().dateFrom}_${commonParams().dateTo}.pdf`)
}

onMounted(run)
</script>

<style scoped>
.reports-page { padding: 16px 20px; background:#f4f6f8; color:#111827; color-scheme:light; min-height: calc(100vh - 56px); }
.page-header  { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title   { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted   { color:#6b7280; }
.text-sm      { font-size:13px; }
.mb-3         { margin-bottom:12px; }

.reports-layout { display:grid; grid-template-columns: 240px 1fr; gap:16px; }
@media (max-width: 720px) { .reports-layout { grid-template-columns: 1fr; } }

.reports-side { display:flex; flex-direction:column; gap:6px; }
.report-tab {
  display:flex; gap:10px; padding:10px 12px; border-radius:8px;
  background:#fff; border:1px solid #e5e7eb; cursor:pointer; transition: background 0.15s;
}
.report-tab .pi { font-size:18px; color:#0f7173; }
.report-tab:hover { background:#eef2ff; }
.report-tab.active { background:#0f7173; color:#fff; border-color:#0f7173; }
.report-tab.active .pi, .report-tab.active .report-desc { color:#fff; }
.report-name { font-weight:600; font-size:13px; }
.report-desc { font-size:11px; color:#6b7280; }

.reports-main { display:flex; flex-direction:column; gap:12px; min-width:0; }
.filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }

.chart-card { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:8px 12px; }
.chart-title { font-weight:600; font-size:13px; margin-bottom:4px; color:#111827; }
.chart-svg { width:100%; max-height:240px; }

.totals-row { display:flex; gap:18px; padding:8px 12px; font-size:13px; flex-wrap:wrap; background:#f3f4f6; }

.reports-page :deep(.p-inputtext),
.reports-page :deep(.p-datepicker-input) {
  background:#fff !important; color:#111827 !important; border-color:#d1d5db !important; color-scheme: light;
}
.reports-page :deep(.p-datatable-thead > tr > th) { background:#f3f4f6 !important; color:#111827 !important; }
.reports-page :deep(.p-datatable-tbody > tr > td) { background:#fff !important; color:#111827 !important; }
</style>
