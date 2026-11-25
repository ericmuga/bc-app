<template>
  <div class="yield-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Portioning</h2>
        <p class="text-muted text-sm">Request stock (synced to Business Central, received here), portion it, then account for it on a dated stock sheet — sales, write-offs and the final count, with the unaccounted balance as the variance.</p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" class="mb-3">{{ error }}</Message>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="requests">1 · Stock Request</Tab>
        <Tab value="portionings">2 · Portioning</Tab>
        <Tab value="sheet">3 · Stock Sheet</Tab>
        <Tab value="report">4 · Yield Report</Tab>
      </TabList>

      <TabPanels>
        <!-- ── Stock requests: same flow as POS → Stock Requests (approve pushes to BC, receive posts stock) -->
        <TabPanel value="requests">
          <StockRequestsPage class="embedded-requests" show-filters />
        </TabPanel>

        <!-- ── Portionings ──────────────────────────────────────────────── -->
        <TabPanel value="portionings">
          <div class="panel-actions">
            <Button v-if="canManage" label="New Portioning" icon="pi pi-plus" @click="newPortioning" />
            <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadPortionings" :loading="loading.portionings" />
            <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="openExport('portionings')" />
            <span v-if="!canManage" class="text-muted text-sm" style="margin-left:auto">Read-only — only Shop Admins can portion.</span>
          </div>
          <DataTable :value="portionings" dataKey="PortioningId" size="small"
                     responsive-layout="scroll">
            <Column field="PortioningNo"        header="No"            style="width:160px" />
            <Column field="PortioningDate"      header="Date"          style="width:110px">
              <template #body="{ data }">{{ fmtDate(data.PortioningDate) }}</template>
            </Column>
            <Column field="SourceDescription"   header="Source Item"   style="min-width:180px" />
            <Column header="Source Qty" style="width:110px;text-align:right">
              <template #body="{ data }">{{ n(data.SourceQuantity) }} {{ data.SourceUom }}</template>
            </Column>
            <Column header="Source Cost" style="width:120px;text-align:right">
              <template #body="{ data }">{{ n(data.SourceTotalCost) }}</template>
            </Column>
            <Column field="ShopCode"            header="Shop"          style="width:90px" />
            <Column field="LineCount"           header="Portions"      style="width:80px;text-align:right" />
            <Column field="Status" header="Status" style="width:100px">
              <template #body="{ data }"><Tag :value="data.Status" :severity="data.Status === 'posted' ? 'success' : 'info'" /></template>
            </Column>
            <Column header="" style="width:90px">
              <template #body="{ data }">
                <Button :icon="data.Status === 'posted' ? 'pi pi-eye' : 'pi pi-pencil'"
                        :label="data.Status === 'posted' ? 'View' : 'Edit'"
                        size="small" text @click="openPortioning({ data })" />
              </template>
            </Column>
          </DataTable>
        </TabPanel>

        <!-- ── Stock sheet: sales, write-offs, final count → variance (+ upload by date) -->
        <TabPanel value="sheet">
          <PortionStockSheet :can-manage="canManage" :catalogue="catalogueItems" />
        </TabPanel>

        <!-- ── Yield report ─────────────────────────────────────────────── -->
        <TabPanel value="report">
          <PortioningReport v-if="tab === 'report' || reportOpened" :catalogue="catalogueItems" :is-manager="canManage" />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Portioning editor — Input → Output cards with gain/loss footer -->
    <Dialog v-model:visible="portioningEditor.visible" :header="portioningEditor.title"
            :modal="true" :style="{ width: '880px' }">
      <div v-if="portioningEditor.data" class="editor port-editor">
        <div class="editor-meta">
          <span><strong>{{ portioningEditor.data.portioningNo }}</strong> · {{ fmtDate(portioningEditor.data.portioningDate) }} · {{ portioningEditor.data.shopCode }}</span>
          <Tag :value="portioningEditor.data.status" :severity="portioningEditor.data.status === 'posted' ? 'success' : 'info'" />
        </div>

        <!-- INPUT card -->
        <div class="io-card io-input">
          <div class="io-head"><i class="pi pi-arrow-right-arrow-left" /> Input Item</div>
          <table class="io-table">
            <thead>
              <tr>
                <th>Item No</th><th>Description</th>
                <th class="num-col">Qty</th><th>UoM</th>
                <th class="num-col">Unit Cost</th><th class="num-col">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ portioningEditor.data.sourceItemNo || '—' }}</td>
                <td>{{ portioningEditor.data.sourceDescription || '—' }}</td>
                <td class="num-col">{{ n(portioningEditor.data.sourceQuantity) }}</td>
                <td>{{ portioningEditor.data.sourceUom || 'KG' }}</td>
                <td class="num-col">{{ n(portioningEditor.data.sourceUnitCost) }}</td>
                <td class="num-col"><strong>{{ n(portioningEditor.data.sourceTotalCost) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- OUTPUT card -->
        <div class="io-card io-output">
          <div class="io-head">
            <i class="pi pi-list" /> Output Items
            <span v-if="!isPostedPort && canManage" class="io-head-actions">
              <Button label="Reload prices from item list" icon="pi pi-refresh" text size="small" @click="reloadPortPrices" />
            </span>
          </div>

          <!-- Portion item picker + manual Add Line -->
          <div v-if="!isPostedPort && canManage" class="line-add-row">
            <div class="line-add">
              <input v-model="portItemQuery" type="text" class="line-add-input"
                     :placeholder="catalogueItems.length ? `Search portion item — Enter to add` : 'Loading items…'"
                     @input="filterCataloguePort"
                     @focus="showPortDrop=true"
                     @blur="setTimeout(()=>showPortDrop=false,150)"
                     @keydown.enter.prevent="addFirstPortSuggestion" />
              <div v-if="showPortDrop && portItemSuggestions.length" class="line-add-drop">
                <div v-for="it in portItemSuggestions" :key="it.itemNo" class="line-add-opt"
                     @mousedown.prevent="addPortLineFromItem(it)">
                  <span class="line-add-name">{{ it.description }}</span>
                  <span class="line-add-no">{{ it.itemNo }} · {{ fmtPrice(it.unitPrice) }} · {{ it.unitOfMeasure || 'KG' }}</span>
                </div>
              </div>
              <div v-if="showPortDrop && portItemQuery && !portItemSuggestions.length" class="line-add-drop">
                <div class="co-empty">No matching item — use "Add blank line" to type one in.</div>
              </div>
            </div>
            <Button label="Add blank line" icon="pi pi-plus" size="small" @click="addBlankPortLine" />
          </div>

          <table class="io-table">
            <thead>
              <tr>
                <th>Item No</th><th>Description</th>
                <th class="num-col">Qty</th><th>UoM</th>
                <th class="num-col">Unit Cost</th><th class="num-col">Total Cost</th>
                <th v-if="!isPostedPort && canManage" style="width:36px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ln, idx) in portioningEditor.data.lines" :key="idx">
                <td>
                  <InputText v-if="!isPostedPort && canManage" v-model="ln.itemNo" placeholder="Item No" fluid @change="onPortLineItemNoChange(ln)" />
                  <span v-else>{{ ln.itemNo }}</span>
                </td>
                <td>
                  <InputText v-if="!isPostedPort && canManage" v-model="ln.description" placeholder="Description" fluid />
                  <span v-else>{{ ln.description }}</span>
                </td>
                <td class="num-col">
                  <InputNumber v-if="!isPostedPort && canManage" v-model="ln.quantity" :minFractionDigits="2" mode="decimal" fluid
                               @input="recalcPortLineCost(ln)" @blur="recalcPortLineCost(ln)" />
                  <span v-else>{{ n(ln.quantity) }}</span>
                </td>
                <td>
                  <InputText v-if="!isPostedPort && canManage" v-model="ln.unitOfMeasure" fluid />
                  <span v-else>{{ ln.unitOfMeasure || 'KG' }}</span>
                </td>
                <td class="num-col">
                  <InputNumber v-if="!isPostedPort && canManage" v-model="ln.unitPrice" :minFractionDigits="2" mode="decimal" fluid
                               @input="recalcPortLineCost(ln)" @blur="recalcPortLineCost(ln)" />
                  <span v-else>{{ n(ln.unitPrice ?? (ln.quantity > 0 ? ln.allocatedCost / ln.quantity : 0)) }}</span>
                </td>
                <td class="num-col">
                  <strong>{{ n(Number(ln.quantity || 0) * Number(ln.unitPrice || 0)) }}</strong>
                </td>
                <td v-if="!isPostedPort && canManage">
                  <Button icon="pi pi-times" text severity="danger" size="small" @click="portioningEditor.data.lines.splice(idx, 1)" />
                </td>
              </tr>
              <tr v-if="!portioningEditor.data.lines.length">
                <td colspan="7" class="empty-row">No portions yet — search for items above or add a blank line.</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><strong>Total Output</strong></td>
                <td class="num-col"><strong>{{ n(portionQty) }}</strong></td>
                <td>{{ portioningEditor.data.sourceUom || 'KG' }}</td>
                <td></td>
                <td class="num-col"><strong>{{ n(portionTotal) }}</strong></td>
                <td v-if="!isPostedPort && canManage"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- GAIN / LOSS footer -->
        <div class="gainloss-grid">
          <div class="gl-cell" :class="lossQty > 0 ? 'gl-loss' : (lossQty < 0 ? 'gl-gain' : 'gl-flat')">
            <span class="gl-label">{{ lossQty > 0 ? 'Yield Loss (qty)' : (lossQty < 0 ? 'Yield Gain (qty)' : 'Yield Variance (qty)') }}</span>
            <strong>{{ n(Math.abs(lossQty)) }} {{ portioningEditor.data.sourceUom || 'KG' }}</strong>
          </div>
          <div class="gl-cell" :class="lossValue > 0 ? 'gl-loss' : (lossValue < 0 ? 'gl-gain' : 'gl-flat')">
            <span class="gl-label">{{ lossValue > 0 ? 'Yield Loss (value)' : (lossValue < 0 ? 'Yield Gain (value)' : 'Yield Variance (value)') }}</span>
            <strong>{{ n(Math.abs(lossValue)) }}</strong>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Close" text @click="portioningEditor.visible = false" />
        <Button v-if="!isPostedPort && canManage" label="Save Draft" icon="pi pi-save" text :loading="saving" @click="savePortLines" />
        <Button v-if="!isPostedPort && canManage" label="Save & Post" icon="pi pi-send" severity="success"
                :disabled="!portioningEditor.data?.lines.length" :loading="saving" @click="postPort" />
      </template>
    </Dialog>

    <!-- New portioning dialog -->
    <Dialog v-model:visible="newPortDlg" header="New Portioning" :modal="true" :style="{ width: '560px' }">
      <p class="text-muted text-sm" style="margin-top:0">Pick the received stock you are cutting. Source qty + cost are captured at creation.</p>
      <div class="form-row">
        <label>Date</label>
        <DatePicker v-model="newPort.portioningDate" date-format="yy-mm-dd" fluid />
      </div>
      <div class="form-row">
        <label>Source (received stock)</label>
        <Select v-model="newPort.sourceKey" :options="sourceLineOpts" option-label="label" option-value="value" filter fluid
                :loading="loadingSources" placeholder="Select a received line…" @change="onSourcePicked" />
        <div v-if="!loadingSources && !sourceLineOpts.length" class="text-muted text-sm">
          Nothing received to portion yet — raise and receive a Stock Request first.
        </div>
      </div>
      <div v-if="pickedSource" class="form-row">
        <label>Quantity to portion ({{ pickedSource.uom }}) — {{ n(pickedSource.remainingQty) }} available</label>
        <InputNumber v-model="newPort.sourceQuantity" :min-fraction-digits="2" :max="pickedSource.remainingQty" mode="decimal" fluid />
      </div>
      <div class="form-row">
        <label>Notes</label>
        <InputText v-model="newPort.notes" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="newPortDlg = false" />
        <Button label="Create" icon="pi pi-check" :loading="saving" :disabled="!newPort.sourceKey" @click="createPort" />
      </template>
    </Dialog>

    <!-- Export to Excel (CSV) -->
    <Dialog v-model:visible="exportDlg.visible" :header="`Export ${exportDlg.kind} to Excel`"
            :modal="true" :style="{ width: '480px' }">
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label>From</label><DatePicker v-model="exportDlg.dateFrom" date-format="yy-mm-dd" fluid /></div>
        <div><label>To</label>  <DatePicker v-model="exportDlg.dateTo"   date-format="yy-mm-dd" fluid /></div>
      </div>
      <div class="form-row"><label>Item No (exact)</label><InputText v-model="exportDlg.itemNo" placeholder="optional" fluid /></div>
      <div class="form-row"><label>Search</label>        <InputText v-model="exportDlg.q"      placeholder="item no or description" fluid /></div>
      <p class="text-muted text-sm" style="margin-top:6px">Output is CSV (UTF-8 with BOM) — opens directly in Excel. Header and line columns are combined per row for analysis.</p>
      <template #footer>
        <Button label="Cancel" text @click="exportDlg.visible = false" />
        <Button label="Download" icon="pi pi-download" @click="runExport" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import Tabs       from 'primevue/tabs'
import TabList    from 'primevue/tablist'
import Tab        from 'primevue/tab'
import TabPanels  from 'primevue/tabpanels'
import TabPanel   from 'primevue/tabpanel'
import Button     from 'primevue/button'
import DataTable  from 'primevue/datatable'
import Column     from 'primevue/column'
import Tag        from 'primevue/tag'
import Dialog     from 'primevue/dialog'
import Message    from 'primevue/message'
import InputText  from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select     from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import StockRequestsPage from '@/pages/StockRequestsPage.vue'
import PortionStockSheet from '@/components/portioning/PortionStockSheet.vue'
import PortioningReport  from '@/components/portioning/PortioningReport.vue'
import { yieldApi, posApi } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'
import { canManagePos } from '@/lib/posAccess.js'

const auth = useAuthStore()
const canManage = computed(() => canManagePos(auth.user?.role))

const tab = ref('requests')
const reportOpened = ref(false)
const error  = ref('')
const saving = ref(false)
const loading = reactive({ portionings: false })

const portionings   = ref([])

const today = new Date()
const yearStart = new Date(today.getFullYear(), 0, 1)

const newPortDlg = ref(false)
const newPort    = reactive({ portioningDate: today, sourceKey: null, sourceQuantity: null, notes: '' })
const sources        = ref([])
const loadingSources = ref(false)
const sourceLineOpts = computed(() => sources.value.map(s => ({
  label: `${s.docNo} · ${s.description} — ${n(s.remainingQty)} of ${n(s.quantity)} ${s.uom} left${s.kind === 'transfer' ? ' (legacy transfer)' : ''}`,
  value: `${s.kind}:${s.id}`,
})))
const pickedSource = computed(() => sources.value.find(s => `${s.kind}:${s.id}` === newPort.sourceKey) || null)
function onSourcePicked() { newPort.sourceQuantity = pickedSource.value?.remainingQty ?? null }

// Export modal — applies to whichever tab triggered it
const exportDlg = reactive({ visible: false, kind: '', dateFrom: yearStart, dateTo: today, itemNo: '', q: '' })
function openExport(kind) {
  exportDlg.kind = kind
  exportDlg.dateFrom = yearStart
  exportDlg.dateTo   = today
  exportDlg.itemNo   = ''
  exportDlg.q        = ''
  exportDlg.visible  = true
}
async function runExport() {
  const params = {
    dateFrom: isoDate(exportDlg.dateFrom),
    dateTo:   isoDate(exportDlg.dateTo),
  }
  if (exportDlg.itemNo) params.itemNo = exportDlg.itemNo
  if (exportDlg.q)      params.q      = exportDlg.q
  try {
    const res = await yieldApi.exportCsv(exportDlg.kind, params)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `yield-${exportDlg.kind}-${params.dateFrom || ''}_${params.dateTo || ''}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportDlg.visible = false
  } catch (e) {
    error.value = e.response?.data?.error ?? e.message
  }
}

const portioningEditor = reactive({ visible: false, title: '', data: null })

// Catalogue (flat list of PosItems) — used to auto-fill portion lines, the stock sheet and report filters
const catalogueItems   = ref([])
const portItemQuery    = ref('')
const portItemSuggestions = ref([])
const showPortDrop     = ref(false)

async function loadCatalogue() {
  try {
    const { data } = await posApi.getItems()
    catalogueItems.value = data.flatMap(c => c.items)
  } catch {}
}

function filterCataloguePort() {
  const q = portItemQuery.value.trim().toLowerCase()
  if (!q) { portItemSuggestions.value = []; return }
  portItemSuggestions.value = catalogueItems.value
    .filter(i => i.description.toLowerCase().includes(q) || i.itemNo.toLowerCase().includes(q))
    .slice(0, 8)
}
function addFirstPortSuggestion() {
  if (portItemSuggestions.value.length) addPortLineFromItem(portItemSuggestions.value[0])
}
function addPortLineFromItem(it) {
  const existing = portioningEditor.data.lines.find(l => l.itemNo === it.itemNo)
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + 1
    existing.unitPrice = Number(it.unitPrice || existing.unitPrice || 0)
    recalcPortLineCost(existing)
  } else {
    const ln = {
      lineId: null,
      itemNo: it.itemNo,
      description: it.description,
      quantity: 1,
      unitOfMeasure: it.unitOfMeasure || 'KG',
      unitPrice: Number(it.unitPrice || 0),
      allocatedCost: 0,
    }
    recalcPortLineCost(ln)
    portioningEditor.data.lines.push(ln)
  }
  portItemQuery.value = ''
  portItemSuggestions.value = []
  showPortDrop.value = false
}

function addBlankPortLine() {
  if (!portioningEditor.data) return
  portioningEditor.data.lines.push({
    lineId: null, itemNo: '', description: '', quantity: 1,
    unitOfMeasure: 'KG', unitPrice: 0, allocatedCost: 0,
  })
}

function fmtPrice(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }

const isPostedPort = computed(() => portioningEditor.data?.status === 'posted')

const portionQty    = computed(() => (portioningEditor.data?.lines ?? []).reduce((s, l) => s + Number(l.quantity || 0), 0))
const portionTotal  = computed(() => (portioningEditor.data?.lines ?? []).reduce((s, l) => s + Number(l.allocatedCost || 0), 0))
const portionVariance = computed(() => Number(portioningEditor.data?.sourceTotalCost || 0) - portionTotal.value)
// loss = source − output (positive = lost, negative = gained)
const lossQty       = computed(() => Number(portioningEditor.data?.sourceQuantity   || 0) - portionQty.value)
const lossValue     = computed(() => Number(portioningEditor.data?.sourceTotalCost || 0) - portionTotal.value)

async function loadAll() {
  await Promise.all([loadPortionings(), loadCatalogue()])
}
async function loadPortionings() {
  loading.portionings = true
  try { portionings.value = (await yieldApi.listPortionings()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.portionings = false }
}

async function newPortioning() {
  Object.assign(newPort, { portioningDate: today, sourceKey: null, sourceQuantity: null, notes: '' })
  newPortDlg.value = true
  loadingSources.value = true
  try { sources.value = (await yieldApi.portioningSources()).data.filter(s => s.remainingQty > 0) }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loadingSources.value = false }
}
async function createPort() {
  const s = pickedSource.value
  if (!s) return
  saving.value = true
  try {
    const { data } = await yieldApi.createPortioning({
      portioningDate:       isoDate(newPort.portioningDate),
      sourceRequestLineId:  s.kind === 'request'  ? s.id : null,
      sourceTransferLineId: s.kind === 'transfer' ? s.id : null,
      sourceQuantity:       s.kind === 'request'  ? newPort.sourceQuantity : null,
      notes:                newPort.notes,
    })
    newPortDlg.value = false
    await loadPortionings()
    await openPortioning({ data: { PortioningId: data.PortioningId || data.portioningId } })
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

async function openPortioning(e) {
  const id = e.data.PortioningId
  try {
    const { data } = await yieldApi.getPortioning(id)
    // Derive unitPrice for each line: prefer the live catalogue price; fall back to allocatedCost/qty.
    for (const ln of (data.lines || [])) {
      const fromCat = priceFor(ln.itemNo)
      const fromCost = Number(ln.quantity) > 0 ? Number(ln.allocatedCost || 0) / Number(ln.quantity) : 0
      ln.unitPrice = fromCat > 0 ? fromCat : Math.round(fromCost * 100) / 100
      // Recompute cost to stay consistent with unitPrice × quantity going forward.
      recalcPortLineCost(ln)
    }
    portioningEditor.data    = data
    portioningEditor.title   = `Portioning ${data.portioningNo}`
    portioningEditor.visible = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}
// Output cost is unit price (from item card / shop price list) × quantity weighed.
function recalcPortLineCost(ln) {
  const qty = Number(ln.quantity || 0)
  const up  = Number(ln.unitPrice || 0)
  ln.allocatedCost = Math.round(qty * up * 100) / 100
}
function recalcAllPortLineCosts() {
  if (!portioningEditor.data) return
  for (const ln of portioningEditor.data.lines) recalcPortLineCost(ln)
}
// Look up unit price for an item No against the catalogue (price list).
function priceFor(itemNo) {
  if (!itemNo) return 0
  const it = catalogueItems.value.find(c => c.itemNo === itemNo)
  return Number(it?.unitPrice || 0)
}
function onPortLineItemNoChange(ln) {
  // When the user types an item No on a blank line, auto-fill price and uom from the catalogue.
  const it = catalogueItems.value.find(c => c.itemNo === ln.itemNo)
  if (it) {
    if (!ln.description)   ln.description   = it.description
    if (!ln.unitOfMeasure) ln.unitOfMeasure = it.unitOfMeasure || 'KG'
    if (!ln.unitPrice)     ln.unitPrice     = Number(it.unitPrice || 0)
  }
  recalcPortLineCost(ln)
}
// Re-pull the latest unit price from the catalogue for every output line and recompute totals.
function reloadPortPrices() {
  if (!portioningEditor.data) return
  for (const ln of portioningEditor.data.lines) {
    const live = priceFor(ln.itemNo)
    if (live > 0) ln.unitPrice = live
    recalcPortLineCost(ln)
  }
}
async function savePortLines() {
  recalcAllPortLineCosts()
  saving.value = true
  try {
    await yieldApi.setPortioningLines(portioningEditor.data.portioningId, portioningEditor.data.lines)
    const fresh = (await yieldApi.getPortioning(portioningEditor.data.portioningId)).data
    for (const ln of (fresh.lines || [])) {
      const fromCat = priceFor(ln.itemNo)
      const fromCost = Number(ln.quantity) > 0 ? Number(ln.allocatedCost || 0) / Number(ln.quantity) : 0
      ln.unitPrice = fromCat > 0 ? fromCat : Math.round(fromCost * 100) / 100
      recalcPortLineCost(ln)
    }
    portioningEditor.data = fresh
    await loadPortionings()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}
async function postPort() {
  recalcAllPortLineCosts()
  saving.value = true
  try {
    await yieldApi.setPortioningLines(portioningEditor.data.portioningId, portioningEditor.data.lines)
    await yieldApi.postPortioning(portioningEditor.data.portioningId)
    portioningEditor.data = (await yieldApi.getPortioning(portioningEditor.data.portioningId)).data
    await loadPortionings()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('en-KE') : '' }
function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Mount the report lazily (it runs on open) and keep it alive afterwards
watch(tab, (val) => { if (val === 'report') reportOpened.value = true })

onMounted(loadAll)
</script>

<style scoped>
.yield-page {
  padding: 16px 20px;
  background: #f4f6f8;
  color: #111827;
  color-scheme: light;
  min-height: calc(100vh - 56px);
}
.yield-page :deep(.p-tabs)         { background: #f4f6f8; color: #111827; color-scheme: light; }
.yield-page :deep(.p-tablist)      { background: #ffffff; border-bottom: 1px solid #e5e7eb; }
.yield-page :deep(.p-tab)          { color: #6b7280; }
.yield-page :deep(.p-tab-active)   { color: #1d4ed8; }
.yield-page :deep(.p-tabpanels)    { background: #f4f6f8; padding-top: 14px; }
.yield-page :deep(.p-datatable)    { background: #ffffff; color: #111827; border-radius: 8px; overflow: hidden; }
.yield-page :deep(.p-datatable-thead > tr > th) {
  background: #f3f4f6 !important; color: #111827 !important; border-color: #e5e7eb !important;
}
.yield-page :deep(.p-datatable-tbody > tr) { background: #ffffff !important; }
.yield-page :deep(.p-datatable-tbody > tr > td) {
  background: #ffffff !important; color: #111827 !important; border-color: #f3f4f6 !important;
}
.yield-page :deep(.p-datatable-tbody > tr:hover > td) { background: #e8eef7 !important; color: #102a56 !important; }
.yield-page :deep(.p-inputtext),
.yield-page :deep(.p-inputnumber-input),
.yield-page :deep(.p-select-label),
.yield-page :deep(.p-datepicker-input) {
  background: #ffffff !important; color: #111827 !important;
}
.yield-page :deep(.p-message) { color: #111827 !important; }
.yield-page label { color: #111827; }
.yield-page .text-muted { color: #6b7280 !important; }
.embedded-requests { padding: 0 !important; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; }
.text-sm    { font-size:13px; }
.mb-3       { margin-bottom:12px; }

.panel-actions { display:flex; gap:8px; padding: 8px 0 12px; }
.filters       { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; padding: 8px 0 12px; }
.filter-field  { display:flex; flex-direction:column; gap:4px; min-width:150px; }
.filter-field label { font-size:12px; color:#374151; font-weight:500; }

.editor { display:flex; flex-direction:column; gap:10px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.origin-pill {
  display:inline-flex; align-items:center; gap:6px;
  padding:4px 10px; background:#eff6ff; border:1px solid #bfdbfe;
  color:#1e3a8a; border-radius:14px; font-size:12px; font-weight:500;
}
.origin-pill .pi { font-size:11px; }
.dest-shop { color:#6b7280; font-size:11px; }
.line-add-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.line-add { position:relative; flex:1; }
.co-empty { padding:10px 12px; color:#9ca3af; font-size:12px; text-align:center; }
.line-add-input {
  width:100%; padding:8px 10px; border:1.5px solid #d1d5db; border-radius:6px;
  font-size:13px; outline:none;
}
.line-add-input:focus { border-color:#2563eb; }
.line-add-drop {
  position:absolute; top:100%; left:0; right:0;
  background:#fff; border:1.5px solid #d1d5db; border-radius:6px;
  box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100;
  max-height:240px; overflow-y:auto; margin-top:4px;
}
.line-add-opt {
  display:flex; justify-content:space-between; padding:8px 12px;
  cursor:pointer; border-bottom:1px solid #f3f4f6; font-size:13px;
}
.line-add-opt:hover { background:#eff6ff; }
.line-add-name { font-weight:500; color:#111827; }
.line-add-no   { color:#6b7280; font-size:12px; }
.editor-totals {
  display:flex; gap:18px; padding:8px 12px; background:#f9fafb;
  border-radius:6px; font-size:13px;
}

.transfer-block {
  border:1px solid #d0d5dd; border-radius:8px; margin-bottom:12px;
  background:#fff; padding:10px 14px;
}
.tb-head { display:flex; gap:10px; align-items:center; padding:4px 0 8px; flex-wrap:wrap; font-size:13px; color:#374151; }
.tb-total { margin-left:auto; }

.src-block { padding-top:8px; border-top:1px dashed #e5e7eb; margin-top:6px; }
.src-head  { display:flex; gap:10px; align-items:center; padding:6px 0; font-size:13px; color:#1e3a5f; }
.src-desc  { font-weight:600; }
.src-meta  { color:#6b7280; }
.src-summary {
  display:flex; gap:8px; align-items:center; padding:10px 12px;
  background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:8px;
  font-size:13px; color:#1e3a5f;
}

.totals-row { display:flex; gap:18px; padding:8px 12px; font-size:13px; flex-wrap:wrap; background:#f3f4f6; border-radius:6px; margin-top:6px; }

.stage-card {
  margin-top: 8px; padding: 10px 14px;
  border-radius: 8px; border: 1px solid #d0d5dd;
}
.stage-card.stage-yield { background: #fef9c3; border-color: #fde68a; }
.stage-card.stage-final { background: #eff6ff; border-color: #bfdbfe; }
.stage-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: #1e3a5f; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
}
.stage-card.stage-yield .stage-title { color: #854d0e; }
.stage-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.stage-grid > div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #111827; }
.stage-label { font-size: 11px; color: #4b5563; font-weight: 500; }

/* ── Portioning Input/Output cards ─────────────────────────────── */
.port-editor { display:flex; flex-direction:column; gap:12px; }
.io-card { border-radius:10px; border:1px solid #d0d5dd; overflow:hidden; background:#fff; }
.io-card.io-input  { border-color:#fde68a; background:#fffbeb; }
.io-card.io-output { border-color:#bfdbfe; background:#eff6ff; }
.io-head {
  display:flex; align-items:center; gap:8px;
  padding:8px 14px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;
}
.io-input  .io-head { background:#fef3c7; color:#854d0e; }
.io-output .io-head { background:#dbeafe; color:#1e3a8a; }
.io-head-actions { margin-left:auto; }
.io-table {
  width:100%; border-collapse:collapse; background:#fff; font-size:13px; color:#111827;
}
.io-table th, .io-table td { padding:8px 12px; text-align:left; border-bottom:1px solid #f3f4f6; }
.io-table th { background:#f9fafb; font-weight:600; font-size:12px; color:#374151; }
.io-table .num-col { text-align:right; }
.io-table tfoot td  { background:#f9fafb; font-weight:600; }
.io-table .empty-row { text-align:center; color:#9ca3af; font-style:italic; padding:14px; }
.io-table :deep(.p-inputtext),
.io-table :deep(.p-inputnumber-input) { font-size:12px; padding:4px 6px; }

/* Gain/Loss footer */
.gainloss-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:12px;
}
.gl-cell {
  display:flex; flex-direction:column; gap:2px;
  padding:14px 16px; border-radius:10px; border:2px solid;
}
.gl-cell .gl-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; opacity:0.85; }
.gl-cell strong    { font-size:18px; font-weight:800; }
.gl-cell.gl-loss { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
.gl-cell.gl-gain { background:#f0fdf4; border-color:#86efac; color:#15803d; }
.gl-cell.gl-flat { background:#f3f4f6; border-color:#e5e7eb; color:#374151; }

.summary-block { margin-bottom: 16px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; }
.summary-head { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.summary-foot { display:flex; gap:18px; font-size:12px; padding:6px 0; flex-wrap:wrap; color:#374151; }

.empty-report { padding: 30px; text-align:center; color:#9ca3af; }
.empty-lines  { padding: 12px; text-align:center; color:#9ca3af; font-style: italic; font-size: 13px;
                background: #f9fafb; border-radius: 6px; margin-top: 6px; }

.form-row { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
.form-row label { font-size:12px; font-weight:600; color:#374151; }

.num.pos { color:#15803d; font-weight:600; }
.num.neg { color:#b91c1c; font-weight:600; }

/* ── Force light surface on PrimeVue Dialogs (Chrome dark-mode fix) ── */
:deep(.p-dialog) { color-scheme: light; }
:deep(.p-dialog .p-dialog-header),
:deep(.p-dialog .p-dialog-content),
:deep(.p-dialog .p-dialog-footer) {
  background: #ffffff !important;
  color: #111827 !important;
}
:deep(.p-dialog .p-dialog-header) { border-bottom: 1px solid #e5e7eb; }
:deep(.p-dialog .p-inputtext),
:deep(.p-dialog .p-inputnumber-input),
:deep(.p-dialog .p-select-label),
:deep(.p-dialog .p-textarea),
:deep(.p-dialog .p-datepicker-input),
:deep(.p-dialog input.line-add-input) {
  background: #ffffff !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-thead > tr > th) {
  background: #f3f4f6 !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-tbody > tr) {
  background: #ffffff !important; color: #111827 !important;
}
:deep(.p-dialog .p-datatable-tbody > tr > td) { color: #111827 !important; }
:deep(.p-dialog label),
:deep(.p-dialog h4),
:deep(.p-dialog .text-muted) { color: #111827 !important; }
:deep(.p-dialog .text-muted) { color: #6b7280 !important; }
</style>
