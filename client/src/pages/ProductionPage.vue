<template>
  <div class="prod-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Production Orders</h2>
        <p class="text-muted text-sm">Build finished items from their recipes. Create an order, key actual consumption,
          add overheads, then post to avail the finished stock. Posted orders sync to Business Central.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <Select v-if="isManager && shops.length" v-model="shopCode" :options="shops" option-label="Name" option-value="Code"
                filter placeholder="Shop…" size="small" style="min-width:200px" @change="onShopChange" />
        <Button label="New Production Order" icon="pi pi-plus" @click="openCreate" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-3">{{ error }}</Message>

    <!-- History list -->
    <section class="card">
      <div class="list-search">
        <h3 style="margin:0;flex:1"><i class="pi pi-history" /> Production orders</h3>
        <InputText v-model="filters.global.value" placeholder="Search…" style="min-width:240px" />
        <span class="text-muted text-sm">{{ orders.length }}</span>
      </div>
      <DataTable :value="orders" dataKey="prodOrderId" size="small" :loading="loading" paginator :rows="25" removableSort
                 v-model:filters="filters" filterDisplay="row" :globalFilterFields="['orderNo','outputItemNo','outputDescription','status']">
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
        <Column header="" style="width:120px">
          <template #body="{data}">
            <Button :label="data.status==='open' ? 'Open' : 'View'" :icon="data.status==='open' ? 'pi pi-pencil' : 'pi pi-eye'"
                    text size="small" @click="openOrder(data)" />
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Create modal -->
    <Dialog v-model:visible="createVisible" header="New production order" :modal="true" :style="{ width:'460px' }" class="prod-dialog">
      <div class="fld"><label>Finished item (has a recipe)</label>
        <Select v-model="newItem" :options="makeable" option-label="label" option-value="value" filter placeholder="Select item…" style="width:100%" />
      </div>
      <div class="fld" style="margin-top:10px"><label>Output quantity</label>
        <InputNumber v-model="newQty" :min="0" :maxFractionDigits="4" style="width:160px" />
      </div>
      <Message v-if="createError" severity="error" :closable="false" class="mt-2">{{ createError }}</Message>
      <template #footer>
        <Button label="Cancel" text @click="createVisible=false" :disabled="creating" />
        <Button label="Create" icon="pi pi-check" :loading="creating" :disabled="!newItem || !(newQty>0)" @click="createOrder" />
      </template>
    </Dialog>

    <!-- Editor / detail modal -->
    <Dialog v-model:visible="editorVisible" :header="current ? `${current.orderNo}` : ''" :modal="true"
            :style="{ width:'900px' }" class="prod-dialog">
      <div v-if="current">
        <div class="ed-head">
          <div>
            <strong>{{ current.outputItemNo }}</strong> — {{ current.outputDescription }}
            · {{ n(current.outputQty) }} {{ current.outputUom }}
          </div>
          <Tag :value="current.status" :severity="statusSeverity(current.status)" />
        </div>

        <h4 class="sub">Components (consumed)</h4>
        <table class="lines">
          <thead><tr><th>Item</th><th>Description</th><th class="r">Standard</th><th class="r">Actual</th><th>UoM</th></tr></thead>
          <tbody>
            <tr v-for="(l,i) in components" :key="l.prodLineId || 'c'+i">
              <td>{{ l.itemNo }}</td><td>{{ l.description }}</td>
              <td class="r">{{ n(l.standardQty) }}</td>
              <td class="r"><InputNumber v-if="editable" v-model="l.actualQty" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ n(l.actualQty) }}</span></td>
              <td>{{ l.uom }}</td>
            </tr>
            <tr v-if="!components.length"><td colspan="5" class="text-muted">No components.</td></tr>
          </tbody>
        </table>

        <div class="sub-row">
          <h4 class="sub">Overheads (service — costing only)</h4>
          <Select v-if="editable" v-model="ohItem" :options="serviceOptions" option-label="label" option-value="value" filter
                  placeholder="Add overhead…" style="min-width:220px" @change="addOverhead" />
        </div>
        <table class="lines">
          <thead><tr><th>Item</th><th>Description</th><th class="r">Qty</th><th class="r">Unit cost</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(l,i) in overheads" :key="l.prodLineId || 'o'+i">
              <td>{{ l.itemNo }}</td><td>{{ l.description }}</td>
              <td class="r"><InputNumber v-if="editable" v-model="l.actualQty" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ n(l.actualQty) }}</span></td>
              <td class="r"><InputNumber v-if="editable" v-model="l.unitCost" :min="0" :maxFractionDigits="4" inputStyle="width:90px;text-align:right" /><span v-else>{{ l.unitCost==null?'—':n(l.unitCost) }}</span></td>
              <td><Button v-if="editable" icon="pi pi-trash" text severity="danger" size="small" @click="overheads.splice(i,1)" /></td>
            </tr>
            <tr v-if="!overheads.length"><td colspan="5" class="text-muted">No overheads.</td></tr>
          </tbody>
        </table>
      </div>

      <template #footer>
        <Button label="Close" text @click="editorVisible=false" />
        <template v-if="current && current.status==='open'">
          <Button label="Cancel order" icon="pi pi-times" text severity="danger" @click="cancelOrder" />
          <Button label="Save" icon="pi pi-save" severity="secondary" :loading="saving" @click="saveLines" />
          <Button label="Post" icon="pi pi-check-circle" severity="success" :loading="posting" @click="postOrder" />
        </template>
        <Button v-else-if="current && current.status==='posted'" label="Push to BC" icon="pi pi-cloud-upload"
                severity="help" :loading="pushing" @click="pushToBc" />
      </template>
    </Dialog>
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
import Dialog      from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { posProdApi, posApi, setAdminShopCode, getAdminShopCode } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'

