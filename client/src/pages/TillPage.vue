<template>
  <div class="till-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Cash Till</h2>
        <p class="text-muted text-sm">Open the till with starting balances, record cash drops/payouts, close with a count to see variance.</p>
      </div>
      <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <!-- Current session OR open-till button -->
    <div v-if="!current" class="open-card">
      <i class="pi pi-lock-open open-card-icon" />
      <div class="open-card-text">
        <div class="open-card-title">No till is open</div>
        <div class="open-card-sub">Open a till session to begin recording sales for this shift.</div>
      </div>
      <Button label="Open Till" icon="pi pi-play" severity="success" @click="openOpenDialog" />
    </div>

    <div v-else class="session-card">
      <div class="session-head">
        <div>
          <div class="session-no">{{ current.sessionNo }}</div>
          <div class="session-meta">
            <Tag :value="current.status" :severity="current.status === 'open' ? 'success' : 'secondary'" />
            <span>{{ current.shopCode }}</span>
            <span>·</span>
            <span>{{ current.cashierName }}</span>
            <span>·</span>
            <span>opened {{ fmtTime(current.openedAt) }}</span>
            <span v-if="current.closedAt">· closed {{ fmtTime(current.closedAt) }}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <Button v-if="current.status === 'open'"
                  label="Add Cash Movement" icon="pi pi-money-bill" @click="openTxnDialog" />
          <Button v-if="current.status === 'open'"
                  label="Close Till" icon="pi pi-lock" severity="danger" @click="openCloseDialog" />
        </div>
      </div>

      <!-- Cash Report -->
      <h3 class="section-title">Cash Report</h3>
      <DataTable :value="report?.rows ?? []" size="small" responsive-layout="scroll">
        <Column field="paymentTypeName" header="Payment Method" style="min-width:140px" />
        <Column header="Opening"  style="width:100px;text-align:right">
          <template #body="{ data }">{{ n(data.opening) }}</template>
        </Column>
        <Column header="Sales"    style="width:100px;text-align:right">
          <template #body="{ data }"><span class="num pos">{{ n(data.sales) }}</span></template>
        </Column>
        <Column header="Cash In"  style="width:100px;text-align:right">
          <template #body="{ data }"><span class="num pos">{{ n(data.cashIn) }}</span></template>
        </Column>
        <Column header="Cash Out" style="width:100px;text-align:right">
          <template #body="{ data }"><span class="num neg">{{ n(data.cashOut) }}</span></template>
        </Column>
        <Column header="Expected" style="width:110px;text-align:right">
          <template #body="{ data }"><strong>{{ n(data.expected) }}</strong></template>
        </Column>
        <Column header="Declared" style="width:110px;text-align:right">
          <template #body="{ data }">{{ data.declared == null ? '—' : n(data.declared) }}</template>
        </Column>
        <Column header="Variance" style="width:110px;text-align:right">
          <template #body="{ data }">
            <span v-if="data.variance == null">—</span>
            <span v-else :class="varianceClass(data.variance)">{{ n(data.variance) }}</span>
          </template>
        </Column>
        <template #footer>
          <div v-if="report?.totals" class="totals-row">
            <span>TOTALS</span>
            <span>Opening: <strong>{{ n(report.totals.opening) }}</strong></span>
            <span>Sales: <strong>{{ n(report.totals.sales) }}</strong></span>
            <span>Expected: <strong>{{ n(report.totals.expected) }}</strong></span>
            <span v-if="report.totals.declared != null">Declared: <strong>{{ n(report.totals.declared) }}</strong></span>
            <span v-if="report.totals.variance != null" :class="varianceClass(report.totals.variance)">Variance: <strong>{{ n(report.totals.variance) }}</strong></span>
          </div>
        </template>
      </DataTable>

      <!-- Cash transactions log -->
      <h3 class="section-title" style="margin-top:18px">Cash Movements</h3>
      <DataTable :value="current.transactions" size="small" :paginator="true" :rows="10" responsive-layout="scroll">
        <Column field="createdAt"       header="When"   style="width:140px">
          <template #body="{ data }">{{ fmtTime(data.createdAt) }}</template>
        </Column>
        <Column field="paymentTypeCode" header="Method" style="width:110px" />
        <Column field="transactionType" header="Type"   style="width:110px" />
        <Column header="Amount" style="width:110px;text-align:right">
          <template #body="{ data }">
            <span :class="data.amount > 0 ? 'num pos' : 'num neg'">{{ n(data.amount) }}</span>
          </template>
        </Column>
        <Column field="reference" header="Reference" style="min-width:120px" />
        <Column field="notes"     header="Notes"     style="min-width:160px" />
      </DataTable>
    </div>

    <!-- ── Past sessions ─────────────────────────────────────────── -->
    <h3 class="section-title" style="margin-top:24px">Past Sessions</h3>
    <DataTable :value="pastSessions" size="small" :paginator="true" :rows="10" responsive-layout="scroll"
      selection-mode="single" @row-click="loadPast">
      <Column field="SessionNo" header="No" style="width:160px" />
      <Column field="ShopCode"  header="Shop" style="width:90px" />
      <Column field="CashierName" header="Cashier" style="min-width:140px" />
      <Column field="Status" header="Status" style="width:90px">
        <template #body="{ data }"><Tag :value="data.Status" :severity="data.Status === 'open' ? 'success' : 'secondary'" /></template>
      </Column>
      <Column field="OpenedAt" header="Opened" style="min-width:140px">
        <template #body="{ data }">{{ fmtTime(data.OpenedAt) }}</template>
      </Column>
      <Column field="ClosedAt" header="Closed" style="min-width:140px">
        <template #body="{ data }">{{ data.ClosedAt ? fmtTime(data.ClosedAt) : '—' }}</template>
      </Column>
    </DataTable>

    <!-- ── Open Till dialog ──────────────────────────────────────── -->
    <Dialog v-model:visible="openDialog" header="Open Till" :modal="true" :style="{ width: '500px' }">
      <p class="text-muted text-sm">Enter starting cash for each payment method you'll use.</p>
      <div class="balance-form">
        <div v-for="pt in paymentTypes" :key="pt.Code" class="balance-row">
          <span class="balance-label">{{ pt.Name }}</span>
          <InputNumber v-model="openingAmounts[pt.Code]" :minFractionDigits="2" mode="decimal" placeholder="0.00" />
        </div>
      </div>
      <div class="form-row" style="margin-top:8px">
        <label>Notes (optional)</label>
        <InputText v-model="openNotes" placeholder="Shift comments…" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="openDialog=false" />
        <Button label="Open Till" icon="pi pi-play" severity="success" :loading="opening" @click="doOpenTill" />
      </template>
    </Dialog>

    <!-- ── Add transaction dialog ────────────────────────────────── -->
    <Dialog v-model:visible="txnDialog" header="Add Cash Movement" :modal="true" :style="{ width: '440px' }">
      <div class="form-row">
        <label>Payment Method</label>
        <Select v-model="txnForm.paymentTypeCode" :options="paymentTypes" option-label="Name" option-value="Code" fluid />
      </div>
      <div class="form-row">
        <label>Type</label>
        <Select v-model="txnForm.transactionType" :options="txnTypes" option-label="label" option-value="value" fluid />
      </div>
      <div class="form-row">
        <label>Amount</label>
        <InputNumber v-model="txnForm.amount" :minFractionDigits="2" mode="decimal" :min="0" fluid />
      </div>
      <div class="form-row">
        <label>Reference (optional)</label>
        <InputText v-model="txnForm.reference" fluid />
      </div>
      <div class="form-row">
        <label>Notes</label>
        <InputText v-model="txnForm.notes" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="txnDialog=false" />
        <Button label="Save"   icon="pi pi-save" :loading="savingTxn" @click="doAddTxn" />
      </template>
    </Dialog>

    <!-- ── Close till dialog ─────────────────────────────────────── -->
    <Dialog v-model:visible="closeDialog" header="Close Till" :modal="true" :style="{ width: '600px' }">
      <p class="text-muted text-sm">Enter the physical count for each method to compute variance.</p>
      <div class="close-grid">
        <div class="close-head">
          <span>Method</span><span>Expected</span><span>Declared</span><span>Variance</span>
        </div>
        <div v-for="row in (report?.rows ?? [])" :key="row.paymentTypeCode" class="close-row">
          <span>{{ row.paymentTypeName }}</span>
          <span class="num">{{ n(row.expected) }}</span>
          <InputNumber v-model="closeDeclared[row.paymentTypeCode]" :minFractionDigits="2" mode="decimal" />
          <span :class="varianceClass(closeDeclared[row.paymentTypeCode] != null ? closeDeclared[row.paymentTypeCode] - row.expected : 0)">
            {{ closeDeclared[row.paymentTypeCode] != null ? n(closeDeclared[row.paymentTypeCode] - row.expected) : '—' }}
          </span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="closeDialog=false" />
        <Button label="Close Till" icon="pi pi-lock" severity="danger" :loading="closing" @click="doCloseTill" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import Button     from 'primevue/button'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Tag        from 'primevue/tag'
