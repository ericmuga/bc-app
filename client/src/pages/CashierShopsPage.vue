<template>
  <div class="cs-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Cashiers ↔ Shops</h2>
        <p class="text-muted text-sm">Tag each cashier to one or more shops/terminals. The primary shop is what the POS opens to by default; the cashier can switch between assigned shops at the terminal.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" :loading="loading" @click="load" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <div class="filters">
      <div class="filter-field" style="flex:1">
        <label>Search (name, username, role)</label>
        <InputText v-model="q" placeholder="optional" />
      </div>
    </div>

    <DataTable :value="filteredUsers" dataKey="UserId" size="small" :loading="loading"
               responsive-layout="scroll" :paginator="true" :rows="50">
      <Column field="DisplayName" header="Cashier" style="min-width:160px" />
      <Column field="Username"    header="Username" style="width:140px" />
      <Column field="Role"        header="Role"     style="width:110px" />
      <Column header="Assigned shops" style="min-width:240px">
        <template #body="{ data }">
          <span v-if="!data.Shops" class="text-muted">—</span>
          <span v-else>
            <span v-for="code in (data.Shops || '').split(',').map(s => s.trim()).filter(Boolean)" :key="code"
                  class="shop-pill" :class="{ primary: code === data.PrimaryShop }">
              {{ code }}<i v-if="code === data.PrimaryShop" class="pi pi-star-fill" style="margin-left:4px;font-size:10px" />
            </span>
          </span>
        </template>
      </Column>
      <Column header="" style="width:80px">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" label="Assign" text size="small" @click="openEdit(data)" />
        </template>
      </Column>
    </DataTable>

    <!-- Assign dialog -->
    <Dialog v-model:visible="edit.visible" :header="edit.user ? `Assign shops — ${edit.user.DisplayName}` : ''"
            :modal="true" :style="{ width: '640px' }">
      <div v-if="edit.user">
        <p class="text-muted text-sm" style="margin-bottom:8px">
          Pick the shops this cashier can serve. Mark exactly one as <strong>primary</strong> — that's the default shop loaded on the POS terminal.
        </p>
        <DataTable :value="shopRows" size="small" responsive-layout="scroll">
          <Column header="" style="width:50px">
            <template #body="{ data }">
              <Checkbox v-model="data.assigned" binary @change="onAssignChange(data)" />
            </template>
          </Column>
          <Column field="Code"     header="Code"      style="width:110px" />
          <Column field="Name"     header="Name"      style="min-width:180px" />
          <Column field="LocationCode"     header="Location"  style="width:100px" />
          <Column field="SalespersonCode"  header="SP"        style="width:80px" />
          <Column header="Primary" style="width:80px;text-align:center">
            <template #body="{ data }">
              <input type="radio" name="primary" :value="data.Code"
                     :checked="data.Code === primaryCode"
                     :disabled="!data.assigned"
                     @change="primaryCode = data.Code" />
            </template>
          </Column>
        </DataTable>

        <div class="text-muted text-sm" style="margin-top:8px">
          {{ assignedCount }} shop(s) selected · primary: <strong>{{ primaryCode || '—' }}</strong>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="edit.visible = false" />
        <Button label="Save" icon="pi pi-save" severity="success"
                :loading="saving" :disabled="!edit.user" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Button     from 'primevue/button'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import InputText  from 'primevue/inputtext'
import Dialog     from 'primevue/dialog'
import Message    from 'primevue/message'
import Checkbox   from 'primevue/checkbox'
import { posSetupApi } from '@/services/pos.js'

const users   = ref([])
const shops   = ref([])
const loading = ref(false)
const error   = ref('')
const q       = ref('')

const filteredUsers = computed(() => {
  const ql = q.value.trim().toLowerCase()
  if (!ql) return users.value
  return users.value.filter(u =>
    `${u.DisplayName || ''} ${u.Username || ''} ${u.Role || ''} ${u.Shops || ''}`
      .toLowerCase().includes(ql)
  )
})

async function load() {
  loading.value = true; error.value = ''
  try {
    const [u, s] = await Promise.all([
      posSetupApi.listCashiersWithShops(),
      posSetupApi.listShops(),
    ])
    users.value = u.data
    shops.value = s.data
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally { loading.value = false }
}

const edit = reactive({ visible: false, user: null })
const shopRows    = ref([])
const primaryCode = ref('')
const saving      = ref(false)

const assignedCount = computed(() => shopRows.value.filter(s => s.assigned).length)

async function openEdit(user) {
  edit.user = user; edit.visible = true; primaryCode.value = ''
  shopRows.value = shops.value.map(s => ({ ...s, assigned: false }))
  try {
    const { data } = await posSetupApi.getCashierShops(user.UserId)
    const assignedSet = new Set(data.map(d => d.ShopCode))
    const primary = data.find(d => d.IsPrimary)
    primaryCode.value = primary?.ShopCode || (data[0]?.ShopCode || '')
    for (const r of shopRows.value) if (assignedSet.has(r.Code)) r.assigned = true
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  }
}
function onAssignChange(row) {
  // If un-checking the primary, hand the badge to the first remaining assigned row
  if (row.Code === primaryCode.value && !row.assigned) {
    const next = shopRows.value.find(r => r.assigned)
    primaryCode.value = next?.Code || ''
  }
  // Auto-select the first assigned row as primary if none is set yet
  if (!primaryCode.value) {
    const next = shopRows.value.find(r => r.assigned)
    if (next) primaryCode.value = next.Code
  }
}
async function save() {
  saving.value = true; error.value = ''
  try {
    const list = shopRows.value
      .filter(r => r.assigned)
      .map(r => ({ shopCode: r.Code, isPrimary: r.Code === primaryCode.value }))
    await posSetupApi.setCashierShops(edit.user.UserId, list)
    edit.visible = false
    await load()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.cs-page { padding: 16px 20px; background:var(--bc-surface); color:var(--bc-text); min-height: calc(100vh - 56px); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title  { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted  { color:var(--bc-text-muted); }
.text-sm     { font-size:13px; }
.mb-3        { margin-bottom:12px; }
.filters     { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin: 14px 0; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:var(--bc-text-muted); font-weight:500; }

.shop-pill {
  display:inline-block; padding:2px 8px; margin:2px 4px 2px 0;
  background:rgba(59,130,246,0.15); color:#93c5fd; border-radius:10px; font-size:12px; font-weight:500;
}
.shop-pill.primary { background:var(--bc-primary); color:#fff; }

.cs-page :deep(.p-inputtext) { background:var(--bc-surface-card) !important; color:var(--bc-text) !important; border-color:var(--bc-border) !important; }
.cs-page :deep(.p-datatable-thead > tr > th) { background:var(--bc-surface-raised) !important; color:var(--bc-text) !important; }
.cs-page :deep(.p-datatable-tbody > tr > td) { background:transparent !important; color:var(--bc-text) !important; }
</style>
