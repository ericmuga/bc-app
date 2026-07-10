<template>
  <div class="audit-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Audit Log</h2>
        <p class="text-muted text-sm">Every successful POS create / update / delete is recorded here. Filter by user and period for the activity view.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
        <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="exportCsv" :loading="exporting" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="entries">Entries</Tab>
        <Tab value="byUser">Activity by user</Tab>
      </TabList>
      <TabPanels>
        <!-- ── Entries ────────────────────────────────────────────────── -->
        <TabPanel value="entries">
          <div class="filters">
            <div class="filter-field"><label>From</label><DatePicker v-model="dateFrom" date-format="yy-mm-dd" /></div>
            <div class="filter-field"><label>To</label>  <DatePicker v-model="dateTo"   date-format="yy-mm-dd" /></div>
            <div class="filter-field" style="min-width:180px">
              <label>Entity</label>
              <Select v-model="entityType" :options="entityOptions" placeholder="Any entity" show-clear />
            </div>
            <div class="filter-field" style="min-width:160px">
              <label>Action</label>
              <Select v-model="action" :options="actionOptions" placeholder="Any action" show-clear />
            </div>
            <div class="filter-field" style="flex:1;min-width:220px">
              <label>Search (path / user / entityId)</label>
              <InputText v-model="q" placeholder="optional" />
            </div>
            <Button label="Run" icon="pi pi-play" @click="load" :loading="loading" />
          </div>

          <DataTable :value="entries" dataKey="AuditId" size="small" :loading="loading"
                     responsive-layout="scroll" :paginator="true" :rows="50">
            <Column field="OccurredAt" header="Time" style="width:170px">
              <template #body="{ data }">{{ fmtDateTime(data.OccurredAt) }}</template>
            </Column>
            <Column field="UserName"   header="User"   style="min-width:150px" />
            <Column field="Role"       header="Role"   style="width:90px" />
            <Column field="Action"     header="Action" style="width:110px">
              <template #body="{ data }"><Tag :value="data.Action" :severity="actionSeverity(data.Action)" /></template>
            </Column>
            <Column field="EntityType" header="Entity" style="width:140px" />
            <Column field="EntityId"   header="Entity Id" style="width:160px" />
            <Column field="Method"     header="HTTP" style="width:70px" />
            <Column field="Path"       header="Path" style="min-width:240px" />
            <Column field="Status"     header="Status" style="width:75px;text-align:right" />
            <Column field="Ip"         header="IP"   style="width:120px" />
          </DataTable>
        </TabPanel>

        <!-- ── Activity by user ──────────────────────────────────────── -->
        <TabPanel value="byUser">
          <div class="filters">
            <div class="filter-field"><label>From</label><DatePicker v-model="dateFrom" date-format="yy-mm-dd" /></div>
            <div class="filter-field"><label>To</label>  <DatePicker v-model="dateTo"   date-format="yy-mm-dd" /></div>
            <Button label="Run" icon="pi pi-play" @click="loadByUser" :loading="loadingByUser" />
          </div>

          <DataTable :value="byUserGrouped" dataKey="key" size="small" :loading="loadingByUser"
                     responsive-layout="scroll">
            <Column field="UserName" header="User" style="min-width:160px" />
            <Column field="Role"     header="Role" style="width:100px" />
            <Column header="Total" style="width:80px;text-align:right">
              <template #body="{ data }"><strong>{{ data.total }}</strong></template>
            </Column>
            <Column header="Days" style="min-width:300px">
              <template #body="{ data }">
                <span v-for="d in data.days" :key="d.day" class="day-pill">
                  {{ d.day }}: <strong>{{ d.count }}</strong>
                </span>
              </template>
            </Column>
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button     from 'primevue/button'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import InputText  from 'primevue/inputtext'
import Select     from 'primevue/select'
import Tag        from 'primevue/tag'
import Message    from 'primevue/message'
import Tabs       from 'primevue/tabs'
import TabList    from 'primevue/tablist'
import Tab        from 'primevue/tab'
import TabPanels  from 'primevue/tabpanels'
import TabPanel   from 'primevue/tabpanel'
import { auditApi } from '@/services/pos.js'

const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

const tab        = ref('entries')
const dateFrom   = ref(monthStart)
const dateTo     = ref(today)
const entityType = ref(null)
const action     = ref(null)
const q          = ref('')

const entityOptions = ['order','transfer','portioning','write-off','manual-sale',
                       'stock-request','stock-take','till','payment','setup','category','item']
const actionOptions = ['create','update','replace','delete','post','submit','approve',
                       'cancel','complete','sign','checkout','stk-push','print','reprint']

const entries        = ref([])
const loading        = ref(false)
const error          = ref('')
const exporting      = ref(false)

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtDateTime(v) { return v ? new Date(v).toLocaleString('en-KE') : '' }

