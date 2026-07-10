<template>
  <div class="costing-page">
    <header class="page-head">
      <h2><i class="pi pi-clone" /> Costing — Recipe Templates</h2>
      <p class="text-muted text-sm">
        Source: <code>{{ source }}</code>. A template is a <strong>header</strong> plus its <strong>lines</strong>
        (related by <code>template_no</code>). Select a template to edit its lines.
      </p>
    </header>

    <Message v-if="error" severity="error" :closable="true" @close="error=null" style="margin:8px 0">{{ error }}</Message>

    <div class="tpl-layout">
      <!-- ── Headers ─────────────────────────────────────────────── -->
      <section class="tpl-headers">
        <div class="filter-bar">
          <div class="f-field f-grow">
            <label>Search</label>
            <InputText v-model="filter.q" placeholder="template no / name…" fluid @keyup.enter="reloadHeaders" />
          </div>
          <div class="f-field">
            <label>Status</label>
            <Select v-model="filter.blocked" :options="blockedOptions" option-label="label" option-value="value"
                    placeholder="All" show-clear fluid @change="reloadHeaders" />
          </div>
          <div class="f-actions">
            <Button label="Search" icon="pi pi-search" size="small" @click="reloadHeaders" :loading="loadingHeaders" />
            <Button label="New" icon="pi pi-plus" size="small" severity="secondary" @click="newHeader" />
          </div>
        </div>

        <DataTable :value="headers" :loading="loadingHeaders" data-key="id" size="small" stripedRows
                   :rowHover="true" paginator :rows="15" :rowsPerPageOptions="[15,30,60]"
                   selectionMode="single" v-model:selection="selectedHeader" @row-select="onSelectHeader">
          <Column field="template_no" header="Template No" sortable />
          <Column field="template_name" header="Name" sortable />
          <Column field="line_count" header="Lines" style="width:70px" />
          <Column header="Status" style="width:90px">
            <template #body="{ data }">
              <Tag :severity="data.blocked ? 'danger' : 'success'" :value="data.blocked ? 'Blocked' : 'Active'" />
            </template>
          </Column>
          <Column header="" style="width:90px">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text size="small" @click="editHeader(data)" v-tooltip="'Edit template'" />
              <Button icon="pi pi-trash" text severity="danger" size="small"
                      @click="deleteHeader(data)" v-tooltip="'Delete template + lines'" />
            </template>
          </Column>
          <template #empty><div style="padding:20px;text-align:center" class="text-muted">No templates.</div></template>
        </DataTable>
      </section>

      <!-- ── Lines of selected template ──────────────────────────── -->
      <section class="tpl-lines">
        <div v-if="!selectedHeader" class="text-muted" style="padding:24px;text-align:center">
          Select a template on the left to view and edit its lines.
        </div>
        <template v-else>
          <div class="action-bar">
            <strong>{{ selectedHeader.template_no }} — {{ selectedHeader.template_name }}</strong>
            <span class="lines-search">
              <i class="pi pi-search" />
              <InputText v-model="lineSearch" placeholder="Filter by item / description…" />
            </span>
            <Button label="Add line" icon="pi pi-plus" size="small" @click="newLine" />
            <Button label="Template" icon="pi pi-file-excel" size="small" text @click="downloadLineTemplate"
                    v-tooltip="'Download an .xlsx upload template'" />
            <Button label="Upload (replace)" icon="pi pi-upload" size="small" severity="danger" outlined
                    @click="triggerLineUpload" v-tooltip="'Replace ALL lines from an Excel/CSV file'" />
            <input ref="lineUploadInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="onLineFile" />
          </div>
          <DataTable :value="filteredLines" :loading="loadingLines" data-key="id" size="small" stripedRows
                     paginator :rows="25" :rowsPerPageOptions="[25,50,100]">
            <Column field="item_code" header="Item" sortable />
            <Column field="description" header="Description" />
            <Column field="percentage" header="%" style="width:80px" />
            <Column field="units_per_100" header="Units/100" style="width:90px" />
            <Column field="type" header="Type" style="width:90px" />
            <Column field="main_product" header="Main" style="width:70px" />
            <Column field="unit_measure" header="UoM" style="width:70px" />
            <Column field="location" header="Loc" style="width:70px" />
            <Column header="" style="width:90px">
              <template #body="{ data }">
                <Button icon="pi pi-pencil" text size="small" @click="editLine(data)" v-tooltip="'Edit line'" />
                <Button icon="pi pi-trash" text severity="danger" size="small"
                        @click="deleteLine(data)" v-tooltip="'Delete line'" />
              </template>
            </Column>
            <template #empty><div style="padding:20px;text-align:center" class="text-muted">No lines yet.</div></template>
          </DataTable>
        </template>
      </section>
    </div>

    <!-- ── Header dialog ───────────────────────────────────────── -->
    <Dialog v-model:visible="hdrDialog" :header="hdrForm.id ? `Edit template ${hdrForm.template_no}` : 'New template'"
            :modal="true" :style="{ width: '520px', maxWidth: '95vw' }">
      <div class="form-grid">
        <div class="f-field">
          <label>Template No *</label>
          <InputText v-model="hdrForm.template_no" :disabled="!!hdrForm.id" fluid />
        </div>
        <div class="f-field">
          <label>Template Name *</label>
          <InputText v-model="hdrForm.template_name" fluid />
        </div>
        <div class="f-field">
          <label>Blocked</label>
          <Select v-model="hdrForm.blocked" :options="blockedOptions" option-label="label" option-value="value" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="hdrDialog=false" />
        <Button :label="hdrForm.id ? 'Save' : 'Create'" icon="pi pi-save" :loading="saving" @click="saveHeader" />
      </template>
    </Dialog>

    <!-- ── Line dialog ─────────────────────────────────────────── -->
    <Dialog v-model:visible="lineDialog" :header="lineForm.id ? `Edit line #${lineForm.id}` : 'New line'"
            :modal="true" :style="{ width: '620px', maxWidth: '95vw' }">
      <div class="form-grid">
        <div class="f-field"><label>Item Code *</label><InputText v-model="lineForm.item_code" fluid /></div>
        <div class="f-field"><label>Description</label><InputText v-model="lineForm.description" fluid /></div>
        <div class="f-field"><label>Percentage</label>
          <InputNumber v-model="lineForm.percentage" mode="decimal" :maxFractionDigits="4" fluid /></div>
        <div class="f-field"><label>Units / 100</label>
          <InputNumber v-model="lineForm.units_per_100" mode="decimal" :maxFractionDigits="4" fluid /></div>
        <div class="f-field"><label>Type</label><InputText v-model="lineForm.type" fluid /></div>
        <div class="f-field"><label>Main Product</label>
          <Select v-model="lineForm.main_product" :options="['Yes','No']" fluid /></div>
        <div class="f-field"><label>Shortcode</label><InputText v-model="lineForm.shortcode" fluid /></div>
        <div class="f-field"><label>Unit of Measure</label><InputText v-model="lineForm.unit_measure" fluid /></div>
        <div class="f-field"><label>Location</label><InputText v-model="lineForm.location" fluid /></div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="lineDialog=false" />
        <Button :label="lineForm.id ? 'Save' : 'Add'" icon="pi pi-save" :loading="saving" @click="saveLine" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import * as XLSX from 'xlsx'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { templatesApi } from '@/services/costing.js'

