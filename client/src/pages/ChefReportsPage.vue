<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Kitchen Reports</h2>
        <p class="text-muted text-sm">Material consumption at cost, and cooked-product sales with tentative profitability (selling price vs standard recipe cost).</p>
      </div>
    </div>

    <div class="filters">
      <div class="tab-group">
        <Button :severity="tab==='consumption' ? 'primary' : 'secondary'" :outlined="tab!=='consumption'"
                label="Material consumption" icon="pi pi-shopping-bag" size="small" @click="tab='consumption'; run()" />
        <Button :severity="tab==='profit' ? 'primary' : 'secondary'" :outlined="tab!=='profit'"
                label="Product profitability" icon="pi pi-chart-line" size="small" @click="tab='profit'; run()" />
      </div>
      <div class="date-row">
        <DatePicker v-model="dateFrom" date-format="yy-mm-dd" placeholder="From" />
        <DatePicker v-model="dateTo"   date-format="yy-mm-dd" placeholder="To" />
        <Button label="Run" icon="pi pi-play" :loading="loading" @click="run" />
        <Button label="CSV" icon="pi pi-file-excel" severity="secondary" :disabled="!rows.length" @click="exportCsv" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <!-- Consumption -->
    <DataTable v-if="tab==='consumption'" :value="rows" size="small" :loading="loading" responsive-layout="scroll" paginator :rows="25">
      <Column field="itemNo" header="No" style="width:110px" sortable />
      <Column field="description" header="Raw material" style="min-width:220px" sortable />
      <Column field="uom" header="UoM" style="width:70px" />
      <Column field="qtyConsumed" header="Qty consumed" style="width:130px;text-align:right" sortable>
        <template #body="{data}">{{ n(data.qtyConsumed) }}</template>
      </Column>
      <Column field="unitCost" header="Unit cost" style="width:110px;text-align:right">
        <template #body="{data}">{{ n(data.unitCost) }}</template>
      </Column>
      <Column field="costValue" header="Cost value" style="width:130px;text-align:right" sortable>
        <template #body="{data}"><strong>{{ money(data.costValue) }}</strong></template>
      </Column>
    </DataTable>
    <div v-if="tab==='consumption' && rows.length" class="totals">
      Total material cost: <strong>{{ money(totalCost) }}</strong>
    </div>

    <!-- Profitability -->
    <DataTable v-if="tab==='profit'" :value="rows" size="small" :loading="loading" responsive-layout="scroll" paginator :rows="25">
      <Column field="itemNo" header="No" style="width:110px" sortable />
      <Column field="description" header="Cooked product" style="min-width:200px" sortable />
      <Column field="qtySold" header="Qty sold" style="width:100px;text-align:right" sortable>
        <template #body="{data}">{{ n(data.qtySold) }}</template>
      </Column>
      <Column field="revenue" header="Revenue" style="width:120px;text-align:right" sortable>
        <template #body="{data}">{{ money(data.revenue) }}</template>
      </Column>
      <Column field="stdUnitCost" header="Std unit cost" style="width:120px;text-align:right">
        <template #body="{data}">{{ n(data.stdUnitCost) }}</template>
      </Column>
      <Column field="materialCost" header="Material cost" style="width:120px;text-align:right" sortable>
        <template #body="{data}">{{ money(data.materialCost) }}</template>
      </Column>
      <Column field="margin" header="Margin" style="width:120px;text-align:right" sortable>
        <template #body="{data}"><strong :class="data.margin>=0 ? 'num pos':'num neg'">{{ money(data.margin) }}</strong></template>
      </Column>
      <Column field="marginPct" header="Margin %" style="width:90px;text-align:right">
        <template #body="{data}">{{ data.marginPct==null ? '—' : n(data.marginPct)+'%' }}</template>
      </Column>
    </DataTable>
    <div v-if="tab==='profit' && rows.length" class="totals">
      Revenue <strong>{{ money(totals.revenue) }}</strong> · Material cost <strong>{{ money(totals.materialCost) }}</strong> ·
      Margin <strong :class="totals.margin>=0 ? 'num pos':'num neg'">{{ money(totals.margin) }}</strong>
      <span class="text-muted text-sm"> — tentative: standard recipe cost, not actual consumption.</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Button    from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column    from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import Message   from 'primevue/message'
import { stockApi } from '@/services/pos.js'

const tab = ref('consumption')
const loading = ref(false); const error = ref('')
const rows = ref([]); const totalCost = ref(0)
const totals = ref({ revenue: 0, materialCost: 0, margin: 0 })

const today = new Date()
const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
const dateFrom = ref(weekAgo); const dateTo = ref(today)

function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
async function run() {
  loading.value = true; error.value = ''; rows.value = []
  const params = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value) }
  try {
    if (tab.value === 'consumption') {
      const { data } = await stockApi.chefConsumption(params)
      rows.value = data.rows; totalCost.value = data.totalCost
    } else {
      const { data } = await stockApi.chefProductProfit(params)
      rows.value = data.rows; totals.value = data.totals
    }
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { loading.value = false }
}
async function exportCsv() {
  const params = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value) }
  try {
    const res = tab.value === 'consumption'
      ? await stockApi.chefConsumptionCsv(params)
      : await stockApi.chefProductProfitCsv(params)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${tab.value}-${params.dateFrom}_${params.dateTo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}
function n(v) { return Number(v || 0).toFixed(2) }
function money(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
onMounted(run)
</script>

<style scoped>
.stock-page { padding: 16px 20px; }
.page-header { margin-bottom:12px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; } .text-sm { font-size:13px; } .mb-3 { margin-bottom:12px; }
.filters { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.tab-group, .date-row { display:flex; gap:8px; align-items:center; }
.totals { margin-top:10px; padding:8px 12px; background:#111827; color:#e5e7eb; border-radius:8px; font-size:14px; }
.num.pos { color:#34d399; } .num.neg { color:#f87171; }
.stock-page :deep(.p-datatable) { border:1px solid #374151; border-radius:8px; overflow:hidden; }
.stock-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; font-weight:700; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#232f3e !important; }
.stock-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
.stock-page :deep(.p-paginator) { background:#111827 !important; color:#e5e7eb !important; border:none; }
.stock-page :deep(.p-inputtext), .stock-page :deep(.p-datepicker-input) { background:#111827 !important; color:#e5e7eb !important; border-color:#374151 !important; color-scheme:dark; }
</style>
