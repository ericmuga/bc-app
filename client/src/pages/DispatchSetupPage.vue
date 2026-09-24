<template>
  <div class="ds-page">
    <h2>Dispatch Admin setup</h2>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <details class="card" open>
      <summary class="card-head"><span>BC dispatch sync</span></summary>
      <div class="section-body">
        <div class="config-row"><label>Sync company<Select v-model="syncCompany" :options="['FCL','CM','FLM','RMK']" :disabled="pulling||pushing||savingSchedule" /></label></div>
        <p>Schedules run while the API is running, using the per-company settings below. Manual pulls and the history below use the selected company, including orders with other shipment dates. Existing dispatch orders are skipped.</p>
        <p>Scheduler: <strong>{{ pullStatus.schedule?.enabled?'Enabled':'Not running on this API instance' }}</strong> · Next check: {{ syncTime(pullStatus.schedule?.nextRunAt) }}</p>
        <div v-for="setting in scheduleRows" :key="setting.Kind" class="config-row">
          <strong>{{ setting.Kind==='pull'?'Pull Execute orders':'Push packed lines' }}</strong>
          <label><span><input type="checkbox" v-model="setting.Enabled" /> Enabled</span></label>
          <label>Every (minutes)<InputNumber v-model="setting.IntervalMinutes" :min="1" :max="1440" :maxFractionDigits="0" :useGrouping="false" /></label>
          <Button label="Save schedule" :loading="savingSchedule===setting.Kind" :disabled="!!savingSchedule" @click="saveSchedule(setting)" />
          <span>Next run: {{ syncTime(pullStatus.schedules?.find(s=>s.Kind===setting.Kind)?.NextRunAt) }}</span>
        </div>
        <p>Intervals: 1–1440 minutes. Changes apply without restarting the API. Disabling a schedule stops future runs; an active run finishes. Packed-line push is disabled initially until you enable it.</p>
        <div class="config-row"><Button label="Pull missing Execute orders now" icon="pi pi-sync" :loading="pulling" @click="pullOrders" /><Button label="Refresh history" severity="secondary" :loading="loadingPulls" @click="loadPullHistory" /></div>
        <h4>Packed BC order lines — {{ syncCompany }}</h4>
        <p>Pushes packed quantity in the order UOM to BC Imported Assemblies. BC performs execution separately. Weight, pieces and batch remain in dispatch because this staging table has no corresponding columns.</p>
        <Button label="Push packed lines to BC" icon="pi pi-upload" :loading="pushing" :disabled="pulling" @click="pushPacked" />
        <DataTable :value="packedExportRows" paginator :rows="10" size="small" scrollable><template #empty>No fully packed BC order lines for this company.</template>
          <Column field="OrderNo" header="Order" /><Column field="BcLineNo" header="BC line" /><Column field="ItemNo" header="Item" /><Column field="Description" header="Description" /><Column field="PackedQty" header="Packed quantity" /><Column field="Uom" header="UOM" /><Column field="Pieces" header="Pieces" /><Column field="WeightKg" header="KG" /><Column field="ReturnReasonCode" header="Return reason" /><Column field="PackedUser" header="User ID" /><Column field="Readiness" header="Export status" /><Column header="Last exported"><template #body="{data}">{{ syncTime(data.SyncedAt) }}</template></Column>
        </DataTable>
        <Message v-if="pullError" severity="error">{{ pullError }}</Message>
        <p>Latest 100 pulls. History refreshes every 15 seconds. A run with no finish time may have been interrupted; partial/failed orders are retried on the next pull.</p>
        <DataTable :value="pullStatus.runs" paginator :rows="10" size="small" scrollable>
          <template #empty>No order pulls recorded yet.</template>
          <Column field="Kind" header="Sync" /><Column field="status" header="Status" /><Column field="trigger" header="Trigger" />
          <Column header="Started"><template #body="{data}">{{ syncTime(data.startedAt) }}</template></Column>
          <Column header="Finished"><template #body="{data}">{{ syncTime(data.endedAt) }}</template></Column>
          <Column header="Imported / exported"><template #body="{data}">{{ data.result?.exported??data.result?.imported??'—' }}</template></Column>
          <Column header="Already present"><template #body="{data}">{{ data.result?.skipped??'—' }}</template></Column>
          <Column header="Company results / errors"><template #body="{data}"><div v-for="(result,company) in data.result?.byCompany||{}" :key="company">{{ company }}: {{ result.found }} found, {{ result.imported }} imported</div><div v-if="data.error">{{ data.error }}</div><div v-for="(failure,index) in data.result?.errors||[]" :key="index">{{ failure.company }} {{ failure.orderNo }}: {{ failure.error }}</div></template></Column>
        </DataTable>
      </div>
    </details>
    <details class="card" open>
      <summary class="card-head"><span>Assembly and chiller mapping</span></summary>
      <div class="section-body">
      <label><input type="checkbox" v-model="chillerConfig.BypassAssignment" /> Bypass assignment: assemblers select a chiller and complete its order items</label>
      <div class="config-row">
        <label>Stock company <Select v-model="chillerConfig.StockCompany" :options="['FCL','CM','FLM','RMK']" /></label>
        <label>Stock location <InputText v-model="chillerConfig.StockLocation" maxlength="20" /></label>
        <Button label="Save settings" size="small" @click="saveChillerSettings" />
      </div>
      <p>Mappings imported from CHILLERSCODE.xlsx. Assembly records out-tray movements at the configured location. WMS receipts will be connected separately. JF-SAUSAGE is routed to CHILLER U / Part B.</p>
      <Button label="Refresh BC item rules" icon="pi pi-sync" :loading="syncingRules" @click="syncRules" />
      <Button label="Add mapping" icon="pi pi-plus" size="small" @click="clearColumnFilters('mappings'); mappings.unshift({ItemNo:'',Description:'',Chiller:'',_new:true})" />
      <DataTable :value="mappings" paginator :rows="15" v-model:filters="columnFilters.mappings" filterDisplay="row" scrollable size="small"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('mappings')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Item" field="ItemNo" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search item" aria-label="Search Item" fluid @input="filterCallback()" /></template><template #body="{data}"><InputText v-model="data.ItemNo" :disabled="!data._new" maxlength="30" /></template></Column>
        <Column header="Description" field="Description" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search description" aria-label="Search Description" fluid @input="filterCallback()" /></template><template #body="{data}"><InputText v-model="data.Description" maxlength="250" /></template></Column>
        <Column header="Barcode number" style="min-width:200px" field="BarcodeSearch" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search barcode number" aria-label="Search Barcode number" fluid @input="filterCallback()" /></template><template #body="{data}">
          <div v-for="entry in data.Barcodes||[]" :key="entry.Company">{{ entry.Company }}: {{ entry.Barcode }}</div>
          <span v-if="!data.Barcodes?.length">Not synced / no barcode</span>
        </template></Column>
        <Column field="UnitSearch" header="Weight / piece translation" :showFilterMenu="false" style="min-width:230px">
          <template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search unit / company / kg" fluid @input="filterCallback()" /></template>
          <template #body="{data}"><div v-for="u in data.UnitConversions||[]" :key="u.Company+u.Uom">{{ u.Company }}: 1 {{ u.Uom }} = {{ Number(u.KgPerUom).toLocaleString('en-KE',{maximumFractionDigits:4}) }} kg</div><span v-if="!data.UnitConversions?.length">No KG conversion cached</span></template>
        </Column>
        <Column header="Chiller / freezer" field="Chiller" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search chiller / freezer" aria-label="Search Chiller / freezer" fluid @input="filterCallback()" /></template><template #body="{data}"><InputText v-model="data.Chiller" maxlength="50" /></template></Column>
        <Column header="Actions"><template #body="{data}">
          <Button icon="pi pi-save" text aria-label="Save mapping" @click="saveMapping(data)" />
          <Button icon="pi pi-trash" text severity="danger" aria-label="Delete mapping" @click="deleteMapping(data)" />
        </template></Column>
      </DataTable>
      </div>
    </details>

    <details class="card">
      <summary class="card-head"><span>BC units and dispatch staff</span></summary>
      <div class="section-body">
      <p>Refresh cached BC item units to calculate KG and tonnage. Missing KG conversions must be maintained in BC.</p>
      <Button label="Refresh BC unit conversions" icon="pi pi-refresh" :loading="refreshingUnits" @click="refreshUnits" />
      <p>Assign assembler, packer or confirmer roles. Users must sign in again after a role change. Other business and administrator roles cannot be changed here.</p>
      <DataTable :value="staffRows" paginator :rows="10" v-model:filters="columnFilters.staffRows" filterDisplay="row" scrollable size="small"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('staffRows')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Name"  field="DisplayName" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search name" aria-label="Search Name" fluid @input="filterCallback()" /></template></Column><Column header="Username"  field="Username" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search username" aria-label="Search Username" fluid @input="filterCallback()" /></template></Column>
        <Column header="Role" field="_role" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search role" aria-label="Search Role" fluid @input="filterCallback()" /></template><template #body="{data}"><Select v-model="data._role" :options="staffRoles" option-label="label" option-value="value" /></template></Column>
        <Column><template #body="{data}"><Button label="Assign role" size="small" @click="saveStaffRole(data)" /></template></Column>
      </DataTable>
      </div>
    </details>
    <!-- Vessels -->
    <details class="card">
      <summary class="card-head"><span>Vessels / carton sizes</span></summary>
      <div class="section-actions"><Button icon="pi pi-plus" label="Add" size="small" text @click="addVessel" /></div>
      <DataTable :value="vessels" v-model:filters="columnFilters.vessels" filterDisplay="row" scrollable size="small" dataKey="VesselTypeId" responsiveLayout="scroll"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('vessels')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Code" style="min-width:140px" field="Code" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search code" aria-label="Search Code" fluid @input="filterCallback()" /></template><template #body="{ data }"><InputText v-model="data.Code" fluid /></template></Column>
        <Column header="Description" field="Description" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search description" aria-label="Search Description" fluid @input="filterCallback()" /></template><template #body="{ data }"><InputText v-model="data.Description" fluid /></template></Column>
        <Column header="Tare (kg)" style="width:130px" field="TareWeight" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputNumber v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" aria-label="Filter Tare (kg)" fluid @update:modelValue="filterCallback()" /></template><template #body="{ data }"><InputNumber v-model="data.TareWeight" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="" style="width:110px"><template #body="{ data }">
          <Button icon="pi pi-save" text size="small" @click="saveVessel(data)" />
          <Button icon="pi pi-trash" text size="small" severity="danger" @click="delVessel(data)" />
        </template></Column>
      </DataTable>
    </details>

    <!-- Vehicles -->
    <details class="card">
      <summary class="card-head"><span>Vehicles</span></summary>
      <div class="section-actions"><Button icon="pi pi-plus" label="Add" size="small" text @click="addVehicle" /></div>
      <DataTable :value="vehicles" v-model:filters="columnFilters.vehicles" filterDisplay="row" scrollable size="small" dataKey="VehicleId" responsiveLayout="scroll"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('vehicles')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Plate" style="min-width:130px" field="Plate" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search plate" aria-label="Search Plate" fluid @input="filterCallback()" /></template><template #body="{ data }"><InputText v-model="data.Plate" fluid /></template></Column>
        <Column header="Make" field="Make" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search make" aria-label="Search Make" fluid @input="filterCallback()" /></template><template #body="{ data }"><InputText v-model="data.Make" fluid /></template></Column>
        <Column header="Load capacity (kg)" style="width:150px" field="LoadCapacity" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputNumber v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" aria-label="Filter Load capacity (kg)" fluid @update:modelValue="filterCallback()" /></template><template #body="{ data }"><InputNumber v-model="data.LoadCapacity" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="Tare (kg)" style="width:130px" field="TareWeight" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputNumber v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" aria-label="Filter Tare (kg)" fluid @update:modelValue="filterCallback()" /></template><template #body="{ data }"><InputNumber v-model="data.TareWeight" :maxFractionDigits="4" :min="0" fluid /></template></Column>
        <Column header="Status" style="width:120px" field="Status" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><Select v-model="filterModel.value" :options="['active','inactive']" show-clear placeholder="All statuses" fluid @change="filterCallback()" /></template><template #body="{ data }">
          <Select v-model="data.Status" :options="['active','inactive']" fluid /></template></Column>
        <Column header="" style="width:110px"><template #body="{ data }">
          <Button icon="pi pi-save" text size="small" @click="saveVehicle(data)" />
          <Button icon="pi pi-trash" text size="small" severity="danger" @click="delVehicle(data)" />
        </template></Column>
      </DataTable>
    </details>

    <!-- BC routes (reference) -->
    <details class="card">
      <summary class="card-head"><span>Routes (BC · District Group Code) — {{ routes.length }}</span></summary>
      <DataTable :value="routes" v-model:filters="columnFilters.routes" filterDisplay="row" scrollable size="small" paginator :rows="10" responsiveLayout="scroll"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('routes')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Code" style="width:160px"  field="value" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search code" aria-label="Search Code" fluid @input="filterCallback()" /></template></Column>
        <Column header="Route"  field="label" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search route" aria-label="Search Route" fluid @input="filterCallback()" /></template></Column>
      </DataTable>
    </details>

    <!-- BC salespeople (reference) -->
    <details class="card">
      <summary class="card-head"><span>Salespeople (BC) — {{ salespersons.length }}</span></summary>
      <DataTable :value="salespersons" v-model:filters="columnFilters.salespersons" filterDisplay="row" scrollable size="small" paginator :rows="10" responsiveLayout="scroll"><template #header><Button label="Clear column searches" icon="pi pi-filter-slash" text size="small" @click="clearColumnFilters('salespersons')" /></template><template #empty>No rows match these column searches.</template>
        <Column header="Code" style="width:120px"  field="code" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search code" aria-label="Search Code" fluid @input="filterCallback()" /></template></Column>
        <Column header="Name"  field="name" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><InputText v-model="filterModel.value" placeholder="Search name" aria-label="Search Name" fluid @input="filterCallback()" /></template></Column>
      </DataTable>
    </details>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Message from 'primevue/message'