const confirm = useConfirm()
const source = 'WMS.calibra.dbo.template_header / template_lines'

const blockedOptions = [{ label: 'Active', value: 0 }, { label: 'Blocked', value: 1 }]

const filter = reactive({ q: '', blocked: null })
const headers = ref([])
const lines = ref([])
const lineSearch = ref('')
const filteredLines = computed(() => {
  const q = lineSearch.value.trim().toLowerCase()
  if (!q) return lines.value
  return lines.value.filter(l =>
    [l.item_code, l.description, l.type, l.shortcode]
      .some(v => String(v ?? '').toLowerCase().includes(q)))
})
const selectedHeader = ref(null)
const loadingHeaders = ref(false)
const loadingLines = ref(false)
const saving = ref(false)
const error = ref(null)

const hdrDialog = ref(false)
const hdrForm = reactive({ id: null, template_no: '', template_name: '', blocked: 0 })
const lineDialog = ref(false)
const lineForm = reactive({
  id: null, template_no: '', item_code: '', description: '', percentage: null,
  units_per_100: null, type: '', main_product: 'No', shortcode: '', unit_measure: '', location: '',
})

function fail(e) { error.value = e?.response?.data?.error || e.message || 'Request failed' }

async function reloadHeaders() {
  loadingHeaders.value = true; error.value = null
  try { headers.value = (await templatesApi.list(filter)).data }
  catch (e) { fail(e) } finally { loadingHeaders.value = false }
}

