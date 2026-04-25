<template>
  <div class="fin-layout">
    <!-- Filter sidebar -->
    <aside class="fin-slicer" :class="{ 'closed': !filtersOpen }">
      <div class="fin-slicer-header">
        <i class="pi pi-money-bill" />
        <span>Finance Filters</span>
        <Button icon="pi pi-times" text rounded size="small" @click="filtersOpen = false" style="margin-left:auto" />
      </div>

      <!-- GL / Aging report filters (all tabs except mgmt) -->
      <template v-if="!isMgmt">
        <details class="filter-box" open>
          <summary>Scope</summary>
          <div class="filter-body">
            <label class="slicer-label">Companies</label>
            <div v-for="c in ALL_COMPANIES" :key="c" class="slicer-check">
              <Checkbox :model-value="companies.includes(c)" :input-id="`co-${c}`" binary @update:model-value="toggleCompany(c, $event)" />
              <label :for="`co-${c}`">{{ c }}</label>
            </div>
          </div>
        </details>
        <details v-if="!isAging" class="filter-box" open>
          <summary>Period</summary>
          <div class="filter-body">
            <label class="slicer-label">Period From</label>
            <DatePicker v-model="dateFrom" date-format="yy-mm-dd" show-icon fluid />
            <label class="slicer-label" style="margin-top:8px">Period To</label>
            <DatePicker v-model="dateTo" date-format="yy-mm-dd" show-icon fluid />
            <label class="slicer-label" style="margin-top:8px">YTD From <span class="hint">(P&amp;L only)</span></label>
            <DatePicker v-model="ytdFrom" date-format="yy-mm-dd" show-icon fluid />
          </div>
        </details>
        <details v-if="isAging" class="filter-box" open>
          <summary>As-of Date</summary>
          <div class="filter-body">
            <label class="slicer-label">Balance as of</label>
            <DatePicker v-model="agingAsOfDate" date-format="yy-mm-dd" show-icon fluid />
          </div>
        </details>
      </template>

      <!-- Management Accounts filters -->
      <template v-if="isMgmt">
        <details class="filter-box" open>
          <summary>Template</summary>
          <div class="filter-body">
            <label class="slicer-label">Report Template</label>
            <Select v-model="mgmtTemplateId" :options="mgmtTemplates" option-label="TemplateName" option-value="TemplateId" placeholder="Select template…" fluid />
          </div>
        </details>
        <details class="filter-box" open>
          <summary>Reporting Period</summary>
          <div class="filter-body">
            <div class="period-presets">
              <button v-for="p in periodPresets" :key="p.label" class="preset-btn" @click="applyPreset(p)">{{ p.label }}</button>
            </div>
            <label class="slicer-label" style="margin-top:10px">From</label>
            <DatePicker v-model="mgmtDateFrom" date-format="yy-mm-dd" show-icon fluid />
            <label class="slicer-label" style="margin-top:8px">To</label>
            <DatePicker v-model="mgmtDateTo" date-format="yy-mm-dd" show-icon fluid />
          </div>
        </details>
        <details class="filter-box" open>
          <summary>Dimensions</summary>
          <div class="filter-body">
            <label class="slicer-label">Department (Dim 1)</label>
            <MultiSelect v-model="mgmtDim1Codes"
              :options="dim1Options" option-label="Name" option-value="Code"
              placeholder="All departments" display="chip" filter fluid
              :loading="dimLoading" />
            <label class="slicer-label" style="margin-top:8px">Project (Dim 2)</label>
            <MultiSelect v-model="mgmtDim2Codes"
              :options="dim2Options" option-label="Name" option-value="Code"
              placeholder="All projects" display="chip" filter fluid
              :loading="dimLoading" />
          </div>
        </details>
      </template>

      <Button label="Run Report" icon="pi pi-play" class="run-btn" :loading="loading" @click="isMgmt ? runMgmt() : isAging ? runAging() : run()" />
      <Button label="Refresh" icon="pi pi-refresh" severity="secondary" class="run-btn" :loading="loading" @click="forceRefresh" />
    </aside>

    <div class="fin-main">
      <!-- Tab bar -->
      <div class="tab-bar">
        <button class="filter-toggle-btn" @click="filtersOpen = !filtersOpen">
          <i class="pi pi-sliders-h" />
          <span class="filter-toggle-label">{{ filtersOpen ? 'Hide' : 'Filters' }}</span>
        </button>
        <button v-for="tab in TABS" :key="tab.value" class="tab-btn" :class="{ active: reportType === tab.value }" @click="switchTab(tab.value)">
          <i :class="tab.icon" /><span class="tab-label"> {{ tab.label }}</span>
        </button>
      </div>

      <!-- Toolbar -->
      <div class="toolbar" v-if="loading || rows.length || mgmtResult.lines.length || agingRows.length">
        <div v-if="periodLabel" class="period-pill">{{ periodLabel }}</div>
        <div class="toolbar-actions">
          <Button icon="pi pi-refresh" text size="small" @click="forceRefresh" />
          <Button icon="pi pi-download" text size="small" :disabled="!rows.length && !mgmtResult.lines.length" @click="exportExcel" />
        </div>
      </div>

      <!-- Status messages -->
      <Message v-if="error" severity="error" :closable="false" class="mx">{{ error }}</Message>
      <div v-if="!loading && !error && !rows.length && !mgmtResult.lines.length && !agingRows.length" class="empty-state">
        <i class="pi pi-file-check" style="font-size:3rem;opacity:.25" />
        <p>Select filters and click <strong>Run Report</strong></p>
      </div>
      <div v-if="loading" class="skeleton-wrap">
        <Skeleton height="2rem" class="mb" v-for="n in 10" :key="n" />
      </div>

      <!-- ── Trial Balance ── -->
      <div v-if="!loading && isTB && rows.length" class="report-wrap">
        <div class="tb-balance-check" :class="tbIsBalanced ? 'balanced' : 'unbalanced'">
          <i :class="tbIsBalanced ? 'pi pi-check-circle' : 'pi pi-times-circle'" />
          {{ tbIsBalanced ? 'Trial balance is balanced — closing balances net to zero.' : `Out of balance by ${fmtAmt(tbTotals.ClosingBalance)}` }}
        </div>
        <DataTable :value="tbRows" show-gridlines size="small" scrollable scroll-height="flex"
          :row-class="tbRowClass" sort-mode="single">
          <Column field="AccountNo" header="Account No" sortable frozen style="min-width:120px" />
          <Column field="AccountName" header="Account Name" sortable frozen style="min-width:240px" />
          <Column field="Company" header="Company" sortable style="min-width:80px" v-if="multiCompany" />
          <Column field="AccountCategoryLabel" header="Category" sortable style="min-width:120px" />
          <Column header="Period Debit" class="num-col" style="min-width:140px" sortable field="PeriodDebit">
            <template #body="{ data }">
              <span v-if="data._isTotalRow" class="total-num">{{ fmtAmt(data.PeriodDebit) }}</span>
              <span v-else>{{ fmtAmt(data.PeriodDebit) }}</span>
            </template>
          </Column>
          <Column header="Period Credit" class="num-col" style="min-width:140px" sortable field="PeriodCredit">
            <template #body="{ data }">
              <span v-if="data._isTotalRow" class="total-num">{{ fmtAmt(data.PeriodCredit) }}</span>
              <span v-else>{{ fmtAmt(data.PeriodCredit) }}</span>
            </template>
          </Column>
          <Column header="Net Change" class="num-col" style="min-width:140px" sortable field="NetChange">
            <template #body="{ data }">
              <span :class="data._isTotalRow ? 'total-num' : signClass(data.NetChange)">{{ signedFmt(data.NetChange) }}</span>
            </template>
          </Column>
          <Column header="Closing Balance" class="num-col" style="min-width:150px" sortable field="ClosingBalance">
            <template #body="{ data }">
              <span v-if="data._isTotalRow" :class="['total-num', tbIsBalanced ? 'balanced-num' : 'unbalanced-num']">{{ fmtAmt(data.ClosingBalance) }}</span>
              <span v-else :class="signClass(data.ClosingBalance)">{{ fmtAmt(data.ClosingBalance) }}</span>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- ── Profit & Loss ── -->
      <div v-if="!loading && isPL && rows.length" class="report-wrap">
        <DataTable :value="plRows" show-gridlines size="small" scrollable scroll-height="flex"
          :row-class="plRowClass">
          <Column field="AccountNo" header="Account No" frozen style="min-width:120px" />
          <Column field="label" header="Description" frozen style="min-width:260px" />
          <Column field="Company" header="Company" style="min-width:80px" v-if="multiCompany" />
          <Column header="Period Amount" class="num-col" style="min-width:150px">
            <template #body="{ data }">
              <span v-if="!data._isSection && !data._isSubTotal" :class="plAmtClass(data)">{{ fmtAmt(Math.abs(data.PeriodAmount)) }}</span>
              <span v-else class="subtotal-val">{{ fmtAmt(Math.abs(data.PeriodAmount)) }}</span>
            </template>
          </Column>
          <Column header="YTD Amount" class="num-col" style="min-width:150px">
            <template #body="{ data }">
              <span v-if="!data._isSection && !data._isSubTotal" :class="plAmtClass(data)">{{ fmtAmt(Math.abs(data.YtdAmount)) }}</span>
              <span v-else class="subtotal-val">{{ fmtAmt(Math.abs(data.YtdAmount)) }}</span>
            </template>
          </Column>
        </DataTable>
        <div class="sticky-total-row pl-total-row">
          <span class="sticky-total-key">NET PROFIT / (LOSS)</span>
          <span v-if="multiCompany"></span>
          <span :class="plTotals.PeriodNet >= 0 ? 'positive' : 'negative'" style="font-weight:800">{{ fmtAmt(Math.abs(plTotals.PeriodNet)) }}</span>
          <span :class="plTotals.YtdNet >= 0 ? 'positive' : 'negative'" style="font-weight:800">{{ fmtAmt(Math.abs(plTotals.YtdNet)) }}</span>
        </div>
      </div>

      <!-- ── Balance Sheet ── -->
      <div v-if="!loading && isBS && rows.length" class="report-wrap">
        <DataTable :value="bsRows" show-gridlines size="small" scrollable scroll-height="flex"
          :row-class="bsRowClass">
          <Column field="AccountNo" header="Account No" frozen style="min-width:120px" />
          <Column field="label" header="Description" frozen style="min-width:260px" />
          <Column field="Company" header="Company" style="min-width:80px" v-if="multiCompany" />
          <Column header="Balance" class="num-col" style="min-width:160px">
            <template #body="{ data }">
              <span v-if="!data._isSection && !data._isSubTotal" :class="bsAmtClass(data)">{{ fmtAmt(Math.abs(data.Balance)) }}</span>
              <span v-else class="subtotal-val">{{ fmtAmt(Math.abs(data.Balance)) }}</span>
            </template>
          </Column>
        </DataTable>
        <div class="sticky-total-row bs-total-row">
          <span class="sticky-total-key">NET ASSETS</span>
          <span v-if="multiCompany"></span>
          <span :class="bsTotals.NetAssets >= 0 ? 'positive' : 'negative'" style="font-weight:800">{{ fmtAmt(Math.abs(bsTotals.NetAssets)) }}</span>
        </div>
      </div>

      <!-- ── Management Accounts ── -->
      <div v-if="!loading && isMgmt && mgmtResult.lines.length" class="report-wrap">
        <DataTable :value="mgmtResult.lines" show-gridlines size="small" scrollable scroll-height="flex"
          :row-class="mgmtRowClass" @row-click="openDetail($event.data)">
          <Column header="Description" frozen style="min-width:280px">
            <template #body="{ data }">
              <span v-if="data.lineType === 'spacer'"></span>
              <span v-else :style="{ paddingLeft: `${data.indentLevel * 16}px`, fontWeight: (data.isBold || data.lineType === 'subtotal') ? '700' : '400' }">
                {{ data.lineLabel }}
                <i v-if="data.lineType === 'data'" class="pi pi-angle-right detail-chevron" />
              </span>
            </template>
          </Column>
          <Column v-for="m in mgmtResult.measures" :key="m.measureCode"
            :header="m.measureLabel" class="num-col" style="min-width:140px">
            <template #body="{ data }">
              <span v-if="data.lineType !== 'heading' && data.lineType !== 'spacer'"
                :class="mgmtAmtClass(data, m.measureCode)">
                {{ fmtAmt(data.values[m.measureCode]) }}
              </span>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- ── Customer Aging ── -->
      <div v-if="!loading && isAging && agingGroups.length" class="report-wrap aging-outer">
        <div class="aging-wrap">
          <table class="aging-table">
            <thead>
              <tr>
                <th class="aging-pg-col">Posting Group / Company / Customer</th>
                <th class="aging-num">Current<br><span class="aging-bucket-hint">0–30 days</span></th>
                <th class="aging-num">30 Days<br><span class="aging-bucket-hint">31–60 days</span></th>
                <th class="aging-num">60 Days<br><span class="aging-bucket-hint">61–90 days</span></th>
                <th class="aging-num">90+ Days<br><span class="aging-bucket-hint">&gt;90 days</span></th>
                <th class="aging-num">Balance</th>
              </tr>
            </thead>
            <tbody v-for="grp in agingGroups" :key="grp.PostingGroup">
              <tr class="aging-group-row" @click="agingExpandedGroups[grp.PostingGroup] = !agingExpandedGroups[grp.PostingGroup]">
                <td class="aging-pg-col">
                  <i :class="agingExpandedGroups[grp.PostingGroup] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" style="font-size:.75rem;margin-right:6px;opacity:.85;color:#93c5fd" />
                  <strong>{{ grp.PostingGroup }}</strong>
                  <span class="aging-cust-count"> ({{ grp.companies.reduce((s,c)=>s+c.rows.length,0) }} customer{{ grp.companies.reduce((s,c)=>s+c.rows.length,0) !== 1 ? 's' : '' }})</span>
                </td>
                <td class="aging-num"><strong>{{ fmtAmt(grp.Current_) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(grp.Days30) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(grp.Days60) }}</strong></td>
                <td class="aging-num" :class="grp.Days90Plus > 0 ? 'aging-negative' : ''"><strong>{{ fmtAmt(grp.Days90Plus) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(grp.Balance) }}</strong></td>
              </tr>
              <template v-if="agingExpandedGroups[grp.PostingGroup]">
                <template v-for="co in grp.companies" :key="`${grp.PostingGroup}::${co.Company}`">
                  <tr class="aging-company-row" @click="agingExpandedCompanies[`${grp.PostingGroup}::${co.Company}`] = !agingExpandedCompanies[`${grp.PostingGroup}::${co.Company}`]">
                    <td class="aging-pg-col aging-co-indent">
                      <i :class="agingExpandedCompanies[`${grp.PostingGroup}::${co.Company}`] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" style="font-size:.7rem;margin-right:6px;opacity:.8;color:#60a5fa" />
                      <span class="aging-company-badge">{{ co.Company }}</span>
                      <span class="aging-cust-count">{{ co.rows.length }} customer{{ co.rows.length !== 1 ? 's' : '' }}</span>
                    </td>
                    <td class="aging-num">{{ fmtAmt(co.Current_) }}</td>
                    <td class="aging-num">{{ fmtAmt(co.Days30) }}</td>
                    <td class="aging-num">{{ fmtAmt(co.Days60) }}</td>
                    <td class="aging-num" :class="co.Days90Plus > 0 ? 'aging-negative' : ''">{{ fmtAmt(co.Days90Plus) }}</td>
                    <td class="aging-num">{{ fmtAmt(co.Balance) }}</td>
                  </tr>
                  <template v-if="agingExpandedCompanies[`${grp.PostingGroup}::${co.Company}`]">
                    <tr v-for="row in co.rows" :key="`${row.Company}-${row.CustomerNo}`" class="aging-detail-row">
                      <td class="aging-pg-col aging-cust-indent">{{ row.CustomerNo }} — {{ row.CustomerName }}</td>
                      <td class="aging-num">{{ fmtAmt(row.Current_) }}</td>
                      <td class="aging-num">{{ fmtAmt(row.Days30) }}</td>
                      <td class="aging-num">{{ fmtAmt(row.Days60) }}</td>
                      <td class="aging-num" :class="row.Days90Plus > 0 ? 'aging-negative' : ''">{{ fmtAmt(row.Days90Plus) }}</td>
                      <td class="aging-num">{{ fmtAmt(row.Balance) }}</td>
                    </tr>
                  </template>
                </template>
              </template>
            </tbody>
            <tfoot>
              <tr class="aging-total-row">
                <td class="aging-pg-col"><strong>TOTAL</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(agingTotals.Current_) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(agingTotals.Days30) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(agingTotals.Days60) }}</strong></td>
                <td class="aging-num" :class="agingTotals.Days90Plus > 0 ? 'aging-negative' : ''"><strong>{{ fmtAmt(agingTotals.Days90Plus) }}</strong></td>
                <td class="aging-num"><strong>{{ fmtAmt(agingTotals.Balance) }}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- ── Line drill-down drawer ── -->
      <Drawer v-model:visible="detailOpen" position="right" style="width:min(680px,95vw)" :modal="false">
        <template #header>
          <span style="font-weight:700;font-size:14px">{{ detailData.lineLabel }}</span>
        </template>
        <div v-if="detailLoading" style="padding:16px">
          <Skeleton height="1.5rem" class="mb" v-for="n in 8" :key="n" />
        </div>
        <div v-else-if="detailError" style="padding:16px;color:var(--p-red-500)">{{ detailError }}</div>
        <div v-else-if="!detailData.accounts.length" style="padding:24px;text-align:center;color:#687487">
          No account detail available — add a formula text to this line first.
        </div>
        <div v-else style="padding:0 4px">
          <DataTable :value="detailData.accounts" size="small" show-gridlines
            sort-field="accountNo" :sort-order="1" scrollable scroll-height="calc(100vh - 120px)">
            <Column field="company"     header="Co"      style="width:55px;font-size:11px" />
            <Column field="accountNo"   header="Acct"    style="width:80px;font-size:11px" sortable />
            <Column field="accountName" header="Name"    style="min-width:160px;font-size:11px" />
            <Column v-for="m in detailData.measures" :key="m.measureCode"
              :header="m.measureLabel" class="num-col" style="min-width:110px;font-size:11px">
              <template #body="{ data }">
                <span :class="data.amounts[m.measureCode] < 0 ? 'negative' : ''">
                  {{ fmtAmt(data.amounts[m.measureCode]) }}
                </span>
              </template>
            </Column>
          </DataTable>
          <!-- Totals row -->
          <div class="detail-totals">
            <span style="flex:1;font-weight:700">Total</span>
            <span v-for="m in detailData.measures" :key="m.measureCode" class="detail-total-num"
              :class="detailData.accounts.reduce((s,r)=>s+r.amounts[m.measureCode],0) < 0 ? 'negative' : ''">
              {{ fmtAmt(detailData.accounts.reduce((s,r) => s + (r.amounts[m.measureCode]||0), 0)) }}
            </span>
          </div>
        </div>
      </Drawer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { financeReportsApi } from '@/services/financeReports.js'
