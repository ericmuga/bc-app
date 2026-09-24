<template>
  <div class="assembly-page">
    <header><div><h2>Assembly</h2><p>Start a session, select a chiller, then assemble an order.</p></div>
      <Button icon="pi pi-refresh" label="Refresh" severity="secondary" :loading="loading" @click="load" /></header>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <div class="session-bar">
      <template v-if="session"><div><strong>Assembly in progress</strong><div>Started {{ localTime(session.StartedAt) }}</div></div>
        <output class="timer" aria-label="Session elapsed time">{{ elapsed }}</output>
        <Button label="End session" severity="secondary" :loading="sessionBusy" :disabled="saving" @click="endSession" />
      </template>
      <template v-else><span>Start assembly to begin recording your time.</span><Button label="Start assembly" icon="pi pi-play" :loading="sessionBusy" @click="startSession" /></template>
    </div>
    <nav class="tabs" aria-label="Assembly views">
      <button v-for="t in tabs" :key="t.key" :class="{active:tab===t.key}" @click="changeTab(t.key)">{{ t.label }}</button>
    </nav>
    <DispatchAssemblyReport v-if="tab==='reports'" />
    <template v-else>
      <div class="filters">
        <label>Chiller<Select v-model="chiller" :options="chillers" placeholder="Select chiller" filter show-clear /></label>
        <label>Shipment from<InputText v-model="dateFrom" type="date" /></label>
        <label>Shipment to<InputText v-model="dateTo" type="date" /></label>
        <label>Customer<InputText v-model="customer" placeholder="Name or number" /></label>
        <label>Order<InputText v-model="orderFilter" placeholder="Order or dispatch number" /></label>
      </div>
      <Message v-if="dateFrom && dateTo && dateFrom>dateTo" severity="warn">Check the shipment date range.</Message>
      <Message v-if="!chiller" severity="info">Select a chiller to see its orders.</Message>
      <Message v-if="!bypass" severity="info">Assignment is enabled. Your assigned parts are shown.</Message>
      <div v-if="!loading && chiller && !orders.length" class="empty">No {{ tab==='pending'?'pending':'assembled' }} orders match these filters.</div>
      <div class="view-toggle" role="group" aria-label="Order display"><button type="button" :aria-pressed="orderView==='cards'" @click="setOrderView('cards')"><i class="pi pi-th-large" aria-hidden="true" /> Cards</button><button type="button" :aria-pressed="orderView==='list'" @click="setOrderView('list')"><i class="pi pi-list" aria-hidden="true" /> List</button></div>
      <div v-if="orderView==='cards'" class="order-grid">
        <article v-for="row in orders" :key="row.DispatchOrderId" class="order-card">
          <strong>{{ row.OrderNo }}</strong><span>{{ row.CustomerName }} · {{ row.CustomerNo }}</span>
          <small>{{ row.Company }} · {{ row.DispatchNo }} · {{ row.ShipmentDate }}</small>
          <span>{{ row.count }} {{ tab==='pending'?'pending':'assembled' }} lines · {{ chiller }}</span>
          <Button :label="tab==='pending'?'Open order':'View assembled lines'" @click="openOrder(row)" />
        </article>
      </div>
      <div v-else class="order-list" tabindex="0" role="region" aria-label="Orders list"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Company</th><th scope="col">Shipment</th><th scope="col">Lines</th><th scope="col">Action</th></tr></thead><tbody><tr v-for="row in orders" :key="row.DispatchOrderId"><td>{{ row.OrderNo }}</td><td>{{ row.CustomerNo }} - {{ row.CustomerName }}</td><td>{{ row.Company }}</td><td>{{ String(row.ShipmentDate||'').slice(0,10) }}</td><td>{{ row.count }}</td><td><Button :label="tab==='pending'?'Open order':'View assembled lines'"  @click="openOrder(row)" /></td></tr></tbody></table></div>
    </template>
    <Dialog v-model:visible="orderVisible" modal :header="order ? `${order.OrderNo} · ${order.CustomerName}` : 'Order'"
      :style="{width:'64rem'}" :breakpoints="{'800px':'98vw'}" :closable="!saving" class="assembly-order-dialog">
      <template v-if="order">
        <p>{{ order.Company }} · {{ chiller }} · <strong>{{ session ? elapsed : 'Start a session to assemble' }}</strong></p>
        <div class="scan-row"><InputText v-model="scan" placeholder="Scan barcode or type item number" @keyup.enter="scanItem" /><Button icon="pi pi-search" label="Find" @click="scanItem" /></div>
        <div class="scan-row"><Button label="Correct barcode" icon="pi pi-barcode" severity="secondary" @click="barcodeVisible=true" /><Button label="Release order" severity="secondary" @click="releaseOrder" /></div>
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
          <small>{{ line.AssembledByName }} · {{ line.ReturnReasonName }}</small>
          <Button label="Correct / reassemble" severity="secondary" :disabled="!session || !canEditOrder || !canCorrect(line)" @click="editLine(line)" />
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
        <DispatchUnitTranslation :line="editing" :pieces="form.pieces" :weight="form.assembledWeight" :weighted="weighted" @weight="form.assembledWeight=$event" />
        <label>Batch number<InputText v-model="form.batchNo" maxlength="5" placeholder="4 or 5 letters / digits" autocomplete="off" fluid /></label>
        <label v-if="differs">Return reason<Select v-model="form.returnReasonCode" :options="reasons" option-label="label" option-value="value" fluid /></label>
        <label v-if="correcting">Reason for correction<InputText v-model="form.correctionReason" maxlength="250" placeholder="Explain what changed" fluid /></label>
        <Message v-if="lineError" severity="error" :closable="false">{{ lineError }}</Message>
        <Button type="submit" :label="correcting?'Save correction':'Mark line assembled'" icon="pi pi-check" :loading="saving" :disabled="!session" />
      </form>
    </Dialog>
    <DispatchBarcodeDialog v-model="barcodeVisible" :items="order?.lines||[]" :company="order?.Company||'FCL'" :scanned="lastScan" @saved="openOrder(order,false)" />
  </div>
