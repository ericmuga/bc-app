<template>
  <div class="asm-page">
    <div class="asm-head">
      <div>
        <h2>Assembly</h2>
        <p class="sub">Assemble items for your assigned orders. Capture a return reason when the assembled quantity differs from the order.</p>
      </div>
      <div class="head-actions">
        <Select v-if="isElevated" v-model="viewAs" :options="assemblers" option-label="name" option-value="userId"
                show-clear placeholder="View as assembler…" class="view-as" filter @change="loadList" />
        <Button icon="pi pi-refresh" size="small" severity="secondary" :loading="loading" @click="reload" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Worklist -->
    <div v-if="!order">
      <div v-if="!loading && !orders.length" class="empty">No orders pending assembly{{ viewAs ? ' for this assembler' : '' }}.</div>
      <div class="cards">
        <button v-for="o in orders" :key="o.DispatchOrderId" class="ord-card" @click="openOrder(o)">
          <div class="oc-top"><span class="oc-no">{{ o.DispatchNo }}</span><span class="oc-co">{{ o.Company }}</span></div>
          <div class="oc-cust">{{ o.CustomerName }}</div>
          <div class="oc-meta">
            <span class="oc-parts">{{ o.MyAssembled }}/{{ o.MyParts }} of my parts</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Order detail -->
    <div v-else class="detail">
      <div class="det-bar">
        <Button icon="pi pi-arrow-left" label="Back" text size="small" @click="closeOrder" />
        <div class="det-title">{{ order.DispatchNo }} · {{ order.CustomerName }} <span class="muted">({{ order.Company }})</span></div>
      </div>

      <div class="scan-row">
        <i class="pi pi-qrcode" />
        <InputText ref="scanBox" v-model="scan" placeholder="Scan / type item barcode or number…" class="scan-input"
                   @keyup.enter="onScan" />
      </div>

      <div v-for="p in activeParts" :key="p.Part" class="part-block">
        <div class="part-head">
          <span class="part-badge" :class="{ done: p.Assembled }">Part {{ p.Part }}</span>
          <span v-if="p.Assembled" class="part-done"><i class="pi pi-check-circle" /> assembled by {{ p.AssembledByName || '—' }}</span>
          <Button v-else label="Mark part assembled" size="small" icon="pi pi-check" class="mark-btn"
                  :loading="busyPart === p.Part" @click="markPart(p.Part)" />
        </div>
        <div class="line-cards">
          <div v-for="l in linesOfPart(p.Part)" :key="l.LineId" class="line-card"
               :class="{ hl: highlight === l.LineId, short: isShort(l), done: p.Assembled }">
            <div class="lc-head">
              <span class="lc-item">{{ l.ItemNo }}</span>
              <span class="lc-ord">ordered {{ fmt(l.OrderQty) }} {{ l.Uom }}</span>
            </div>
            <div class="lc-desc">{{ l.Description }}</div>
            <div class="lc-inputs">
              <div class="lci"><label>Assembled</label>
                <InputNumber v-model="l._qty" :min="0" :maxFractionDigits="4" inputClass="qty-in" :disabled="p.Assembled" showButtons buttonLayout="horizontal" /></div>
              <div v-if="l.IsWeighted" class="lci"><label>Weight (kg)</label>
                <InputNumber v-model="l._wt" :min="0" :maxFractionDigits="4" inputClass="qty-in" :disabled="p.Assembled" /></div>
              <Button class="lc-save" icon="pi pi-save" label="Save" size="small" :disabled="p.Assembled" :loading="l._busy" @click="saveLine(l)" />
            </div>
            <div v-if="isShort(l)" class="lc-reason">
              <label>Return reason (qty differs)</label>
              <Select v-model="l._rc" :options="returnReasons" option-label="label" option-value="code"
                      placeholder="Select reason…" filter fluid :disabled="p.Assembled" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { dispatchApi } from '@/services/dispatch.js'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Message from 'primevue/message'

const auth = useAuthStore()
const toast = useToast()
const isElevated = computed(() => ['admin', 'dispatch-supervisor'].includes(String(auth.effectiveRole || '').toLowerCase()))

const orders = ref([])
const assemblers = ref([])
const viewAs = ref(null)
const order = ref(null)
const returnReasons = ref([])
const loading = ref(false)
const error = ref(null)
const busyPart = ref(null)
const scan = ref('')
const highlight = ref(null)
const scanBox = ref(null)

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 4 })
const activeParts = computed(() => (order.value?.parts || []).filter(p => p.Active))
const linesOfPart = (part) => (order.value?.lines || []).filter(l => (l.Part || '') === part)
const anyWeighted = (part) => linesOfPart(part).some(l => l.IsWeighted)
const isShort = (l) => l._qty != null && Number(l._qty) !== Number(l.OrderQty)

