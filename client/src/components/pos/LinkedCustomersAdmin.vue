<template>
  <div class="lc-admin">
    <p class="text-muted text-sm intro">
      Extra BC customers a shop can sell to instead of its own shop customer (e.g. a distributor on distributor prices).
      The cashier switches to them on the terminal; every new sale starts on the shop customer. Prices come from the
      customer's BC Sales Prices (customer-specific, then its price group) and refresh with the shop-price sync.
    </p>

    <div class="lc-toolbar">
      <Button v-if="!form" label="Link a customer" icon="pi pi-plus" size="small" @click="openForm()" />
      <Button label="Resync all prices" icon="pi pi-sync" size="small" severity="secondary" :loading="syncingAll" @click="syncAll" />
      <Select v-model="shopFilter" :options="shopFilterOpts" option-label="label" option-value="value" size="small"
              placeholder="All shops" show-clear class="lc-filter" />
      <span v-if="message" class="lc-msg" :class="{ err: messageErr }">{{ message }}</span>
    </div>

    <!-- Add / edit form -->
    <div v-if="form" class="lc-form">
      <div class="lc-grid">
        <div class="lc-field">
          <label>Company</label>
          <Select v-model="form.company" :options="companies" :disabled="!!form.linkedCustomerId" @change="form.customer = null" />
        </div>
        <div class="lc-field wide">
          <label>BC customer</label>
          <AutoComplete v-model="form.customer" :suggestions="suggestions" option-label="label" :delay="300" force-selection
                        :disabled="!!form.linkedCustomerId" placeholder="Search name or customer no…" fluid
                        @complete="search">
            <template #option="{ option }">
              <div class="lc-opt" :class="{ off: !option.kesOnly || option.blocked === 3 }">
                <strong>{{ option.customerNo }}</strong> {{ option.name }}
                <span class="text-muted">{{ option.priceGroup || 'no price group' }}</span>
                <span v-if="!option.kesOnly" class="lc-warn">{{ option.currencyCode }} — not allowed</span>
                <span v-else-if="option.blocked" class="lc-warn">blocked</span>
              </div>
            </template>
          </AutoComplete>
        </div>
        <div class="lc-field check">
          <label class="lc-check"><Checkbox v-model="form.isGlobal" binary /> Available to all shops</label>
        </div>
        <div class="lc-field">
          <label>Shop</label>
          <Select v-model="form.shopCode" :options="shops" option-label="Name" option-value="Code" filter
                  :disabled="form.isGlobal" :placeholder="form.isGlobal ? 'All shops' : 'Select shop…'" />
        </div>
        <div class="lc-field check">
          <label class="lc-check"><Checkbox v-model="form.isActive" binary /> Active</label>
        </div>
        <div class="lc-field wide"><label>Notes</label><InputText v-model="form.notes" /></div>
      </div>
      <div class="lc-actions">
        <Button label="Cancel" text size="small" @click="form = null" />
        <Button :label="form.linkedCustomerId ? 'Save' : 'Link & sync prices'" icon="pi pi-check" size="small"
                :loading="saving" :disabled="!canSave" @click="save" />
      </div>
    </div>

    <DataTable :value="filtered" size="small" data-key="linkedCustomerId" :loading="loading" responsive-layout="scroll">
      <Column field="company" header="Company" style="width:80px" />
      <Column field="customerNo" header="Customer" style="width:100px" />
      <Column field="customerName" header="Name" style="min-width:180px" />
      <Column field="priceGroup" header="Price group" style="width:120px" />
      <Column header="Scope" style="width:150px">
        <template #body="{ data }">
          <Tag v-if="data.isGlobal" value="All shops" severity="info" />
          <span v-else>{{ shopName(data.shopCode) }}</span>
        </template>
      </Column>
      <Column header="Prices" style="width:150px">
        <template #body="{ data }">
          <span>{{ data.priceCount }}</span>
          <span class="text-muted lc-when">{{ when(data.lastPriceSyncAt) }}</span>
          <div v-if="data.lastPriceSyncError" class="lc-warn" :title="data.lastPriceSyncError">sync failed</div>
        </template>
      </Column>
      <Column header="Active" style="width:70px">
        <template #body="{ data }"><i :class="data.isActive ? 'pi pi-check lc-ok' : 'pi pi-times lc-off'" /></template>
      </Column>
      <Column header="" style="width:130px">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text rounded size="small" v-tooltip="'Edit'" @click="openForm(data)" />
          <Button icon="pi pi-sync" text rounded size="small" v-tooltip="'Resync prices'" :loading="syncingId === data.linkedCustomerId" @click="syncOne(data)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger" v-tooltip="'Remove'" @click="remove(data)" />
        </template>
      </Column>
      <template #empty><div class="text-muted lc-empty">No linked customers yet.</div></template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import AutoComplete from 'primevue/autocomplete'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import { posSetupApi } from '@/services/pos.js'

const props = defineProps({ shops: { type: Array, default: () => [] } })   // [{ Code, Name }]
const emit = defineEmits(['count'])

const companies = ['FCL', 'CM', 'RMK', 'FLM']
const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const syncingAll = ref(false)
const syncingId = ref(null)
const message = ref('')
const messageErr = ref(false)
const form = ref(null)
const suggestions = ref([])
const shopFilter = ref(null)

const shopFilterOpts = computed(() => props.shops.map((s) => ({ label: `${s.Code} — ${s.Name}`, value: s.Code })))
const filtered = computed(() => shopFilter.value
  ? rows.value.filter((r) => r.isGlobal || r.shopCode === shopFilter.value)
  : rows.value)