async function loadLines(no) {
  loadingLines.value = true
  try { lines.value = (await templatesApi.lines(no)).data }
  catch (e) { fail(e) } finally { loadingLines.value = false }
}

function onSelectHeader() { if (selectedHeader.value) loadLines(selectedHeader.value.template_no) }

// ── Header CRUD ──────────────────────────────────────────────
function newHeader() {
  Object.assign(hdrForm, { id: null, template_no: '', template_name: '', blocked: 0 })
  hdrDialog.value = true
}
function editHeader(h) {
  Object.assign(hdrForm, { id: h.id, template_no: h.template_no, template_name: h.template_name, blocked: h.blocked })
  hdrDialog.value = true
}
async function saveHeader() {
  saving.value = true; error.value = null
  try {
    if (hdrForm.id) await templatesApi.updateHeader(hdrForm.id, { template_name: hdrForm.template_name, blocked: hdrForm.blocked })
    else await templatesApi.createHeader({ template_no: hdrForm.template_no, template_name: hdrForm.template_name, blocked: hdrForm.blocked })
    hdrDialog.value = false
    await reloadHeaders()
  } catch (e) { fail(e) } finally { saving.value = false }
}
function deleteHeader(h) {
  confirm.require({
    message: `Delete template "${h.template_no}" and all ${h.line_count} line(s)? This cannot be undone.`,
    header: 'Delete template', icon: 'pi pi-exclamation-triangle', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await templatesApi.remove(h.id)
        if (selectedHeader.value?.id === h.id) { selectedHeader.value = null; lines.value = [] }
        await reloadHeaders()
      } catch (e) { fail(e) }
    },
  })
}

// ── Line CRUD ────────────────────────────────────────────────
function newLine() {
  Object.assign(lineForm, {
    id: null, template_no: selectedHeader.value.template_no, item_code: '', description: '',
    percentage: null, units_per_100: null, type: '', main_product: 'No', shortcode: '', unit_measure: '', location: '',
  })
  lineDialog.value = true
}
function editLine(l) {
  Object.assign(lineForm, { ...l })
  lineDialog.value = true
}
async function saveLine() {
  saving.value = true; error.value = null
  try {
    const payload = { ...lineForm }; delete payload.id; delete payload.created_at; delete payload.updated_at
    payload.template_no = selectedHeader.value.template_no
    if (lineForm.id) await templatesApi.updateLine(lineForm.id, payload)
    else await templatesApi.createLine(payload)
    lineDialog.value = false
    await loadLines(selectedHeader.value.template_no)
    await reloadHeaders() // refresh line counts
  } catch (e) { fail(e) } finally { saving.value = false }
}
function deleteLine(l) {
  confirm.require({
    message: `Delete line "${l.item_code}"?`,
    header: 'Delete line', icon: 'pi pi-exclamation-triangle', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await templatesApi.removeLine(l.id)
        await loadLines(selectedHeader.value.template_no)
        await reloadHeaders()
      } catch (e) { fail(e) }
    },
  })
}