const newColumnFilters=()=>({"mappings": {"UnitSearch":{"value":null,"matchMode":"contains"},"ItemNo": {"value": null, "matchMode": "contains"}, "Description": {"value": null, "matchMode": "contains"}, "BarcodeSearch": {"value": null, "matchMode": "contains"}, "Chiller": {"value": null, "matchMode": "contains"}}, "staffRows": {"DisplayName": {"value": null, "matchMode": "contains"}, "Username": {"value": null, "matchMode": "contains"}, "_role": {"value": null, "matchMode": "contains"}}, "vessels": {"Code": {"value": null, "matchMode": "contains"}, "Description": {"value": null, "matchMode": "contains"}, "TareWeight": {"value": null, "matchMode": "equals"}}, "vehicles": {"Plate": {"value": null, "matchMode": "contains"}, "Make": {"value": null, "matchMode": "contains"}, "LoadCapacity": {"value": null, "matchMode": "equals"}, "TareWeight": {"value": null, "matchMode": "equals"}, "Status": {"value": null, "matchMode": "equals"}}, "routes": {"value": {"value": null, "matchMode": "contains"}, "label": {"value": null, "matchMode": "contains"}}, "salespersons": {"code": {"value": null, "matchMode": "contains"}, "name": {"value": null, "matchMode": "contains"}}})
const columnFilters=ref(newColumnFilters())
function clearColumnFilters(table){columnFilters.value[table]=newColumnFilters()[table]}
const withBarcodeSearch=rows=>rows.map(row=>({...row,UnitSearch:(row.UnitConversions||[]).map(u=>`${u.Company}: 1 ${u.Uom} = ${u.KgPerUom} kg`).join(' '),BarcodeSearch:(row.Barcodes||[]).map(b=>`${b.Company}: ${b.Barcode}`).join(' \n')}))
const syncCompany=ref('FCL'),packedExportRows=ref([]),scheduleRows=ref([]),savingSchedule=ref('')
const pullStatus=ref({runs:[],schedule:null}),pulling=ref(false),pushing=ref(false),loadingPulls=ref(false),pullError=ref('')
const syncTime=v=>v?new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):'—'
async function loadPullHistory(){if(loadingPulls.value)return;loadingPulls.value=true;const company=syncCompany.value;try{const [history,packed]=await Promise.all([dispatchApi.syncStatus({company}),dispatchApi.packedExport(company)]);if(company===syncCompany.value){pullStatus.value=history.data;packedExportRows.value=packed.data}}catch(e){pullError.value=e.response?.data?.error||e.message}finally{loadingPulls.value=false;if(company!==syncCompany.value)loadPullHistory()}}
async function pullOrders(){pulling.value=true;pullError.value='';try{const {data}=await dispatchApi.importFromBc([syncCompany.value]);done(`${data.imported} orders imported; ${data.skipped} already present`);if(data.errors?.length)pullError.value='Some orders or companies failed. See the history below.'}catch(e){pullError.value=e.response?.data?.error||e.message}finally{pulling.value=false;await loadPullHistory()}}
async function pushPacked(){pushing.value=true;pullError.value='';try{const {data}=await dispatchApi.pushPacked(syncCompany.value);done(`${data.exported} packed lines exported; ${data.skipped} already exported`);if(data.errors?.length)pullError.value='Some orders could not be exported. See the history below.'}catch(e){pullError.value=e.response?.data?.error||e.message}finally{pushing.value=false;await loadPullHistory()}}
watch(syncCompany,()=>{pullStatus.value={runs:[],schedule:null};packedExportRows.value=[];scheduleRows.value=[];loadPullHistory();loadSchedules()})
async function loadSchedules(){const company=syncCompany.value;try{const {data}=await dispatchApi.syncSchedules(company);if(company===syncCompany.value)scheduleRows.value=data}catch(e){pullError.value=e.response?.data?.error||e.message}}
async function saveSchedule(setting){savingSchedule.value=setting.Kind;pullError.value='';try{const {data}=await dispatchApi.saveSyncSchedule(syncCompany.value,{kind:setting.Kind,enabled:setting.Enabled,intervalMinutes:setting.IntervalMinutes});const saved=data.find(s=>s.Kind===setting.Kind);Object.assign(setting,saved);done('Schedule saved');await loadPullHistory()}catch(e){pullError.value=e.response?.data?.error||e.message}finally{savingSchedule.value=''}}
let pullHistoryTimer
onMounted(()=>{loadPullHistory();loadSchedules();pullHistoryTimer=setInterval(loadPullHistory,15000)})
onUnmounted(()=>clearInterval(pullHistoryTimer))
const toast = useToast()
const vessels = ref([]); const vehicles = ref([]); const routes = ref([]); const salespersons = ref([])
const error = ref(null)
const chillerConfig = ref({ BypassAssignment: false, StockCompany: 'FCL', StockLocation: '3535' })
const mappings = ref([])
async function loadChillers() {
  const { data } = await dispatchApi.chillerConfig()
  chillerConfig.value = { ...data, BypassAssignment: !!data.BypassAssignment }
  mappings.value = withBarcodeSearch(data.mappings)
}
async function saveChillerSettings() {
  try { await dispatchApi.saveChillerConfig(chillerConfig.value); done('Assembly settings saved') } catch (e) { fail(e) }
}
async function saveMapping(row) {
  try { await dispatchApi.saveChillerMapping(row); await loadChillers(); done('Mapping saved') } catch (e) { fail(e) }
}
async function deleteMapping(row) {
  if (row._new) { mappings.value = mappings.value.filter(r => r !== row); return }
  try { await dispatchApi.deleteChillerMapping(row.ItemNo); await loadChillers(); done('Mapping deleted') } catch (e) { fail(e) }
}

