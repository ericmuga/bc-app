<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Daily Stock Movements</h2>
        <p class="text-muted text-sm">All items that transacted during the filtered period — per item per day. Type an Item No to filter to a single item.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
        <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="exportCsv" :loading="exporting" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <div class="filters">
      <div class="filter-field">
        <label>View</label>
        <SelectButton v-model="view" :options="viewOptions" option-label="label" option-value="value" :allowEmpty="false" @change="load" />
      </div>
      <div v-if="canSwitchShop" class="filter-field">
        <label>Shop</label>
        <Select v-model="shopCode" :options="shops" option-label="Name" option-value="Code"
                placeholder="Select shop…" filter @change="onShopChange" />
      </div>
      <div class="filter-field">
        <label>From</label>
        <DatePicker v-model="dateFrom" date-format="yy-mm-dd" />
      </div>
      <div class="filter-field">
        <label>To</label>
        <DatePicker v-model="dateTo" date-format="yy-mm-dd" />
      </div>
      <div class="filter-field" style="flex:1">
        <label>Item No (drill-in, optional)</label>
        <InputText v-model="itemFilter" placeholder="Type an exact Item No to filter to a single item" />
      </div>
      <Button label="Run" icon="pi pi-play" @click="load" :loading="loading" />
    </div>

    <div class="list-search">
      <InputText v-model="ledgerFilters.global.value" placeholder="Search all columns…" style="min-width:280px" />
      <span class="text-muted text-sm">{{ (view === 'ledger' ? ledgerRows.length : rows.length) }} row(s)</span>
    </div>

    <!-- Ledger: chronological, running balance, per-column filterable + sortable -->
    <DataTable v-if="view === 'ledger'" :value="ledgerRows" dataKey="key" size="small" :loading="loading"
      responsive-layout="scroll" :paginator="true" :rows="100" removableSort
      v-model:filters="ledgerFilters" filterDisplay="row"
      :globalFilterFields="['itemNo','description','type','referenceNo','notes']"
      :pt="{ table: { class: 'movements-table' } }" table-style="min-width: 1100px">
      <Column field="date" header="Date" sortable header-style="width:110px" :showFilterMenu="false">
        <template #body="{ data }">{{ fmtDate(data.date) }}</template>
      </Column>
      <Column field="itemNo" header="Item No" sortable header-style="width:120px" :showFilterMenu="false">
        <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Item" style="width:100%" /></template>
      </Column>
      <Column field="description" header="Description" sortable header-style="min-width:200px" :showFilterMenu="false">
        <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Description" style="width:100%" /></template>
      </Column>
      <Column field="type" header="Type" sortable header-style="width:120px" :showFilterMenu="false">
        <template #body="{ data }"><span :class="typeClass(data.type)">{{ typeLabel(data.type) }}</span></template>
        <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Type" style="width:100%" /></template>
      </Column>
      <Column field="referenceNo" header="Reference" sortable header-style="width:130px" :showFilterMenu="false">
        <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Ref" style="width:100%" /></template>
      </Column>
      <Column field="qtyIn" header="In" sortable header-style="width:90px;text-align:right" body-style="text-align:right">
        <template #body="{ data }"><span class="num pos">{{ data.qtyIn ? n(data.qtyIn) : '' }}</span></template>
      </Column>
      <Column field="qtyOut" header="Out" sortable header-style="width:90px;text-align:right" body-style="text-align:right">
        <template #body="{ data }"><span class="num neg">{{ data.qtyOut ? n(data.qtyOut) : '' }}</span></template>
      </Column>
      <Column field="balance" header="Balance" sortable header-style="width:100px;text-align:right" body-style="text-align:right">
        <template #body="{ data }"><strong>{{ n(data.balance) }}</strong></template>
      </Column>
    </DataTable>

    <!-- Daily buckets (original) -->
    <DataTable v-else :value="filteredRows" dataKey="key" size="small" :loading="loading"
      responsive-layout="scroll" :paginator="true" :rows="50" sort-field="date" sort-mode="multiple"
      :pt="{ table: { class: 'movements-table' } }"
      table-style="min-width: 1100px">
      <Column field="date"        header="Date"        header-style="width:120px;text-align:left"  body-style="width:120px;text-align:left">
        <template #body="{ data }">{{ fmtDate(data.date) }}</template>
      </Column>
      <Column field="itemNo"      header="Item No"     header-style="width:130px;text-align:left"  body-style="width:130px;text-align:left" />
      <Column field="description" header="Description" header-style="min-width:200px;text-align:left" body-style="min-width:200px;text-align:left" />
      <Column field="opening"     header="Opening"     header-style="width:110px;text-align:right" body-style="width:110px;text-align:right">
        <template #body="{ data }">{{ n(data.opening) }}</template>
      </Column>
      <Column field="transferIn"  header="Transfer In" header-style="width:110px;text-align:right" body-style="width:110px;text-align:right">
        <template #body="{ data }"><span class="num pos">{{ n(data.transferIn) }}</span></template>
      </Column>
      <Column field="positiveAdj" header="+ Adj"       header-style="width:100px;text-align:right" body-style="width:100px;text-align:right">
        <template #body="{ data }"><span class="num pos">{{ n(data.positiveAdj) }}</span></template>
      </Column>
      <Column field="produceIn"   header="Produced"    header-style="width:100px;text-align:right" body-style="width:100px;text-align:right">
        <template #body="{ data }"><span class="num pos">{{ n(data.produceIn) }}</span></template>
      </Column>
      <Column field="sales"       header="Sales"       header-style="width:110px;text-align:right" body-style="width:110px;text-align:right">
        <template #body="{ data }"><span class="num neg">{{ n(data.sales) }}</span></template>
      </Column>
      <Column field="consumeOut"  header="Consumed"    header-style="width:100px;text-align:right" body-style="width:100px;text-align:right">
        <template #body="{ data }"><span class="num neg">{{ n(data.consumeOut) }}</span></template>
      </Column>
      <Column field="negativeAdj" header="− Adj"       header-style="width:100px;text-align:right" body-style="width:100px;text-align:right">
        <template #body="{ data }"><span class="num neg">{{ n(data.negativeAdj) }}</span></template>
      </Column>
      <Column field="closing"     header="Closing"     header-style="width:110px;text-align:right" body-style="width:110px;text-align:right">
        <template #body="{ data }"><strong>{{ n(data.closing) }}</strong></template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button     from 'primevue/button'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import InputText  from 'primevue/inputtext'
