<template>
 <section class="order-report">
  <div class="summary" aria-live="polite"><article><small>Paid</small><strong>{{ stats.paid.count }} orders · {{ money(stats.paid.total) }}</strong></article><article><small>Unpaid</small><strong>{{ stats.unpaid.count }} orders · {{ money(stats.unpaid.total) }}</strong></article></div>
  <div class="toolbar"><strong>Group by</strong><Button v-for="c in axes" :key="c.field" :label="c.header" :outlined="!groups.includes(c.field)" :aria-pressed="groups.includes(c.field)" size="small" @click="toggleGroup(c.field)" /><Button v-if="groups.length" label="Order list" text @click="groups=[]" /></div>
  <div class="toolbar"><InputText v-model="search" placeholder="Search orders…" aria-label="Search orders" /><MultiSelect v-model="visible" :options="allColumns" optionLabel="header" optionValue="field" filter :maxSelectedLabels="0" selectedItemsLabel="{0} columns" placeholder="Choose columns" aria-label="Choose columns" /><Button label="Reset columns" text @click="visible=allColumns.map(c=>c.field)" /><Button label="Clear filters" text @click="clearFilters" /><Button label="Excel" icon="pi pi-file-excel" :disabled="!tableRows.length" @click="download('excel')" /><Button label="PDF" icon="pi pi-file-pdf" :disabled="!tableRows.length" @click="download('pdf')" /></div>
  <div class="filter-grid"><label v-for="c in shownColumns" :key="c.field">{{ c.header }}<InputText v-if="c.field==='CreatedDate'" v-model="filters[c.field]" type="date" /><InputText v-else-if="c.numeric" v-model="filters[c.field]" inputmode="decimal" placeholder="Equals" /><Select v-else v-model="filters[c.field]" :options="options(c.field)" filter editable showClear placeholder="Search / select" /></label></div>
  <small>{{ filtered.length }} matching orders across all pages. Unpaid includes open, saved and checkout orders; cancelled orders are excluded from analysis and payment totals.</small>
  <small v-if="groups.length">Sales value is allocated proportionally using confirmed payment amounts and company line values. Combined payment/company groups are allocations, not recorded payment-to-company assignments. Orders can appear in multiple groups.</small>
  <DataTable :value="tableRows" @value-change="sortedRows=$event" size="small" :loading="loading" paginator :rows="10" :rowsPerPageOptions="[10,25,50]" scrollable removableSort>
   <Column v-for="c in tableColumns" :key="c.field" :field="c.field" :header="c.header" sortable style="min-width:140px"><template #body="{data}">{{ c.money ? money(data[c.field]) : data[c.field] ?? '—' }}</template></Column>
   <template #empty>No orders match these filters.</template>
  </DataTable>
 </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import {useAuthStore} from '@/stores/auth.js'