async function loadAll() {
  error.value = null
  try {
    await loadChillers()
    vessels.value = (await dispatchApi.setupVessels()).data || []
    vehicles.value = (await dispatchApi.setupVehicles()).data || []
    dispatchApi.bcRoutes().then(r => { routes.value = r.data || [] }).catch(() => {})
    dispatchApi.bcSalespersons().then(r => { salespersons.value = r.data || [] }).catch(() => {})
  } catch (e) { error.value = e.response?.data?.error || e.message }
}
const done = (m) => toast.add({ severity: 'success', summary: m, life: 2000 })
const fail = (e) => toast.add({ severity: 'error', summary: 'Failed', detail: e.response?.data?.error || e.message, life: 4000 })

function addVessel() { clearColumnFilters('vessels'); vessels.value.unshift({ VesselTypeId: null, Code: '', Description: '', TareWeight: 0 }) }
async function saveVessel(v) {
  try { const r = await dispatchApi.saveVessel({ vesselTypeId: v.VesselTypeId, code: v.Code, description: v.Description, tareWeight: v.TareWeight })
    if (r.data.vesselTypeId) v.VesselTypeId = r.data.vesselTypeId; done('Vessel saved') } catch (e) { fail(e) }
}
async function delVessel(v) {
  if (!v.VesselTypeId) { vessels.value = vessels.value.filter(x => x !== v); return }
  try { await dispatchApi.deleteVessel(v.VesselTypeId); vessels.value = vessels.value.filter(x => x !== v); done('Deleted') } catch (e) { fail(e) }
}

