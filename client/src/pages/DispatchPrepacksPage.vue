<template>
  <div class="prepacks-page">
    <header>
      <div><h2>Prepacks</h2>
        <p>Make up numbered packs ahead of the orders (pack sizes from BC “MOQ and Pack Sizes”), print their labels, and scan them during assembly.</p></div>
    </header>
    <Message v-if="error" severity="error" @close="error=''">{{ error }}</Message>

    <section class="card">
      <h3>Make prepacks</h3>
      <div class="form-row">
        <label>Company<Select v-model="company" :options="companies" fluid @change="loadAll" /></label>
        <label class="grow">Item<Select v-model="itemNo" :options="items" option-label="label" option-value="ItemNo" filter placeholder="Pack item" fluid :loading="loadingItems" /></label>
        <label>Pack<Select v-model="packType" :options="packOptions" option-label="label" option-value="value" fluid /></label>
        <label>Number of packs<InputNumber v-model="count" :min="1" :max="200" fluid /></label>
        <label>Batch number<InputText v-model="batchNo" maxlength="5" placeholder="optional" fluid /></label>
        <Button label="Make and print labels" icon="pi pi-print" :loading="creating" :disabled="!itemNo || !packType || !count" @click="create" />
      </div>
      <small v-if="selected">{{ selected.Description }} · main pack {{ selected.MainPackSize }}<template v-if="selected.MiniPackSize"> · mini pack {{ selected.MiniPackSize }}</template> · {{ selected.AllowLoose ? 'loose pieces allowed' : 'no loose pieces' }}</small>
      <Message v-if="!loadingItems && !items.length" severity="info">No pack items in BC for {{ company }}. Set them up in BC under MOQ and Pack Sizes.</Message>
    </section>

    <section class="card">
      <h3>Prepacks in stock</h3>
      <DataTable :value="stock" size="small" striped-rows>
        <Column field="ItemNo" header="Item" /><Column field="Description" header="Description" />
        <Column header="Pack"><template #body="{data}">{{ data.PackType==='mini'?'Mini':'Main' }} · {{ data.PackSize }}</template></Column>
        <Column field="Packs" header="Packs" /><Column field="Pieces" header="Pieces" />
      </DataTable>
    </section>

    <section class="card">
      <div class="form-row"><h3 class="grow">Prepack register</h3>
        <label>Status<Select v-model="status" :options="['available','used','void','all']" @change="loadList" /></label>
        <Button label="Print selected labels" icon="pi pi-print" severity="secondary" :disabled="!picked.length" @click="printLabels(picked.map(p=>p.PrepackId))" />
        <Button label="Void prepacks" icon="pi pi-ban" severity="danger" outlined @click="openVoid(picked.filter(p=>p.Status==='available'))" />
      </div>
      <DataTable v-model:selection="picked" :value="list" data-key="PrepackId" size="small" paginator :rows="20" striped-rows>
        <Column selection-mode="multiple" header-style="width:3rem" />
        <Column field="PrepackNo" header="Prepack" /><Column field="ItemNo" header="Item" /><Column field="Description" header="Description" />
        <Column header="Pack"><template #body="{data}">{{ data.PackType==='mini'?'Mini':'Main' }} · {{ data.PackSize }}</template></Column>
        <Column field="BatchNo" header="Batch" /><Column field="Chiller" header="Chiller" /><Column field="Status" header="Status" />
        <Column field="OrderNo" header="Used on order" /><Column field="CreatedByName" header="Made by" />
        <Column header="Voided"><template #body="{data}"><span v-if="data.Status==='void'">{{ data.VoidReason }} · {{ data.VoidedByName }}<template v-if="data.VoidedAt"> · {{ new Date(data.VoidedAt).toLocaleString() }}</template></span></template></Column>
        <Column header=""><template #body="{data}"><Button v-if="data.Status==='available'" label="Void" size="small" severity="danger" text @click="openVoid([data])" /></template></Column>
      </DataTable>
    </section>

    <Dialog v-model:visible="voidOpen" modal header="Void prepacks" :style="{ width: '34rem', maxWidth: '95vw' }" :closable="!voiding">
      <p class="hint">The prepack number is cancelled for good and its pieces go back to loose stock, ready to be prepacked again. Only prepacks still in stock can be voided — a prepack used on an order must be removed from that order line in assembly first.</p>
      <label class="field">Scan prepack label<InputText v-model="voidScan" placeholder="Scan or type a prepack number (PP…)" autocomplete="off" fluid :disabled="voiding" @keydown.enter.prevent="addVoidScan" /></label>
      <div v-if="voidNos.length" class="chips">
        <Button v-for="no in voidNos" :key="no" :label="no" icon="pi pi-times" icon-pos="right" size="small" severity="secondary" :disabled="voiding" @click="voidNos = voidNos.filter(x => x !== no)" />
      </div>
      <small v-else>No prepacks selected yet.</small>
      <label class="field">Reason<InputText v-model="voidReason" placeholder="e.g. damaged pack, wrong item, label misprint" maxlength="200" fluid :disabled="voiding" /></label>
      <template #footer>
        <Button label="Cancel" severity="secondary" text :disabled="voiding" @click="voidOpen = false" />
        <Button :label="`Void ${voidNos.length || ''} prepack${voidNos.length === 1 ? '' : 's'}`" icon="pi pi-ban" severity="danger" :loading="voiding" :disabled="!voidNos.length || !voidReason.trim()" @click="confirmVoid" />
      </template>
    </Dialog>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'

