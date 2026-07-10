<template>
  <div class="pos-root">
    <!-- Left: Catalogue ─────────────────────────────────────────── -->
    <div class="pos-catalogue">

      <!-- Search bar — type to filter, Enter to add first match (good for barcode scanners) -->
      <div class="catalogue-search">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="search"
            :placeholder="searchHint"
            fluid clearable
            @keydown.enter.prevent="addFirstMatch"
          />
        </IconField>
      </div>

      <!-- Category tabs -->
      <div class="category-tabs">
        <button
          v-for="cat in allCategories" :key="cat.code"
          class="cat-tab" :class="{ active: activeCat === cat.code }"
          @click="activeCat = cat.code"
        >{{ cat.name }}</button>
      </div>

      <!-- Item grid -->
      <div class="item-grid" v-if="filteredItems.length">
        <div v-for="item in filteredItems" :key="item.itemNo" class="item-card-wrap">
          <button class="item-card" @click="addToOrder(item)">
            <div class="item-icon">
              <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.description" />
              <i v-else class="pi pi-box" />
            </div>
            <div class="item-name">{{ item.description }}</div>
            <div class="item-price-row">
              <span v-if="item.offerPrice != null" class="item-base-strike">{{ fmt(item.basePrice) }}</span>
              <span class="item-price" :class="{ 'is-offer': item.offerPrice != null }">{{ fmt(item.unitPrice) }}</span>
            </div>
            <div v-if="item.offerDescription" class="item-offer-tag">{{ item.offerDescription }}</div>
            <div v-if="item.remaining != null" class="item-remaining" :class="remainingClass(item.remaining)">
              <i class="pi pi-inbox" />
              <span>Remaining: <strong>{{ Number(item.remaining || 0).toFixed(2) }}</strong> {{ item.unitOfMeasure || '' }}</span>
            </div>
          </button>
          <button class="fav-star" :class="{ on: item.isFavourite }"
                  v-tooltip="item.isFavourite ? 'Remove from favourites' : 'Add to favourites'"
                  @click.stop="toggleFavourite(item)">
            <i :class="item.isFavourite ? 'pi pi-star-fill' : 'pi pi-star'" />
          </button>
        </div>
      </div>
      <div v-else class="empty-state">
        <i class="pi pi-inbox" />
        <p>No items found{{ search ? ' for "' + search + '"' : '' }}</p>
      </div>
    </div>

    <!-- Right: Order panel ──────────────────────────────────────── -->
    <div class="pos-order-panel">
      <div class="order-header">
        <div class="order-header-left">
          <span class="order-title">Current Order</span>
          <span v-if="myShop" class="order-shop-badge">{{ myShop.Name }}</span>
          <!-- Admin shop selector — required so prices/payment-types/contacts scope correctly -->
          <div v-else-if="isAdmin && shops.length" class="admin-shop-picker">
            <Select v-model="selectedAdminShop" :options="shops" option-label="Name" option-value="Code"
                    placeholder="Select shop…" size="small" @change="onAdminShopChange" />
          </div>
        </div>
        <span v-if="orderNo" class="order-no">{{ orderNo }}</span>
        <Button icon="pi pi-file-pdf" text v-tooltip="'Price list'" @click="downloadPriceList" />
        <Button icon="pi pi-trash" text severity="danger" v-tooltip="'Clear order'" @click="clearOrder" :disabled="!lines.length" />
      </div>

      <!-- Customer selector -->
      <div class="order-customer">
        <!-- Walk-in (umbrella) shop account banner -->
        <div v-if="walkIn" class="walk-in-banner" v-tooltip.bottom="'This is the shop account; sub-contacts below are linked to it.'">
          <i class="pi pi-building" />
          <div class="wi-info">
            <span class="wi-label">Shop account</span>
            <span class="wi-name">{{ walkIn.Name }}</span>
          </div>
          <span v-if="walkIn.KraPin" class="wi-pin">{{ walkIn.KraPin }}</span>
        </div>

        <!-- Search row (always visible) -->
        <div class="customer-search-wrap" v-click-outside="closeSearch">
          <div class="customer-search-input">
            <i class="pi pi-search search-icon" />
            <input
              ref="contactInputEl"
              v-model="contactQuery"
              class="contact-input"
              :placeholder="selectedContact ? 'Switch customer…' : 'Search sub-contact or leave blank'"
              @input="onContactInput"
              @focus="showContactDrop = true"
              @keydown.escape="closeSearch"
              @keydown.down.prevent="moveDown"
              @keydown.up.prevent="moveUp"
              @keydown.enter.prevent="pickHighlighted"
            />
            <button v-if="contactQuery" class="search-clear" @click="contactQuery='';contactSuggestions=[]">
              <i class="pi pi-times" />
            </button>
            <button class="search-clear" @click="openNewContactDialog" v-tooltip="'Add new sub-contact'">
              <i class="pi pi-user-plus" />
            </button>
            <button v-if="selectedContact" class="search-clear" @click="clearContact" v-tooltip="'Clear customer'">
              <i class="pi pi-user-minus" />
            </button>
          </div>
          <div v-if="showContactDrop && contactSuggestions.length" class="contact-dropdown">
            <div
              v-for="(c, i) in contactSuggestions" :key="c.ContactId || c.BcContactNo"
              class="contact-option" :class="{ highlighted: i === highlightIdx }"
              @mousedown.prevent="selectContact(c)"
            >
              <div class="co-name">{{ c.Name }}<span v-if="c.IsLocalOnly" class="co-local-tag">local</span></div>
              <div class="co-details">
                <span v-if="c.MobileNo">{{ c.MobileNo }}</span>
                <span v-if="c.KraPin" class="co-pin">{{ c.KraPin }}</span>
              </div>
            </div>
          </div>
          <div v-if="showContactDrop && contactQuery.length > 1 && !contactSuggestions.length" class="contact-dropdown">
            <div class="co-empty">
              <span>No matching contact</span>
              <Button label="+ Add new" size="small" text @mousedown.prevent="openNewContactDialog" />
            </div>
          </div>
        </div>

        <!-- Customer details (editable inline) -->
        <div class="customer-details">
          <div class="cd-name">
            <i class="pi pi-user cd-icon" />
            <input
              type="text"
              class="cd-input cd-name-input"
              v-model="contactDraft.name"
              placeholder="Customer name (optional)"
              @blur="persistContactDraft"
            />
          </div>
          <div class="cd-row">
            <div class="cd-field">
              <i class="pi pi-mobile cd-icon" />
              <input
                type="tel"
                class="cd-input"
                v-model="contactDraft.phone"
                placeholder="Phone (M-PESA)"
                @blur="persistContactDraft"
              />
            </div>
            <div class="cd-field">
              <i class="pi pi-id-card cd-icon" />
              <input
                type="text"
                class="cd-input"
                v-model="contactDraft.pin"
                placeholder="KRA PIN"
                @blur="persistContactDraft"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Order lines -->
      <div class="order-lines" ref="linesEl">
        <div v-if="!lines.length" class="order-empty">
          <i class="pi pi-shopping-cart" />
          <span>Select items to start an order</span>
        </div>
        <div v-for="(line, idx) in lines" :key="line.itemNo" class="order-line">
          <div class="line-info">
            <div class="line-desc">{{ line.description }}</div>
            <div class="line-unit-price">{{ fmt(line.unitPrice) }} each</div>
          </div>
          <div class="line-qty-ctrl">
            <button class="qty-btn" @click="decQty(idx)"><i class="pi pi-minus" /></button>
            <input
              type="number"
              class="qty-input"
              :value="line.quantity"
              step="0.01"
              min="0"
              @input="onQtyInput(idx, $event.target.value)"
              @blur="onQtyBlur(idx, $event.target.value)"
            />
            <button class="qty-btn" @click="incQty(idx)"><i class="pi pi-plus" /></button>
          </div>
          <div class="line-amount">{{ fmt(line.lineAmount) }}</div>
          <button class="line-remove" @click="removeLine(idx)"><i class="pi pi-times" /></button>
        </div>
      </div>

      <!-- Total + flow buttons -->
      <div class="order-footer">
        <div class="order-total-row">
          <span>Total</span>
          <span class="order-total">{{ fmt(total) }}</span>
        </div>
        <Button
          label="Print Confirmation" icon="pi pi-print" fluid severity="secondary"
          class="confirm-btn"
          :disabled="!lines.length || savingLines || printingConfirm"
          :loading="printingConfirm"
          @click="printConfirmation"
          v-tooltip.bottom="'Print proforma for the customer to verify before payment'"
        />
        <Button
          label="Checkout" icon="pi pi-credit-card" fluid
          class="checkout-btn"
          :disabled="!lines.length || savingLines"
          :loading="savingLines"
          @click="openCheckout"
        />
        <Button
          label="Save cart"
          icon="pi pi-bookmark"
          severity="secondary"
          fluid
          :disabled="!lines.length || savingLines"
          @click="openSaveCart"
          v-tooltip.bottom="'Park the cart with a label so a cashier can resume it later'"
        />
      </div>
    </div>
  </div>

  <!-- ── Save cart (label) ───────────────────────────────────────── -->
  <Dialog v-model:visible="saveCartVisible" header="Save / park this cart" :modal="true" :style="{ width: '420px' }">
    <p class="text-muted text-sm" style="margin-bottom:8px">
      Give the parked cart a label (e.g. customer name, table number, phone). It will move to the POS Orders page with status "saved" — open it from there to resume.
    </p>
    <div class="form-row">
      <label>Label</label>
      <InputText v-model="saveCartLabel" placeholder="e.g. Mary K. — Table 4" fluid />
    </div>
    <template #footer>
      <Button label="Cancel" text @click="saveCartVisible = false" />
      <Button label="Save cart" icon="pi pi-save" severity="success"
              :disabled="!saveCartLabel.trim()" :loading="savingCart" @click="saveCart" />
    </template>
  </Dialog>

  <!-- ── Checkout dialog ─────────────────────────────────────────── -->
  <Dialog v-model:visible="checkoutVisible" header="Request Payment" :modal="true" :style="{ width: '440px' }" :closable="!paying">
    <div class="checkout-form">
      <!-- Total -->
      <div class="checkout-total-display">
        <span class="co-label">Order Total</span>
        <span class="co-amount">{{ fmt(payable) }}</span>
      </div>

      <!-- Customer summary (if selected) -->
      <div v-if="selectedContact" class="checkout-customer">
        <i class="pi pi-user co-icon" />
        <div class="co-detail">
          <div class="co-cname">{{ selectedContact.Name }}</div>
          <div class="co-csub">
            <span v-if="selectedContact.MobileNo">{{ selectedContact.MobileNo }}</span>
            <span v-if="selectedContact.KraPin" class="co-kra">PIN: {{ selectedContact.KraPin }}</span>
          </div>
        </div>
      </div>

      <!-- Payment method -->
      <div class="form-row">
        <label>Payment Method</label>
        <div class="payment-type-grid">
          <button
            v-for="pt in paymentTypes" :key="pt.Code"
            class="pt-btn" :class="{ selected: selectedPayType?.Code === pt.Code }"
            @click="onPayTypeSelect(pt)"
            :title="pt.Description || ''"
          >
            <i :class="payTypeIcon(pt.PaymentClass)" />
            <span class="pt-name">{{ pt.Code }}</span>
            <span v-if="pt.Description" class="pt-tile-desc">{{ pt.Description.length > 36 ? pt.Description.slice(0,33) + '…' : pt.Description }}</span>
          </button>
        </div>
        <div v-if="selectedPayType?.Description" class="pt-description-box">
          <i class="pi pi-info-circle" />
          <span>{{ selectedPayType.Description }}</span>
        </div>
      </div>

      <!-- Mobile no (M-PESA) -->
      <div v-if="selectedPayType?.PaymentClass === 'Mobile'" class="form-row">
        <label>Mobile No (M-PESA STK Push)</label>
        <div class="stk-row">
          <InputText v-model="mobileNo" placeholder="e.g. 0712345678" fluid />
          <Button label="Send STK"
                  icon="pi pi-send" severity="info" size="small"
                  :loading="sendingStk" :disabled="!mobileNo"
                  @click="doStkPush" />
        </div>
        <span v-if="selectedContact?.MobileNo && mobileNo !== selectedContact.MobileNo"
          class="use-contact-phone" @click="mobileNo = selectedContact.MobileNo">
          Use {{ selectedContact.MobileNo }}
        </span>
        <div v-if="stkResult" class="stk-result" :class="{ ok: stkResult.ok, fail: !stkResult.ok }">
          <i :class="stkResult.ok ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'" />
          {{ stkResult.message }}
        </div>

        <!-- Look up a paid M-Pesa transaction (last 20 of this amount) and tag its code to the invoice -->
        <div class="mpesa-lookup">
          <label>Find M-Pesa payment by amount</label>
          <div class="stk-row">
            <InputNumber v-model="mpesaAmount" :min="0" :minFractionDigits="2" :maxFractionDigits="2"
                         mode="decimal" fluid />
            <Button label="Search" icon="pi pi-search" size="small" :loading="mpesaSearch.loading" @click="searchMpesa" />
          </div>
          <span class="mpesa-hint">Lists the last 20 M-Pesa payments of this amount — pick by name &amp; code. For a split, search the fraction paid by M-Pesa.</span>

          <div v-if="mpesaSearch.error" class="mpesa-msg">{{ mpesaSearch.error }}</div>

          <!-- Match table: tick one or more transactions (1→many). Latest first. -->
          <DataTable v-if="mpesaSearch.results.length" :value="mpesaSearch.results"
                     v-model:selection="mpesaSelected" dataKey="reference" size="small"
                     class="mpesa-table" :scrollable="true" scrollHeight="200px">
            <Column selectionMode="multiple" headerStyle="width:2.2rem" />
            <Column field="reference" header="Code" style="min-width:110px" />
            <Column field="name" header="Name" style="min-width:130px">
              <template #body="{ data }">{{ data.name || '—' }}</template>
            </Column>
            <Column field="phone" header="Phone" style="width:110px" />
            <Column field="amount" header="Amount" style="width:90px" bodyStyle="text-align:right">
              <template #body="{ data }">{{ fmt(data.amount) }}</template>
            </Column>
            <Column field="availableAmount" header="Available" style="width:95px" bodyStyle="text-align:right">
              <template #body="{ data }">{{ fmt(data.availableAmount ?? data.amount) }}</template>
            </Column>
            <Column field="timestamp" header="Time" style="width:140px">
              <template #body="{ data }">{{ data.timestamp || '—' }}</template>
            </Column>
          </DataTable>

          <!-- Allocation summary across the ticked transactions -->
          <div v-if="mpesaMatched.length" class="mpesa-matched">
            <div v-for="m in mpesaMatched" :key="m.code" class="mm-row">
              <span>{{ m.code }}</span>
              <strong>{{ fmt(m.applied) }}</strong>
            </div>
            <div class="mm-total" :class="{ short: mpesaMatchedTotal + 0.009 < mpesaAmount }">
              <span>Matched</span>
              <strong>{{ fmt(mpesaMatchedTotal) }} / {{ fmt(mpesaAmount) }}</strong>
            </div>
          </div>

          <!-- Fallback: only when the amount search doesn't surface the right transaction -->
          <label style="margin-top:8px">Not listed? Find by confirmation code</label>
          <div class="stk-row">
            <InputText v-model="mpesaCodeQuery" placeholder="e.g. SLJ7AB12CD"
                       @keyup.enter="searchMpesaByCode" fluid />
            <Button label="Find" icon="pi pi-search" size="small" severity="secondary"
                    :loading="mpesaSearch.loading" @click="searchMpesaByCode" />
          </div>
        </div>
      </div>

      <!-- Reference for Card / Bank Deposit / Bank Transfer / Credit -->
      <div v-if="needsRef" class="form-row">
        <label>Reference {{ selectedPayType?.PaymentClass === 'BankDeposit' ? '(deposit slip no.)' : '' }}</label>
        <InputText v-model="paymentRef" placeholder="transaction / slip / approval ref" fluid />
      </div>

      <!-- Cash tendered -->
      <div v-if="selectedPayType?.PaymentClass === 'Cash'" class="form-row">
        <label>Amount Tendered</label>
        <InputNumber v-model="tendered" :min="0" :minFractionDigits="2" :maxFractionDigits="2" fluid mode="decimal" />
      </div>

      <div v-if="selectedPayType?.PaymentClass === 'Cash' && change >= 0" class="form-row">
        <label>Change Due</label>
        <div class="change-display" :class="{ negative: change < 0 }">{{ fmt(change) }}</div>
      </div>

      <!-- Split-tender list -->
      <div v-if="splitTenders.length" class="split-tenders">
        <div class="split-head">
          <strong>Tenders so far</strong>
          <span class="text-muted text-sm">{{ fmt(splitPaid) }} of {{ fmt(total) }}
            <span v-if="splitRemaining > 0" class="num neg">· remaining {{ fmt(splitRemaining) }}</span>
            <span v-else class="num pos">· fully covered</span>
          </span>
        </div>
        <div v-for="(t, i) in splitTenders" :key="i" class="split-row">
          <span>{{ t.paymentTypeCode || t.paymentTypeName }}</span>
          <span v-if="t.couponCode" class="text-muted text-sm">· {{ t.couponCode }}</span>
          <span v-if="t.mobileNo"   class="text-muted text-sm">· {{ t.mobileNo }}</span>
          <strong style="margin-left:auto">{{ fmt(t.amount) }}</strong>
          <Button icon="pi pi-times" text severity="danger" size="small"
                  @click="splitTenders.splice(i, 1)" />
        </div>
      </div>

      <div v-if="checkoutPaymentLines.length" class="payment-summary">
        <div class="payment-summary-head">
          <strong>Payment methods</strong>
          <span>{{ fmt(checkoutAmountPaid) }}</span>
        </div>
        <div v-for="(p, i) in checkoutPaymentLines" :key="i" class="payment-summary-row">
          <span>
            {{ p.name }}
            <small v-if="p.detail">· {{ p.detail }}</small>
          </span>
          <strong>{{ fmt(p.amount) }}</strong>
        </div>
        <div v-if="checkoutChangeDue > 0" class="payment-summary-row change">
          <span>Change</span>
          <strong>{{ fmt(checkoutChangeDue) }}</strong>
        </div>
      </div>

      <div v-if="payError" class="pay-error">{{ payError }}</div>
    </div>

    <template #footer>
      <Button label="Cancel" text @click="checkoutVisible = false" :disabled="paying" />
      <Button label="Add as tender (split)" icon="pi pi-plus" severity="info"
              :disabled="!canAddTender" @click="addTender" />
      <Button v-if="splitTenders.length"
              label="Pay with tenders" icon="pi pi-check" severity="success"
              :loading="paying" :disabled="splitRemaining > 0.01"
              @click="payWithTenders" />
      <Button v-else
              label="Confirm Payment" icon="pi pi-check" severity="success"
              :loading="paying" :disabled="!canConfirm"
              @click="doCheckout" />
    </template>
  </Dialog>

  <!-- ── PDF preview modal (reusable) ────────────────────────────── -->
  <PdfPreviewModal
    v-model:visible="pdfPreview.visible"
    :header="pdfPreview.header"
    :fetcher="pdfPreview.fetcher"
    :primary-label="pdfPreview.primaryLabel"
    :primary-icon="pdfPreview.primaryIcon"
    :primary-severity="pdfPreview.primarySeverity"
    :primary-loading="pdfPreview.confirming"
    @confirm="pdfPreviewConfirm"
  />

  <!-- ── Success dialog ──────────────────────────────────────────── -->
  <Dialog v-model:visible="successVisible" header="Payment Recorded" :modal="true" :style="{ width: '380px' }" :closable="false">
    <div class="success-body">
      <i class="pi pi-check-circle success-icon" />
      <p><strong>{{ completedOrderNo }}</strong> marked as paid.</p>
      <p v-if="change > 0" class="change-note">Change to return: <strong>{{ fmt(change) }}</strong></p>

      <!-- eTIMS signed -->
      <div v-if="successEtims" class="etims-block">
        <div class="etims-row">
          <i class="pi pi-shield etims-icon" />
          <span>Signed by eTIMS</span>
        </div>
        <div class="etims-detail">CU Invoice: <strong>{{ successEtims.etimsInvoiceNo }}</strong></div>
        <div v-if="successEtims.cuSerialNo" class="etims-detail">CU Serial: {{ successEtims.cuSerialNo }}</div>
      </div>
      <div v-else class="etims-block etims-warn">
        <i class="pi pi-exclamation-triangle" />
        <span>Not signed (eTIMS unavailable). Please retry from POS Orders.</span>
      </div>

      <!-- Print status -->
      <div class="print-status">
        <i :class="successPrinted ? 'pi pi-print print-ok' : 'pi pi-times-circle print-fail'" />
        <span>{{ successPrinted ? 'Receipt sent to printer' : 'Print failed — use Reprint from Orders' }}</span>
      </div>
    </div>
    <template #footer>
      <Button label="New Order" icon="pi pi-plus" @click="newOrderAfterSuccess" autofocus />
    </template>
  </Dialog>

  <!-- ── New customer (sub-contact) dialog ────────────────────────────── -->
  <Dialog v-model:visible="newContactDialog" header="Add Customer" :modal="true" :style="{ width: '420px' }">
    <p class="text-muted text-sm" style="margin-top:0">
      Linked under <strong>{{ walkIn?.Name || 'shop account' }}</strong>. Saved locally — admin can push to BC later.
    </p>
    <div class="form-row">
      <label>Name <span style="color:#ef4444">*</span></label>
      <InputText v-model="newContact.name" placeholder="Customer name" fluid />
    </div>
    <div class="form-row">
      <label>Mobile (M-PESA)</label>
      <InputText v-model="newContact.mobileNo" placeholder="0712345678" fluid />
    </div>
    <div class="form-row">
      <label>KRA PIN <span class="text-muted text-sm">(used in eTIMS)</span></label>
      <InputText v-model="newContact.kraPin" placeholder="A123456789N" fluid />
    </div>
    <div class="form-row">
      <label>Email</label>
      <InputText v-model="newContact.email" placeholder="(optional)" fluid />
    </div>
    <template #footer>
      <Button label="Cancel" text @click="newContactDialog = false" :disabled="creatingContact" />
      <Button label="Save Customer" icon="pi pi-check" severity="success"
              :disabled="!newContact.name?.trim()" :loading="creatingContact" @click="saveNewContact" />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import { useToast } from 'primevue/usetoast'
