<template>
  <div class="stocktakes">
    <header><div><h2>Chiller stock take</h2><p>Scan or select items and record the physical stock in a chiller.</p></div><Button label="Refresh" icon="pi pi-refresh" :loading="busy" @click="refresh" /></header>
    <Message severity="info" :closable="false">Counts are saved for reconciliation when WMS in-tray is connected. They do not adjust chiller stock or BC balances.</Message>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <template v-if="!session">
      <div class="filters">
        <label>Company<Select v-model="company" :options="['FCL','CM','FLM','RMK']" :disabled="busy" @change="refresh" /></label>
        <label>Chiller<Select v-model="chiller" :options="chillers" filter show-clear placeholder="Select chiller" :disabled="busy" @change="refresh" /></label>
        <label>Location code<InputText v-model="location" maxlength="20" /></label>
        <Button label="Start stock take" icon="pi pi-play" :disabled="busy || !chiller || !location.trim()" @click="start" />
      </div>
      <div class="filters">
        <label>From<InputText v-model="dateFrom" type="date" /></label><label>To<InputText v-model="dateTo" type="date" /></label>
        <Button label="Filter history" :disabled="busy" @click="refresh" />
      </div>
      <DataTable :value="sessions" paginator :rows="15" scrollable size="small">
        <template #empty>No stock takes match these filters.</template>
        <Column field="Company" header="Company" sortable /><Column field="LocationCode" header="Location" sortable /><Column field="Chiller" header="Chiller" sortable />
        <Column field="UserName" header="Counter" sortable /><Column field="StartedAt" header="Started" sortable><template #body="{data}">{{ formatDate(data.StartedAt) }}</template></Column>
        <Column header="Status"><template #body="{data}"><Tag :value="data.CompletedAt ? 'Completed' : 'Counting'" :severity="data.CompletedAt ? 'success' : 'warn'" /></template></Column>
        <Column field="Lines" header="Counted lines" /><Column header="Reconciliation"><template #body>Awaiting in-tray</template></Column>
        <Column header="Actions"><template #body="{data}"><Button label="Open" size="small" :disabled="busy" @click="open(data.StocktakeId)" /></template></Column>
      </DataTable>
    </template>

    <template v-else>
      <div class="session-panel">
        <div><strong>{{ session.Company }} · {{ session.LocationCode }} · {{ session.Chiller }}</strong><p>{{ session.UserName }} · {{ formatDate(session.StartedAt) }}</p></div>
        <Tag :value="session.CompletedAt ? 'Completed — read only' : 'Counting · ' + elapsed" :severity="session.CompletedAt ? 'success' : 'info'" />
        <div class="actions"><Button label="Sessions" severity="secondary" :disabled="busy" @click="back" /><Button label="Export Excel" icon="pi pi-file-excel" :disabled="busy" @click="download" /><Button v-if="canEdit" label="Complete stock take" :disabled="busy || !session.lines.length" @click="confirmComplete=true" /></div>
      </div>
      <div class="totals"><span>{{ session.lines.length }} counted lines</span><span>{{ totalKg.toLocaleString(undefined,{maximumFractionDigits:3}) }} known KG · {{ (totalKg/1000).toFixed(3) }} tonnes</span><span v-if="unknownWeights">{{ unknownWeights }} line(s) without a KG conversion</span></div>
      <div v-if="canEdit" class="filters">
        <form class="scanner" @submit.prevent="scan"><label>Scan barcode or enter item number<InputText ref="scanInput" v-model="barcode" placeholder="Scan then press Enter" :disabled="busy" autocomplete="off" /></label><Button type="submit" label="Find" icon="pi pi-search" :disabled="busy || !barcode.trim()" /></form>
        <Button label="Select item manually" icon="pi pi-plus" :disabled="busy" @click="newCount()" />
      </div>
      <InputText v-model="lineSearch" placeholder="Search counted item, description or batch" aria-label="Search counted lines" />
      <DataTable :value="filteredLines" paginator :rows="20" scrollable size="small">
        <template #empty>No items counted yet.</template>
        <Column field="ItemNo" header="Item" sortable /><Column field="Description" header="Description" sortable /><Column field="Uom" header="UOM" /><Column field="BatchNo" header="Batch" />
        <Column field="Quantity" header="Counted quantity" /><Column field="Pieces" header="Pieces" /><Column header="Weight KG"><template #body="{data}">{{ data.WeightKg == null ? 'Unavailable' : data.WeightKg }}</template></Column>
        <Column header="Counted at"><template #body="{data}">{{ formatDate(data.CountedAt) }}</template></Column>
        <Column v-if="canEdit" header="Actions"><template #body="{data}"><Button label="Edit count" text :disabled="busy" @click="edit(data)" /></template></Column>
      </DataTable>
    </template>

    <Dialog v-model:visible="countVisible" modal :header="editing ? 'Correct counted total' : 'Count an item'" :style="{width:'34rem',maxWidth:'96vw'}" :closable="!busy" :closeOnEscape="!busy">
      <div class="count-form">
        <Message v-if="modalError" severity="error" :closable="false">{{ modalError }}</Message>
        <label>Item<Select v-model="selectedItem" :options="items" optionLabel="SearchLabel" filter :filterFields="['SearchLabel','Barcode']" :virtualScrollerOptions="{itemSize:42}" placeholder="Search item number, name or barcode" :disabled="busy || editing" @change="selectUnit" /></label>
        <Message v-if="selectedItem && selectedItem.Chiller !== session?.Chiller" severity="warn" :closable="false">This item is mapped to {{ selectedItem.Chiller || 'no chiller' }}. Count it here only if it is physically in {{ session?.Chiller }}.</Message>
        <label>Unit of measure<Select v-model="form.uom" :options="selectedItem?.Units || []" optionLabel="Uom" optionValue="Uom" :disabled="busy || editing" /></label>
        <Message v-if="selectedItem && !selectedItem.Units.length" severity="warn" :closable="false">No cached units. Refresh BC items and units in Dispatch Admin before counting this item.</Message>
        <label>{{ pieceUnit ? 'Total pieces counted' : 'Total quantity counted (' + (form.uom || 'UOM') + ')' }}<InputNumber v-model="form.quantity" :min="0" :max="999999999" :maxFractionDigits="pieceUnit ? 0 : 4" fluid :disabled="busy" /></label>
        <label v-if="!pieceUnit">Pieces (if known)<InputNumber v-model="form.pieces" :min="0" :max="999999999" :maxFractionDigits="0" fluid :disabled="busy" /></label>
        <label>Batch (4–5 letters/numbers; blank if unlabelled)<InputText v-model="form.batchNo" maxlength="5" :disabled="busy || editing" /></label>
        <p v-if="estimatedKg !== null">{{ estimatedKg.toLocaleString(undefined,{maximumFractionDigits:4}) }} KG using the cached BC item UOM.</p>
        <p v-else>KG translation unavailable until a BC item UOM conversion is cached.</p>
        <small>Enter the total counted for this item, UOM and batch. Saving replaces the previous count; it does not add to it. Use Edit count to correct an existing line, including setting it to zero.</small>
        <Button label="Save count" icon="pi pi-check" :loading="busy" :disabled="!selectedItem || !form.uom || form.quantity == null" @click="save" />
      </div>
    </Dialog>
    <Dialog v-model:visible="confirmComplete" modal header="Complete stock take" :style="{width:'28rem',maxWidth:'96vw'}" :closable="!busy">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <p>Complete this count? The saved lines become read-only and remain available for Excel export and future reconciliation.</p>
      <Button label="Complete" :loading="busy" @click="finish" />
    </Dialog>
  </div>