async function loadList() {
  loading.value = true; error.value = null
  try { orders.value = (await dispatchApi.assembly(viewAs.value)).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}
function reload() { order.value ? openOrder(order.value) : loadList() }

async function openOrder(row) {
  error.value = null
  try {
    const data = (await dispatchApi.assemblyOrder(row.DispatchOrderId)).data
    data.lines.forEach(l => {
      l._qty = l.AssembledQty != null ? Number(l.AssembledQty) : Number(l.OrderQty)
      l._wt = l.AssembledWeight != null ? Number(l.AssembledWeight) : null
      l._rc = l.ReturnReasonCode || null
      l._busy = false
    })
    order.value = data
    nextTick(() => scanBox.value?.$el?.focus?.())
  } catch (e) { toast.add({ severity: 'error', summary: 'Open failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
}
function closeOrder() { order.value = null; loadList() }

function onScan() {
  const q = scan.value.trim().toLowerCase(); scan.value = ''
  if (!q) return
  const hit = (order.value?.lines || []).find(l =>
    String(l.Barcode || '').toLowerCase() === q || String(l.ItemNo || '').toLowerCase() === q)
  if (!hit) { toast.add({ severity: 'warn', summary: 'Not found', detail: q, life: 2500 }); return }
  highlight.value = hit.LineId
  nextTick(() => document.querySelector('tr.hl .qty-in')?.focus?.())
}

async function saveLine(l) {
  if (isShort(l) && !l._rc) { toast.add({ severity: 'warn', summary: 'Return reason required', detail: 'Assembled qty differs from ordered.', life: 3000 }); return }
  l._busy = true
  try {
    const rn = returnReasons.value.find(r => r.code === l._rc)?.description || null
    await dispatchApi.saveAssemblyLine(l.LineId, {
      dispatchOrderId: order.value.DispatchOrderId,
      assembledQty: l._qty, assembledWeight: l._wt,
      returnReasonCode: isShort(l) ? l._rc : null, returnReasonName: isShort(l) ? rn : null,
    })
    toast.add({ severity: 'success', summary: 'Saved', detail: l.ItemNo, life: 1500 })
  } catch (e) { toast.add({ severity: 'error', summary: 'Save failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { l._busy = false }
}

async function markPart(part) {
  busyPart.value = part
  try {
    const res = (await dispatchApi.completeAssemblyPart(order.value.DispatchOrderId, part)).data
    toast.add({ severity: 'success', summary: `Part ${part} assembled`, detail: res.fullyAssembled ? 'Order ready for packing.' : '', life: 3000 })
    if (res.fullyAssembled) closeOrder(); else await openOrder(order.value)
  } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyPart.value = null }
}

async function loadReasons() { try { returnReasons.value = ((await dispatchApi.returnReasons('FCL')).data || []).map(r => ({ ...r, label: `${r.code} — ${r.description}` })) } catch { /* */ } }
async function loadAssemblers() { if (!isElevated.value) return; try { assemblers.value = (await dispatchApi.assemblers()).data || [] } catch { /* */ } }

loadReasons(); loadAssemblers(); loadList()
</script>

<style scoped>
.asm-page { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.asm-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.asm-head h2 { margin: 0; font-size: 20px; }
.asm-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 560px; }
.head-actions { display: flex; gap: 8px; align-items: center; }
.view-as { min-width: 200px; }
.empty { padding: 30px; text-align: center; color: #9ca3af; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.ord-card { text-align: left; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.ord-card:hover { border-color: #93c5fd; background: #f8fbff; }
.oc-top { display: flex; justify-content: space-between; font-size: 12px; }
.oc-no { font-weight: 700; color: #1e40af; }
.oc-co { color: #94a3b8; }
.oc-cust { font-weight: 700; font-size: 15px; color: #111827; }
.oc-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #667085; }
.oc-parts { color: #1e40af; font-weight: 600; }

.det-bar { display: flex; align-items: center; gap: 10px; }
.det-title { font-weight: 700; }
.scan-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #eef2f7; border-radius: 10px; }
.scan-input { flex: 1; }
.part-block { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.part-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #eef0f3; }
.part-badge { font-weight: 800; color: #374151; background: #e5e7eb; padding: 2px 10px; border-radius: 999px; }
.part-badge.done { background: #dcfce7; color: #15803d; }
.part-done { color: #15803d; font-size: 12px; }
.mark-btn { margin-left: auto; }
.line-cards { display: flex; flex-direction: column; }
.line-card { padding: 10px 12px; border-bottom: 1px solid #f0f2f5; }
.line-card.hl { background: #eff6ff; }
.line-card.short { background: #fff7ed; }
.line-card.done { opacity: .7; }
.lc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.lc-item { font-weight: 700; font-size: 15px; }
.lc-ord { font-size: 12px; color: #667085; }
.lc-desc { font-size: 12px; color: #98a2b3; margin: 2px 0 8px; }
.lc-inputs { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.lci { display: flex; flex-direction: column; gap: 3px; }
.lci label { font-size: 11px; font-weight: 600; color: #475467; }
:deep(.qty-in) { width: 96px; text-align: right; font-size: 16px; }
.lc-save { margin-left: auto; }
.lc-reason { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
.lc-reason label { font-size: 11px; font-weight: 600; color: #b45309; }
.muted { color: #98a2b3; }

/* Handheld / mobile — bigger tap targets, sticky prominent scan bar */
.scan-row { position: sticky; top: 0; z-index: 5; }
.scan-row :deep(input) { font-size: 16px; padding: 10px 12px; }
@media (max-width: 640px) {
  .asm-page { padding: 10px 10px; }
  .cards { grid-template-columns: 1fr; }
  .lc-save { width: 100%; margin-left: 0; }
  .lc-inputs { gap: 8px; }
  :deep(.qty-in) { width: 100%; }
  .lci { flex: 1 1 120px; }
}

@media (prefers-color-scheme: dark) {
  .asm-head .sub, .muted { color: #94a3b8; }
  .ord-card { background: #131a26; border-color: #2c3a4f; }
  .ord-card:hover { background: #18222f; border-color: #3b82f6; }
  .oc-cust { color: #f1f5f9; }
  .scan-row { background: #1f2937; }
  .part-block { border-color: #2c3a4f; }
  .part-head { background: #1f2937; border-bottom-color: #2c3a4f; }
  .part-badge { background: #374151; color: #e5e7eb; }
  .line-card { border-bottom-color: #212b3a; color: #e5e7eb; }
  .line-card.hl { background: #17233a; }
  .line-card.short { background: #2a2113; }
  .lci label { color: #cbd5e1; }
}
</style>