import Select from 'primevue/select'
import { posApi, setAdminShopCode, getAdminShopCode } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'
import PdfPreviewModal from '@/components/PdfPreviewModal.vue'

const router = useRouter()
const toast  = useToast()
const auth   = useAuthStore()
const isAdmin = computed(() => auth.user?.role === 'admin')

// ── v-click-outside directive (inline) ───────────────────────────
const vClickOutside = {
  mounted(el, binding) {
    el._vClickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('mousedown', el._vClickOutside)
  },
  unmounted(el) { document.removeEventListener('mousedown', el._vClickOutside) },
}

// ── Catalogue state ───────────────────────────────────────────────
const categories   = ref([])
const search       = ref('')
const activeCat    = ref('')
const paymentTypes = ref([])
const myShop       = ref(null)
const shops        = ref([])
const selectedAdminShop = ref(getAdminShopCode())
const allContacts  = ref([])
const loading      = ref(false)
const printingConfirm = ref(false)
const sendingStk      = ref(false)
const stkResult       = ref(null)

const ALL_CAT = '__all__'

const allCategories = computed(() => [
  { code: ALL_CAT, name: 'All', items: categories.value.flatMap(c => c.items) },
  ...categories.value,
])

// Searches across ALL items when a query is present so barcode scans always resolve
const filteredItems = computed(() => {
  const cats = allCategories.value
  const q = search.value.trim().toLowerCase()
  if (!q) {
    return cats.find(c => c.code === activeCat.value)?.items ?? []
  }
  const all = cats.find(c => c.code === ALL_CAT)?.items ?? []
  // 1. Exact barcode match wins, even if many items also fuzzy-match
  const exactBarcode = all.find(i => i.barcode && i.barcode.toLowerCase() === q)
  if (exactBarcode) return [exactBarcode]
  return all.filter(i =>
    i.description.toLowerCase().includes(q) ||
    i.itemNo.toLowerCase().includes(q) ||
    (i.barcode && i.barcode.toLowerCase().includes(q))
  )
})

