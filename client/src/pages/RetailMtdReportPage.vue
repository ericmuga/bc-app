<template>
  <div class="retail-mtd-page">
    <div class="page-header">
      <h2><i class="pi pi-shop" /> Retail MTD</h2>
      <div class="page-header-actions">
        <label class="slicer-label">As of</label>
        <DatePicker v-model="asOfDate" date-format="yy-mm-dd" show-icon @update:model-value="load" />
        <Button icon="pi pi-refresh" text :loading="loading" @click="load" />
      </div>
    </div>
    <p class="text-muted text-sm">
      Retail channel across FCL, CM and RMK (Sector-filtered), month-to-date vs prior year and vs target.
      Region and Category come from the admin-editable remap in Admin Setup → Retail MTD Dimensions.
    </p>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <Card v-if="summary" class="overall-card">
      <template #title>Retail — {{ summary.month }}</template>
      <template #content>
        <div class="metric-row">
          <div class="metric"><span class="metric-label">Vol (Kgs)</span><span class="metric-value">{{ fmtNum(summary.overall.volMTD) }}</span></div>
          <div class="metric"><span class="metric-label">Value (Lcy)</span><span class="metric-value">{{ fmtNum(summary.overall.valMTD) }}</span></div>
          <div class="metric"><span class="metric-label">Price/Kilo</span><span class="metric-value">{{ fmtNum(summary.overall.priceMTD) }}</span></div>
          <div class="metric"><span class="metric-label">Vs PY (Value)</span><span class="metric-value" :class="pctClass(summary.overall.valVsPyPct)">{{ fmtPct(summary.overall.valVsPyPct) }}</span></div>
          <div class="metric"><span class="metric-label">Vs Target (Value)</span><span class="metric-value" :class="pctClass(summary.overall.valVsTargetPct)">{{ fmtPct(summary.overall.valVsTargetPct) }}</span></div>
        </div>
      </template>
    </Card>

    <Card class="table-card">
      <template #title>By Region</template>
      <template #content>
        <DataTable :value="summary?.byRegion || []" size="small" :loading="loading" responsive-layout="scroll">
          <Column field="key" header="Region" style="min-width:140px" />
          <Column header="Vol(Kgs)"><template #body="{ data }">{{ fmtNum(data.volMTD) }}</template></Column>
          <Column header="Value(Lcy)"><template #body="{ data }">{{ fmtNum(data.valMTD) }}</template></Column>
          <Column header="Price/Kilo"><template #body="{ data }">{{ fmtNum(data.priceMTD) }}</template></Column>
          <Column header="Vs PY"><template #body="{ data }"><span :class="pctClass(data.valVsPyPct)">{{ fmtPct(data.valVsPyPct) }}</span></template></Column>
          <Column header="Vs Target"><template #body="{ data }"><span :class="pctClass(data.valVsTargetPct)">{{ fmtPct(data.valVsTargetPct) }}</span></template></Column>
        </DataTable>
      </template>
    </Card>

    <Card class="table-card">
      <template #title>By Category</template>
      <template #content>
        <DataTable :value="summary?.byCategory || []" size="small" :loading="loading" responsive-layout="scroll">
          <Column field="key" header="Category" style="min-width:160px" />
          <Column header="Vol(Kgs)"><template #body="{ data }">{{ fmtNum(data.volMTD) }}</template></Column>
          <Column header="Value(Lcy)"><template #body="{ data }">{{ fmtNum(data.valMTD) }}</template></Column>
          <Column header="Price/Kilo"><template #body="{ data }">{{ fmtNum(data.priceMTD) }}</template></Column>
          <Column header="Vs PY"><template #body="{ data }"><span :class="pctClass(data.valVsPyPct)">{{ fmtPct(data.valVsPyPct) }}</span></template></Column>
          <Column header="Vs Target"><template #body="{ data }"><span :class="pctClass(data.valVsTargetPct)">{{ fmtPct(data.valVsTargetPct) }}</span></template></Column>
        </DataTable>
      </template>
    </Card>

    <Card class="table-card">
      <template #title>Top 20 Customers</template>
      <template #content>
        <DataTable :value="summary?.byCustomer || []" size="small" :loading="loading" responsive-layout="scroll">
          <Column field="key" header="Customer" style="min-width:220px" />
          <Column header="Vol(Kgs)"><template #body="{ data }">{{ fmtNum(data.volMTD) }}</template></Column>
          <Column header="Value(Lcy)"><template #body="{ data }">{{ fmtNum(data.valMTD) }}</template></Column>
          <Column header="Price/Kilo"><template #body="{ data }">{{ fmtNum(data.priceMTD) }}</template></Column>
          <Column header="Vs PY"><template #body="{ data }"><span :class="pctClass(data.valVsPyPct)">{{ fmtPct(data.valVsPyPct) }}</span></template></Column>
        </DataTable>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { retailMtdApi } from '@/services/retailMtd.js'

const asOfDate = ref(new Date())
const summary  = ref(null)
const loading  = ref(false)
const error    = ref('')

function fmtNum(v) { return (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) }
function fmtPct(v) { return v == null ? '—' : `${(v * 100).toFixed(1)}%` }
function pctClass(v) { return v == null ? '' : (v >= 0 ? 'text-green-500' : 'text-red-400') }

async function load() {
  loading.value = true; error.value = ''
  try {
    const iso = asOfDate.value instanceof Date ? asOfDate.value.toISOString().slice(0, 10) : asOfDate.value
    const { data } = await retailMtdApi.summary(iso)
    summary.value = data
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.retail-mtd-page { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; }
.page-header-actions { display: flex; align-items: center; gap: 10px; }
.metric-row { display: flex; gap: 24px; flex-wrap: wrap; }
.metric { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
.metric-label { font-size: 0.8rem; color: var(--p-text-muted-color, #888); }
.metric-value { font-size: 1.25rem; font-weight: 600; }
.error-banner { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; }
</style>
