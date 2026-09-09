<template>
  <div class="wh-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Warehouse Sync Center</h2>
        <p class="text-muted text-sm">
          Data-warehouse ETL health (FCLWHS · 172.16.10.9) — SQL Server Agent jobs, refresh procedures
          and fact-table freshness. Separate from the POS Sync Center. Admin / analyst.
        </p>
      </div>
      <div class="head-actions">
        <label class="chk"><input type="checkbox" v-model="failedOnly" /> Failed only</label>
        <Button label="Refresh" icon="pi pi-sync" :loading="loading" size="small" @click="loadAll" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-3">{{ error }}</Message>

    <!-- ── Fact freshness ─────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h3><i class="pi pi-database" /> Fact table freshness</h3></div>
      <div class="fact-grid">
        <div v-for="f in facts" :key="f.table" class="fact-tile" :class="{ stale: isStale(f) }">
          <div class="fact-label">{{ f.label }}</div>
          <div class="fact-table">{{ f.table }}</div>
          <template v-if="f.exists && !f.error">
            <div class="fact-rows">{{ fmtNum(f.rows) }} <span>rows</span></div>
            <div class="fact-meta">Max date: <b>{{ f.maxDate ? fmtDate(f.maxDate) : '—' }}</b></div>
            <div class="fact-meta">Last load: <b>{{ f.lastLoad ? fmtDateTime(f.lastLoad) : '—' }}</b></div>
          </template>
          <div v-else class="fact-meta err">{{ f.error ? 'error: ' + f.error : 'table not found' }}</div>
        </div>
        <div v-if="!facts.length" class="text-muted text-sm">No fact tables reported.</div>
      </div>
    </section>

    <!-- ── SQL Agent jobs ─────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head">
        <h3><i class="pi pi-server" /> SQL Agent jobs <span class="count">{{ shownJobs.length }}</span></h3>
        <span class="text-muted text-sm">{{ failCount }} failing · {{ runningCount }} running</span>
      </div>
      <DataTable :value="shownJobs" size="small" scrollable scrollHeight="460px" dataKey="job"
                 :loading="loading" class="jobs-tbl">
        <Column field="job" header="Job" style="min-width:220px">
          <template #body="{ data }">
            <span class="job-name">{{ data.job }}</span>
            <i v-if="!data.enabled" class="pi pi-ban disabled-ico" title="Disabled" />
          </template>
        </Column>
        <Column header="Last run" style="min-width:200px">
          <template #body="{ data }">
            <Tag v-if="data.isRunning" value="RUNNING" severity="info" />
            <Tag v-else-if="data.lastOutcome" :value="data.lastOutcome" :severity="sev(data.lastOutcome)" />
            <span v-else class="text-muted">never</span>
            <span v-if="data.lastRun" class="sub">{{ fmtDateTime(data.lastRun) }}</span>
          </template>
        </Column>
        <Column field="lastDuration" header="Dur" style="width:90px" />
        <Column header="Schedule" style="min-width:170px">
          <template #body="{ data }">
            <span v-if="data.scheduled">{{ data.schedules }}</span>
            <Tag v-else value="unscheduled" severity="warn" />
          </template>
        </Column>
        <Column header="Next run" style="min-width:150px">
          <template #body="{ data }">
            <span :class="{ 'text-muted': !data.nextRun }">{{ data.nextRun ? fmtDateTime(data.nextRun) : '—' }}</span>
          </template>
        </Column>
        <Column header="" style="width:160px">
          <template #body="{ data }">
            <Button icon="pi pi-history" text rounded size="small" title="Run history" @click="openHistory(data)" />
            <Button label="Run now" icon="pi pi-play" size="small" severity="secondary"
                    :loading="running === data.job" :disabled="data.isRunning"
                    @click="confirmRun(data)" />
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- ── Refresh procedures ─────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head"><h3><i class="pi pi-code" /> Refresh procedures <span class="count">{{ procedures.length }}</span></h3></div>
      <DataTable :value="procedures" size="small" scrollable scrollHeight="320px" dataKey="name" :loading="loading">
        <Column field="name" header="Procedure" style="min-width:280px" />
        <Column header="Run by job(s)" style="min-width:220px">
          <template #body="{ data }">
            <span v-if="data.runByJobs.length" class="job-chips">
              <Tag v-for="j in data.runByJobs" :key="j" :value="j" severity="secondary" class="chip" />
            </span>
            <Tag v-else value="no job" severity="warn" />
          </template>
        </Column>
        <Column header="Last modified" style="width:170px">
          <template #body="{ data }">{{ fmtDate(data.modifiedAt) }}</template>
        </Column>
      </DataTable>
    </section>

    <!-- ── Run-history dialog ─────────────────────────────────────────────── -->
    <Dialog v-model:visible="histVisible" :header="`Run history — ${histJob}`" modal :style="{ width: '780px' }">
      <DataTable :value="history" size="small" scrollable scrollHeight="420px" :loading="histLoading" dataKey="instanceId">
        <Column header="When" style="width:170px"><template #body="{ data }">{{ fmtDateTime(data.runAt) }}</template></Column>
        <Column header="Step" style="min-width:150px">
          <template #body="{ data }"><span class="sub2">{{ data.stepId }}</span> {{ data.stepName }}</template>
        </Column>
        <Column header="Outcome" style="width:120px">
          <template #body="{ data }"><Tag :value="data.outcome" :severity="sev(data.outcome)" /></template>
        </Column>
        <Column field="duration" header="Dur" style="width:90px" />
        <Column header="Message" style="min-width:260px">
          <template #body="{ data }"><span class="msg" :title="data.message">{{ data.message }}</span></template>
        </Column>
      </DataTable>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column    from 'primevue/column'
