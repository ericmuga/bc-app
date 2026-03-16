<template>
  <div class="page">
    <div class="page-header flex justify-between items-center">
      <div>
        <h2 class="page-title">Orders</h2>
        <p class="text-muted text-sm">All sales orders from Business Central</p>
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

    <!-- Table -->
    <div class="bc-card mt-4" style="padding:0;overflow:hidden">
      <DataTable
        :value="list.rows"
        :loading="list.loading"
        dataKey="OrderNo"
        row-hover
        paginator :rows="25" :rows-per-page-options="[10,25,50]"
        class="orders-table"
      >
        <template #empty>
          <div class="table-empty">No orders found</div>
        </template>

        <Column field="OrderNo" header="Order No" style="width:140px">
          <template #body="{ data }">
            <span class="mono link" @click="openScan(data.OrderNo)">{{ data.OrderNo }}</span>
          </template>
        </Column>
        <Column field="CustomerName"    header="Customer" />
        <Column field="SalespersonCode" header="Salesperson" style="width:120px" />
        <Column field="RouteCode"       header="Route"        style="width:90px" />
        <Column field="SectorCode"      header="Sector"       style="width:90px" />
        <Column field="OrderDate"       header="Date"          style="width:110px">
          <template #body="{ data }">{{ fmtDay(data.OrderDate) }}</template>
        </Column>
        <Column field="Status" header="Status" style="width:120px">
          <template #body="{ data }"><StatusBadge :status="data.Status" /></template>
        </Column>
        <Column header="Lines" style="width:80px">
          <template #body="{ data }">
            <Button icon="pi pi-list" text rounded size="small"
              @click="toggleLines(data.OrderNo)" v-tooltip="'Show lines'" />
          </template>
        </Column>
        <Column header="Action" style="width:130px">
          <template #body="{ data }">
            <Button
              v-if="data.Status === 'Open'"
              label="Confirm" icon="pi pi-check"
              size="small" severity="success"
              :loading="confirmingNo === data.OrderNo"
              @click="quickConfirm(data)"
            />
            <span v-else class="text-muted text-sm">—</span>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Lines drawer -->
    <Drawer v-model:visible="drawerVisible" position="right" style="width:640px" :header="drawerTitle">
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
import { ref } from 'vue'
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
import { ordersApi } from '@/services/api.js'
import { useDocumentList }    from '@/composables/useDocumentList.js'
import { useConfirmDocument } from '@/composables/useConfirmDocument.js'
import { exportCsv, todayStr } from '@/utils/exportCsv.js'
import { watchDebounced }     from '@/composables/useDebounce.js'

const router = useRouter()

// list.rows and list.loading are plain refs - no extra .value in template
const list = useDocumentList(ordersApi.list)
list.load()

watchDebounced(() => list.filters.q, () => list.load(), 50)

const statuses = [
  { label: 'Open',      value: 'Open' },
  { label: 'Confirmed', value: 'Confirmed' },
]

function doExport() {
  exportCsv(`orders-${todayStr()}.csv`, list.rows, [
    { key: 'OrderNo',         label: 'Order No' },
    { key: 'CustomerNo',      label: 'Customer No' },
    { key: 'CustomerName',    label: 'Customer' },
    { key: 'SalespersonCode', label: 'Salesperson' },
    { key: 'RouteCode',       label: 'Route' },
    { key: 'SectorCode',      label: 'Sector' },
    { key: 'OrderDate',       label: 'Order Date' },
    { key: 'Status',          label: 'Status' },
  ])
}

// Drawer state
const drawerVisible = ref(false)
const drawerLines   = ref([])
const drawerAudit   = ref([])
const drawerTitle   = ref('')
const drawerLoading = ref(false)

async function toggleLines(orderNo) {
  drawerTitle.value   = `Lines — ${orderNo}`
  drawerVisible.value = true
  drawerLoading.value = true
  try {
    const [docRes, auditRes] = await Promise.all([
      ordersApi.get(orderNo),
      ordersApi.audit(orderNo),
    ])
    drawerLines.value = docRes.data.lines
    drawerAudit.value = auditRes.data
  } finally {
    drawerLoading.value = false
  }
}

// Per-row confirm loading indicator
const confirmingNo = ref(null)
const { confirm }  = useConfirmDocument(
  (no) => ordersApi.confirm(no),
  (no) => ordersApi.audit(no),
  'Order'
)

async function quickConfirm(row) {
  confirmingNo.value = row.OrderNo
  try {
    const result = await confirm(row.OrderNo)
    if (result.confirmed || result.copy) list.load()
  } finally {
    confirmingNo.value = null
  }
}

function openScan(no) { router.push({ name: 'OrderScan', query: { no } }) }

const fmtDay = (v) => v ? new Date(v).toLocaleDateString('en-KE') : '—'
</script>

<style scoped>
.page-header  { margin-bottom: 20px; }
.page-title   { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
.filters-bar  { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 16px; }
.table-empty  { text-align: center; padding: 40px; color: var(--bc-text-muted); }
.link         { cursor: pointer; color: var(--bc-primary-light); text-decoration: underline; text-decoration-style: dotted; }
.orders-table { font-size: 13px; }
</style>
