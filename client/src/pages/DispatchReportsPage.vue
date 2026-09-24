<template>
  <section class="reports">
    <div class="chart-controls"><h2>Dispatch reports</h2><Button label="Sync status" icon="pi pi-sync" severity="secondary" @click="tab='Syncs';loadSyncs()" /></div>
    <div class="filters">
      <label>From<InputText v-model="filters.dateFrom" type="date" /></label><label>To<InputText v-model="filters.dateTo" type="date" /></label>
      <label v-for="field in filterFields" :key="field.key">{{ field.label }}<Select v-model="filters[field.key]" :options="lookups[field.key]||[]" option-label="label" option-value="value" editable filter show-clear :placeholder="field.placeholder||'Select or type BC filter'" :virtualScrollerOptions="{itemSize:38}" /></label>
      <Button label="Apply filters" :loading="loading" @click="load" /><Button label="Clear" severity="secondary" @click="clearFilters" />
    </div>
    <p class="hint">BC filters: <code>JF*</code> starts with JF · <code>*beef*</code> contains beef · <code>B2235|B2240</code> either code · <code>B22??</code> two unknown characters. Plain text matches exactly; search dropdowns by code or name.</p>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <p>Activity uses assembly/packing dates; the order list uses shipment dates. Assembly tonnage uses the latest revision of each line.</p>
    <div class="totals"><article><strong>{{ tonnes(packedKg) }} t</strong><span>Packed (closed boxes)</span></article><article><strong>{{ tonnes(assembledKg) }} t</strong><span>Assembled</span></article><article><strong>{{ sessions.length }}</strong><span>Sessions</span></article><article><strong>{{ pendingOrders }}</strong><span>Orders awaiting full packing</span></article></div>
    <Message v-if="missingKg" severity="warn">{{ missingKg }} assembly entries have no historical KG conversion and are excluded from tonnage.</Message>
    <div class="pipeline"><button v-for="stage in stages" :key="stage.label" @click="selectedStatus=selectedStatus===stage.key?'':stage.key;tab='Orders'" :class="{selected:selectedStatus===stage.key}"><strong>{{ stage.count }}</strong><span>{{ stage.label }}</span><progress :value="stage.count" :max="Math.max(orderCount,1)" /></button></div>
    <p v-if="selectedStatus">Order table: {{ selectedStatus }} <Button label="Show all statuses" text @click="selectedStatus=''" /></p>
    <h3>Tonnage by {{ groupBy.toLowerCase() }} <small>(top 20)</small></h3>
    <div class="chart-controls"><Select v-model="metric" :options="[{label:'Packed tonnage',value:'packing'},{label:'Assembly tonnage',value:'assembly'}]" option-label="label" option-value="value" /><Select v-model="groupBy" :options="['Operator','Day','Item']" /></div>
    <div class="chart" role="img" :aria-label="`${metric} tonnage by ${groupBy}`"><p v-if="!bars.length">No tonnage for the selected filters.</p><div v-for="bar in bars" :key="bar.label" class="bar-row"><span>{{ bar.label }}</span><div class="bar-track"><div :style="{width:`${bar.percent}%`}" /></div><strong>{{ tonnes(bar.kg) }} t</strong></div></div>
    <nav class="tabs"><button v-for="v in ['Orders','Activity','Sessions','Claims','Syncs']" :key="v" :class="{active:tab===v}" @click="tab=v">{{ v }}</button><Button label="Export CSV" text icon="pi pi-download" @click="download" /></nav>
    <DataTable v-if="tab==='Orders'" :value="orderRows" paginator :rows="25" scrollable size="small">
      <Column field="OrderNo" header="Order" /><Column field="Company" header="Company" /><Column header="Customer"><template #body="{data:r}">{{ r.CustomerNo }} - {{ r.CustomerName }}</template></Column><Column field="ShipmentDate" header="Shipment" /><Column field="Status" header="Status" /><Column header="Item"><template #body="{data:r}">{{ r.ItemNo }} - {{ r.Description }}</template></Column><Column field="OrderQty" header="Ordered" /><Column field="AssembledQty" header="Assembled" /><Column field="PackedQty" header="Packed" /><Column field="Uom" header="UOM" /><Column field="RouteCode" header="Route" /><Column field="SalespersonName" header="Salesperson" /><Column field="ClaimedBy" header="Claimed by" />
    </DataTable>
    <DataTable v-if="tab==='Activity'" :value="data.activity" paginator :rows="25" scrollable size="small">
      <Column field="Stage" header="Stage" /><Column field="Status" header="Status" /><Column field="OrderNo" header="Order" /><Column header="Item"><template #body="{data:r}">{{ r.ItemNo }} - {{ r.Description }}</template></Column><Column field="Quantity" header="Quantity" /><Column field="Uom" header="UOM" /><Column field="Pieces" header="Pieces" /><Column field="WeightKg" header="KG" /><Column field="BatchNo" header="Batch" /><Column field="Operator" header="Operator" /><Column header="Time"><template #body="{data:r}">{{ time(r.ActivityAt) }}</template></Column>
    </DataTable>
    <DataTable v-if="tab==='Sessions'" :value="sessions" paginator :rows="25" scrollable size="small">
      <Column field="Stage" header="Stage" /><Column field="UserName" header="Operator" /><Column field="CheckerName" header="Confirmer" /><Column header="Started"><template #body="{data:r}">{{ time(r.StartedAt) }}</template></Column><Column header="Ended"><template #body="{data:r}">{{ r.EndedAt?time(r.EndedAt):'In progress' }}</template></Column><Column header="Minutes"><template #body="{data:r}">{{ (r.DurationSeconds/60).toFixed(1) }}</template></Column><Column header="Details"><template #body="{data:r}"><Button label="Activity" text @click="filters.operator=r.UserName;tab='Activity';load()" /></template></Column>
    </DataTable>
    <DataTable v-if="tab==='Claims'" :value="data.claims" paginator :rows="25" size="small">
      <Column field="OrderNo" header="Order" /><Column field="Stage" header="Stage" /><Column field="UserName" header="Operator" /><Column header="Picked at"><template #body="{data:r}">{{ time(r.ClaimedAt) }}</template></Column><Column v-if="supervisor"><template #body="{data:r}"><Button label="Release claim" severity="warn" @click="release(r)" /></template></Column>
    </DataTable>
    <section v-if="tab==='Syncs'" class="sync-panel">
      <div><h3>Dispatch syncs</h3><Button label="Refresh status" :loading="syncLoading" @click="loadSyncs" /></div>
      <Message v-if="syncError" severity="error">{{ syncError }}</Message>
      <p>Status refreshes every 15 seconds while this tab is open. Run history starts with this update; an unfinished run may indicate an interrupted server process.</p>
      <div class="totals"><article v-for="u in syncData.units" :key="u.Company"><strong>{{ u.Company }}</strong><span>{{ u.CachedUnits }} cached item units</span><span>Refreshed {{ time(u.RefreshedAt) }}</span><span>{{ u.MissingKg }} missing KG conversions</span></article></div>
      <DataTable :value="syncData.runs" paginator :rows="10" scrollable>
        <template #empty>No sync runs recorded yet.</template>
        <Column field="Kind" header="Sync" /><Column field="status" header="Status" />
        <Column header="Started"><template #body="{data:r}">{{ time(r.startedAt) }}</template></Column>
        <Column header="Finished"><template #body="{data:r}">{{ r.endedAt?time(r.endedAt):'Not finished' }}</template></Column>
        <Column header="Result"><template #body="{data:r}">{{ syncSummary(r) }}</template></Column>
      </DataTable>
    </section>
  </section>
