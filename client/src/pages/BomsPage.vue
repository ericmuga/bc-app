<template>
  <div class="bom-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Recipes (BOM)</h2>
        <p class="text-muted text-sm">Define what a finished item is made of — its components and how much of each per unit.
          Recipes drive production orders.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="New Recipe" icon="pi pi-plus" @click="newBom" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-3">{{ error }}</Message>

    <!-- Editor -->
    <section v-if="editing" class="card">
      <h3><i class="pi pi-pencil" /> {{ form.itemId || form._existing ? 'Edit recipe' : 'New recipe' }}</h3>
      <div class="new-row">
        <div class="fld" style="flex:1;min-width:260px">
          <label>Finished item</label>
          <Select v-model="form.itemNo" :options="finishedOptions" option-label="label" option-value="value"
                  filter placeholder="Select finished item…" :disabled="form._existing" @change="onFinishedChange" />
        </div>
        <div class="chk"><Checkbox v-model="form.isActive" binary input-id="bom-active" /><label for="bom-active">Active</label></div>
        <div class="fld" style="flex:1;min-width:220px"><label>Notes</label><InputText v-model="form.notes" fluid placeholder="Optional" /></div>
      </div>

      <div class="sub-row">
        <h4 class="sub">Components</h4>
        <Select v-model="addComp" :options="componentOptions" option-label="label" option-value="value" filter
                placeholder="Add component…" style="min-width:240px" @change="addComponent" />
      </div>
      <table class="lines">
        <thead><tr><th>Item</th><th>Description</th><th class="r">Qty per unit</th><th>UoM</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(l,i) in form.lines" :key="i">
            <td>{{ l.componentItemNo }}</td>
            <td>{{ l.description }}</td>
            <td class="r"><InputNumber v-model="l.qtyPer" :min="0" :maxFractionDigits="4" inputStyle="width:100px;text-align:right" /></td>
            <td>{{ l.uom }}</td>
            <td><Button icon="pi pi-trash" text severity="danger" size="small" @click="form.lines.splice(i,1)" /></td>
          </tr>
          <tr v-if="!form.lines.length"><td colspan="5" class="text-muted">Add at least one component.</td></tr>
        </tbody>
      </table>

      <div class="editor-actions">
        <Button label="Save recipe" icon="pi pi-save" :loading="saving" :disabled="!form.itemNo || !form.lines.length" @click="save" />
        <Button label="Cancel" text @click="editing=false" />
      </div>
    </section>

    <!-- List -->
    <section class="card">
      <div class="list-search">
        <h3 style="margin:0;flex:1"><i class="pi pi-list" /> Recipes</h3>
        <InputText v-model="filters.global.value" placeholder="Search…" style="min-width:240px" />
        <span class="text-muted text-sm">{{ boms.length }}</span>
      </div>
      <DataTable :value="boms" dataKey="ItemNo" size="small" :loading="loading" paginator :rows="25" removableSort
                 v-model:filters="filters" filterDisplay="row" :globalFilterFields="['ItemNo','Description']">
        <Column field="ItemNo" header="Finished item" sortable :showFilterMenu="false">
          <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Item" style="width:100%" /></template>
        </Column>
        <Column field="Description" header="Description" sortable :showFilterMenu="false">
          <template #filter="{ filterModel, filterCallback }"><InputText v-model="filterModel.value" @input="filterCallback()" placeholder="Description" style="width:100%" /></template>
        </Column>
        <Column field="LineCount" header="Components" sortable style="text-align:right">
          <template #body="{data}">{{ data.LineCount ?? '—' }}</template>
        </Column>
        <Column field="IsActive" header="Active" sortable>
          <template #body="{data}"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
        </Column>
        <Column header="" style="width:110px">
          <template #body="{data}">
            <Button icon="pi pi-pencil" text size="small" @click="editBom(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="removeBom(data)" />
          </template>
        </Column>
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
import Checkbox    from 'primevue/checkbox'
import DataTable   from 'primevue/datatable'
import Column      from 'primevue/column'
import Message     from 'primevue/message'
import { posApi, posProdApi } from '@/services/pos.js'