const toast = useToast()
const auth  = useAuthStore()
// Production orders are per shop. Managers (admin/sales-admin) pick the shop;
// chef is auto-scoped to their own shop by the server.
const isManager = computed(() => ['admin', 'sales-admin'].includes(String(auth.user?.role || '').toLowerCase()))
const shops    = ref([])
const shopCode = ref(getAdminShopCode() || '')
async function loadShops() {
  if (!isManager.value) return
  try {
    shops.value = (await posApi.listMyShops()).data || []
    if (!shopCode.value && shops.value.length) { shopCode.value = shops.value[0].Code; setAdminShopCode(shopCode.value, { perTab: true }) }
  } catch { shops.value = [] }
}
function onShopChange() { setAdminShopCode(shopCode.value, { perTab: true }); load() }
const loading  = ref(false)
const error    = ref('')
const orders   = ref([])
const makeable = ref([])
const serviceItems = ref([])
const current  = ref(null)

const createVisible = ref(false)
const createError = ref('')
const newItem = ref(null)
const newQty  = ref(1)
const creating = ref(false)

const editorVisible = ref(false)
const saving  = ref(false)
const posting = ref(false)
const pushing = ref(false)
const ohItem  = ref(null)

const filters = ref({
  global:      { value: null, matchMode: 'contains' },
  orderNo:     { value: null, matchMode: 'contains' },
  outputItemNo:{ value: null, matchMode: 'contains' },
  status:      { value: null, matchMode: 'contains' },
})

const editable   = computed(() => current.value?.status === 'open')
const components = computed(() => (current.value?.lines || []).filter(l => l.lineType === 'component'))
const overheads  = computed(() => (current.value?.lines || []).filter(l => l.lineType === 'overhead'))
const serviceOptions = computed(() => serviceItems.value.map(i => ({ label: `${i.itemNo} — ${i.description}`, value: i.itemNo })))

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
  try { serviceItems.value = (await posProdApi.serviceItems()).data } catch {}
}

function openCreate() { createError.value = ''; newItem.value = null; newQty.value = 1; createVisible.value = true }
async function createOrder() {
  creating.value = true; createError.value = ''
  try {
    const { data } = await posProdApi.createOrder({ outputItemNo: newItem.value, outputQty: newQty.value })
    createVisible.value = false
    await load()
    current.value = data           // open the new order for keying actuals
    editorVisible.value = true
  } catch (e) { createError.value = e.response?.data?.error || e.message }
  finally { creating.value = false }
}