const searchHint = computed(() => {
  const n = filteredItems.value.length
  if (search.value.trim() && n) return `${n} match${n === 1 ? '' : 'es'} (all categories) — Enter to add`
  return 'Search items, scan barcode…'
})

// While typing/scanning, swap the visible category to ALL so the cashier always sees what matched.
watch(search, (val) => {
  if (val.trim() && activeCat.value !== ALL_CAT) activeCat.value = ALL_CAT
})

function addFirstMatch() {
  if (!search.value.trim()) return
  const q = search.value.trim().toLowerCase()
  // Look in the full catalogue regardless of the active category tab — important for scanners
  const all = allCategories.value.find(c => c.code === ALL_CAT)?.items ?? []
  // Priority: exact barcode → exact item no → starts-with barcode → starts-with item no → first fuzzy match
  const exactBarcode = all.find(i => i.barcode?.toLowerCase() === q)
  const exactItemNo  = all.find(i => i.itemNo.toLowerCase() === q)
  const startBarcode = all.find(i => i.barcode?.toLowerCase().startsWith(q))
  const startItemNo  = all.find(i => i.itemNo.toLowerCase().startsWith(q))
  const target = exactBarcode || exactItemNo || startBarcode || startItemNo || filteredItems.value[0]
  if (!target) {
    toast.add({ severity: 'warn', summary: 'No match', detail: `Nothing matches "${search.value}"`, life: 2500 })
    return
  }
  addToOrder(target)
  search.value = ''
}

