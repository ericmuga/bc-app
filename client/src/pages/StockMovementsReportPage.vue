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

    <DataTable :value="filteredRows" dataKey="key" size="small" :loading="loading"
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
      <Column field="sales"       header="Sales"       header-style="width:110px;text-align:right" body-style="width:110px;text-align:right">
        <template #body="{ data }"><span class="num neg">{{ n(data.sales) }}</span></template>
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
import Message    from 'primevue/message'
import { stockApi } from '@/services/pos.js'

const today = new Date()

// Default to a single-day view (today) — broaden the range as needed.
const dateFrom = ref(today)
const dateTo   = ref(today)
const itemFilter = ref('')

const rows    = ref([])
const loading = ref(false)
const error   = ref('')

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
    const { data } = await stockApi.dailyReport(params)
    rows.value = data.map((r, i) => ({ ...r, key: `${r.itemNo || 'shop'}_${r.date}_${i}` }))
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loading.value = false
  }
}

const exporting = ref(false)
async function exportCsv() {
  exporting.value = true; error.value = ''
  try {
    const params = {
      dateFrom: isoDate(dateFrom.value),
      dateTo:   isoDate(dateTo.value),
    }
    if (itemFilter.value.trim()) params.itemNo = itemFilter.value.trim().toUpperCase()
    const res = await stockApi.dailyReportCsv(params)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-movements-${params.dateFrom}_${params.dateTo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    exporting.value = false
  }
}

onMounted(load)
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
</style>
