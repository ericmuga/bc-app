<template>
  <div class="coupons-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Coupons</h2>
        <p class="text-muted text-sm">Issue prepaid coupons that customers can spend at the till. Every redemption is recorded in the ledger.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Issue coupon" icon="pi pi-plus" severity="success" @click="openIssue" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <div class="filters">
      <div class="filter-field">
        <label>Status</label>
        <Select v-model="statusFilter" :options="statusOptions" placeholder="Any" show-clear />
      </div>
      <div class="filter-field" style="flex:1">
        <label>Search (code, name, email, phone)</label>
        <InputText v-model="q" placeholder="optional" />
      </div>
      <Button label="Run" icon="pi pi-play" @click="load" :loading="loading" />
    </div>

    <DataTable :value="coupons" dataKey="CouponId" size="small" :loading="loading"
               responsive-layout="scroll" :paginator="true" :rows="50"
               selection-mode="single" @row-click="openDetail">
      <Column field="Code"         header="Code"     style="width:140px" />
      <Column field="ContactName"  header="Issued to" style="min-width:160px" />
      <Column header="Face value" style="width:130px;text-align:right">
        <template #body="{ data }">{{ Number(data.FaceValue).toFixed(2) }}</template>
      </Column>
      <Column header="Balance" style="width:130px;text-align:right">
        <template #body="{ data }"><strong>{{ Number(data.Balance).toFixed(2) }}</strong></template>
      </Column>
      <Column field="ContactEmail" header="Email"   style="min-width:180px" />
      <Column field="ContactPhone" header="Phone"   style="width:120px" />
      <Column field="ShopCode"     header="Shop"    style="width:90px" />
      <Column header="Issued"   style="width:130px"><template #body="{ data }">{{ fmtDate(data.IssuedAt) }}</template></Column>
      <Column header="Expires"  style="width:120px"><template #body="{ data }">{{ data.ExpiresAt ? fmtDate(data.ExpiresAt) : '—' }}</template></Column>
      <Column field="Status" header="Status" style="width:110px">
        <template #body="{ data }"><Tag :value="data.Status" :severity="statusSeverity(data.Status)" /></template>
      </Column>
    </DataTable>

    <!-- Issue dialog -->
    <Dialog v-model:visible="issue.visible" header="Issue a coupon" :modal="true" :style="{ width: '520px' }">
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label>Face value</label><InputNumber v-model="issue.faceValue" :min="0" :minFractionDigits="2" mode="decimal" fluid /></div>
        <div><label>Currency</label><InputText v-model="issue.currency" disabled fluid /></div>
        <div style="grid-column:1/3"><label>Recipient name</label><InputText v-model="issue.contactName" fluid /></div>
        <div><label>Email</label><InputText v-model="issue.contactEmail" fluid /></div>
        <div><label>Phone</label><InputText v-model="issue.contactPhone" fluid /></div>
        <div><label>Shop (optional)</label>
          <InputText v-model="issue.shopCode" placeholder="e.g. NRB-A" fluid />
        </div>
        <div><label>Expires (optional)</label><DatePicker v-model="issue.expiresAt" date-format="yy-mm-dd" fluid /></div>
        <div style="grid-column:1/3"><label>Notes</label><InputText v-model="issue.notes" fluid /></div>
        <div style="grid-column:1/3" class="builder-checks">
          <Checkbox v-model="issue.emailNow" binary input-id="iss-email" />
          <label for="iss-email">Email the coupon PDF to the recipient now</label>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="issue.visible = false" />
        <Button label="Issue" icon="pi pi-send" severity="success"
                :loading="issue.posting" :disabled="!(issue.faceValue > 0)"
                @click="postIssue" />
      </template>
    </Dialog>

    <!-- Detail / ledger dialog -->
    <Dialog v-model:visible="detail.visible" :header="detail.coupon ? `Coupon ${detail.coupon.Code}` : ''"
            :modal="true" :style="{ width: '780px' }">
      <div v-if="detail.coupon" class="editor">
        <div class="editor-meta">
          <span><strong>{{ detail.coupon.Currency }} {{ Number(detail.coupon.FaceValue).toFixed(2) }}</strong>
                · balance <strong>{{ Number(detail.coupon.Balance).toFixed(2) }}</strong></span>
          <Tag :value="detail.coupon.Status" :severity="statusSeverity(detail.coupon.Status)" />
        </div>
        <p class="text-muted text-sm">
          Issued to {{ detail.coupon.ContactName || '—' }}
          <span v-if="detail.coupon.ContactEmail"> · {{ detail.coupon.ContactEmail }}</span>
          <span v-if="detail.coupon.ContactPhone"> · {{ detail.coupon.ContactPhone }}</span>
        </p>

        <div class="schedule-actions" style="margin:6px 0 12px">
          <Button label="View / print PDF" icon="pi pi-file-pdf" size="small" @click="openPdf" />
          <Button label="Email coupon" icon="pi pi-send" size="small" severity="info"
                  :loading="emailing" @click="openEmail" />
          <Button v-if="detail.coupon.Status === 'active'"
                  label="Void coupon" icon="pi pi-ban" severity="danger" text size="small"
                  :loading="voiding" @click="voidCoupon" />
        </div>

        <h4 style="margin:6px 0 4px">Ledger</h4>
        <DataTable :value="detail.ledger" size="small" :loading="loadingLedger" responsive-layout="scroll">
          <Column header="When" style="width:160px">
            <template #body="{ data }">{{ fmtDateTime(data.PerformedAt) }}</template>
          </Column>
          <Column field="EntryType" header="Type" style="width:80px" />
          <Column header="Amount" style="width:110px;text-align:right">
            <template #body="{ data }"><strong :class="Number(data.Amount) < 0 ? 'num neg' : 'num pos'">{{ Number(data.Amount).toFixed(2) }}</strong></template>
          </Column>
          <Column header="Balance after" style="width:120px;text-align:right">
            <template #body="{ data }">{{ Number(data.BalanceAfter).toFixed(2) }}</template>
          </Column>
          <Column field="OrderNo"     header="Order"     style="width:130px" />
          <Column field="Reference"   header="Reference" style="width:140px" />
          <Column field="PerformedBy" header="By"        style="min-width:120px" />
          <Column field="Notes"       header="Notes"     style="min-width:120px" />
        </DataTable>
      </div>
    </Dialog>

    <!-- Email dialog -->
    <Dialog v-model:visible="emailDlg.visible" header="Email coupon" :modal="true" :style="{ width: '460px' }">
      <div class="form-row"><label>To</label><InputText v-model="emailDlg.to" placeholder="recipient@example.com" fluid /></div>
      <div class="form-row"><label>Message (optional)</label><InputText v-model="emailDlg.message" fluid /></div>
      <template #footer>
        <Button label="Cancel" text @click="emailDlg.visible = false" />
        <Button label="Send" icon="pi pi-send" severity="success"
                :loading="emailing" :disabled="!emailDlg.to" @click="sendEmail" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import Button       from 'primevue/button'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import DatePicker   from 'primevue/datepicker'
