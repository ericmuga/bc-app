<template>
  <div class="assembly-page">
    <DispatchWorkerAccess stage="assembly" :locked="!sessionReady || !!session || !!offline" />
    <section v-if="offline" class="session-bar">
      <div><strong>{{ offline.active ? 'Offline assembly' : 'Orders downloaded for offline assembly' }}</strong>
        <p>{{ offline.orders.length }} orders · {{ offline.queue.filter(q=>!q.synced).length }} lines awaiting sync. Keep this browser’s stored data.</p>
        <small>Downloaded {{ localTime(offline.downloadedAt) }}. Server status changes only after successful sync.</small>
      </div>
      <Button v-if="!offline.active" label="Proceed offline with claimed orders" @click="activateOffline" />
      <Button label="Export offline backup" severity="secondary" @click="exportOffline" /><Button label="Resume online and sync" :loading="syncing" :disabled="saving || unclaiming" @click="syncOffline" />
      <div v-if="syncing || syncTotal" style="width:100%"><progress :value="syncDone" :max="syncTotal||1" style="width:100%" />{{ syncDone }} / {{ syncTotal }} lines confirmed</div>
      <div v-if="offline.active" class="view-toggle"><Button v-for="o in offline.orders" :key="o.DispatchOrderId" :label="o.OrderNo" :disabled="syncing" @click="openOfflineOrder(o)" /></div>
    </section>
    <header><div><h2>Assembly</h2><p>Start a session, select a chiller, then assemble an order.</p></div>
      <Button icon="pi pi-refresh" label="Refresh" severity="secondary" :disabled="!!offline?.active" :loading="setupLoading" @click="load" /></header>
    <Message v-if="!offline && syncedOrderIds.length" severity="success">Synced</Message>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <small v-if="setupLoading">Checking session in the background. You can set your search filters now.</small><div class="session-bar">
      <template v-if="session"><div><strong>Assembly in progress</strong><div>Started {{ localTime(session.StartedAt) }}</div></div>
        <output class="timer" aria-label="Session elapsed time">{{ elapsed }}</output>
        <Button label="End session" severity="secondary" :loading="sessionBusy" :disabled="saving || preparing || !!offline" @click="endSession" />
      </template>
      <template v-else><span>Start assembly to begin recording your time.</span><Button label="Start assembly" icon="pi pi-play" :loading="sessionBusy" :disabled="!sessionReady" @click="startSession" /></template>
    </div>
    <nav v-if="!offline?.active" class="tabs" aria-label="Assembly views">
      <button v-for="t in tabs" :key="t.key" :class="{active:tab===t.key}" @click="changeTab(t.key)">{{ t.label }}</button>
    </nav>
    <DispatchAssemblyReport v-if="!offline?.active && tab==='reports'" />
    <template v-else-if="!offline?.active">
      <fieldset class="filters" :disabled="preparing">
        <label>Chiller<Select v-model="chiller" :disabled="preparing || !!offline" :options="chillers" placeholder="Select chiller" filter show-clear /></label>
        <label>Shipment from<InputText v-model="dateFrom" type="date" /></label>
        <label>Shipment to<InputText v-model="dateTo" type="date" /></label>
        <label>Customer<InputText v-model="customer" placeholder="Name or number" /></label>
        <label>Order<InputText v-model="orderFilter" placeholder="Order or dispatch number" /></label>
        <label>Orders per page<Select v-model="pageSize" :options="[5,10]" @change="searchVersion++;items=[];searched=false;page=1;hasMore=false" /></label><Button label="Search" icon="pi pi-search" :loading="loading" :disabled="!chiller || !!(dateFrom && dateTo && dateFrom>dateTo)" @click="searchOrders" />
      </fieldset>
      <Message v-if="tab==='pending' && !searched" severity="info">Select a chiller, set any date, customer or order filters, then press Search.</Message>
      <Message v-if="dateFrom && dateTo && dateFrom>dateTo" severity="warn">Check the shipment date range.</Message>
      <Message v-if="!chiller" severity="info">Select a chiller to see its orders.</Message>
      <Message severity="info">Imported BC orders appear here after registry confirmation, or automatically when confirmation bypass is enabled. Select the matching chiller and check the shipment filters.</Message>
      <Message v-if="!bypass" severity="info">Assignment is enabled. Your assigned parts are shown.</Message>
      <small v-if="searched && ordersCheckedAt">{{ cachedOrders ? 'Cached preview — reconnect and search to open orders' : 'Checked' }} · {{ localTime(ordersCheckedAt) }}</small><div v-if="!loading && searched && chiller && !orders.length" class="empty">No {{ tab==='paused'?'paused':tab==='pending'?'pending':'assembled' }} orders match these filters.</div>
      <div class="view-toggle" v-if="searched"><Button label="Previous" :disabled="loading || page<=1" @click="searchOrders(page-1)" /><span>Page {{ page }} · {{ orders.length }} orders</span><Button label="Next" :disabled="loading || !hasMore" @click="searchOrders(page+1)" /></div><div class="view-toggle" role="group" aria-label="Order display"><button type="button" :aria-pressed="orderView==='cards'" @click="setOrderView('cards')"><i class="pi pi-th-large" aria-hidden="true" /> Cards</button><button type="button" :aria-pressed="orderView==='list'" @click="setOrderView('list')"><i class="pi pi-list" aria-hidden="true" /> List</button></div>
      <div v-if="tab==='pending'" class="view-toggle">
        <Button label="Claim orders" icon="pi pi-download" :loading="preparing" :disabled="!session || !sessionReady || cachedOrders || !selectedOrders.length" @click="claimSelectedOrders" />
        <span>{{ selectedOrders.length }} selected · maximum 5 orders including downloaded orders</span>
      </div>
      <div v-if="orderView==='cards'" class="order-grid">
        <article v-for="row in orders" :key="row.DispatchOrderId" class="order-card">
          <label v-if="tab==='pending'" class="order-selection"><input type="checkbox" v-model="selectedOrders" :value="row.DispatchOrderId" :disabled="selectionDisabled(row)" :aria-label="`Select order ${row.OrderNo}`" />{{ downloadedOrder(row) ? 'Already downloaded' : 'Select order' }}</label>
          <strong>{{ row.OrderNo }}</strong><span>{{ row.CustomerName }} · {{ row.CustomerNo }}</span>
          <small>{{ row.Company }} · {{ row.DispatchNo }} · {{ row.ShipmentDate }}</small>
          <span>{{ row.count }} {{ tab==='paused'?'paused':tab==='pending'?'pending':'assembled' }} lines · {{ chiller }}</span>
          <Button :disabled="preparing || cachedOrders || !sessionReady" :label="tab==='paused'?'Resume assembly':tab==='pending'?'Open order':'View assembled lines'" @click="openOrder(row)" /><Button v-if="tab==='paused'" label="Release order" icon="pi pi-unlock" severity="secondary" :disabled="unclaiming || pausing" @click="releasePausedOrder(row)" />
        </article>
      </div>
      <div v-else class="order-list" tabindex="0" role="region" aria-label="Orders list"><table><thead><tr><th v-if="tab==='pending'" scope="col">Select</th><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Company</th><th scope="col">Shipment</th><th scope="col">Lines</th><th scope="col">Action</th></tr></thead><tbody><tr v-for="row in orders" :key="row.DispatchOrderId"><td v-if="tab==='pending'"><label v-if="tab==='pending'" class="order-selection"><input type="checkbox" v-model="selectedOrders" :value="row.DispatchOrderId" :disabled="selectionDisabled(row)" :aria-label="`Select order ${row.OrderNo}`" />{{ downloadedOrder(row) ? 'Already downloaded' : 'Select order' }}</label></td><td>{{ row.OrderNo }}</td><td>{{ row.CustomerNo }} - {{ row.CustomerName }}</td><td>{{ row.Company }}</td><td>{{ String(row.ShipmentDate||'').slice(0,10) }}</td><td>{{ row.count }}</td><td><Button :disabled="preparing || cachedOrders || !sessionReady" :label="tab==='paused'?'Resume assembly':tab==='pending'?'Open order':'View assembled lines'"  @click="openOrder(row)" /><Button v-if="tab==='paused'" label="Release order" icon="pi pi-unlock" severity="secondary" :disabled="unclaiming || pausing" @click="releasePausedOrder(row)" /></td></tr></tbody></table></div>
    </template>
    <Dialog v-model:visible="claimProblemsVisible" modal header="Some orders could not be claimed" :style="{width:'32rem'}" :breakpoints="{'640px':'98vw'}">
      <p>These orders were not downloaded to this device:</p>
      <ul><li v-for="problem in claimProblems" :key="problem.orderNo"><strong>{{ problem.orderNo }}</strong>: {{ problem.reason }}</li></ul>
      <p>{{ offline?.orders.length || 0 }} orders are claimed and downloaded. You can proceed with these or pick another order. Downloaded orders remain reserved for you.</p>
      <div class="view-toggle"><Button label="Proceed with claimed orders" :disabled="!offline?.orders.length" @click="claimProblemsVisible=false;activateOffline()" /><Button label="Pick another order" severity="secondary" @click="claimProblemsVisible=false" /></div>
    </Dialog>
    <Dialog v-model:visible="orderVisible" modal :header="order ? `${order.OrderNo} · ${order.CustomerName}` : 'Order'"
      :style="{width:'64rem'}" :breakpoints="{'800px':'98vw'}" :closable="!saving" class="assembly-order-dialog">
      <template v-if="order">
        <p>{{ order.Company }} · {{ chiller }} · <strong>{{ session ? elapsed : 'Start a session to assemble' }}</strong></p>
        <div class="scan-row"><InputText v-model="scan" placeholder="Scan barcode or type item name / code" aria-label="Find item by name, barcode or code" :disabled="scanOpening || syncing" @keydown.enter.prevent="scanItem" /></div>
        <small v-if="scanNotice" role="status">{{ scanNotice }}</small>
        <div v-if="scanMatches.length" class="line-grid scan-results"><Button v-for="match in scanMatches" :key="match.LineId" :label="`${match.ItemNo} · ${match.Description} · Part ${match.Part}${isDone(match)?' · Assembled':''}`" severity="secondary" :disabled="scanOpening || !session || !canEditOrder || queuedLine(match) || (isDone(match) && !canCorrect(match))" @click="selectScanMatch(match)" /></div>

        <Message v-if="orderSyncStatus" :severity="orderSyncStatus==='Synced'?'success':'info'">{{ orderSyncStatus }}</Message>
        <div class="scan-row"><Button label="Pause order" icon="pi pi-pause" severity="secondary" :loading="pausing" :disabled="saving || syncing || preparing || unclaiming || !session || !canEditOrder" @click="pauseOrder" /><Button v-if="!offline?.active" label="Correct barcode" icon="pi pi-barcode" severity="secondary" @click="barcodeVisible=true" /><Button label="Release order" icon="pi pi-unlock" severity="secondary" :loading="unclaiming" :disabled="saving || syncing || preparing" @click="releaseOrder" /></div>
        <Message v-if="unclaimError" severity="warn">{{ unclaimError }}</Message>
        <h3>Not assembled ({{ pendingLines.length }})</h3>
        <p v-if="!pendingLines.length">All lines for this chiller are assembled.</p>
        <div class="line-grid"><article v-for="line in pendingLines" :key="line.LineId" class="line-card">
          <strong>{{ line.ItemNo }} · Part {{ line.Part }}</strong><span>{{ line.Description }}</span>
          <span>Ordered {{ line.OrderQty }} {{ line.Uom }}</span>
          <Button label="Assemble item" :disabled="!session || !canEditOrder" @click="editLine(line)" />
        </article></div>
        <h3>Already assembled ({{ completedLines.length }})</h3>
        <div class="line-grid"><article v-for="line in completedLines" :key="line.LineId" class="line-card completed">
          <strong>{{ line.ItemNo }} · Part {{ line.Part }}</strong><span>{{ line.Description }}</span>
          <span>{{ line.AssembledQty }} {{ line.Uom }} · {{ line.Pieces ?? '—' }} pieces · Batch {{ line.BatchNo || 'Legacy' }}</span>
          <small v-if="queuedLine(line)">{{ offline.queue.find(q=>q.lineId===line.LineId)?.synced ? 'Synced' : 'Pending sync' }}</small><small>{{ line.AssembledByName }} · {{ line.ReturnReasonName }}</small>
          <Button label="Correct / reassemble" severity="secondary" :disabled="!session || !canEditOrder || !canCorrect(line) || queuedLine(line)" @click="editLine(line)" />
        </article></div>
        <Message v-if="!canEditOrder" severity="info">Packing has started. These assembly lines are read-only.</Message>
        <p v-for="part in order.parts.filter(p=>p.Assembled)" :key="part.Part">Part {{ part.Part }} assembled.</p>
      </template>
    </Dialog>
    <Dialog v-model:visible="lineVisible" modal :header="correcting?'Correct / reassemble':'Assemble item'" :style="{width:'30rem'}" :breakpoints="{'640px':'98vw'}" :closable="!saving">
      <form v-if="editing" class="entry-form" @submit.prevent="save">
        <strong>{{ editing.ItemNo }} · {{ editing.Description }}</strong>
        <span>Ordered {{ editing.OrderQty }} {{ editing.Uom }} · {{ chiller }} · Part {{ editing.Part }}</span>
        <label v-if="weighted">Weight ({{ editing.Uom }})<InputNumber v-model="form.assembledWeight" :min="0" :maxFractionDigits="4" fluid autofocus /></label>
        <label>Pieces assembled<InputNumber v-model="form.pieces" :min="0" :maxFractionDigits="0" fluid :autofocus="!weighted" /></label>
        <label>Batch number<InputText v-model="form.batchNo" maxlength="5" placeholder="4 or 5 letters / digits" autocomplete="off" fluid /></label>
        <label v-if="differs">Return reason<Select v-model="form.returnReasonCode" :options="reasons" option-label="label" option-value="value" fluid /></label>
        <label v-if="correcting">Reason for correction<InputText v-model="form.correctionReason" maxlength="250" placeholder="Explain what changed" fluid /></label>
        <Message v-if="draftNotice" severity="warn">{{ draftNotice }}</Message><Message v-if="lineError" severity="error" :closable="false">{{ lineError }}</Message>
        <Button type="submit" :label="correcting?'Save correction':'Mark line assembled'" icon="pi pi-check" :loading="saving" :disabled="!session" />
      </form>
    </Dialog>
    <DispatchBarcodeDialog v-if="barcodeVisible" v-model="barcodeVisible" :items="order?.lines||[]" :company="order?.Company||'FCL'" :scanned="lastScan" @saved="openOrder(order,false)" />
  </div>
