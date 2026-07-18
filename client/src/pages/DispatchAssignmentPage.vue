<template>
  <div class="disp-page">
    <div class="disp-head">
      <div>
        <h2>Dispatch Assignment</h2>
        <p class="sub">Assign each part (A · B · C · D) of a confirmed order to an assembler — parts can go to different assemblers.</p>
      </div>
      <Button icon="pi pi-refresh" label="Refresh" size="small" severity="secondary" :loading="loading" @click="load" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <Message v-if="!loading && !packers.length" severity="warn" :closable="false">
      No users with the <strong>packer</strong> role — create one in Admin → Setup before assigning.
    </Message>

    <div v-if="!loading && !orders.length" class="empty">No confirmed orders awaiting assignment.</div>

    <div class="ord-cards">
      <div v-for="o in orders" :key="o.DispatchOrderId" class="ord-card">
        <div class="oc-head">
          <div><span class="oc-no">{{ o.DispatchNo }}</span> <span class="oc-co">{{ o.Company }}</span></div>
          <div class="oc-cust">{{ o.CustomerName }}</div>
          <div class="oc-prog">{{ o.AssignedParts }}/{{ o.ActiveParts }} parts assigned</div>
        </div>

        <div class="bulk">
          <Select v-model="bulkPick[o.DispatchOrderId]" :options="packers" option-label="name" option-value="userId"
                  placeholder="Assign all remaining to…" filter class="bulk-sel" />
          <Button label="Assign all" size="small" :disabled="!bulkPick[o.DispatchOrderId]" :loading="busy === o.DispatchOrderId + ':all'"
                  @click="assignAll(o)" />
        </div>

        <div class="parts">
          <div v-for="p in o.parts" :key="p.Part" class="part-row" :class="{ assigned: p.AssignedToUserId }">
            <span class="pl">{{ p.Part }}</span>
            <template v-if="p.AssignedToUserId">
              <span class="assignee"><i class="pi pi-check-circle" /> {{ p.AssignedToName }}</span>
              <Button icon="pi pi-pencil" text size="small" v-tooltip="'Reassign'" @click="p.AssignedToUserId = null" />
            </template>
            <template v-else>
              <Select v-model="pick[o.DispatchOrderId + p.Part]" :options="packers" option-label="name" option-value="userId"
                      placeholder="Assembler…" filter class="part-sel" />
              <Button label="Assign" size="small" icon="pi pi-check" :disabled="!pick[o.DispatchOrderId + p.Part]"
                      :loading="busy === o.DispatchOrderId + ':' + p.Part" @click="assignOne(o, p)" />
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useToast } from 'primevue/usetoast'
import { dispatchApi } from '@/services/dispatch.js'
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
const bulkPick = reactive({})

async function load() {
  loading.value = true; error.value = null
  try {
    const [o, p] = await Promise.all([dispatchApi.unassigned(), dispatchApi.packers()])
    orders.value = o.data || []
    packers.value = p.data || []
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

async function assignOne(o, p) {
  const userId = pick[o.DispatchOrderId + p.Part]
  const packer = packers.value.find(x => x.userId === userId)
  busy.value = o.DispatchOrderId + ':' + p.Part
  try {
    await dispatchApi.assign(o.DispatchOrderId, { part: p.Part, userId, name: packer?.name })
    toast.add({ severity: 'success', summary: 'Assigned', detail: `Part ${p.Part} → ${packer?.name}`, life: 2500 })
    load()
  } catch (e) { toast.add({ severity: 'error', summary: 'Assign failed', detail: e.response?.data?.error || e.message, life: 4000 }) }
  finally { busy.value = null }
}

async function assignAll(o) {
  const userId = bulkPick[o.DispatchOrderId]
  const packer = packers.value.find(x => x.userId === userId)
  const assignments = o.parts.filter(p => !p.AssignedToUserId).map(p => ({ part: p.Part, userId, name: packer?.name }))
  if (!assignments.length) return
  busy.value = o.DispatchOrderId + ':all'
  try {
    await dispatchApi.assign(o.DispatchOrderId, { assignments })
    toast.add({ severity: 'success', summary: 'Assigned', detail: `${assignments.length} part(s) → ${packer?.name}`, life: 2500 })
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
.disp-head .sub { margin: 2px 0 0; color: #6b7280; font-size: 13px; max-width: 640px; }
.empty { padding: 32px; text-align: center; color: #9ca3af; }

.ord-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.ord-card { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.oc-head { padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #eef0f3; }
.oc-no { font-weight: 700; color: #1e40af; } .oc-co { color: #94a3b8; font-size: 12px; }
.oc-cust { font-weight: 700; margin-top: 2px; }
.oc-prog { font-size: 12px; color: #667085; margin-top: 2px; }
.bulk { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #f0f2f5; }
.bulk-sel { flex: 1; }
.parts { padding: 6px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.part-row { display: flex; align-items: center; gap: 8px; }
.part-row.assigned .pl { background: #dcfce7; color: #15803d; }
.pl { font-weight: 800; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #e5e7eb; color: #374151; border-radius: 8px; }
.part-sel { flex: 1; }
.assignee { flex: 1; color: #15803d; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 5px; }

@media (prefers-color-scheme: dark) {
  .disp-head .sub { color: #94a3b8; }
  .ord-card { border-color: #2c3a4f; }
  .oc-head { background: #1f2937; border-bottom-color: #2c3a4f; }
  .oc-cust { color: #f1f5f9; }
  .bulk { border-bottom-color: #212b3a; }
  .pl { background: #374151; color: #e5e7eb; }
  .part-row.assigned .pl { background: #16653480; color: #4ade80; }
}
</style>
