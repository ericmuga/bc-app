<template>
  <div class="disp-page">
    <div class="disp-head">
      <div>
        <h2>Dispatch Assignment</h2>
        <p class="sub">Assign confirmed orders to a packer. Assigned orders appear on the packer's Assembly screen.</p>
      </div>
      <Button icon="pi pi-refresh" label="Refresh" size="small" severity="secondary" :loading="loading" @click="load" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <Message v-if="!loading && !packers.length" severity="warn" :closable="false">
      No users with the <strong>packer</strong> role exist yet — create one in Admin → Setup before assigning.
    </Message>

    <DataTable :value="orders" :loading="loading" dataKey="DispatchOrderId" paginator :rows="15" responsiveLayout="scroll">
      <template #empty><div class="empty">No confirmed orders awaiting assignment.</div></template>
      <Column field="DispatchNo" header="Dispatch #" style="width:150px" />
      <Column field="OrderNo" header="Order #" style="width:150px" />
      <Column field="CustomerName" header="Customer" />
      <Column field="LineCount" header="Lines" style="width:80px" />
      <Column header="Packer" style="width:220px">
        <template #body="{ data }">
          <Select v-model="pick[data.DispatchOrderId]" :options="packers" option-label="name" option-value="userId"
                  placeholder="Select packer…" class="packer-sel" filter />
        </template>
      </Column>
      <Column header="" style="width:120px">
        <template #body="{ data }">
          <Button label="Assign" size="small" icon="pi pi-check"
                  :disabled="!pick[data.DispatchOrderId]" :loading="busy === data.DispatchOrderId"
                  @click="assign(data)" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'

const toast = useToast()
const orders = ref([])
const packers = ref([])
const loading = ref(false)
const error = ref(null)
const busy = ref(null)
const pick = reactive({})

async function load() {
  loading.value = true; error.value = null
  try {
    const [o, p] = await Promise.all([dispatchApi.unassigned(), dispatchApi.packers()])
    orders.value = o.data || []
    packers.value = p.data || []
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

async function assign(row) {
  const userId = pick[row.DispatchOrderId]
  const packer = packers.value.find(p => p.userId === userId)
  busy.value = row.DispatchOrderId
  try {
    await dispatchApi.assign(row.DispatchOrderId, { userId, name: packer?.name })
    toast.add({ severity: 'success', summary: 'Assigned', detail: `${row.DispatchNo} → ${packer?.name}`, life: 3000 })
    load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Assign failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busy.value = null }
}

load()
</script>

<style scoped>
.disp-page { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
.disp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.disp-head h2 { margin: 0; font-size: 20px; }
.disp-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 620px; }
.empty { padding: 32px; text-align: center; color: #9ca3af; }
.packer-sel { width: 100%; }
@media (prefers-color-scheme: dark) { .disp-head .sub { color: #94a3b8; } }
</style>
