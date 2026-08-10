<template>
  <div class="prod-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Production</h2>
        <p class="text-muted text-sm">Build finished items from their recipes (BOM). Key in actual consumption,
          add overheads for costing, then post to avail the finished stock.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-3">{{ error }}</Message>

    <!-- New order -->
    <section class="card">
      <h3><i class="pi pi-plus-circle" /> New production order</h3>
      <div class="new-row">
        <div class="fld" style="flex:1;min-width:240px">
          <label>Finished item (has a recipe)</label>
          <Select v-model="newItem" :options="makeable" option-label="label" option-value="value"
                  filter placeholder="Select item to produce…" />
        </div>
        <div class="fld" style="width:130px">
          <label>Output qty</label>
          <InputNumber v-model="newQty" :min="0" :minFractionDigits="0" :maxFractionDigits="4" />
        </div>
        <Button label="Create" icon="pi pi-check" :disabled="!newItem || !(newQty>0)" :loading="creating" @click="createOrder" />
      </div>
    </section>

    <!-- Editor for the selected order -->
    <section v-if="current" class="card">
      <div class="editor-head">
        <div>
          <h3 style="margin:0"><i class="pi pi-cog" /> {{ current.orderNo }}
            <Tag :value="current.status" :severity="statusSeverity(current.status)" style="margin-left:8px" /></h3>
          <div class="text-muted text-sm">Output: <strong>{{ current.outputItemNo }}</strong> — {{ current.outputDescription }}
            · {{ n(current.outputQty) }} {{ current.outputUom }}</div>
        </div>
        <div style="display:flex;gap:8px">
          <template v-if="current.status==='open'">
            <Button label="Save" icon="pi pi-save" severity="secondary" :loading="saving" @click="saveLines" />
            <Button label="Post" icon="pi pi-check-circle" severity="success" :loading="posting" @click="postOrder" />
            <Button label="Cancel order" icon="pi pi-times" text severity="danger" @click="cancelOrder" />
          </template>
          <Button label="Close" icon="pi pi-times" text @click="current=null" />
        </div>
      </div>

      <h4 class="sub">Components (consumed)</h4>
      <table class="lines">
        <thead><tr><th>Item</th><th>Description</th><th class="r">Standard</th><th class="r">Actual</th><th>UoM</th></tr></thead>
        <tbody>
          <tr v-for="(l,i) in components" :key="l.prodLineId || 'c'+i">
            <td>{{ l.itemNo }}</td>
            <td>{{ l.description }}</td>
            <td class="r">{{ n(l.standardQty) }}</td>
            <td class="r"><InputNumber v-if="editable" v-model="l.actualQty" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ n(l.actualQty) }}</span></td>
            <td>{{ l.uom }}</td>
          </tr>
          <tr v-if="!components.length"><td colspan="5" class="text-muted">No components.</td></tr>
        </tbody>
      </table>

      <div class="sub-row">
        <h4 class="sub">Overheads (service items — costing only, no inventory)</h4>
        <div v-if="editable" class="add-oh">
          <Select v-model="ohItem" :options="itemOptions" option-label="label" option-value="value" filter
                  placeholder="Add overhead item…" style="min-width:220px" @change="addOverhead" />
        </div>
      </div>
      <table class="lines">
        <thead><tr><th>Item</th><th>Description</th><th class="r">Qty</th><th class="r">Unit cost</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(l,i) in overheads" :key="l.prodLineId || 'o'+i">
            <td>{{ l.itemNo }}</td>
            <td>{{ l.description }}</td>
            <td class="r"><InputNumber v-if="editable" v-model="l.actualQty" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ n(l.actualQty) }}</span></td>
            <td class="r"><InputNumber v-if="editable" v-model="l.unitCost" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ l.unitCost==null?'—':n(l.unitCost) }}</span></td>
            <td><Button v-if="editable" icon="pi pi-trash" text severity="danger" size="small" @click="overheads.splice(i,1)" /></td>
          </tr>
          <tr v-if="!overheads.length"><td colspan="5" class="text-muted">No overheads.</td></tr>
        </tbody>
      </table>
    </section>

    <!-- History -->
    <section class="card">
      <div class="list-search">
        <h3 style="margin:0;flex:1"><i class="pi pi-history" /> Production orders</h3>
        <InputText v-model="filters.global.value" placeholder="Search…" style="min-width:240px" />
        <span class="text-muted text-sm">{{ orders.length }}</span>
      </div>
      <DataTable :value="orders" dataKey="prodOrderId" size="small" :loading="loading" paginator :rows="25" removableSort
                 v-model:filters="filters" filterDisplay="row" :globalFilterFields="['orderNo','outputItemNo','outputDescription','status']"
                 selection-mode="single" @row-click="e => openOrder(e.data)">
        <Column field="orderNo" header="Order No" sortable :showFilterMenu="false">
          <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="No" style="width:100%" /></template>
        </Column>
        <Column field="outputItemNo" header="Item" sortable :showFilterMenu="false">
          <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Item" style="width:100%" /></template>
        </Column>
        <Column field="outputDescription" header="Description" sortable />
        <Column field="outputQty" header="Qty" sortable style="text-align:right"><template #body="{data}">{{ n(data.outputQty) }} {{ data.outputUom }}</template></Column>
        <Column field="status" header="Status" sortable :showFilterMenu="false">
          <template #body="{data}"><Tag :value="data.status" :severity="statusSeverity(data.status)" /></template>
          <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Status" style="width:100%" /></template>
        </Column>
        <Column field="createdAt" header="Created"><template #body="{data}">{{ fmtTime(data.createdAt) }}</template></Column>
      </DataTable>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button      from 'primevue/button'
