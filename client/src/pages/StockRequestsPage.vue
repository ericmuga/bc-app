<template>
  <div class="stock-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Stock Requests</h2>
        <p class="text-muted text-sm">Request stock from HQ. Completed requests automatically increase shop inventory.</p>
      </div>
      <div style="display:flex;gap:8px">
        <Button label="Stock Reset" icon="pi pi-history" severity="warn" outlined @click="openReset" />
        <Button label="Load from BC" icon="pi pi-download" severity="help" outlined @click="openLoad" />
        <Button label="New Request" icon="pi pi-plus" @click="newRequest" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="load" :loading="loading" />
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <DataTable :value="requests" dataKey="RequestId" size="small" :loading="loading"
      selection-mode="single" @row-click="openRequest" responsive-layout="scroll">
      <Column field="RequestNo"     header="No"         style="width:160px" />
      <Column field="ShopCode"      header="Shop"       style="width:90px" />
      <Column field="RequestedName" header="Requested by" style="min-width:140px" />
      <Column field="LineCount"     header="Lines"      style="width:60px;text-align:right" />
      <Column field="TotalRequested" header="Total Qty" style="width:90px;text-align:right">
        <template #body="{ data }">{{ Number(data.TotalRequested||0).toFixed(2) }}</template>
      </Column>
      <Column field="Status" header="Status" style="width:110px">
        <template #body="{ data }">
          <Tag :value="data.Status" :severity="statusSeverity(data.Status)" />
        </template>
      </Column>
      <Column field="CreatedAt" header="Created" style="min-width:140px">
        <template #body="{ data }">{{ fmtTime(data.CreatedAt) }}</template>
      </Column>
    </DataTable>

    <!-- ── Request editor dialog ─────────────────────────────────── -->
    <Dialog v-model:visible="editorVisible" :header="dialogHeader" :modal="true" :style="{ width: '780px' }">
      <div v-if="current" class="editor">
        <div class="editor-meta">
          <span><strong>{{ current.requestNo }}</strong> · {{ current.shopCode }}</span>
          <Tag :value="current.status" :severity="statusSeverity(current.status)" />
        </div>

        <!-- Item search to add lines (only when editable). All lines share the request's doc number. -->
        <div v-if="editable" class="line-add-row">
          <div class="line-add">
            <input
              ref="searchRef"
              v-model="itemQuery"
              type="text"
              class="line-add-input"
              :placeholder="catalogue.length ? 'Search item — Enter to add (you can keep adding)' : 'Loading items…'"
              @input="filterItems"
              @focus="showDrop=true"
              @blur="setTimeout(()=>showDrop=false,150)"
              @keydown.enter.prevent="addFirstSuggestion"
            />
            <div v-if="showDrop && itemSuggestions.length" class="line-add-drop">
              <div v-for="it in itemSuggestions" :key="it.itemNo" class="line-add-opt"
                   @mousedown.prevent="addItem(it)">
                <span class="line-add-name">{{ it.description }}</span>
                <span class="line-add-no">{{ it.itemNo }}</span>
              </div>
            </div>
            <div v-if="showDrop && itemQuery && !itemSuggestions.length" class="line-add-drop">
              <div class="line-add-opt" style="color:#9ca3af">No matching item — use "Add blank line" to type one in.</div>
            </div>
          </div>
          <Button label="Add blank line" icon="pi pi-plus" size="small" @click="addBlankLine" />
        </div>

        <DataTable :value="current.lines" size="small" class="editor-lines">
          <Column header="Doc No" style="width:130px">
            <template #body>{{ current.requestNo }}</template>
          </Column>
          <Column header="Item No" style="width:200px">
            <template #body="{ data }">
              <AutoComplete v-if="editable"
                :model-value="data._lookup ?? data.itemNo"
                @update:model-value="(v) => onLineModelUpdate(data, v)"
                :suggestions="lineLookup"
                option-label="itemNo"
                :force-selection="false"
                placeholder="Search item No / description"
                size="small"
                fluid
                @complete="(e) => filterLineLookup(e.query)"
                @option-select="(e) => pickLineItem(data, e.value)">
                <template #option="{ option }">
                  <div class="lookup-opt">
                    <strong class="lookup-no">{{ option.itemNo }}</strong>
                    <span class="lookup-desc">{{ option.description }}</span>
                    <span class="lookup-uom text-muted text-sm">{{ option.unitOfMeasure || 'KG' }}</span>
                  </div>
                </template>
              </AutoComplete>
              <span v-else>{{ data.itemNo }}</span>
            </template>
          </Column>
          <Column header="Description" style="min-width:200px">
            <template #body="{ data }">
              <input v-if="editable" v-model="data.description"
                     class="line-text" placeholder="Description (auto-filled from item)" @blur="persistLines" />
              <span v-else>{{ data.description }}</span>
            </template>
          </Column>
          <Column header="UoM" style="width:120px">
            <template #body="{ data }">
              <Select v-if="editable"
                v-model="data.unitOfMeasure"
                :options="uomOptions"
                placeholder="UoM"
                editable
                size="small"
                fluid
                @change="persistLines" />
              <span v-else>{{ data.unitOfMeasure || '' }}</span>
            </template>
          </Column>
          <Column header="Requested" style="width:120px">
            <template #body="{ data }">
              <input v-if="editable" type="number" min="0" step="0.01"
                v-model.number="data.quantityRequested"
                class="line-qty" @blur="persistLines" />
              <span v-else>{{ Number(data.quantityRequested||0).toFixed(2) }}</span>
            </template>
          </Column>
          <Column header="Received" style="width:120px">
            <template #body="{ data }">
              <input v-if="receivable" type="number" min="0" step="0.01"
                v-model.number="data.quantityReceived"
                class="line-qty" :placeholder="String(data.quantityRequested)" />
              <span v-else>{{ data.quantityReceived == null ? '—' : Number(data.quantityReceived).toFixed(2) }}</span>
            </template>
          </Column>
          <Column header="Variance" style="width:90px;text-align:right">
            <template #body="{ data }">
              <span v-if="data.quantityReceived != null"
                    :class="lineVarianceClass(data)">
                {{ ((Number(data.quantityReceived||0) - Number(data.quantityRequested||0))).toFixed(2) }}
              </span>
              <span v-else>—</span>
            </template>
          </Column>
          <Column header="Comment (mismatch)" style="min-width:200px">
            <template #body="{ data }">
              <input v-if="receivable" v-model="data.comments"
                     class="line-text"
                     :placeholder="lineHasVariance(data) ? 'Reason for the variance (required)' : 'Optional note'" />
              <span v-else class="text-muted text-sm">{{ data.comments || '' }}</span>
            </template>
          </Column>
          <Column header="RF No (returns)" style="width:130px">
            <template #body="{ data }">
              <input v-if="receivable" v-model="data.rfNo" class="line-text"
                     :placeholder="lineIsReturn(data) ? 'Return Form no.' : '—'" />
              <span v-else class="text-muted text-sm">{{ data.rfNo || '' }}</span>
            </template>
          </Column>
          <Column header="" style="width:50px">
            <template #body="{ data, index }">
              <Button v-if="editable" icon="pi pi-times" text severity="danger" size="small"
                @click="removeLine(index)" />
            </template>
          </Column>
        </DataTable>

        <div class="editor-meta" v-if="current.notes">
          <span class="text-muted text-sm">Notes: {{ current.notes }}</span>
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="editorVisible=false" />
        <Button v-if="current?.status === 'completed'"
                label="Export BC Adjustment Journal" icon="pi pi-file-excel" severity="secondary"
                :loading="exportingBc" @click="downloadBcJournal" />
        <Button v-if="editable && current?.status === 'open'"
                label="Submit" icon="pi pi-send" severity="info"
                :loading="acting" @click="submitReq" />
        <Button v-if="canApprove"
                label="Approve" icon="pi pi-check" severity="success"
                :loading="acting" @click="approveReq" />
        <Button v-if="receivable"
                label="Mark Received" icon="pi pi-inbox" severity="success"
                :loading="acting" @click="completeReq" />
        <Button v-if="current && current.status !== 'completed' && current.status !== 'cancelled'"
                label="Cancel Request" icon="pi pi-ban" severity="danger" text
                :loading="acting" @click="cancelReq" />
      </template>
    </Dialog>

    <!-- ── Stock Reset dialog ────────────────────────────────────── -->
    <Dialog v-model:visible="resetVisible" header="Stock Reset — load BC on-hand" :modal="true" :style="{ width: '480px' }">
      <Message severity="warn" :closable="false" class="mb-3">
        This clears the terminal's existing stock movements and re-seeds on-hand from
        Business Central's current stock at the terminal's location. The latest BC ledger
        entry is saved as the baseline; future loads continue from there.
      </Message>
      <div class="text-sm" style="display:flex;flex-direction:column;gap:4px">
        <div><strong>Terminal:</strong> {{ watermark?.shopCode || wmShop || '—' }}</div>
        <div v-if="watermark?.watermark"><strong>Current baseline entry:</strong> {{ watermark.watermark.LastEntryNo }}
          <span class="text-muted">(reset {{ fmtTime(watermark.watermark.ResetAt) }})</span></div>
        <div v-else class="text-muted">No baseline yet — this will create one.</div>
      </div>
      <div v-if="!isManager" class="elev-box">
        <p class="text-muted text-sm">Admin authorization required.</p>
        <input v-model="adminUsername" class="elev-input" placeholder="Admin username" autocomplete="off" />
        <input v-model="adminPassword" type="password" class="elev-input" placeholder="Admin password" autocomplete="off" />
      </div>
      <Message v-if="resetError" severity="error" :closable="false" class="mt-2">{{ resetError }}</Message>
      <template #footer>
        <Button label="Cancel" text @click="resetVisible=false" :disabled="resetting" />
        <Button label="Reset to BC on-hand" icon="pi pi-history" severity="warn"
                :loading="resetting" @click="doReset" />
      </template>
    </Dialog>

    <!-- ── Load from BC dialog ───────────────────────────────────── -->
    <Dialog v-model:visible="loadVisible" header="Load fresh stock from BC" :modal="true" :style="{ width: '620px' }">
      <div v-if="watermark?.watermark" class="text-sm mb-2">
        <strong>Baseline entry:</strong> {{ watermark.watermark.LastEntryNo }} ·
        <strong>Location:</strong> {{ watermark.watermark.LocationCode }} ·
        <strong>Company:</strong> {{ watermark.watermark.SourceCompany }}
      </div>
      <Message v-else severity="warn" :closable="false" class="mb-2">
        No baseline set — run Stock Reset first.
      </Message>
      <p class="text-muted text-sm">Pick a date. Everything up to and including the last BC ledger
        entry on that date (net of all movements) is loaded into the terminal.</p>
      <DataTable :value="ledgerDates" dataKey="lastEntryNo" size="small" :loading="loadingDates"
                 selection-mode="single" v-model:selection="selectedDate" responsive-layout="scroll"
                 :scrollable="true" scroll-height="280px" class="mt-2">
        <Column selectionMode="single" style="width:42px" />
        <Column field="postingDate" header="Date" style="min-width:110px">
          <template #body="{ data }">{{ fmtDate(data.postingDate) }}</template>
        </Column>
        <Column field="lastEntryNo" header="Last Entry #" style="width:110px;text-align:right" />
        <Column field="entries" header="Entries" style="width:80px;text-align:right" />
        <Column field="netQty" header="Net Qty" style="width:90px;text-align:right">
          <template #body="{ data }">{{ Number(data.netQty||0).toFixed(2) }}</template>
        </Column>
      </DataTable>
      <div v-if="!isManager" class="elev-box">
        <p class="text-muted text-sm">Admin authorization required.</p>
        <input v-model="adminUsername" class="elev-input" placeholder="Admin username" autocomplete="off" />
        <input v-model="adminPassword" type="password" class="elev-input" placeholder="Admin password" autocomplete="off" />
      </div>
      <Message v-if="loadError" severity="error" :closable="false" class="mt-2">{{ loadError }}</Message>
      <template #footer>
        <Button label="Cancel" text @click="loadVisible=false" :disabled="loadingStock" />
        <Button label="Load up to selected date" icon="pi pi-download" severity="help"
                :disabled="!selectedDate" :loading="loadingStock" @click="doLoad" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button       from 'primevue/button'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import Tag          from 'primevue/tag'
