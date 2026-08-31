<template>
  <div class="page">
    <div class="page-header flex justify-between items-center">
      <div>
        <h2 class="page-title">Invoices</h2>
        <p class="text-muted text-sm">Confirmed sales invoices with E-TIMS details</p>
      </div>
      <Button icon="pi pi-refresh" text severity="secondary" @click="list.load()" :loading="list.loading" />
    </div>

    <!-- Filters -->
    <div class="bc-card filters-bar">
      <Select v-model="companyId" :options="companyOptions" placeholder="Company" style="width:120px" @change="onCompanyChange"
        v-tooltip="'Which company\'s invoices to view'" />
      <InputText v-model="list.filters.q" placeholder="Search…" style="flex:1;min-width:180px" @keyup.enter="list.load()" />
      <DatePicker v-model="list.filters.dateFrom" placeholder="From" date-format="yy-mm-dd" show-icon />
      <DatePicker v-model="list.filters.dateTo"   placeholder="To"   date-format="yy-mm-dd" show-icon />
      <Select v-model="list.filters.status" :options="statuses" option-label="label" option-value="value"
        placeholder="All statuses" style="width:150px" show-clear />
      <InputText v-model="list.filters.postingGroup" placeholder="Posting group" style="width:150px" @keyup.enter="list.load()" />
      <Button label="Filter" icon="pi pi-filter" @click="list.load()" />
      <Button label="Clear"  icon="pi pi-times"  text @click="list.reset()" />
      <Button icon="pi pi-download" text severity="secondary" @click="doExport" v-tooltip="'Export to CSV'" />
      <Button icon="pi pi-file-excel" text severity="secondary" @click="doExportXlsx" :loading="xlsxLoading" v-tooltip="'Export to Excel'" />
      <Button label="Confirmations PDF" icon="pi pi-file-pdf" size="small" severity="secondary" outlined
        @click="exportConfirmations('pdf')" :loading="confLoading" v-tooltip="'Who confirmed each invoice + when (PDF)'" />
      <Button label="Confirmations Excel" icon="pi pi-verified" size="small" severity="secondary" outlined
        @click="exportConfirmations('xlsx')" :loading="confLoading" v-tooltip="'Who confirmed each invoice + when (Excel)'" />
    </div>

    <!-- Admin: BC invoice import background job -->
    <details v-if="isAdmin" class="bc-card import-panel">
      <summary><i class="pi pi-cloud-download" /> BC invoice import — background job (barcoded invoices due for scanning)</summary>
      <div class="imp-body">
        <div class="imp-row">
          <label class="imp-chk"><Checkbox v-model="imp.enabled" binary /> Enabled</label>
          <label>Every <InputNumber v-model="imp.intervalMinutes" :min="1" :max="1440" showButtons style="width:110px" /> min</label>
          <label>Look back <InputNumber v-model="imp.lookbackDays" :min="0" :max="30" showButtons style="width:110px" /> day(s)</label>
          <span class="imp-cos">
            <label v-for="c in ALL_COMPANIES" :key="c" class="imp-chk"><Checkbox v-model="imp.companies" :value="c" /> {{ c }}</label>
          </span>
        </div>
        <div class="imp-row">
          <Button label="Save schedule" icon="pi pi-save" size="small" @click="saveImp" :loading="impBusy" />
          <Button label="Run now" icon="pi pi-play" size="small" severity="secondary" @click="runImp" :loading="impRunning" />
          <Button label="Refresh log" icon="pi pi-refresh" size="small" text @click="loadImpLog" />
          <span v-if="impResult" class="text-sm text-muted">{{ impResult }}</span>
        </div>
        <DataTable :value="impLog" size="small" class="mt-2" paginator :rows="10">
          <Column header="When"><template #body="{data}">{{ fmtTime(data.startedAt) }}</template></Column>
          <Column field="company" header="Co" style="width:60px" />
          <Column field="dateFrom" header="From" style="width:100px" />
          <Column field="dateTo" header="To" style="width:100px" />
          <Column field="scanned" header="Scanned" style="width:80px" />
          <Column field="imported" header="Imported" style="width:80px" />
          <Column field="skipped" header="Skipped" style="width:80px" />
          <Column header="OK" style="width:50px"><template #body="{data}"><i :class="data.ok ? 'pi pi-check text-success' : 'pi pi-times text-danger'" /></template></Column>
          <Column field="triggeredBy" header="By" style="width:90px" />
          <Column field="error" header="Error" />
        </DataTable>
      </div>
    </details>

    <!-- Totals strip -->
    <div class="totals-strip" v-if="list.rows.length">
      <div class="total-box">
        <span class="total-label">Invoices</span>
        <span class="total-val mono">{{ list.rows.length }}</span>
      </div>
      <div class="total-box">
        <span class="total-label">Total Qty</span>
        <span class="total-val mono">{{ fmt(grandQty) }}</span>
      </div>
      <div class="total-box">
        <span class="total-label">Total Qty Base</span>
        <span class="total-val mono">{{ fmt(grandQtyBase) }}</span>
      </div>
      <div class="total-box highlight">
        <span class="total-label">Total Amount</span>
        <span class="total-val mono">{{ fmtCurrency(grandAmount) }}</span>
      </div>
    </div>

    <!-- Table -->
    <div class="bc-card mt-4" style="padding:0;overflow:hidden">
      <DataTable
        :value="list.rows"
        :loading="list.loading"
        dataKey="InvoiceNo"
        row-hover
        paginator :rows="25" :rows-per-page-options="[10,25,50]"
        class="inv-table"
      >
        <template #empty>
          <div class="table-empty">No invoices found</div>
        </template>

        <Column field="InvoiceNo" header="Invoice No" style="width:150px">
          <template #body="{ data }">
            <span class="mono link" @click="openScan(data.InvoiceNo)">{{ data.InvoiceNo }}</span>
          </template>
        </Column>
        <Column field="Barcode" header="Barcode" style="width:160px">
          <template #body="{ data }"><span class="mono text-sm">{{ data.Barcode || '—' }}</span></template>
        </Column>
        <Column field="CustomerName"    header="Customer" />
        <Column field="ExternalDocNo" header="External Doc No" style="width:150px">
          <template #body="{ data }"><span class="mono text-sm">{{ data.ExternalDocNo || '—' }}</span></template>
        </Column>
        <Column field="OriginalOrderNo" header="Order No" style="width:130px">
          <template #body="{ data }"><span class="mono text-muted">{{ data.OriginalOrderNo || '—' }}</span></template>
        </Column>
        <Column field="ETIMSInvoiceNo"  header="E-TIMS No" style="width:130px">
          <template #body="{ data }">
            <span class="mono text-sm">{{ data.ETIMSInvoiceNo || '—' }}</span>
          </template>
        </Column>
        <Column field="SalespersonCode" header="Salesperson" style="width:110px" />
        <Column field="RouteCode"       header="Route"        style="width:80px" />
        <Column field="InvoicedAt"      header="Invoiced"     style="width:130px">
          <template #body="{ data }">
            <span class="text-sm">{{ fmtDate(data.InvoicedAt) }}</span>
          </template>
        </Column>
        <Column field="Status" header="Status" style="width:120px">
          <template #body="{ data }"><StatusBadge :status="data.Status" /></template>
        </Column>
        <Column header="Confirmed" style="width:160px">
          <template #body="{ data }">
            <div v-if="data.ConfirmedBy" class="text-sm">
              <div>{{ data.ConfirmedBy }}</div>
              <div class="text-muted">{{ fmtDate(data.ConfirmedAt) }}</div>
            </div>
            <span v-else class="text-muted text-sm">— not yet —</span>
          </template>
        </Column>
        <Column header="" style="width:170px">
          <template #body="{ data }">
            <Button icon="pi pi-qrcode" label="Scan / Confirm" text size="small" @click="openScan(data.InvoiceNo)" />
            <Button icon="pi pi-list" label="Details" text size="small" @click="toggleLines(data.InvoiceNo)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Lines drawer -->
    <Drawer v-model:visible="drawerVisible" position="right" style="width:660px" :header="drawerTitle">
      <div v-if="drawerLoading">
        <Skeleton height="20px" class="mb-2" v-for="i in 4" :key="i" />
      </div>
      <template v-else>
        <div v-if="drawerHeader" class="inv-info">
          <div class="inv-info-row"><span class="k">Invoice No</span><span class="v mono">{{ drawerHeader.InvoiceNo }}</span></div>
          <div class="inv-info-row"><span class="k">Barcode</span><span class="v mono">{{ drawerHeader.Barcode || '—' }}</span></div>
          <div class="inv-info-row"><span class="k">Customer</span><span class="v">{{ drawerHeader.CustomerNo }} — {{ drawerHeader.CustomerName }}</span></div>
          <div class="inv-info-row"><span class="k">External Doc No</span><span class="v mono">{{ drawerHeader.ExternalDocNo || '—' }}</span></div>
          <div class="inv-info-row"><span class="k">Status</span><span class="v"><StatusBadge :status="drawerHeader.Status" /></span></div>
          <div class="inv-info-row" v-if="drawerHeader.ConfirmedBy"><span class="k">Confirmed by</span><span class="v">{{ drawerHeader.ConfirmedBy }} · {{ fmtDate(drawerHeader.ConfirmedAt) }}</span></div>
        </div>
        <DocumentLines :lines="drawerLines" class="mt-4" />
        <AuditLog :log="drawerAudit" class="mt-4" />
      </template>
    </Drawer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Button     from 'primevue/button'