// ── Order state ───────────────────────────────────────────────────
const orderId  = ref(null)
const orderNo  = ref('')
const lines    = ref([])
const savingLines = ref(false)
const linesEl  = ref(null)

const total = computed(() =>
  lines.value.reduce((s, l) => s + l.lineAmount, 0)
)

// ── Save cart (abandoned-cart parking) ────────────────────────────
const saveCartVisible = ref(false)
const saveCartLabel   = ref('')
const savingCart      = ref(false)
function openSaveCart() {
  saveCartLabel.value = contact.value?.name || ''
  saveCartVisible.value = true
}
async function saveCart() {
  if (!orderId.value) return
  savingCart.value = true
  try {
    // Persist any pending line changes first so the parked cart reflects what's on screen.
    if (lines.value?.length) await posApi.setLines(orderId.value, lines.value)
    await posApi.saveCart(orderId.value, saveCartLabel.value.trim())
    saveCartVisible.value = false
    // Reset terminal state — caller can start a new order or open another one from POS Orders.
    orderId.value = null
    lines.value = []
    contact.value = null
  } catch (e) {
    alert(e.response?.data?.error || e.message || 'Failed to save cart')
  } finally {
    savingCart.value = false
  }
}

// ── Checkout state ────────────────────────────────────────────────
const checkoutVisible  = ref(false)
const selectedPayType  = ref(null)
const mobileNo         = ref('')
const tendered         = ref(0)
const paying           = ref(false)
const payError         = ref('')
const successVisible   = ref(false)
const completedOrderNo = ref('')
const successEtims     = ref(null)
const successPrinted   = ref(false)

// M-Pesa: look up a paid transaction by amount against the configured fetch URL,
// then tag its confirmation code as the payment reference on the invoice.
const mpesaAmount    = ref(0)          // amount to search/allocate (may be a fraction for split tenders)
const mpesaCodeQuery = ref('')         // confirmation-code fallback search
const mpesaSearch    = ref({ loading: false, error: '', results: [] })
const mpesaSelected  = ref([])         // checked transactions (1→many matching)
const isMpesa = computed(() => selectedPayType.value?.PaymentClass === 'Mobile')
// Non-cash, non-M-Pesa methods (Card / Bank Deposit / Bank Transfer / Credit) capture a free-text reference.
const paymentRef = ref('')
const REF_CLASSES = ['Card', 'BankDeposit', 'BankTransfer', 'Credit']
const needsRef = computed(() => REF_CLASSES.includes(selectedPayType.value?.PaymentClass))

// Allocate the target M-Pesa amount across the selected transactions, respecting
// each one's available balance (a partially-used code contributes only its balance).
const mpesaMatched = computed(() => {
  let remaining = Math.round(Number(mpesaAmount.value || 0) * 100) / 100
  const out = []
  for (const p of mpesaSelected.value) {
    if (remaining <= 0) break
    const avail = Number(p.availableAmount ?? p.amount ?? 0)
    const applied = Math.round(Math.min(avail, remaining) * 100) / 100
    if (applied <= 0) continue
    out.push({ code: p.reference, mpesaAmount: Number(p.amount || 0), applied,
               phone: p.phone || null, name: p.name || null, timestamp: p.timestamp || null })
    remaining = Math.round((remaining - applied) * 100) / 100
  }
  return out
})
const mpesaMatchedTotal = computed(() => Math.round(mpesaMatched.value.reduce((s, m) => s + m.applied, 0) * 100) / 100)
const mpesaCodes = computed(() => mpesaMatched.value.map(m => m.code).join(', '))

// Primary lookup: last 20 M-Pesa transactions of the given amount (latest first),
// already excluding fully-used codes; partially-used ones show their balance.
async function searchMpesa() {
  if (!selectedPayType.value) return
  const amt = Number(mpesaAmount.value || 0)
  if (!(amt > 0)) { mpesaSearch.value = { loading: false, error: 'Enter the M-Pesa amount to search.', results: [] }; return }
  mpesaSearch.value = { loading: true, error: '', results: [] }
  mpesaSelected.value = []
  try {
    const { data } = await posApi.fetchPayments({ paymentTypeCode: selectedPayType.value.Code, amount: amt, reconcile: 0, limit: 20 })
    const results = data.payments || []
    mpesaSearch.value = {
      loading: false,
      error: results.length ? '' : `No unused M-Pesa payments of ${fmt(amt)} found — search by confirmation code below.`,
      results,
    }
  } catch (e) {
    mpesaSearch.value = { loading: false, error: e.response?.data?.error ?? e.message, results: [] }
  }
}

// Fallback lookup: only when the amount search doesn't surface the right one.
async function searchMpesaByCode() {
  if (!selectedPayType.value) return
  const code = String(mpesaCodeQuery.value || '').trim().toUpperCase()
  if (!code) { mpesaSearch.value = { loading: false, error: 'Enter a confirmation code.', results: [] }; return }
  mpesaSearch.value = { loading: true, error: '', results: [] }
  try {
    const { data } = await posApi.fetchPayments({ paymentTypeCode: selectedPayType.value.Code, code, reconcile: 0, limit: 20 })
    const results = data.payments || []
    mpesaSearch.value = { loading: false, error: results.length ? '' : `No unused M-Pesa payment found for code ${code}.`, results }
    if (results.length === 1) mpesaSelected.value = [results[0]]
  } catch (e) {
    mpesaSearch.value = { loading: false, error: e.response?.data?.error ?? e.message, results: [] }
  }
}

// Currency rounding: POS charges to the nearest whole KES at checkout/confirmation.
const roundKes = (v) => Math.round(Number(v) || 0)
const payable = computed(() => roundKes(total.value))

const change = computed(() => {
  if (selectedPayType.value?.PaymentClass !== 'Cash') return 0
  return roundKes(tendered.value) - payable.value
})

const checkoutPaymentLines = computed(() => {
  if (splitTenders.value.length) {
    return splitTenders.value.map(t => ({
      name: t.paymentTypeCode || t.paymentTypeName,
      detail: t.couponCode || t.reference || t.mobileNo || '',
      amount: Number(t.amount || 0),
    }))
  }
  if (!selectedPayType.value) return []
  const code = String(selectedPayType.value.Code || '').toUpperCase()
  const amount = selectedPayType.value.PaymentClass === 'Cash'
    ? roundKes(tendered.value)
    : payable.value
  return [{
    name: selectedPayType.value.Code || selectedPayType.value.Name,
    detail: code === 'COUPON' ? 'Coupon code required at confirm' : (mpesaCodes.value || paymentRef.value || mobileNo.value || ''),
    amount,
  }]
})
const checkoutAmountPaid = computed(() => checkoutPaymentLines.value.reduce((s, p) => s + Number(p.amount || 0), 0))
const checkoutChangeDue = computed(() => Math.max(0, Math.round((checkoutAmountPaid.value - total.value) * 100) / 100))