function addVehicle() { clearColumnFilters('vehicles'); vehicles.value.unshift({ VehicleId: null, Plate: '', Make: '', LoadCapacity: 0, TareWeight: 0, Status: 'active' }) }
async function saveVehicle(v) {
  try { const r = await dispatchApi.saveVehicle({ vehicleId: v.VehicleId, plate: v.Plate, make: v.Make, loadCapacity: v.LoadCapacity, tareWeight: v.TareWeight, status: v.Status })
    if (r.data.vehicleId) v.VehicleId = r.data.vehicleId; done('Vehicle saved') } catch (e) { fail(e) }
}
async function delVehicle(v) {
  if (!v.VehicleId) { vehicles.value = vehicles.value.filter(x => x !== v); return }
  try { await dispatchApi.deleteVehicle(v.VehicleId); vehicles.value = vehicles.value.filter(x => x !== v); done('Deleted') } catch (e) { fail(e) }
}

loadAll()

const syncingRules = ref(false)
async function syncRules() {
  syncingRules.value=true
  try { const {data}=await dispatchApi.syncDispatchItemRules(); mappings.value=withBarcodeSearch((await dispatchApi.chillerConfig()).data.mappings); toast.add({severity:'success',summary:'Item rules refreshed',detail:`${data.mapped} sausage items mapped to U / B`,life:4000}) }
  catch(e){error.value=e.response?.data?.error||e.message}
  finally{syncingRules.value=false}
}