import InputText  from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Select     from 'primevue/select'
import Drawer     from 'primevue/drawer'
import Skeleton   from 'primevue/skeleton'
import StatusBadge   from '@/components/base/StatusBadge.vue'
import DocumentLines from '@/components/base/DocumentLines.vue'
import AuditLog      from '@/components/base/AuditLog.vue'
import { invoicesApi } from '@/services/api.js'
import { useDocumentList } from '@/composables/useDocumentList.js'
import { watchDebounced }  from '@/composables/useDebounce.js'
import { exportCsv, todayStr } from '@/utils/exportCsv.js'
import { exportXlsx, INVOICE_HEADER_COLS, INVOICE_LINE_COLS } from '@/utils/exportXlsx.js'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import Checkbox    from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import { useAuthStore } from '@/stores/auth.js'
import { useToast } from 'primevue/usetoast'

import { useCompanyStore } from '@/stores/company.js'
const companyStore = useCompanyStore()
const INVOICE_COMPANIES = ['FCL', 'CM', 'RMK', 'FLM']
const companyOptions = computed(() => (companyStore.companies.length ? companyStore.companies.map(c => c.CompanyId) : INVOICE_COMPANIES))
const companyId = ref(companyStore.currentCompanyId || 'FCL')
function onCompanyChange() { companyStore.switchCompany(companyId.value); list.load() }

