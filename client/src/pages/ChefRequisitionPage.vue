<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Weekly Material Requisition</h2>
        <p class="text-muted text-sm">Plan the cooked products for the week; the recipes are exploded into an aggregated raw-material list. Submit it for Business Central to fulfil (transfer to the shop or purchase &amp; receipt).</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="New Requisition" icon="pi pi-plus" @click="newRequisition" :loading="creating" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <DataTable :value="requests" dataKey="RequestId" size="small" :loading="loading"
      selection-mode="single" @row-click="openRequest" responsive-layout="scroll">
      <Column field="RequestNo" header="No" style="width:160px" />
      <Column field="ShopCode"  header="Shop" style="width:90px" />
      <Column field="LineCount" header="Materials" style="width:90px;text-align:right" />
      <Column field="TotalRequested" header="Total qty" style="width:100px;text-align:right">
        <template #body="{data}">{{ n(data.TotalRequested) }}</template>
      </Column>
      <Column field="Status" header="Status" style="width:110px">
        <template #body="{ data }"><Tag :value="data.Status" :severity="statusSeverity(data.Status)" /></template>
      </Column>
      <Column field="CreatedAt" header="Created" style="min-width:140px">
        <template #body="{ data }">{{ fmtTime(data.CreatedAt) }}</template>
      </Column>
    </DataTable>

    <!-- Editor -->
    <Dialog v-model:visible="editorVisible" :header="editorHeader" :modal="true" :style="{ width:'980px' }" class="st-dark-dialog">
      <div v-if="current" class="editor">
        <div class="editor-meta">
          <span><strong>{{ current.requestNo }}</strong></span>
          <Tag :value="current.status" :severity="statusSeverity(current.status)" />
        </div>

        <!-- Plan cooked products -->
        <div v-if="editable" class="plan-box">
          <h4>1 · Plan cooked products</h4>
          <div class="plan-add">
            <Select v-model="pickItem" :options="makeable" option-label="label" option-value="itemNo" filter
                    placeholder="Cooked product (synced BOM)…" style="flex:2" />
            <InputNumber v-model="pickQty" :min="0" :minFractionDigits="0" :maxFractionDigits="3" placeholder="Qty" style="flex:1" />
            <Button label="Add" icon="pi pi-plus" @click="addPlan" :disabled="!pickItem || !(pickQty>0)" />
          </div>
          <table v-if="plan.length" class="mini-table">
            <thead><tr><th>Cooked product</th><th class="r">Planned qty</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(p,i) in plan" :key="p.itemNo">
                <td>{{ p.itemNo }} — {{ p.description }}</td>
                <td class="r">{{ n(p.qty) }}</td>
                <td class="r"><Button icon="pi pi-times" text severity="danger" size="small" @click="plan.splice(i,1)" /></td>
              </tr>
            </tbody>
          </table>
          <div class="plan-actions">
            <Button label="Explode to raw materials" icon="pi pi-sitemap" severity="info" :loading="exploding"
                    :disabled="!plan.length" @click="explode" />
            <span v-if="explodeNote" class="text-muted text-sm">{{ explodeNote }}</span>
          </div>
        </div>

        <!-- Materials -->
        <h4>2 · Raw materials to requisition</h4>
        <DataTable :value="materials" size="small" responsive-layout="scroll">
          <Column field="itemNo" header="No" style="width:100px" />
          <Column field="description" header="Description" style="min-width:200px" />
          <Column field="uom" header="UoM" style="width:70px" />
          <Column header="Qty required" style="width:130px">
            <template #body="{ data }">
              <input v-if="editable" type="number" step="0.001" v-model.number="data.qty" class="line-input" />
              <span v-else>{{ n(data.qty) }}</span>
            </template>
          </Column>
          <Column v-if="editable" header="" style="width:50px">
            <template #body="{ index }"><Button icon="pi pi-times" text severity="danger" size="small" @click="materials.splice(index,1)" /></template>
          </Column>
        </DataTable>
        <p v-if="!materials.length" class="text-muted text-sm">No materials yet — plan cooked products above and explode, or this requisition is empty.</p>
      </div>

      <template #footer>
        <Button label="Close" text @click="editorVisible=false" />
        <Button label="Export CSV" icon="pi pi-file-excel" severity="secondary" :disabled="!materials.length" @click="exportCsv" />
        <Button v-if="editable" label="Save" icon="pi pi-save" :loading="saving" :disabled="!materials.length" @click="saveLines" />
        <Button v-if="editable" label="Save &amp; Submit" icon="pi pi-send" severity="info" :loading="saving" :disabled="!materials.length" @click="saveAndSubmit" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button    from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column    from 'primevue/column'