const canConfirm = computed(() => {
  if (!selectedPayType.value) return false
  // Mobile (M-Pesa): allow confirm with either a phone (STK) or matched transaction(s).
  if (selectedPayType.value.PaymentClass === 'Mobile' && !mobileNo.value.trim() && mpesaMatchedTotal.value <= 0) return false
  if (selectedPayType.value.PaymentClass === 'Cash' && roundKes(tendered.value) < payable.value) return false
  return true
})

// ── Load catalogue ────────────────────────────────────────────────
async function loadCatalogue() {
  loading.value = true
  try {
    const [itemsRes, ptRes, shopRes, contactsRes, walkInRes] = await Promise.all([
      posApi.getItems(), posApi.getPaymentTypes(), posApi.getMyShop(),
      posApi.listContacts(), posApi.getWalkIn(),
    ])
    categories.value  = itemsRes.data
    paymentTypes.value = ptRes.data
    myShop.value      = shopRes.data
    allContacts.value = contactsRes.data    // walk-ins are excluded server-side now
    walkIn.value      = walkInRes.data
    if (categories.value.length) activeCat.value = ALL_CAT
    // No auto-selection — cashier picks a sub-contact or leaves blank for walk-in
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Load failed', detail: e.message, life: 4000 })
  } finally {
    loading.value = false
  }
}

async function loadShopsForAdmin() {
  if (!isAdmin.value) return
  try {
    const { data } = await posApi.listShops()
    shops.value = data
  } catch {}
}

async function onAdminShopChange() {
  setAdminShopCode(selectedAdminShop.value)
  // Reload everything that's shop-scoped
  await loadCatalogue()
}

async function toggleFavourite(item) {
  try {
    if (item.isFavourite) await posApi.removeFavourite(item.itemNo)
    else                  await posApi.addFavourite(item.itemNo)
    await loadCatalogue()
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Favourite error', detail: e.message, life: 2500 })
  }
}

// PDF preview modal state
const pdfPreview = ref({ visible: false, header: '', fetcher: null,
                          primaryLabel: '', primaryIcon: '', primarySeverity: '', onConfirm: null,
                          confirming: false })

function openPdfPreview(opts) {
  pdfPreview.value = { visible: true, confirming: false, ...opts }
}

async function pdfPreviewConfirm() {
  if (!pdfPreview.value.onConfirm) return
  pdfPreview.value.confirming = true
  try { await pdfPreview.value.onConfirm() }
  finally { pdfPreview.value.confirming = false }
}

async function printConfirmation() {
  if (!lines.value.length) return
  printingConfirm.value = true
  try {
    if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null }
    await persistLines()
    if (!orderId.value) return
    try {
      await posApi.setContact(orderId.value, {
        contactNo:    selectedContact.value?.BcContactNo || null,
        contactName:  contactDraft.value.name.trim() || null,
        contactPhone: contactDraft.value.phone.trim() || null,
        contactPin:   contactDraft.value.pin.trim() || null,
      })
    } catch {}

    // Show preview, let cashier confirm "Send to Printer"
    const oid = orderId.value
    openPdfPreview({
      header: 'Confirmation Receipt — Preview',
      fetcher: () => posApi.fetchConfirmationPreview(oid),
      primaryLabel: 'Send to Printer',
      primaryIcon:  'pi pi-print',
      primarySeverity: 'success',
      onConfirm: async () => {
        await posApi.printConfirmation(oid)
        toast.add({ severity: 'success', summary: 'Sent to printer', life: 2000 })
        pdfPreview.value.visible = false
      },
    })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Preview failed', detail: e.response?.data?.error ?? e.message, life: 4000 })
  } finally {
    printingConfirm.value = false
  }
}

async function doStkPush() {
  if (!selectedPayType.value || !mobileNo.value) return
  sendingStk.value = true; stkResult.value = null
  try {
    const { data } = await posApi.stkPush(orderId.value, {
      paymentTypeCode: selectedPayType.value.Code,
      mobileNo:        mobileNo.value,
      amount:          total.value,
    })
    stkResult.value = data
  } catch (e) {
    stkResult.value = { ok: false, message: e.response?.data?.error ?? e.message }
  } finally {
    sendingStk.value = false
  }
}

function downloadPriceList() {
  openPdfPreview({
    header: 'Shop Price List',
    fetcher: () => posApi.fetchPriceList(),
    primaryLabel: '', onConfirm: null,
  })
}

onMounted(async () => {
  await loadShopsForAdmin()
  await loadCatalogue()
})

// ── Order logic ───────────────────────────────────────────────────
function addToOrder(item) {
  const existing = lines.value.find(l => l.itemNo === item.itemNo)
  if (existing) {
    existing.quantity++
    existing.lineAmount = round(existing.quantity * existing.unitPrice)
  } else {
    lines.value.push({
      itemNo: item.itemNo,
      description: item.description,
      quantity: 1,
      unitPrice: item.unitPrice,
      lineAmount: item.unitPrice,
    })
  }
  nextTick(() => linesEl.value?.scrollTo({ top: linesEl.value.scrollHeight, behavior: 'smooth' }))
  debounceSave()
}

function incQty(idx) {
  const l = lines.value[idx]
  l.quantity++
  l.lineAmount = round(l.quantity * l.unitPrice)
  debounceSave()
}

function decQty(idx) {
  const l = lines.value[idx]
  if (l.quantity > 1) {
    l.quantity--
    l.lineAmount = round(l.quantity * l.unitPrice)
    debounceSave()
  } else {
    removeLine(idx)
  }
}

function onQtyInput(idx, raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return
  const l = lines.value[idx]
  l.quantity   = n
  l.lineAmount = round(n * l.unitPrice)
  debounceSave()
}

function onQtyBlur(idx, raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    removeLine(idx)
  }
}

function removeLine(idx) {
  lines.value.splice(idx, 1)
  debounceSave()
}

function clearOrder() {
  lines.value           = []
  orderId.value         = null
  orderNo.value         = ''
  selectedContact.value = null
  syncDraftFromContact(null)
  debounceSave()
}

let saveTimer = null
function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(persistLines, 600)
}

async function persistLines() {
  if (savingLines.value) return
  savingLines.value = true
  try {
    if (!orderId.value && lines.value.length) {
      const { data } = await posApi.createOrder()
      orderId.value = data.OrderId || data.orderId
      orderNo.value = data.OrderNo || data.orderNo
    }
    if (orderId.value) {
      await posApi.setLines(orderId.value, lines.value)
    }
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Save error', detail: e.message, life: 3000 })
  } finally {
    savingLines.value = false
  }
}

// ── Contact selector ─────────────────────────────────────────────
const selectedContact    = ref(null)
const contactQuery       = ref('')
const contactSuggestions = ref([])
const showContactDrop    = ref(false)
const highlightIdx       = ref(-1)
const contactInputEl     = ref(null)

// editable draft of contact info on the order
const contactDraft = ref({ name: '', phone: '', pin: '' })

// Walk-in (umbrella) shop account
const walkIn       = ref(null)

// New sub-contact dialog
const newContactDialog = ref(false)
const creatingContact  = ref(false)
const newContact       = ref({ name: '', mobileNo: '', kraPin: '', email: '' })

function openNewContactDialog() {
  newContact.value = {
    name:     contactQuery.value?.trim() || '',
    mobileNo: '',
    kraPin:   '',
    email:    '',
  }
  newContactDialog.value = true
  showContactDrop.value  = false
}