import {reportOrderRows,groupOrderSales} from '../../../shared/posOrderAnalysis.mjs'
const props=defineProps({rows:{type:Array,default:()=>[]},loading:Boolean,range:Object})
const auth=useAuthStore(),key=`pos-report-order-columns:${auth.user?.userId}`
const allColumns=[{field:'OrderNo',header:'Order No'},{field:'ContactName',header:'Contact name'},{field:'ShopCode',header:'Shop'},{field:'CashierName',header:'Cashier'},{field:'PaymentMethods',header:'Payment method'},{field:'Companies',header:'Company'},{field:'Status',header:'Status'},{field:'CreatedDate',header:'Date'},{field:'LineCount',header:'Lines',numeric:true},{field:'TotalAmount',header:'Total',numeric:true,money:true}]
const axes=['PaymentMethods','Companies','CreatedDate','CashierName'].map(f=>allColumns.find(c=>c.field===f))
const visible=ref(allColumns.map(c=>c.field)),groups=ref([]),search=ref(''),filters=ref({}),sortedRows=ref(null)
try{const saved=JSON.parse(localStorage.getItem(key));if(Array.isArray(saved))visible.value=saved.filter(f=>allColumns.some(c=>c.field===f))}catch{}
watch(visible,value=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{};for(const k of Object.keys(filters.value))if(!value.includes(k))delete filters.value[k]})
const shownColumns=computed(()=>allColumns.filter(c=>visible.value.includes(c.field)))
const source=computed(()=>reportOrderRows(props.rows))
const options=field=>[...new Set(source.value.flatMap(r=>['PaymentMethods','Companies'].includes(field)?String(r[field]||'').split(', ').filter(Boolean):[r[field]]).filter(v=>v!=null&&v!==''))].sort((a,b)=>String(a).localeCompare(String(b)))
const filtered=computed(()=>source.value.filter(row=>{
 if(search.value&&!allColumns.some(c=>String(row[c.field]??'').toLowerCase().includes(search.value.trim().toLowerCase())))return false;
 return allColumns.every(c=>{const q=filters.value[c.field];if(q==null||q==='')return true;return c.numeric?Number(row[c.field])===Number(q):String(row[c.field]??'').toLowerCase().includes(String(q).toLowerCase())})
}))
const stats=computed(()=>{const result={paid:{count:0,total:0},unpaid:{count:0,total:0}};for(const r of filtered.value){const b=r.Status==='paid'?result.paid:['open','saved','checkout'].includes(r.Status)?result.unpaid:null;if(b){b.count++;b.total+=Number(r.TotalAmount)||0}}return result})
const tableRows=computed(()=>groups.value.length?groupOrderSales(filtered.value.filter(r=>r.Status!=='cancelled'),groups.value):filtered.value)
const tableColumns=computed(()=>groups.value.length?[...groups.value.map(f=>allColumns.find(c=>c.field===f)),{field:'Orders',header:'Orders'},{field:'SalesAmount',header:'Allocated sales',money:true},{field:'PaidAmount',header:'Paid sales',money:true},{field:'UnpaidAmount',header:'Unpaid sales',money:true}]:shownColumns.value)
watch(tableRows,()=>sortedRows.value=null)
function toggleGroup(field){groups.value=groups.value.includes(field)?groups.value.filter(f=>f!==field):[...groups.value,field]}
function clearFilters(){search.value='';filters.value={}}
const money=v=>Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})
async function download(kind){
 const cols=tableColumns.value,data=sortedRows.value??tableRows.value;
 const title=`POS orders ${props.range?.dateFrom||''} to ${props.range?.dateTo||''} · ${props.range?.shopCode||''}`;
 const summary=`Paid: ${stats.value.paid.count} / ${money(stats.value.paid.total)}; Unpaid: ${stats.value.unpaid.count} / ${money(stats.value.unpaid.total)}`;
 const note=groups.value.length?'Sales allocated proportionally by payment and company; order counts may overlap.':'';
 const body=data.map(r=>cols.map(c=>r[c.field]??''));
 if(kind==='excel'){const XLSX=await import('xlsx');const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[title],[summary],[note],cols.map(c=>c.header),...body]),'Orders');XLSX.writeFile(wb,'pos-order-analysis.xlsx')}
 else{const {jsPDF}=await import('jspdf');await import('jspdf-autotable');const pdf=new jsPDF('l','mm','a4');pdf.setFontSize(10);pdf.text(title,14,12);pdf.text(summary,14,19);if(note)pdf.text(note,14,26);pdf.autoTable({head:[cols.map(c=>c.header)],body,startY:31,styles:{fontSize:8}});pdf.save('pos-order-analysis.pdf')}
}
</script>
<style scoped>
.order-report{display:grid;gap:.75rem;min-width:0}.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}.summary article{display:grid;gap:.2rem;padding:.6rem .8rem;border-radius:8px;background:#115e59;color:white}.summary article+article{background:#854d0e}.summary strong{font-size:.95rem}.toolbar{display:flex;gap:.9rem .5rem;flex-wrap:wrap;align-items:center;margin-bottom:.5rem}.filter-grid{display:flex;flex-wrap:wrap;gap:1rem .5rem}.filter-grid label{display:grid;gap:.2rem;flex:1 1 145px;min-width:0;max-width:220px;font-size:.8rem}.filter-grid :deep(input){min-width:0;width:100%}.order-report :deep(.p-datatable-table-container){overflow-x:auto}@media(max-width:600px){.summary strong{font-size:.85rem}.toolbar>*{max-width:100%}.filter-grid label{max-width:none;flex-basis:calc(50% - .5rem)}.toolbar :deep(input){font-size:16px}}
</style>
