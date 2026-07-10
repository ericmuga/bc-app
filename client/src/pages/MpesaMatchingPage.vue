<template>
  <div class="mm-page">
    <header class="page-head">
      <h2><i class="pi pi-money-bill" /> M-Pesa Reconciliation</h2>
      <p class="text-muted text-sm">Match M-Pesa confirmation codes to invoices, and see how each payment is utilised.</p>
    </header>

    <section class="mm-toolbar">
      <div class="f-field">
        <label>From</label>
        <input type="date" v-model="filter.from" />
      </div>
      <div class="f-field">
        <label>To</label>
        <input type="date" v-model="filter.to" />
      </div>
      <SelectButton v-model="view" :options="views" option-label="label" option-value="value" :allowEmpty="false" />
      <Button label="Run" icon="pi pi-search" size="small" :loading="loading" @click="load" />
      <span class="text-muted text-sm" style="margin-left:auto">{{ rows.length }} rows</span>
    </section>

    <Message v-if="error" severity="error" :closable="true" @close="error=null">{{ error }}</Message>

    <!-- Invoice → Payments -->
    <DataTable v-if="view === 'invoice'" :value="rows" :loading="loading" dataKey="_k" size="small"
               stripedRows paginator :rows="50" :rowsPerPageOptions="[25,50,100,200]"
               rowGroupMode="subheader" groupRowsBy="OrderNo" sortField="OrderNo" :sortOrder="1">
      <template #groupheader="{ data }">
        <span class="grp"><i class="pi pi-file" /> <strong>{{ data.OrderNo }}</strong>
          <span class="text-muted">· {{ data.InvoiceNo || 'no KRA inv' }} · {{ data.ContactName || 'Walk-in' }}
            · total {{ fmt(data.TotalAmount) }} · {{ data.OrderStatus }}</span>
        </span>
      </template>
      <Column field="MpesaCode" header="M-Pesa Code" style="min-width:120px" />
      <Column field="PayerName" header="Payer" style="min-width:140px"><template #body="{ data }">{{ data.PayerName || '—' }}</template></Column>
      <Column field="Phone" header="Phone" style="width:120px" />
      <Column field="AppliedAmount" header="Applied" style="width:100px" bodyStyle="text-align:right"><template #body="{ data }">{{ fmt(data.AppliedAmount) }}</template></Column>
      <Column field="MpesaAmount" header="Txn Amount" style="width:110px" bodyStyle="text-align:right"><template #body="{ data }">{{ fmt(data.MpesaAmount) }}</template></Column>
      <Column field="TransTime" header="Paid At" style="width:160px"><template #body="{ data }">{{ fmtDate(data.TransTime) }}</template></Column>
      <template #empty><div class="empty">No M-Pesa applications in this range.</div></template>
    </DataTable>

    <!-- Payment → Invoices -->
    <DataTable v-else :value="rows" :loading="loading" dataKey="MpesaCode" size="small"
               stripedRows paginator :rows="50" :rowsPerPageOptions="[25,50,100,200]">
      <Column field="MpesaCode" header="M-Pesa Code" style="min-width:120px" />
      <Column field="PayerName" header="Payer" style="min-width:140px"><template #body="{ data }">{{ data.PayerName || '—' }}</template></Column>
      <Column field="Phone" header="Phone" style="width:120px" />
      <Column field="MpesaAmount" header="Txn Amount" style="width:110px" bodyStyle="text-align:right"><template #body="{ data }">{{ fmt(data.MpesaAmount) }}</template></Column>
      <Column field="Applied" header="Applied" style="width:100px" bodyStyle="text-align:right"><template #body="{ data }">{{ fmt(data.Applied) }}</template></Column>
      <Column field="Balance" header="Balance" style="width:100px" bodyStyle="text-align:right">
        <template #body="{ data }"><span :class="{ 'bal-pos': data.Balance > 0.009 }">{{ fmt(data.Balance) }}</span></template>
      </Column>
      <Column field="InvoiceCount" header="#Inv" style="width:60px" bodyStyle="text-align:right" />
      <Column field="Invoices" header="Invoices (applied)" style="min-width:220px" />
      <Column field="TransTime" header="Paid At" style="width:160px"><template #body="{ data }">{{ fmtDate(data.TransTime) }}</template></Column>
      <template #empty><div class="empty">No linked M-Pesa payments in this range.</div></template>
    </DataTable>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { posSetupApi } from '@/services/pos.js'

const views = [
  { label: 'Invoice → Payments', value: 'invoice' },
  { label: 'Payments → Invoice', value: 'payment' },
]
const view = ref('invoice')
const today = new Date().toISOString().slice(0, 10)
const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
const filter = reactive({ from: monthAgo, to: today })
const rows = ref([])
const loading = ref(false)
const error = ref(null)

async function load() {
  loading.value = true; error.value = null
  try {
    const params = { from: filter.from || undefined, to: filter.to || undefined }
    const res = view.value === 'invoice'
      ? await posSetupApi.mpesaInvoiceReport(params)
      : await posSetupApi.mpesaPaymentReport(params)
    // rowGroup needs a stable key per row for the invoice view
    rows.value = (res.data || []).map((r, i) => ({ ...r, _k: `${r.OrderNo || r.MpesaCode}-${i}` }))
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

function fmt(v) { return Number(v || 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }) }
function fmtDate(v) { return v ? new Date(v).toLocaleString('en-KE') : '—' }

onMounted(load)
</script>

<style scoped>
.mm-page { padding: 4px 0 24px; }
.page-head h2 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.mm-toolbar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin: 10px 0; }
.f-field { display: flex; flex-direction: column; gap: 4px; }
.f-field label { font-size: 11px; font-weight: 600; color: var(--bc-text-muted); text-transform: uppercase; letter-spacing: .05em; }
.f-field input[type=date] { background: var(--bc-surface-card); color: var(--bc-text); border: 1px solid var(--bc-border);
  border-radius: 6px; padding: 6px 8px; color-scheme: dark; }
.grp { display: inline-flex; gap: 6px; align-items: center; }
.empty { padding: 24px; text-align: center; color: var(--bc-text-muted); }
.bal-pos { color: var(--bc-warning); font-weight: 700; }
</style>