async function saveNewContact() {
  if (!newContact.value.name?.trim()) return
  creatingContact.value = true
  try {
    const { data } = await posApi.createContact({
      name:     newContact.value.name.trim(),
      mobileNo: newContact.value.mobileNo.trim() || null,
      kraPin:   newContact.value.kraPin.trim()   || null,
      email:    newContact.value.email.trim()    || null,
    })
    // Reload contacts and auto-select the new one
    const { data: all } = await posApi.listContacts()
    allContacts.value = all
    const created = all.find(c => c.BcContactNo === (data.BcContactNo || data.bcContactNo))
    if (created) await selectContact(created)
    newContactDialog.value = false
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e.response?.data?.error ?? e.message, life: 4000 })
  } finally {
    creatingContact.value = false
  }
}

function syncDraftFromContact(c) {
  if (c) {
    contactDraft.value = {
      name:  c.Name     || '',
      phone: c.MobileNo || '',
      pin:   c.KraPin   || '',
    }
  } else {
    contactDraft.value = { name: '', phone: '', pin: '' }
  }
}

function onContactInput() {
  highlightIdx.value = -1
  const q = contactQuery.value.trim().toLowerCase()
  if (q.length < 1) { contactSuggestions.value = []; return }
  contactSuggestions.value = allContacts.value
    .filter(c => c.Name?.toLowerCase().includes(q) || c.MobileNo?.includes(q))
    .slice(0, 10)
  showContactDrop.value = true
}

function moveDown() { highlightIdx.value = Math.min(highlightIdx.value + 1, contactSuggestions.value.length - 1) }
function moveUp()   { highlightIdx.value = Math.max(highlightIdx.value - 1, 0) }
function pickHighlighted() {
  if (highlightIdx.value >= 0) selectContact(contactSuggestions.value[highlightIdx.value])
}
function closeSearch() { showContactDrop.value = false }

async function selectContact(c) {
  selectedContact.value = c
  syncDraftFromContact(c)
  contactQuery.value    = ''
  contactSuggestions.value = []
  showContactDrop.value = false
  if (orderId.value) {
    try {
      await posApi.setContact(orderId.value, {
        contactNo:    c.BcContactNo,
        contactName:  c.Name,
        contactPhone: c.MobileNo || null,
        contactPin:   c.KraPin   || null,
      })
    } catch {}
  }
}

async function clearContact() {
  selectedContact.value = null
  syncDraftFromContact(null)
  if (orderId.value) {
    try { await posApi.setContact(orderId.value, { contactNo: null, contactName: null, contactPhone: null, contactPin: null }) } catch {}
  }
}

// Persist whatever's in the draft to the order — works whether a contact is
// selected (overrides its phone/PIN for this order only) or not (manual entry).
let draftSaveTimer = null
async function persistContactDraft() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(async () => {
    if (!orderId.value) {
      // create the order lazily so the contact gets attached even before items are added
      try {
        if (lines.value.length === 0 && (contactDraft.value.phone || contactDraft.value.name || contactDraft.value.pin)) {
          // don't create empty orders just for a contact — defer
          return
        }
        await persistLines()
      } catch {}
    }
    if (!orderId.value) return
    try {
      await posApi.setContact(orderId.value, {
        contactNo:    selectedContact.value?.BcContactNo || null,
        contactName:  contactDraft.value.name.trim() || null,
        contactPhone: contactDraft.value.phone.trim() || null,
        contactPin:   contactDraft.value.pin.trim() || null,
      })
    } catch {}
  }, 400)
}

// ── Checkout ──────────────────────────────────────────────────────
function onPayTypeSelect(pt) {
  selectedPayType.value = pt
  paymentRef.value = ''
  mpesaCodeQuery.value = ''
  mpesaSelected.value = []
  mpesaSearch.value = { loading: false, error: '', results: [] }
  if (pt.PaymentClass === 'Mobile') {
    mobileNo.value = contactDraft.value.phone || selectedContact.value?.MobileNo || ''
    // Default the lookup amount to what's still owed (the M-Pesa leg may be a fraction).
    mpesaAmount.value = roundKes(splitRemaining.value || total.value)
  }
}

async function openCheckout() {
  if (!lines.value.length) return
  // make sure any pending draft edits land on the order before posting payment
  if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null }
  await persistLines()
  if (orderId.value) {
    try {
      await posApi.setContact(orderId.value, {
        contactNo:    selectedContact.value?.BcContactNo || null,
        contactName:  contactDraft.value.name.trim() || null,
        contactPhone: contactDraft.value.phone.trim() || null,
        contactPin:   contactDraft.value.pin.trim() || null,
      })
    } catch {}
  }
  payError.value = ''
  stkResult.value = null
  paymentRef.value = ''
  mpesaCodeQuery.value = ''
  mpesaSelected.value = []
  mpesaAmount.value = roundKes(total.value)
  mpesaSearch.value = { loading: false, error: '', results: [] }
  selectedPayType.value = paymentTypes.value[0] ?? null
  tendered.value = total.value
  mobileNo.value = contactDraft.value.phone || selectedContact.value?.MobileNo || ''
  splitTenders.value = []
  checkoutVisible.value = true
}

// ── Split-tender state ────────────────────────────────────────────
const splitTenders = ref([])
const splitPaid = computed(() => splitTenders.value.reduce((s, t) => s + Number(t.amount || 0), 0))
const splitRemaining = computed(() => Math.max(0, total.value - splitPaid.value))
const canAddTender = computed(() => {
  if (!selectedPayType.value) return false
  if (splitRemaining.value <= 0) return false
  if (selectedPayType.value.PaymentClass === 'Cash' && (!tendered.value || tendered.value <= 0)) return false
  return true
})
function defaultTenderAmount() {
  // Cash uses tendered; mobile/coupon defaults to remaining; coupon will be capped server-side.
  if (selectedPayType.value?.PaymentClass === 'Cash') return Number(tendered.value || 0)
  return splitRemaining.value
}
async function addTender() {
  const isMobile = selectedPayType.value.PaymentClass === 'Mobile'
  // For M-Pesa, the tender amount is what the matched transaction(s) cover.
  const amt = isMobile && mpesaMatchedTotal.value > 0 ? mpesaMatchedTotal.value : defaultTenderAmount()
  if (!(amt > 0)) { payError.value = 'Tender amount must be positive'; return }
  let couponCode = null
  const code = String(selectedPayType.value.Code || '').toUpperCase()
  if (code === 'COUPON') {
    couponCode = String(window.prompt('Scan or enter the coupon code:') || '').trim().toUpperCase()
    if (!couponCode) { payError.value = 'Coupon code required'; return }
  }
  splitTenders.value.push({
    paymentTypeCode: selectedPayType.value.Code,
    paymentTypeName: selectedPayType.value.Name,
    amount: Math.round(amt * 100) / 100,
    mobileNo: isMobile ? (mobileNo.value || null) : null,
    reference: isMobile ? (mpesaCodes.value || null) : (needsRef.value ? (paymentRef.value.trim() || null) : null),
    matches: isMobile ? mpesaMatched.value.slice() : null,
    couponCode,
  })
  payError.value = ''
  // Reset cash + M-Pesa selection + reference for the next tender
  tendered.value = splitRemaining.value
  paymentRef.value = ''
  mpesaCodeQuery.value = ''
  mpesaSelected.value = []
  mpesaAmount.value = roundKes(splitRemaining.value)
  mpesaSearch.value = { loading: false, error: '', results: [] }
}
async function payWithTenders() {
  paying.value = true; payError.value = ''
  const oid = orderId.value
  const matches = splitTenders.value.flatMap(t => t.matches || [])
  try {
    checkoutVisible.value = false
    const { data } = await posApi.checkoutMulti(oid, { tenders: splitTenders.value })
    if (matches.length) {
      try { await posApi.recordMpesaMatch(oid, matches) }
      catch (e) { toast.add({ severity: 'warn', summary: 'M-Pesa match not saved', detail: e.response?.data?.error ?? e.message, life: 5000 }) }
    }
    completedOrderNo.value = orderNo.value
    successEtims.value     = data?.etims  ?? null
    successPrinted.value   = data?.printed === true
    splitTenders.value = []
    successVisible.value   = true
  } catch (e) {
    payError.value = e.response?.data?.error ?? e.message
    checkoutVisible.value = true
  } finally {
    paying.value = false
  }
}