import Select     from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Message    from 'primevue/message'
import { stockApi, posApi, setAdminShopCode, getAdminShopCode } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'

const auth = useAuthStore()
const today = new Date()

// Shop scope — managers (admin/shop-admin) can pick which shop's movements to view;
// cashiers are auto-scoped to their own shop by the server. Without a selection an
// admin has no shop context, so the report returns "shopCode required".
const shops    = ref([])
const shopCode = ref(getAdminShopCode() || '')
const canSwitchShop = computed(() => shops.value.length > 1)
async function loadShops() {
  try { shops.value = (await posApi.listMyShops()).data || [] } catch { shops.value = [] }
  if (!shopCode.value && shops.value.length) { shopCode.value = shops.value[0].Code; setAdminShopCode(shopCode.value, { perTab: true }) }
}
function onShopChange() { setAdminShopCode(shopCode.value, { perTab: true }); load() }

// Default to a single-day view (today) — broaden the range as needed.
const dateFrom = ref(today)
const dateTo   = ref(today)
const itemFilter = ref('')

const rows    = ref([])          // daily-bucket rows
const ledgerRows = ref([])       // chronological ledger rows
const loading = ref(false)
const error   = ref('')

// Default to the ledger view (chronological, running balance).
const view = ref('ledger')
const viewOptions = [
  { label: 'Ledger',  value: 'ledger' },
  { label: 'Daily',   value: 'daily'  },
]
const ledgerFilters = ref({
  global:      { value: null, matchMode: 'contains' },
  itemNo:      { value: null, matchMode: 'contains' },
  description: { value: null, matchMode: 'contains' },
  type:        { value: null, matchMode: 'contains' },
  referenceNo: { value: null, matchMode: 'contains' },
})

