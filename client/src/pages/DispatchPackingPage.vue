<template>
  <div class="pk-page">
    <div class="pk-head">
      <div>
        <h2>Packing</h2>
        <p class="sub">Box assembled orders: open a box, add items, checker confirms, close to print the QR label.</p>
      </div>
      <div class="head-actions">
        <Select v-if="isElevated" v-model="viewAs" :options="packers" option-label="name" option-value="userId"
                show-clear placeholder="View as packer…" class="view-as" filter @change="loadList" />
        <Button icon="pi pi-refresh" size="small" severity="secondary" :loading="loading" @click="reload" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Worklist -->
    <div v-if="!order">
      <div v-if="!loading && !orders.length" class="empty">No orders ready for packing.</div>
      <div class="cards">
        <button v-for="o in orders" :key="o.DispatchOrderId" class="ord-card" @click="openOrder(o)">
          <div class="oc-top"><span class="oc-no">{{ o.DispatchNo }}</span><span class="oc-co">{{ o.Company }}</span></div>
          <div class="oc-cust">{{ o.CustomerName }}</div>
          <div class="oc-meta"><span>{{ o.Status }}</span><span class="oc-box">{{ o.BoxCount }} boxes</span></div>
        </button>
      </div>
    </div>

    <!-- Packing detail -->
    <div v-else class="detail">
      <div class="det-bar">
        <Button icon="pi pi-arrow-left" label="Back" text size="small" @click="closeOrder" />
        <div class="det-title">{{ order.DispatchNo }} · {{ order.CustomerName }} <span class="muted">({{ order.Company }})</span></div>
        <div class="spacer" />
        <Button label="Complete packing" icon="pi pi-check-circle" size="small" severity="success"
                :disabled="!order.session || anyOpenBox || allPacked === false && false" :loading="busyComplete" @click="complete" />
      </div>

      <!-- Session -->
      <div v-if="!order.session" class="session-start">
        <span>Checker:</span>
        <Select v-model="checkerId" :options="checkers" option-label="name" option-value="userId" placeholder="Select checker…" filter class="chk" />
        <Button label="Start packing session" icon="pi pi-play" size="small" :disabled="!checkerId" :loading="busySession" @click="startSession" />
      </div>
      <div v-else class="session-info">
        <span><i class="pi pi-user" /> Packer: <strong>{{ order.session.PackerName || '—' }}</strong></span>
        <span><i class="pi pi-verified" /> Checker: <strong>{{ order.session.CheckerName || '—' }}</strong></span>
      </div>

      <div v-if="order.session" class="pos-grid">
        <!-- Items panel -->
        <div class="panel">
          <div class="panel-head">Order items <span class="muted">(tap to add to the open box)</span></div>
          <div class="scan-row">
            <i class="pi pi-qrcode" />
            <InputText v-model="scan" placeholder="Scan / type item…" @keyup.enter="onScan" />
          </div>
          <div class="item-list">
            <button v-for="l in order.lines" :key="l.LineId" class="item"
                    :class="{ done: remaining(l) <= 0, hl: highlight === l.ItemNo }"
                    :disabled="!currentBox || remaining(l) <= 0" @click="addItem(l)">
              <div class="i-main"><span class="i-no">{{ l.ItemNo }}</span><span class="i-part" v-if="l.Part">{{ l.Part }}</span></div>
              <div class="i-desc">{{ l.Description }}</div>
              <div class="i-qty">packed {{ fmt(l.PackedQty) }} / {{ fmt(l.AssembledQty ?? l.OrderQty) }} {{ l.Uom }}
                <span v-if="remaining(l) > 0" class="i-rem">· {{ fmt(remaining(l)) }} left</span></div>
            </button>
          </div>
        </div>

        <!-- Box panel -->
        <div class="panel">
          <div class="panel-head">
            Current box
            <Button v-if="!currentBox" label="Open box" icon="pi pi-plus" size="small" @click="showOpenBox = true" />
          </div>

          <div v-if="showOpenBox && !currentBox" class="open-box">
            <Select v-model="vesselTypeId" :options="vesselTypes" option-label="Code" option-value="VesselTypeId" placeholder="Vessel size…" class="vsel" />
            <Button label="Create" size="small" :disabled="!vesselTypeId" :loading="busyBox" @click="openBox" />
          </div>

          <div v-if="currentBox">
            <div class="box-no">{{ currentBox.boxNo }} · {{ currentBoxVessel }}</div>
            <table class="box-lines">
              <thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Weight</th><th></th></tr></thead>
              <tbody>
                <tr v-for="bl in currentBox.lines" :key="bl.BoxLineId">
                  <td>{{ bl.ItemNo }}</td><td class="n">{{ fmt(bl.Qty) }}</td><td class="n">{{ fmt(bl.Weight) }}</td>
                  <td><Button icon="pi pi-times" text size="small" severity="danger" @click="removeLine(bl)" /></td>
                </tr>
                <tr v-if="!currentBox.lines.length"><td colspan="4" class="muted">Tap items on the left to add…</td></tr>
              </tbody>
            </table>
            <div class="box-close">
              <span>Gross weight</span>
              <InputNumber v-model="grossWeight" :min="0" :maxFractionDigits="4" inputClass="gw-in" />
              <Button label="Checker confirm & close" icon="pi pi-lock" size="small" severity="success"
                      :disabled="!currentBox.lines.length" :loading="busyClose" @click="closeBox" />
            </div>
          </div>
        </div>
      </div>

      <!-- Closed boxes -->
      <div v-if="order.boxes.length" class="closed-boxes">
        <div class="panel-head">Boxes</div>
        <div class="box-cards">
          <div v-for="b in order.boxes" :key="b.BoxId" class="box-card" :class="{ closed: b.Status === 'closed' }">
            <div class="bc-no">{{ b.BoxNo }}</div>
            <div class="bc-meta">{{ b.VesselCode || '—' }} · {{ b.LineCount }} items · {{ b.Status }}</div>
            <div v-if="b.Status === 'closed'" class="bc-gw">{{ fmt(b.GrossWeight) }} kg</div>
          </div>
        </div>
      </div>
    </div>

    <!-- QR label dialog after close -->
    <Dialog v-model:visible="qr.open" modal header="Box label" :style="{ width: '360px' }">
      <div v-if="qr.label" class="qr-wrap">
        <img v-if="qr.image" :src="qr.image" class="qr-img" />
        <div class="qr-box">{{ qr.label.boxNo }}</div>
        <div class="qr-fields">
          <div><strong>Order {{ qr.label.orderNo }}</strong> · Part {{ qr.label.part }}</div>
          <div>Est. weight <strong>{{ fmt(qr.label.estWeight) }} kg</strong></div>
          <div class="q-sub">{{ qr.label.customerName }}</div>
          <div class="q-sub">Salesperson: {{ qr.label.salesperson || '—' }}</div>
          <div class="q-sub">Route: {{ qr.label.route || '—' }} · Ship: {{ qr.label.shipmentDate || '—' }}</div>
          <div class="q-sub">LPO: {{ qr.label.lpo || '—' }}</div>
        </div>
      </div>
      <template #footer>
        <Button label="Print" icon="pi pi-print" @click="printQr" />
        <Button label="Done" text @click="qr.open = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { dispatchApi } from '@/services/dispatch.js'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'