const toast = useToast()
const companies = ['FCL', 'CM', 'FLM', 'RMK']
const company = ref('FCL'), items = ref([]), itemNo = ref(null), packType = ref('main'), count = ref(1), batchNo = ref('')
const stock = ref([]), list = ref([]), picked = ref([]), status = ref('available')
const loadingItems = ref(false), creating = ref(false), error = ref('')
const message = e => e?.response?.data?.error || e?.message || String(e)
const selected = computed(() => items.value.find(i => i.ItemNo === itemNo.value))
const packOptions = computed(() => {
  const s = selected.value
  const o = [{ label: s ? `Main pack (${s.MainPackSize})` : 'Main pack', value: 'main' }]
  if (!s || s.MiniPackSize) o.push({ label: s ? `Mini pack (${s.MiniPackSize})` : 'Mini pack', value: 'mini' })
  return o
})

async function loadItems() {
  loadingItems.value = true
  try { items.value = (await dispatchApi.packItems(company.value)).data.map(i => ({ ...i, label: `${i.ItemNo} · ${i.Description || ''}` })) }
  catch (e) { items.value = []; error.value = message(e) } finally { loadingItems.value = false }
}
async function loadStock() { try { stock.value = (await dispatchApi.prepackStock(company.value)).data } catch (e) { error.value = message(e) } }
async function loadList() { try { list.value = (await dispatchApi.prepacks({ company: company.value, status: status.value })).data; picked.value = [] } catch (e) { error.value = message(e) } }
function loadAll() { itemNo.value = null; return Promise.all([loadItems(), loadStock(), loadList()]) }

async function printLabels(ids) {
  try {
    const res = await dispatchApi.prepackLabels(ids)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (e) { error.value = message(e) }
}
async function create() {
  creating.value = true; error.value = ''
  try {
    const made = (await dispatchApi.createPrepacks({ company: company.value, itemNo: itemNo.value, packType: packType.value, count: count.value, batchNo: batchNo.value || undefined })).data
    toast.add({ severity: 'success', summary: `${made.length} prepack(s) made`, detail: `${made[0].PrepackNo}${made.length > 1 ? ' – ' + made[made.length - 1].PrepackNo : ''}`, life: 4000 })
    await printLabels(made.map(p => p.PrepackId))
    await Promise.all([loadStock(), loadList()])
  } catch (e) { error.value = message(e) } finally { creating.value = false }
}
// ── Void (scan or select; serial cancelled, pieces back to loose stock) ──────
const voidOpen = ref(false), voidNos = ref([]), voidScan = ref(''), voidReason = ref(''), voiding = ref(false)
function openVoid(rows = []) {
  voidNos.value = rows.map(p => p.PrepackNo); voidScan.value = ''; voidReason.value = ''; voidOpen.value = true
}
function addVoidScan() {
  const no = voidScan.value.trim(); voidScan.value = ''
  if (!no) return
  // A QR scan reads the prepack number; normalise typed numbers to upper case.
  const v = /^pp\d+$/i.test(no) ? no.toUpperCase() : no
  if (voidNos.value.includes(v)) { toast.add({ severity: 'warn', summary: `${v} is already in the list`, life: 2500 }); return }
  voidNos.value = [...voidNos.value, v]
}
async function confirmVoid() {
  voiding.value = true; error.value = ''
  try {
    const { voided, released } = (await dispatchApi.voidPrepacks({ nos: voidNos.value, reason: voidReason.value })).data
    const back = released.map(r => `${r.Pieces} pcs of ${r.ItemNo}`).join(', ')
    toast.add({ severity: 'success', summary: `${voided.length} prepack(s) voided`, detail: `${voided.map(p => p.PrepackNo).join(', ')} cancelled · back for prepacking: ${back}`, life: 6000 })
    voidOpen.value = false
    await Promise.all([loadStock(), loadList()])
  } catch (e) { toast.add({ severity: 'error', summary: 'Nothing was voided', detail: message(e), life: 6000 }) }
  finally { voiding.value = false }
}
onMounted(loadAll)
</script>
<style scoped>
.prepacks-page{display:flex;flex-direction:column;gap:1rem}
.card{background:var(--p-content-background,#fff);border:1px solid var(--p-content-border-color,#ddd);border-radius:8px;padding:1rem}
.form-row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end}
.form-row label{display:flex;flex-direction:column;gap:.25rem;min-width:9rem}
.grow{flex:1;min-width:14rem}
h3{margin:0 0 .5rem}
.field{display:flex;flex-direction:column;gap:.25rem;margin:.75rem 0 .5rem}
.chips{display:flex;flex-wrap:wrap;gap:.35rem}
.hint{margin:0;color:var(--p-text-muted-color,#666);font-size:.9rem}
</style>