import Button    from 'primevue/button'
import Tag       from 'primevue/tag'
import Message   from 'primevue/message'
import Dialog    from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { warehouseApi } from '@/services/warehouse.js'

const toast = useToast()
const loading = ref(false)
const error   = ref('')
const jobs    = ref([])
const facts   = ref([])
const procedures = ref([])
const failedOnly = ref(false)
const running = ref('')

const shownJobs = computed(() => failedOnly.value
  ? jobs.value.filter(j => j.lastOutcome === 'FAILED' && !j.isRunning)
  : jobs.value)
const failCount    = computed(() => jobs.value.filter(j => j.lastOutcome === 'FAILED' && !j.isRunning).length)
const runningCount = computed(() => jobs.value.filter(j => j.isRunning).length)

function sev(outcome) {
  switch (outcome) {
    case 'SUCCEEDED': return 'success'
    case 'FAILED':    return 'danger'
    case 'RETRY':     return 'warn'
    case 'CANCELED':  return 'secondary'
    default:          return 'info'
  }
}
function isStale(f) {
  if (!f.exists || !f.maxDate) return false
  const days = (Date.now() - new Date(f.maxDate).getTime()) / 86400000
  return days > 2
}
const fmtNum = (n) => Number(n || 0).toLocaleString('en-KE')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE') : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const [j, f, p] = await Promise.all([warehouseApi.jobs(), warehouseApi.facts(), warehouseApi.procedures()])
    jobs.value = j.data.jobs || []
    facts.value = f.data.facts || []
    procedures.value = p.data.procedures || []
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { loading.value = false }
}

async function confirmRun(job) {
  if (!window.confirm(`Start SQL Agent job "${job.job}" now on the warehouse?`)) return
  running.value = job.job
  try {
    await warehouseApi.runJob(job.job)
    toast.add({ severity: 'success', summary: 'Job started', detail: `${job.job} was asked to start. Refresh in a moment to see the outcome.`, life: 6000 })
    setTimeout(loadAll, 3000)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Could not start job', detail: e.response?.data?.error || e.message, life: 7000 })
  } finally { running.value = '' }
}

// History dialog
const histVisible = ref(false)
const histJob     = ref('')
const history     = ref([])
const histLoading = ref(false)
async function openHistory(job) {
  histJob.value = job.job; histVisible.value = true; histLoading.value = true; history.value = []
  try { history.value = (await warehouseApi.jobHistory(job.job, 40)).data.history || [] }
  catch (e) { toast.add({ severity: 'error', summary: 'History failed', detail: e.response?.data?.error || e.message, life: 6000 }) }
  finally { histLoading.value = false }
}

onMounted(loadAll)
</script>

<style scoped>
/* Dark navy theme — matches Sales / Finance / Inventory reports. */
.wh-page { padding: 16px; display: flex; flex-direction: column; gap: 16px; background: #151b28; min-height: 100%; color: #e8eef7; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.page-title { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #f8fafc; }
.head-actions { display: flex; align-items: center; gap: 14px; }
.chk { font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #cbd6e6; }
.card { background: #1b2233; border: 1px solid #324256; border-radius: 10px; padding: 14px 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-head h3 { margin: 0; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #f8fafc; }
.card-head .count { background: #243247; color: #93b4ef; border-radius: 10px; padding: 1px 8px; font-size: 12px; margin-left: 6px; }
.text-muted { color: #94a6bf; } .text-sm { font-size: 13px; } .mb-3 { margin-bottom: 12px; }

.fact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.fact-tile { border: 1px solid #324256; border-radius: 8px; padding: 12px; background: #212a3d; }
.fact-tile.stale { border-color: #b45309; background: #2a2317; }
.fact-label { font-weight: 700; font-size: 14px; color: #f8fafc; }
.fact-table { font-family: monospace; font-size: 11px; color: #94a6bf; margin-bottom: 8px; }
.fact-rows { font-size: 20px; font-weight: 700; color: #f8fafc; } .fact-rows span { font-size: 12px; font-weight: 400; color: #94a6bf; }
.fact-meta { font-size: 12px; color: #cbd6e6; margin-top: 2px; }
.fact-meta.err { color: #f8a3a3; }

.job-name { font-weight: 600; color: #f8fafc; }
.disabled-ico { color: #6b7a92; margin-left: 6px; font-size: 12px; }
.sub { display: block; font-size: 11px; color: #94a6bf; margin-top: 2px; }
.sub2 { display: inline-block; min-width: 18px; color: #6b7a92; font-size: 11px; }
.job-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; }
.msg { display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }

/* ── Deep PrimeVue overrides — dark navy tables ─────────────────────────────── */
:deep(.p-datatable),
:deep(.p-datatable-table-container),
:deep(.p-datatable-table),
:deep(.p-datatable-tbody > tr) { background: #1b2233 !important; }
:deep(.p-datatable-tbody > tr > td) { color: #f8fafc !important; background: #1b2233 !important; padding: 6px 10px !important; border-color: #324256 !important; vertical-align: top; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background: #212a3d !important; }
:deep(.p-datatable-tbody > tr:hover > td) { background: rgba(255,255,255,0.06) !important; }
:deep(.p-datatable-thead > tr > th) { background: #243247 !important; color: #f8fafc !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .04em; padding: 8px 10px !important; border-color: #324256 !important; }
:deep(.p-paginator) { background: #1b2233 !important; color: #f8fafc !important; border-color: #324256 !important; }
/* Dialog (run history) dark surface */
:deep(.p-dialog) { background: #1b2233 !important; color: #f8fafc !important; }
:deep(.p-dialog .p-dialog-header) { background: #1b2233 !important; color: #f8fafc !important; border-color: #324256 !important; }
:deep(.p-dialog .p-dialog-content) { background: #1b2233 !important; color: #f8fafc !important; }
</style>