import Dialog       from 'primevue/dialog'
import Message      from 'primevue/message'
import AutoComplete from 'primevue/autocomplete'
import Select       from 'primevue/select'
import { stockApi, posApi } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'

const auth = useAuthStore()

const requests      = ref([])
const loading       = ref(false)
const error         = ref('')
const editorVisible = ref(false)
const current       = ref(null)
const acting        = ref(false)
const catalogue     = ref([])    // flat list of items for the picker
const itemQuery     = ref('')
const itemSuggestions = ref([])
const showDrop      = ref(false)
const searchRef     = ref(null)

// ── BC stock baseline (reset) + fresh loads ──────────────────────────────────
const isManager     = computed(() => ['admin', 'shop-admin'].includes(auth.user?.role))
const watermark     = ref(null)
const wmShop        = ref('')
const adminUsername = ref('')
const adminPassword = ref('')
// reset dialog
const resetVisible  = ref(false)
const resetting     = ref(false)
const resetError    = ref('')
// load dialog
const loadVisible   = ref(false)
const loadingStock  = ref(false)
const loadError     = ref('')
const ledgerDates   = ref([])
const loadingDates  = ref(false)
const selectedDate  = ref(null)

function clearElevation() { adminUsername.value = ''; adminPassword.value = '' }
function elevationBody() { return isManager.value ? {} : { adminUsername: adminUsername.value, adminPassword: adminPassword.value } }