</template>
<script setup>
import {offlineStore} from '../../../shared/dispatchOffline.mjs'
import {onBeforeRouteLeave} from 'vue-router'
import {workerFor} from '@/lib/dispatchWorker.js'
import DispatchWorkerAccess from '@/components/DispatchWorkerAccess.vue'
import {useDispatchOrderView} from '@/lib/useDispatchOrderView.js'
const {orderView,setOrderView}=useDispatchOrderView()
import {readDispatchCache,writeDispatchCache} from '../../../shared/dispatchLocalCache.mjs'
import { ref,computed,defineAsyncComponent,onMounted,onUnmounted,watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { dispatchApi } from '@/services/dispatch.js'
import { assemblyValues,isWeightUnit } from '../../../shared/dispatchAssembly.mjs'
const DispatchBarcodeDialog=defineAsyncComponent(()=>import('@/components/DispatchBarcodeDialog.vue'))
const DispatchAssemblyReport=defineAsyncComponent(()=>import('@/components/DispatchAssemblyReport.vue'))
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
const auth=useAuthStore(),toast=useToast()
const cacheScope=()=>String(workerFor('assembly',auth.user?.userId)?.workerId||auth.user?.userId)
const offline=ref(null),syncing=ref(false),preparing=ref(false),syncDone=ref(0),syncTotal=ref(0)
const unclaiming=ref(false),pausing=ref(false),unclaimError=ref('')
const syncedOrderIds=ref([])
const orderSyncStatus=computed(()=>{
 const id=order.value?.DispatchOrderId;
 const entries=offline.value?.queue.filter(q=>q.body.dispatchOrderId===id)||[];
 if(entries.length)return entries.every(q=>q.synced)?'Synced':'Pending sync';
 if(offline.value?.orders.some(o=>o.DispatchOrderId===id))return 'Pending sync';
 return syncedOrderIds.value.includes(id)?'Synced':null;
})
const selectedOrders=ref([]),claimProblems=ref([]),claimProblemsVisible=ref(false)
const downloadedOrder=row=>!!offline.value?.orders.some(o=>o.DispatchOrderId===row.DispatchOrderId)
const selectionDisabled=row=>preparing.value || !session.value || !sessionReady.value || cachedOrders.value || downloadedOrder(row) || (!selectedOrders.value.includes(row.DispatchOrderId) && selectedOrders.value.length+(offline.value?.orders.length||0)>=5)
async function claimSelectedOrders(){
 if(preparing.value||!session.value||!sessionReady.value||cachedOrders.value)return;
 const selection=orders.value.filter(row=>selectedOrders.value.includes(row.DispatchOrderId));
 if(!selection.length)return;
 preparing.value=true;error.value='';claimProblems.value=[];
 try{
  for(const row of selection){
   try{await prepareOffline(row)}catch(e){claimProblems.value.push({orderNo:row.OrderNo,reason:message(e)})}
  }
  selectedOrders.value=[];
  if(claimProblems.value.length)claimProblemsVisible.value=true;
  else if(offline.value?.orders.length)activateOffline();
 }finally{preparing.value=false}
}
const store=()=>offlineStore(`${auth.user?.userId}:${cacheScope()}`)
const queuedLine=line=>!!offline.value?.queue.some(q=>q.lineId===line.LineId)
function persistPacket(next){
 const current=store().read();
 if((current?.version||0)!==(offline.value?.version||0))throw new Error('Offline work changed in another tab. Reload this page before continuing.');
 next.version=(current?.version||0)+1;store().write(next);offline.value=next;
}
function openOfflineOrder(o){unclaimError.value=o.releasing?'Unclaim is awaiting confirmation. Reconnect and press Unclaim order again.':'';order.value=o;chiller.value=offline.value.chiller;orderVisible.value=true}
async function prepareOffline(row){
  if(offline.value?.orders.some(o=>o.DispatchOrderId===row.DispatchOrderId))return;
  if(offline.value && (offline.value.chiller!==chiller.value || offline.value.session.SessionId!==session.value.SessionId))throw new Error('Finish the current offline bundle before changing chiller or session');
  if((offline.value?.orders.length||0)>=5)throw new Error('Download up to five orders per bundle');
  // Claim must succeed before fetching or storing any order details.
  await dispatchApi.claimOrder(row.DispatchOrderId,'assembly',session.value.SessionId);
  try{
    const downloaded=(await dispatchApi.assemblyOrder(row.DispatchOrderId)).data;
    const next=JSON.parse(JSON.stringify(offline.value||{session:session.value,chiller:chiller.value,orders:[],queue:[],active:false,downloadedAt:Date.now()}));
    next.orders.push(downloaded);persistPacket(next);
  }catch(e){
    // Do not strand an order when its download or durable write fails.
    try{await dispatchApi.releaseOrder(row.DispatchOrderId)}catch{throw new Error(`${message(e)}. The order may still be reserved to you; release it online or ask a supervisor.`)}
    throw e;
  }
}
function exportOffline(){const blob=new Blob([JSON.stringify(offline.value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`assembly-offline-${offline.value.session.SessionId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function activateOffline(){try{persistPacket({...offline.value,active:true});tab.value='pending';orderVisible.value=false;lineVisible.value=false}catch(e){error.value=message(e)}}
async function syncOffline(){
 if(syncing.value||unclaiming.value)return;syncing.value=true;error.value='';lineVisible.value=false;orderVisible.value=false;
 syncTotal.value=offline.value.queue.length;syncDone.value=offline.value.queue.filter(q=>q.synced).length;
 try{
  await dispatchApi.currentAssemblySession(); // Verify connectivity/auth even for an empty bundle.
  for(const q of offline.value.queue){
   if(q.synced)continue;
   await dispatchApi.saveAssemblyLine(q.lineId,q.body);
   const next=JSON.parse(JSON.stringify(offline.value));next.queue.find(x=>x.body.requestId===q.body.requestId).synced=true;
   persistPacket(next);syncDone.value++;
  }
  if((store().read()?.version||0)!==(offline.value?.version||0))throw new Error('Work changed in another tab. Reload before continuing');
  const confirmedOrderIds=[...new Set(offline.value.queue.filter(q=>q.synced).map(q=>q.body.dispatchOrderId))];
  store().clear();syncedOrderIds.value=[...new Set([...syncedOrderIds.value,...confirmedOrderIds])];offline.value=null;items.value=[];searched.value=false;await load();
  toast.add({severity:'success',summary:'Synced',life:4000});
 }catch(e){error.value=`Sync paused: ${message(e)}. Saved work is retained; retry with the same account. If a claim or line changed, ask a supervisor to review it.`}
 finally{syncing.value=false}
}
onBeforeRouteLeave(()=>!pausing.value && !unclaiming.value && !preparing.value && (!offline.value?.active || window.confirm('Offline work is saved on this device. Leave assembly? Return with the same account to resume.')))
const draftNotice=ref('')
const barcodeVisible=ref(false),lastScan=ref('')
const tabs=[{key:'pending',label:'Pending assembly'},{key:'paused',label:'Paused orders'},{key:'assembled',label:'Assembled'},{key:'reports',label:'Reports'}]
const tab=ref('pending'),session=ref(null),sessionBusy=ref(false),now=ref(Date.now()),items=ref([]),chillers=ref([]),chiller=ref(null),bypass=ref(false)
const shipmentToday=new Date(Date.now()+3*3600000).toISOString().slice(0,10)
const dateFrom=ref(shipmentToday),dateTo=ref(shipmentToday),customer=ref(''),orderFilter=ref(''),loading=ref(false),error=ref('')
const order=ref(null),orderVisible=ref(false),editing=ref(null),lineVisible=ref(false),lineError=ref(''),saving=ref(false),scan=ref(''),form=ref({})
const searched=ref(false),page=ref(1),pageSize=ref(5),hasMore=ref(false),setupLoading=ref(false),sessionReady=ref(false),cachedOrders=ref(false),ordersCheckedAt=ref(null)
let draftTimer
watch(form,()=>{clearTimeout(draftTimer);if(lineVisible.value&&editing.value){draftTimer=setTimeout(()=>{if(lineVisible.value&&editing.value)writeDispatchCache(cacheScope(),'assemblyDraft',{lineId:editing.value.LineId,revision:editing.value.Revision||0,form:{...form.value},state:'not-confirmed'});},500)}},{deep:true})
onUnmounted(()=>clearTimeout(draftTimer))
let searchVersion=0
watch([chiller,dateFrom,dateTo,customer,orderFilter],()=>{selectedOrders.value=[];searchVersion++;page.value=1;hasMore.value=false;items.value=[];searched.value=false;writeDispatchCache(cacheScope(),'assemblyFilters',{chiller:chiller.value,dateFrom:dateFrom.value,dateTo:dateTo.value,customer:customer.value,order:orderFilter.value})})
const reasons=[{label:'Short supply',value:'SHORT_SUPPLY'},{label:'Weight difference',value:'WEIGHT_DIFFERENCE'}]
const localTime=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})
const elapsed=computed(()=>{const s=Math.max(0,Math.floor((now.value-new Date(session.value?.StartedAt||now.value).getTime())/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')})
const orders=computed(()=>{const grouped=new Map();if(!chiller.value || (dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value))return []
  for(const row of items.value){const d=String(row.ShipmentDate||'').slice(0,10)
    if(row.Chiller!==chiller.value || (dateFrom.value&&(!d||d<dateFrom.value)) || (dateTo.value&&(!d||d>dateTo.value)))continue
    if(!`${row.CustomerName} ${row.CustomerNo}`.toLowerCase().includes(customer.value.trim().toLowerCase()) || !`${row.OrderNo} ${row.DispatchNo}`.toLowerCase().includes(orderFilter.value.trim().toLowerCase()))continue
    const current=grouped.get(row.DispatchOrderId);if(current)current.count+=Number(row.LineCount||1);else grouped.set(row.DispatchOrderId,{...row,count:Number(row.LineCount||1)})
  }return [...grouped.values()]})
const orderLines=computed(()=>(order.value?.lines||[]).filter(l=>l.Chiller===chiller.value))
const isDone=l=>!!l.Completed||!!order.value?.parts.find(p=>p.Part===l.Part)?.Assembled
const pendingLines=computed(()=>orderLines.value.filter(l=>!isDone(l))),completedLines=computed(()=>orderLines.value.filter(isDone))
const canEditOrder=computed(()=>!pausing.value && !order.value?.releasing && !unclaiming.value && ['confirmed','assigned','assembling','assembled'].includes(order.value?.Status))
const canCorrect=l=>(!workerFor('assembly',auth.user?.userId)&&['admin','dispatch-supervisor'].includes(auth.effectiveRole))||String(l.AssembledByUserId)===String(workerFor('assembly',auth.user?.userId)?.workerId||auth.user?.userId)
const correcting=computed(()=>!!editing.value&&isDone(editing.value))
const weighted=computed(()=>isWeightUnit(editing.value?.Uom)||!!editing.value?.IsWeighted)
const quantity=computed(()=>Number(weighted.value?form.value.assembledWeight:form.value.pieces))
const differs=computed(()=>!!editing.value&&Math.abs(quantity.value-Number(editing.value.OrderQty))>0.00005)
watch([quantity,differs],()=>{form.value.returnReasonCode=differs.value?(quantity.value<Number(editing.value.OrderQty)?'SHORT_SUPPLY':'WEIGHT_DIFFERENCE'):null})
const message=e=>e.response?.data?.error||e.message
async function searchOrders(targetPage=1){
  if(offline.value?.active || preparing.value)return;
  selectedOrders.value=[];
  if(typeof targetPage!=='number')targetPage=1;
  if(!chiller.value){error.value='Select a chiller';return}
  if(dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value){error.value='Check the shipment date range';return}
  const version=++searchVersion;loading.value=true;error.value='';items.value=[];searched.value=false;cachedOrders.value=false
  const cacheQuery=JSON.stringify([tab.value,chiller.value,dateFrom.value,dateTo.value,customer.value.trim(),orderFilter.value.trim(),targetPage,pageSize.value]);
  const cached=readDispatchCache(cacheScope(),'assemblyPage');if(cached?.value.query===cacheQuery){items.value=cached.value.data.rows;page.value=targetPage;hasMore.value=cached.value.data.hasMore;searched.value=true;cachedOrders.value=true;ordersCheckedAt.value=cached.savedAt}
  try{const result=await dispatchApi.chillerWorklist(null,tab.value,{page:targetPage,pageSize:pageSize.value,chiller:chiller.value,dateFrom:dateFrom.value||undefined,dateTo:dateTo.value||undefined,customer:customer.value.trim()||undefined,order:orderFilter.value.trim()||undefined});if(version===searchVersion){items.value=result.data.rows;page.value=result.data.page;hasMore.value=result.data.hasMore;searched.value=true;cachedOrders.value=false;ordersCheckedAt.value=Date.now();writeDispatchCache(cacheScope(),'assemblyPage',{query:cacheQuery,data:result.data},300000)}}
  catch(e){if(version===searchVersion)error.value=message(e)}finally{loading.value=false}
}
async function assemblyConfig(){const cached=readDispatchCache(cacheScope(),'chillers');if(cached)return {data:cached.value};const result=await dispatchApi.chillerConfig(true);writeDispatchCache(cacheScope(),'chillers',result.data,300000);return result}
async function load(){
 if(setupLoading.value || preparing.value || offline.value?.active)return;
 setupLoading.value=true;sessionReady.value=false;error.value='';
 const cached=readDispatchCache(cacheScope(),'chillers');if(cached){bypass.value=!!cached.value.BypassAssignment;chillers.value=cached.value.chillers}
 await Promise.allSettled([
  assemblyConfig().then(config=>{bypass.value=!!config.data.BypassAssignment;chillers.value=config.data.chillers}).catch(e=>{error.value=message(e)}),
  dispatchApi.currentAssemblySession().then(current=>{session.value=current.data;sessionReady.value=true}).catch(e=>{error.value=message(e)})
 ]);
 setupLoading.value=false;
}

function changeTab(value){if(preparing.value)return;selectedOrders.value=[];tab.value=value;page.value=1;hasMore.value=false;searchVersion++;items.value=[];searched.value=false}
async function startSession(){sessionBusy.value=true;try{session.value=(await dispatchApi.startAssemblySession()).data;now.value=Date.now()}catch(e){error.value=message(e)}finally{sessionBusy.value=false}}
async function endSession(){if(offline.value)return;sessionBusy.value=true;try{await dispatchApi.endAssemblySession(session.value.SessionId);session.value=null;lineVisible.value=false;orderVisible.value=false;await load()}catch(e){error.value=message(e)}finally{sessionBusy.value=false}}
async function openOrder(row,acquire=true){if(preparing.value)return;unclaimError.value='';if(tab.value==='paused'&&!session.value){error.value='Start an assembly session to resume this order';return;}if(offline.value?.active){const o=offline.value.orders.find(o=>o.DispatchOrderId===row.DispatchOrderId);if(o)openOfflineOrder(o);return;}if(cachedOrders.value||!sessionReady.value)return;try{if(acquire&&session.value&&['confirmed','assigned','assembling','assembled'].includes(row.Status))await dispatchApi.claimOrder(row.DispatchOrderId,'assembly',session.value.SessionId);order.value=(await dispatchApi.assemblyOrder(row.DispatchOrderId)).data;if(tab.value==='paused'&&acquire)items.value=items.value.filter(x=>x.DispatchOrderId!==row.DispatchOrderId);orderVisible.value=true}catch(e){error.value=message(e)}}
async function editLine(line){if(order.value?.releasing||unclaiming.value||syncing.value||queuedLine(line))return;try{if(!offline.value?.active)await dispatchApi.claimOrder(order.value.DispatchOrderId,'assembly',session.value.SessionId)}catch(e){error.value=message(e);return}editing.value=line;lineError.value='';form.value={pieces:line.Pieces??(!isWeightUnit(line.Uom)&&!line.IsWeighted?Number(line.OrderQty):null),assembledWeight:line.AssembledQty??Number(line.OrderQty),batchNo:line.BatchNo||'',returnReasonCode:line.ReturnReasonCode||null,correctionReason:''};draftNotice.value='';const draft=readDispatchCache(cacheScope(),'assemblyDraft');if(draft?.value?.lineId===line.LineId){if(Number(draft.value.revision)===Number(line.Revision||0)){form.value={...draft.value.form};draftNotice.value='Restored local draft — not confirmed as saved. Check the current line before saving.'}else{draftNotice.value='The server line has changed; the previous local draft was not restored.'}}lineVisible.value=true}
const scanMatches=ref([]),scanNotice=ref(''),scanOpening=ref(false)
let scanTimer
watch(scan,()=>{clearTimeout(scanTimer);scanMatches.value=[];scanNotice.value='';if(scan.value.trim())scanTimer=setTimeout(scanItem,400)})
watch([orderVisible,()=>order.value?.DispatchOrderId],()=>{clearTimeout(scanTimer);scan.value='';scanMatches.value=[];scanNotice.value=''})
onUnmounted(()=>clearTimeout(scanTimer))
async function selectScanMatch(hit){
 if(scanOpening.value)return;
 if(!session.value||!canEditOrder.value||queuedLine(hit)||(isDone(hit)&&!canCorrect(hit))){scanNotice.value='This line is not available for assembly or correction.';return}
 scanOpening.value=true;clearTimeout(scanTimer);scan.value='';scanMatches.value=[];
 try{await editLine(hit)}finally{scanOpening.value=false}
}
function scanItem(){
 clearTimeout(scanTimer);
 if(!orderVisible.value||lineVisible.value||scanOpening.value||syncing.value)return;
 lastScan.value=scan.value.trim();const q=lastScan.value.toLowerCase();
 if(!q)return;
 const exact=orderLines.value.filter(l=>[l.ItemNo,l.Barcode].some(v=>String(v||'').trim().toLowerCase()===q));
 const hits=exact.length?exact:orderLines.value.filter(l=>[l.ItemNo,l.Barcode,l.Description].some(v=>String(v||'').toLowerCase().includes(q)));
 scanMatches.value=hits;scanNotice.value=hits.length?'':'No matching item in this order. Check the name, item code or barcode.';
 if(hits.length===1)selectScanMatch(hits[0]);
 else if(hits.length>1)scanNotice.value='Select the matching order line.';
}
async function save(){if(pausing.value||order.value?.releasing||unclaiming.value)return;lineError.value='';try{assemblyValues(editing.value,form.value);if(correcting.value&&!form.value.correctionReason.trim())throw new Error('Enter a reason for correction')}catch(e){lineError.value=e.message;return}
  if(offline.value){
   if(!offline.value.active){lineError.value='Go offline to record downloaded orders, or resume online first.';return}
   try{
    const next=JSON.parse(JSON.stringify(offline.value));
    const body={...form.value,sessionId:session.value.SessionId,dispatchOrderId:order.value.DispatchOrderId,chiller:offline.value.chiller,expectedRevision:Number(editing.value.Revision||0),correct:correcting.value,requestId:crypto.randomUUID()};
    const v=assemblyValues(editing.value,body);
    next.queue.push({lineId:editing.value.LineId,body,synced:false});
    const target=next.orders.find(o=>o.DispatchOrderId===order.value.DispatchOrderId);const line=target.lines.find(l=>l.LineId===editing.value.LineId);
    Object.assign(line,{Completed:true,AssembledQty:v.qty,Pieces:v.pieces,BatchNo:v.batch,ReturnReasonCode:v.reason});
    persistPacket(next);order.value=offline.value.orders.find(o=>o.DispatchOrderId===target.DispatchOrderId);lineVisible.value=false;
   }catch(e){lineError.value=`Not saved: ${message(e)}`}
   return;
  }
  writeDispatchCache(cacheScope(),'assemblyDraft',{lineId:editing.value.LineId,revision:editing.value.Revision||0,form:{...form.value},state:'not-confirmed'});saving.value=true;try{const result=(await dispatchApi.saveAssemblyLine(editing.value.LineId,{...form.value,sessionId:session.value.SessionId,dispatchOrderId:order.value.DispatchOrderId,chiller:chiller.value,expectedRevision:Number(editing.value.Revision||0),correct:correcting.value})).data;clearTimeout(draftTimer);writeDispatchCache(cacheScope(),'assemblyDraft',null,1);draftNotice.value='';lineVisible.value=false;toast.add({severity:'success',summary:result.fullyAssembled?'Order assembled':'Line assembled',life:3000});await openOrder(order.value,false);items.value=[];searched.value=false;writeDispatchCache(cacheScope(),'assemblyPage',null,1);await load()}catch(e){lineError.value=message(e)}finally{saving.value=false}}
async function releasePausedOrder(row){
 order.value=row;await releaseOrder();if(unclaimError.value)error.value=unclaimError.value;
}
async function pauseOrder(){
 if(pausing.value||unclaiming.value||saving.value||syncing.value)return;
 unclaimError.value='';
 if(offline.value){unclaimError.value='Resume online and sync the downloaded orders before pausing this order.';return}
 pausing.value=true;
 try{
  await dispatchApi.pauseOrder(order.value.DispatchOrderId,session.value.SessionId);
  orderVisible.value=false;lineVisible.value=false;changeTab('paused');await searchOrders();
  toast.add({severity:'info',summary:'Order paused — reserved for you',life:3500});
 }catch(e){unclaimError.value=message(e)}finally{pausing.value=false}
}
async function releaseOrder(){
 if(pausing.value||unclaiming.value||syncing.value||saving.value||preparing.value)return;
 const id=order.value.DispatchOrderId;unclaimError.value='';
 if(offline.value?.queue.some(q=>q.body.dispatchOrderId===id&&!q.synced)){
  unclaimError.value='Sync this order’s pending assembly before unclaiming it.';return;
 }
 unclaiming.value=true;
 try{
  if(offline.value?.orders.some(o=>o.DispatchOrderId===id)){
   const next=JSON.parse(JSON.stringify(offline.value));next.orders.find(o=>o.DispatchOrderId===id).releasing=true;
   persistPacket(next);order.value=offline.value.orders.find(o=>o.DispatchOrderId===id);
  }
  await dispatchApi.releaseOrder(id);
  if(offline.value){
   const next=JSON.parse(JSON.stringify(offline.value));next.orders=next.orders.filter(o=>o.DispatchOrderId!==id);next.queue=next.queue.filter(q=>q.body.dispatchOrderId!==id);
   persistPacket(next);
   if(!next.orders.length){store().clear();offline.value=null}
  }
  orderVisible.value=false;lineVisible.value=false;selectedOrders.value=selectedOrders.value.filter(x=>x!==id);
  items.value=items.value.filter(x=>x.DispatchOrderId!==id);
  toast.add({severity:'success',summary:'Order unclaimed — available to another assembler',life:4000});
 }catch(e){unclaimError.value=`Unclaim not confirmed: ${message(e)}. Reconnect and retry Unclaim order.`}
 finally{unclaiming.value=false}
}
let timer,initTimer
onMounted(()=>{const cached=readDispatchCache(cacheScope(),'assemblyFilters');if(cached){chiller.value=cached.value.chiller;dateFrom.value=cached.value.dateFrom;dateTo.value=cached.value.dateTo;customer.value=cached.value.customer;orderFilter.value=cached.value.order}try{const packet=store().read();if(packet){offline.value=packet;session.value=packet.session;sessionReady.value=true;chiller.value=packet.chiller;chillers.value=[packet.chiller]}}catch(e){error.value=`Cannot read offline work: ${message(e)}`}
initTimer=setTimeout(load,100);timer=setInterval(()=>now.value=Date.now(),1000)})
onUnmounted(()=>{clearInterval(timer);clearTimeout(initTimer)})
</script>
<style scoped>
.scan-results{margin-bottom:1.5rem}

fieldset.filters{border:0;margin:0;padding:0;min-width:0}.order-selection{display:flex;align-items:center;gap:.6rem;min-height:44px;cursor:pointer}.order-selection input{width:22px;height:22px;accent-color:#0f766e}

.order-card,.line-card,.card,.box-card,.session-bar,.session,.box-banner{color:var(--bc-text)}
.view-toggle{display:flex;gap:.4rem}.view-toggle button{padding:.6rem .9rem;border:1px solid var(--bc-border);border-radius:6px;background:var(--bc-surface-card);color:var(--bc-text);cursor:pointer}.view-toggle button[aria-pressed="true"]{background:var(--bc-surface-raised);border-color:var(--p-primary-color);box-shadow:inset 0 -2px var(--p-primary-color)}
.order-list{overflow-x:auto;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card);color:var(--bc-text)}.order-list table{width:100%;border-collapse:collapse;text-align:left}.order-list th,.order-list td{padding:.8rem;border-bottom:1px solid var(--bc-border)}.order-list th{background:var(--bc-surface-raised);white-space:nowrap}.order-list td:last-child{white-space:nowrap}.order-list tbody tr:hover{background:var(--bc-surface-raised)}

.assembly-page{padding:1rem;display:grid;gap:1rem;min-width:0}header,.session-bar{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap}h2,p{margin:.2rem 0}p,small{color:var(--bc-text-muted)}.session-bar{padding:1rem;background:var(--bc-surface-card);border:1px solid var(--bc-border);border-radius:12px}.timer{font-size:1.7rem;font-variant-numeric:tabular-nums;font-weight:700}.tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--bc-border);gap:.5rem}.tabs button{padding:1rem;border:0;background:transparent;color:inherit;white-space:nowrap;cursor:pointer}.tabs button.active{border-bottom:3px solid var(--p-primary-color);color:var(--p-primary-color);font-weight:700}.filters{display:flex;gap:.75rem;flex-wrap:wrap}.filters label,.entry-form label{display:grid;gap:.4rem}.order-grid,.line-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.75rem}.order-card,.line-card{display:grid;gap:.6rem;padding:1rem;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card)}.completed{border-left:4px solid var(--p-green-500)}.scan-row{display:flex;gap:.5rem;margin:1rem 0}.scan-row input{min-width:0;flex:1}.entry-form{display:grid;gap:1rem}.empty{padding:2rem;text-align:center}@media(max-width:640px){.assembly-page{padding:.6rem}.filters label{width:100%}.order-grid,.line-grid{grid-template-columns:1fr}.session-bar{gap:.6rem}.entry-form :deep(input){font-size:16px;min-height:44px}.scan-row :deep(input){font-size:16px}.tabs button{padding:.8rem}.order-card :deep(button),.line-card :deep(button){min-height:44px}}

/* Keep order and part cards readable regardless of the surrounding theme. */
.order-card,.line-card{background:#fff;color:#111;border-color:#94a3b8}.order-card small,.line-card small,.order-card p,.line-card p{color:#374151}
</style>