const loading = ref(false)
const saving  = ref(false)
const error   = ref('')
const boms    = ref([])
const items   = ref([])
const editing = ref(false)
const addComp = ref(null)
const form    = ref({ itemNo: '', isActive: true, notes: '', lines: [], _existing: false })

const filters = ref({
  global:      { value: null, matchMode: 'contains' },
  ItemNo:      { value: null, matchMode: 'contains' },
  Description: { value: null, matchMode: 'contains' },
})

// Finished items: non-service; components: any item.
const finishedOptions  = computed(() => items.value.filter(i => !i.isService).map(i => ({ label: `${i.itemNo} — ${i.description}`, value: i.itemNo, item: i })))
const componentOptions = computed(() => items.value.map(i => ({ label: `${i.itemNo} — ${i.description}`, value: i.itemNo, item: i })))

async function load() {
  loading.value = true; error.value = ''
  try { boms.value = (await posApi.listBoms()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}
async function loadItems() {
  try { items.value = (await posProdApi.items()).data } catch {}
}

function newBom() {
  form.value = { itemNo: '', isActive: true, notes: '', lines: [], _existing: false }
  editing.value = true
}
function onFinishedChange() { /* description shown from list; nothing else needed */ }

async function editBom(row) {
  try {
    const { data } = await posApi.getBom(row.ItemNo)
    form.value = {
      itemNo: data.ItemNo, isActive: !!data.IsActive, notes: data.Notes || '', _existing: true,
      lines: (data.lines || []).map(l => ({ componentItemNo: l.ComponentItemNo, description: l.Description || '', qtyPer: Number(l.QtyPer || 0), uom: l.Uom || '', sortOrder: l.SortOrder })),
    }
    editing.value = true
  } catch (e) { error.value = e.response?.data?.error || e.message }
}

function addComponent() {
  const it = items.value.find(i => i.itemNo === addComp.value)
  if (!it) return
  if (form.value.lines.some(l => l.componentItemNo === it.itemNo)) { addComp.value = null; return }
  form.value.lines.push({ componentItemNo: it.itemNo, description: it.description, qtyPer: 1, uom: it.uom || '', sortOrder: form.value.lines.length })
  addComp.value = null
}

async function save() {
  saving.value = true; error.value = ''
  try {
    await posApi.saveBom({
      itemNo: form.value.itemNo, isActive: form.value.isActive, notes: form.value.notes,
      lines: form.value.lines.map((l, i) => ({ componentItemNo: l.componentItemNo, description: l.description, qtyPer: l.qtyPer, uom: l.uom, sortOrder: i })),
    })
    editing.value = false
    await load()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { saving.value = false }
}

async function removeBom(row) {
  if (!window.confirm(`Delete the recipe for ${row.ItemNo}?`)) return
  try { await posApi.deleteBom(row.ItemNo); await load() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

onMounted(async () => { await loadItems(); await load() })
</script>

<style scoped>
.bom-page { padding: 16px 20px; background:#0f172a; color:#e5e7eb; min-height: calc(100vh - 56px); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; color:#f3f4f6; }
.text-muted { color:#9ca3af; }
.text-success { color:#22c55e; }
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
.chk { display:flex; align-items:center; gap:6px; font-size:13px; }
.editor-actions { display:flex; gap:8px; margin-top:12px; }

.lines { width:100%; border-collapse:collapse; font-size:13px; }
.lines th, .lines td { border-bottom:1px solid #374151; padding:5px 8px; text-align:left; color:#e5e7eb; }
.lines th { color:#f3f4f6; background:#111827; font-weight:700; }
.lines .r { text-align:right; }
.list-search { display:flex; align-items:center; gap:10px; margin-bottom:8px; }

.bom-page :deep(.p-inputtext), .bom-page :deep(.p-inputnumber-input) { background:#111827 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.bom-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; border-color:#374151 !important; }
.bom-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.bom-page :deep(.p-datatable-tbody > tr:hover > td) { background:#374151 !important; }
.bom-page :deep(.p-paginator) { background:#1f2937 !important; color:#e5e7eb !important; }
</style>