const router = useRouter()
const list   = useDocumentList(invoicesApi.list)
list.load()

watchDebounced(() => list.filters.q, () => list.load(), 50)

const statuses = [
  { label: 'Invoiced',  value: 'Invoiced' },
  { label: 'Confirmed', value: 'Confirmed' },
]

function doExport() {
  exportCsv(`invoices-${todayStr()}.csv`, list.rows, [
    { key: 'InvoiceNo',       label: 'Invoice No' },
    { key: 'OriginalOrderNo', label: 'Order No' },
    { key: 'CustomerNo',      label: 'Customer No' },
    { key: 'CustomerName',    label: 'Customer' },
    { key: 'ETIMSInvoiceNo',  label: 'E-TIMS No' },
    { key: 'SalespersonCode', label: 'Salesperson' },
    { key: 'RouteCode',       label: 'Route' },
    { key: 'SectorCode',      label: 'Sector' },
    { key: 'InvoicedAt',      label: 'Invoiced At' },
    { key: 'Status',          label: 'Status' },
    { key: 'TotalQuantityBase', label: 'Qty Base' },
    { key: 'TotalLineAmount',   label: 'Amount' },
  ])
}

const xlsxLoading = ref(false)
async function doExportXlsx() {
  xlsxLoading.value = true
  try {
    const params = {
      q:            list.filters.q           || undefined,
      status:       list.filters.status      || undefined,
      postingGroup: list.filters.postingGroup|| undefined,
      dateFrom:     list.filters.dateFrom instanceof Date ? list.filters.dateFrom.toISOString().slice(0,10) : list.filters.dateFrom || undefined,
      dateTo:       list.filters.dateTo   instanceof Date ? list.filters.dateTo.toISOString().slice(0,10)   : list.filters.dateTo   || undefined,
    }
    const { data: lines } = await invoicesApi.exportLines(params)
    exportXlsx(`invoices-${todayStr()}.xlsx`, [
      { name: 'Invoices', rows: list.rows, columns: INVOICE_HEADER_COLS },
      { name: 'Lines',    rows: lines,     columns: INVOICE_LINE_COLS   },
    ])
  } finally {
    xlsxLoading.value = false
  }
}