async function doCheckout() {
  paying.value = true
  payError.value = ''
  try {
    const code = String(selectedPayType.value.Code || '').toUpperCase()
    const isCoupon = code === 'COUPON'
    let couponCode = null
    if (isCoupon) {
      couponCode = String(window.prompt('Scan or enter the coupon code:') || '').trim().toUpperCase()
      if (!couponCode) { payError.value = 'Coupon code required'; paying.value = false; return }
    }

    checkoutVisible.value = false
    const paymentAmount = selectedPayType.value.PaymentClass === 'Cash'
      ? roundKes(tendered.value)
      : payable.value
    const oid = orderId.value
    const mpesaRef = isMpesa.value ? (mpesaCodes.value || null) : (needsRef.value ? (paymentRef.value.trim() || null) : null)
    const matches  = isMpesa.value ? mpesaMatched.value.slice() : []
    const { data: co } = await posApi.checkout(oid, {
      paymentTypeCode: selectedPayType.value.Code,
      paymentTypeName: selectedPayType.value.Name,
      amount: paymentAmount,
      mobileNo: mobileNo.value.trim() || null,
      reference: mpesaRef,
      couponCode,
    })
    const { data: confirmRes } = await posApi.confirmPayment(co.paymentId, mpesaRef)
    // Record M-Pesa code→invoice matches (non-fatal if it fails).
    if (matches.length) {
      try { await posApi.recordMpesaMatch(oid, matches) }
      catch (e) { toast.add({ severity: 'warn', summary: 'M-Pesa match not saved', detail: e.response?.data?.error ?? e.message, life: 5000 }) }
    }
    completedOrderNo.value = orderNo.value
    successEtims.value     = confirmRes?.etims  ?? null
    successPrinted.value   = confirmRes?.printed === true
    successVisible.value   = true
  } catch (e) {
    payError.value = e.response?.data?.error ?? e.message
    checkoutVisible.value = true
  } finally {
    paying.value = false
  }
}

function newOrderAfterSuccess() {
  successVisible.value  = false
  lines.value           = []
  orderId.value         = null
  orderNo.value         = ''
  selectedContact.value = null
  syncDraftFromContact(null)
  // Re-default to walk-in for next sale
  const walkIn = allContacts.value.find(c => c.IsWalkIn)
  if (walkIn) {
    selectedContact.value = walkIn
    syncDraftFromContact(walkIn)
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function round(v) { return Math.round(v * 10000) / 10000 }
function fmt(v) {
  return Number(v || 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 })
}
function payTypeIcon(cls) {
  const map = { Cash: 'pi pi-money-bill', Card: 'pi pi-credit-card', Mobile: 'pi pi-mobile', Credit: 'pi pi-bookmark', BankTransfer: 'pi pi-building' }
  return map[cls] ?? 'pi pi-wallet'
}
function remainingClass(qty) {
  const n = Number(qty || 0)
  if (n <= 0) return 'remaining-out'
  if (n <= 5) return 'remaining-low'
  return 'remaining-ok'
}
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────── */
.pos-root {
  display: flex;
  height: calc(100vh - 56px);
  overflow: hidden;
  background: #e9ecef;
  gap: 0;
}

/* ── Catalogue ───────────────────────────────────────────── */
.pos-catalogue {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f4f6f8;
  border-right: 2px solid #d0d5dd;
}

.catalogue-search {
  padding: 10px 12px 6px;
  background: #fff;
  border-bottom: 1px solid #d0d5dd;
}

.category-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #d0d5dd;
}
.category-tabs::-webkit-scrollbar { height: 3px; }
.category-tabs::-webkit-scrollbar-thumb { background: #c0c7d0; border-radius: 2px; }

.cat-tab {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1.5px solid #c0c7d0;
  background: #f4f6f8;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.cat-tab:hover {
  background: #e0e7ef;
  border-color: #2563eb;
  color: #1d4ed8;
}
.cat-tab.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
  font-weight: 700;
}

.item-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  padding: 14px;
  align-content: start;
}

.item-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 10px 12px;
  border: 2px solid #d0d5dd;
  border-radius: 10px;
  background: #ffffff;
  color: #111827;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  text-align: center;
}
.item-card:hover {
  border-color: #2563eb;
  box-shadow: 0 4px 12px rgba(37,99,235,0.18);
  transform: translateY(-2px);
}
.item-card:active { transform: scale(0.97); }