// ── Download an upload template (.xlsx) for template lines ───────────────────
const LINE_TEMPLATE_COLUMNS = [
  'item_code', 'description', 'percentage', 'units_per_100',
  'type', 'main_product', 'shortcode', 'unit_measure', 'location',
]
const LINE_SAMPLE_ROW = {
  item_code: 'G2223', description: 'Mix for Smokies', percentage: 100, units_per_100: 89.77,
  type: 'Intake', main_product: 'No', shortcode: '', unit_measure: 'KG', location: '2055',
}
function downloadLineTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet([LINE_SAMPLE_ROW], { header: LINE_TEMPLATE_COLUMNS })
  ws['!cols'] = LINE_TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, ws, 'template_lines')

  const readme = [
    ['Template Lines — Upload Template'],
    [],
    ['Columns (header row is case-insensitive; common aliases like "Item No", "UoM" are accepted):'],
    ...LINE_TEMPLATE_COLUMNS.map(c => [c]),
    [],
    ['item_code is required on every row.'],
    ['REPLACE MODE: uploading wipes ALL existing lines of the selected template'],
    ['and re-creates them from this file. The template header is not changed.'],
    ['You will be asked to confirm before anything is deleted.'],
  ]
  const wsR = XLSX.utils.aoa_to_sheet(readme)
  XLSX.utils.book_append_sheet(wb, wsR, 'README')

  const name = selectedHeader.value ? `template-lines_${selectedHeader.value.template_no}.xlsx` : 'template-lines-template.xlsx'
  XLSX.writeFile(wb, name)
}

// ── Upload lines (REPLACE all lines of the selected template) ────────────────
const lineUploadInput = ref(null)
function triggerLineUpload() { lineUploadInput.value?.click() }

// Accepted header aliases (case-insensitive) → template_lines columns.
const LINE_ALIASES = {
  item_code:     ['item_code', 'item code', 'item', 'item no', 'item_no', 'itemno'],
  description:   ['description', 'desc'],
  percentage:    ['percentage', 'percent', 'perc', '%'],
  units_per_100: ['units_per_100', 'units per 100', 'units/100', 'unitsper100'],
  type:          ['type'],
  main_product:  ['main_product', 'main product', 'main'],
  shortcode:     ['shortcode', 'short code', 'short'],
  unit_measure:  ['unit_measure', 'unit measure', 'uom', 'unit of measure'],
  location:      ['location', 'loc'],
}
function mapLineRow(raw) {
  const lower = {}
  for (const k of Object.keys(raw)) lower[k.trim().toLowerCase()] = raw[k]
  const out = {}
  for (const [target, aliases] of Object.entries(LINE_ALIASES)) {
    for (const a of aliases) {
      if (lower[a] !== undefined && lower[a] !== '') { out[target] = lower[a]; break }
    }
  }
  return out
}
function onLineFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const rows = json.map(mapLineRow).filter(r => r.item_code)
      if (!rows.length) { error.value = 'No usable rows — the file needs at least an item code column.'; return }
      confirmReplaceLines(rows)
    } catch (err) { error.value = 'Could not parse file: ' + err.message }
    finally { e.target.value = '' }
  }
  reader.readAsArrayBuffer(file)
}
function confirmReplaceLines(rows) {
  const no = selectedHeader.value.template_no
  confirm.require({
    header: 'Replace template lines',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Delete & replace',
    message: `This DELETES all ${lines.value.length} existing line(s) of template "${no}" `
      + `and replaces them with ${rows.length} uploaded line(s). This cannot be undone. Continue?`,
    accept: async () => {
      saving.value = true; error.value = null
      try {
        const { data } = await templatesApi.replaceLines(no, rows)
        await loadLines(no)
        await reloadHeaders()
        if (data.errors?.length) error.value = `${data.errors.length} line(s) failed; first: ${data.errors[0].error}`
      } catch (e) { fail(e) } finally { saving.value = false }
    },
  })
}

onMounted(reloadHeaders)
</script>

<style scoped>
.tpl-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; align-items: start; }
@media (max-width: 1100px) { .tpl-layout { grid-template-columns: 1fr; } }
.filter-bar, .action-bar { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 10px; }
.action-bar { align-items: center; }
.lines-search { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.lines-search .pi-search { color: var(--bc-text-muted); }
.f-field { display: flex; flex-direction: column; gap: 4px; }
.f-field.f-grow { flex: 1 1 180px; }
.f-field label { font-size: .8rem; color: var(--text-color-secondary); }
.f-actions { display: flex; gap: 6px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid .f-field { gap: 4px; }
.page-head { margin-bottom: 8px; }
</style>
