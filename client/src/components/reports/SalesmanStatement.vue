<template>
  <div class="statement">
    <!-- Controls -->
    <div class="stmt-controls">
      <div class="ctl">
        <label>Salesperson</label>
        <Select v-model="salespersonKey" :options="salespersonGroups" option-label="label" option-value="value"
                filter placeholder="Select salesperson…" class="ctl-input" />
      </div>
      <div class="ctl">
        <label>Posting groups</label>
        <MultiSelect v-model="postingGroups" :options="postingGroupOptions" option-label="label" option-value="value"
                     filter display="chip" :maxSelectedLabels="3" placeholder="All posting groups"
                     class="ctl-input" @change="postingGroupsTouched = true" />
      </div>
      <div class="ctl">
        <label>As at date</label>
        <DatePicker v-model="asOfDate" date-format="yy-mm-dd" show-icon class="ctl-input" />
      </div>
      <Button label="Run" icon="pi pi-play" :loading="loading" :disabled="!salespersonKey || !asOfDate" @click="run" />
      <div class="ctl-spacer" />
      <Button label="Excel" icon="pi pi-file-excel" severity="secondary" size="small"
              :disabled="!data.customers.length" @click="exportExcel" />
      <Button label="PDF" icon="pi pi-file-pdf" severity="secondary" size="small"
              :disabled="!data.customers.length" @click="exportPdf" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <div v-if="loading" class="skeleton-wrap">
      <Skeleton height="2rem" class="mb" v-for="n in 6" :key="n" />
    </div>

    <div v-else-if="!hasRun" class="empty-state">
      <i class="pi pi-file" style="font-size:3rem;opacity:.25" />
      <p>Pick a salesperson and date, then click <strong>Run</strong></p>
    </div>

    <div v-else-if="!data.customers.length" class="empty-state">
      <i class="pi pi-check-circle" style="font-size:3rem;opacity:.25" />
      <p>No outstanding balances for <strong>{{ data.meta.salespersonName }}</strong> as at {{ toDateStr(asOfDate) }}.</p>
    </div>

    <div v-else class="stmt-body">
      <!-- Statement header -->
      <div class="stmt-head">
        <div>
          <div class="stmt-title">Salesman Statement</div>
          <div class="stmt-sub">
            <strong>{{ data.meta.salespersonName }}</strong>
            <span class="muted"> ({{ (data.meta.salespersonCodes || []).join(', ') || data.meta.salespersonCode }})</span>
            · Outstanding balances as at <strong>{{ toDateStr(asOfDate) }}</strong>
          </div>
        </div>
        <div class="stmt-grand">
          <div class="grand-line"><span class="muted">Debits</span><span class="dr">{{ fmt(data.meta.invoiceTotal) }}</span></div>
          <div class="grand-line"><span class="muted">Credits</span><span class="cr">{{ fmt(data.meta.creditTotal) }}</span></div>
          <div class="grand-line total"><span class="muted">Net outstanding</span><span class="grand-val">{{ fmt(data.meta.grandTotal) }}</span></div>
        </div>
      </div>

      <!-- Period split: outstanding by posting date (before vs on the as-of date), per company -->
      <div v-if="data.meta.periodSplit?.length" class="period-wrap">
        <table class="period-table">
          <thead>
            <tr>
              <th rowspan="2">Company</th>
              <th colspan="2" class="grp">Sales (debits)</th>
              <th colspan="2" class="grp">Credits</th>
            </tr>
            <tr>
              <th class="num">Before {{ toDateStr(asOfDate) }}</th>
              <th class="num">On {{ toDateStr(asOfDate) }}</th>
              <th class="num">Before {{ toDateStr(asOfDate) }}</th>
              <th class="num">On {{ toDateStr(asOfDate) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in data.meta.periodSplit" :key="r.company">
              <td class="co">{{ r.company }}</td>
              <td class="num">{{ fmt(r.salesBefore) }}</td>
              <td class="num">{{ fmt(r.salesDay) }}</td>
              <td class="num cr">{{ fmt(r.creditsBefore) }}</td>
              <td class="num cr">{{ fmt(r.creditsDay) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="data.meta.periodTotal">
            <tr>
              <td>Total</td>
              <td class="num">{{ fmt(data.meta.periodTotal.salesBefore) }}</td>
              <td class="num">{{ fmt(data.meta.periodTotal.salesDay) }}</td>
              <td class="num cr">{{ fmt(data.meta.periodTotal.creditsBefore) }}</td>
              <td class="num cr">{{ fmt(data.meta.periodTotal.creditsDay) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Expand / collapse controls -->
      <div class="stmt-toolbar">
        <span class="muted">{{ data.customers.length }} customer{{ data.customers.length === 1 ? '' : 's' }}</span>
        <div class="ctl-spacer" />
        <Button label="Expand all" icon="pi pi-angle-double-down" text size="small" @click="expandAll" />
        <Button label="Collapse all" icon="pi pi-angle-double-up" text size="small" @click="collapseAll" />
      </div>

      <!-- Per-customer accordion -->
      <div class="cust-list">
        <div v-for="cust in data.customers" :key="keyOf(cust)" class="cust-block">
          <button
            type="button"
            class="cust-head"
            :aria-expanded="isExpanded(cust)"
            @click="toggle(cust)"
          >
            <i class="pi pi-chevron-right cust-chevron" :class="{ open: isExpanded(cust) }" />
            <span class="cust-name">{{ cust.customerName }}</span>
            <span v-if="cust.companies.length > 1" class="cust-multi">{{ cust.companies.length }} cos</span>
            <span class="cust-bal" :class="{ credit: cust.balance < 0 }">{{ fmt(cust.balance) }}</span>
          </button>

          <div v-show="isExpanded(cust)" class="cust-body">
            <div class="cust-subhead">
              <span>{{ custRef(cust) }}</span>
              <span class="dot">·</span>
              <span>{{ cust.invoices.length + cust.credits.length }} line{{ (cust.invoices.length + cust.credits.length) === 1 ? '' : 's' }}</span>
            </div>
            <!-- Per-company outstanding columns (only when the customer spans companies) -->
            <div v-if="cust.byCompany.length > 1" class="table-scroll by-company">
              <table class="stmt-table matrix">
                <thead>
                  <tr>
                    <th v-for="bc in cust.byCompany" :key="bc.company" class="num">{{ bc.company }}<span class="cust-no"> · {{ bc.customerNo }}</span></th>
                    <th class="num total-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td v-for="bc in cust.byCompany" :key="bc.company" class="num" :class="{ credit: bc.balance < 0 }">{{ fmt(bc.balance) }}</td>
                    <td class="num total-col" :class="{ credit: cust.balance < 0 }">{{ fmt(cust.balance) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="table-scroll detail-scroll">
              <table class="stmt-table">
                <thead>
                  <tr>
                    <th>Company</th><th>Sell-to</th><th>Ship-to</th><th>Date</th><th>Type</th><th>Document</th><th>Due</th>
                    <th class="num">Original</th><th class="num">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Outstanding invoices (debits) -->
                  <tr v-for="e in cust.invoices" :key="e.company + e.entryNo">
                    <td>{{ e.company }}</td>
                    <td>{{ e.sellToCustomerNo || '—' }}</td>
                    <td class="ship-to">{{ e.shipToName || '—' }}<span v-if="e.shipToAddress" class="ext"> · {{ e.shipToAddress }}</span></td>
                    <td>{{ e.postingDate }}</td>
                    <td>{{ e.documentType }}</td>
                    <td>{{ e.documentNo }}<span v-if="e.externalDocNo" class="ext"> · {{ e.externalDocNo }}</span></td>
                    <td :class="{ overdue: isOverdue(e.dueDate) }">{{ e.dueDate || '—' }}</td>
                    <td class="num">{{ fmt(e.originalAmount) }}</td>
                    <td class="num">{{ fmt(e.remaining) }}</td>
                  </tr>
                  <!-- Unallocated credits (bottom) -->
                  <template v-if="cust.credits.length">
                    <tr class="credit-sep"><td colspan="9">Unallocated credits</td></tr>
                    <tr v-for="e in cust.credits" :key="e.company + e.entryNo" class="credit-row">
                      <td>{{ e.company }}</td>
                      <td>{{ e.sellToCustomerNo || '—' }}</td>
                      <td class="ship-to">{{ e.shipToName || '—' }}<span v-if="e.shipToAddress" class="ext"> · {{ e.shipToAddress }}</span></td>
                      <td>{{ e.postingDate }}</td>
                      <td>{{ e.documentType }}</td>
                      <td>{{ e.documentNo }}<span v-if="e.externalDocNo" class="ext"> · {{ e.externalDocNo }}</span></td>
                      <td>{{ e.dueDate || '—' }}</td>
                      <td class="num">{{ fmt(e.originalAmount) }}</td>
                      <td class="num">{{ fmt(e.remaining) }}</td>
                    </tr>
                  </template>
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="8" class="num">Customer balance as at {{ toDateStr(asOfDate) }}</td>
                    <td class="num" :class="{ credit: cust.balance < 0 }">{{ fmt(cust.balance) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Grand total -->
      <div class="stmt-total-row">
        <span>Salesperson total ({{ data.meta.customerCount }} customer{{ data.meta.customerCount === 1 ? '' : 's' }})</span>
        <span class="grand-val">{{ fmt(data.meta.grandTotal) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { bcReportsApi } from '@/services/bcReports.js'
import * as XLSX from 'xlsx'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'

const props = defineProps({
  companies:          { type: Array, default: () => [] },
  salespersonOptions: { type: Array, default: () => [] },
})

function defaultDate() {
  const d = new Date()
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  return d
}

const salespersonKey = ref(null)
const asOfDate = ref(defaultDate())

// Customer Posting Group filter (e.g. CASH SALE, BCASHSALE, SHOP). Empty = all.
const postingGroups = ref([])
const postingGroupOptions = ref([])
const postingGroupsTouched = ref(false) // once the user edits, stop auto-defaulting
async function loadPostingGroups() {
  try {
    const { data } = await bcReportsApi.customerPostingGroups(props.companies)
    postingGroupOptions.value = data || []
    // Default-select any Cash / Shop posting group (e.g. CASH SALE, BCASHSALE, SHOP).
    if (!postingGroupsTouched.value) {
      postingGroups.value = postingGroupOptions.value
        .map(o => o.value)
        .filter(v => /cash|shop/i.test(v))
    }
  } catch { /* non-fatal: filter just stays empty */ }
}
onMounted(loadPostingGroups)
watch(() => props.companies, loadPostingGroups, { deep: true })

// Group salesperson options by NAME so one name spanning several company codes
// is a single selection that queries all of them.
const salespersonGroups = computed(() => {
  const map = new Map()
  for (const o of props.salespersonOptions) {
    const name = (o.name || '').trim()
    const key = name || o.code || o.value
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, { value: key, label: name || o.code || o.value, name: name || o.code || o.value, codes: [] })
    }
    const code = o.code || o.value
    if (code && !map.get(key).codes.includes(code)) map.get(key).codes.push(code)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
})
const loading = ref(false)
const hasRun = ref(false)
const error = ref(null)
const data = ref({ customers: [], meta: {} })

// Accordion expand/collapse state, keyed per customer.
const expanded = ref({})
const keyOf = (c) => c.key || `${c.customerName}::${c.customerNo}`
const isExpanded = (c) => !!expanded.value[keyOf(c)]
function toggle(c) {
  const k = keyOf(c)
  expanded.value = { ...expanded.value, [k]: !expanded.value[k] }
}
function expandAll() {
  const o = {}
  for (const c of data.value.customers) o[keyOf(c)] = true
  expanded.value = o
}
function collapseAll() { expanded.value = {} }

// "FCL:12345 · CM:678" for multi-company, or "12345 · FCL" for single.
function custRef(c) {
  const bc = c.byCompany || []
  if (bc.length === 1) return `${bc[0].customerNo} · ${bc[0].company}`
  return bc.map(x => `${x.company}:${x.customerNo}`).join(' · ')
}

function toDateStr(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmt(n) {
  return Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function isOverdue(due) {
  if (!due) return false
  return new Date(due) < new Date(toDateStr(asOfDate.value))
}

async function run() {
  if (!salespersonKey.value || !asOfDate.value) return
  const group = salespersonGroups.value.find(g => g.value === salespersonKey.value)
  if (!group) return
  loading.value = true
  error.value = null
  try {
    const { data: res } = await bcReportsApi.salesmanStatement({
      salespersonCodes: group.codes,
      salespersonName:  group.name,
      postingGroups:    postingGroups.value,
      asOfDate:         toDateStr(asOfDate.value),
      companies:        props.companies,
    })
    data.value = { customers: res.customers || [], meta: res.meta || {} }
    expanded.value = {} // start collapsed
    hasRun.value = true
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}

function exportExcel() {
  const rows = []
  for (const c of data.value.customers) {
    const push = (e, kind) => rows.push({
      Customer: c.customerName, Company: e.company, 'Bill-to No': e.customerNo,
      'Sell-to No': e.sellToCustomerNo, 'Ship-to': e.shipToName, 'Ship-to Address': e.shipToAddress,
      Section: kind, Date: e.postingDate, Type: e.documentType,
      Document: e.documentNo, 'External Doc': e.externalDocNo, 'Due Date': e.dueDate,
      Original: e.originalAmount, Outstanding: e.remaining,
    })
    c.invoices.forEach(e => push(e, 'Invoice'))
    c.credits.forEach(e => push(e, 'Unallocated Credit'))
    // Per-company balance columns, then the combined customer total.
    for (const bc of c.byCompany) {
      rows.push({
        Customer: c.customerName, Company: bc.company, 'Customer No': bc.customerNo,
        Section: 'Company Balance', Outstanding: bc.balance,
      })
    }
    rows.push({ Customer: c.customerName, Section: 'Customer Total', Outstanding: c.balance })
  }
  const meta = data.value.meta
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Statement')
  const summary = XLSX.utils.json_to_sheet([
    { Field: 'Salesperson', Value: `${meta.salespersonName} (${(meta.salespersonCodes || []).join(', ') || meta.salespersonCode})` },
    { Field: 'As at', Value: toDateStr(asOfDate.value) },
    { Field: 'Companies', Value: (meta.companies || []).join(', ') },
    { Field: 'Outstanding invoices', Value: meta.invoiceTotal },
    { Field: 'Unallocated credits', Value: meta.creditTotal },
    { Field: 'Total outstanding', Value: meta.grandTotal },
  ])
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')
  XLSX.writeFile(wb, `salesman-statement-${meta.salespersonCode}-${toDateStr(asOfDate.value)}.xlsx`)
}

function exportPdf() {
  const meta = data.value.meta
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const money = (n) => fmt(n)
  let body = ''
  for (const c of data.value.customers) {
    const shipTo = (e) => [e.shipToName, e.shipToAddress].filter(Boolean).join(' · ') || '—'
    const row = (e, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${esc(e.company)}</td><td>${esc(e.sellToCustomerNo || '—')}</td><td>${esc(shipTo(e))}</td><td>${esc(e.postingDate)}</td><td>${esc(e.documentType)}</td><td>${esc(e.documentNo)}${e.externalDocNo ? ' · ' + esc(e.externalDocNo) : ''}</td><td>${esc(e.dueDate || '—')}</td><td class="n">${money(e.originalAmount)}</td><td class="n">${money(e.remaining)}</td></tr>`
    let lines = ''
    for (const e of c.invoices) lines += row(e)
    if (c.credits.length) {
      lines += `<tr class="sep"><td colspan="9">Unallocated credits</td></tr>`
      for (const e of c.credits) lines += row(e, 'cr')
    }
    // Per-company balance columns (only when the customer spans companies).
    let matrix = ''
    if (c.byCompany.length > 1) {
      matrix = `<table class="mx"><thead><tr>${c.byCompany.map(bc => `<th class="n">${esc(bc.company)} · ${esc(bc.customerNo)}</th>`).join('')}<th class="n">Total</th></tr></thead>`
        + `<tbody><tr>${c.byCompany.map(bc => `<td class="n">${money(bc.balance)}</td>`).join('')}<td class="n">${money(c.balance)}</td></tr></tbody></table>`
    }
    body += `
      <div class="cust">
        <div class="ch"><span>${esc(c.customerName)} <small>${esc(custRef(c))}</small></span><span class="n">${money(c.balance)}</span></div>
        ${matrix}
        <table><thead><tr><th>Company</th><th>Sell-to</th><th>Ship-to</th><th>Date</th><th>Type</th><th>Document</th><th>Due</th><th class="n">Original</th><th class="n">Outstanding</th></tr></thead>
        <tbody>${lines}</tbody>
        <tfoot><tr><td colspan="8" class="n">Customer balance as at ${esc(toDateStr(asOfDate.value))}</td><td class="n">${money(c.balance)}</td></tr></tfoot></table>
      </div>`
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Salesman Statement — ${esc(meta.salespersonName)}</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;color:#1f2937;margin:24px;font-size:12px;}
      h1{font-size:18px;margin:0 0 2px;}
      .sub{color:#475467;margin-bottom:16px;}
      .grand{font-weight:800;font-size:15px;}
      .cust{margin-bottom:18px;break-inside:avoid;}
      .ch{display:flex;justify-content:space-between;font-weight:700;background:#eef2f7;padding:6px 10px;border-radius:6px 6px 0 0;}
      .ch small{font-weight:400;color:#667085;}
      .mx{width:auto;margin:6px 0;border:1px solid #dfe4ec;}
      .mx th{background:#eef2f7;} .mx td,.mx th{padding:4px 12px;}
      table{width:100%;border-collapse:collapse;}
      th,td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;}
      th{background:#f8fafc;font-size:11px;text-transform:uppercase;color:#475467;}
      .n{text-align:right;}
      tfoot td{font-weight:700;background:#f8fafc;}
      .sep td{background:#fff7ed;font-weight:600;color:#9a3412;}
      .cr td{color:#b45309;}
      .total{display:flex;justify-content:space-between;font-weight:800;font-size:14px;border-top:2px solid #1f2937;padding-top:8px;margin-top:8px;}
      @media print{body{margin:12mm;}}
    </style></head><body>
    <h1>Salesman Statement</h1>
    <div class="sub"><strong>${esc(meta.salespersonName)}</strong> (${esc((meta.salespersonCodes || []).join(', ') || meta.salespersonCode)}) · Outstanding balances as at <strong>${esc(toDateStr(asOfDate.value))}</strong> · ${esc((meta.companies || []).join(', '))}</div>
    ${body}
    <div class="total"><span>Salesperson total (${meta.customerCount} customers)</span><span>${money(meta.grandTotal)}</span></div>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`
  const w = window.open('', '_blank')
  if (!w) { error.value = 'Pop-up blocked — allow pop-ups to export the PDF.'; return }
  w.document.write(html)
  w.document.close()
}

defineExpose({ run })
</script>

<style scoped>
.statement { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }
.stmt-controls {
  display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;
  padding: 12px 14px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px;
}
.ctl { display: flex; flex-direction: column; gap: 4px; }
.ctl label { font-size: 12px; font-weight: 600; color: #475467; }
.ctl-input { min-width: 220px; }
.ctl-spacer { flex: 1; }

.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #6b7280; padding: 48px 0; }
.skeleton-wrap { display: flex; flex-direction: column; gap: 8px; }
.mb { margin-bottom: 4px; }

.stmt-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding: 12px 16px; background: #eef2f7; border: 1px solid #dfe4ec; border-radius: 10px;
}
.stmt-title { font-size: 18px; font-weight: 800; color: #1f2937; }
.stmt-sub { font-size: 13px; color: #475467; margin-top: 2px; }
.stmt-sub .muted { color: #98a2b3; }
.stmt-grand { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.stmt-grand .muted { font-size: 11px; color: #667085; text-transform: uppercase; }
.grand-line { display: flex; align-items: baseline; gap: 10px; justify-content: flex-end; }
.grand-line span:last-child { min-width: 110px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
.grand-line .dr { color: #1f2937; }
.grand-line .cr { color: #15803d; }
.grand-line.total { margin-top: 2px; border-top: 1.5px solid #d3dae6; padding-top: 3px; }
.grand-val { font-size: 20px; font-weight: 900; color: #1e40af; }

/* Period split table */
.period-wrap { overflow-x: auto; }
.period-table { border-collapse: collapse; font-size: 13px; min-width: 560px; }
.period-table th, .period-table td { padding: 6px 12px; border-bottom: 1px solid #f0f2f5; text-align: left; }
.period-table thead th { background: #f8fafc; font-size: 11px; color: #475467; font-weight: 700; }
.period-table th.grp { text-align: center; border-left: 1px solid #e5e7eb; }
.period-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.period-table .co { font-weight: 600; }
.period-table .cr { color: #15803d; }
.period-table tfoot td { font-weight: 800; background: #f8fafc; border-top: 1.5px solid #d3dae6; }

/* Toolbar + scrollable accordion list */
.stmt-toolbar { display: flex; align-items: center; gap: 4px; }
.stmt-toolbar .muted { font-size: 12px; color: #667085; }
.cust-list {
  display: flex; flex-direction: column; gap: 10px;
  max-height: calc(100vh - 340px); overflow-y: auto;
  padding-right: 2px;
}

.cust-block { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.cust-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  min-height: 46px; padding: 13px 14px; background: #eef2f7; border: none; border-bottom: 1px solid #dfe4ec;
  cursor: pointer; text-align: left; font: inherit;
}
.cust-head:hover { background: #e6ecf5; }
.cust-head:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
.cust-chevron { color: #667085; font-size: 12px; transition: transform .15s ease; }
.cust-chevron.open { transform: rotate(90deg); }
.cust-name { flex: 1 1 auto; min-width: 0; font-weight: 700; font-size: 15px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cust-meta { font-size: 12px; color: #667085; }
.cust-multi { flex: 0 0 auto; font-size: 11px; font-weight: 600; color: #1e40af; background: #e0e7ff; padding: 1px 7px; border-radius: 999px; }
.cust-count { font-size: 11px; color: #98a2b3; }
.cust-bal { margin-left: auto; flex: 0 0 auto; font-weight: 800; font-size: 15px; color: #111827; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cust-bal.credit { color: #15803d; }
.cust-subhead { display: flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; color: #667085; background: #fafbfc; border-bottom: 1px solid #f0f2f5; }
.cust-subhead .dot { opacity: .5; }

/* Horizontal scrollbar for the table on narrow viewports */
.cust-body { border-top: 1px solid #f0f2f5; }
.table-scroll { overflow-x: auto; }
.table-scroll .stmt-table { min-width: 560px; }
/* Expanded invoice list gets its own capped, scrollable area with a sticky header */
.detail-scroll { max-height: 48vh; overflow: auto; }
.detail-scroll thead th { position: sticky; top: 0; z-index: 1; }

/* Per-company outstanding matrix */
.by-company { padding: 8px 12px 0; }
.stmt-table.matrix { width: auto; min-width: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.stmt-table.matrix th, .stmt-table.matrix td { white-space: nowrap; }
.stmt-table.matrix .total-col { border-left: 2px solid #d3dae6; font-weight: 800; }
.cust-no { color: #98a2b3; font-weight: 400; }

.stmt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stmt-table th, .stmt-table td { padding: 6px 12px; border-bottom: 1px solid #f0f2f5; text-align: left; }
.stmt-table th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #475467; font-weight: 700; }
.stmt-table td.num, .stmt-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.stmt-table tfoot td { font-weight: 700; background: #f8fafc; border-top: 1.5px solid #d3dae6; }
.stmt-table td.credit, .cust-bal.credit { color: #15803d; }
.ext { color: #98a2b3; font-size: 11px; }
.stmt-table td.ship-to { max-width: 280px; white-space: normal; line-height: 1.3; }
.overdue { color: #b91c1c; font-weight: 600; }
.credit-sep td { background: #fff7ed; color: #9a3412; font-weight: 600; font-size: 12px; }
.credit-row td { color: #b45309; }

.stmt-total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; background: #1f2937; color: #fff; border-radius: 10px;
}
.stmt-total-row .grand-val { color: #93c5fd; }

/* ── Dark mode (the app runs a dark shell; keep the statement readable, not a bright strip) ── */
@media (prefers-color-scheme: dark) {
  .stmt-controls { background: #1a2231; border-color: #2c3a4f; }
  .ctl label { color: #cbd5e1; }
  .empty-state { color: #94a3b8; }

  .stmt-head { background: #1a2231; border-color: #2c3a4f; }
  .stmt-title { color: #f1f5f9; }
  .stmt-sub { color: #cbd5e1; }
  .stmt-sub .muted, .stmt-toolbar .muted { color: #94a3b8; }
  .grand-val { color: #93c5fd; }
  .grand-line .dr { color: #f1f5f9; }
  .grand-line .cr { color: #4ade80; }
  .grand-line.total { border-top-color: #2c3a4f; }
  .period-table thead th { background: #1f2937; color: #cbd5e1; }
  .period-table td { color: #e5e7eb; border-bottom-color: #212b3a; }
  .period-table th.grp { border-left-color: #2c3a4f; }
  .period-table .cr { color: #4ade80; }
  .period-table tfoot td { background: #1f2937; border-top-color: #2c3a4f; }

  .cust-block { border-color: #2c3a4f; background: #131a26; }
  .cust-head { background: #1f2937; border-bottom-color: #2c3a4f; }
  .cust-head:hover { background: #273244; }
  .cust-head:focus-visible { outline-color: #60a5fa; }
  .cust-chevron { color: #94a3b8; }
  .cust-name { color: #f1f5f9; }
  .cust-bal { color: #f1f5f9; }
  .cust-bal.credit, .stmt-table td.credit { color: #4ade80; }
  .cust-multi { color: #bfdbfe; background: #1e3a8a; }
  .cust-subhead { background: #161f2b; color: #94a3b8; border-bottom-color: #2c3a4f; }

  .cust-body { border-top-color: #2c3a4f; background: #131a26; }
  .stmt-table th { background: #1f2937; color: #cbd5e1; }
  .stmt-table td { color: #e5e7eb; border-bottom-color: #212b3a; }
  .stmt-table tfoot td { background: #1f2937; border-top-color: #2c3a4f; }
  .stmt-table.matrix { border-color: #2c3a4f; }
  .stmt-table.matrix .total-col { border-left-color: #3b4a63; }
  .cust-no, .ext { color: #64748b; }
  .overdue { color: #f87171; }
  .credit-sep td { background: #3b2f1e; color: #fbbf24; }
  .credit-row td { color: #fbbf24; }
}
</style>
