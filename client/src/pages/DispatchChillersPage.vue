<template>
  <div class="chiller-page">
    <h2>Chiller attendant</h2><p>Monitor assembly and the chiller out-tray. Searchable column filters can be combined with date ranges.</p>
    <div class="actions">
      <label>Chiller<Select v-model="chiller" :options="chillers" filter show-clear placeholder="All chillers" /></label>
      <label>From<InputText v-model="dateFrom" type="date" /></label><label>To<InputText v-model="dateTo" type="date" /></label>
      <label>Activity date<Select v-model="activityDate" :options="[{label:'Shipment date',value:'ShipmentDate'},{label:'Assembly date',value:'AssembledAt'}]" option-label="label" option-value="value" /></label>
      <Button label="Apply / refresh" icon="pi pi-refresh" :loading="loading" @click="refresh" /><Button label="Clear filters" severity="secondary" @click="clearFilters" />
      <Button label="Extract filtered out-tray" icon="pi pi-download" :disabled="!stock||loading" @click="download" />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <p v-if="updated">Refreshed {{ time(updated) }}. Auto-refresh every 30 seconds. Out-tray dates refer to movement dates.</p>
    <h3>Assembly activity</h3>
    <DataTable :value="activity" v-model:filters="activityFilters" filterDisplay="row" :globalFilterFields="activityColumns.map(c=>c.field)" paginator :rows="20" size="small" scrollable>
      <template #empty>No activity matches the filters.</template>
      <Column v-for="col in activityColumns" :key="col.field" :field="col.field" :header="col.label" :showFilterMenu="false" :style="{minWidth:col.numeric?'110px':'170px'}">
        <template #body="{data}">{{ col.date ? shortDate(data[col.field]) : data[col.field] }}</template>
        <template #filter="{filterModel,filterCallback}">
          <InputNumber v-if="col.numeric" v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" fluid @update:modelValue="filterCallback()" />
          <InputText v-else-if="col.date" v-model="filterModel.value" type="date" @change="filterCallback()" />
          <Select v-else v-model="filterModel.value" :options="options(activity,col.field)" filter show-clear placeholder="All / search" fluid @change="filterCallback()" />
        </template>
      </Column>
    </DataTable>
    <h3>Chiller out-tray</h3><p>Issues and correction reversals only. Net out is for the selected movement dates; it is not an available stock balance. WMS receipts are not connected yet.</p>
    <DataTable :value="stockRows" v-model:filters="stockFilters" filterDisplay="row" paginator :rows="20" size="small" scrollable>
      <template #empty>No movements match the filters.</template>
      <Column v-for="col in stockColumns" :key="col.field" :field="col.field" :header="col.label" :showFilterMenu="false" :style="{minWidth:col.numeric?'110px':'170px'}">
        <template #filter="{filterModel,filterCallback}"><InputNumber v-if="col.numeric" v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" fluid @update:modelValue="filterCallback()" /><Select v-else v-model="filterModel.value" :options="options(stockRows,col.field)" filter show-clear placeholder="All / search" fluid @change="filterCallback()" /></template>
      </Column>
    </DataTable>
    <DispatchAssemblyReport all />
  </div>
</template>
<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue'
import DispatchAssemblyReport from '@/components/DispatchAssemblyReport.vue'
import {dispatchApi} from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Message from 'primevue/message'
const activityColumns=[{field:'Chiller',label:'Chiller'},{field:'Company',label:'Company'},{field:'OrderNo',label:'Order'},{field:'CustomerName',label:'Customer'},{field:'ItemNo',label:'Item'},{field:'Description',label:'Description'},{field:'Uom',label:'UOM'},{field:'OrderQty',label:'Ordered',numeric:true},{field:'AssembledQty',label:'Assembled',numeric:true},{field:'Pieces',label:'Pieces',numeric:true},{field:'AssembledWeight',label:'Weight (kg)',numeric:true},{field:'BatchNo',label:'Batch'},{field:'AssembledByName',label:'Assembler'},{field:'Progress',label:'Progress'},{field:'ShipmentDate',label:'Shipment date',date:true},{field:'AssembledAt',label:'Assembly date',date:true}]
const stockColumns=[{field:'Chiller',label:'Chiller'},{field:'Company',label:'Company'},{field:'LocationCode',label:'Location'},{field:'ItemNo',label:'Item'},{field:'Description',label:'Description'},{field:'IssuedQty',label:'Issued',numeric:true},{field:'ReversedQty',label:'Reversed',numeric:true},{field:'OutQty',label:'Net out',numeric:true},{field:'Uom',label:'Base UOM'}]
const makeFilters=cols=>Object.fromEntries(cols.map(c=>[c.field,{value:null,matchMode:c.date?'contains':'equals'}]))
const activityFilters=ref(makeFilters(activityColumns)),stockFilters=ref(makeFilters(stockColumns))
const chiller=ref(null),dateFrom=ref(''),dateTo=ref(''),activityDate=ref('ShipmentDate'),lines=ref([]),stock=ref(null),loading=ref(false),error=ref(''),updated=ref(null)
const time=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}),shortDate=v=>v?String(v).slice(0,10):''
const options=(rows,field)=>[...new Set(rows.map(r=>r[field]).filter(v=>v!=null&&v!==''))].sort((a,b)=>String(a).localeCompare(String(b)))
const chillers=computed(()=>options([...lines.value,...(stock.value?.rows||[])],'Chiller'))
const localDate=v=>v?new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):''
const activity=computed(()=>lines.value.map(r=>({...r,ShipmentDate:shortDate(r.ShipmentDate),AssembledAt:localDate(r.AssembledAt)})).filter(r=>{const date=shortDate(r[activityDate.value]);return (!chiller.value||r.Chiller===chiller.value)&&(!dateFrom.value||(date&&date>=dateFrom.value))&&(!dateTo.value||(date&&date<=dateTo.value))}).map(r=>({...r,Progress:r.Completed?'Completed':r.AssembledQty!=null?'In progress':'Pending'})))
const stockRows=computed(()=>(stock.value?.rows||[]).filter(r=>!chiller.value||r.Chiller===chiller.value))
async function refresh(){if(loading.value)return;error.value='';if(dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value){error.value='From date must precede to date';return}loading.value=true;const results=await Promise.allSettled([dispatchApi.chillerMonitor(),dispatchApi.chillerStock({dateFrom:dateFrom.value||undefined,dateTo:dateTo.value||undefined})]);lines.value=results[0].status==='fulfilled'?results[0].value.data:[];stock.value=results[1].status==='fulfilled'?results[1].value.data:null;updated.value=new Date().toISOString();error.value=results.filter(r=>r.status==='rejected').map(r=>r.reason.response?.data?.error||r.reason.message).join('; ');loading.value=false}
function clearFilters(){chiller.value=null;dateFrom.value='';dateTo.value='';activityFilters.value=makeFilters(activityColumns);stockFilters.value=makeFilters(stockColumns);refresh()}
function download(){const rows=stockRows.value.filter(r=>Object.entries(stockFilters.value).every(([key,f])=>f.value==null||f.value===''||r[key]===f.value));const keys=stockColumns.map(c=>c.field),cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const url=URL.createObjectURL(new Blob(['\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='chiller-out-tray.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
let timer
onMounted(()=>{refresh();timer=setInterval(refresh,30000)})
onUnmounted(()=>clearInterval(timer))
</script>
<style scoped>.chiller-page{padding:1rem;display:grid;gap:1rem;min-width:0}h2,h3,p{margin:0}.actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end}.actions label{display:grid;gap:.3rem}p{color:var(--p-text-muted-color)}</style>
