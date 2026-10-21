<template>
 <main class="production-cost">
  <h2>Finished-good production costs · Live ERP</h2>
  <p>Live database: 172.16.10.8. Select one or more company mirrors. Quantities use each item’s base unit; costs are LCY.</p>
  <div class="filters"><label>Companies<MultiSelect v-model="companies" :options="companyOptions" filter placeholder="Select companies" display="chip" :disabled="loading" /></label><label>Finished goods<InputText v-model="fg" placeholder="Item code, JF* or ITEM1|ITEM2" /></label><label>From<InputText v-model="dateFrom" type="date" /></label><label>To<InputText v-model="dateTo" type="date" /></label><label>Ingredient levels<Select v-model="levels" :options="[1,2,3,4,5]" /></label><Button label="Run report" icon="pi pi-play" :loading="loading" :disabled="!fg.trim() || !companies.length" @click="run" /><Button label="Excel" icon="pi pi-file-excel" :disabled="!rows.length||loading" @click="excel" /></div>
  <Message v-if="error" severity="error">{{ error }}</Message>
  <Message severity="info" :closable="false">Dates select FG output and positive-adjustment entries. Production-line consumption is allocated by the selected output’s share of total production output. Deeper levels follow actual item applications, including older production. Costs include all currently recorded Value Entries, including later adjustments. Deeper-level costs explain the ingredient cost; do not add levels together.</Message>
  <small v-if="snapshot">{{ snapshot.source }} · fetched {{ new Date(snapshot.generatedAt).toLocaleString() }} · {{ snapshot.filters.dateFrom }} – {{ snapshot.filters.dateTo }} · {{ snapshot.filters.levels }} levels</small>
  <h3>Totals per finished good</h3>
  <DataTable :value="summaries" paginator :rows="10" scrollable size="small"><Column v-for="c in summaryColumns" :key="c" :field="c" :header="c" sortable><template #body="{data}">{{ format(data[c]) }}</template></Column><template #empty>Run the report to see finished-good totals.</template></DataTable>
  <div class="filters"><InputText v-model="search" placeholder="Search FG, ingredient, order or company" /><Select v-model="entryFilter" :options="['Output','Consumption','Positive adjustment']" showClear placeholder="All entry types" /></div>
  <DataTable :value="visibleRows" paginator :rows="20" :rowsPerPageOptions="[20,50,100]" scrollable size="small" removableSort>
   <Column v-for="c in columns" :key="c" :field="c" :header="labels[c]||c" sortable style="min-width:125px"><template #body="{data}">{{ c==='PostingDate'?String(data[c]||'').slice(0,10):format(data[c]) }}</template></Column>
   <template #empty>No matching ledger entries.</template>
  </DataTable>
 </main>
</template>
<script setup>
import {ref,computed} from 'vue'
import api from '@/services/api.js'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10)
const companyOptions=['FCL','CM','FLM','RMK'],companies=ref([...companyOptions])
const fg=ref(''),dateFrom=ref(today.slice(0,8)+'01'),dateTo=ref(today),levels=ref(1),loading=ref(false),error=ref(''),rows=ref([]),snapshot=ref(null),search=ref(''),entryFilter=ref(null)
const columns=['Company','FG','FGDescription','FGEntryNo','Level','ParentItem','ItemNo','Description','Uom','EntryType','Quantity','ActualCost','ExpectedCost','ProductionOrder','ProductionLine','EntryNo','PostingDate','DocumentNo','TraceStatus']
const labels={ActualCost:'Actual cost (LCY)',ExpectedCost:'Expected cost (LCY)',Quantity:'Base quantity',FGEntryNo:'FG ledger entry',EntryNo:'Ingredient / FG entry'}
const summaryColumns=['Company','FG','Description','Uom','OutputQuantity','OutputCost','AdjustmentQuantity','AdjustmentCost','DirectIngredientCost','DirectExpectedCost','CostPerOutputUnit']
const summaries=computed(()=>{
 const map=new Map();for(const r of rows.value){const key=JSON.stringify([r.Company,r.FG]);if(!map.has(key))map.set(key,{Company:r.Company,FG:r.FG,Description:r.FGDescription,Uom:'',OutputQuantity:0,OutputCost:0,AdjustmentQuantity:0,AdjustmentCost:0,DirectIngredientCost:0,DirectExpectedCost:0});const s=map.get(key);
 if(r.Level===0){s.Uom=r.Uom;if(r.EntryType==='Output'){s.OutputQuantity+=r.Quantity;s.OutputCost+=r.ActualCost}else{s.AdjustmentQuantity+=r.Quantity;s.AdjustmentCost+=r.ActualCost}}
 if(r.Level===1){s.DirectIngredientCost+=r.ActualCost;s.DirectExpectedCost+=r.ExpectedCost}}
 return [...map.values()].map(s=>({...s,CostPerOutputUnit:s.OutputQuantity?s.OutputCost/s.OutputQuantity:null}));
})
const visibleRows=computed(()=>rows.value.filter(r=>(!entryFilter.value||r.EntryType===entryFilter.value)&&(!search.value||columns.some(c=>String(r[c]??'').toLowerCase().includes(search.value.toLowerCase())))))
const format=v=>v==null?'—':typeof v==='number'?v.toLocaleString('en-KE',{maximumFractionDigits:4}):v
async function run(){loading.value=true;error.value='';rows.value=[];snapshot.value=null;try{const {data}=await api.get('/reporting/production-cost',{params:{companies:companies.value.join(','),fg:fg.value,dateFrom:dateFrom.value,dateTo:dateTo.value,levels:levels.value},timeout:300000});rows.value=data.rows;snapshot.value=data}catch(e){error.value=e.response?.data?.error||e.message}finally{loading.value=false}}
async function excel(){const XLSX=await import('xlsx');const wb=XLSX.utils.book_new();const meta=snapshot.value;const notes=[['Live ERP production cost report'],['Source',meta.source],['Companies',meta.filters.companies.join(', ')],['FG filter',meta.filters.fg],['From',meta.filters.dateFrom,'To',meta.filters.dateTo,'Levels',meta.filters.levels],['Generated',meta.generatedAt],['Consumption allocated by production output share; deeper levels are not additive. Value Entry costs are current.']];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([...notes,summaryColumns,...summaries.value.map(r=>summaryColumns.map(c=>r[c]??''))]),'FG totals');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([columns.map(c=>labels[c]||c),...visibleRows.value.map(r=>columns.map(c=>r[c]??''))]),'Ingredient details');XLSX.writeFile(wb,'fg-production-costs.xlsx')}
</script>
<style scoped>
.production-cost{display:grid;gap:1rem;padding:1rem;min-width:0;color:#e2e8f0;background:#0f172a}.production-cost h2,.production-cost h3,.production-cost p{margin:0}.filters{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end}.filters label{display:grid;gap:.4rem}.production-cost :deep(.p-datatable-table-container){overflow-x:auto}.production-cost :deep(.p-datatable-thead>tr>th){background:#020617!important;color:#fff!important}.production-cost :deep(.p-datatable-tbody>tr>td){background:#1e293b!important;color:#f1f5f9!important}.production-cost :deep(.p-datatable-tbody>tr:hover>td){background:#334155!important}.production-cost :deep(.p-paginator){background:#111827;color:#e2e8f0}@media(max-width:640px){.production-cost{padding:.6rem}.filters label{width:100%}.filters :deep(input){font-size:16px}}
</style>