import InputText    from 'primevue/inputtext'
import InputNumber  from 'primevue/inputnumber'
import Select       from 'primevue/select'
import Tag          from 'primevue/tag'
import Dialog       from 'primevue/dialog'
import Message      from 'primevue/message'
import Checkbox     from 'primevue/checkbox'
import { couponApi } from '@/services/pos.js'

const coupons = ref([])
const loading = ref(false)
const error   = ref('')
const q       = ref('')
const statusFilter = ref(null)
const statusOptions = ['active','exhausted','expired','void']

function fmtDate(v) { return v ? new Date(v).toLocaleDateString('en-KE') : '' }
function fmtDateTime(v) { return v ? new Date(v).toLocaleString('en-KE') : '' }
function statusSeverity(s) {
  return { active:'success', exhausted:'info', expired:'warn', void:'secondary' }[s] ?? 'secondary'
}

async function load() {
  loading.value = true; error.value = ''
  try {
    const params = {}
    if (statusFilter.value) params.status = statusFilter.value
    if (q.value.trim())     params.q      = q.value.trim()
    coupons.value = (await couponApi.list(params)).data
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { loading.value = false }
}

const issue = reactive({ visible: false, faceValue: 0, currency: 'KES',
                         contactName: '', contactEmail: '', contactPhone: '',
                         shopCode: '', expiresAt: null, notes: '', emailNow: false, posting: false })
function openIssue() {
  Object.assign(issue, { visible: true, faceValue: 0, currency: 'KES',
                         contactName: '', contactEmail: '', contactPhone: '',
                         shopCode: '', expiresAt: null, notes: '', emailNow: false, posting: false })
}
async function postIssue() {
  issue.posting = true
  try {
    const { data } = await couponApi.issue({
      faceValue:    issue.faceValue,
      contactName:  issue.contactName,
      contactEmail: issue.contactEmail,
      contactPhone: issue.contactPhone,
      shopCode:     issue.shopCode || null,
      expiresAt:    issue.expiresAt ? new Date(issue.expiresAt).toISOString() : null,
      notes:        issue.notes || null,
    })
    issue.visible = false
    if (issue.emailNow && data.ContactEmail) {
      try { await couponApi.email(data.Code, { to: data.ContactEmail }) } catch {}
    }
    await load()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally { issue.posting = false }
}

// ── Detail / ledger ───────────────────────────────────────────────────────
const detail = reactive({ visible: false, coupon: null, ledger: [] })
const loadingLedger = ref(false)
const voiding  = ref(false)
const emailing = ref(false)
async function openDetail(ev) {
  detail.coupon = ev.data; detail.ledger = []; detail.visible = true
  loadingLedger.value = true
  try {
    detail.ledger = (await couponApi.ledger(ev.data.Code)).data
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { loadingLedger.value = false }
}
async function openPdf() {
  if (!detail.coupon) return
  const res = await couponApi.pdfBlob(detail.coupon.Code)
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  window.open(url, '_blank')
}
async function voidCoupon() {
  if (!confirm(`Void coupon ${detail.coupon.Code}? The remaining balance becomes 0.`)) return
  voiding.value = true
  try {
    detail.coupon = (await couponApi.void(detail.coupon.Code, {})).data
    detail.ledger = (await couponApi.ledger(detail.coupon.Code)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { voiding.value = false }
}

// ── Email ─────────────────────────────────────────────────────────────────
const emailDlg = reactive({ visible: false, to: '', message: '' })
function openEmail() {
  emailDlg.to = detail.coupon?.ContactEmail || ''
  emailDlg.message = ''
  emailDlg.visible = true
}
async function sendEmail() {
  emailing.value = true
  try {
    await couponApi.email(detail.coupon.Code, { to: emailDlg.to, message: emailDlg.message })
    emailDlg.visible = false
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { emailing.value = false }
}

onMounted(load)
</script>

<style scoped>
.coupons-page {
  padding: 16px 20px; background:#f4f6f8; color:#111827; color-scheme:light;
  min-height: calc(100vh - 56px);
}
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title  { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted  { color:#6b7280; }
.text-sm     { font-size:13px; }
.mb-3        { margin-bottom:12px; }
.filters     { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin: 14px 0; }
.filter-field { display:flex; flex-direction:column; gap:4px; min-width:140px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }
.form-row    { display:flex; flex-direction:column; gap:6px; margin:8px 0; }
.form-row label { font-size:12px; font-weight:500; color:#374151; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; }
.builder-checks { display:flex; align-items:center; gap:6px; font-size:13px; }
.num.pos { color:#15803d; }
.num.neg { color:#b91c1c; }
.coupons-page :deep(.p-inputtext),
.coupons-page :deep(.p-inputnumber-input),
.coupons-page :deep(.p-select-label),
.coupons-page :deep(.p-datepicker-input) {
  background:#fff !important; color:#111827 !important; border-color:#d1d5db !important;
  color-scheme: light;
}
.coupons-page :deep(.p-datatable-thead > tr > th) { background:#f3f4f6 !important; color:#111827 !important; }
.coupons-page :deep(.p-datatable-tbody > tr > td) { background:#fff !important; color:#111827 !important; }
</style>