import Dialog     from 'primevue/dialog'
import Message    from 'primevue/message'
import InputText  from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select     from 'primevue/select'
import { tillApi, posApi } from '@/services/pos.js'

const current        = ref(null)
const report         = ref(null)
const pastSessions   = ref([])
const paymentTypes   = ref([])
const loading        = ref(false)
const error          = ref('')

const openDialog     = ref(false)
const opening        = ref(false)
const openingAmounts = reactive({})
const openNotes      = ref('')

const txnDialog      = ref(false)
const savingTxn      = ref(false)
const txnForm        = reactive({ paymentTypeCode: '', transactionType: 'cash-in', amount: 0, reference: '', notes: '' })
const txnTypes = [
  { label: 'Cash In',  value: 'cash-in'  },
  { label: 'Cash Out', value: 'cash-out' },
  { label: 'Drop',     value: 'drop'     },
  { label: 'Payout',   value: 'payout'   },
  { label: 'Expense',  value: 'expense'  },
]

const closeDialog    = ref(false)
const closing        = ref(false)
const closeDeclared  = reactive({})

async function load() {
  loading.value = true; error.value = ''
  try {
    const [cur, sess, pts] = await Promise.all([
      tillApi.current(), tillApi.listSessions(), posApi.getPaymentTypes(),
    ])
    current.value = cur.data
    pastSessions.value = sess.data
    paymentTypes.value = pts.data
    if (current.value) {
      const r = await tillApi.cashReport(current.value.sessionId)
      report.value = r.data
    } else {
      report.value = null
    }
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    loading.value = false
  }
}