import Dialog    from 'primevue/dialog'
import Select    from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Tag       from 'primevue/tag'
import Message   from 'primevue/message'
import { stockApi, posProdApi } from '@/services/pos.js'

const requests = ref([]); const loading = ref(false); const error = ref('')
const editorVisible = ref(false); const current = ref(null)
const creating = ref(false); const saving = ref(false); const exploding = ref(false)
const makeable = ref([])
const plan = ref([]); const materials = ref([])
const pickItem = ref(null); const pickQty = ref(1)
const explodeNote = ref('')

const editable = computed(() => ['open', 'submitted'].includes(current.value?.status))
const editorHeader = computed(() => current.value ? `Requisition ${current.value.requestNo}` : 'Requisition')

async function load() {
  loading.value = true; error.value = ''
  try { requests.value = (await stockApi.listRequests()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { loading.value = false }
}
async function loadMakeable() {
  // Same source as the production order: finished items that have an active
  // (synced) POS BOM. Response shape is { itemNo, description }.
  try {
    makeable.value = (await posProdApi.makeable()).data
      .map(m => ({ itemNo: m.itemNo, description: m.description, label: `${m.itemNo} — ${m.description}` }))
  } catch { /* non-fatal */ }
}
async function newRequisition() {
  creating.value = true; error.value = ''
  try {
    const { data } = await stockApi.createRequest({ notes: 'Weekly material requisition' })
    const id = data.RequestId || data.requestId
    await openById(id)
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { creating.value = false }
}
async function openRequest(e) { await openById(e.data.RequestId) }
async function openById(id) {
  current.value = (await stockApi.getRequest(id)).data
  plan.value = []; explodeNote.value = ''
  materials.value = (current.value.lines || []).map(l => ({
    itemNo: l.itemNo, description: l.description, uom: l.unitOfMeasure || '', qty: Number(l.quantityRequested || 0),
  }))
  editorVisible.value = true
}
function addPlan() {
  const it = makeable.value.find(m => m.itemNo === pickItem.value)
  if (!it) return
  const existing = plan.value.find(p => p.itemNo === it.itemNo)
  if (existing) existing.qty = Number(existing.qty) + Number(pickQty.value)
  else plan.value.push({ itemNo: it.itemNo, description: it.description, qty: Number(pickQty.value) })
  pickItem.value = null; pickQty.value = 1
}
async function explode() {
  exploding.value = true; error.value = ''; explodeNote.value = ''
  try {
    const { data } = await stockApi.explodeRecipes(plan.value.map(p => ({ itemNo: p.itemNo, qty: p.qty })))
    // Merge exploded materials into the existing grid (sum duplicates).
    const map = new Map(materials.value.map(m => [m.itemNo, { ...m }]))
    for (const mtl of data.materials) {
      const cur = map.get(mtl.itemNo) || { itemNo: mtl.itemNo, description: mtl.description, uom: mtl.uom, qty: 0 }
      cur.qty = Math.round((Number(cur.qty) + Number(mtl.qty)) * 1000) / 1000
      if (!cur.uom) cur.uom = mtl.uom
      map.set(mtl.itemNo, cur)
    }
    materials.value = [...map.values()].sort((a, b) => a.itemNo.localeCompare(b.itemNo))
    const noBom = data.recipes.filter(r => !r.hasBom).map(r => r.itemNo)
    explodeNote.value = noBom.length ? `No recipe for: ${noBom.join(', ')}` : `Exploded ${data.recipes.length} product(s) into ${data.materials.length} material(s).`
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { exploding.value = false }
}
function linesPayload() {
  return materials.value.filter(m => m.itemNo && Number(m.qty) > 0).map(m => ({
    itemNo: m.itemNo, description: m.description, quantityRequested: Number(m.qty), unitOfMeasure: m.uom || null,
  }))
}
async function saveLines() {
  saving.value = true; error.value = ''
  try {
    await stockApi.setLines(current.value.requestId, linesPayload())
    await openById(current.value.requestId)
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { saving.value = false }
}
async function saveAndSubmit() {
  saving.value = true; error.value = ''
  try {
    await stockApi.setLines(current.value.requestId, linesPayload())
    await stockApi.submitRequest(current.value.requestId)
    await openById(current.value.requestId)
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { saving.value = false }
}
function exportCsv() {
  const rows = [['ItemNo', 'Description', 'UoM', 'QtyRequired']]
  materials.value.forEach(m => rows.push([m.itemNo, m.description, m.uom, m.qty]))
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `requisition-${current.value?.requestNo || 'materials'}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function fmtTime(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle:'short', timeStyle:'short' }) : '' }
function n(v) { return Number(v || 0).toFixed(2) }
function statusSeverity(s) {
  return { open:'info', submitted:'warn', approved:'help', completed:'success', cancelled:'secondary' }[s] ?? 'secondary'
}
onMounted(() => { load(); loadMakeable() })
</script>

<style scoped>
.stock-page { padding: 16px 20px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; } .text-sm { font-size:13px; } .mb-3 { margin-bottom:12px; }
.editor { display:flex; flex-direction:column; gap:12px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; }
.line-input { width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none; text-align:right; background:#fff; color:#111827; }
.stock-page :deep(.p-datatable) { border:1px solid #374151; border-radius:8px; overflow:hidden; }
.stock-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; font-weight:700; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-bottom:1px solid #374151 !important; }
.stock-page :deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#232f3e !important; }
.stock-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
</style>

<style>
.st-dark-dialog.p-dialog { background:#fff; border:1px solid #d0d5dd; box-shadow:0 12px 40px rgba(15,23,42,0.28); }
.st-dark-dialog.p-dialog .p-dialog-header { background:#f1f5f9 !important; color:#111827 !important; border-bottom:1px solid #e2e8f0; }
.st-dark-dialog.p-dialog .p-dialog-title { font-weight:700; font-size:16px; color:#111827 !important; }
.st-dark-dialog.p-dialog .p-dialog-header .p-dialog-header-icon { color:#334155 !important; }
.st-dark-dialog.p-dialog .p-dialog-content { background:#fff !important; color:#111827 !important; }
.st-dark-dialog.p-dialog .p-dialog-footer { background:#f8fafc !important; border-top:1px solid #e2e8f0; }
.st-dark-dialog .editor-meta, .st-dark-dialog h4 { color:#111827 !important; }
.st-dark-dialog .text-muted { color:#475569 !important; }
.st-dark-dialog .plan-box { border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
.st-dark-dialog .plan-box h4 { margin:0 0 8px; }
.st-dark-dialog .plan-add { display:flex; gap:8px; align-items:center; }
.st-dark-dialog .plan-actions { margin-top:10px; display:flex; gap:10px; align-items:center; }
.st-dark-dialog .mini-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
.st-dark-dialog .mini-table th, .st-dark-dialog .mini-table td { padding:4px 8px; border-bottom:1px solid #e5e7eb; color:#111827; text-align:left; }
.st-dark-dialog .mini-table .r { text-align:right; }
.st-dark-dialog h4 { margin:6px 0 4px; font-size:14px; }
.st-dark-dialog .p-inputtext, .st-dark-dialog .line-input { background:#fff !important; color:#111827 !important; border-color:#cbd5e1 !important; }
.st-dark-dialog .p-datatable-thead > tr > th { background:#f1f5f9 !important; color:#111827 !important; border-bottom:1px solid #e2e8f0 !important; }
.st-dark-dialog .p-datatable-tbody > tr > td { background:#fff !important; color:#111827 !important; border-bottom:1px solid #eef2f6 !important; }
.st-dark-dialog .p-datatable-tbody > tr:nth-child(even) > td { background:#f8fafc !important; }
body > .p-dialog-mask:has(.st-dark-dialog) { background:rgba(15,23,42,0.55); }
</style>
