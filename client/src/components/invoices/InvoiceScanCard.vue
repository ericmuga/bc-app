<template>
  <BaseScanCard
    :get-fn="invoicesApi.get"
    :confirm-fn="invoicesApi.confirm"
    :audit-fn="invoicesApi.audit"
    doc-no-field="InvoiceNo"
    doc-type="Invoice"
    placeholder="Scan or enter Invoice No…"
    @confirmed="emit('confirmed', $event)"
    @copy-logged="emit('copy-logged', $event)"
  >
    <template #header-fields="{ header }">
      <div class="field">
        <span class="label">Invoice No</span>
        <span class="mono" style="font-weight:700;font-size:15px">{{ header.InvoiceNo }}</span>
      </div>
      <div class="field">
        <span class="label">Original Order</span>
        <span class="mono text-muted">{{ header.OriginalOrderNo }}</span>
      </div>
      <div class="field">
        <span class="label">Customer</span>
        <span>{{ header.CustomerName }}</span>
        <span class="text-muted text-sm">{{ header.CustomerNo }}</span>
      </div>
      <div class="field">
        <span class="label">Invoiced At</span>
        <span>{{ fmtDate(header.InvoicedAt) }}</span>
      </div>
      <div class="field">
        <span class="label">E-TIMS No</span>
        <span class="mono">{{ header.ETIMSInvoiceNo || '—' }}</span>
      </div>
      <div class="field">
        <span class="label">Salesperson</span>
        <span>{{ header.SalespersonCode || '—' }}</span>
      </div>
      <div class="field">
        <span class="label">Route</span>
        <span>{{ header.RouteCode || '—' }}</span>
      </div>
      <div class="field">
        <span class="label">Sector</span>
        <span>{{ header.SectorCode || '—' }}</span>
      </div>
    </template>
  </BaseScanCard>
</template>

<script setup>
import BaseScanCard from '@/components/base/BaseScanCard.vue'
import { invoicesApi } from '@/services/api.js'

const emit = defineEmits(['confirmed', 'copy-logged'])
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-KE') : '—'
</script>

<style scoped>
.field { display:flex; flex-direction:column; gap:3px; }
.label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--bc-text-muted); }
</style>
