<template>
  <section class="report">
    <h3>{{ all ? 'Assembly sessions' : 'My assemblies' }}</h3>
    <div class="filters">
      <label>From <InputText v-model="dateFrom" type="date" /></label>
      <label>To <InputText v-model="dateTo" type="date" /></label>
      <Button label="Refresh" icon="pi pi-refresh" :loading="loading" @click="load" />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <DataTable :value="rows" v-model:filters="sessionFilters" filterDisplay="row" paginator :rows="15" size="small" scrollable>
      <template #empty>No sessions for this selection.</template>
      <Column v-if="all" field="UserName" header="Assembler" :showFilterMenu="false"><template #filter="{filterModel,filterCallback}"><Select v-model="filterModel.value" :options="options(rows,'UserName')" filter show-clear placeholder="All assemblers" @change="filterCallback()" /></template></Column>
      <Column header="Started"><template #body="{data}">{{ time(data.StartedAt) }}</template></Column>
      <Column header="Ended"><template #body="{data}">{{ data.EndedAt ? time(data.EndedAt) : 'In progress' }}</template></Column>
      <Column header="Duration"><template #body="{data}">{{ duration(data.DurationSeconds) }}</template></Column>
      <Column field="Orders" header="Orders" /><Column field="Lines" header="Lines" /><Column field="Corrections" header="Corrections" />
      <Column><template #body="{data}"><Button label="View entries" text @click="details(data)" /></template></Column>
    </DataTable>
    <Dialog v-model:visible="visible" modal header="Assembly entries" :style="{width:'72rem'}" :breakpoints="{'900px':'96vw'}">
      <p v-if="selected">{{ selected.UserName }} · {{ time(selected.StartedAt) }}</p>
      <Message v-if="detailError" severity="error">{{ detailError }}</Message>
      <DataTable :value="entries" v-model:filters="entryFilters" filterDisplay="row" paginator :rows="15" size="small" scrollable>
        <Column header="Time"><template #body="{data}">{{ time(data.CreatedAt) }}</template></Column>
        <Column v-for="col in entryColumns" :key="col.field" :field="col.field" :header="col.label" :showFilterMenu="false" style="min-width:150px">
          <template #filter="{filterModel,filterCallback}"><InputNumber v-if="col.numeric" v-model="filterModel.value" :maxFractionDigits="4" placeholder="Equals" @update:modelValue="filterCallback()" /><Select v-else v-model="filterModel.value" :options="options(entries,col.field)" filter show-clear placeholder="All / search" @change="filterCallback()" /></template>
        </Column>
      </DataTable>
    </Dialog>
  </section>
</template>
<script setup>
import { ref,onMounted,onUnmounted } from 'vue'
import { dispatchApi } from '@/services/dispatch.js'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
const entryColumns=[['Company','Company'],['OrderNo','Order'],['Part','Part'],['Chiller','Chiller'],['ItemNo','Item'],['Description','Description'],['Quantity','Quantity',true],['Weight','Weight (kg)',true],['Pieces','Pieces',true],['BatchNo','Batch'],['ReturnReasonCode','Variance reason'],['Revision','Revision',true],['CorrectionReason','Correction reason']].map(([field,label,numeric])=>({field,label,numeric}))
const entryFilters=ref(Object.fromEntries(entryColumns.map(c=>[c.field,{value:null,matchMode:'equals'}])))
const sessionFilters=ref({UserName:{value:null,matchMode:'equals'}})
const options=(rows,field)=>[...new Set(rows.map(r=>r[field]).filter(v=>v!=null&&v!==''))].sort((a,b)=>String(a).localeCompare(String(b)))
const props=defineProps({all:Boolean})
const rows=ref([]),entries=ref([]),selected=ref(null),visible=ref(false),loading=ref(false),error=ref(''),detailError=ref(''),dateFrom=ref(''),dateTo=ref('')
const time=v=>new Date(v).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})
const duration=s=>`${Math.floor(Number(s||0)/3600)}h ${Math.floor(Number(s||0)%3600/60)}m ${Number(s||0)%60}s`
async function load(){ loading.value=true;error.value='';try{if(dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value)throw new Error('From date must precede to date');rows.value=(await dispatchApi.assemblySessions({mine:!props.all,dateFrom:dateFrom.value||undefined,dateTo:dateTo.value||undefined})).data}catch(e){error.value=e.response?.data?.error||e.message}finally{loading.value=false} }
async function details(row){selected.value=row;entries.value=[];detailError.value='';visible.value=true;try{entries.value=(await dispatchApi.assemblySessionEvents(row.SessionId)).data}catch(e){detailError.value=e.response?.data?.error||e.message}}
let refreshTimer
onMounted(()=>{load();refreshTimer=setInterval(load,30000)})
onUnmounted(()=>clearInterval(refreshTimer))
</script>
<style scoped>.report{display:grid;gap:1rem;min-width:0}.filters{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end}.filters label{display:grid;gap:.3rem}h3{margin:0}</style>