</template>
<script setup>
import {ref,computed,onMounted,onUnmounted,watch} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import {useAuthStore} from '@/stores/auth.js'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
const auth=useAuthStore(),supervisor=computed(()=>['admin','dispatch-supervisor'].includes(auth.effectiveRole))
const filters=ref({dateFrom:'',dateTo:'',item:'',customer:'',order:'',route:'',salesperson:'',operator:''}),data=ref({activity:[],orders:[],sessions:[],claims:[]}),loading=ref(false),error=ref(''),tab=ref('Orders'),metric=ref('packing'),groupBy=ref('Operator')
const filterFields=[{key:'item',label:'Item code / name'},{key:'customer',label:'Customer number / name'},{key:'order',label:'Order number'},{key:'salesperson',label:'Salesperson'},{key:'route',label:'Route'},{key:'operator',label:'Packer / assembler'}]
const lookups=ref({}),applied=ref({}),selectedStatus=ref(''),syncData=ref({runs:[],units:[]}),syncLoading=ref(false),syncError=ref('')
const orderStatus=r=>['packed','loaded'].includes(r.Status)?'Packed':r.Status==='packing'?'Ongoing':'Pending'
const orderRows=computed(()=>data.value.orders.filter(r=>!selectedStatus.value||orderStatus(r)===selectedStatus.value))
const orderCount=computed(()=>new Set(data.value.orders.map(r=>r.DispatchOrderId)).size)
const stages=computed(()=>['Pending','Ongoing','Packed'].map(key=>({key,label:key==='Pending'?'Awaiting full packing':key==='Ongoing'?'Packing in progress':'Fully packed',count:new Set(data.value.orders.filter(r=>orderStatus(r)===key).map(r=>r.DispatchOrderId)).size})))
function syncSummary(r){if(r.error)return r.error;if(!r.result)return r.status==='running'?'Refresh in progress':'No result recorded';return Object.entries(r.result).map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):value}`).join(' · ')}
function clearFilters(){for(const key of Object.keys(filters.value))filters.value[key]='';selectedStatus.value='';load()}
async function loadSyncs(){if(syncLoading.value)return;syncLoading.value=true;syncError.value='';try{syncData.value=(await dispatchApi.syncStatus()).data}catch(e){syncError.value=e.response?.data?.error||e.message}finally{syncLoading.value=false}}
watch(tab,v=>{if(v==='Syncs')loadSyncs()})
const tonnes=kg=>(Number(kg||0)/1000).toLocaleString('en-KE',{maximumFractionDigits:4}),time=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})
const packedKg=computed(()=>data.value.activity.filter(r=>r.Stage==='packing'&&r.Status==='packed').reduce((n,r)=>n+Number(r.WeightKg||0),0))
const assembledKg=computed(()=>data.value.activity.filter(r=>r.Stage==='assembly').reduce((n,r)=>n+Number(r.WeightKg||0),0))
const missingKg=computed(()=>data.value.activity.filter(r=>r.Stage==='assembly'&&r.WeightKg==null).length)
const pendingOrders=computed(()=>new Set(data.value.orders.filter(r=>!['packed','loaded'].includes(r.Status)).map(r=>r.DispatchOrderId)).size)
const sessions=computed(()=>{const restricted=applied.value.item||applied.value.customer||applied.value.order||applied.value.route||applied.value.salesperson;const ids=new Set(data.value.activity.map(r=>r.SessionId));return restricted?data.value.sessions.filter(s=>ids.has(s.SessionId)):data.value.sessions})
const bars=computed(()=>{const map=new Map();for(const r of data.value.activity){if(r.Stage!==metric.value||(r.Stage==='packing'&&r.Status!=='packed')||r.WeightKg==null)continue;const key=groupBy.value==='Operator'?r.Operator:groupBy.value==='Item'?r.ItemNo:new Date(r.ActivityAt).toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'});map.set(key,(map.get(key)||0)+Number(r.WeightKg))}const rows=[...map].map(([label,kg])=>({label,kg})).sort((a,b)=>b.kg-a.kg).slice(0,20),max=Math.max(...rows.map(r=>r.kg),1);return rows.map(r=>({...r,percent:r.kg/max*100}))})
async function load(){loading.value=true;error.value='';try{if(filters.value.dateFrom&&filters.value.dateTo&&filters.value.dateFrom>filters.value.dateTo)throw new Error('Check the date range');const query={...filters.value};data.value=(await dispatchApi.reports(query)).data;applied.value=query}catch(e){error.value=e.response?.data?.error||e.message}finally{loading.value=false}}
async function release(row){try{await dispatchApi.releaseOrder(row.DispatchOrderId);await load()}catch(e){error.value=e.response?.data?.error||e.message}}
function download(){const rows=tab.value==='Syncs'?syncData.value.runs:tab.value==='Orders'?orderRows.value:tab.value==='Sessions'?sessions.value:data.value[tab.value.toLowerCase()];if(!rows?.length)return;const keys=Object.keys(rows[0]),cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const url=URL.createObjectURL(new Blob(['\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`dispatch-${tab.value.toLowerCase()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
let syncTimer
onMounted(async()=>{load();try{lookups.value=(await dispatchApi.reportLookups()).data}catch(e){error.value=e.response?.data?.error||e.message}syncTimer=setInterval(()=>{if(tab.value==='Syncs')loadSyncs()},15000)})
onUnmounted(()=>clearInterval(syncTimer))
</script>
<style scoped>.pipeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.pipeline button{display:grid;gap:.6rem;padding:1rem;text-align:left;border:1px solid var(--p-content-border-color);border-radius:10px;background:var(--p-content-background);color:inherit;cursor:pointer}.pipeline strong{font-size:1.8rem}.pipeline .selected{outline:2px solid var(--p-primary-color)}.pipeline progress{width:100%;accent-color:var(--p-primary-color)}.sync-panel{display:grid;gap:1rem}.hint{font-size:.9rem}.reports{display:grid;gap:1rem;padding:1rem;min-width:0}.filters,.chart-controls,.tabs{display:flex;flex-wrap:wrap;gap:.6rem;align-items:end}.filters label{display:grid;gap:.3rem}.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.totals article{display:grid;gap:.5rem;padding:1rem;border:1px solid var(--p-content-border-color);border-radius:10px}.totals strong{font-size:1.6rem}.chart{display:grid;gap:.7rem;padding:1rem;border:1px solid var(--p-content-border-color);border-radius:10px}.bar-row{display:grid;grid-template-columns:180px 1fr 100px;gap:.5rem;align-items:center}.bar-track{height:20px;background:var(--p-content-hover-background);border-radius:4px}.bar-track div{height:100%;background:var(--p-primary-color);border-radius:4px}.tabs button{padding:.8rem;border:0;background:transparent;color:inherit;cursor:pointer}.tabs button.active{border-bottom:3px solid var(--p-primary-color)}@media(max-width:640px){.bar-row{grid-template-columns:100px 1fr 75px;font-size:.8rem}.filters label{width:100%}}</style>
