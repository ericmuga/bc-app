<template>
  <div class="packing-page">
    <header><div><h2>Packing</h2><p>Pack assembled orders into vessels, confirm boxes and print labels.</p></div><Button label="Refresh" icon="pi pi-refresh" :loading="loading" @click="load" /></header>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <div class="session">
      <template v-if="run"><div><strong>Packing session</strong><p>Confirmer: {{ run.CheckerName }}</p><small>Started {{ time(run.StartedAt) }}</small></div><output>{{ elapsed }}</output><Button label="End session" severity="secondary" :disabled="busy" @click="endRun" /></template>
      <template v-else><Select v-model="checkerId" :options="checkers" option-label="name" option-value="userId" placeholder="Select confirmer" filter /><Button label="Start packing session" icon="pi pi-play" :disabled="!checkerId" :loading="busy" @click="startRun" /></template>
    </div>
    <nav class="tabs"><button v-for="t in tabs" :key="t.key" :class="{active:tab===t.key}" @click="tab=t.key;load()">{{ t.label }}</button><RouterLink to="/dispatch/reports">Reports</RouterLink></nav>
    <div class="filters"><InputText v-model="search" placeholder="Search order / customer" /><InputText v-model="date" type="date" /></div>
    <div v-if="!visibleOrders.length && !loading" class="empty">No orders for this selection.</div>
    <div class="view-toggle" role="group" aria-label="Order display"><button type="button" :aria-pressed="orderView==='cards'" @click="setOrderView('cards')"><i class="pi pi-th-large" aria-hidden="true" /> Cards</button><button type="button" :aria-pressed="orderView==='list'" @click="setOrderView('list')"><i class="pi pi-list" aria-hidden="true" /> List</button></div>
      <div v-if="orderView==='cards'" class="order-grid"><article v-for="o in visibleOrders" :key="o.DispatchOrderId" class="card"><strong>{{ o.OrderNo }}</strong><span>{{ o.CustomerName }}</span><small>{{ o.Company }} · {{ o.Status }} · {{ o.BoxCount }} boxes</small><Button :label="tab==='packed'?'View packed order':'Pick order'" :disabled="tab!=='packed'&&!run" @click="openOrder(o)" /></article></div>
    <div v-else class="order-list" tabindex="0" role="region" aria-label="Orders list"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Company</th><th scope="col">Shipment</th><th scope="col">Status</th><th scope="col">Boxes</th><th scope="col">Action</th></tr></thead><tbody><tr v-for="o in visibleOrders" :key="o.DispatchOrderId"><td>{{ o.OrderNo }}</td><td>{{ o.CustomerNo }} - {{ o.CustomerName }}</td><td>{{ o.Company }}</td><td>{{ String(o.ShipmentDate||'').slice(0,10) }}</td><td>{{ o.Status }}</td><td>{{ o.BoxCount }}</td><td><Button :label="tab==='packed'?'View packed order':'Pick order'" :disabled="tab!=='packed'&&!run" @click="openOrder(o)" /></td></tr></tbody></table></div>
    <Dialog v-model:visible="orderVisible" modal :header="order ? `${order.OrderNo} · ${order.CustomerName}`:'Order'" :style="{width:'68rem'}" :breakpoints="{'800px':'98vw'}" :closable="!busy">
      <template v-if="order">
        <div class="toolbar"><span>{{ order.Company }} · {{ order.Status }} · {{ elapsed }}</span><Button v-if="editable" label="Release order" severity="secondary" @click="release" /><Button v-if="editable" label="Complete packing" :disabled="!allPacked||!!currentBox" @click="complete" /></div>
        <Message v-if="orderError" severity="error">{{ orderError }}</Message>
        <template v-if="editable">
          <div class="toolbar" v-if="!currentBox"><Select v-model="vesselId" :options="vessels" option-label="Description" option-value="VesselTypeId" placeholder="Choose vessel" filter /><Button label="Open box" :disabled="!vesselId" :loading="busy" @click="openBox" /></div>
          <div v-else class="box-banner"><strong>{{ currentBox.BoxNo }} · {{ currentBox.VesselCode }}</strong><Button label="Confirm, close and label" icon="pi pi-lock" :disabled="!currentBox.lines.length" :loading="busy" @click="closeBox" /></div>
          <div class="toolbar"><InputText v-model="scan" placeholder="Scan barcode / item number" @keyup.enter="scanItem" /><Button label="Find" @click="scanItem" /><Button label="Correct barcode" severity="secondary" @click="barcodeVisible=true" /></div>
        </template>
        <h3>Items</h3><div class="line-grid"><article v-for="line in order.lines" :key="line.LineId" class="card" :class="{done:remaining(line)<=0}">
          <strong>{{ line.ItemNo }} · {{ line.Description }}</strong><span>{{ line.PackedQty }} / {{ line.AssembledQty ?? 0 }} {{ line.Uom }} packed</span>
          <small>Assembly batch {{ line.BatchNo || 'not recorded' }} · {{ line.PackedPieces }} / {{ line.AssembledPieces ?? '—' }} pieces</small>
          <Button :label="remaining(line)<=0?'Packed':'Pack item'" :disabled="!editable||!currentBox||remaining(line)<=0" @click="editLine(line)" />
        </article></div>
        <h3>Boxes</h3><article v-for="b in order.boxes" :key="b.BoxId" class="box-card">
          <div class="toolbar"><strong>{{ b.BoxNo }} · {{ b.VesselCode }} · {{ b.Status }}</strong><span>{{ b.GrossWeight }} kg gross</span>
            <Button v-if="b.Status==='closed'||b.Status==='loaded'" label="Label" icon="pi pi-print" @click="showLabel(b)" />
            <Button v-if="b.Status==='closed'&&!b.LoadedAt&&!b.LoadingSessionId" label="Unpack (supervisor)" severity="warn" :disabled="!run" @click="requestUnpack(b)" />
          </div>
          <div v-for="line in b.lines" :key="line.BoxLineId" class="box-line"><span>{{ line.ItemNo }} · {{ line.Qty }} · {{ line.Pieces }} pieces · {{ line.Weight }} kg · Batch {{ line.BatchNo }}</span><Button v-if="b.Status==='open'&&editable" icon="pi pi-times" aria-label="Remove from box" severity="danger" text @click="removeLine(line)" /></div>
        </article>
      </template>
    </Dialog>
    <Dialog v-model:visible="lineVisible" modal header="Pack item" :style="{width:'30rem'}" :breakpoints="{'640px':'98vw'}" :closable="!busy">
      <form v-if="editing" class="entry" @submit.prevent="saveLine"><strong>{{ editing.ItemNo }} · {{ editing.Description }}</strong><p>Remaining {{ remaining(editing) }} {{ editing.Uom }}. Assembly values are prefilled and editable.</p>
        <label v-if="weighted">Weight ({{ editing.Uom }})<InputNumber v-model="form.assembledWeight" :min="0" :maxFractionDigits="4" fluid /></label>
        <label>Pieces<InputNumber v-model="form.pieces" :min="0" :maxFractionDigits="0" fluid /></label><DispatchUnitTranslation :line="editing" :pieces="form.pieces" :weight="form.assembledWeight" :weighted="weighted" @weight="form.assembledWeight=$event" />
        <label>Batch<InputText v-model="form.batchNo" maxlength="5" fluid /></label>
        <Message v-if="lineError" severity="error">{{ lineError }}</Message><Button type="submit" label="Mark packed into box" icon="pi pi-check" :loading="busy" />
      </form>
    </Dialog>
    <Dialog v-model:visible="unpackVisible" modal header="Supervisor authorization" :style="{width:'30rem'}" :breakpoints="{'640px':'98vw'}">
      <form class="entry" @submit.prevent="unpack"><p>Reopen {{ unpackTarget?.BoxNo }}. The old label will be invalidated.</p>
        <label>Supervisor / admin username<InputText v-model="credentials.username" autocomplete="username" /></label><label>Password<InputText v-model="credentials.password" type="password" autocomplete="current-password" /></label><label>Reason<InputText v-model="credentials.reason" maxlength="250" /></label>
        <Message v-if="unpackError" severity="error">{{ unpackError }}</Message><Button type="submit" label="Authorize unpacking" severity="warn" :loading="busy" /></form>
    </Dialog>
    <Dialog v-model:visible="labelVisible" modal header="Box label" :style="{width:'360px'}"><div v-if="labelData" class="label"><img :src="labelData.qrImage" alt="Box QR code" /><strong>{{ labelData.label.boxNo }}</strong><span>Order {{ labelData.label.orderNo }}</span><span>{{ labelData.label.customerName }}</span><span>{{ labelData.label.estWeight }} kg net · {{ labelData.label.grossWeight }} kg gross</span><span>Batch {{ labelData.label.batches }}</span><span>Confirmed by {{ labelData.label.confirmer }}</span></div><template #footer><Button label="Print" icon="pi pi-print" @click="printLabel" /></template></Dialog>
    <DispatchBarcodeDialog v-model="barcodeVisible" :items="order?.lines||[]" :company="order?.Company||'FCL'" :scanned="lastScan" @saved="refreshOrder" />
  </div>