const auth = useAuthStore()
const toast = useToast()
const isElevated = computed(() => ['admin', 'dispatch-supervisor'].includes(String(auth.effectiveRole || '').toLowerCase()))

const orders = ref([])
const packers = ref([])
const vesselTypes = ref([])
const checkers = ref([])
const viewAs = ref(null)
const order = ref(null)
const loading = ref(false)
const error = ref(null)

const checkerId = ref(null)
const showOpenBox = ref(false)
const vesselTypeId = ref(null)
const currentBox = ref(null)
const grossWeight = ref(null)
const scan = ref('')
const highlight = ref(null)
const busySession = ref(false), busyBox = ref(false), busyClose = ref(false), busyComplete = ref(false)
const qr = reactive({ open: false, image: null, label: null })

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 4 })
const remaining = (l) => Number(l.AssembledQty ?? l.OrderQty ?? 0) - Number(l.PackedQty || 0)
const anyOpenBox = computed(() => !!currentBox.value)
const allPacked = computed(() => (order.value?.lines || []).every(l => remaining(l) <= 0))
const currentBoxVessel = computed(() => vesselTypes.value.find(v => v.VesselTypeId === currentBox.value?.vesselTypeId)?.Code || currentBox.value?.vesselCode || '')

async function loadList() {
  loading.value = true; error.value = null
  try { orders.value = (await dispatchApi.packing(viewAs.value)).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}
function reload() { order.value ? refreshOrder() : loadList() }

async function openOrder(row) {
  currentBox.value = null; showOpenBox.value = false
  try { order.value = (await dispatchApi.packingOrder(row.DispatchOrderId)).data }
  catch (e) { toast.add({ severity: 'error', summary: 'Open failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
}
async function refreshOrder() { if (order.value) { const id = order.value.DispatchOrderId; order.value = (await dispatchApi.packingOrder(id)).data } }
function closeOrder() { order.value = null; currentBox.value = null; loadList() }

async function startSession() {
  busySession.value = true
  try {
    const checker = checkers.value.find(c => c.userId === checkerId.value)
    await dispatchApi.startSession(order.value.DispatchOrderId, { checkerUserId: checkerId.value, checkerName: checker?.name })
    await refreshOrder()
  } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busySession.value = false }
}

async function openBox() {
  busyBox.value = true
  try {
    const vessel = vesselTypes.value.find(v => v.VesselTypeId === vesselTypeId.value)
    const { data } = await dispatchApi.openBox(order.value.DispatchOrderId, { sessionId: order.value.session.SessionId, vesselTypeId: vesselTypeId.value, vesselCode: vessel?.Code })
    currentBox.value = { ...data, vesselTypeId: vesselTypeId.value, vesselCode: vessel?.Code, lines: [] }
    showOpenBox.value = false; vesselTypeId.value = null
  } catch (e) { toast.add({ severity: 'error', summary: 'Open box failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyBox.value = false }
}

async function addItem(l) {
  if (!currentBox.value) { toast.add({ severity: 'warn', summary: 'Open a box first', life: 2500 }); return }
  const qty = remaining(l)
  if (qty <= 0) return
  const weight = l.IsWeighted ? qty : 0
  try {
    await dispatchApi.addBoxLine(currentBox.value.boxId, { itemNo: l.ItemNo, description: l.Description, qty, weight })
    currentBox.value.lines.push({ BoxLineId: `tmp-${Date.now()}-${l.ItemNo}`, ItemNo: l.ItemNo, Qty: qty, Weight: weight })
    await refreshOrder() // updates packed qty on the item list
  } catch (e) { toast.add({ severity: 'error', summary: 'Add failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
}

async function removeLine(bl) {
  if (String(bl.BoxLineId).startsWith('tmp-')) { currentBox.value.lines = currentBox.value.lines.filter(x => x !== bl); return }
  try { await dispatchApi.removeBoxLine(bl.BoxLineId); currentBox.value.lines = currentBox.value.lines.filter(x => x.BoxLineId !== bl.BoxLineId); await refreshOrder() }
  catch (e) { toast.add({ severity: 'error', summary: 'Remove failed', detail: e.message, life: 3000 }) }
}

async function closeBox() {
  busyClose.value = true
  try {
    const { data } = await dispatchApi.closeBox(currentBox.value.boxId, {
      checkerUserId: order.value.session.CheckerUserId, checkerName: order.value.session.CheckerName, grossWeight: grossWeight.value,
    })
    qr.image = data.qrImage; qr.label = data.label; qr.open = true
    currentBox.value = null; grossWeight.value = null
    await refreshOrder()
  } catch (e) { toast.add({ severity: 'error', summary: 'Close failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyClose.value = false }
}

async function complete() {
  busyComplete.value = true
  try {
    await dispatchApi.completePacking(order.value.DispatchOrderId)
    toast.add({ severity: 'success', summary: 'Packed', detail: 'Order marked packed — ready for loading.', life: 3000 })
    closeOrder()
  } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyComplete.value = false }
}

function onScan() {
  const q = scan.value.trim().toLowerCase(); scan.value = ''
  if (!q) return
  const hit = (order.value?.lines || []).find(l => String(l.Barcode || '').toLowerCase() === q || String(l.ItemNo || '').toLowerCase() === q)
  if (!hit) { toast.add({ severity: 'warn', summary: 'Not found', detail: q, life: 2500 }); return }
  highlight.value = hit.ItemNo
  addItem(hit)
}

function printQr() {
  const L = qr.label; if (!L) return
  const w = window.open('', '_blank'); if (!w) return
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  w.document.write(`<html><head><title>${esc(L.boxNo)}</title>
    <style>
      body{font-family:Segoe UI,Arial,sans-serif;text-align:center;margin:8mm;color:#111;}
      img{width:230px;height:230px;}
      .b{font-weight:800;font-size:20px;margin:6px 0 2px;}
      .big{font-size:15px;font-weight:700;}
      .r{font-size:13px;margin:2px 0;}
      @media print{@page{margin:6mm;}}
    </style></head><body>
    <img src="${qr.image}" />
    <div class="b">${esc(L.boxNo)}</div>
    <div class="big">Order ${esc(L.orderNo)} &middot; Part ${esc(L.part)}</div>
    <div class="r">Est. weight <b>${fmt(L.estWeight)} kg</b></div>
    <div class="r">${esc(L.customerName)}</div>
    <div class="r">Salesperson: ${esc(L.salesperson || '—')}</div>
    <div class="r">Route: ${esc(L.route || '—')} &nbsp; Ship: ${esc(L.shipmentDate || '—')}</div>
    <div class="r">LPO: ${esc(L.lpo || '—')}</div>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`)
  w.document.close()
}

async function loadRefData() {
  try { vesselTypes.value = (await dispatchApi.vesselTypes()).data || [] } catch { /* */ }
  try { checkers.value = (await dispatchApi.checkers()).data || [] } catch { /* */ }
  if (isElevated.value) { try { packers.value = (await dispatchApi.assemblers()).data || [] } catch { /* */ } }
}

loadRefData(); loadList()
</script>

<style scoped>
.pk-page { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.pk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.pk-head h2 { margin: 0; font-size: 20px; }
.pk-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 560px; }
.head-actions { display: flex; gap: 8px; align-items: center; }
.view-as { min-width: 190px; }
.empty { padding: 30px; text-align: center; color: #9ca3af; }
.muted { color: #98a2b3; }
.spacer { flex: 1; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.ord-card { text-align: left; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.ord-card:hover { border-color: #93c5fd; background: #f8fbff; }
.oc-top { display: flex; justify-content: space-between; font-size: 12px; }
.oc-no { font-weight: 700; color: #1e40af; } .oc-co { color: #94a3b8; }
.oc-cust { font-weight: 700; font-size: 15px; color: #111827; }
.oc-meta { display: flex; gap: 10px; font-size: 12px; color: #667085; }

.det-bar { display: flex; align-items: center; gap: 10px; }
.det-title { font-weight: 700; }
.session-start, .session-info { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #eef2f7; border-radius: 10px; font-size: 13px; }
.session-info span { display: flex; align-items: center; gap: 5px; }
.chk { min-width: 200px; }

.pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.panel { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #eef0f3; font-weight: 700; font-size: 13px; }
.scan-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.scan-row :deep(input) { flex: 1; }
.item-list { display: flex; flex-direction: column; max-height: 52vh; overflow: auto; }
.item { text-align: left; border: none; border-bottom: 1px solid #f0f2f5; padding: 8px 12px; background: #fff; cursor: pointer; }
.item:hover:not(:disabled) { background: #f0f7ff; }
.item:disabled { opacity: .5; cursor: default; }
.item.done { background: #f0fdf4; }
.item.hl { background: #eff6ff; }
.i-main { display: flex; gap: 8px; align-items: center; }
.i-no { font-weight: 700; }
.i-part { font-size: 10px; font-weight: 700; background: #e5e7eb; padding: 0 6px; border-radius: 999px; }
.i-desc { font-size: 11px; color: #98a2b3; }
.i-qty { font-size: 12px; color: #667085; } .i-rem { color: #b45309; font-weight: 600; }

.open-box { display: flex; gap: 8px; padding: 10px; align-items: center; }
.vsel { flex: 1; }
.box-no { padding: 8px 12px; font-weight: 700; color: #1e40af; }
.box-lines { width: 100%; border-collapse: collapse; font-size: 13px; }
.box-lines th, .box-lines td { padding: 5px 10px; border-bottom: 1px solid #f0f2f5; text-align: left; }
.box-lines .n { text-align: right; }
.box-close { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
:deep(.gw-in) { width: 110px; text-align: right; }

.closed-boxes { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.box-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; padding: 10px; }
.box-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
.box-card.closed { border-color: #86efac; background: #f0fdf4; }
.bc-no { font-weight: 700; }
.bc-meta { font-size: 11px; color: #667085; }
.bc-gw { font-size: 12px; font-weight: 600; }

.qr-wrap { text-align: center; }
.qr-img { width: 220px; height: 220px; }
.qr-box { font-weight: 800; font-size: 16px; margin-top: 6px; }
.qr-fields { margin-top: 8px; font-size: 13px; display: flex; flex-direction: column; gap: 2px; }
.qr-fields .q-sub { color: #667085; font-size: 12px; }

@media (max-width: 820px) { .pos-grid { grid-template-columns: 1fr; } }
@media (prefers-color-scheme: dark) {
  .pk-head .sub, .muted { color: #94a3b8; }
  .ord-card, .panel, .box-card, .closed-boxes { background: #131a26; border-color: #2c3a4f; }
  .ord-card:hover { background: #18222f; }
  .oc-cust, .det-title { color: #f1f5f9; }
  .session-start, .session-info, .panel-head, .scan-row { background: #1f2937; }
  .panel-head { border-bottom-color: #2c3a4f; }
  .item { background: #131a26; border-bottom-color: #212b3a; color: #e5e7eb; }
  .item:hover:not(:disabled) { background: #17233a; }
  .item.done { background: #10231a; }
  .box-lines th, .box-lines td { border-bottom-color: #212b3a; color: #e5e7eb; }
  .box-card.closed { background: #10231a; border-color: #16653480; }
}
</style>
