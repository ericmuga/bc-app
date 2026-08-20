<template>
  <div class="sync-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Sync Center</h2>
        <p class="text-muted text-sm">All Business Central syncs in one place — master data per company and
          transactional syncs per shop. Admin / shop-admin only.</p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" @close="error=''" class="mb-3">{{ error }}</Message>

    <!-- ── Master data (BC → POS), per company ─────────────────────────────── -->
    <section class="card">
      <div class="card-head">
        <h3><i class="pi pi-database" /> Master data — BC → POS</h3>
        <div class="head-controls">
          <span class="lbl">Company</span>
          <SelectButton v-model="company" :options="companies" :allowEmpty="false" />
          <div class="chk">
            <Checkbox v-model="wipe" binary input-id="wipe" />
            <label for="wipe" v-tooltip.bottom="'Wipe & re-import (items/shops) instead of upsert'">Replace (wipe) items/shops</label>
          </div>
        </div>
      </div>
      <p class="text-muted text-sm">Each company (FCL / CM / RMK) has its own BC tables — pick the company, then sync.</p>

      <div class="btn-grid">
        <Button label="Sync ALL master data" icon="pi pi-sync" severity="help"
                :loading="busyMaster==='all'" @click="syncAll" />
        <Button v-for="s in masterSteps" :key="s.kind" :label="s.label" :icon="s.icon" outlined
                :loading="busyMaster===s.kind" @click="syncStep(s.kind)" />
      </div>

      <div v-if="masterResult" class="result">
        <strong>{{ masterResult.label }}:</strong> {{ masterResult.summary }}
        <ul v-if="masterResult.errors?.length" class="errs">
          <li v-for="(e,i) in masterResult.errors.slice(0,10)" :key="i">{{ typeof e === 'string' ? e : (e.error || JSON.stringify(e)) }}</li>
        </ul>
      </div>
    </section>

    <!-- ── Inventory posting groups + BC BOMs (source of truth) ─────────────── -->
    <section class="card">
      <div class="card-head">
        <h3><i class="pi pi-sitemap" /> Posting groups &amp; BC BOMs — {{ company }}</h3>
        <Button label="Load / refresh" icon="pi pi-refresh" text @click="loadBomStuff" :loading="bomBusy==='load'" />
      </div>
      <p class="text-muted text-sm">Tick which BC <strong>Inventory Posting Groups</strong> belong in shops, then sync the
        BC <strong>Production BOMs</strong> for those groups — the recipe and its items land in POS and ride the inventory refresh jobs.</p>

      <div v-if="invGroups.length" class="chk-row" style="max-height:150px;overflow:auto;align-items:flex-start">
        <label v-for="g in invGroups" :key="g.code" class="chk" style="min-width:220px">
          <Checkbox v-model="g.syncToShops" binary /> {{ g.code }} <span class="text-muted">— {{ g.description }}</span>
        </label>
      </div>
      <div class="btn-grid" style="margin-top:8px">
        <Button label="Save posting groups" icon="pi pi-save" severity="secondary" :loading="bomBusy==='saveGroups'" @click="saveGroups" :disabled="!invGroups.length" />
        <Button label="Sync all BOMs for ticked groups" icon="pi pi-sitemap" severity="success" :loading="bomBusy==='syncAll'" @click="syncAllBoms" />
        <span class="chk"><InputText v-model="oneBom" placeholder="BOM No (e.g. JC0000015)" style="width:170px" />
          <Button label="Sync this BOM" icon="pi pi-download" :loading="bomBusy==='syncOne'" :disabled="!oneBom" @click="syncOneBom" /></span>
      </div>
      <div v-if="bomResult" class="result"><strong>{{ bomResult.label }}:</strong> {{ bomResult.summary }}</div>

      <DataTable v-if="bcBoms.length" :value="bcBoms" size="small" :rows="12" paginator class="mt-2">
        <Column field="bomNo" header="BOM" style="width:120px" />
        <Column field="finishedItemNo" header="Finished item" style="width:130px" />
        <Column field="finishedDesc" header="Description" />
        <Column field="ipg" header="Posting group" style="width:120px" />
        <Column field="lineCount" header="Lines" style="width:70px;text-align:right" />
        <Column header="" style="width:80px"><template #body="{data}"><Button icon="pi pi-download" text size="small" :loading="bomBusy==='row'+data.bomNo" @click="syncRow(data)" /></template></Column>
      </DataTable>
    </section>

    <!-- ── Transactional (POS ↔ BC), per shop ──────────────────────────────── -->
    <section class="card">
      <div class="card-head">
        <h3><i class="pi pi-arrow-right-arrow-left" /> Transactional — per shop</h3>
        <div class="head-controls">
          <span class="lbl">Shop</span>
          <Select v-model="shopCode" :options="shops" option-label="Name" option-value="Code"
                  placeholder="Select shop…" filter size="small" style="min-width:220px" @change="onShopChange" />
        </div>
      </div>

      <div v-if="!shopCode" class="text-muted text-sm">Pick a shop to enable its transactional syncs.</div>

      <template v-else>
        <div class="date-row">
          <div class="fld"><label>From</label><DatePicker v-model="dateFrom" date-format="yy-mm-dd" size="small" /></div>
          <div class="fld"><label>To</label><DatePicker v-model="dateTo" date-format="yy-mm-dd" size="small" /></div>
          <span class="text-muted text-sm">Date range applies to “Push sales”.</span>
        </div>

        <div class="btn-grid">
          <Button label="Push paid sales → BC" icon="pi pi-cloud-upload" severity="success"
                  :loading="busyTxn==='sales'" @click="pushSales" />
          <Button label="Push stock requests → BC" icon="pi pi-truck" severity="success" outlined
                  :loading="busyTxn==='orders'" @click="pushOrders" />
          <Button label="Push production orders → BC" icon="pi pi-cog" severity="success" outlined
                  :loading="busyTxn==='prod'" @click="pushProduction" />
          <Button label="Pull BC transfers/adjustments/sales" icon="pi pi-arrow-down-left" severity="info" outlined
                  :loading="busyTxn==='pull'" @click="pullLedger"
                  v-tooltip.bottom="'Import BC ledger entries not in POS (Transfer, +/- Adjustment, and non-POS Sales) as typed movements. Run before Harmonize.'" />
          <Button label="Harmonize with BC" icon="pi pi-sync" severity="info"
                  :loading="busyTxn==='harmonize'" @click="openHarmonize" />
          <Button label="Load fresh from BC" icon="pi pi-download" severity="help" outlined
                  :loading="busyTxn==='load'" @click="openLoad" />
          <Button label="Stock Reset (wipe → BC on-hand)" icon="pi pi-history" severity="warn" outlined
                  :loading="busyTxn==='reset'" @click="doReset" />
        </div>

        <div v-if="txnResult" class="result">
          <strong>{{ txnResult.label }}:</strong> {{ txnResult.summary }}
        </div>
      </template>
    </section>

    <!-- ── Automatic BC pull (background job) ──────────────────────────────── -->
    <section class="card">
      <div class="card-head">
        <h3><i class="pi pi-clock" /> Automatic BC pull — background job</h3>
        <div class="head-controls">
          <div class="chk"><Checkbox v-model="pull.enabled" binary input-id="pull-en" /><label for="pull-en">Enabled</label></div>
          <span class="lbl">Every</span>
          <InputNumber v-model="pull.intervalMinutes" :min="1" :max="1440" show-buttons style="width:120px" /> <span class="lbl">min</span>
        </div>
      </div>
      <p class="text-muted text-sm">Runs the same "Pull BC transfers/adjustments/sales" automatically for every shop that has a
        baseline — importing new BC ledger entries as typed movements. Each run is logged below.</p>
      <div class="chk-row">
        <span class="lbl">Entry types:</span>
        <label v-for="t in ENTRY_TYPES" :key="t.v" class="chk"><Checkbox v-model="pull.entryTypes" :value="t.v" />{{ t.label }}</label>
      </div>
      <div class="btn-grid" style="margin-top:10px">
        <Button label="Save schedule" icon="pi pi-save" severity="secondary" :loading="pullSaving" @click="savePull" />
        <Button label="Run now" icon="pi pi-play" :loading="pullRunning" @click="runPullNow" />
        <Button label="Refresh log" icon="pi pi-refresh" text @click="loadPullLog" />
      </div>

      <DataTable :value="pullLog" size="small" :rows="15" paginator class="mt-2" v-if="pullLog.length">
        <Column field="startedAt" header="When"><template #body="{data}">{{ fmtDt(data.startedAt) }}</template></Column>
        <Column field="shopCode" header="Shop" style="width:90px" />
        <Column field="company" header="Co" style="width:70px" />
        <Column field="toEntryNo" header="→ Entry" style="width:100px;text-align:right" />
        <Column field="inserted" header="Inserted" style="width:90px;text-align:right" />
        <Column field="skipped" header="Skipped" style="width:90px;text-align:right" />
        <Column field="ok" header="OK" style="width:60px"><template #body="{data}"><i :class="data.ok ? 'pi pi-check' : 'pi pi-times'" :style="{color: data.ok ? '#22c55e':'#f87171'}" /></template></Column>
        <Column field="triggeredBy" header="By" style="width:90px" />
        <Column field="error" header="Error"><template #body="{data}"><span style="color:#f87171">{{ data.error }}</span></template></Column>
      </DataTable>
    </section>

    <!-- ── Harmonize dialog (readiness-gated) ──────────────────────────────── -->
    <Dialog v-model:visible="harmonizeVisible" header="Harmonize with BC" :modal="true" :style="{ width:'560px' }" class="sync-dark-dialog">
      <Message severity="info" :closable="false" class="mb-3">
        Reconciles this shop's on-hand to BC (source of truth) with a correcting entry per item — no history is
        deleted. Run it after BC has posted the shop's sales &amp; stock requests.
      </Message>
      <div v-if="checkingReadiness" class="text-muted text-sm"><i class="pi pi-spin pi-spinner" /> Checking BC posting status…</div>
      <template v-else-if="readiness">
        <Message v-if="readiness.ready" severity="success" :closable="false">BC has posted all sales &amp; requests — safe to harmonize.</Message>
        <Message v-else severity="warn" :closable="false">
          BC still has <strong>{{ readiness.salesPending?.docs ?? '?' }}</strong> sale(s) and
          <strong>{{ readiness.ordersPending?.docs ?? '?' }}</strong> stock request(s) pending. Wait, or force.
        </Message>
      </template>
      <Message v-if="harmonizeError" severity="error" :closable="false" class="mt-2">{{ harmonizeError }}</Message>
      <div v-if="harmonizeResult" class="mt-3">
        <Message severity="success" :closable="false" class="mb-2">
          Reconciled @ {{ harmonizeResult.locationCode }}: {{ harmonizeResult.increased }} up,
          {{ harmonizeResult.decreased }} down, {{ harmonizeResult.unchanged }} unchanged.
        </Message>
        <DataTable v-if="harmonizeResult.adjustments?.length" :value="harmonizeResult.adjustments" size="small"
                   :scrollable="true" scroll-height="220px">
          <Column field="itemNo" header="Item" style="width:100px" />
          <Column field="description" header="Description" style="min-width:150px" />
          <Column field="posQty" header="POS" style="width:70px;text-align:right"><template #body="{data}">{{ Number(data.posQty).toFixed(2) }}</template></Column>
          <Column field="bcQty" header="BC" style="width:70px;text-align:right"><template #body="{data}">{{ Number(data.bcQty).toFixed(2) }}</template></Column>
          <Column field="delta" header="Correction" style="width:100px;text-align:right">
            <template #body="{data}"><span :class="data.delta>0?'pos':'neg'">{{ data.delta>0?'+':'' }}{{ Number(data.delta).toFixed(2) }}</span></template>
          </Column>
        </DataTable>
      </div>
      <template #footer>
        <Button :label="harmonizeResult ? 'Close' : 'Cancel'" text @click="harmonizeVisible=false" :disabled="harmonizing" />
        <template v-if="!harmonizeResult">
          <Button v-if="readiness?.ready" label="Harmonize now" icon="pi pi-sync" severity="success"
                  :loading="harmonizing" :disabled="checkingReadiness" @click="doHarmonize(false)" />
          <Button v-else label="Harmonize anyway" icon="pi pi-exclamation-triangle" severity="warn"
                  :loading="harmonizing" :disabled="checkingReadiness" @click="doHarmonize(true)" />
        </template>
      </template>
    </Dialog>

    <!-- ── Load from BC dialog ─────────────────────────────────────────────── -->
    <Dialog v-model:visible="loadVisible" header="Load fresh stock from BC" :modal="true" :style="{ width:'620px' }" class="sync-dark-dialog">
      <Message v-if="!watermark?.watermark" severity="warn" :closable="false" class="mb-2">No baseline yet — run Stock Reset (or Harmonize) first.</Message>
      <p v-else class="text-muted text-sm">Pick a date; everything up to the last BC ledger entry that day (net) is loaded.</p>
      <DataTable :value="ledgerDates" dataKey="lastEntryNo" size="small" :loading="loadingDates"
                 selection-mode="single" v-model:selection="selectedDate" :scrollable="true" scroll-height="280px" class="mt-2">
        <Column selectionMode="single" style="width:42px" />
        <Column field="postingDate" header="Date"><template #body="{data}">{{ fmtDate(data.postingDate) }}</template></Column>
        <Column field="lastEntryNo" header="Last Entry #" style="width:110px;text-align:right" />
        <Column field="entries" header="Entries" style="width:80px;text-align:right" />
        <Column field="netQty" header="Net Qty" style="width:90px;text-align:right"><template #body="{data}">{{ Number(data.netQty||0).toFixed(2) }}</template></Column>
      </DataTable>
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
import { ref, onMounted } from 'vue'
import Button       from 'primevue/button'
import Select       from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Checkbox     from 'primevue/checkbox'
import InputText    from 'primevue/inputtext'
import InputNumber  from 'primevue/inputnumber'
import DatePicker   from 'primevue/datepicker'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import Message      from 'primevue/message'
import Dialog       from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { posSetupApi, posReportsApi, stockApi, posProdApi, setAdminShopCode } from '@/services/pos.js'

