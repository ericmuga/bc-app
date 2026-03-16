<template>
  <BaseScanCard
    :get-fn="ordersApi.get"
    :confirm-fn="ordersApi.confirm"
    :audit-fn="ordersApi.audit"
    doc-no-field="OrderNo"
    doc-type="Order"
    placeholder="Scan or enter Order No (e.g. SO-00123)…"
    @confirmed="emit('confirmed', $event)"
    @copy-logged="emit('copy-logged', $event)"
  >
    <template #header-fields="{ header }">
      <div class="field">
        <span class="label">Order No</span>
        <span class="mono" style="font-weight:700;font-size:15px">{{ header.OrderNo }}</span>
      </div>
      <div class="field">
        <span class="label">Customer</span>
        <span>{{ header.CustomerName }}</span>
        <span class="text-muted text-sm">{{ header.CustomerNo }}</span>
      </div>
      <div class="field">
        <span class="label">Order Date</span>
        <span>{{ fmtDay(header.OrderDate) }}</span>
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
import { ordersApi } from '@/services/api.js'

const emit = defineEmits(['confirmed', 'copy-logged'])
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'
</script>

<style scoped>
.field { display:flex; flex-direction:column; gap:3px; }
.label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--bc-text-muted); }
</style>