import { mgmtApi }           from '@/services/mgmtReports.js'
import { bcReportsApi }      from '@/services/bcReports.js'
import { canAccessFinance }  from '@/lib/financeAccess.js'
import { useAuthStore }      from '@/stores/auth.js'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Button     from 'primevue/button'
import Checkbox   from 'primevue/checkbox'
import DatePicker from 'primevue/datepicker'
import MultiSelect from 'primevue/multiselect'
import Select      from 'primevue/select'
import Skeleton   from 'primevue/skeleton'
import Message    from 'primevue/message'
import Drawer     from 'primevue/drawer'
import * as XLSX  from 'xlsx'

const ALL_COMPANIES = ['FCL', 'CM', 'FLM', 'RMK']

const TABS = [
  { value: 'trialBalance',   label: 'Trial Balance',     icon: 'pi pi-list' },
  { value: 'profitLoss',     label: 'Profit & Loss',     icon: 'pi pi-chart-line' },
  { value: 'balanceSheet',   label: 'Balance Sheet',     icon: 'pi pi-chart-bar' },
  { value: 'mgmt',           label: 'Management Accts',  icon: 'pi pi-table' },
  { value: 'customerAging',  label: 'Customer Aging',    icon: 'pi pi-clock' },
]

// BC GL Account Category codes
const CATEGORY_LABEL = {
  0: 'None', 1: 'Assets', 2: 'Liabilities', 3: 'Equity',
  4: 'Income', 5: 'Cost of Goods Sold', 6: 'Expenses', 7: 'Tax',
}
const PL_SECTIONS = [
  { key: 'income', label: 'Revenue', categories: [4], sign: -1 },
  { key: 'cogs',   label: 'Cost of Goods Sold', categories: [5], sign: 1 },
  { key: 'expense',label: 'Operating Expenses', categories: [6], sign: 1 },
  { key: 'tax',    label: 'Tax', categories: [7], sign: 1 },
]
const BS_SECTIONS = [
  { key: 'assets',      label: 'Assets',      categories: [1], sign: 1 },
  { key: 'liabilities', label: 'Liabilities', categories: [2], sign: -1 },
  { key: 'equity',      label: 'Equity',      categories: [3], sign: -1 },
]