import Select      from 'primevue/select'
import InputText   from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DataTable   from 'primevue/datatable'
import Column      from 'primevue/column'
import Tag         from 'primevue/tag'
import Message     from 'primevue/message'
import { posProdApi, posApi } from '@/services/pos.js'

const loading  = ref(false)
const error    = ref('')
const orders   = ref([])
const makeable = ref([])
const catalogue = ref([])
const current  = ref(null)
const newItem  = ref(null)
const newQty   = ref(1)
const creating = ref(false)
const saving   = ref(false)
const posting  = ref(false)
const ohItem   = ref(null)

const filters = ref({
  global:      { value: null, matchMode: 'contains' },
  orderNo:     { value: null, matchMode: 'contains' },
  outputItemNo:{ value: null, matchMode: 'contains' },
  status:      { value: null, matchMode: 'contains' },
})

const editable   = computed(() => current.value?.status === 'open')
const components = computed(() => (current.value?.lines || []).filter(l => l.lineType === 'component'))
const overheads  = computed(() => (current.value?.lines || []).filter(l => l.lineType === 'overhead'))
const itemOptions = computed(() => catalogue.value.map(i => ({ label: `${i.itemNo} — ${i.description}`, value: i.itemNo, item: i })))

function n(v) { return Number(v || 0).toFixed(2) }
function fmtTime(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '' }
function statusSeverity(s) { return { open: 'info', posted: 'success', cancelled: 'secondary' }[s] || 'secondary' }

async function load() {
  loading.value = true; error.value = ''
  try { orders.value = (await posProdApi.listOrders()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}
async function loadLists() {
  try { makeable.value = (await posProdApi.makeable()).data.map(m => ({ label: `${m.itemNo} — ${m.description}`, value: m.itemNo })) } catch {}
  try { catalogue.value = (await posApi.getItems()).data.flatMap(c => c.items) } catch {}
}

async function createOrder() {
  creating.value = true; error.value = ''
  try {
    const { data } = await posProdApi.createOrder({ outputItemNo: newItem.value, outputQty: newQty.value })
    current.value = data; newItem.value = null; newQty.value = 1
    await load()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { creating.value = false }
}

async function openOrder(row) {
  try { current.value = (await posProdApi.getOrder(row.prodOrderId)).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

function addOverhead(e) {
  const it = catalogue.value.find(i => i.itemNo === ohItem.value)
  if (!it) return
  current.value.lines.push({ prodLineId: null, lineType: 'overhead', itemNo: it.itemNo, description: it.description, uom: it.unitOfMeasure || '', standardQty: 0, actualQty: 1, isService: true, unitCost: it.unitPrice ?? null, sortOrder: current.value.lines.length })
  ohItem.value = null
}

async function saveLines() {
  saving.value = true; error.value = ''
  try { current.value = (await posProdApi.setLines(current.value.prodOrderId, current.value.lines)).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { saving.value = false }
}

async function postOrder() {
  if (!window.confirm('Post this production order? Components are consumed and the finished stock becomes sellable.')) return
  posting.value = true; error.value = ''
  try {
    // Persist any edits first so posted consumption reflects the on-screen actuals.
    await posProdApi.setLines(current.value.prodOrderId, current.value.lines)
    current.value = (await posProdApi.postOrder(current.value.prodOrderId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { posting.value = false }
}

async function cancelOrder() {
  if (!window.confirm('Cancel this production order?')) return
  try { current.value = (await posProdApi.cancelOrder(current.value.prodOrderId)).data; await load() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

onMounted(async () => { await loadLists(); await load() })
</script>

<style scoped>
.prod-page { padding: 16px 20px; background:#0f172a; color:#e5e7eb; min-height: calc(100vh - 56px); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; color:#f3f4f6; }
.text-muted { color:#9ca3af; }
.text-sm { font-size:13px; }
.mb-3 { margin-bottom:12px; }

.card { background:#1f2937; border:1px solid #374151; border-radius:10px; padding:14px 16px; margin-bottom:16px; }
.card h3 { margin:0 0 10px; font-size:15px; display:flex; gap:8px; align-items:center; color:#f3f4f6; }
.card h3 .pi { color:#2dd4bf; }
.sub { font-size:13px; color:#cbd5e1; margin:12px 0 6px; }
.sub-row { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; flex-wrap:wrap; }

.new-row { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.fld { display:flex; flex-direction:column; gap:4px; }
.fld label { font-size:12px; color:#cbd5e1; }

.editor-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:8px; }

.lines { width:100%; border-collapse:collapse; font-size:13px; }
.lines th, .lines td { border-bottom:1px solid #374151; padding:5px 8px; text-align:left; color:#e5e7eb; }
.lines th { color:#f3f4f6; background:#111827; font-weight:700; }
.lines .r { text-align:right; }

.list-search { display:flex; align-items:center; gap:10px; margin-bottom:8px; }

.prod-page :deep(.p-inputtext), .prod-page :deep(.p-inputnumber-input) { background:#111827 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
.prod-page :deep(.p-paginator) { background:#1f2937 !important; color:#e5e7eb !important; }
</style>