</template>
<script setup>
import DispatchUnitTranslation from '@/components/DispatchUnitTranslation.vue'
import {useDispatchOrderView} from '@/lib/useDispatchOrderView.js'
const {orderView,setOrderView}=useDispatchOrderView()
import { ref,computed,onMounted,onUnmounted,watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { dispatchApi } from '@/services/dispatch.js'
import { assemblyValues,isWeightUnit } from '../../../shared/dispatchAssembly.mjs'
import DispatchBarcodeDialog from '@/components/DispatchBarcodeDialog.vue'
import DispatchAssemblyReport from '@/components/DispatchAssemblyReport.vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
const auth=useAuthStore(),toast=useToast()
const barcodeVisible=ref(false),lastScan=ref('')
const tabs=[{key:'pending',label:'Pending assembly'},{key:'assembled',label:'Assembled'},{key:'reports',label:'Reports'}]
const tab=ref('pending'),session=ref(null),sessionBusy=ref(false),now=ref(Date.now()),items=ref([]),chillers=ref([]),chiller=ref(null),bypass=ref(false)
const dateFrom=ref(''),dateTo=ref(''),customer=ref(''),orderFilter=ref(''),loading=ref(false),error=ref('')
const order=ref(null),orderVisible=ref(false),editing=ref(null),lineVisible=ref(false),lineError=ref(''),saving=ref(false),scan=ref(''),form=ref({})
const reasons=[{label:'Short supply',value:'SHORT_SUPPLY'},{label:'Weight difference',value:'WEIGHT_DIFFERENCE'}]
const localTime=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})
const elapsed=computed(()=>{const s=Math.max(0,Math.floor((now.value-new Date(session.value?.StartedAt||now.value).getTime())/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')})
const orders=computed(()=>{const grouped=new Map();if(!chiller.value || (dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value))return []
  for(const row of items.value){const d=String(row.ShipmentDate||'').slice(0,10)
    if(row.Chiller!==chiller.value || (dateFrom.value&&(!d||d<dateFrom.value)) || (dateTo.value&&(!d||d>dateTo.value)))continue
    if(!`${row.CustomerName} ${row.CustomerNo}`.toLowerCase().includes(customer.value.trim().toLowerCase()) || !`${row.OrderNo} ${row.DispatchNo}`.toLowerCase().includes(orderFilter.value.trim().toLowerCase()))continue
    const current=grouped.get(row.DispatchOrderId);if(current)current.count++;else grouped.set(row.DispatchOrderId,{...row,count:1})
  }return [...grouped.values()]})
const orderLines=computed(()=>(order.value?.lines||[]).filter(l=>l.Chiller===chiller.value))
const isDone=l=>!!l.Completed||!!order.value?.parts.find(p=>p.Part===l.Part)?.Assembled
const pendingLines=computed(()=>orderLines.value.filter(l=>!isDone(l))),completedLines=computed(()=>orderLines.value.filter(isDone))
const canEditOrder=computed(()=>['confirmed','assigned','assembling','assembled'].includes(order.value?.Status))
const canCorrect=l=>['admin','dispatch-supervisor'].includes(auth.effectiveRole)||String(l.AssembledByUserId)===String(auth.user?.userId)
const correcting=computed(()=>!!editing.value&&isDone(editing.value))
const weighted=computed(()=>isWeightUnit(editing.value?.Uom)||!!editing.value?.IsWeighted)
const quantity=computed(()=>Number(weighted.value?form.value.assembledWeight:form.value.pieces))
const differs=computed(()=>!!editing.value&&Math.abs(quantity.value-Number(editing.value.OrderQty))>0.00005)
watch([quantity,differs],()=>{form.value.returnReasonCode=differs.value?(quantity.value<Number(editing.value.OrderQty)?'SHORT_SUPPLY':'WEIGHT_DIFFERENCE'):null})
const message=e=>e.response?.data?.error||e.message
async function load(){loading.value=true;error.value='';try{const [config,current]=await Promise.all([dispatchApi.chillerConfig(),dispatchApi.currentAssemblySession()]);bypass.value=!!config.data.BypassAssignment;chillers.value=config.data.chillers;session.value=current.data;if(tab.value!=='reports')items.value=(await dispatchApi.chillerWorklist(null,tab.value)).data}catch(e){error.value=message(e)}finally{loading.value=false}}
function changeTab(value){tab.value=value;load()}
async function startSession(){sessionBusy.value=true;try{session.value=(await dispatchApi.startAssemblySession()).data;now.value=Date.now()}catch(e){error.value=message(e)}finally{sessionBusy.value=false}}
async function endSession(){sessionBusy.value=true;try{await dispatchApi.endAssemblySession(session.value.SessionId);session.value=null;lineVisible.value=false;orderVisible.value=false;await load()}catch(e){error.value=message(e)}finally{sessionBusy.value=false}}
async function openOrder(row,acquire=true){try{if(acquire&&session.value&&['confirmed','assigned','assembling','assembled'].includes(row.Status))await dispatchApi.claimOrder(row.DispatchOrderId,'assembly',session.value.SessionId);order.value=(await dispatchApi.assemblyOrder(row.DispatchOrderId)).data;orderVisible.value=true}catch(e){error.value=message(e)}}
async function editLine(line){try{await dispatchApi.claimOrder(order.value.DispatchOrderId,'assembly',session.value.SessionId)}catch(e){error.value=message(e);return}editing.value=line;lineError.value='';form.value={pieces:line.Pieces??(!isWeightUnit(line.Uom)&&!line.IsWeighted?Number(line.OrderQty):null),assembledWeight:line.AssembledQty??Number(line.OrderQty),batchNo:line.BatchNo||'',returnReasonCode:line.ReturnReasonCode||null,correctionReason:''};lineVisible.value=true}
function scanItem(){lastScan.value=scan.value.trim();const q=lastScan.value.toLowerCase();scan.value='';if(!q)return;const hits=orderLines.value.filter(l=>[l.ItemNo,l.Barcode].some(v=>String(v||'').toLowerCase()===q));const hit=hits.find(l=>!isDone(l))||hits[0];if(!hit){barcodeVisible.value=true;return}if(!session.value||!canEditOrder.value||(isDone(hit)&&!canCorrect(hit)))return;editLine(hit)}
async function save(){lineError.value='';try{assemblyValues(editing.value,form.value);if(correcting.value&&!form.value.correctionReason.trim())throw new Error('Enter a reason for correction')}catch(e){lineError.value=e.message;return}
  saving.value=true;try{const result=(await dispatchApi.saveAssemblyLine(editing.value.LineId,{...form.value,sessionId:session.value.SessionId,dispatchOrderId:order.value.DispatchOrderId,chiller:chiller.value,expectedRevision:Number(editing.value.Revision||0),correct:correcting.value})).data;lineVisible.value=false;toast.add({severity:'success',summary:result.fullyAssembled?'Order assembled':'Line assembled',life:3000});await openOrder(order.value,false);await load()}catch(e){lineError.value=message(e)}finally{saving.value=false}}
async function releaseOrder(){try{await dispatchApi.releaseOrder(order.value.DispatchOrderId);orderVisible.value=false;await load()}catch(e){error.value=message(e)}}
let timer
onMounted(()=>{load();timer=setInterval(()=>now.value=Date.now(),1000)})
onUnmounted(()=>clearInterval(timer))
</script>
<style scoped>
.order-card,.line-card,.card,.box-card,.session-bar,.session,.box-banner{color:var(--bc-text)}
.view-toggle{display:flex;gap:.4rem}.view-toggle button{padding:.6rem .9rem;border:1px solid var(--bc-border);border-radius:6px;background:var(--bc-surface-card);color:var(--bc-text);cursor:pointer}.view-toggle button[aria-pressed="true"]{background:var(--bc-surface-raised);border-color:var(--p-primary-color);box-shadow:inset 0 -2px var(--p-primary-color)}
.order-list{overflow-x:auto;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card);color:var(--bc-text)}.order-list table{width:100%;border-collapse:collapse;text-align:left}.order-list th,.order-list td{padding:.8rem;border-bottom:1px solid var(--bc-border)}.order-list th{background:var(--bc-surface-raised);white-space:nowrap}.order-list td:last-child{white-space:nowrap}.order-list tbody tr:hover{background:var(--bc-surface-raised)}

.assembly-page{padding:1rem;display:grid;gap:1rem;min-width:0}header,.session-bar{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap}h2,p{margin:.2rem 0}p,small{color:var(--bc-text-muted)}.session-bar{padding:1rem;background:var(--bc-surface-card);border:1px solid var(--bc-border);border-radius:12px}.timer{font-size:1.7rem;font-variant-numeric:tabular-nums;font-weight:700}.tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--bc-border);gap:.5rem}.tabs button{padding:1rem;border:0;background:transparent;color:inherit;white-space:nowrap;cursor:pointer}.tabs button.active{border-bottom:3px solid var(--p-primary-color);color:var(--p-primary-color);font-weight:700}.filters{display:flex;gap:.75rem;flex-wrap:wrap}.filters label,.entry-form label{display:grid;gap:.4rem}.order-grid,.line-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.75rem}.order-card,.line-card{display:grid;gap:.6rem;padding:1rem;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card)}.completed{border-left:4px solid var(--p-green-500)}.scan-row{display:flex;gap:.5rem;margin:1rem 0}.scan-row input{min-width:0;flex:1}.entry-form{display:grid;gap:1rem}.empty{padding:2rem;text-align:center}@media(max-width:640px){.assembly-page{padding:.6rem}.filters label{width:100%}.order-grid,.line-grid{grid-template-columns:1fr}.session-bar{gap:.6rem}.entry-form :deep(input){font-size:16px;min-height:44px}.scan-row :deep(input){font-size:16px}.tabs button{padding:.8rem}.order-card :deep(button),.line-card :deep(button){min-height:44px}}

/* Keep order and part cards readable regardless of the surrounding theme. */
.order-card,.line-card{background:#fff;color:#111;border-color:#94a3b8}.order-card small,.line-card small,.order-card p,.line-card p{color:#374151}
</style>