async function openOrder(row) {
  try { current.value = (await posProdApi.getOrder(row.prodOrderId)).data; editorVisible.value = true }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

function addOverhead() {
  const it = serviceItems.value.find(i => i.itemNo === ohItem.value)
  if (!it) return
  current.value.lines.push({ prodLineId: null, lineType: 'overhead', itemNo: it.itemNo, description: it.description, uom: it.uom || '', standardQty: 0, actualQty: 1, isService: true, unitCost: it.unitPrice ?? null, sortOrder: current.value.lines.length })
  ohItem.value = null
}

async function saveLines() {
  saving.value = true; error.value = ''
  try { current.value = (await posProdApi.setLines(current.value.prodOrderId, current.value.lines)).data; await load() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { saving.value = false }
}

async function postOrder() {
  if (!window.confirm('Post this production order? Components are consumed and the finished stock becomes sellable.')) return
  posting.value = true; error.value = ''
  try {
    await posProdApi.setLines(current.value.prodOrderId, current.value.lines)
    current.value = (await posProdApi.postOrder(current.value.prodOrderId)).data
    await load()
    toast.add({ severity: 'success', summary: 'Posted', detail: `${current.value.orderNo} produced.`, life: 4000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { posting.value = false }
}

async function pushToBc() {
  pushing.value = true; error.value = ''
  try {
    const { data } = await posProdApi.pushBc(current.value.prodOrderId)
    toast.add({ severity: 'success', summary: 'Pushed to BC', detail: `Header ${data.hdrInserted}, journal lines ${data.jnlInserted}, skipped ${data.jnlSkipped}.`, life: 6000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { pushing.value = false }
}

async function cancelOrder() {
  if (!window.confirm('Cancel this production order?')) return
  try { current.value = (await posProdApi.cancelOrder(current.value.prodOrderId)).data; await load(); editorVisible.value = false }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

onMounted(async () => { await loadShops(); await loadLists(); await load() })
</script>

<style scoped>
.prod-page { padding: 16px 20px; background:#0f172a; color:#e5e7eb; min-height: calc(100vh - 56px); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; color:#f3f4f6; }
.text-muted { color:#9ca3af; }
.text-sm { font-size:13px; }
.mb-3 { margin-bottom:12px; }
.mt-2 { margin-top:8px; }

.card { background:#1f2937; border:1px solid #374151; border-radius:10px; padding:14px 16px; margin-bottom:16px; }
.card h3 { margin:0; font-size:15px; display:flex; gap:8px; align-items:center; color:#f3f4f6; }
.card h3 .pi { color:#2dd4bf; }
.list-search { display:flex; align-items:center; gap:10px; margin-bottom:8px; }

.prod-page :deep(.p-inputtext), .prod-page :deep(.p-inputnumber-input) { background:#111827 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.prod-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
.prod-page :deep(.p-paginator) { background:#1f2937 !important; color:#e5e7eb !important; }
</style>

<!-- Unscoped: the create/editor dialogs teleport to <body>. Light theme, black text. -->
<style>
.prod-dialog.p-dialog { background:#ffffff; border:1px solid #d0d5dd; }
.prod-dialog.p-dialog .p-dialog-header { background:#f1f5f9 !important; color:#111827 !important; border-bottom:1px solid #e2e8f0; }
.prod-dialog.p-dialog .p-dialog-title { font-weight:700; color:#111827 !important; }
.prod-dialog.p-dialog .p-dialog-content { background:#ffffff !important; color:#111827 !important; }
.prod-dialog.p-dialog .p-dialog-footer { background:#f8fafc !important; border-top:1px solid #e2e8f0; }
.prod-dialog .fld { display:flex; flex-direction:column; gap:4px; }
.prod-dialog .fld label { font-size:12px; color:#475569; }
.prod-dialog .ed-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px; color:#111827; }
.prod-dialog .sub { font-size:13px; color:#334155; margin:12px 0 6px; }
.prod-dialog .sub-row { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; flex-wrap:wrap; }
.prod-dialog .text-muted { color:#64748b; }
.prod-dialog .lines { width:100%; border-collapse:collapse; font-size:13px; }
.prod-dialog .lines th, .prod-dialog .lines td { border-bottom:1px solid #e2e8f0; padding:5px 8px; text-align:left; color:#111827; }
.prod-dialog .lines th { color:#111827; background:#f1f5f9; font-weight:700; }
.prod-dialog .lines .r { text-align:right; }
.prod-dialog .p-inputtext, .prod-dialog .p-inputnumber-input { background:#ffffff !important; color:#111827 !important; border-color:#cbd5e1 !important; }
body > .p-dialog-mask:has(.prod-dialog) { background:rgba(15,23,42,0.55); }
</style>