function actionSeverity(a) {
  if (['delete','cancel'].includes(a)) return 'danger'
  if (['create','approve','sign','post','complete','checkout','print'].includes(a)) return 'success'
  if (['update','replace','submit','reprint'].includes(a)) return 'info'
  return 'secondary'
}

async function load() {
  loading.value = true; error.value = ''
  try {
    const params = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value), limit: 1000 }
    if (entityType.value) params.entityType = entityType.value
    if (action.value)     params.action     = action.value
    if (q.value.trim())   params.q          = q.value.trim()
    const { data } = await auditApi.list(params)
    entries.value = data
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loading.value = false
  }
}

async function exportCsv() {
  exporting.value = true; error.value = ''
  try {
    const params = { dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value), limit: 5000 }
    if (entityType.value) params.entityType = entityType.value
    if (action.value)     params.action     = action.value
    if (q.value.trim())   params.q          = q.value.trim()
    const res = await auditApi.exportCsv(params)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-${params.dateFrom}_${params.dateTo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    exporting.value = false
  }
}

// ── Activity by user ───────────────────────────────────────────────────────
const byUserRows    = ref([])
const loadingByUser = ref(false)

async function loadByUser() {
  loadingByUser.value = true; error.value = ''
  try {
    const { data } = await auditApi.byUser({
      dateFrom: isoDate(dateFrom.value),
      dateTo:   isoDate(dateTo.value),
    })
    byUserRows.value = data
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loadingByUser.value = false
  }
}

const byUserGrouped = computed(() => {
  const grouped = new Map()
  for (const r of byUserRows.value) {
    const key = `${r.UserId || r.UserName}__${r.Role || ''}`
    let g = grouped.get(key)
    if (!g) { g = { key, UserId: r.UserId, UserName: r.UserName, Role: r.Role, total: 0, days: [] }; grouped.set(key, g) }
    g.total += Number(r.Count || 0)
    g.days.push({ day: r.Day ? new Date(r.Day).toISOString().slice(0,10) : '', count: Number(r.Count || 0) })
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total)
})

onMounted(load)
</script>

<style scoped>
.audit-page { padding: 16px 20px; background:#f4f6f8; color:#111827; color-scheme:light; min-height: calc(100vh - 56px); }

/* Force light rendering on every form control + datatable so Chrome dark-mode can't invert them */
.audit-page :deep(.p-inputtext),
.audit-page :deep(.p-inputnumber-input),
.audit-page :deep(.p-select),
.audit-page :deep(.p-select-label),
.audit-page :deep(.p-datepicker-input),
.audit-page :deep(.p-textarea),
.audit-page :deep(input[type="text"]),
.audit-page :deep(input[type="number"]),
.audit-page :deep(input[type="search"]),
.audit-page :deep(textarea) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #d1d5db !important;
  color-scheme: light;
}
.audit-page :deep(.p-tabs),
.audit-page :deep(.p-tablist),
.audit-page :deep(.p-tabpanels),
.audit-page :deep(.p-tabpanel) {
  background: transparent !important;
  color: #111827 !important;
}
.audit-page :deep(.p-tab) {
  color: #4b5563 !important;
}
.audit-page :deep(.p-tab.p-tab-active),
.audit-page :deep(.p-tab[data-p-active="true"]) {
  color: #1d4ed8 !important;
  border-color: #1d4ed8 !important;
}
.audit-page :deep(.p-datatable),
.audit-page :deep(.p-datatable-tbody > tr),
.audit-page :deep(.p-datatable-tbody > tr > td) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}
.audit-page :deep(.p-datatable-thead > tr > th) {
  background: #f3f4f6 !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}
.audit-page :deep(.p-datatable-tbody > tr:hover > td) {
  background: #e8eef7 !important;
  color: #102a56 !important;
}
.audit-page :deep(.p-paginator) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}
.audit-page :deep(.p-paginator .p-paginator-page),
.audit-page :deep(.p-paginator .p-paginator-prev),
.audit-page :deep(.p-paginator .p-paginator-next),
.audit-page :deep(.p-paginator .p-paginator-first),
.audit-page :deep(.p-paginator .p-paginator-last) {
  color: #4b5563 !important;
}
.audit-page :deep(.p-paginator .p-paginator-page.p-highlight) {
  background: #2563eb !important;
  color: #ffffff !important;
}
.audit-page :deep(.p-message) {
  color: #111827 !important;
}
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#6b7280; }
.text-sm { font-size:13px; }
.mb-3 { margin-bottom:12px; }

.filters { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin: 14px 0; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }

.day-pill {
  display:inline-block; padding:2px 8px; margin:2px 4px 2px 0;
  background:#eef2ff; color:#1e3a8a; border-radius:10px; font-size:12px;
}
</style>
