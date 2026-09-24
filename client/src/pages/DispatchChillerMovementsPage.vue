<template>
  <div class="movements">
    <h2>Chiller movements</h2>
    <Message severity="info" :closable="false">Out-tray only. Assemblies deduct stock; corrections reverse the previous issue and record the replacement. WMS inbound transfers and opening stock are not connected yet.</Message>
    <div class="filters">
      <label>Chiller<Select v-model="chiller" :options="chillers" show-clear placeholder="All chillers" /></label>
      <label>From<InputText v-model="dateFrom" type="date" /></label><label>To<InputText v-model="dateTo" type="date" /></label>
      <Button label="Refresh" icon="pi pi-refresh" :loading="loading" @click="load" />
      <Button label="Export CSV" icon="pi pi-download" :disabled="loading || !rows.length" @click="download" />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <DataTable :value="rows" paginator :rows="25" scrollable size="small">
      <template #empty>No movements for this selection.</template>
      <Column header="Time"><template #body="{data}">{{ new Date(data.CreatedAt).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}) }}</template></Column>
      <Column field="Company" header="Company" /><Column field="Chiller" header="Chiller" />
      <Column field="OrderNo" header="Order" /><Column field="Part" header="Part" /><Column field="ItemNo" header="Item" />
      <Column field="Kind" header="Movement" /><Column field="Quantity" header="Stock change" /><Column field="BaseUom" header="Base UOM" />
      <Column field="BatchNo" header="Batch" /><Column field="UserName" header="Assembler" /><Column field="Reason" header="Reason" />
    </DataTable>
  </div>
</template>
<script setup>
import {ref,onMounted} from 'vue'
import {dispatchApi} from '@/services/dispatch.js'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
const rows=ref([]),chillers=ref([]),chiller=ref(null),dateFrom=ref(''),dateTo=ref(''),loading=ref(false),error=ref('')
async function load(){loading.value=true;error.value='';try{if(dateFrom.value&&dateTo.value&&dateFrom.value>dateTo.value)throw new Error('Check the date range');const [r,c]=await Promise.all([dispatchApi.chillerMovements({chiller:chiller.value||undefined,dateFrom:dateFrom.value||undefined,dateTo:dateTo.value||undefined}),dispatchApi.chillerConfig()]);rows.value=r.data;chillers.value=c.data.chillers}catch(e){error.value=e.response?.data?.error||e.message}finally{loading.value=false}}
function download(){const keys=['CreatedAt','Company','LocationCode','Chiller','OrderNo','Part','ItemNo','Kind','Quantity','BaseUom','BatchNo','UserName','Reason'];const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const url=URL.createObjectURL(new Blob(['\uFEFF'+[keys,...rows.value.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='chiller-movements.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
onMounted(load)
</script>
<style scoped>.movements{padding:1rem;display:grid;gap:1rem;min-width:0}.filters{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end}.filters label{display:grid;gap:.3rem}h2{margin:0}</style>