// Friendly labels + colour for the movement types shown in the ledger.
const TYPE_LABELS = {
  'sale': 'Sale', 'transfer-in': 'Transfer In', 'positive-adj': '+ Adj', 'negative-adj': '− Adj',
  'produce-in': 'Produced', 'consume-out': 'Consumed', 'reset': 'Reset', 'bc-load': 'BC Load',
  'bc-adjust-in': 'BC Adj', 'bc-adjust-out': 'BC Adj',
}
function typeLabel(t) { return TYPE_LABELS[t] || t }
function typeClass(t) {
  if (['sale', 'consume-out', 'negative-adj', 'bc-adjust-out'].includes(t)) return 'chip chip-out'
  return 'chip chip-in'
}

const filteredRows = computed(() => rows.value)

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-KE')
}
function n(v) { return Number(v || 0).toFixed(2) }

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function load() {
  loading.value = true; error.value = ''
  try {
    const params = {
      dateFrom: isoDate(dateFrom.value),
      dateTo:   isoDate(dateTo.value),
    }
    // Send the filter as an exact item No to switch the report to per-item mode.
    if (itemFilter.value.trim()) params.itemNo = itemFilter.value.trim().toUpperCase()
    if (view.value === 'ledger') {
      const { data } = await stockApi.ledger(params)
      ledgerRows.value = data.map((r, i) => ({ ...r, key: `${r.itemNo}_${r.referenceNo || ''}_${i}` }))
    } else {
      const { data } = await stockApi.dailyReport(params)
      rows.value = data.map((r, i) => ({ ...r, key: `${r.itemNo || 'shop'}_${r.date}_${i}` }))
    }
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loading.value = false
  }
}

const exporting = ref(false)
function downloadCsvString(csv, name) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function exportCsv() {
  exporting.value = true; error.value = ''
  try {
    const params = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value) }
    if (itemFilter.value.trim()) params.itemNo = itemFilter.value.trim().toUpperCase()
    if (view.value === 'ledger') {
      const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
      const head = ['Date', 'Item No', 'Description', 'Type', 'Reference', 'In', 'Out', 'Balance']
      const lines = [head.join(',')]
      for (const r of ledgerRows.value) {
        lines.push([isoDate(new Date(r.date)), r.itemNo, r.description, typeLabel(r.type), r.referenceNo,
                    r.qtyIn || '', r.qtyOut || '', r.balance].map(esc).join(','))
      }
      downloadCsvString(lines.join('\n'), `stock-ledger-${params.dateFrom}_${params.dateTo}.csv`)
    } else {
      const res = await stockApi.dailyReportCsv(params)
      downloadCsvString(res.data, `stock-movements-${params.dateFrom}_${params.dateTo}.csv`)
    }
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    exporting.value = false
  }
}

onMounted(async () => { await loadShops(); await load() })
</script>

<style scoped>
.stock-page { padding: 16px 20px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; }
.text-sm    { font-size:13px; }
.mb-3       { margin-bottom:12px; }

.filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin-bottom: 14px; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }

.num.pos { color:#15803d; }
.num.neg { color:#b91c1c; }
:deep(.movements-table) { font-size: 12px; }

.list-search { display:flex; align-items:center; gap:10px; margin:0 0 10px; }
.list-search :deep(.p-inputtext) { min-width:280px; }

.chip { display:inline-block; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; }
.chip-in  { background:#dcfce7; color:#15803d; }
.chip-out { background:#fee2e2; color:#b91c1c; }
</style>
