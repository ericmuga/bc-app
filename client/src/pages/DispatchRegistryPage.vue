<template>
  <div class="disp-page">
    <div class="disp-head">
      <div>
        <h2>Dispatch Registry</h2>
        <p class="sub">Confirm the four parts (A · B · C · D) of each order. Once all are confirmed the order is due for assignment.</p>
      </div>
      <Button icon="pi pi-cloud-download" label="Refresh from BC" size="small" :loading="refreshing" @click="refreshFromBc" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <DataTable :value="orders" :loading="loading" dataKey="DispatchOrderId" paginator :rows="15"
               responsiveLayout="scroll" class="disp-table" @row-click="openOrder($event.data)">
      <template #empty><div class="empty">No orders pending confirmation.</div></template>
      <Column field="DispatchNo" header="Dispatch #" style="width:150px" />
      <Column field="OrderNo" header="Order #" style="width:150px" />
      <Column field="CustomerName" header="Customer" />
      <Column field="ShopCode" header="Shop" style="width:90px" />
      <Column header="Parts" style="width:160px">
        <template #body="{ data }">
          <span class="parts-chip">{{ data.ConfirmedParts }} / {{ data.TotalParts }} confirmed</span>
        </template>
      </Column>
      <Column header="" style="width:90px">
        <template #body="{ data }">
          <Button label="Open" size="small" @click.stop="openOrder(data)" />
        </template>
      </Column>
    </DataTable>

    <!-- Confirm dialog -->
    <Dialog v-model:visible="dialog" modal :header="active ? `Confirm parts — ${active.DispatchNo}` : ''" :style="{ width: '540px' }">
      <div v-if="detail" class="detail">
        <div class="detail-meta">
          <div><span class="k">Order</span> {{ detail.OrderNo || '—' }}</div>
          <div><span class="k">Customer</span> {{ detail.CustomerName || '—' }}</div>
          <div><span class="k">Lines</span> {{ detail.lines?.length || 0 }}</div>
        </div>

        <div class="parts-grid">
          <div v-for="p in detail.parts" :key="p.Part" class="part-card" :class="{ done: p.Confirmed }">
            <div class="part-letter">{{ p.Part }}</div>
            <div class="part-state">
              <span v-if="p.Confirmed" class="ok"><i class="pi pi-check-circle" /> Confirmed</span>
              <Button v-else label="Confirm" size="small" :loading="busyPart === p.Part" @click="confirm(p.Part)" />
            </div>
          </div>
        </div>

        <div class="detail-lines">
          <table>
            <thead><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th>UoM</th></tr></thead>
            <tbody>
              <tr v-for="l in detail.lines" :key="l.LineId">
                <td>{{ l.ItemNo }}</td><td>{{ l.Description }}</td>
                <td class="n">{{ Number(l.OrderQty) }}</td><td>{{ l.Uom }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <Button label="Close" text @click="dialog = false" />
        <Button label="Confirm all" icon="pi pi-check" :disabled="allConfirmed" :loading="busyAll" @click="confirmAll" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'

const toast = useToast()
const orders = ref([])
const loading = ref(false)
const refreshing = ref(false)
const error = ref(null)

const dialog = ref(false)
const active = ref(null)
const detail = ref(null)
const busyPart = ref(null)
const busyAll = ref(false)

const allConfirmed = computed(() => detail.value?.parts?.every(p => p.Confirmed))

async function load() {
  loading.value = true; error.value = null
  try { orders.value = (await dispatchApi.confirmation()).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

async function refreshFromBc() {
  refreshing.value = true; error.value = null
  try {
    const { data } = await dispatchApi.importFromBc()
    toast.add({ severity: 'success', summary: 'Pulled from BC',
      detail: `${data.imported} imported, ${data.skipped} already present (Execute status ${data.executeStatus}).`, life: 4000 })
    await load()
  } catch (e) {
    error.value = e.response?.data?.error || e.message
    toast.add({ severity: 'error', summary: 'Refresh failed', detail: error.value, life: 5000 })
  } finally { refreshing.value = false }
}

async function openOrder(row) {
  active.value = row; dialog.value = true; detail.value = null
  try { detail.value = (await dispatchApi.getOrder(row.DispatchOrderId)).data }
  catch (e) { toast.add({ severity: 'error', summary: 'Load failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
}

async function confirm(part) {
  busyPart.value = part
  try {
    await dispatchApi.confirmPart(active.value.DispatchOrderId, part)
    detail.value = (await dispatchApi.getOrder(active.value.DispatchOrderId)).data
    if (allConfirmed.value) { toast.add({ severity: 'success', summary: 'Order confirmed', detail: 'Due for assignment.', life: 3000 }); dialog.value = false; load() }
  } catch (e) { toast.add({ severity: 'error', summary: 'Confirm failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyPart.value = null }
}

async function confirmAll() {
  busyAll.value = true
  try {
    for (const p of detail.value.parts.filter(x => !x.Confirmed)) {
      await dispatchApi.confirmPart(active.value.DispatchOrderId, p.Part)
    }
    toast.add({ severity: 'success', summary: 'Order confirmed', detail: 'Due for assignment.', life: 3000 })
    dialog.value = false; load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Confirm failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyAll.value = false }
}

load()
</script>

<style scoped>
.disp-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.disp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.disp-head h2 { margin: 0; font-size: 20px; }
.disp-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 620px; }
.disp-table :deep(.p-datatable-tbody > tr) { cursor: pointer; }
.empty { padding: 32px; text-align: center; color: #9ca3af; }
.parts-chip { font-size: 12px; font-weight: 600; color: #1e40af; background: #e0e7ff; padding: 2px 8px; border-radius: 999px; }

.detail-meta { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; margin-bottom: 12px; }
.detail-meta .k { color: #9ca3af; margin-right: 4px; }
.parts-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.part-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; text-align: center; }
.part-card.done { border-color: #86efac; background: #f0fdf4; }
.part-letter { font-size: 22px; font-weight: 800; color: #374151; }
.part-state { margin-top: 6px; min-height: 30px; display: flex; align-items: center; justify-content: center; }
.part-state .ok { color: #15803d; font-size: 12px; font-weight: 600; }
.detail-lines { max-height: 220px; overflow: auto; border: 1px solid #eef0f3; border-radius: 8px; }
.detail-lines table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-lines th, .detail-lines td { padding: 5px 10px; border-bottom: 1px solid #f0f2f5; text-align: left; }
.detail-lines .n { text-align: right; }

@media (prefers-color-scheme: dark) {
  .disp-head .sub { color: #94a3b8; }
  .part-card { border-color: #2c3a4f; }
  .part-card.done { border-color: #16653480; background: #10231a; }
  .part-letter { color: #e5e7eb; }
  .detail-lines { border-color: #2c3a4f; }
  .detail-lines th, .detail-lines td { border-bottom-color: #212b3a; }
}
</style>