const auth = useAuthStore()
const windowWidth = ref(window.innerWidth)
window.addEventListener('resize', () => { windowWidth.value = window.innerWidth })
const isMobile = computed(() => windowWidth.value < 768)
const filtersOpen = ref(window.innerWidth >= 768)

const loading = ref(false)
const error = ref(null)
const rows = ref([])
const reportType = ref('trialBalance')

const companies = ref([...ALL_COMPANIES])

function today() { return new Date() }
function ytdDefault() {
  const d = new Date()
  const year = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear()
  return new Date(year, 3, 1) // April 1
}

const dateFrom = ref(firstOfMonth())
const dateTo   = ref(today())
const ytdFrom  = ref(ytdDefault())

const isTB    = computed(() => reportType.value === 'trialBalance')
const isPL    = computed(() => reportType.value === 'profitLoss')
const isBS    = computed(() => reportType.value === 'balanceSheet')
const isMgmt  = computed(() => reportType.value === 'mgmt')
const isAging = computed(() => reportType.value === 'customerAging')
const multiCompany = computed(() => companies.value.length > 1)

// ── Management Accounts state ────────────────────────────────────────────────
const mgmtTemplates  = ref([])
const mgmtTemplateId = ref(null)

// Monday-aligned date helpers (weeks start Monday)
function prevMonday(d) {
  const r = new Date(d); r.setHours(0,0,0,0)
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}
function nextSunday(d) {
  const r = new Date(d); r.setHours(23,59,59,999)
  const day = r.getDay()
  r.setDate(r.getDate() + (day === 0 ? 0 : 7 - day))
  return r
}
function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function lastOfMonth(d = new Date())  { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function fiscalYearStart(d = new Date()) {
  const m = d.getMonth()
  return new Date(m < 3 ? d.getFullYear() - 1 : d.getFullYear(), 3, 1) // April 1
}

const periodPresets = computed(() => {
  const now  = new Date()
  const thisMonStart = firstOfMonth(now)
  const thisMonEnd   = lastOfMonth(now)
  const lastMonEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const lastMonStart = firstOfMonth(lastMonEnd)
  const thisWkMon    = prevMonday(now)
  const thisWkSun    = nextSunday(now)
  const lastWkSun    = new Date(thisWkMon); lastWkSun.setDate(lastWkSun.getDate() - 1)
  const lastWkMon    = prevMonday(lastWkSun)
  const fyStart      = fiscalYearStart(now)
  return [
    { label: 'This Wk',  from: thisWkMon,   to: thisWkSun   },
    { label: 'Last Wk',  from: lastWkMon,   to: lastWkSun   },
    { label: 'This Mo',  from: thisMonStart, to: thisMonEnd  },
    { label: 'Last Mo',  from: lastMonStart, to: lastMonEnd  },
    { label: 'YTD',      from: fyStart,      to: now         },
  ]
})

function applyPreset(p) { mgmtDateFrom.value = p.from; mgmtDateTo.value = p.to }

// Default: last complete month
const _now = new Date()
const _defTo   = new Date(_now.getFullYear(), _now.getMonth(), 0)       // last day prev month
const _defFrom = new Date(_defTo.getFullYear(), _defTo.getMonth(), 1)   // first day prev month
const mgmtDateFrom = ref(_defFrom)
const mgmtDateTo   = ref(_defTo)

const mgmtDim1Codes = ref([])   // array of selected DEPARTMENT codes
const mgmtDim2Codes = ref([])   // array of selected PROJECT codes
const dim1Options   = ref([])   // { Code, Name } from BC
const dim2Options   = ref([])   // { Code, Name } from BC
const dimLoading        = ref(false)
const mgmtResult        = ref({ lines: [], measures: [] })

// ── Customer Aging state ─────────────────────────────────────────────────────
const agingAsOfDate = ref(today())
const agingRows     = ref([])
const agingGroups   = computed(() => {
  const groups = new Map()
  for (const row of agingRows.value) {
    const gKey = row.PostingGroup
    if (!groups.has(gKey)) groups.set(gKey, { PostingGroup: gKey, Current_: 0, Days30: 0, Days60: 0, Days90Plus: 0, Balance: 0, companies: new Map() })
    const grp = groups.get(gKey)
    grp.Current_ += row.Current_ || 0; grp.Days30 += row.Days30 || 0
    grp.Days60   += row.Days60   || 0; grp.Days90Plus += row.Days90Plus || 0; grp.Balance += row.Balance || 0
    const cKey = row.Company
    if (!grp.companies.has(cKey)) grp.companies.set(cKey, { Company: cKey, Current_: 0, Days30: 0, Days60: 0, Days90Plus: 0, Balance: 0, rows: [] })
    const co = grp.companies.get(cKey)
    co.rows.push(row)
    co.Current_ += row.Current_ || 0; co.Days30 += row.Days30 || 0
    co.Days60   += row.Days60   || 0; co.Days90Plus += row.Days90Plus || 0; co.Balance += row.Balance || 0
  }
  for (const grp of groups.values()) grp.companies = [...grp.companies.values()].sort((a, b) => a.Company.localeCompare(b.Company))
  return [...groups.values()].sort((a, b) => a.PostingGroup.localeCompare(b.PostingGroup))
})
const agingExpandedGroups    = ref({})
const agingExpandedCompanies = ref({})
const agingTotals = computed(() => agingGroups.value.reduce(
  (acc, g) => { acc.Current_ += g.Current_; acc.Days30 += g.Days30; acc.Days60 += g.Days60; acc.Days90Plus += g.Days90Plus; acc.Balance += g.Balance; return acc },
  { Current_: 0, Days30: 0, Days60: 0, Days90Plus: 0, Balance: 0 }
))

const toDateStr = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

const periodLabel = computed(() => {
  if (isAging.value) return agingAsOfDate.value ? `As at ${toDateStr(agingAsOfDate.value)}` : ''
  if (isMgmt.value) {
    if (!mgmtDateFrom.value || !mgmtDateTo.value) return ''
    return `${toDateStr(mgmtDateFrom.value)} → ${toDateStr(mgmtDateTo.value)}`
  }
  if (!dateFrom.value || !dateTo.value) return ''
  if (isBS.value) return `As at ${toDateStr(dateTo.value)}`
  return `${toDateStr(dateFrom.value)} to ${toDateStr(dateTo.value)}`
})

function toggleCompany(co, checked) {
  const list = [...companies.value]
  if (checked) { if (!list.includes(co)) list.push(co) }
  else { companies.value = list.filter(c => c !== co); return }
  companies.value = list
}

function switchTab(type) {
  reportType.value = type
  rows.value = []
  mgmtResult.value = { lines: [], measures: [] }
  agingRows.value = []
  agingExpandedGroups.value = {}
  agingExpandedCompanies.value = {}
  error.value = null
  if (type === 'mgmt') runMgmt()
  else if (type === 'customerAging') { /* wait for user to click Run */ }
  else run()
}

// ── Formatters ──────────────────────────────────────────────────────────────
const fmt    = (v, dec = 2) => v == null || v === '' ? '–' : Number(v).toLocaleString('en-KE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtAmt = (v) => fmt(v, 2)
const signedFmt = (v) => `${Number(v) >= 0 ? '+' : ''}${fmt(v)}`
const signClass = (v) => Number(v) >= 0 ? 'positive' : 'negative'

// ── Trial Balance computed ───────────────────────────────────────────────────
// Totals computed from raw rows (avoids circular dependency with tbRows)
const tbTotals = computed(() => rows.value.reduce((acc, r) => {
  const debit  = Number(r.PeriodDebit)    || 0
  const credit = Number(r.PeriodCredit)   || 0
  const bal    = Number(r.ClosingBalance) || 0
  return {
    PeriodDebit:     acc.PeriodDebit     + debit,
    PeriodCredit:    acc.PeriodCredit    + credit,
    NetChange:       acc.NetChange       + (debit - credit),
    ClosingBalance:  acc.ClosingBalance  + bal,
  }
}, { PeriodDebit: 0, PeriodCredit: 0, NetChange: 0, ClosingBalance: 0 }))

// Is the trial balance balanced? Allow a tiny floating-point tolerance
const tbIsBalanced = computed(() => Math.abs(tbTotals.value.ClosingBalance) < 0.01)

// Pinned total row prepended to the data, then regular account rows
const tbRows = computed(() => {
  const dataRows = rows.value.map(r => ({
    ...r,
    AccountCategoryLabel: CATEGORY_LABEL[r.AccountCategory] || `Cat ${r.AccountCategory}`,
    NetChange: (Number(r.PeriodDebit) || 0) - (Number(r.PeriodCredit) || 0),
  }))
  const totalRow = {
    _isTotalRow: true,
    AccountNo: '',
    AccountName: 'TOTAL',
    AccountCategoryLabel: '',
    Company: '',
    PeriodDebit:    tbTotals.value.PeriodDebit,
    PeriodCredit:   tbTotals.value.PeriodCredit,
    NetChange:      tbTotals.value.NetChange,
    ClosingBalance: tbTotals.value.ClosingBalance,
  }
  return [totalRow, ...dataRows]
})

const tbRowClass = (data) => data._isTotalRow ? 'tb-pinned-total' : ''

// ── Profit & Loss computed ───────────────────────────────────────────────────
const plRows = computed(() => {
  if (!rows.value.length) return []
  const result = []
  let grossProfitPeriod = 0, grossProfitYtd = 0

  for (const section of PL_SECTIONS) {
    result.push({ _isSection: true, label: section.label, AccountNo: '', PeriodAmount: 0, YtdAmount: 0 })
    const sectionRows = rows.value.filter(r => section.categories.includes(r.AccountCategory))
    let secPeriod = 0, secYtd = 0
    for (const r of sectionRows) {
      const periodAmt = (Number(r.PeriodAmount) || 0) * section.sign
      const ytdAmt    = (Number(r.YtdAmount)    || 0) * section.sign
      secPeriod += periodAmt
      secYtd    += ytdAmt
      result.push({ ...r, label: r.AccountName, PeriodAmount: periodAmt, YtdAmount: ytdAmt, _section: section.key })
    }
    result.push({ _isSubTotal: true, label: `Total ${section.label}`, AccountNo: '', PeriodAmount: secPeriod, YtdAmount: secYtd, _section: section.key })

    if (section.key === 'cogs') {
      // Gross Profit after Revenue and COGS
      const revRow = result.find(r => r._isSubTotal && r._section === 'income')
      const cogsRow = result.find(r => r._isSubTotal && r._section === 'cogs')
      grossProfitPeriod = (revRow?.PeriodAmount || 0) - (cogsRow?.PeriodAmount || 0)
      grossProfitYtd    = (revRow?.YtdAmount    || 0) - (cogsRow?.YtdAmount    || 0)
      result.push({ _isSubTotal: true, _isGrossProfit: true, label: 'GROSS PROFIT', AccountNo: '', PeriodAmount: grossProfitPeriod, YtdAmount: grossProfitYtd })
    }
  }
  return result
})

const plTotals = computed(() => {
  const revenue   = rows.value.filter(r => r.AccountCategory === 4).reduce((s, r) => ({ p: s.p + (Number(r.PeriodAmount)||0), y: s.y + (Number(r.YtdAmount)||0) }), { p:0, y:0 })
  const costs     = rows.value.filter(r => [5,6,7].includes(r.AccountCategory)).reduce((s, r) => ({ p: s.p + (Number(r.PeriodAmount)||0), y: s.y + (Number(r.YtdAmount)||0) }), { p:0, y:0 })
  // Revenue is credit (negative GL amount), costs are debit (positive)
  // Net = -Revenue_GL - Costs_GL = Revenue_display - Costs_display
  return {
    PeriodNet: -revenue.p - costs.p,
    YtdNet:    -revenue.y - costs.y,
  }
})

const plRowClass = (data) => {
  if (data._isSection) return 'section-row'
  if (data._isGrossProfit) return 'gross-profit-row'
  if (data._isSubTotal) return 'subtotal-row'
  return ''
}

const plAmtClass = (data) => data._section === 'income' ? 'positive' : ''

// ── Balance Sheet computed ───────────────────────────────────────────────────
const bsRows = computed(() => {
  if (!rows.value.length) return []
  const result = []
  for (const section of BS_SECTIONS) {
    result.push({ _isSection: true, label: section.label, AccountNo: '', Balance: 0 })
    const sectionRows = rows.value.filter(r => section.categories.includes(r.AccountCategory))
    let secBalance = 0
    for (const r of sectionRows) {
      const bal = (Number(r.Balance) || 0) * section.sign
      secBalance += bal
      result.push({ ...r, label: r.AccountName, Balance: bal, _section: section.key })
    }
    result.push({ _isSubTotal: true, label: `Total ${section.label}`, AccountNo: '', Balance: secBalance, _section: section.key })
  }
  return result
})

const bsTotals = computed(() => {
  const assets      = rows.value.filter(r => r.AccountCategory === 1).reduce((s, r) => s + (Number(r.Balance)||0), 0)
  const liabilities = rows.value.filter(r => r.AccountCategory === 2).reduce((s, r) => s + (Number(r.Balance)||0), 0)
  const equity      = rows.value.filter(r => r.AccountCategory === 3).reduce((s, r) => s + (Number(r.Balance)||0), 0)
  return { NetAssets: assets + liabilities + equity }
})

const bsRowClass = (data) => {
  if (data._isSection) return 'section-row'
  if (data._isSubTotal) return 'subtotal-row'
  return ''
}

const bsAmtClass = (data) => data._section === 'assets' ? 'positive' : ''

// ── API calls ────────────────────────────────────────────────────────────────
async function run(refresh = false) {
  if (!canAccessFinance(auth.user?.role)) return
  error.value = null
  loading.value = true
  rows.value = []
  try {
    const f = {
      companies: companies.value,
      dateFrom:  toDateStr(dateFrom.value),
      dateTo:    toDateStr(dateTo.value),
      ytdFrom:   toDateStr(ytdFrom.value),
      refresh,
    }
    const { data } = await financeReportsApi.run(reportType.value, f)
    rows.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

async function forceRefresh() {
  if (isMgmt.value)  { await runMgmt(true); return }
  if (isAging.value) { await runAging(true); return }
  await financeReportsApi.clearCache().catch(() => {})
  await run(true)
}

async function runAging(refresh = false) {
  if (!agingAsOfDate.value) return
  error.value = null
  loading.value = true
  agingRows.value = []
  agingExpandedGroups.value = {}
  agingExpandedCompanies.value = {}
  try {
    const { data } = await bcReportsApi.customerAging({
      asOfDate:  toDateStr(agingAsOfDate.value),
      companies: companies.value,
    }, refresh)
    agingRows.value = data.rows || []
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

// ── Management Accounts API ───────────────────────────────────────────────────
async function loadMgmtTemplates() {
  try { mgmtTemplates.value = (await mgmtApi.listTemplates()).data }
  catch { /* fail silently */ }
}

async function loadDimensionValues() {
  dimLoading.value = true
  try {
    const [d1, d2] = await Promise.all([
      mgmtApi.listDimensionValues('DEPARTMENT'),
      mgmtApi.listDimensionValues('PROJECT'),
    ])
    dim1Options.value = d1.data
    dim2Options.value = d2.data
  } catch { /* fail silently */ }
  finally { dimLoading.value = false }
}

async function runMgmt(refresh = false) {
  if (!mgmtTemplateId.value) return
  error.value = null
  loading.value = true
  mgmtResult.value = { lines: [], measures: [] }
  try {
    const dim1 = mgmtDim1Codes.value.join(',')
    const dim2 = mgmtDim2Codes.value.join(',')
    const { data } = await mgmtApi.run(mgmtTemplateId.value, toDateStr(mgmtDateFrom.value), toDateStr(mgmtDateTo.value), refresh, dim1, dim2)
    mgmtResult.value = data
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

// ── Management Accounts display helpers ──────────────────────────────────────
const mgmtRowClass = (data) => {
  if (data.lineType === 'heading') return 'section-row'
  if (data.lineType === 'subtotal') return 'subtotal-row'
  if (data.lineType === 'spacer')   return 'spacer-row'
  if (data.isBold)                  return 'bold-row'
  return data.lineType === 'data' ? 'data-row' : ''
}

const mgmtAmtClass = (data, measureCode) => {
  const v = data.values?.[measureCode] ?? 0
  return v < 0 ? 'negative' : ''
}

// ── Line drill-down ──────────────────────────────────────────────────────────
const detailOpen    = ref(false)
const detailLoading = ref(false)
const detailError   = ref(null)
const detailData    = ref({ lineLabel: '', measures: [], accounts: [] })

async function openDetail(line) {
  if (line.lineType !== 'data') return
  detailOpen.value    = true
  detailLoading.value = true
  detailError.value   = null
  detailData.value    = { lineLabel: line.lineLabel, measures: [], accounts: [] }
  try {
    const dim1 = mgmtDim1Codes.value.join(',')
    const dim2 = mgmtDim2Codes.value.join(',')
    const { data } = await mgmtApi.lineDetail(
      mgmtTemplateId.value, line.lineCode,
      toDateStr(mgmtDateFrom.value), toDateStr(mgmtDateTo.value),
      dim1, dim2
    )
    detailData.value = data
  } catch (err) {
    detailError.value = err.response?.data?.error || err.message
  } finally {
    detailLoading.value = false
  }
}


// ── Excel export ─────────────────────────────────────────────────────────────
function exportExcel() {
  const wb = XLSX.utils.book_new()
  if (isAging.value && agingRows.value.length) {
    const data = agingRows.value.map(r => ({
      PostingGroup: r.PostingGroup, Company: r.Company,
      CustomerNo: r.CustomerNo, CustomerName: r.CustomerName,
      Current: r.Current_ || 0, '30Days': r.Days30 || 0,
      '60Days': r.Days60 || 0, '90PlusDays': r.Days90Plus || 0, Balance: r.Balance || 0,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Customer Aging')
    XLSX.writeFile(wb, `customer-aging-${toDateStr(agingAsOfDate.value)}.xlsx`)
    return
  }
  if (isMgmt.value && mgmtResult.value.lines.length) {
    const measureCols = mgmtResult.value.measures
    const data = mgmtResult.value.lines.map(l => {
      const row = { Description: l.lineLabel }
      for (const m of measureCols) row[m.measureLabel] = l.values[m.measureCode] ?? 0
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Management Accounts')
    XLSX.writeFile(wb, `mgmt-${toDateStr(mgmtReferenceDate.value)}.xlsx`)
    return
  }
  if (isTB.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tbRows.value.map(r => ({
      Company: r.Company, AccountNo: r.AccountNo, AccountName: r.AccountName,
      Category: r.AccountCategoryLabel,
      PeriodDebit: r.PeriodDebit, PeriodCredit: r.PeriodCredit,
      NetChange: r.NetChange, ClosingBalance: r.ClosingBalance,
    }))), 'Trial Balance')
  } else if (isPL.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plRows.value.filter(r => !r._isSection).map(r => ({
      AccountNo: r.AccountNo, Description: r.label,
      PeriodAmount: r.PeriodAmount, YtdAmount: r.YtdAmount,
    }))), 'P&L')
  } else if (isBS.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bsRows.value.filter(r => !r._isSection).map(r => ({
      AccountNo: r.AccountNo, Description: r.label, Balance: r.Balance,
    }))), 'Balance Sheet')
  }
  XLSX.writeFile(wb, `finance-${reportType.value}-${toDateStr(dateTo.value)}.xlsx`)
}

onMounted(async () => {
  await Promise.all([loadMgmtTemplates(), loadDimensionValues()])
  run()
})
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
.fin-layout { display:flex; height:100%; overflow:hidden; background:#f3f6fb; font-size:13px; }

/* ── Filter panel ─────────────────────────────────────────────── */
.fin-slicer {
  width:260px; min-width:260px;
  background:#fff; border-right:1px solid #dbe3ee;
  padding:12px; overflow-y:auto; overflow-x:hidden;
  transition: width 0.25s ease, min-width 0.25s ease, padding 0.25s ease;
  flex-shrink:0;
}
.fin-slicer.closed { width:0; min-width:0; padding:0; }
.fin-slicer-header { display:flex; align-items:center; gap:8px; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#000; margin-bottom:10px; }
.filter-box { border:1px solid #dbe3ee; border-radius:10px; background:#fbfdff; margin-bottom:10px; overflow:hidden; }
.filter-box summary { list-style:none; cursor:pointer; padding:10px 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#000; }
.filter-box summary::-webkit-details-marker { display:none; }
.filter-body { padding:10px 12px; }
.slicer-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#000; margin:0 0 6px; white-space:nowrap; }
.hint { font-size:9px; font-weight:400; color:#687487; }
.slicer-check { display:flex; align-items:center; gap:7px; padding:3px 0; }
.slicer-check label { color:#000; font-weight:600; white-space:nowrap; }
.run-btn { width:100%; margin-top:8px; }

/* ── Drill-down ── */
:deep(.data-row) { cursor:pointer; }
:deep(.data-row:hover td) { background:var(--bc-surface-raised,#f9fafb) !important; }
.detail-chevron { font-size:10px; opacity:.35; margin-left:4px; vertical-align:middle; }
.detail-totals {
  display:flex; align-items:center; gap:0;
  border-top:2px solid var(--bc-border,#e4e7ec);
  padding:6px 10px; font-size:12px; font-weight:700;
  background:var(--bc-surface-raised,#f9fafb);
}
.detail-total-num { min-width:110px; text-align:right; padding-right:8px; font-size:12px; }

.period-presets { display:flex; flex-wrap:wrap; gap:5px; }
.preset-btn {
  flex:1; min-width:0;
  padding:4px 6px; font-size:11px; font-weight:600;
  border:1px solid var(--bc-border,#e4e7ec); border-radius:5px;
  background:var(--bc-surface-raised,#f9fafb); color:var(--bc-text-muted,#687487);
  cursor:pointer; white-space:nowrap; transition:background .15s, color .15s;
}
.preset-btn:hover { background:var(--bc-border,#e4e7ec); color:var(--bc-text,#1f2937); }

/* ── Main ─────────────────────────────────────────────────────── */
.fin-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }

/* ── Tab bar ─────────────────────────────────────────────────── */
.tab-bar { display:flex; gap:4px; padding:8px 10px 0; background:#fff; border-bottom:1px solid #dbe3ee; overflow-x:auto; flex-shrink:0; scrollbar-width:none; }
.tab-bar::-webkit-scrollbar { display:none; }
.tab-btn { display:flex; align-items:center; gap:6px; padding:7px 12px; border:none; border-radius:8px 8px 0 0; background:transparent; cursor:pointer; font-size:12px; color:#687487; font-weight:600; white-space:nowrap; flex-shrink:0; }
.tab-btn.active { background:#1d4ed8; color:#fff; }
.filter-toggle-btn { display:flex; align-items:center; gap:6px; padding:7px 12px; border:none; border-radius:8px 8px 0 0; background:#f1f5f9; cursor:pointer; font-size:12px; color:#1d4ed8; font-weight:700; white-space:nowrap; flex-shrink:0; }

/* ── Toolbar ─────────────────────────────────────────────────── */
.toolbar { display:flex; align-items:center; gap:10px; padding:8px 12px; background:#fff; border-bottom:1px solid #dbe3ee; flex-wrap:wrap; }
.toolbar-actions { margin-left:auto; display:flex; align-items:center; gap:4px; }
.period-pill { padding:5px 10px; border-radius:999px; background:#eef4ff; color:#24407a; font-size:11px; flex-shrink:0; }

/* ── Report wrap ─────────────────────────────────────────────── */
.report-wrap { flex:1; overflow:hidden; display:flex; flex-direction:column; padding:10px 12px; gap:0; }
.skeleton-wrap { padding:10px 12px; }
.empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#98a2b3; gap:10px; }
.mb { margin-bottom:6px !important; }
.mx { margin:8px 12px; flex-shrink:0; }

/* ── TB balance-check banner ──────────────────────────────────── */
.tb-balance-check {
  display:flex; align-items:center; gap:8px;
  padding:6px 12px; font-size:12px; font-weight:600;
  flex-shrink:0; border-radius:6px; margin-bottom:6px;
}
.tb-balance-check.balanced   { background:#dcfce7; color:#14532d; }
.tb-balance-check.unbalanced { background:#fee4e2; color:#7f1d1d; }

/* ── Sticky total row (P&L / BS) ──────────────────────────────── */
.sticky-total-row {
  display:grid; gap:0; align-items:stretch; padding:0;
  border-top:2px solid #1d4ed8; background:#1d4ed8; color:#fff;
  font-weight:700; font-variant-numeric:tabular-nums;
  overflow-x:auto; position:sticky; bottom:0; z-index:2;
  box-shadow:0 -4px 12px rgba(15,23,42,.18);
}
.sticky-total-row > span { padding:6px 10px; display:flex; align-items:center; border-right:1px solid rgba(255,255,255,0.15); white-space:nowrap; }
.pl-total-row { grid-template-columns: 120px 260px 150px 150px; }
.bs-total-row { grid-template-columns: 120px 260px 160px; }
.sticky-total-key { min-width:120px; }
.subtotal-val { font-weight:700; }

/* ── Positive / Negative ─────────────────────────────────────── */
.positive { color:#0d5f2a; }
.negative { color:#9b1c1c; }
.total-num { font-weight:800; }
.balanced-num   { color:#bbf7d0; }
.unbalanced-num { color:#fecaca; }

/* ── Deep PrimeVue overrides ─────────────────────────────────── */
:deep(.p-datatable-tbody > tr > td) { color:#101828 !important; background:#fff !important; padding:6px 10px !important; border-color:#e4e7ec !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#f8fafc !important; }
:deep(.p-datatable-thead > tr > th) { background:#243247 !important; color:#f8fafc !important; font-size:11px !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px !important; border-color:#324256 !important; }
:deep(.num-col) { text-align:right !important; }

/* Pinned TB total row — sticky just below headers */
:deep(.p-datatable-tbody > tr.tb-pinned-total) { position:sticky; top:0; z-index:3; }
:deep(.p-datatable-tbody > tr.tb-pinned-total > td) { background:#243247 !important; color:#f8fafc !important; font-weight:800 !important; border-bottom:2px solid #1d4ed8 !important; }

/* Section rows (P&L / BS heading rows) */
:deep(.p-datatable-tbody > tr.section-row > td) { background:#243247 !important; color:#f8fafc !important; font-weight:700 !important; font-size:11px !important; text-transform:uppercase; letter-spacing:.06em; }
:deep(.p-datatable-tbody > tr.subtotal-row > td) { background:#e8f0fe !important; color:#1d4ed8 !important; font-weight:700 !important; }
:deep(.p-datatable-tbody > tr.gross-profit-row > td) { background:#1d4ed8 !important; color:#fff !important; font-weight:800 !important; }

/* ── Management Accounts rows ────────────────────────────────── */
:deep(.p-datatable-tbody > tr.spacer-row > td) { height:10px !important; padding:0 !important; border-top:none !important; }
:deep(.p-datatable-tbody > tr.bold-row > td)   { font-weight:700 !important; }

/* ── Customer Aging table ────────────────────────────────────── */
.aging-outer { padding:0; }
.aging-wrap  { flex:1; min-height:0; overflow:auto; }
.aging-table { width:100%; border-collapse:collapse; font-size:13px; }
.aging-table thead tr th {
  background:#243247; color:#f8fafc; font-size:11px; font-weight:700;
  text-transform:uppercase; letter-spacing:.04em;
  padding:8px 10px; border:1px solid #324256; text-align:right;
  position:sticky; top:0; z-index:2;
}
.aging-table thead tr th.aging-pg-col { text-align:left; }
.aging-num { text-align:right; padding:6px 10px; white-space:nowrap; }
.aging-pg-col { min-width:280px; }
.aging-co-indent   { padding-left:22px !important; }
.aging-cust-indent { padding-left:44px !important; }
.aging-group-row { cursor:pointer; background:#1e3a5f; border-top:2px solid #1d4ed8; }
.aging-group-row td { padding:8px 10px; color:#e2eaf5; border:1px solid #2c4f7c; font-weight:700; }
.aging-group-row:hover td { background:#254878; }
.aging-company-row { cursor:pointer; background:#162d4a; border-top:1px solid #2c4f7c; }
.aging-company-row td { padding:6px 10px; color:#cbd5e1; border:1px solid #253d5e; font-weight:600; }
.aging-company-row:hover td { background:#1e3a5f; }
.aging-detail-row td { padding:5px 10px; border:1px solid #e4e7ec; background:#ffffff; color:#101828; }
.aging-detail-row:nth-child(even) td { background:#f8fafc; }
.aging-total-row { position:sticky; bottom:0; z-index:2; background:#1d4ed8; box-shadow:0 -3px 10px rgba(15,23,42,.2); }
.aging-total-row td { color:#ffffff; padding:8px 10px; border:1px solid rgba(255,255,255,.15); font-weight:700; }
.aging-cust-count { font-size:11px; font-weight:400; color:#93c5fd; margin-left:4px; }
.aging-bucket-hint { font-size:10px; font-weight:400; text-transform:none; letter-spacing:0; opacity:.75; display:block; }
.aging-company-badge { display:inline-block; padding:1px 6px; border-radius:4px; background:#1d4ed8; color:#fff; font-size:10px; font-weight:700; margin-right:5px; vertical-align:middle; }
.aging-negative { color:#dc2626 !important; }
@media (prefers-color-scheme: dark) {
  .aging-detail-row td               { background:#1e2d3d !important; color:#e2eaf5 !important; border-color:#2c3d52 !important; }
  .aging-detail-row:nth-child(even) td { background:#172535 !important; }
  .aging-negative                    { color:#f87171 !important; }
}

/* ── Mobile ───────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .fin-layout { flex-direction:column; height:auto; min-height:100%; overflow:visible; }
  .fin-slicer {
    width:100% !important; min-width:100% !important;
    border-right:none; border-bottom:1px solid #dbe3ee;
    max-height:0; overflow:hidden; padding:0;
    transition: max-height 0.3s ease, padding 0.3s ease;
  }
  .fin-slicer:not(.closed) { max-height:80vh; padding:12px; overflow-y:auto; }
  .tab-label { display:none; }
  .filter-toggle-label { display:none; }
  .tb-total-row { grid-template-columns: 120px 1fr 140px 140px 140px 150px; }
}
</style>