const toast = useToast()
const error = ref('')

// ── Master data ──────────────────────────────────────────────────────────────
const companies = ['FCL', 'CM', 'RMK']
const company   = ref('FCL')
const wipe      = ref(false)
const masterSteps = [
  { kind: 'shops',         label: 'Shops / Terminals', icon: 'pi pi-building' },
  { kind: 'walk-ins',      label: 'Walk-ins',          icon: 'pi pi-user' },
  { kind: 'contacts',      label: 'Contacts',          icon: 'pi pi-users' },
  { kind: 'categories',    label: 'Categories',        icon: 'pi pi-th-large' },
  { kind: 'items',         label: 'Items',             icon: 'pi pi-box' },
  { kind: 'payment-types', label: 'Payment Methods',   icon: 'pi pi-credit-card' },
  { kind: 'shop-prices',   label: 'Shop Prices',       icon: 'pi pi-tag' },
]
const busyMaster   = ref('')
const masterResult = ref(null)

async function syncAll() {
  busyMaster.value = 'all'; masterResult.value = null; error.value = ''
  try {
    const { data } = await posSetupApi.syncFromBc(company.value)
    masterResult.value = { label: `Sync all (${company.value})`, summary: summarize(data), errors: data.errors || [] }
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyMaster.value = '' }
}
async function syncStep(kind) {
  busyMaster.value = kind; masterResult.value = null; error.value = ''
  try {
    const opts = (kind === 'items' || kind === 'shops') ? { wipe: wipe.value } : {}
    const { data } = await posSetupApi.syncStepFromBc(kind, company.value, opts)
    masterResult.value = { label: `${kind} (${company.value})`, summary: summarize(data), errors: data.errors || [] }
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyMaster.value = '' }
}
function summarize(d) {
  if (!d || typeof d !== 'object') return 'done'
  const parts = []
  for (const k of ['count', 'inserted', 'updated', 'created', 'skipped', 'unchanged', 'deleted', 'imported'])
    if (d[k] != null) parts.push(`${k} ${d[k]}`)
  return parts.length ? parts.join(', ') : 'done'
}

