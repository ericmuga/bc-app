<template>
  <div class="pos-orders-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">POS Orders</h2>
        <p class="text-muted text-sm">Point-of-sale transactions for your shop.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="New Order" icon="pi pi-plus" @click="$router.push('/pos')" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
        <Button label="Fetch M-PESA payments" icon="pi pi-sync" severity="secondary"
                :loading="fetchingPayments" @click="fetchMpesaPayments" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <DataTable
      :value="orders"
      dataKey="OrderId"
      size="small"
      :loading="loading"
      responsive-layout="scroll"
      @row-click="openOrder"
      selection-mode="single"
    >
      <Column field="OrderNo"     header="Order No"  style="width:140px" />
      <Column field="ShopCode"    header="Shop"      style="width:90px" />
      <Column field="CashierName" header="Cashier"   style="min-width:130px" />
      <Column field="LineCount"   header="Lines"     style="width:65px;text-align:right" />
      <Column field="TotalAmount" header="Total"     style="width:120px;text-align:right">
        <template #body="{ data }">{{ fmt(data.TotalAmount) }}</template>
      </Column>
      <Column field="Status" header="Status" style="width:100px">
        <template #body="{ data }">
          <Tag :value="data.Status" :severity="statusSeverity(data.Status)" />
        </template>
      </Column>
      <Column field="CreatedAt" header="Created" style="min-width:130px">
        <template #body="{ data }">{{ fmtTime(data.CreatedAt) }}</template>
      </Column>
      <Column header="Label" style="min-width:130px">
        <template #body="{ data }">
          <span v-if="data.Label" class="cart-label">{{ data.Label }}</span>
        </template>
      </Column>
      <!-- Quick actions: resume / checkout / complete / sign / view PDF / reprint -->
      <Column header="Actions" style="width:300px">
        <template #body="{ data }">
          <div class="row-actions">
            <Button
              v-if="data.Status === 'saved'"
              icon="pi pi-play" label="Resume" size="small" severity="info" text
              v-tooltip.top="'Resume parked cart'"
              @click.stop="resumeCart(data)"
            />
            <Button
              v-if="data.Status === 'open' || data.Status === 'checkout'"
              icon="pi pi-credit-card" size="small" severity="info" text rounded
              v-tooltip.top="'Checkout (select payment method)'"
              @click.stop="openCheckoutFlow(data)"
            />
            <Button
              v-if="data.Status === 'open' || data.Status === 'checkout'"
              icon="pi pi-check" size="small" severity="success" text rounded
              v-tooltip.top="'Quick complete (no payment selection)'"
              :loading="completing[data.OrderId]"
              @click.stop="quickComplete(data)"
            />
            <Button
              v-if="data.Status === 'paid' && !data.EtimsInvoiceNo"
              icon="pi pi-shield" size="small" severity="warn" text rounded
              v-tooltip.top="'Sign with eTIMS'"
              :loading="signing[data.OrderId]"
              @click.stop="signOrder(data)"
            />
            <Button
              v-if="data.Status === 'paid' && data.EtimsInvoiceNo && isAdmin"
              icon="pi pi-undo" size="small" severity="danger" text rounded
              v-tooltip.top="'Sign eTIMS credit memo'"
              :loading="crediting[data.OrderId]"
              @click.stop="openCreditMemo(data)"
            />
            <Button
              icon="pi pi-code" size="small" text rounded
              v-tooltip.top="'Test/preview eTIMS payload'"
              @click.stop="showEtimsPreview(data)"
            />
            <Button
              v-if="data.Status === 'paid'"
              icon="pi pi-file-pdf" size="small" text rounded
              v-tooltip.top="'View PDF'"
              @click.stop="viewPdf(data)"
            />
            <Button
              v-if="data.Status === 'paid'"
              icon="pi pi-print" size="small" text rounded
              v-tooltip.top="'Reprint'"
              :loading="reprinting[data.OrderId]"
              @click.stop="reprint(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- PDF preview modal -->
    <PdfPreviewModal
      v-model:visible="pdfPreview.visible"
      :header="pdfPreview.header"
      :fetcher="pdfPreview.fetcher"
    />

    <!-- Checkout flow (payment method selection) -->
    <Dialog v-model:visible="checkoutFlow.visible"
            :header="`Checkout — ${checkoutFlow.order?.orderNo || ''}`"
            :modal="true" :style="{ width: '460px' }"
            :closable="!checkoutFlow.processing"
            content-class="modal-content-light">
      <div v-if="checkoutFlow.order" class="checkout-form">
        <div class="checkout-total-display">
          <span class="co-label">Order Total</span>
          <span class="co-amount">{{ fmt(checkoutFlow.order.totalAmount) }}</span>
        </div>

        <div v-if="checkoutFlow.order.contactName" class="checkout-customer">
          <i class="pi pi-user co-icon" />
          <div class="co-detail">
            <div class="co-cname">{{ checkoutFlow.order.contactName }}</div>
            <div class="co-csub">
              <span v-if="checkoutFlow.order.contactPhone">{{ checkoutFlow.order.contactPhone }}</span>
              <span v-if="checkoutFlow.order.contactPin" class="co-kra">PIN: {{ checkoutFlow.order.contactPin }}</span>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label>Payment Method</label>
          <div class="payment-type-grid">
            <button v-for="pt in checkoutFlow.paymentTypes" :key="pt.Code"
                    class="pt-btn" :class="{ selected: checkoutFlow.payType?.Code === pt.Code }"
                    @click="onCheckoutPayTypeSelect(pt)"
                    :title="pt.Description || ''">
              <i :class="payTypeIcon(pt.PaymentClass)" />
              <span class="pt-name">{{ pt.Name }}</span>
              <span v-if="pt.Description" class="pt-tile-desc">{{ pt.Description.length > 36 ? pt.Description.slice(0,33) + '…' : pt.Description }}</span>
            </button>
          </div>
          <div v-if="checkoutFlow.payType?.Description" class="pt-description-box">
            <i class="pi pi-info-circle" />
            <span>{{ checkoutFlow.payType.Description }}</span>
          </div>
        </div>

        <div v-if="checkoutFlow.payType?.PaymentClass === 'Mobile'" class="form-row">
          <label>Mobile No (M-PESA STK Push)</label>
          <div class="stk-row">
            <InputText v-model="checkoutFlow.mobileNo" placeholder="0712345678" fluid />
            <Button label="Send STK" icon="pi pi-send" severity="info" size="small"
                    :loading="checkoutFlow.sendingStk" :disabled="!checkoutFlow.mobileNo"
                    @click="doCheckoutStkPush" />
          </div>
          <div v-if="checkoutFlow.stkResult" class="stk-result"
               :class="{ ok: checkoutFlow.stkResult.ok, fail: !checkoutFlow.stkResult.ok }">
            <i :class="checkoutFlow.stkResult.ok ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'" />
            {{ checkoutFlow.stkResult.message }}
          </div>
        </div>

        <div v-if="checkoutFlow.error" class="pay-error">{{ checkoutFlow.error }}</div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="checkoutFlow.visible = false" :disabled="checkoutFlow.processing" />
        <Button label="Confirm Payment" icon="pi pi-check" severity="success"
                :loading="checkoutFlow.processing" :disabled="!checkoutFlow.payType"
                @click="confirmCheckout" />
      </template>
    </Dialog>

    <!-- eTIMS payload preview / dry-run -->
    <Dialog v-model:visible="etimsPrev.visible"
            :header="`eTIMS payload — ${etimsPrev.orderNo}`"
            :modal="true" :style="{ width: '700px' }">
      <div v-if="etimsPrev.loading" class="text-muted">Building payload…</div>
      <div v-else-if="etimsPrev.error" class="error-box">{{ etimsPrev.error }}</div>
      <div v-else>
        <Message v-if="etimsPrev.data?.issues?.length"
                 :severity="etimsPrev.data.ok ? 'info' : 'warn'" :closable="false" class="mb-3">
          <strong>{{ etimsPrev.data.ok ? 'Ready to sign' : 'Issues to resolve before signing:' }}</strong>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:12px">
            <li v-for="(it, i) in etimsPrev.data.issues" :key="i">{{ it }}</li>
          </ul>
        </Message>
        <pre class="json-box">{{ JSON.stringify(etimsPrev.data?.payload, null, 2) }}</pre>
      </div>
      <template #footer>
        <Button label="Copy JSON" icon="pi pi-copy" text
                @click="copyJson" :disabled="!etimsPrev.data?.payload" />
        <Button label="Close" @click="etimsPrev.visible=false" />
      </template>
    </Dialog>

    <!-- Order detail dialog (read-only, no payment dialog) -->
    <Dialog v-model:visible="detailVisible" :header="`Order ${selectedOrder?.orderNo}`" :modal="true" :style="{ width: '520px' }">
      <div v-if="selectedOrder" class="order-detail">
        <div class="detail-meta">
          <div>
            <span><strong>Cashier:</strong> {{ selectedOrder.cashierName }}</span>
            <span v-if="selectedOrder.shopCode" class="detail-shop"> · {{ selectedOrder.shopCode }}</span>
          </div>
          <Tag :value="selectedOrder.status" :severity="statusSeverity(selectedOrder.status)" />
        </div>

        <DataTable :value="selectedOrder.lines" size="small" class="mt-2">
          <Column field="description" header="Item" />
          <Column field="quantity"    header="Qty"   style="width:70px;text-align:right" />
          <Column header="Price"      style="width:100px;text-align:right">
            <template #body="{ data }">{{ fmt(data.unitPrice) }}</template>
          </Column>
          <Column header="Amount"     style="width:110px;text-align:right">
            <template #body="{ data }">{{ fmt(data.lineAmount) }}</template>
          </Column>
        </DataTable>

        <div class="detail-total">
          <span>Total</span>
          <span>{{ fmt(selectedOrder.totalAmount) }}</span>
        </div>

        <div v-if="selectedOrder.payments.length" class="detail-payments">
          <h4>Payments</h4>
          <div v-for="p in selectedOrder.payments" :key="p.paymentId" class="payment-row">
            <span class="pay-type">{{ p.paymentTypeName }}</span>
            <span class="pay-amount">{{ fmt(p.amount) }}</span>
            <Tag :value="p.status" :severity="p.status === 'confirmed' ? 'success' : 'warn'" />
            <span v-if="p.mobileNo" class="pay-mobile">{{ p.mobileNo }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="detailVisible = false" />
        <Button
          v-if="selectedOrder?.status === 'open' || selectedOrder?.status === 'checkout'"
          label="Mark as Complete"
          icon="pi pi-check"
          severity="success"
          :loading="completing[selectedOrder?.orderId]"
          @click="quickComplete(selectedOrder, true)"
        />
      </template>
    </Dialog>

    <Dialog v-model:visible="creditMemo.visible"
            :header="`eTIMS credit memo — ${creditMemo.order?.OrderNo || ''}`"
            :modal="true" :style="{ width: '440px' }"
            content-class="modal-content-light">
      <div class="checkout-form">
        <Message severity="warn" :closable="false">
          Admin approval signs a full eTIMS credit memo for this paid invoice only. It does not reverse stock or payments.
        </Message>
        <div class="form-row">
          <label>Reason</label>
          <InputText v-model="creditMemo.reason" placeholder="RETURN" fluid />
        </div>
        <div class="form-row">
          <label>Admin PIN</label>
          <InputText v-model="creditMemo.adminPin" type="password" autocomplete="current-password" fluid />
        </div>
        <div v-if="creditMemo.error" class="pay-error">{{ creditMemo.error }}</div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="creditMemo.visible=false" :disabled="creditMemo.processing" />
        <Button label="Sign Credit Memo" icon="pi pi-shield" severity="danger"
                :loading="creditMemo.processing"
                :disabled="!creditMemo.adminPin"
                @click="submitCreditMemo" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import InputText from 'primevue/inputtext'
import { posApi } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'
import PdfPreviewModal from '@/components/PdfPreviewModal.vue'

const auth = useAuthStore()
const isAdmin = computed(() => auth.user?.role === 'admin')
const orders        = ref([])
const loading       = ref(false)
const error         = ref('')
const detailVisible = ref(false)
const selectedOrder = ref(null)
const completing    = reactive({})
const reprinting    = reactive({})
const signing       = reactive({})
const crediting     = reactive({})
const creditMemo = reactive({
  visible: false,
  processing: false,
  order: null,
  adminPin: '',
  reason: 'RETURN',
  error: '',
})

async function load() {
  loading.value = true; error.value = ''
  try {
    const { data } = await posApi.listOrders()
    orders.value = data
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const fetchingPayments = ref(false)
async function resumeCart(row) {
  try {
    await posApi.resumeCart(row.OrderId)
    // Take the cashier to the POS terminal where they can keep editing.
    window.location.href = '/pos'
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  }
}

async function fetchMpesaPayments() {
  fetchingPayments.value = true; error.value = ''
  try {
    const { data } = await posApi.fetchPayments({ paymentTypeCode: 'MPESA', limit: 50 })
    error.value = ''
    const msg = data.ok === false
      ? `Fetch failed: ${data.message || 'unknown error'}`
      : `Fetched ${data.count || 0} payment(s) — matched ${data.matched || 0}, unmatched ${data.unmatched || 0}.`
    alert(msg)
    await load()
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    fetchingPayments.value = false
  }
}

async function openOrder(e) {
  const row = e.data
  try {
    const { data } = await posApi.getOrder(row.OrderId || row.orderId)
    selectedOrder.value = data
    detailVisible.value = true
  } catch {}
}

async function reprint(row) {
  const id = row.OrderId || row.orderId
  reprinting[id] = true; error.value = ''
  try {
    await posApi.reprintOrder(id)
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    reprinting[id] = false
  }
}

async function signOrder(row) {
  const id = row.OrderId || row.orderId
  signing[id] = true; error.value = ''
  try {
    await posApi.signOrder(id)
    await load()
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    signing[id] = false
  }
}

function openCreditMemo(row) {
  creditMemo.order = row
  creditMemo.adminPin = ''
  creditMemo.reason = 'RETURN'
  creditMemo.error = ''
  creditMemo.visible = true
}

async function submitCreditMemo() {
  const row = creditMemo.order
  if (!row) return
  const id = row.OrderId || row.orderId
  crediting[id] = true
  creditMemo.processing = true
  creditMemo.error = ''
  try {
    const { data } = await posApi.signCreditMemo(id, {
      adminPin: creditMemo.adminPin,
      reason: creditMemo.reason || 'RETURN',
    })
    creditMemo.visible = false
    alert(`Credit memo signed: ${data?.creditMemo?.etimsCreditMemoNo || data?.creditMemo?.etimsNo || 'OK'}`)
  } catch (e) {
    creditMemo.error = e.response?.data?.error ?? e.message
  } finally {
    creditMemo.processing = false
    crediting[id] = false
  }
}

const pdfPreview = ref({ visible: false, header: '', fetcher: null })
const etimsPrev  = ref({ visible: false, loading: false, orderNo: '', data: null, error: '' })

async function showEtimsPreview(row) {
  const id = row.OrderId || row.orderId
  etimsPrev.value = { visible: true, loading: true, orderNo: row.OrderNo || '', data: null, error: '' }
  try {
    const { data } = await posApi.etimsPreview(id)
    etimsPrev.value.data = data
  } catch (e) {
    etimsPrev.value.error = e.response?.data?.error ?? e.message
  } finally {
    etimsPrev.value.loading = false
  }
}

function copyJson() {
  if (!etimsPrev.value.data?.payload) return
  navigator.clipboard.writeText(JSON.stringify(etimsPrev.value.data.payload, null, 2))
}

function viewPdf(row) {
  const id = row.OrderId || row.orderId
  pdfPreview.value = {
    visible: true,
    header:  `Invoice ${row.OrderNo || ''}`,
    fetcher: () => posApi.fetchPdf(id),
  }
}

// ── Full checkout flow with payment selection ────────────────────────────
const checkoutFlow = reactive({
  visible: false, processing: false, sendingStk: false,
  order: null, paymentTypes: [], payType: null,
  mobileNo: '', stkResult: null, error: '',
})

async function openCheckoutFlow(row) {
  const id = row.OrderId || row.orderId
  checkoutFlow.error = ''
  checkoutFlow.stkResult = null
  try {
    const [{ data: order }, { data: pts }] = await Promise.all([
      posApi.getOrder(id),
      posApi.getPaymentTypes(),
    ])
    checkoutFlow.order        = order
    checkoutFlow.paymentTypes = pts
    checkoutFlow.payType      = pts[0] ?? null
    checkoutFlow.mobileNo     = order.contactPhone || ''
    checkoutFlow.visible      = true
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  }
}

function onCheckoutPayTypeSelect(pt) {
  checkoutFlow.payType = pt
  if (pt.PaymentClass === 'Mobile' && !checkoutFlow.mobileNo) {
    checkoutFlow.mobileNo = checkoutFlow.order?.contactPhone || ''
  }
  checkoutFlow.stkResult = null
}

async function doCheckoutStkPush() {
  if (!checkoutFlow.payType || !checkoutFlow.mobileNo || !checkoutFlow.order) return
  checkoutFlow.sendingStk = true; checkoutFlow.stkResult = null
  try {
    const { data } = await posApi.stkPush(checkoutFlow.order.orderId, {
      paymentTypeCode: checkoutFlow.payType.Code,
      mobileNo:        checkoutFlow.mobileNo,
      amount:          checkoutFlow.order.totalAmount,
    })
    checkoutFlow.stkResult = data
  } catch (e) {
    checkoutFlow.stkResult = { ok: false, message: e.response?.data?.error ?? e.message }
  } finally {
    checkoutFlow.sendingStk = false
  }
}

async function confirmCheckout() {
  if (!checkoutFlow.payType || !checkoutFlow.order) return
  checkoutFlow.processing = true; checkoutFlow.error = ''
  try {
    const { data: co } = await posApi.checkout(checkoutFlow.order.orderId, {
      paymentTypeCode: checkoutFlow.payType.Code,
      paymentTypeName: checkoutFlow.payType.Name,
      amount:          checkoutFlow.order.totalAmount,
      mobileNo:        checkoutFlow.mobileNo.trim() || null,
    })
    await posApi.confirmPayment(co.paymentId)
    checkoutFlow.visible = false
    await load()
  } catch (e) {
    checkoutFlow.error = e.response?.data?.error ?? e.message
  } finally {
    checkoutFlow.processing = false
  }
}

function payTypeIcon(cls) {
  const map = { Cash: 'pi pi-money-bill', Card: 'pi pi-credit-card', Mobile: 'pi pi-mobile', Credit: 'pi pi-bookmark', BankTransfer: 'pi pi-building' }
  return map[cls] ?? 'pi pi-wallet'
}

async function quickComplete(rowOrOrder, fromDialog = false) {
  const id = rowOrOrder.OrderId || rowOrOrder.orderId
  completing[id] = true
  error.value = ''
  try {
    await posApi.completeOrder(id)
    await load()
    if (fromDialog) {
      detailVisible.value = false
    }
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  } finally {
    completing[id] = false
  }
}

onMounted(load)

function statusSeverity(s) {
  return { open: 'info', checkout: 'warn', paid: 'success', cancelled: 'secondary' }[s] ?? 'secondary'
}
function fmt(v) {
  return Number(v || 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 })
}
function fmtTime(v) {
  if (!v) return ''
  return new Date(v).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.pos-orders-page { padding: 16px 20px; max-width: 960px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.mt-2 { margin-top: 8px; }

.order-detail { display:flex; flex-direction:column; gap:10px; }
.detail-meta { display:flex; justify-content:space-between; align-items:center; }
.detail-shop { color:var(--text-color-secondary,#888); font-size:12px; }
.detail-total {
  display:flex; justify-content:space-between;
  font-weight:700; font-size:15px;
  padding:8px 0; border-top:2px solid var(--surface-border,#ddd);
}
.detail-payments h4 { margin:4px 0 8px; font-size:13px; color:var(--text-color-secondary,#666); }
.payment-row { display:flex; gap:10px; align-items:center; padding:4px 0; font-size:13px; }
.pay-type { flex:1; font-weight:500; }
.pay-amount { font-weight:700; }
.pay-mobile { color:var(--text-color-secondary,#888); font-size:12px; }

.json-box {
  font-family: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;
  font-size: 11px;
  background: #0f172a; color: #e2e8f0;
  padding: 12px 14px; border-radius: 6px;
  max-height: 50vh; overflow: auto;
  white-space: pre; line-height: 1.4;
}
.error-box { color: #b91c1c; background: #fef2f2; padding: 10px; border-radius: 6px; }

/* ── Checkout dialog (mirrors PosPage styling) ─────────────────── */
.checkout-form { display: flex; flex-direction: column; gap: 16px; color: #111827; }
.checkout-total-display {
  display: flex; justify-content: space-between; align-items: center;
  background: #eff6ff; border: 1.5px solid #bfdbfe;
  border-radius: 10px; padding: 14px 18px;
}
.co-label  { font-size: 13px; color: #374151; font-weight: 500; }
.co-amount { font-size: 24px; font-weight: 900; color: #1d4ed8; }
.checkout-customer {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: #f0fdf4;
  border: 1.5px solid #86efac; border-radius: 8px;
}
.co-icon { font-size: 20px; color: #16a34a; }
.co-detail { flex: 1; }
.co-cname { font-size: 14px; font-weight: 700; color: #111827; }
.co-csub  { font-size: 12px; color: #374151; display: flex; gap: 10px; margin-top: 2px; }
.co-kra   { color: #1d4ed8; font-weight: 600; }
.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 13px; font-weight: 600; color: #374151; }
.payment-type-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;
}
.pt-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; border: 2px solid #d1d5db; border-radius: 8px;
  background: #f9fafb; color: #374151; cursor: pointer; font-size: 12px; font-weight: 500;
}
.pt-btn .pi { font-size: 18px; color: #6b7280; }
.pt-btn:hover { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
.pt-btn:hover .pi { color: #2563eb; }
.pt-btn.selected { border-color: #2563eb; background: #2563eb; color: #fff; font-weight: 700; }
.pt-btn.selected .pi { color: #fff; }
.pt-name { font-size: 12px; font-weight: 600; }
.pt-tile-desc {
  font-size: 10px; color: #6b7280; line-height: 1.2; text-align: center; word-break: break-word;
}
.pt-btn.selected .pt-tile-desc { color: #dbeafe; }
.pt-description-box {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; background: #eff6ff;
  border: 1px solid #bfdbfe; border-radius: 6px; margin-top: 8px;
  font-size: 13px; color: #1e3a8a; line-height: 1.4;
}
.pt-description-box .pi { font-size: 14px; color: #2563eb; flex-shrink: 0; margin-top: 1px; }
.stk-row { display: flex; gap: 6px; align-items: center; }
.stk-row :deep(.p-inputtext) { flex: 1; }
.stk-result {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 8px 10px; border-radius: 6px; margin-top: 6px;
}
.stk-result.ok   { color: #15803d; background: #f0fdf4; border: 1px solid #86efac; }
.stk-result.fail { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; }
.stk-result .pi  { font-size: 14px; }
.pay-error {
  color: #dc2626; font-size: 13px; padding: 8px 12px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;
}

/* ── Force light surface on PrimeVue Dialog content (Chrome dark-mode fix) ── */
:deep(.p-dialog) {
  color-scheme: light;
}
:deep(.p-dialog .p-dialog-header),
:deep(.p-dialog .p-dialog-content),
:deep(.p-dialog .p-dialog-footer) {
  background: #ffffff !important;
  color: #111827 !important;
}
:deep(.p-dialog .p-dialog-header) {
  border-bottom: 1px solid #e5e7eb;
}
:deep(.modal-content-light) {
  background: #ffffff !important; color: #111827 !important;
}
:deep(.p-dialog .p-dialog-content),
:deep(.p-dialog .p-dialog-content *):not(.json-box):not(.json-box *) {
  color-scheme: light;
}
:deep(.p-dialog .p-inputtext),
:deep(.p-dialog .p-inputnumber-input),
:deep(.p-dialog .p-select-label),
:deep(.p-dialog .p-textarea) {
  background: #ffffff !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-thead > tr > th) {
  background: #f3f4f6 !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-tbody > tr) {
  background: #ffffff !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-tbody > tr > td) { color: #111827 !important; }
:deep(.p-dialog h4) { color: #111827 !important; }
</style>
