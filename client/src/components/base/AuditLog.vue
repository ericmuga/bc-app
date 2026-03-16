<template>
  <div v-if="log.length || hasPrintInfo" class="audit-wrap">
    <div class="audit-title">
      <i class="pi pi-history" />
      Audit trail
    </div>

    <!-- Printed by / printing time row (from BC) -->
    <div v-if="hasPrintInfo" class="audit-entry audit-entry--print">
      <div class="audit-event">
        <span class="audit-badge badge badge-print">Printed</span>
        <span class="text-muted text-sm">{{ header.BCUserId || '—' }}</span>
      </div>
      <div class="text-muted text-sm">{{ header.PrintingDatetime ? fmtDate(header.PrintingDatetime) : '—' }}</div>
    </div>

    <div
      v-for="entry in log"
      :key="entry.Id"
      class="audit-entry"
      :class="entryClass(entry.EventType)"
    >
      <div class="audit-event">
        <span class="audit-badge" :class="badgeClass(entry.EventType)">{{ label(entry.EventType) }}</span>
        <span class="text-muted text-sm">{{ entry.UserName || entry.UserId }}</span>
      </div>
      <div class="text-muted text-sm">{{ fmtDate(entry.OccurredAt) }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  log:    { type: Array,  default: () => [] },
  header: { type: Object, default: null },
})

const hasPrintInfo = computed(() => props.header && (props.header.BCUserId || props.header.PrintingDatetime))

const labels = {
  OrderReceived:    'Received',
  OrderConfirmed:   'Confirmed',
  OrderCopy:        'COPY',
  InvoiceReceived:  'Received',
  InvoiceConfirmed: 'Confirmed',
  InvoiceCopy:      'COPY',
}
const label = (t) => labels[t] || t

function badgeClass(t) {
  if (t.endsWith('Copy'))      return 'badge badge-copy'
  if (t.endsWith('Confirmed')) return 'badge badge-confirmed'
  return 'badge badge-open'
}
function entryClass(t) {
  return t.endsWith('Copy') ? 'audit-entry--copy' : ''
}
function fmtDate(v) {
  return new Date(v).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}
</script>

<style scoped>
.audit-wrap {
  margin-top: 16px;
  border: 1px solid var(--bc-border);
  border-radius: 8px;
  overflow: hidden;
}
.audit-title {
  background: var(--bc-surface-raised);
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bc-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.audit-entry {
  padding: 8px 14px;
  border-top: 1px solid var(--bc-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.audit-entry--copy  { background: var(--bc-warning-bg); }
.audit-entry--print { background: var(--bc-surface-raised); }
.audit-event { display: flex; align-items: center; gap: 10px; }
.badge-print { background: var(--bc-primary); color: #fff; }
</style>
