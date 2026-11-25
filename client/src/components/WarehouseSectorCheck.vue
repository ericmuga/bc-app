<template>
  <section class="card">
    <div class="sc-head">
      <h3><i class="pi pi-tags" /> Customer sector check <span v-if="result" class="sc-count">{{ result.rows.length }} flagged</span></h3>
      <div class="sc-actions">
        <span v-if="result" class="sc-muted">Checked {{ fmtDateTime(result.checkedAt) }}</span>
        <Button :label="result ? 'Re-check' : 'Run check'" icon="pi pi-search" size="small" :loading="loading" @click="run" />
        <Button icon="pi pi-download" label="Excel" size="small" text :disabled="!result" @click="exportExcel" />
      </div>
    </div>
    <p class="sc-muted sc-intro">
      Compares each customer's sector in live BC with the warehouse customer copies (<code>*MAIN_CUSTOMER</code>),
      the <code>ALLCUSTOMERS</code> view the sales views join on, and <code>dim_ALLCUSTOMERS_MV</code>.
    </p>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <template v-if="result">
      <div class="sc-scroll">
        <table class="sc-table">
          <thead><tr>
            <th class="l">Company</th><th>Customers</th><th>Clean</th>
            <th v-for="k in issueKeys" :key="k" :title="result.issueLabels[k]">{{ SHORT[k] }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="s in result.summary" :key="s.Company">
              <td class="l"><strong>{{ s.Company }}</strong></td><td>{{ fmtNum(s.Customers) }}</td><td class="ok">{{ fmtNum(s.Clean) }}</td>
              <td v-for="k in issueKeys" :key="k" :class="{ bad: s[k] }">
                <a v-if="s[k]" href="#" @click.prevent="setFilter(s.Company, k)">{{ fmtNum(s[k]) }}</a><span v-else>–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sc-split">
        <div>
          <h4>Sector values (customers per source)</h4>
          <table class="sc-table">
            <thead><tr><th class="l">Sector</th><th>Live BC</th><th>Warehouse copy</th><th title="Counted only where ALLCUSTOMERS resolves to the customer's own company">ALLCUSTOMERS</th><th>Dim</th></tr></thead>
            <tbody>
              <tr v-for="v in result.sectors" :key="v.Sector">
                <td class="l">{{ v.Sector }} <span v-if="v.NotInBc" class="pill bad-pill">not in BC</span></td>
                <td>{{ fmtNum(v.Live) }}</td><td>{{ fmtNum(v.Staging) }}</td><td>{{ fmtNum(v.AllCustomers) }}</td><td>{{ fmtNum(v.Dim) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="sc-legend">
          <h4>What the flags mean</h4>
          <dl>
            <template v-for="k in issueKeys" :key="k"><dt>{{ SHORT[k] }}</dt><dd>{{ result.issueLabels[k] }}</dd></template>
          </dl>
        </div>
      </div>

      <h4>Flagged customers</h4>
      <div class="sc-filter">
        <select v-model="fCompany"><option value="">All companies</option><option v-for="s in result.summary" :key="s.Company" :value="s.Company">{{ s.Company }}</option></select>
        <select v-model="fIssue"><option value="">All flags</option><option v-for="k in issueKeys" :key="k" :value="k">{{ result.issueLabels[k] }}</option></select>
        <input v-model="fText" type="search" placeholder="Customer no. or name" />
        <span class="sc-muted">{{ visibleRows.length }} shown</span>
      </div>
      <div class="sc-scroll tall">
        <table class="sc-table">
          <thead><tr>
            <th class="l">Company</th><th class="l">Customer</th><th class="l">Name</th>
            <th class="l">Live BC</th><th class="l">Warehouse copy</th><th class="l">ALLCUSTOMERS</th><th class="l">Dim</th><th class="l">Flags</th>
          </tr></thead>
          <tbody>
            <tr v-for="r in pagedRows" :key="r.Company + r.CustomerNo">
              <td class="l">{{ r.Company }}</td><td class="l">{{ r.CustomerNo }}</td><td class="l">{{ r.Name }}</td>
              <td class="l">{{ show(r.LiveSector) }}</td>
              <td class="l" :class="{ bad: r.StagingSector != null && r.StagingSector !== r.LiveSector }">{{ r.StagingSector === undefined ? 'n/a' : show(r.StagingSector) }}</td>
              <td class="l" :class="{ bad: r.AllCustSector !== r.LiveSector }">
                {{ show(r.AllCustSector) }}<span v-if="r.AllCustCompany && r.AllCustCompany !== r.Company" class="pill">via {{ r.AllCustCompany }}</span>
              </td>
              <td class="l" :class="{ bad: r.DimSector !== r.LiveSector }">{{ show(r.DimSector) }}</td>
              <td class="l"><span v-for="i in r.Issues" :key="i" class="pill" :title="result.issueLabels[i]">{{ SHORT[i] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="visibleRows.length > pageSize" class="sc-pager">
        <Button icon="pi pi-angle-left" text size="small" :disabled="page === 0" @click="page--" />
        <span class="sc-muted">Page {{ page + 1 }} of {{ pageCount }}</span>
        <Button icon="pi pi-angle-right" text size="small" :disabled="page >= pageCount - 1" @click="page++" />
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import XLSX from 'xlsx-js-style'
import { warehouseApi } from '@/services/warehouse.js'

const SHORT = {
  BLANK_IN_BC: 'Blank in BC', UNDEFINED_IN_BC: 'UNDEFINED in BC',
  STAGING_MISSING: 'Copy missing', STAGING_DIFFERS: 'Copy differs',
  ALLCUST_MISSING: 'ALLCUST missing', ALLCUST_SHADOWED: 'ALLCUST other co.', ALLCUST_DIFFERS: 'ALLCUST wrong sector',
  DIM_MISSING: 'Dim missing', DIM_DEFAULTED: 'Dim defaulted', DIM_DIFFERS: 'Dim differs',
}

const loading = ref(false)
const error = ref('')
const result = ref(null)
const fCompany = ref('')
const fIssue = ref('')
const fText = ref('')
const page = ref(0)
const pageSize = 200

const issueKeys = computed(() => Object.keys(result.value?.issueLabels || {}))
const visibleRows = computed(() => {
  const q = fText.value.trim().toLowerCase()
  return (result.value?.rows || []).filter(r =>
    (!fCompany.value || r.Company === fCompany.value) &&
    (!fIssue.value || r.Issues.includes(fIssue.value)) &&
    (!q || r.CustomerNo.toLowerCase().includes(q) || r.Name.toLowerCase().includes(q)))
})
const pageCount = computed(() => Math.max(1, Math.ceil(visibleRows.value.length / pageSize)))
const pagedRows = computed(() => visibleRows.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([fCompany, fIssue, fText], () => { page.value = 0 })

const fmtNum = (n) => Number(n || 0).toLocaleString('en-KE')
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const show = (v) => v == null ? 'missing' : (v === '' ? '(blank)' : v)

function setFilter(company, issue) { fCompany.value = company; fIssue.value = issue }

async function run() {
  loading.value = true; error.value = ''
  try { result.value = (await warehouseApi.sectorCheck()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

function exportExcel() {
  const r = result.value
  const wb = XLSX.utils.book_new()
  const add = (rows, name) => {
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
      if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1D4ED8' } } }
    }
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(45, k.length + 6)) }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  add(r.rows.map(x => ({
    Company: x.Company, CustomerNo: x.CustomerNo, Name: x.Name, LiveSector: show(x.LiveSector),
    WarehouseCopy: x.StagingSector === undefined ? 'n/a' : show(x.StagingSector),
    AllCustomers: show(x.AllCustSector), AllCustomersCompany: x.AllCustCompany || '', Dim: show(x.DimSector),
    Flags: x.Issues.map(i => r.issueLabels[i]).join('; '),
  })), 'Flagged customers')
  add(r.summary.map(s => ({ Company: s.Company, Customers: s.Customers, Clean: s.Clean, ...Object.fromEntries(issueKeys.value.map(k => [r.issueLabels[k], s[k]])) })), 'Summary')
  add(r.sectors.map(v => ({ Sector: v.Sector, LiveBC: v.Live, WarehouseCopy: v.Staging, ALLCUSTOMERS: v.AllCustomers, Dim: v.Dim, NotInBC: v.NotInBc ? 'Yes' : '' })), 'Sector values')
  XLSX.writeFile(wb, `customer-sector-check-${r.checkedAt.slice(0, 10)}.xlsx`)
}
</script>

<style scoped>
.sc-head { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
.sc-head h3 { margin:0; font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px; color:#f8fafc; }
.sc-count { background:#7f1d1d; color:#fecaca; border-radius:10px; padding:1px 8px; font-size:12px; }
.sc-actions { display:flex; align-items:center; gap:8px; }
.sc-muted { color:#94a6bf; font-size:12px; }
.sc-intro { margin:0 0 10px; }
.sc-intro code { color:#cbd6e6; font-size:11.5px; }
h4 { margin:14px 0 6px; font-size:13px; color:#f8fafc; }
.sc-scroll { overflow:auto; border:1px solid #324256; border-radius:8px; }
.sc-scroll.tall { max-height:520px; }
.sc-table { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
.sc-table th { position:sticky; top:0; background:#243247; color:#f8fafc; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:7px 9px; border:1px solid #324256; text-align:right; white-space:nowrap; }
.sc-table td { padding:5px 9px; border:1px solid #2a3850; text-align:right; background:#1b2233; color:#f8fafc; }
.sc-table tbody tr:nth-child(even) td { background:#212a3d; }
.sc-table .l { text-align:left; }
.sc-table a { color:#fca5a5; font-weight:700; }
.ok { color:#86efac !important; }
.bad { color:#fca5a5 !important; font-weight:700; }
.pill { display:inline-block; margin:1px 4px 1px 0; padding:0 6px; border-radius:999px; background:#334155; color:#e2e8f0; font-size:10.5px; font-weight:600; white-space:nowrap; }
.bad-pill { background:#7f1d1d; color:#fecaca; }
.sc-split { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
@media (max-width: 900px) { .sc-split { grid-template-columns:1fr; } }
.sc-legend dl { margin:0; display:grid; grid-template-columns:max-content 1fr; gap:4px 12px; font-size:12px; }
.sc-legend dt { color:#f8fafc; font-weight:700; }
.sc-legend dd { margin:0; color:#cbd6e6; }
.sc-filter { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
.sc-filter select, .sc-filter input { background:#151b28; color:#f8fafc; border:1px solid #324256; border-radius:6px; padding:5px 8px; font-size:12.5px; color-scheme:dark; }
.sc-filter input { min-width:220px; }
.sc-pager { display:flex; align-items:center; justify-content:flex-end; gap:6px; margin-top:6px; }
</style>