// ── Confirmations export (who confirmed + when) — PDF + Excel ────────────────
const CONF_COLS = [
  ['InvoiceNo', 'Invoice No'], ['Barcode', 'Barcode'], ['CustomerName', 'Customer'],
  ['RouteCode', 'Route'], ['InvoicedAt', 'Invoiced At'], ['Status', 'Status'],
  ['ConfirmedBy', 'Confirmed By'], ['ConfirmedAt', 'Confirmed At'],
]
function iso(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : (d || undefined) }
function fmtTime(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '' }
function confCell(key, v) { return (key === 'ConfirmedAt' || key === 'InvoicedAt') && v ? fmtTime(v) : (v ?? '') }
const confLoading = ref(false)
async function exportConfirmations(kind) {
  confLoading.value = true
  try {
    const params = { dateFrom: iso(list.filters.dateFrom), dateTo: iso(list.filters.dateTo), status: list.filters.status || undefined }
    const { data } = await invoicesApi.confirmations(params)
    if (!data.length) { toast.add({ severity: 'info', summary: 'No invoices', detail: 'Nothing in this filter to export.', life: 3000 }); return }
    if (kind === 'pdf') {
      const pdf = new jsPDF('l', 'mm', 'a4')
      pdf.setFontSize(14); pdf.text('Invoice Confirmations', 14, 14)
      pdf.setFontSize(9); pdf.text(`${params.dateFrom || '…'} → ${params.dateTo || '…'}  ·  ${data.length} invoices`, 14, 20)
      pdf.autoTable({
        head: [CONF_COLS.map(c => c[1])],
        body: data.map(r => CONF_COLS.map(c => confCell(c[0], r[c[0]]))),
        startY: 24, styles: { fontSize: 8 }, headStyles: { fillColor: [15, 113, 115] },
      })
      pdf.save(`invoice-confirmations-${todayStr()}.pdf`)
    } else {
      exportXlsx(`invoice-confirmations-${todayStr()}.xlsx`, [{
        name: 'Confirmations',
        rows: data.map(r => ({ ...r, InvoicedAt: fmtTime(r.InvoicedAt), ConfirmedAt: fmtTime(r.ConfirmedAt) })),
        columns: CONF_COLS.map(c => ({ key: c[0], label: c[1] })),
      }])
    }
  } catch (e) { toast.add({ severity: 'error', summary: 'Export failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { confLoading.value = false }
}

// ── Admin: BC invoice import job ─────────────────────────────────────────────
const auth = useAuthStore()
const toast = useToast()
const isAdmin = computed(() => auth.user?.role === 'admin')
const ALL_COMPANIES = ['FCL', 'CM', 'RMK', 'FLM']
const imp = ref({ enabled: false, intervalMinutes: 15, lookbackDays: 1, companies: [...ALL_COMPANIES] })
const impLog = ref([]); const impBusy = ref(false); const impRunning = ref(false); const impResult = ref('')
async function loadImp() {
  try { imp.value = (await invoicesApi.importConfig()).data } catch { /* non-admin / not set */ }
}
async function loadImpLog() {
  try { impLog.value = (await invoicesApi.importLog(50)).data } catch { /* ignore */ }
}
async function saveImp() {
  impBusy.value = true
  try { imp.value = (await invoicesApi.saveImportConfig(imp.value)).data; toast.add({ severity: 'success', summary: 'Schedule saved', life: 2500 }) }
  catch (e) { toast.add({ severity: 'error', summary: 'Save failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { impBusy.value = false }
}
async function runImp() {
  impRunning.value = true; impResult.value = ''
  try {
    const { data } = await invoicesApi.importRun({})
    impResult.value = `Imported ${data.totalImported} of ${data.totalScanned} scanned (${data.from} → ${data.to}).`
    await loadImpLog()
  } catch (e) { toast.add({ severity: 'error', summary: 'Run failed', detail: e.response?.data?.error || e.message, life: 5000 }) }
  finally { impRunning.value = false }
}
if (isAdmin.value) { loadImp(); loadImpLog() }

// Grand totals are computed from header rows (no line detail needed in list)
const grandQty     = computed(() => list.rows.reduce((s, r) => s + (+r.TotalQuantity     || 0), 0))
const grandQtyBase = computed(() => list.rows.reduce((s, r) => s + (+r.TotalQuantityBase || 0), 0))
const grandAmount  = computed(() => list.rows.reduce((s, r) => s + (+r.TotalLineAmount   || 0), 0))

// Drawer
const drawerVisible = ref(false)
const drawerHeader  = ref(null)
const drawerLines   = ref([])
const drawerAudit   = ref([])
const drawerTitle   = ref('')
const drawerLoading = ref(false)

async function toggleLines(invoiceNo) {
  drawerTitle.value   = `Invoice ${invoiceNo}`
  drawerVisible.value = true
  drawerLoading.value = true
  drawerHeader.value  = null
  try {
    const [docRes, auditRes] = await Promise.all([
      invoicesApi.get(invoiceNo),
      invoicesApi.audit(invoiceNo),
    ])
    drawerHeader.value = docRes.data.header
    drawerLines.value  = docRes.data.lines
    drawerAudit.value  = auditRes.data
  } finally {
    drawerLoading.value = false
  }
}

function openScan(no) { router.push({ name: 'InvoiceScan', query: { no } }) }

const fmt         = (v) => Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })
const fmtCurrency = (v) => `KES ${fmt(v)}`
const fmtDate     = (v) => v ? new Date(v).toLocaleString('en-KE') : '—'
</script>

<style scoped>
.page-header { margin-bottom: 20px; }
.page-title  { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
.filters-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 16px; }
.table-empty { text-align: center; padding: 40px; color: var(--bc-text-muted); }
.link        { cursor: pointer; color: var(--bc-primary-light); text-decoration: underline; text-decoration-style: dotted; }
.inv-table   { font-size: 13px; }

.totals-strip {
  display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap;
}
.total-box {
  background: var(--bc-surface-card);
  border: 1px solid var(--bc-border);
  border-radius: 10px;
  padding: 10px 18px;
  display: flex; flex-direction: column; gap: 4px; min-width: 130px;
}
.total-box.highlight { border-color: var(--bc-primary); }
.total-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bc-text-muted); }
.total-val   { font-size: 20px; font-weight: 700; color: var(--bc-text); }
.total-box.highlight .total-val { color: var(--bc-primary-light); }
.import-panel { margin-top: 12px; padding: 10px 14px; }
.import-panel > summary { cursor: pointer; font-weight: 600; }
.import-panel .imp-body { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.import-panel .imp-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.import-panel .imp-chk { display: inline-flex; align-items: center; gap: 6px; }
.import-panel .imp-cos { display: inline-flex; gap: 12px; align-items: center; }
.text-success { color: #16a34a; } .text-danger { color: #dc2626; }
.inv-info { border:1px solid var(--bc-border, #e2e8f0); border-radius:8px; padding:10px 12px; background:var(--bc-surface, #f8fafc); }
.inv-info-row { display:flex; gap:10px; padding:3px 0; font-size:13px; }
.inv-info-row .k { flex:0 0 130px; color:var(--bc-text-muted, #64748b); font-weight:600; }
.inv-info-row .v { flex:1; color:var(--bc-text, #0f172a); }
</style>