</template>
<script setup>
import {ref,computed,onMounted,onUnmounted,nextTick} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import {useAuthStore} from '@/stores/auth.js'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
const auth=useAuthStore(),company=ref('FCL'),chiller=ref(null),location=ref(''),chillers=ref([])
const sessions=ref([]),session=ref(null),items=ref([]),dateFrom=ref(''),dateTo=ref(''),busy=ref(false),error=ref('')
const barcode=ref(''),scanInput=ref(null),lineSearch=ref(''),countVisible=ref(false),confirmComplete=ref(false),modalError=ref(''),editing=ref(false),selectedItem=ref(null)
const form=ref({}),now=ref(Date.now()),timer=setInterval(()=>now.value=Date.now(),1000)
onUnmounted(()=>clearInterval(timer))
const canEdit=computed(()=>session.value&&!session.value.CompletedAt&&(String(session.value.UserId)===String(auth.user?.userId)||['admin','dispatch-supervisor'].includes(auth.user?.role)))
const elapsed=computed(()=>{const seconds=Math.max(0,Math.floor((now.value-new Date(session.value?.StartedAt).getTime())/1000));return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':')})
const totalKg=computed(()=>session.value?.lines.reduce((sum,l)=>sum+Number(l.WeightKg||0),0)||0)
const unknownWeights=computed(()=>session.value?.lines.filter(l=>l.WeightKg==null).length||0)
const filteredLines=computed(()=>{const q=lineSearch.value.trim().toLowerCase();return (session.value?.lines||[]).filter(l=>[l.ItemNo,l.Description,l.BatchNo].some(v=>String(v||'').toLowerCase().includes(q)))})
const pieceUnit=computed(()=>/^(PC|PCS|PCE|PIECE|PIECES)$/.test(form.value.uom||''))
const estimatedKg=computed(()=>{const u=selectedItem.value?.Units.find(u=>u.Uom===form.value.uom);return u?.KgPerUom>0&&form.value.quantity!=null?form.value.quantity*u.KgPerUom:null})
const formatDate=value=>value?new Date(value).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):''
const message=e=>e.response?.data?.error||e.message
async function run(fn){busy.value=true;error.value='';try{await fn()}catch(e){error.value=message(e)}finally{busy.value=false}}
async function loadHistory(){if(dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value)throw new Error('From date must be on or before To date');sessions.value=(await dispatchApi.stocktakes({company:company.value,chiller:chiller.value||undefined,dateFrom:dateFrom.value||undefined,dateTo:dateTo.value||undefined})).data}
async function loadSession(id){const result=(await dispatchApi.stocktake(id)).data;const catalog=(await dispatchApi.stocktakeCatalog(result.Company)).data;items.value=catalog.map(i=>({...i,SearchLabel:`${i.ItemNo} - ${i.Description}`}));session.value=result}
async function refresh(){await run(()=>session.value?loadSession(session.value.StocktakeId):loadHistory())}
async function start(){await run(async()=>{const result=(await dispatchApi.startStocktake({company:company.value,chiller:chiller.value,location:location.value})).data;await loadSession(result.StocktakeId)})}
async function open(id){lineSearch.value='';await run(()=>loadSession(id))}
async function back(){session.value=null;await refresh()}
function selectUnit(){form.value.uom=selectedItem.value?.Units.find(u=>u.Uom===selectedItem.value.BaseUom)?.Uom||selectedItem.value?.Units[0]?.Uom||null;form.value.quantity=null;form.value.pieces=null}
function newCount(item=null){editing.value=false;modalError.value='';selectedItem.value=item;form.value={uom:null,quantity:null,pieces:null,batchNo:'',revision:0};selectUnit();countVisible.value=true}
function scan(){error.value='';const code=barcode.value.trim().toUpperCase();const matches=items.value.filter(i=>String(i.Barcode||'').trim().toUpperCase()===code||i.ItemNo.toUpperCase()===code);if(matches.length!==1){error.value=matches.length?'Barcode matches multiple items. Select the correct item manually.':'Item not found. Select manually, or ask a supervisor to refresh/correct the barcode in Dispatch Admin.';return}newCount(matches[0]);barcode.value=''}
function edit(line){const item=items.value.find(i=>i.ItemNo===line.ItemNo);if(!item){error.value='Item is no longer cached. Refresh BC items in Dispatch Admin before correcting this count.';return}editing.value=true;modalError.value='';selectedItem.value=item;form.value={uom:line.Uom,quantity:Number(line.Quantity),pieces:line.Pieces,batchNo:line.BatchNo,revision:line.Revision};countVisible.value=true}
async function save(){busy.value=true;modalError.value='';try{session.value=(await dispatchApi.saveStocktakeCount(session.value.StocktakeId,{...form.value,itemNo:selectedItem.value.ItemNo})).data;countVisible.value=false}catch(e){modalError.value=message(e)}finally{busy.value=false;await nextTick();if(!countVisible.value)scanInput.value?.$el?.focus()}}
async function finish(){await run(async()=>{session.value=(await dispatchApi.completeStocktake(session.value.StocktakeId)).data;confirmComplete.value=false})}
async function download(){await run(async()=>{let response;try{response=await dispatchApi.exportStocktake(session.value.StocktakeId)}catch(e){if(e.response?.data instanceof Blob){const text=await e.response.data.text();try{throw new Error(JSON.parse(text).error)}catch(parsed){if(parsed instanceof SyntaxError)throw e;throw parsed}}throw e}const url=URL.createObjectURL(response.data);const a=document.createElement('a');a.href=url;a.download=`chiller-stocktake-${session.value.StocktakeId}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})}
onMounted(()=>run(async()=>{const config=(await dispatchApi.chillerConfig()).data;company.value=config.StockCompany||'FCL';location.value=config.StockLocation||'';chillers.value=config.chillers;await loadHistory()}))
</script>
<style scoped>
.stocktakes{display:grid;gap:1rem;padding:1rem;min-width:0}header,.session-panel,.actions,.filters,.scanner,.totals{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}header{justify-content:space-between}h2,p{margin:.2rem 0}.filters,.scanner{align-items:end}label,.count-form{display:grid;gap:.5rem}.count-form{gap:1rem}.session-panel{padding:1rem;border:1px solid #99cbd0;border-radius:12px;background:#f0fdfa;color:#132e31}.totals{padding:.5rem 0;font-weight:600}.scanner{flex:1}.scanner label{flex:1;min-width:220px}small{line-height:1.5}@media(max-width:640px){.filters>label,.filters>.scanner{width:100%}.actions{width:100%}.actions>*{flex:1}.stocktakes{padding:.5rem}.session-panel{align-items:flex-start}}
</style>
