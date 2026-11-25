<template>
  <div class="arr">
    <!-- Controls -->
    <div class="arr-controls">
      <label>Company
        <select v-model="company">
          <option v-for="c in COMPANIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label>From <input v-model="dateFrom" type="date" /></label>
      <label>To <input v-model="dateTo" type="date" /></label>
      <Button label="Run" icon="pi pi-play" size="small" :loading="loading" :disabled="!validDates" @click="runSummary(false)" />
      <Button icon="pi pi-refresh" size="small" severity="secondary" :disabled="loading || !validDates" aria-label="Refresh from BC" v-tooltip="'Refresh from BC (bypass cache)'" @click="runSummary(true)" />
      <Button icon="pi pi-download" label="Excel" size="small" text :disabled="!summaryRows.length" @click="exportExcel" />
      <span class="arr-hint">Subledger = Detailed Cust. Ledg. Entry (LCY), mapped to G/L via each entry's Customer Posting Group → Receivables Account. Difference = G/L − Subledger.</span>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="arr-msg">{{ error }}</Message>

    <div class="arr-body">
      <div v-if="!summaryRows.length && !loading" class="arr-empty">
        <i class="pi pi-sync" />
        <p>Pick a company and period, then click <strong>Run</strong>.</p>
      </div>

      <!-- Summary per receivables account -->
      <section v-if="summaryRows.length" class="arr-section">
        <h3>Receivables accounts — {{ company }} · {{ dateFrom }} to {{ dateTo }}</h3>
        <div class="arr-scroll">
          <table class="arr-table">
            <thead>
              <tr>
                <th rowspan="2" class="l">Account</th>
                <th rowspan="2" class="l">Posting groups</th>
                <th colspan="3">Opening (before {{ dateFrom }})</th>
                <th colspan="3">Movement in period</th>
                <th colspan="3">Closing ({{ dateTo }})</th>
                <th colspan="2">Period reconciling activity</th>
              </tr>
              <tr>
                <th>G/L</th><th>Subledger</th><th>Diff</th>
                <th>G/L</th><th>Subledger</th><th>Diff</th>
                <th>G/L</th><th>Subledger</th><th>Diff</th>
                <th v-tooltip="'G/L entries on the account whose Source Type is not Customer'">Non-customer G/L</th>
                <th v-tooltip="'Subledger Application entries — non-zero when invoices/payments are applied across posting groups'">Cross-group appl.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in summaryRows" :key="r.AccountNo" class="click" :class="{ sel: r.AccountNo === selected }" @click="selectAccount(r.AccountNo)">
                <td class="l"><strong>{{ r.AccountNo }}</strong> <span class="muted">{{ r.AccountName }}</span></td>
                <td class="l">{{ r.PostingGroups.join(', ') }}</td>
                <td>{{ fmt(r.GlOpening) }}</td><td>{{ fmt(r.SubOpening) }}</td><td :class="diffCls(r.DiffOpening)">{{ fmtDiff(r.DiffOpening) }}</td>
                <td>{{ fmt(r.GlMovement) }}</td><td>{{ fmt(r.SubMovement) }}</td><td :class="diffCls(r.DiffMovement)">{{ fmtDiff(r.DiffMovement) }}</td>
                <td>{{ fmt(r.GlClosing) }}</td><td>{{ fmt(r.SubClosing) }}</td><td :class="diffCls(r.DiffClosing)">{{ fmtDiff(r.DiffClosing) }}</td>
                <td :class="diffCls(r.GlNonCustomerMovement)">{{ fmtDiff(r.GlNonCustomerMovement) }}</td>
                <td :class="diffCls(r.SubApplMovement)">{{ fmtDiff(r.SubApplMovement) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="l" colspan="2">Total</td>
                <td>{{ fmt(totals.GlOpening) }}</td><td>{{ fmt(totals.SubOpening) }}</td><td>{{ fmtDiff(totals.DiffOpening) }}</td>
                <td>{{ fmt(totals.GlMovement) }}</td><td>{{ fmt(totals.SubMovement) }}</td><td>{{ fmtDiff(totals.DiffMovement) }}</td>
                <td>{{ fmt(totals.GlClosing) }}</td><td>{{ fmt(totals.SubClosing) }}</td><td>{{ fmtDiff(totals.DiffClosing) }}</td>
                <td>{{ fmtDiff(totals.GlNonCustomerMovement) }}</td><td>{{ fmtDiff(totals.SubApplMovement) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="arr-note">Click an account to reconcile it transaction by transaction.</p>
      </section>

      <!-- Account drill-down -->
      <section v-if="selected" class="arr-section">
        <div class="arr-detail-head">
          <h3>{{ selectedRow?.AccountNo }} {{ selectedRow?.AccountName }} <span class="muted">· {{ selectedRow?.PostingGroups.join(', ') }}</span></h3>
          <div class="arr-scope">
            <button :class="{ on: scope === 'period' }" @click="setScope('period')">Tie-out: this period</button>
            <button :class="{ on: scope === 'all' }" @click="setScope('all')">Tie-out: all history to {{ dateTo }}</button>
          </div>
        </div>

        <div v-if="detailLoading" class="arr-loading"><i class="pi pi-spin pi-spinner" /> Reconciling {{ scope === 'all' ? 'all history (can take ~30s)' : 'the period' }}…</div>

        <template v-else-if="detail">
          <div class="arr-cards">
            <div class="card"><span>G/L closing</span><strong>{{ fmt(selectedRow.GlClosing) }}</strong></div>
            <div class="card"><span>Subledger closing</span><strong>{{ fmt(selectedRow.SubClosing) }}</strong></div>
            <div class="card" :class="diffCls(selectedRow.DiffClosing)"><span>Difference (G/L − Sub)</span><strong>{{ fmtDiff(selectedRow.DiffClosing) }}</strong></div>
            <div class="card"><span>of which opening</span><strong>{{ fmtDiff(selectedRow.DiffOpening) }}</strong></div>
            <div class="card"><span>of which period</span><strong>{{ fmtDiff(selectedRow.DiffMovement) }}</strong></div>
          </div>

          <table class="arr-table tie">
            <thead><tr><th class="l">Transaction tie-out ({{ scope === 'all' ? 'all history' : 'period' }})</th><th>Transactions</th><th>G/L</th><th>Subledger</th><th>Diff</th><th class="l">Meaning</th></tr></thead>
            <tbody>
              <tr v-for="k in tieOutSorted" :key="k.Kind">
                <td class="l"><span class="kind" :class="kindCls(k.Kind)">{{ k.Kind }}</span></td>
                <td>{{ k.Txns.toLocaleString() }}</td><td>{{ fmt(k.Gl) }}</td><td>{{ fmt(k.Sub) }}</td>
                <td :class="diffCls(k.Diff)">{{ fmtDiff(k.Diff) }}</td>
                <td class="l muted">{{ KIND_HELP[k.Kind] }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="scope === 'period' && selectedRow.DiffOpening" class="arr-note">
            The opening difference ({{ fmtDiff(selectedRow.DiffOpening) }}) comes from before {{ dateFrom }} — switch to <a href="#" @click.prevent="setScope('all')">all history</a> to list the transactions behind it.
          </p>

          <div class="arr-tabs">
            <button :class="{ on: tab === 'items' }" @click="tab = 'items'">Reconciling items ({{ detail.itemCount }})</button>
            <button :class="{ on: tab === 'customers' }" @click="tab = 'customers'">By customer ({{ detail.customers.length }})</button>
            <button :class="{ on: tab === 'types' }" @click="tab = 'types'">Subledger by entry type</button>
          </div>

          <!-- Reconciling items -->
          <div v-if="tab === 'items'">
            <p v-if="!detail.items.length" class="arr-note ok"><i class="pi pi-check-circle" /> Every transaction in scope ties one-to-one between G/L and subledger.</p>
            <p v-if="detail.itemCount > detail.items.length" class="arr-note">Showing the largest {{ detail.items.length }} of {{ detail.itemCount }} items.</p>
            <div v-if="detail.items.length" class="arr-scroll">
              <table class="arr-table">
                <thead><tr>
                  <th class="l">Kind</th><th class="l">Date</th><th class="l">Txn</th><th class="l">Document</th><th class="l">Description</th><th class="l">Customer</th>
                  <th>G/L</th><th>Subledger</th><th>Diff</th>
                  <th class="l">G/L source</th><th class="l">User</th><th class="l">Subledger entry types</th>
                  <th class="l" v-tooltip="'Posting groups outside this account touched by the same transaction'">Other groups</th>
                  <th class="l" v-tooltip="'Other receivables accounts the same transaction posted to'">Other accounts</th>
                </tr></thead>
                <tbody>
                  <tr v-for="i in detail.items" :key="i.Txn + i.DocNo">
                    <td class="l"><span class="kind" :class="kindCls(i.Kind)">{{ i.Kind }}</span></td>
                    <td class="l nowrap">{{ dateOnly(i.PostingDate) }}<span v-if="!i.InPeriod" class="tag">prior</span></td>
                    <td class="l">{{ i.Txn }}</td><td class="l">{{ i.DocNo }}</td><td class="l">{{ i.Description }}</td>
                    <td class="l">{{ i.CustomerNo }}</td>
                    <td>{{ fmtDiff(i.Gl) }}</td><td>{{ fmtDiff(i.Sub) }}</td><td :class="diffCls(i.Diff)">{{ fmtDiff(i.Diff) }}</td>
                    <td class="l">{{ [i.SourceType, i.SourceNo, i.SourceCode].filter(Boolean).join(' · ') }}</td>
                    <td class="l">{{ i.UserId }}</td><td class="l">{{ i.EntryTypes }}</td>
                    <td class="l">{{ i.OtherGroups }}</td><td class="l">{{ i.OtherAccounts }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- By customer -->
          <div v-if="tab === 'customers'">
            <div class="arr-filter">
              <input v-model="custSearch" type="search" placeholder="Search customer no. or name" />
              <label><input v-model="custDiffOnly" type="checkbox" /> Differences only</label>
              <span class="arr-hint">G/L per customer = entries on this account with Source Type Customer, attributed by Source No.; the first row holds G/L postings with no customer.</span>
            </div>
            <div class="arr-scroll">
              <table class="arr-table">
                <thead><tr>
                  <th class="l">Customer</th><th class="l">Name</th>
                  <th>Sub opening</th><th>G/L opening</th><th>Sub movement</th><th>G/L movement</th>
                  <th>Sub closing</th><th>G/L closing</th><th>Diff</th>
                </tr></thead>
                <tbody>
                  <tr v-for="c in visibleCustomers" :key="c.CustomerNo || '-'">
                    <td class="l">{{ c.CustomerNo || '—' }}</td><td class="l">{{ c.CustomerName }}</td>
                    <td>{{ fmt(c.SubOpening) }}</td><td>{{ fmt(c.GlOpening) }}</td>
                    <td>{{ fmt(c.SubMovement) }}</td><td>{{ fmt(c.GlMovement) }}</td>
                    <td>{{ fmt(c.SubClosing) }}</td><td>{{ fmt(c.GlClosing) }}</td>
                    <td :class="diffCls(c.DiffClosing)">{{ fmtDiff(c.DiffClosing) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="arr-note">{{ visibleCustomers.length }} of {{ detail.customers.length }} customers shown.</p>
          </div>

          <!-- Entry types -->
          <div v-if="tab === 'types'">
            <table class="arr-table">
              <thead><tr><th class="l">Entry type</th><th>Opening</th><th>Movement</th><th>Closing</th></tr></thead>
              <tbody>
                <tr v-for="e in detail.entryTypes" :key="e.EntryType">
                  <td class="l">{{ e.EntryTypeName }}</td><td>{{ fmt(e.Opening) }}</td><td>{{ fmt(e.Movement) }}</td><td>{{ fmt(e.Closing) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="arr-note">Application entries net to zero within a posting group; a non-zero total means invoices and payments were applied across posting groups, which moves balance between subledger groups without a G/L transfer.</p>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import XLSX from 'xlsx-js-style'
import { financeReportsApi } from '@/services/financeReports.js'
import { reportDate } from '../../../shared/reportDates.mjs'

const COMPANIES = ['FCL', 'CM', 'FLM', 'RMK']
const KIND_HELP = {
  'Matched': 'G/L on the account equals the subledger for the same transaction.',
  'GL only': 'Posted straight to the control account (e.g. journals) — no customer entry behind it.',
  'Subledger only': 'Customer entries with no G/L on this account — G/L went to another account, or a cross-group application.',
  'Amount differs': 'Both sides present but the amounts disagree (often FX revaluation or cross-group applications).',
}
const KIND_ORDER = ['GL only', 'Subledger only', 'Amount differs', 'Matched']

const now = new Date()
const company  = ref('FCL')
const dateFrom = ref(reportDate(new Date(now.getFullYear(), now.getMonth(), 1)))
const dateTo   = ref(reportDate(now))
const validDates = computed(() => !!dateFrom.value && !!dateTo.value && dateFrom.value <= dateTo.value)

const loading = ref(false)
const error = ref(null)
const summaryRows = ref([])
const ran = ref(null)             // filters the summary was run with
const selected = ref(null)
const scope = ref('period')
const tab = ref('items')
const detail = ref(null)
const detailLoading = ref(false)
const custSearch = ref('')
const custDiffOnly = ref(true)
let detailSeq = 0

const selectedRow = computed(() => summaryRows.value.find(r => r.AccountNo === selected.value))
const SUM_FIELDS = ['GlOpening', 'SubOpening', 'DiffOpening', 'GlMovement', 'SubMovement', 'DiffMovement', 'GlClosing', 'SubClosing', 'DiffClosing', 'GlNonCustomerMovement', 'SubApplMovement']
const totals = computed(() => Object.fromEntries(SUM_FIELDS.map(f => [f, summaryRows.value.reduce((s, r) => s + (r[f] || 0), 0)])))
const tieOutSorted = computed(() => [...(detail.value?.tieOut || [])].sort((a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind)))
const visibleCustomers = computed(() => {
  const q = custSearch.value.trim().toLowerCase()
  return (detail.value?.customers || []).filter(c =>
    (!custDiffOnly.value || Math.abs(c.DiffClosing) >= 0.005) &&
    (!q || c.CustomerNo.toLowerCase().includes(q) || c.CustomerName.toLowerCase().includes(q)))
})

const fmt = (v) => v == null ? '–' : Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDiff = (v) => (v == null || Math.abs(v) < 0.005) ? '–' : fmt(v)
const diffCls = (v) => (v != null && Math.abs(v) >= 0.005) ? 'bad' : ''
const kindCls = (k) => ({ 'Matched': 'k-ok', 'GL only': 'k-gl', 'Subledger only': 'k-sub', 'Amount differs': 'k-diff' })[k]
const dateOnly = (d) => String(d || '').slice(0, 10)
const errText = (e) => e.response?.data?.error || e.message

async function runSummary(refresh) {
  if (!validDates.value) return
  loading.value = true; error.value = null
  try {
    const f = { company: company.value, dateFrom: dateFrom.value, dateTo: dateTo.value }
    const { data } = await financeReportsApi.arReconSummary({ ...f, refresh })
    summaryRows.value = data
    ran.value = f
    // Keep the drill-down open on re-run if the account still exists.
    if (selected.value && data.some(r => r.AccountNo === selected.value)) await loadDetail(refresh)
    else { selected.value = null; detail.value = null }
  } catch (e) { error.value = errText(e) }
  finally { loading.value = false }
}

async function loadDetail(refresh = false) {
  if (!selected.value || !ran.value) return
  const seq = ++detailSeq
  detailLoading.value = true; error.value = null
  try {
    const { data } = await financeReportsApi.arReconDetail({ ...ran.value, account: selected.value, scope: scope.value, refresh })
    if (seq === detailSeq) detail.value = data
  } catch (e) { if (seq === detailSeq) error.value = errText(e) }
  finally { if (seq === detailSeq) detailLoading.value = false }
}

function selectAccount(acct) {
  if (selected.value === acct) return
  selected.value = acct; detail.value = null; tab.value = 'items'; custSearch.value = ''
  loadDetail()
}
function setScope(s) {
  if (scope.value === s) return
  scope.value = s; loadDetail()
}

function exportExcel() {
  const wb = XLSX.utils.book_new()
  const add = (rows, name) => {
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
      if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1D4ED8' } } }
      for (let r = 1; r <= range.e.r; r++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })]
        if (v && v.t === 'n') v.z = '#,##0.00'
      }
    }
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(40, k.length + 4)) }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const f = ran.value || { company: company.value, dateFrom: dateFrom.value, dateTo: dateTo.value }
  add(summaryRows.value.map(r => ({
    Account: r.AccountNo, Name: r.AccountName, PostingGroups: r.PostingGroups.join(', '),
    GlOpening: r.GlOpening, SubOpening: r.SubOpening, DiffOpening: r.DiffOpening,
    GlMovement: r.GlMovement, SubMovement: r.SubMovement, DiffMovement: r.DiffMovement,
    GlClosing: r.GlClosing, SubClosing: r.SubClosing, DiffClosing: r.DiffClosing,
    NonCustomerGl: r.GlNonCustomerMovement, CrossGroupApplications: r.SubApplMovement,
  })), 'Summary')
  const d = detail.value
  if (d) {
    add(tieOutSorted.value.map(k => ({ Kind: k.Kind, Transactions: k.Txns, Gl: k.Gl, Subledger: k.Sub, Diff: k.Diff })), `Tie-out ${d.account.AccountNo}`)
    add(d.items.map(i => ({
      Kind: i.Kind, PostingDate: dateOnly(i.PostingDate), InPeriod: i.InPeriod ? 'Yes' : 'No', Txn: i.Txn, DocNo: i.DocNo,
      Description: i.Description, CustomerNo: i.CustomerNo, Gl: i.Gl, Subledger: i.Sub, Diff: i.Diff,
      SourceType: i.SourceType, SourceNo: i.SourceNo, SourceCode: i.SourceCode, UserId: i.UserId,
      EntryTypes: i.EntryTypes, OtherGroups: i.OtherGroups, OtherAccounts: i.OtherAccounts,
    })), `Items ${d.account.AccountNo}`)
    add(d.customers.map(c => ({
      CustomerNo: c.CustomerNo, Name: c.CustomerName, SubOpening: c.SubOpening, GlOpening: c.GlOpening,
      SubMovement: c.SubMovement, GlMovement: c.GlMovement, SubClosing: c.SubClosing, GlClosing: c.GlClosing, Diff: c.DiffClosing,
    })), `Customers ${d.account.AccountNo}`)
    add(d.entryTypes.map(e => ({ EntryType: e.EntryTypeName, Opening: e.Opening, Movement: e.Movement, Closing: e.Closing })), `Entry types ${d.account.AccountNo}`)
  }
  const suffix = d ? `-${d.account.AccountNo}-${d.scope}` : ''
  XLSX.writeFile(wb, `ar-recon-${f.company}-${f.dateFrom}-to-${f.dateTo}${suffix}.xlsx`)
}
</script>

<style scoped>
.arr { flex:1; display:flex; flex-direction:column; min-height:0; color:#e2e8f0; }
.arr-controls { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 12px; background:#1b2233; border-bottom:1px solid #324256; }
.arr-controls label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#cbd5e1; }
.arr-controls select, .arr-controls input[type=date], .arr-filter input[type=search] {
  background:#151b28; color:#f8fafc; border:1px solid #324256; border-radius:6px; padding:5px 8px; font-size:13px; color-scheme:dark;
}
.arr-controls input[type=date]::-webkit-calendar-picker-indicator { filter:invert(1); opacity:.9; cursor:pointer; }
.arr-hint { font-size:11px; color:#94a3b8; flex-basis:100%; }
.arr-msg { margin:8px 12px; }
.arr-body { flex:1; overflow:auto; padding:10px 12px 24px; }
.arr-empty { display:flex; flex-direction:column; align-items:center; gap:8px; color:#98a2b3; padding:60px 0; }
.arr-empty .pi { font-size:2.5rem; opacity:.3; }
.arr-section { margin-bottom:22px; }
.arr-section h3 { font-size:14px; font-weight:800; color:#f8fafc; margin:4px 0 8px; }
.arr-scroll { overflow:auto; max-height:60vh; border:1px solid #324256; border-radius:8px; }
.arr-table { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
.arr-table th { position:sticky; top:0; z-index:1; background:#243247; color:#f8fafc; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:7px 9px; border:1px solid #324256; text-align:right; white-space:nowrap; }
.arr-table thead tr:nth-child(2) th { top:29px; }
.arr-table td { padding:5px 9px; border:1px solid #2a3850; text-align:right; white-space:nowrap; background:#1b2233; color:#f8fafc; }
.arr-table tbody tr:nth-child(even) td { background:#212a3d; }
.arr-table .l { text-align:left; }
.arr-table td.l { white-space:normal; min-width:60px; }
.arr-table tfoot td { background:#1d4ed8; color:#fff; font-weight:800; position:sticky; bottom:0; }
.arr-table tr.click { cursor:pointer; }
.arr-table tr.click:hover td { background:#2a3a55; }
.arr-table tr.sel td { background:#1e3a5f !important; }
.arr-table.tie { margin-bottom:6px; }
.muted { color:#94a3b8; font-weight:400; }
.nowrap { white-space:nowrap; }
.bad { color:#fca5a5 !important; font-weight:700; }
.arr-note { font-size:12px; color:#94a3b8; margin:6px 0; }
.arr-note a { color:#93c5fd; }
.arr-note.ok { color:#86efac; }
.arr-detail-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
.arr-scope, .arr-tabs { display:flex; gap:4px; flex-wrap:wrap; }
.arr-scope button, .arr-tabs button { border:1px solid #324256; background:#1b2233; color:#94a3b8; border-radius:6px; padding:5px 10px; font-size:12px; font-weight:600; cursor:pointer; }
.arr-scope button.on, .arr-tabs button.on { background:#1d4ed8; border-color:#1d4ed8; color:#fff; }
.arr-tabs { margin:12px 0 8px; }
.arr-loading { padding:24px 0; color:#93c5fd; }
.arr-cards { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 10px; }
.arr-cards .card { flex:1 1 160px; background:#1b2233; border:1px solid #324256; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; }
.arr-cards .card span { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; font-weight:700; }
.arr-cards .card strong { font-size:15px; color:#f8fafc; font-variant-numeric:tabular-nums; }
.arr-cards .card.bad strong { color:#fca5a5; }
.kind { display:inline-block; padding:1px 7px; border-radius:999px; font-size:10.5px; font-weight:700; white-space:nowrap; }
.k-ok { background:#14532d; color:#bbf7d0; }
.k-gl { background:#7c2d12; color:#fed7aa; }
.k-sub { background:#4c1d95; color:#ddd6fe; }
.k-diff { background:#713f12; color:#fef08a; }
.tag { margin-left:5px; font-size:9.5px; padding:0 5px; border-radius:4px; background:#334155; color:#cbd5e1; }
.arr-filter { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px; }
.arr-filter label { font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:5px; }
.arr-filter input[type=search] { min-width:240px; }
</style>