const canSave = computed(() => form.value && (form.value.linkedCustomerId || form.value.customer?.customerNo)
  && (form.value.isGlobal || form.value.shopCode))

function say(text, isErr = false) { message.value = text; messageErr.value = isErr }
function shopName(code) { const s = props.shops.find((x) => x.Code === code); return s ? `${code} — ${s.Name}` : code }
function when(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : 'never' }

async function load() {
  loading.value = true
  try { rows.value = (await posSetupApi.listLinkedCustomers()).data; emit('count', rows.value.length) }
  catch (e) { say(e.response?.data?.error ?? e.message, true) }
  finally { loading.value = false }
}

function openForm(row = null) {
  say('')
  form.value = row
    ? { linkedCustomerId: row.linkedCustomerId, company: row.company,
        customer: { customerNo: row.customerNo, label: `${row.customerNo} — ${row.customerName}` },
        isGlobal: row.isGlobal, shopCode: row.shopCode, isActive: row.isActive, notes: row.notes }
    : { linkedCustomerId: null, company: 'FCL', customer: null, isGlobal: false, shopCode: shopFilter.value || null, isActive: true, notes: '' }
}

async function search(e) {
  try {
    const { data } = await posSetupApi.searchBcCustomers(form.value.company, e.query)
    suggestions.value = data.map((c) => ({ ...c, label: `${c.customerNo} — ${c.name}` }))
  } catch (err) { suggestions.value = []; say(err.response?.data?.error ?? err.message, true) }
}

async function save() {
  const f = form.value
  if (!f.linkedCustomerId && f.customer && (!f.customer.kesOnly || f.customer.blocked === 3)) {
    say(`${f.customer.customerNo} cannot be linked (${f.customer.kesOnly ? 'blocked in BC' : `billed in ${f.customer.currencyCode}`})`, true)
    return
  }
  saving.value = true
  try {
    const { data } = await posSetupApi.saveLinkedCustomer({
      linkedCustomerId: f.linkedCustomerId, company: f.company, customerNo: f.customer.customerNo,
      isGlobal: f.isGlobal, shopCode: f.isGlobal ? null : f.shopCode, isActive: f.isActive, notes: f.notes,
    })
    const errs = data.priceSync?.errors || []
    say(errs.length ? `Saved, but price sync failed: ${errs.join('; ')}` : `${data.customerName}: ${data.priceCount} price(s) synced from BC`, errs.length > 0)
    form.value = null
    await load()
  } catch (e) { say(e.response?.data?.error ?? e.message, true) }
  finally { saving.value = false }
}

async function syncOne(row) {
  syncingId.value = row.linkedCustomerId
  try {
    const { data } = await posSetupApi.syncLinkedCustomerPrices(row.linkedCustomerId)
    say(data.errors.length ? data.errors.join('; ') : `${row.customerName}: ${data.prices} price(s)`, data.errors.length > 0)
    await load()
  } catch (e) { say(e.response?.data?.error ?? e.message, true) }
  finally { syncingId.value = null }
}

async function syncAll() {
  syncingAll.value = true
  try {
    const { data } = await posSetupApi.syncLinkedCustomerPrices()
    say(`${data.customers} customer(s), ${data.prices} price(s)${data.errors.length ? ` — ${data.errors.length} failed: ${data.errors.join('; ')}` : ''}`, data.errors.length > 0)
    await load()
  } catch (e) { say(e.response?.data?.error ?? e.message, true) }
  finally { syncingAll.value = false }
}

async function remove(row) {
  if (!confirm(`Remove ${row.customerName} (${row.company} ${row.customerNo})${row.isGlobal ? ' from all shops' : ` from ${row.shopCode}`}?`)) return
  try {
    const { data } = await posSetupApi.deleteLinkedCustomer(row.linkedCustomerId)
    say(data.deactivated ? 'It has sales history, so it was deactivated instead of deleted.' : 'Removed.')
    await load()
  } catch (e) { say(e.response?.data?.error ?? e.message, true) }
}

onMounted(load)
</script>

<style scoped>
.intro { margin: 0 0 10px; }
.lc-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
.lc-filter { min-width:200px; }
.lc-msg { font-size:13px; color:#15803d; }
.lc-msg.err { color:#dc2626; }
.lc-form { border:1px solid var(--bc-border, #d0d5dd); border-radius:8px; padding:12px; margin-bottom:12px; max-width:980px; }
.lc-grid { display:grid; grid-template-columns: 110px 2fr 170px 1.2fr 90px; gap:10px; align-items:end; }
.lc-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
.lc-field.wide { grid-column: span 1; }
.lc-field label { font-size:12px; font-weight:600; }
.lc-field.check { padding-bottom:6px; }
.lc-check { display:flex; gap:6px; align-items:center; font-size:13px; font-weight:500 !important; cursor:pointer; }
.lc-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
.lc-opt { display:flex; gap:8px; align-items:baseline; font-size:13px; }
.lc-opt.off { opacity:.55; }
.lc-warn { color:#dc2626; font-size:11px; }
.lc-when { display:block; font-size:11px; }
.lc-ok { color:#16a34a; }
.lc-off { color:#9ca3af; }
.lc-empty { padding:14px; text-align:center; }
.text-muted { color:#6b7280; }
.text-sm { font-size:13px; }
@media (max-width: 900px) { .lc-grid { grid-template-columns: 1fr 1fr; } }
</style>