</template>
<script setup>
import DispatchUnitTranslation from '@/components/DispatchUnitTranslation.vue'
import {useDispatchOrderView} from '@/lib/useDispatchOrderView.js'
const {orderView,setOrderView}=useDispatchOrderView()
import {ref,computed,onMounted,onUnmounted,watch} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import {assemblyValues,isWeightUnit} from '../../../shared/dispatchAssembly.mjs'
import DispatchBarcodeDialog from '@/components/DispatchBarcodeDialog.vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
const tabs=[{key:'pending',label:'Pending packing'},{key:'ongoing',label:'Ongoing'},{key:'packed',label:'Packed'}]
const tab=ref('pending'),run=ref(null),checkerId=ref(null),checkers=ref([]),vessels=ref([]),vesselId=ref(null),orders=ref([]),loading=ref(false),busy=ref(false),error=ref(''),search=ref(''),date=ref(''),now=ref(Date.now())
const order=ref(null),orderVisible=ref(false),orderError=ref(''),editing=ref(null),lineVisible=ref(false),lineError=ref(''),form=ref({}),requestId=ref(''),scan=ref(''),lastScan=ref(''),barcodeVisible=ref(false)
const unpackVisible=ref(false),unpackTarget=ref(null),credentials=ref({}),unpackError=ref(''),labelVisible=ref(false),labelData=ref(null)
const msg=e=>e.response?.data?.error||e.message,time=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})
const elapsed=computed(()=>{const s=Math.max(0,Math.floor((now.value-new Date(run.value?.StartedAt||now.value).getTime())/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')})
const visibleOrders=computed(()=>orders.value.filter(o=>`${o.OrderNo} ${o.CustomerName}`.toLowerCase().includes(search.value.toLowerCase())&&(!date.value||String(o.ShipmentDate||'').slice(0,10)===date.value)))
const currentBox=computed(()=>order.value?.boxes.find(b=>b.Status==='open'))
const editable=computed(()=>!!run.value&&['assembled','packing'].includes(order.value?.Status))
const remaining=l=>Math.max(0,Number(l.AssembledQty||0)-Number(l.PackedQty||0))
const allPacked=computed(()=>order.value?.lines.every(l=>remaining(l)<0.00005&&(l.AssembledPieces==null||Number(l.AssembledPieces)===Number(l.PackedPieces))))
const weighted=computed(()=>isWeightUnit(editing.value?.Uom)||!!editing.value?.IsWeighted)
watch(unpackVisible,v=>{if(!v)credentials.value={}})
async function load(){loading.value=true;error.value='';try{const [r,o,v,c]=await Promise.all([dispatchApi.currentPackingRun(),dispatchApi.packing(tab.value),dispatchApi.vesselTypes(),dispatchApi.checkers()]);run.value=r.data;orders.value=o.data;vessels.value=v.data;checkers.value=c.data}catch(e){error.value=msg(e)}finally{loading.value=false}}
async function startRun(){busy.value=true;try{run.value=(await dispatchApi.startPackingRun(checkerId.value)).data}catch(e){error.value=msg(e)}finally{busy.value=false}}
async function endRun(){busy.value=true;try{await dispatchApi.endPackingRun(run.value.RunId);run.value=null;orderVisible.value=false;await load()}catch(e){error.value=msg(e)}finally{busy.value=false}}
async function openOrder(o){orderError.value='';try{if(o.Status!=='packed'&&o.Status!=='loaded')await dispatchApi.claimOrder(o.DispatchOrderId,'packing',run.value.RunId);order.value=(await dispatchApi.packingOrder(o.DispatchOrderId)).data;orderVisible.value=true}catch(e){error.value=msg(e)}}
async function refreshOrder(){if(order.value)order.value=(await dispatchApi.packingOrder(order.value.DispatchOrderId)).data}
async function release(){try{await dispatchApi.releaseOrder(order.value.DispatchOrderId);orderVisible.value=false;await load()}catch(e){orderError.value=msg(e)}}
async function openBox(){busy.value=true;try{await dispatchApi.openBox(order.value.DispatchOrderId,{vesselTypeId:vesselId.value});await refreshOrder()}catch(e){orderError.value=msg(e)}finally{busy.value=false}}
function newRequestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`}
function editLine(l){editing.value=l;form.value={pieces:l.AssembledPieces==null?(isWeightUnit(l.Uom)?null:remaining(l)):Math.max(0,l.AssembledPieces-l.PackedPieces),assembledWeight:remaining(l),batchNo:l.BatchNo||''};requestId.value=newRequestId();lineError.value='';lineVisible.value=true}
async function saveLine(){lineError.value='';try{assemblyValues(editing.value,form.value)}catch(e){lineError.value=e.message;return}busy.value=true;try{await dispatchApi.addBoxLine(currentBox.value.BoxId,{...form.value,lineId:editing.value.LineId,requestId:requestId.value});lineVisible.value=false;await refreshOrder()}catch(e){lineError.value=msg(e)}finally{busy.value=false}}
async function removeLine(l){try{await dispatchApi.removeBoxLine(l.BoxLineId);await refreshOrder()}catch(e){orderError.value=msg(e)}}
async function closeBox(){busy.value=true;try{labelData.value=(await dispatchApi.closeBox(currentBox.value.BoxId,{})).data;labelVisible.value=true;await refreshOrder();await load()}catch(e){orderError.value=msg(e)}finally{busy.value=false}}
async function complete(){try{await dispatchApi.completePacking(order.value.DispatchOrderId);await refreshOrder();await load()}catch(e){orderError.value=msg(e)}}
async function showLabel(b){try{labelData.value=(await dispatchApi.boxLabel(b.BoxId)).data;labelVisible.value=true}catch(e){orderError.value=msg(e)}}
function requestUnpack(b){unpackTarget.value=b;credentials.value={username:'',password:'',reason:''};unpackError.value='';unpackVisible.value=true}
async function unpack(){busy.value=true;try{await dispatchApi.unpackBox(unpackTarget.value.BoxId,credentials.value);credentials.value={};unpackVisible.value=false;if(run.value)await dispatchApi.claimOrder(order.value.DispatchOrderId,'packing',run.value.RunId);await refreshOrder();await load()}catch(e){unpackError.value=msg(e);credentials.value.password=''}finally{busy.value=false}}
function scanItem(){lastScan.value=scan.value.trim();const q=lastScan.value.toLowerCase();scan.value='';if(!q)return;const hits=order.value.lines.filter(l=>[l.ItemNo,l.Barcode].some(v=>String(v||'').toLowerCase()===q));const hit=hits.find(l=>remaining(l)>0)||hits[0];if(!hit){barcodeVisible.value=true;return}if(!currentBox.value){orderError.value='Open a box first';return}if(remaining(hit)>0)editLine(hit)}
function printLabel(){if(!labelData.value)return;const w=window.open('','_blank');if(!w)return;const l=labelData.value.label;const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));w.document.write(`<html><head><title>${esc(l.boxNo)}</title><style>body{font:14px Arial;text-align:center;margin:6mm}img{width:220px}h2{font-size:16px}
/* Keep order and part cards readable regardless of the surrounding theme. */
.card,.box-card{background:#fff;color:#111;border-color:#94a3b8}.card small,.box-card small,.card p,.box-card p{color:#374151}
</style></head><body><img src="${labelData.value.qrImage}"/><h2>${esc(l.boxNo)}</h2><p>Order ${esc(l.orderNo)} · ${esc(l.customerName)}</p><p>${esc(l.estWeight)} kg net / ${esc(l.grossWeight)} kg gross</p><p>Batch ${esc(l.batches)}</p><p>Confirmer ${esc(l.confirmer)}</p><p>Route ${esc(l.route)} · ${esc(l.salesperson)}</p></body></html>`);w.document.close();w.onload=()=>w.print()}
let timer
onMounted(()=>{load();timer=setInterval(()=>now.value=Date.now(),1000)})
onUnmounted(()=>clearInterval(timer))
</script>
<style scoped>
.order-card,.line-card,.card,.box-card,.session-bar,.session,.box-banner{color:var(--bc-text)}
.view-toggle{display:flex;gap:.4rem}.view-toggle button{padding:.6rem .9rem;border:1px solid var(--bc-border);border-radius:6px;background:var(--bc-surface-card);color:var(--bc-text);cursor:pointer}.view-toggle button[aria-pressed="true"]{background:var(--bc-surface-raised);border-color:var(--p-primary-color);box-shadow:inset 0 -2px var(--p-primary-color)}
.order-list{overflow-x:auto;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-card);color:var(--bc-text)}.order-list table{width:100%;border-collapse:collapse;text-align:left}.order-list th,.order-list td{padding:.8rem;border-bottom:1px solid var(--bc-border)}.order-list th{background:var(--bc-surface-raised);white-space:nowrap}.order-list td:last-child{white-space:nowrap}.order-list tbody tr:hover{background:var(--bc-surface-raised)}

.packing-page{padding:1rem;display:grid;gap:1rem;min-width:0;--packing-accent:#b45309}header,.toolbar,.filters,.session,.box-banner{display:flex;gap:.75rem;align-items:center;justify-content:space-between;flex-wrap:wrap}h2,p{margin:.25rem 0}.session,.box-banner{padding:1rem;border:1px solid #e6b97d;border-left:5px solid var(--packing-accent);border-radius:12px;background:var(--bc-surface-card)}output{font-size:1.7rem;font-variant-numeric:tabular-nums;font-weight:700}.tabs{display:flex;gap:.5rem;border-bottom:1px solid var(--bc-border);overflow-x:auto}.tabs button,.tabs a{border:0;background:transparent;padding:1rem;color:inherit;white-space:nowrap;cursor:pointer;text-decoration:none}.tabs .active{border-bottom:3px solid var(--packing-accent);color:var(--packing-accent);font-weight:700}.order-grid,.line-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.75rem}.card,.box-card{display:grid;gap:.6rem;border:1px solid var(--bc-border);border-radius:10px;padding:1rem;background:var(--bc-surface-card)}.done{border-left:4px solid var(--p-green-500)}.toolbar{margin:.75rem 0}.box-card{margin:.75rem 0}.box-line{display:flex;justify-content:space-between;gap:.5rem;padding:.5rem;border-top:1px solid var(--bc-border)}.entry,.entry label,.label{display:grid;gap:.65rem}.label{text-align:center}.label img{margin:auto;width:220px}.empty{padding:2rem;text-align:center}small{color:var(--bc-text-muted)}@media(max-width:640px){.packing-page{padding:.6rem}.line-grid,.order-grid{grid-template-columns:1fr}.toolbar :deep(input){width:100%}.entry :deep(input){font-size:16px;min-height:44px}.card :deep(button){min-height:44px}}

/* Keep order and part cards readable regardless of the surrounding theme. */
.card,.box-card{background:#fff;color:#111;border-color:#94a3b8}.card small,.box-card small,.card p,.box-card p{color:#374151}
</style>