.item-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #e8edf5;
  overflow: hidden;
}
.item-icon img { width: 52px; height: 52px; object-fit: cover; }
.item-icon .pi { font-size: 24px; color: #4b6cb7; }

.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
  word-break: break-word;
}
.item-price-row { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.item-base-strike {
  font-size: 11px; color: #9ca3af; text-decoration: line-through; font-weight: 500;
}
.item-price {
  font-size: 14px;
  font-weight: 800;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 6px;
  padding: 2px 10px;
}
.item-price.is-offer { color: #15803d; background: #dcfce7; }
.item-offer-tag {
  font-size: 10px; font-weight: 700; color: #15803d;
  background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px;
  padding: 1px 6px; margin-top: 2px;
}

.item-card-wrap { position: relative; }

/* On-hand "Remaining" pill on each item card */
.item-remaining {
  display:inline-flex; align-items:center; gap:4px;
  margin-top:6px; padding:2px 8px;
  border-radius:10px; font-size:11px; font-weight:600;
}
.item-remaining .pi { font-size:11px; }
.remaining-ok   { background:#dcfce7; color:#166534; }
.remaining-low  { background:#fef3c7; color:#92400e; }
.remaining-out  { background:#fee2e2; color:#991b1b; }
.fav-star {
  position: absolute; top: 4px; right: 4px;
  width: 24px; height: 24px;
  border: none; background: rgba(255,255,255,0.85);
  border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #d1d5db; transition: color 0.15s, transform 0.1s;
}
.fav-star:hover { color: #f59e0b; transform: scale(1.1); }
.fav-star.on    { color: #f59e0b; }
.fav-star .pi   { font-size: 12px; }

.admin-shop-picker { margin-top: 4px; }
.admin-shop-picker :deep(.p-select) { min-width: 140px; max-width: 200px; font-size: 12px; }

.confirm-btn { font-size: 14px; padding: 10px; }

.pt-name { font-size: 12px; font-weight: 600; }
.pt-tile-desc {
  font-size: 10px; color: #6b7280; line-height: 1.2;
  text-align: center; word-break: break-word;
}
.pt-btn.selected .pt-tile-desc { color: #dbeafe; }

.pt-description-box {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; background: #eff6ff;
  border: 1px solid #bfdbfe; border-radius: 6px;
  margin-top: 8px;
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

/* M-Pesa amount lookup */
.mpesa-lookup { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.mpesa-lookup > label { font-size: 12px; font-weight: 600; color: #475467; }
.mpesa-hint { font-size: 11px; color: #98a2b3; }
.mpesa-msg { font-size: 12px; color: #b45309; }
.mpesa-table { margin: 4px 0; font-size: 12px; }
.mpesa-table :deep(.p-datatable-tbody > tr > td) { padding: 5px 8px; }
.mpesa-matched { margin: 6px 0; border: 1px solid #e4e7ec; border-radius: 8px; padding: 6px 10px; }
.mpesa-matched .mm-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
.mpesa-matched .mm-total { display: flex; justify-content: space-between; border-top: 1px dashed #e4e7ec;
  margin-top: 4px; padding-top: 4px; font-size: 13px; color: #15803d; }
.mpesa-matched .mm-total.short { color: #b45309; }

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #6b7280;
}
.empty-state .pi { font-size: 38px; color: #9ca3af; }

/* ── Customer selector ───────────────────────────────────── */
.order-customer {
  padding: 8px 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #d0d5dd;
  position: relative;
}

/* Editable customer details card */
.customer-details {
  margin-top: 8px;
  padding: 8px 10px;
  background: #fff;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cd-name { display: flex; align-items: center; gap: 8px; }
.cd-row  { display: flex; gap: 6px; }
.cd-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 0 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.cd-name { padding-bottom: 2px; }
.cd-icon { font-size: 12px; color: #6b7280; flex-shrink: 0; }
.cd-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 6px 0;
  font-size: 12px;
  color: #111827;
}
.cd-input::placeholder { color: #9ca3af; }
.cd-name-input { font-weight: 600; font-size: 13px; }

/* Selected contact card (legacy — kept in case it's referenced elsewhere) */
.customer-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 8px;
}
.customer-avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: #dbeafe;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.customer-avatar .pi { font-size: 16px; color: #2563eb; }
.customer-info { flex: 1; min-width: 0; }
.customer-name { font-size: 13px; font-weight: 700; color: #111827; }
.customer-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.meta-item { font-size: 11px; color: #374151; display: flex; align-items: center; gap: 3px; }
.meta-item .pi { font-size: 10px; color: #6b7280; }
.meta-pin { color: #1d4ed8; font-weight: 600; }
.customer-clear {
  background: none; border: none; cursor: pointer;
  color: #9ca3af; padding: 4px; border-radius: 4px;
  transition: color 0.12s, background 0.12s;
}
.customer-clear:hover { color: #ef4444; background: #fee2e2; }

/* Search input */
.customer-search-wrap { position: relative; }
.customer-search-input {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  padding: 0 10px;
  gap: 8px;
  transition: border-color 0.15s;
}
.customer-search-input:focus-within { border-color: #2563eb; }
.search-icon { font-size: 13px; color: #9ca3af; flex-shrink: 0; }
.contact-input {
  flex: 1; border: none; outline: none;
  font-size: 13px; color: #111827;
  background: transparent; padding: 8px 0;
}
.contact-input::placeholder { color: #9ca3af; }
.search-clear {
  background: none; border: none; cursor: pointer;
  color: #9ca3af; padding: 2px; font-size: 12px;
}
.search-clear:hover { color: #374151; }

/* Dropdown */
.contact-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: #fff;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 100;
  max-height: 220px;
  overflow-y: auto;
}
.contact-option {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.1s;
}
.contact-option:last-child { border-bottom: none; }
.contact-option:hover, .contact-option.highlighted { background: #eff6ff; }
.co-name { font-size: 13px; font-weight: 600; color: #111827; }
.co-details { font-size: 11px; color: #6b7280; display: flex; gap: 10px; margin-top: 1px; }
.co-pin { color: #2563eb; font-weight: 600; }
.co-empty { padding: 10px 12px; font-size: 13px; color: #9ca3af; text-align: center; }

/* ── Order panel ─────────────────────────────────────────── */
.pos-order-panel {
  width: 330px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-left: 2px solid #d0d5dd;
}

.order-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px 10px;
  background: #1e3a5f;
  color: #fff;
}
.order-header-left { display: flex; flex-direction: column; flex: 1; gap: 2px; }
.order-title { font-weight: 700; font-size: 15px; color: #fff; }
.order-shop-badge {
  font-size: 11px;
  font-weight: 600;
  color: #bfdbfe;
  background: rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 1px 8px;
  display: inline-block;
  width: fit-content;
}
.order-no { font-size: 11px; color: #93c5fd; }

.order-lines {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  background: #f9fafb;
}

.order-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 140px;
  gap: 8px;
  color: #9ca3af;
  font-size: 13px;
}
.order-empty .pi { font-size: 32px; color: #d1d5db; }

.order-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

.line-info { flex: 1; min-width: 0; }
.line-desc {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.line-unit-price { font-size: 11px; color: #6b7280; margin-top: 1px; }

.line-qty-ctrl { display: flex; align-items: center; gap: 4px; }
.qty-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid #d1d5db;
  background: #f3f4f6;
  color: #374151;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  transition: background 0.12s, border-color 0.12s;
}
.qty-btn:hover { background: #dbeafe; border-color: #2563eb; color: #1d4ed8; }
.qty-val { min-width: 22px; text-align: center; font-weight: 700; font-size: 14px; color: #111827; }
.qty-input {
  width: 56px;
  height: 26px;
  text-align: center;
  font-weight: 700;
  font-size: 13px;
  color: #111827;
  border: 1.5px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 0 4px;
  outline: none;
}
.qty-input:focus { border-color: #2563eb; }
.qty-input::-webkit-inner-spin-button { display: none; }
.qty-input { -moz-appearance: textfield; }

.line-amount {
  font-size: 13px;
  font-weight: 700;
  color: #1e3a5f;
  min-width: 64px;
  text-align: right;
}
.line-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 3px;
  font-size: 13px;
  border-radius: 4px;
  transition: color 0.12s, background 0.12s;
}
.line-remove:hover { color: #ef4444; background: #fee2e2; }

.order-footer {
  padding: 12px 14px;
  border-top: 2px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.order-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}
.order-total {
  font-size: 22px;
  font-weight: 900;
  color: #1d4ed8;
}
.checkout-btn { font-size: 15px; font-weight: 700; padding: 12px; }

/* ── Checkout dialog ─────────────────────────────────────── */
.checkout-form { display: flex; flex-direction: column; gap: 16px; }

.checkout-total-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #eff6ff;
  border: 1.5px solid #bfdbfe;
  border-radius: 10px;
  padding: 14px 18px;
}
.co-label { font-size: 13px; color: #374151; font-weight: 500; }
.co-amount { font-size: 24px; font-weight: 900; color: #1d4ed8; }

/* Checkout customer summary */
.checkout-customer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 8px;
}
.co-icon { font-size: 20px; color: #16a34a; }
.co-detail { flex: 1; }
.co-cname { font-size: 14px; font-weight: 700; color: #111827; }
.co-csub { font-size: 12px; color: #374151; display: flex; gap: 10px; margin-top: 2px; }
.co-kra { color: #1d4ed8; font-weight: 600; }

.use-contact-phone {
  font-size: 12px;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
  margin-top: 2px;
  align-self: flex-start;
}
.use-contact-phone:hover { color: #1d4ed8; }

.form-row { display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 13px; font-weight: 600; color: #374151; }

.payment-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
.pt-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 2px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  color: #374151;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.pt-btn .pi { font-size: 20px; color: #6b7280; }
.pt-btn:hover {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}
.pt-btn:hover .pi { color: #2563eb; }
.pt-btn.selected {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
}
.pt-btn.selected .pi { color: #fff; }

.change-display {
  font-size: 20px;
  font-weight: 800;
  color: #15803d;
  padding: 4px 0;
}
.change-display.negative { color: #dc2626; }

.pay-error {
  color: #dc2626;
  font-size: 13px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}

/* Split-tender list inside the checkout dialog */
.split-tenders {
  border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; background:#f9fafb;
}
.split-head { display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; }
.split-row {
  display:flex; align-items:center; gap:8px;
  padding:4px 6px; border-top:1px solid #f3f4f6; font-size:13px;
}
.split-row:first-of-type { border-top:none; }
.num.pos { color:#15803d; }
.num.neg { color:#b91c1c; }

.payment-summary {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f9fafb;
}
.payment-summary-head,
.payment-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  line-height: 1.5;
}
.payment-summary-row small { color: #6b7280; }
.payment-summary-row.change {
  border-top: 1px dashed #cbd5e1;
  margin-top: 6px;
  padding-top: 6px;
  color: #15803d;
}

/* ── Success dialog ──────────────────────────────────────── */
.success-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  text-align: center;
  color: #111827;
}
.success-icon { font-size: 52px; color: #16a34a; }
.change-note { color: #15803d; font-size: 14px; font-weight: 600; }

.etims-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #eff6ff;
  border: 1.5px solid #bfdbfe;
  border-radius: 8px;
  margin-top: 6px;
  text-align: left;
}
.etims-block.etims-warn {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.etims-row { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #1d4ed8; font-size: 13px; }
.etims-icon { font-size: 16px; }
.etims-detail { font-size: 12px; color: #374151; font-family: monospace; }

.print-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-top: 4px;
  color: #374151;
}
.print-status .pi { font-size: 14px; }
.print-status .print-ok { color: #16a34a; }
.print-status .print-fail { color: #dc2626; }

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 640px) {
  .pos-root { flex-direction: column; height: auto; }
  .pos-order-panel { width: 100%; max-height: 48vh; border-left: none; border-top: 2px solid #d0d5dd; }
}
</style>
