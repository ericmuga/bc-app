<template>
  <div class="ds-page">
    <h2>Dispatch Setup</h2>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <!-- Vessels -->
    <div class="card">
      <div class="card-head"><span>Vessels / carton sizes</span>
        <Button icon="pi pi-plus" label="Add" size="small" text @click="addVessel" /></div>
      <DataTable :value="vessels" size="small" dataKey="VesselTypeId" responsiveLayout="scroll">
        <Column header="Code" style="min-width:140px"><template #body="{ data }"><InputText v-model="data.Code" fluid /></template></Column>
        <Column header="Description"><template #body="{ data }"><InputText v-model="data.Description" fluid /></template></Column>
        <Column header="Tare (kg)" style="width:130px"><template #body="{ data }"><InputNumber v-model="data.TareWeight" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="" style="width:110px"><template #body="{ data }">
          <Button icon="pi pi-save" text size="small" @click="saveVessel(data)" />
          <Button icon="pi pi-trash" text size="small" severity="danger" @click="delVessel(data)" />
        </template></Column>
      </DataTable>
    </div>

    <!-- Vehicles -->
    <div class="card">
      <div class="card-head"><span>Vehicles</span>
        <Button icon="pi pi-plus" label="Add" size="small" text @click="addVehicle" /></div>
      <DataTable :value="vehicles" size="small" dataKey="VehicleId" responsiveLayout="scroll">
        <Column header="Plate" style="min-width:130px"><template #body="{ data }"><InputText v-model="data.Plate" fluid /></template></Column>
        <Column header="Make"><template #body="{ data }"><InputText v-model="data.Make" fluid /></template></Column>
        <Column header="Load capacity (kg)" style="width:150px"><template #body="{ data }"><InputNumber v-model="data.LoadCapacity" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="Tare (kg)" style="width:130px"><template #body="{ data }"><InputNumber v-model="data.TareWeight" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="Status" style="width:120px"><template #body="{ data }">
          <Select v-model="data.Status" :options="['active','inactive']" fluid /></template></Column>
        <Column header="" style="width:110px"><template #body="{ data }">
          <Button icon="pi pi-save" text size="small" @click="saveVehicle(data)" />
          <Button icon="pi pi-trash" text size="small" severity="danger" @click="delVehicle(data)" />
        </template></Column>
      </DataTable>
    </div>

    <!-- BC routes (reference) -->
    <details class="card">
      <summary class="card-head"><span>Routes (BC · District Group Code) — {{ routes.length }}</span></summary>
      <DataTable :value="routes" size="small" paginator :rows="10" responsiveLayout="scroll">
        <Column field="value" header="Code" style="width:160px" />
        <Column field="label" header="Route" />
      </DataTable>
    </details>

    <!-- BC salespeople (reference) -->
    <details class="card">
      <summary class="card-head"><span>Salespeople (BC) — {{ salespersons.length }}</span></summary>
      <DataTable :value="salespersons" size="small" paginator :rows="10" responsiveLayout="scroll">
        <Column field="code" header="Code" style="width:120px" />
        <Column field="name" header="Name" />
      </DataTable>
    </details>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Message from 'primevue/message'

const toast = useToast()
const vessels = ref([]); const vehicles = ref([]); const routes = ref([]); const salespersons = ref([])
const error = ref(null)

async function loadAll() {
  error.value = null
  try {
    vessels.value = (await dispatchApi.setupVessels()).data || []
    vehicles.value = (await dispatchApi.setupVehicles()).data || []
    dispatchApi.bcRoutes().then(r => { routes.value = r.data || [] }).catch(() => {})
    dispatchApi.bcSalespersons().then(r => { salespersons.value = r.data || [] }).catch(() => {})
  } catch (e) { error.value = e.response?.data?.error || e.message }
}
const done = (m) => toast.add({ severity: 'success', summary: m, life: 2000 })
const fail = (e) => toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 })

function addVessel() { vessels.value.unshift({ VesselTypeId: null, Code: '', Description: '', TareWeight: 0 }) }
async function saveVessel(v) {
  try { const r = await dispatchApi.saveVessel({ vesselTypeId: v.VesselTypeId, code: v.Code, description: v.Description, tareWeight: v.TareWeight })
    if (r.data.vesselTypeId) v.VesselTypeId = r.data.vesselTypeId; done('Vessel saved') } catch (e) { fail(e) }
}
async function delVessel(v) {
  if (!v.VesselTypeId) { vessels.value = vessels.value.filter(x => x !== v); return }
  try { await dispatchApi.deleteVessel(v.VesselTypeId); vessels.value = vessels.value.filter(x => x !== v); done('Deleted') } catch (e) { fail(e) }
}

function addVehicle() { vehicles.value.unshift({ VehicleId: null, Plate: '', Make: '', LoadCapacity: 0, TareWeight: 0, Status: 'active' }) }
async function saveVehicle(v) {
  try { const r = await dispatchApi.saveVehicle({ vehicleId: v.VehicleId, plate: v.Plate, make: v.Make, loadCapacity: v.LoadCapacity, tareWeight: v.TareWeight, status: v.Status })
    if (r.data.vehicleId) v.VehicleId = r.data.vehicleId; done('Vehicle saved') } catch (e) { fail(e) }
}
async function delVehicle(v) {
  if (!v.VehicleId) { vehicles.value = vehicles.value.filter(x => x !== v); return }
  try { await dispatchApi.deleteVehicle(v.VehicleId); vehicles.value = vehicles.value.filter(x => x !== v); done('Deleted') } catch (e) { fail(e) }
}

loadAll()
</script>

<style scoped>
.ds-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.ds-page h2 { margin: 0; font-size: 20px; }
.card { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #eef0f3; font-weight: 700; font-size: 13px; cursor: default; }
details.card > summary.card-head { cursor: pointer; list-style: none; }
details.card > summary.card-head::-webkit-details-marker { display: none; }
@media (prefers-color-scheme: dark) {
  .card { border-color: #2c3a4f; }
  .card-head { background: #1f2937; border-bottom-color: #2c3a4f; }
}
</style>