// ── Transactional (per shop) ─────────────────────────────────────────────────
const shops     = ref([])
const shopCode  = ref('')
const dateFrom  = ref(new Date(Date.now() - 6 * 864e5))
const dateTo    = ref(new Date())
const busyTxn   = ref('')
const txnResult = ref(null)

function isoDate(d) { if (!d) return null; if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

function onShopChange() {
  // Act as the selected shop for this tab's requests (per-tab; other tabs unaffected).
  setAdminShopCode(shopCode.value, { perTab: true })
  txnResult.value = null
}

async function pushSales() {
  busyTxn.value = 'sales'; txnResult.value = null; error.value = ''
  try {
    const { data } = await posReportsApi.importedSalesPush({ shopCode: shopCode.value, dateFrom: isoDate(dateFrom.value), dateTo: isoDate(dateTo.value) })
    txnResult.value = { label: 'Push sales', summary: `Company ${data.company}: inserted ${data.inserted}, skipped ${data.skipped} of ${data.candidates} line(s).` }
    toast.add({ severity: data.inserted ? 'success' : 'info', summary: 'Sales pushed', detail: txnResult.value.summary, life: 6000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyTxn.value = '' }
}

async function pushOrders() {
  busyTxn.value = 'orders'; txnResult.value = null; error.value = ''
  try {
    const { data } = await stockApi.pushAllOrdersBc()
    txnResult.value = { label: 'Push stock requests', summary: `${data.requests} request(s): inserted ${data.inserted}, skipped ${data.skipped}.` }
    toast.add({ severity: 'success', summary: 'Stock requests pushed', detail: txnResult.value.summary, life: 6000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyTxn.value = '' }
}

async function pullLedger() {
  busyTxn.value = 'pull'; txnResult.value = null; error.value = ''
  try {
    const { data } = await stockApi.pullBcLedger({ entryTypes: [1, 2, 3, 4] })
    const bits = [`inserted ${data.inserted}`, `skipped ${data.skipped}`]
    if (data.skippedPosSales) bits.push(`${data.skippedPosSales} POS-origin sale(s) skipped`)
    txnResult.value = { label: 'Pull BC ledger', summary: `${bits.join(', ')} (entries ${data.fromEntryNo + 1}–${data.toEntryNo}, ${data.company}).` }
    toast.add({ severity: data.inserted ? 'success' : 'info', summary: 'BC ledger pulled', detail: txnResult.value.summary, life: 7000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyTxn.value = '' }
}

async function pushProduction() {
  busyTxn.value = 'prod'; txnResult.value = null; error.value = ''
  try {
    const { data } = await posProdApi.pushAllBc()
    txnResult.value = { label: 'Push production orders', summary: `${data.orders} posted order(s): headers ${data.hdrInserted}, journal lines ${data.jnlInserted}.` }
    toast.add({ severity: 'success', summary: 'Production pushed', detail: txnResult.value.summary, life: 6000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyTxn.value = '' }
}

async function doReset() {
  if (!window.confirm(`Stock Reset for ${shopCode.value}? This WIPES the shop's movement history and re-seeds on-hand from BC.`)) return
  busyTxn.value = 'reset'; txnResult.value = null; error.value = ''
  try {
    const { data } = await stockApi.resetFromBc()
    txnResult.value = { label: 'Stock Reset', summary: `${data.items} item(s) seeded from BC @ ${data.locationCode} (baseline entry ${data.lastEntryNo}).` }
    toast.add({ severity: 'success', summary: 'Stock reset', detail: txnResult.value.summary, life: 6000 })
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { busyTxn.value = '' }
}

// Harmonize
const harmonizeVisible  = ref(false)
const harmonizing       = ref(false)
const harmonizeError    = ref('')
const harmonizeResult   = ref(null)
const readiness         = ref(null)
const checkingReadiness = ref(false)
async function openHarmonize() {
  harmonizeError.value = ''; harmonizeResult.value = null; readiness.value = null
  harmonizeVisible.value = true; checkingReadiness.value = true
  try { readiness.value = (await stockApi.harmonizeReadiness()).data }
  catch (e) { harmonizeError.value = e.response?.data?.error || e.message }
  finally { checkingReadiness.value = false }
}
async function doHarmonize(force) {
  harmonizeError.value = ''; harmonizing.value = true
  try {
    const { data } = await stockApi.harmonizeFromBc({ force })
    harmonizeResult.value = data
  } catch (e) {
    if (e.response?.status === 409 && e.response.data?.readiness) { readiness.value = e.response.data.readiness; harmonizeError.value = e.response.data.error }
    else harmonizeError.value = e.response?.data?.error || e.message
  } finally { harmonizing.value = false }
}

// Load from BC
const loadVisible  = ref(false)
const loadingStock = ref(false)
const loadError    = ref('')
const watermark    = ref(null)
const ledgerDates  = ref([])
const loadingDates = ref(false)
const selectedDate = ref(null)
async function openLoad() {
  loadError.value = ''; selectedDate.value = null; ledgerDates.value = []; loadVisible.value = true
  try { watermark.value = (await stockApi.bcWatermark()).data } catch { watermark.value = null }
  if (!watermark.value?.watermark) return
  loadingDates.value = true
  try { ledgerDates.value = (await stockApi.bcLedgerDates()).data.dates || [] }
  catch (e) { loadError.value = e.response?.data?.error || e.message }
  finally { loadingDates.value = false }
}
async function doLoad() {
  if (!selectedDate.value) return
  loadError.value = ''; loadingStock.value = true
  try {
    const { data } = await stockApi.loadFromBc({ uptoEntryNo: selectedDate.value.lastEntryNo, asOfDate: String(selectedDate.value.postingDate).slice(0,10) })
    loadVisible.value = false
    toast.add({ severity: 'success', summary: 'Loaded from BC', detail: `${data.items} item(s), entries ${data.fromEntryNo+1}–${data.toEntryNo}.`, life: 6000 })
  } catch (e) { loadError.value = e.response?.data?.error || e.message }
  finally { loadingStock.value = false }
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-KE') : '' }

// ── Posting groups + BC BOMs ─────────────────────────────────────────────────
const invGroups = ref([])
const bcBoms    = ref([])
const oneBom    = ref('')
const bomBusy   = ref('')
const bomResult = ref(null)
async function loadBomStuff() {
  bomBusy.value = 'load'; bomResult.value = null; error.value = ''
  try {
    invGroups.value = (await posSetupApi.invPostingGroups(company.value)).data || []
    bcBoms.value = (await posSetupApi.listBcBoms(company.value)).data || []
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { bomBusy.value = '' }
}
async function saveGroups() {
  bomBusy.value = 'saveGroups'
  try { invGroups.value = (await posSetupApi.saveInvPostingGroups(invGroups.value)).data; bcBoms.value = (await posSetupApi.listBcBoms(company.value)).data || [] }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { bomBusy.value = '' }
}
async function syncAllBoms() {
  bomBusy.value = 'syncAll'; bomResult.value = null
  try { const { data } = await posSetupApi.syncBcBomsAll(company.value); bomResult.value = { label: 'Sync all BOMs', summary: `${data.synced}/${data.boms} BOM(s), ${data.itemsUpserted} item(s) upserted.` } }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { bomBusy.value = '' }
}
async function syncOneBom() {
  if (!oneBom.value) return
  bomBusy.value = 'syncOne'; bomResult.value = null
  try { const { data } = await posSetupApi.syncBcBom(company.value, oneBom.value.trim()); bomResult.value = { label: `Sync ${data.bomNo}`, summary: `finished ${data.finishedItemNo}, ${data.itemsUpserted} item(s), ${data.lines} line(s).` } }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { bomBusy.value = '' }
}
async function syncRow(row) {
  bomBusy.value = 'row' + row.bomNo; bomResult.value = null
  try { const { data } = await posSetupApi.syncBcBom(company.value, row.bomNo); bomResult.value = { label: `Sync ${data.bomNo}`, summary: `finished ${data.finishedItemNo}, ${data.itemsUpserted} item(s), ${data.lines} line(s).` } }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { bomBusy.value = '' }
}

// ── Automatic BC pull (background job) ───────────────────────────────────────
const ENTRY_TYPES = [
  { v: 4, label: 'Transfers' }, { v: 2, label: '+ Adjustments' }, { v: 3, label: '− Adjustments' }, { v: 1, label: 'Non-POS Sales' },
]
const pull = ref({ enabled: false, intervalMinutes: 10, entryTypes: [2, 3, 4] })
const pullSaving = ref(false)
const pullRunning = ref(false)
const pullLog = ref([])
function fmtDt(v) { return v ? new Date(v).toLocaleString('en-KE') : '' }
async function loadPull() {
  try { pull.value = (await stockApi.bcPullConfig()).data } catch {}
}
async function loadPullLog() {
  try { pullLog.value = (await stockApi.bcPullLog(100)).data } catch {}
}
async function savePull() {
  pullSaving.value = true
  try { pull.value = (await stockApi.saveBcPullConfig(pull.value)).data; toast.add({ severity: 'success', summary: 'Schedule saved', life: 3000 }) }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { pullSaving.value = false }
}
async function runPullNow() {
  pullRunning.value = true
  try {
    const { data } = await stockApi.bcPullRunNow()
    toast.add({ severity: 'success', summary: 'BC pull ran', detail: `${data.shops ?? 0} shop(s), inserted ${data.inserted ?? 0}${data.failed ? `, ${data.failed} failed` : ''}.`, life: 6000 })
    await loadPullLog()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { pullRunning.value = false }
}

onMounted(async () => {
  try { shops.value = (await posSetupApi.listShops()).data } catch (e) { error.value = e.response?.data?.error || e.message }
  await loadPull()
  await loadPullLog()
})
</script>

<style scoped>
.sync-page { padding: 16px 20px; background:#0f172a; color:#e5e7eb; min-height: calc(100vh - 56px); }
.page-title { font-size:20px; font-weight:700; margin:0 0 2px; color:#f3f4f6; }
.text-muted { color:#9ca3af; }
.text-sm { font-size:13px; }
.mb-3 { margin-bottom:12px; }
.mt-2 { margin-top:8px; }
.mt-3 { margin-top:12px; }

.card { background:#1f2937; border:1px solid #374151; border-radius:10px; padding:16px 18px; margin-bottom:16px; }
.card-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.card-head h3 { margin:0; font-size:15px; display:flex; gap:8px; align-items:center; color:#f3f4f6; }
.card-head h3 .pi { color:#2dd4bf; }
.head-controls { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.head-controls .lbl { font-size:12px; color:#cbd5e1; font-weight:600; }
.chk { display:flex; align-items:center; gap:6px; font-size:13px; }
.chk-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px; }
.chk-row .lbl { font-size:12px; color:#cbd5e1; font-weight:600; }

.btn-grid { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.date-row { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-top:12px; }
.date-row .fld { display:flex; flex-direction:column; gap:4px; }
.date-row .fld label { font-size:12px; color:#cbd5e1; }

.result { margin-top:12px; padding:10px 12px; background:#111827; border:1px solid #374151; border-radius:8px; font-size:13px; }
.result .errs { margin:6px 0 0; padding-left:18px; color:#f87171; }
.pos { color:#22c55e; font-weight:600; }
.neg { color:#f87171; font-weight:600; }

.sync-page :deep(.p-inputtext), .sync-page :deep(.p-datepicker-input) {
  background:#111827 !important; color:#e5e7eb !important; border-color:#374151 !important; color-scheme:dark;
}
.sync-page :deep(.p-datatable-thead > tr > th) { background:#111827 !important; color:#f3f4f6 !important; border-color:#374151 !important; }
.sync-page :deep(.p-datatable-tbody > tr > td) { background:#1f2937 !important; color:#e5e7eb !important; border-color:#374151 !important; }
</style>

<!-- Unscoped: the harmonize/load dialogs teleport to <body>. -->
<style>
.sync-dark-dialog.p-dialog { background:#1f2937; border:1px solid #374151; }
.sync-dark-dialog.p-dialog .p-dialog-header { background:#111827; color:#f3f4f6; border-bottom:1px solid #374151; }
.sync-dark-dialog.p-dialog .p-dialog-content { background:#1f2937; color:#e5e7eb; }
.sync-dark-dialog.p-dialog .p-dialog-footer { background:#111827; border-top:1px solid #374151; }
.sync-dark-dialog .p-datatable-thead > tr > th { background:#111827 !important; color:#f3f4f6 !important; }
.sync-dark-dialog .p-datatable-tbody > tr > td { background:#1f2937 !important; color:#e5e7eb !important; border-color:#374151 !important; }
.sync-dark-dialog .pos { color:#22c55e; font-weight:600; }
.sync-dark-dialog .neg { color:#f87171; font-weight:600; }
body > .p-dialog-mask:has(.sync-dark-dialog) { background:rgba(0,0,0,0.6); }
</style>