async function loadWatermark() {
  try { const { data } = await stockApi.bcWatermark(); watermark.value = data; wmShop.value = data?.shopCode || '' }
  catch { watermark.value = null }
}

async function openReset() {
  resetError.value = ''; clearElevation(); await loadWatermark(); resetVisible.value = true
}
async function doReset() {
  resetError.value = ''; resetting.value = true
  try {
    const { data } = await stockApi.resetFromBc(elevationBody())
    resetVisible.value = false
    error.value = ''
    requests.value = (await stockApi.listRequests()).data
    await loadWatermark()
    alert(`Stock reset: ${data.items} item(s) seeded from BC @ ${data.locationCode} (baseline entry ${data.lastEntryNo}).`)
  } catch (e) { resetError.value = e.response?.data?.error ?? e.message }
  finally { resetting.value = false }
}

async function openLoad() {
  loadError.value = ''; clearElevation(); selectedDate.value = null; ledgerDates.value = []
  await loadWatermark()
  loadVisible.value = true
  if (!watermark.value?.watermark) return
  loadingDates.value = true
  try { ledgerDates.value = (await stockApi.bcLedgerDates()).data.dates || [] }
  catch (e) { loadError.value = e.response?.data?.error ?? e.message }
  finally { loadingDates.value = false }
}
async function doLoad() {
  if (!selectedDate.value) return
  loadError.value = ''; loadingStock.value = true
  try {
    const { data } = await stockApi.loadFromBc({
      uptoEntryNo: selectedDate.value.lastEntryNo,
      asOfDate:    String(selectedDate.value.postingDate).slice(0, 10),
      ...elevationBody(),
    })
    loadVisible.value = false
    await loadWatermark()
    alert(`Loaded ${data.items} item(s) — entries ${data.fromEntryNo + 1}–${data.toEntryNo}.`)
  } catch (e) { loadError.value = e.response?.data?.error ?? e.message }
  finally { loadingStock.value = false }
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-KE') : '' }

// Per-line lookup suggestions (one global list — only one AutoComplete is open at a time).
const lineLookup = ref([])

// Distinct unit-of-measure dropdown derived from the master catalogue.
const uomOptions = computed(() => {
  const set = new Set()
  for (const it of catalogue.value) {
    if (it.unitOfMeasure) set.add(String(it.unitOfMeasure).toUpperCase())
  }
  // Common defaults so the dropdown is never empty
  ;['KG','EA','PCS','BX','PKT','LT','GM'].forEach(u => set.add(u))
  return [...set].sort()
})

function filterLineLookup(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) {
    lineLookup.value = catalogue.value.slice(0, 10)
    return
  }
  lineLookup.value = catalogue.value
    .filter(i => i.itemNo.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    .slice(0, 12)
}

// AutoComplete writes either a string (free text) or an object (selected suggestion) to v-model.
// Normalise back onto the line.
function onLineModelUpdate(line, val) {
  if (val && typeof val === 'object') {
    pickLineItem(line, val)
  } else {
    line.itemNo = String(val || '').toUpperCase()
  }
}
function pickLineItem(line, val) {
  if (!val) return
  line.itemNo        = val.itemNo
  line.description   = val.description || line.description
  line.unitOfMeasure = val.unitOfMeasure || line.unitOfMeasure || 'KG'
  // Normalise the bound model so the input shows just the item No string.
  line._lookup = val.itemNo
  persistLines()
}

const editable    = computed(() => current.value && ['open', 'submitted'].includes(current.value.status))
const receivable  = computed(() => current.value && ['submitted', 'approved'].includes(current.value.status))
const canApprove  = computed(() => current.value?.status === 'submitted' && auth.user?.role === 'admin')
const dialogHeader = computed(() => current.value ? `Stock Request ${current.value.requestNo}` : 'New request')

async function load() {
  loading.value = true; error.value = ''
  try { requests.value = (await stockApi.listRequests()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { loading.value = false }
}

async function loadCatalogue() {
  try {
    const { data } = await posApi.getItems()
    catalogue.value = data.flatMap(c => c.items)
  } catch {}
}

function filterItems() {
  const q = itemQuery.value.trim().toLowerCase()
  if (!q) { itemSuggestions.value = []; return }
  itemSuggestions.value = catalogue.value
    .filter(i => i.description.toLowerCase().includes(q) || i.itemNo.toLowerCase().includes(q))
    .slice(0, 8)
}

function addFirstSuggestion() {
  if (itemSuggestions.value.length) addItem(itemSuggestions.value[0])
}

function addItem(it) {
  const existing = current.value.lines.find(l => l.itemNo === it.itemNo)
  if (existing) {
    existing.quantityRequested = Number(existing.quantityRequested || 0) + 1
  } else {
    current.value.lines.push({
      lineId: null,
      requestNo: current.value.requestNo,   // line shares the header's doc number
      itemNo: it.itemNo, description: it.description,
      quantityRequested: 1, quantityReceived: null, rfNo: '',
      unitOfMeasure: it.unitOfMeasure || '', sortOrder: current.value.lines.length,
    })
  }
  itemQuery.value = ''; itemSuggestions.value = []; showDrop.value = false
  persistLines()
  // Re-focus the search so the user can keep adding lines without picking up the mouse.
  setTimeout(() => searchRef.value?.focus(), 0)
}

function addBlankLine() {
  if (!current.value || !editable.value) return
  current.value.lines.push({
    lineId: null,
    requestNo: current.value.requestNo,
    itemNo: '', description: '',
    quantityRequested: 1, quantityReceived: null, rfNo: '',
    unitOfMeasure: 'KG', sortOrder: current.value.lines.length,
  })
  persistLines()
}

function removeLine(idx) {
  current.value.lines.splice(idx, 1)
  persistLines()
}

let saveTimer = null
function persistLines() {
  if (!current.value || !editable.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await stockApi.setLines(current.value.requestId, current.value.lines)
    } catch (e) { error.value = e.response?.data?.error ?? e.message }
  }, 500)
}

async function newRequest() {
  acting.value = true; error.value = ''
  try {
    const { data } = await stockApi.createRequest({ notes: null })
    const id = data.RequestId || data.requestId
    current.value = (await stockApi.getRequest(id)).data
    editorVisible.value = true
    await loadCatalogue()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

async function openRequest(e) {
  const id = e.data.RequestId
  try {
    current.value = (await stockApi.getRequest(id)).data
    editorVisible.value = true
    if (!catalogue.value.length) await loadCatalogue()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}

async function submitReq() {
  acting.value = true; error.value = ''
  try {
    if (saveTimer) { clearTimeout(saveTimer); await stockApi.setLines(current.value.requestId, current.value.lines) }
    await stockApi.submitRequest(current.value.requestId)
    current.value = (await stockApi.getRequest(current.value.requestId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

async function approveReq() {
  acting.value = true
  try {
    await stockApi.approveRequest(current.value.requestId)
    current.value = (await stockApi.getRequest(current.value.requestId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

function lineHasVariance(l) {
  if (l.quantityReceived == null) return false
  return Number(l.quantityReceived) !== Number(l.quantityRequested || 0)
}
// A "return" line = received less than requested (the shortfall goes back on an RF).
function lineIsReturn(l) {
  if (l.quantityReceived == null) return false
  return Number(l.quantityReceived) < Number(l.quantityRequested || 0)
}
function lineVarianceClass(l) {
  const v = Number(l.quantityReceived || 0) - Number(l.quantityRequested || 0)
  if (v > 0) return 'num pos'
  if (v < 0) return 'num neg'
  return ''
}

async function completeReq() {
  acting.value = true; error.value = ''
  try {
    // Require a comment whenever the received qty doesn't match what was requested.
    const missing = current.value.lines.filter(l =>
      lineHasVariance(l) && !String(l.comments || '').trim()
    )
    if (missing.length) {
      error.value = `Add a comment for ${missing.length} line(s) where the received quantity doesn't match the requested.`
      acting.value = false
      return
    }
    const lines = current.value.lines.map(l => ({
      lineId:           l.lineId,
      quantityReceived: l.quantityReceived ?? l.quantityRequested,
      comments:         l.comments || null,
      rfNo:             l.rfNo || null,
    }))
    await stockApi.completeRequest(current.value.requestId, lines)
    current.value = (await stockApi.getRequest(current.value.requestId)).data
    await load()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

const exportingBc = ref(false)
async function downloadBcJournal() {
  if (!current.value) return
  exportingBc.value = true
  try {
    const res = await stockApi.requestBcJournalCsv(current.value.requestId, {})
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `bc-adjustment-${current.value.requestNo}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally   { exportingBc.value = false }
}

async function cancelReq() {
  acting.value = true
  try { await stockApi.cancelRequest(current.value.requestId); editorVisible.value=false; await load() }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally  { acting.value = false }
}

function statusSeverity(s) {
  return { open: 'info', submitted: 'warn', approved: 'success', completed: 'success', cancelled: 'secondary' }[s] ?? 'secondary'
}
function fmtTime(v) {
  if (!v) return ''
  return new Date(v).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(load)
</script>

<style scoped>
.stock-page { padding: 16px 20px; max-width: 1100px; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap; gap:10px; }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; }
.text-muted { color:#888; }
.text-sm    { font-size:13px; }
.mb-3       { margin-bottom: 12px; }
.mb-2       { margin-bottom: 8px; }
.mt-2       { margin-top: 8px; }

.elev-box { margin-top: 12px; display:flex; flex-direction:column; gap:6px;
  padding:10px; border:1px solid var(--bc-border,#e4e7ec); border-radius:8px; background:var(--bc-surface-raised,#f9fafb); }
.elev-input { padding:8px 10px; border:1px solid var(--bc-border,#d0d5dd); border-radius:6px; font-size:13px; }

.editor { display:flex; flex-direction:column; gap:12px; }
.editor-meta { display:flex; justify-content:space-between; align-items:center; }
.editor-lines :deep(.p-datatable-tbody > tr > td) { padding: 6px 8px; }

.line-add-row { display:flex; gap:8px; align-items:center; }
.line-add { position: relative; flex: 1; }
.line-text {
  width:100%; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;
  background:#fff; color:#111827;
}
.line-text:focus { border-color:#2563eb; outline:none; }
.line-add-input {
  width: 100%; padding: 8px 10px; border:1.5px solid #d1d5db; border-radius:6px;
  font-size: 13px; outline:none;
}
.line-add-input:focus { border-color:#2563eb; }
.line-add-drop {
  position: absolute; top:100%; left:0; right:0;
  background:#fff; border:1.5px solid #d1d5db; border-radius:6px;
  box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100;
  max-height:240px; overflow-y:auto; margin-top:4px;
}
.line-add-opt {
  display:flex; justify-content:space-between; padding:8px 12px;
  cursor:pointer; border-bottom:1px solid #f3f4f6; font-size:13px;
}
.line-add-opt:hover { background:#eff6ff; }
.line-add-name { font-weight:500; }
.line-add-no   { color:#6b7280; font-size:12px; }

.line-qty {
  width:90px; padding:4px 6px; text-align:right;
  border:1px solid #d1d5db; border-radius:4px; font-size:13px;
}

/* Item-No lookup options inside AutoComplete */
.lookup-opt { display:flex; gap:8px; align-items:baseline; }
.lookup-no  { color:#1e3a8a; min-width:80px; }
.lookup-desc { flex:1; color:#111827; }
.lookup-uom { white-space:nowrap; }
</style>