async function loadPast(e) {
  const id = e.data.SessionId
  try {
    const sess = await tillApi.getSession(id)
    current.value = sess.data
    const r = await tillApi.cashReport(id)
    report.value = r.data
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}

function openOpenDialog() {
  // pre-zero each payment type
  for (const pt of paymentTypes.value) openingAmounts[pt.Code] = 0
  openNotes.value = ''
  openDialog.value = true
}

async function doOpenTill() {
  opening.value = true; error.value = ''
  try {
    const balances = paymentTypes.value.map(pt => ({
      paymentTypeCode: pt.Code,
      paymentTypeName: pt.Name,
      openingAmount:   openingAmounts[pt.Code] || 0,
    }))
    await tillApi.openSession({ balances, notes: openNotes.value })
    openDialog.value = false
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { opening.value = false }
}

function openTxnDialog() {
  txnForm.paymentTypeCode = paymentTypes.value[0]?.Code || ''
  txnForm.transactionType = 'cash-in'
  txnForm.amount = 0
  txnForm.reference = ''
  txnForm.notes = ''
  txnDialog.value = true
}

async function doAddTxn() {
  savingTxn.value = true; error.value = ''
  try {
    await tillApi.addTransaction(current.value.sessionId, { ...txnForm })
    txnDialog.value = false
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { savingTxn.value = false }
}

function openCloseDialog() {
  for (const r of (report.value?.rows ?? [])) closeDeclared[r.paymentTypeCode] = null
  closeDialog.value = true
}

async function doCloseTill() {
  closing.value = true; error.value = ''
  try {
    await tillApi.closeSession(current.value.sessionId, closeDeclared)
    closeDialog.value = false
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { closing.value = false }
}

function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtTime(v) { return v ? new Date(v).toLocaleString('en-KE', { dateStyle:'short', timeStyle:'short' }) : '' }
function varianceClass(v) {
  const n = Number(v || 0)
  if (n === 0) return 'num'
  return n > 0 ? 'num pos' : 'num neg'
}

onMounted(load)
</script>

<style scoped>
.till-page {
  padding: 16px 20px;
  max-width: 1100px;
  background: #f4f6f8;
  color: #111827;
  color-scheme: light;
  min-height: calc(100vh - 56px);
}
/* Force light rendering on every form control on this page so Chrome dark-mode can't invert them */
.till-page :deep(.p-inputtext),
.till-page :deep(.p-inputnumber-input),
.till-page :deep(.p-select),
.till-page :deep(.p-select-label),
.till-page :deep(.p-datepicker-input),
.till-page :deep(.p-textarea),
.till-page :deep(input[type="text"]),
.till-page :deep(input[type="number"]),
.till-page :deep(input[type="search"]),
.till-page :deep(textarea) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #d1d5db !important;
  color-scheme: light;
}
.till-page :deep(.p-datatable),
.till-page :deep(.p-datatable-thead > tr > th),
.till-page :deep(.p-datatable-tbody > tr),
.till-page :deep(.p-datatable-tbody > tr > td) {
  background: #ffffff !important;
  color: #111827 !important;
  border-color: #e5e7eb !important;
}
.till-page :deep(.p-datatable-thead > tr > th) {
  background: #f3f4f6 !important;
}
.till-page :deep(.p-card),
.till-page :deep(.p-card-body) {
  background: #ffffff !important;
  color: #111827 !important;
}
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; }
.text-sm    { font-size:13px; }
.mb-3       { margin-bottom:12px; }
.section-title { font-size:15px; font-weight:700; margin:18px 0 6px; color:#111827; }

.open-card {
  display:flex; align-items:center; gap:14px;
  padding:20px; border:2px dashed #d1d5db; border-radius:10px;
  background:#f9fafb;
}
.open-card-icon { font-size:30px; color:#2563eb; }
.open-card-text { flex:1; }
.open-card-title { font-weight:700; font-size:16px; color:#111827; }
.open-card-sub   { font-size:13px; color:#6b7280; }

.session-card {
  background:#fff; border:1px solid #d0d5dd; border-radius:10px;
  padding:14px 16px;
}
.session-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap; gap:10px; }
.session-no   { font-weight:800; font-size:18px; color:#1e3a5f; }
.session-meta { font-size:12px; color:#6b7280; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }

.totals-row { display:flex; gap:18px; padding:8px 12px; font-size:13px; flex-wrap:wrap; background:#f3f4f6; }

.balance-form { display:flex; flex-direction:column; gap:8px; }
.balance-row  { display:flex; align-items:center; gap:10px; }
.balance-label { width:140px; font-size:13px; font-weight:500; }
.form-row { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.form-row label { font-size:13px; font-weight:500; }

.close-grid { display:flex; flex-direction:column; }
.close-head, .close-row {
  display:grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap:10px;
  align-items:center; padding:6px 0; border-bottom:1px solid #f3f4f6;
}
.close-head { font-weight:700; font-size:12px; color:#374151; background:#f9fafb; padding:8px 0; }
.close-row .num { text-align:right; }

.num.pos { color:#15803d; font-weight:600; }
.num.neg { color:#b91c1c; font-weight:600; }
</style>
