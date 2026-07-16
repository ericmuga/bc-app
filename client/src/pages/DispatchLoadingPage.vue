<template>
  <div class="ld-page">
    <div class="ld-head">
      <div>
        <h2>Loading</h2>
        <p class="sub">Create a load (vehicle · driver · route · shipment date), then scan packed boxes onto it. Closing dispatches the orders.</p>
      </div>
      <Button icon="pi pi-refresh" size="small" severity="secondary" :loading="loading" @click="reload" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Sessions list + create -->
    <div v-if="!session">
      <div class="new-session">
        <div class="ns-title">New loading session</div>
        <div class="ns-grid">
          <div class="f"><label>Route</label><InputText v-model="form.routeCode" placeholder="Route / salesperson" class="fi" /></div>
          <div class="f"><label>Vehicle plate</label><InputText v-model="form.vehiclePlate" placeholder="KDA 123A" class="fi" /></div>
          <div class="f"><label>Driver</label><InputText v-model="form.driverName" placeholder="Driver name" class="fi" /></div>
          <div class="f"><label>Shipment date</label><DatePicker v-model="form.shipmentDate" date-format="yy-mm-dd" show-icon class="fi" /></div>
          <Button label="Create load" icon="pi pi-plus" size="small" :loading="busyCreate" @click="createSession" />
        </div>
      </div>

      <DataTable :value="sessions" :loading="loading" paginator :rows="15" size="small" responsiveLayout="scroll"
                 dataKey="LoadingSessionId" @row-click="openSession($event.data)">
        <template #empty><div class="empty">No loading sessions yet.</div></template>
        <Column field="SessionNo" header="Load #" style="width:150px" />
        <Column field="RouteCode" header="Route" />
        <Column field="VehiclePlate" header="Vehicle" />
        <Column field="DriverName" header="Driver" />
        <Column header="Ship date" style="width:110px"><template #body="{ data }">{{ dateStr(data.ShipmentDate) }}</template></Column>
        <Column field="BoxCount" header="Boxes" style="width:80px" />
        <Column field="Status" header="Status" style="width:100px">
          <template #body="{ data }"><span class="st" :class="data.Status">{{ data.Status }}</span></template>
        </Column>
        <Column header="" style="width:80px"><template #body="{ data }"><Button label="Open" size="small" @click.stop="openSession(data)" /></template></Column>
      </DataTable>
    </div>

    <!-- Session detail -->
    <div v-else class="detail">
      <div class="det-bar">
        <Button icon="pi pi-arrow-left" label="Back" text size="small" @click="closeSession" />
        <div class="det-title">{{ session.SessionNo }} · {{ session.RouteCode || '—' }} · {{ session.VehiclePlate || '—' }}
          <span class="muted">({{ session.Status }})</span></div>
        <div class="spacer" />
        <Button v-if="session.Status !== 'closed'" label="Close & dispatch" icon="pi pi-send" size="small" severity="success"
                :disabled="!session.boxes.length" :loading="busyClose" @click="closeLoad" />
      </div>

      <div class="sess-info">
        <span><i class="pi pi-user" /> {{ session.DriverName || '—' }}</span>
        <span><i class="pi pi-calendar" /> {{ dateStr(session.ShipmentDate) }}</span>
        <span><i class="pi pi-box" /> {{ session.boxes.length }} boxes</span>
      </div>

      <div v-if="session.Status !== 'closed'" class="scan-row">
        <i class="pi pi-qrcode" />
        <InputText ref="scanBox" v-model="scan" placeholder="Scan box QR to load…" class="scan-input" @keyup.enter="onScan" />
        <span v-if="lastScan" class="last-scan"><i class="pi pi-check-circle" /> {{ lastScan }}</span>
      </div>

      <DataTable :value="session.boxes" size="small" responsiveLayout="scroll" dataKey="LoadingLineId">
        <template #empty><div class="empty">No boxes loaded yet — scan a box QR.</div></template>
        <Column field="BoxNo" header="Box" style="width:150px" />
        <Column field="DispatchNo" header="Dispatch #" />
        <Column field="OrderNo" header="Order #" />
        <Column field="CustomerName" header="Customer" />
        <Column field="Company" header="Co." style="width:70px" />
        <Column header="Gross" style="width:90px"><template #body="{ data }">{{ fmt(data.GrossWeight) }}</template></Column>
        <Column v-if="session.Status !== 'closed'" header="" style="width:60px">
          <template #body="{ data }"><Button icon="pi pi-times" text size="small" severity="danger" @click="unload(data)" /></template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'