const staffRows=ref([]),refreshingUnits=ref(false)
const staffRoles=[{label:'Assembler',value:'assembler'},{label:'Packer (also assembly)',value:'packer'},{label:'Confirmer',value:'checker'}]
async function loadStaff(){try{staffRows.value=(await dispatchApi.staff()).data.map(r=>({...r,_role:r.Role}))}catch(e){fail(e)}}
async function saveStaffRole(row){try{await dispatchApi.assignStaffRole(row.UserId,row._role);done('Role assigned; ask the user to sign in again');await loadStaff()}catch(e){fail(e)}}
async function refreshUnits(){refreshingUnits.value=true;try{const r=await dispatchApi.refreshUoms();await loadChillers();done(`${r.data.count} BC item units cached`)}catch(e){fail(e)}finally{refreshingUnits.value=false}}
loadStaff()
</script>

<style scoped>
.ds-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.config-row { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:12px 0; }
.config-row label { display:flex; flex-direction:column; gap:4px; }
.ds-page h2 { margin: 0; font-size: 20px; }
.card { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #eef0f3; font-weight: 700; font-size: 13px; cursor: default; }
.section-body { padding: 12px; }
.section-actions { padding: 8px 12px; }
details.card > summary.card-head::after { content: "▸"; margin-left: auto; }
details.card[open] > summary.card-head::after { content: "▾"; }
details.card > summary.card-head:focus-visible { outline: 2px solid var(--bc-primary-light); outline-offset: -2px; }
details.card > summary.card-head { cursor: pointer; list-style: none; }
details.card > summary.card-head::-webkit-details-marker { display: none; }
@media (prefers-color-scheme: dark) {
  .card { border-color: #2c3a4f; }
  .card-head { background: #1f2937; border-bottom-color: #2c3a4f; }
}
</style>
