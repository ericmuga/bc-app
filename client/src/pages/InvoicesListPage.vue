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
      <InputText v-model="list.filters.q" placeholder="Search…" style="flex:1;min-width:180px" @keyup.enter="list.load()" />
      <DatePicker v-model="list.filters.dateFrom" placeholder="From" date-format="yy-mm-dd" show-icon />
      <DatePicker v-model="list.filters.dateTo"   placeholder="To"   date-format="yy-mm-dd" show-icon />
      <Select v-model="list.filters.status" :options="statuses" option-label="label" option-value="value"
        placeholder="All statuses" style="width:150px" show-clear />
      <InputText v-model="list.filters.postingGroup" placeholder="Posting group" style="width:150px" @keyup.enter="list.load()" />
      <Button label="Filter" icon="pi pi-filter" @click="list.load()" />
      <Button label="Clear"  icon="pi pi-times"  text @click="list.reset()" />
      <Button icon="pi pi-download" text severity="secondary" @click="doExport" v-tooltip="'Export to CSV'" />
    </div>

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
        <Column field="OriginalOrderNo" header="Order No" style="width:140px">
          <template #body="{ data }">
            <span class="mono text-muted">{{ data.OriginalOrderNo }}</span>
          </template>
        </Column>
        <Column field="CustomerName"    header="Customer" />
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
        <Column header="" style="width:90px">
          <template #body="{ data }">
            <Button icon="pi pi-list" label="Lines" text size="small" @click="toggleLines(data.InvoiceNo)" />
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
        <DocumentLines :lines="drawerLines" />
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

// Grand totals are computed from header rows (no line detail needed in list)
const grandQty     = computed(() => list.rows.reduce((s, r) => s + (+r.TotalQuantity     || 0), 0))
const grandQtyBase = computed(() => list.rows.reduce((s, r) => s + (+r.TotalQuantityBase || 0), 0))
const grandAmount  = computed(() => list.rows.reduce((s, r) => s + (+r.TotalLineAmount   || 0), 0))

// Drawer
const drawerVisible = ref(false)
const drawerLines   = ref([])
const drawerAudit   = ref([])
const drawerTitle   = ref('')
const drawerLoading = ref(false)

async function toggleLines(invoiceNo) {
  drawerTitle.value   = `Lines — ${invoiceNo}`
  drawerVisible.value = true
  drawerLoading.value = true
  try {
    const [docRes, auditRes] = await Promise.all([
      invoicesApi.get(invoiceNo),
      invoicesApi.audit(invoiceNo),
    ])
    drawerLines.value = docRes.data.lines
    drawerAudit.value = auditRes.data
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
</style>