const toast = useToast()
const sessions = ref([])
const session = ref(null)
const loading = ref(false)
const error = ref(null)
const busyCreate = ref(false), busyClose = ref(false)
const scan = ref('')
const lastScan = ref('')
const scanBox = ref(null)
const form = reactive({ routeCode: '', vehiclePlate: '', driverName: '', shipmentDate: null })

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })
const dateStr = (d) => d ? new Date(d).toISOString().slice(0, 10) : '—'

async function loadList() {
  loading.value = true; error.value = null
  try { sessions.value = (await dispatchApi.loadingSessions()).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}
function reload() { session.value ? refreshSession() : loadList() }

async function createSession() {
  busyCreate.value = true
  try {
    const body = { ...form, shipmentDate: form.shipmentDate ? dateStr(form.shipmentDate) : null }
    const { data } = await dispatchApi.createLoading(body)
    toast.add({ severity: 'success', summary: 'Load created', detail: data.sessionNo, life: 3000 })
    form.routeCode = form.vehiclePlate = form.driverName = ''; form.shipmentDate = null
    await openSession({ LoadingSessionId: data.loadingSessionId })
  } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyCreate.value = false }
}

async function openSession(row) {
  try {
    session.value = (await dispatchApi.loadingSession(row.LoadingSessionId)).data
    nextTick(() => scanBox.value?.$el?.focus?.())
  } catch (e) { toast.add({ severity: 'error', summary: 'Open failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
}
async function refreshSession() { if (session.value) session.value = (await dispatchApi.loadingSession(session.value.LoadingSessionId)).data }
function closeSession() { session.value = null; loadList() }

async function onScan() {
  const token = scan.value.trim(); scan.value = ''
  if (!token) return
  try {
    const { data } = await dispatchApi.scanBox(session.value.LoadingSessionId, token)
    lastScan.value = `${data.boxNo} · ${data.customerName} (${data.itemCount} items)`
    await refreshSession()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Scan rejected', detail: e.response?.data?.error || e.message, life: 4000 })
  }
  nextTick(() => scanBox.value?.$el?.focus?.())
}

async function unload(row) {
  try { await dispatchApi.removeLoadingLine(row.LoadingLineId); await refreshSession() }
  catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.message, life: 3000 }) }
}

async function closeLoad() {
  busyClose.value = true
  try {
    const { data } = await dispatchApi.closeLoading(session.value.LoadingSessionId)
    toast.add({ severity: 'success', summary: 'Dispatched', detail: `${data.ordersLoaded} order(s) marked loaded.`, life: 4000 })
    closeSession()
  } catch (e) { toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busyClose.value = false }
}

loadList()
</script>

<style scoped>
.ld-page { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.ld-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.ld-head h2 { margin: 0; font-size: 20px; }
.ld-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 600px; }
.empty { padding: 26px; text-align: center; color: #9ca3af; }
.muted { color: #98a2b3; }
.spacer { flex: 1; }

.new-session { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #f8fafc; }
.ns-title { font-weight: 700; margin-bottom: 8px; }
.ns-grid { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.ns-grid .f { display: flex; flex-direction: column; gap: 3px; }
.ns-grid label { font-size: 11px; font-weight: 600; color: #475467; }
.fi { min-width: 160px; }
.st { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; text-transform: capitalize; }
.st.open { background: #dbeafe; color: #1e40af; }
.st.closed { background: #dcfce7; color: #15803d; }

.det-bar { display: flex; align-items: center; gap: 10px; }
.det-title { font-weight: 700; }
.sess-info { display: flex; gap: 16px; font-size: 13px; color: #475467; }
.sess-info span { display: flex; align-items: center; gap: 5px; }
.scan-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #eef2f7; border-radius: 10px; }
.scan-input { flex: 1; }
.last-scan { color: #15803d; font-size: 13px; white-space: nowrap; }

@media (prefers-color-scheme: dark) {
  .ld-head .sub, .muted { color: #94a3b8; }
  .new-session { background: #131a26; border-color: #2c3a4f; }
  .ns-grid label, .sess-info { color: #cbd5e1; }
  .scan-row { background: #1f2937; }
  .det-title { color: #f1f5f9; }
}
</style>
