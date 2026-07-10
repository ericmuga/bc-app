<template>
  <div class="costing-page">
    <header class="page-head">
      <h2><i class="pi pi-calculator" /> Recipe Data <span class="co-badge">{{ company }}</span></h2>
      <p class="text-muted text-sm">
        Source: <code>WMS.{{ dbName }}.dbo.RecipeData</code>. Rows are grouped by recipe; bulk uploads upsert on
        <strong>Process + output_item + input_item</strong>.
      </p>
    </header>

    <!-- ── Filter bar ──────────────────────────────────────────── -->
    <section class="filter-bar">
      <div class="f-field f-grow">
        <label>Search</label>
        <InputText v-model="filter.q" placeholder="process / item / description / recipe…" fluid
                   @keyup.enter="reload" />
      </div>
      <div class="f-field">
        <label>Process</label>
        <Select v-model="filter.process" :options="processOptions" placeholder="All" show-clear fluid
                @change="reload" />
      </div>
      <div class="f-field">
        <label>Recipe</label>
        <Select v-model="filter.recipe" :options="recipeOptions" option-label="label" option-value="value"
                placeholder="All recipes" show-clear filter fluid @change="reload" />
      </div>
      <div class="f-field">
        <label>Output Item</label>
        <InputText v-model="filter.outputItem" placeholder="e.g. KG-SAU-B…" fluid @keyup.enter="reload" />
      </div>
      <div class="f-field">
        <label>Input Item</label>
        <InputText v-model="filter.inputItem" placeholder="e.g. RM-…" fluid @keyup.enter="reload" />
      </div>
      <div class="f-actions">
        <Button label="Search" icon="pi pi-search" @click="reload" :loading="loading" />
        <Button icon="pi pi-refresh" text @click="resetFilters" v-tooltip="'Clear filters'" />
      </div>
    </section>

    <!-- ── Action bar ──────────────────────────────────────────── -->
    <section class="action-bar">
      <Button label="New row"          icon="pi pi-plus"      size="small"  @click="newRow" />
      <Button label="Download template" icon="pi pi-file-excel" text size="small" @click="downloadTemplate" />
      <Button label="Export visible"    icon="pi pi-download"  text size="small" :disabled="!rows.length"
              @click="exportCurrent" />
      <Button label="Upload (Excel)"    icon="pi pi-upload"    severity="secondary" size="small"
              @click="openImport" />
      <span class="text-muted text-sm" style="margin-left:auto">{{ rows.length }} rows in {{ groupCount }} recipes</span>
    </section>

    <Message v-if="error" severity="error" :closable="true" @close="error=null" style="margin:8px 0">{{ error }}</Message>

    <!-- ── Grouped DataTable ───────────────────────────────────── -->
    <DataTable
      :value="rows"
      :loading="loading"
      data-key="id"
      size="small"
      sortMode="single"
      rowGroupMode="subheader"
      groupRowsBy="recipe"
      sortField="recipe"
      :sortOrder="1"
      stripedRows
      :rowHover="true"
      paginator
      :rows="50"
      :rowsPerPageOptions="[25, 50, 100, 200]"
      class="costing-table"
      v-model:filters="tableFilters"
      filterDisplay="menu"
      :globalFilterFields="['Process', 'output_item', 'output_item_dec', 'input_item', 'input_item_desc', 'recipe']"
    >
      <template #header>
        <div style="display:flex;align-items:center;gap:10px">
          <i class="pi pi-search" />
          <InputText v-model="tableFilters.global.value" placeholder="Quick filter visible rows" style="width:260px" />
          <span class="text-muted text-sm">Type to refine without re-querying the server.</span>
        </div>
      </template>

      <template #groupheader="{ data }">
        <div class="recipe-group">
          <i class="pi pi-bookmark" />
          <strong>{{ data.recipe || '(no recipe code)' }}</strong>
          <span class="text-muted">— {{ data.output_item }} {{ data.output_item_dec ? '· ' + data.output_item_dec : '' }}</span>
          <span class="text-muted text-sm" style="margin-left:6px">[{{ data.Process }}]</span>
          <Button icon="pi pi-trash" text severity="danger" size="small"
                  style="margin-left:auto"
                  v-tooltip="'Delete entire recipe'"
                  :disabled="!data.recipe"
                  @click="deleteRecipe(data)" />
        </div>
      </template>

      <Column field="Process"           header="Process"     style="width:120px" sortable />
      <Column field="output_item"       header="Output Item" style="width:130px" sortable />
      <Column field="output_item_dec"   header="Output Desc" style="min-width:160px" />
      <Column field="output_item_uom"   header="UoM"         style="width:70px" />
      <Column field="batch_size"        header="Batch"       style="width:80px;text-align:right">
        <template #body="{ data }">{{ fmtNum(data.batch_size) }}</template>
      </Column>
      <Column field="output_item_location" header="Out Loc"  style="width:90px" />
      <Column field="input_item"        header="Input Item"  style="width:130px" sortable />
      <Column field="input_item_desc"   header="Input Desc"  style="min-width:160px" />
      <Column field="input_item_uom"    header="UoM"         style="width:70px" />
      <Column field="input_item_qt_per" header="Qty/Batch"   style="width:90px;text-align:right">
        <template #body="{ data }">{{ fmtNum(data.input_item_qt_per) }}</template>
      </Column>
      <Column field="input_item_location" header="In Loc"    style="width:90px" />
      <Column field="process_code"      header="Proc Code"   style="width:100px" />
      <Column field="routing"           header="Routing"     style="width:90px" />
      <Column header="" style="width:90px">
        <template #body="{ data }">
          <div class="row-actions">
            <Button icon="pi pi-pencil" text size="small" @click="editRow(data)" v-tooltip="'Edit'" />
            <Button icon="pi pi-trash"  text size="small" severity="danger"
                    @click="deleteSingle(data)" v-tooltip="'Delete row'" />
          </div>
        </template>
      </Column>

      <template #empty>
        <div style="padding:24px;text-align:center" class="text-muted">No rows match your filters.</div>
      </template>
    </DataTable>

    <!-- ── Edit / New dialog ───────────────────────────────────── -->
    <Dialog v-model:visible="editVisible" :header="form.id ? `Edit row #${form.id}` : 'New recipe line'"
            :modal="true" :style="{ width: '760px', maxWidth: '95vw' }">
      <div class="form-grid">
        <div class="f-field">
          <label>Process *</label>
          <InputText v-model="form.Process" fluid />
        </div>
        <div class="f-field">
          <label>Recipe (code)</label>
          <InputText v-model="form.recipe" fluid />
        </div>
        <div class="f-field">
          <label>Output Item *</label>
          <InputText v-model="form.output_item" fluid />
        </div>
        <div class="f-field">
          <label>Output Description</label>
          <InputText v-model="form.output_item_dec" fluid />
        </div>
        <div class="f-field">
          <label>Output UoM *</label>
          <InputText v-model="form.output_item_uom" fluid />
        </div>
        <div class="f-field">
          <label>Batch Size *</label>
          <InputNumber v-model="form.batch_size" mode="decimal" :minFractionDigits="0" :maxFractionDigits="4" fluid />
        </div>
        <div class="f-field">
          <label>Output Location *</label>
          <InputText v-model="form.output_item_location" fluid />
        </div>
        <div class="f-field f-spacer"></div>

        <div class="f-field">
          <label>Input Item *</label>
          <InputText v-model="form.input_item" fluid />
        </div>
        <div class="f-field">
          <label>Input Description</label>
          <InputText v-model="form.input_item_desc" fluid />
        </div>
        <div class="f-field">
          <label>Input UoM *</label>
          <InputText v-model="form.input_item_uom" fluid />
        </div>
        <div class="f-field">
          <label>Qty per Batch *</label>
          <InputNumber v-model="form.input_item_qt_per" mode="decimal" :minFractionDigits="0" :maxFractionDigits="6" fluid />
        </div>
        <div class="f-field">
          <label>Input Location *</label>
          <InputText v-model="form.input_item_location" fluid />
        </div>
        <div class="f-field f-spacer"></div>

        <div class="f-field">
          <label>Process Code</label>
          <InputText v-model="form.process_code" fluid />
        </div>
        <div class="f-field">
          <label>No. Series</label>
          <InputText v-model="form.no_series" fluid />
        </div>
        <div class="f-field">
          <label>Routing</label>
          <InputText v-model="form.routing" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="editVisible=false" />
        <Button :label="form.id ? 'Save changes' : 'Create'" icon="pi pi-save"
                :loading="saving" @click="saveRow" />
      </template>
    </Dialog>

    <!-- ── Upload dialog ───────────────────────────────────────── -->
    <Dialog v-model:visible="upload.visible" header="Bulk upload (Excel / CSV)"
            :modal="true" :style="{ width: '880px', maxWidth: '95vw' }">
      <p class="text-muted text-sm">
        Upload an <code>.xlsx</code> or <code>.csv</code> file. Header row must match the template column names
        (case-insensitive). <strong>Replace mode:</strong> every <code>recipe</code> in the file is wiped and
        re-created from the uploaded rows (delete-then-insert). You'll be asked to confirm.
      </p>
      <div class="upload-actions">
        <Button label="Download template (.xlsx)" icon="pi pi-file-excel" text size="small"
                @click="downloadTemplate" />
        <input ref="uploadInput" type="file" accept=".xlsx,.xls,.csv" @change="onUploadFile" />
      </div>

      <Message v-if="upload.parseError" severity="error">{{ upload.parseError }}</Message>

      <div v-if="upload.rows.length" style="margin-top:8px">
        <strong>Preview: first {{ Math.min(upload.rows.length, 50) }} of {{ upload.rows.length }} rows.</strong>
        <DataTable :value="upload.rows.slice(0, 50)" size="small" stripedRows
                   :scrollable="true" scrollHeight="280px" data-key="_idx">
          <Column field="Process"            header="Process" />
          <Column field="output_item"        header="Output" />
          <Column field="recipe"             header="Recipe" />
          <Column field="output_item_uom"    header="O-UoM" />
          <Column field="batch_size"         header="Batch" />
          <Column field="output_item_location" header="O-Loc" />
          <Column field="input_item"         header="Input" />
          <Column field="input_item_uom"     header="I-UoM" />
          <Column field="input_item_qt_per"  header="Qty" />
          <Column field="input_item_location" header="I-Loc" />
        </DataTable>
      </div>

      <Message v-if="upload.result" :severity="upload.result.errors?.length ? 'warn' : 'success'" style="margin-top:8px">
        Recipes replaced: <strong>{{ upload.result.recipesReplaced }}</strong> ·
        Rows deleted: <strong>{{ upload.result.deleted }}</strong> ·
        Rows inserted: <strong>{{ upload.result.inserted }}</strong> ·
        Errors: <strong>{{ upload.result.errors?.length || 0 }}</strong>
        <div v-if="upload.result.errors?.length" style="margin-top:6px">
          <details>
            <summary>{{ upload.result.errors.length }} row(s) failed — click to expand</summary>
            <ul style="margin:6px 0 0 14px">
              <li v-for="e in upload.result.errors.slice(0, 25)" :key="e.rowIndex">
                Row {{ e.rowIndex + 2 }}: {{ e.error }}
              </li>
              <li v-if="upload.result.errors.length > 25" class="text-muted">… and {{ upload.result.errors.length - 25 }} more</li>
            </ul>
          </details>
        </div>
      </Message>

      <template #footer>
        <Button label="Close" text @click="upload.visible=false" />
        <Button label="Replace recipes" icon="pi pi-cloud-upload" severity="danger"
                :disabled="!upload.rows.length"
                :loading="upload.posting"
                @click="postUpload" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Message from 'primevue/message'
import { useConfirm } from 'primevue/useconfirm'
import { watch } from 'vue'
import { costingApi } from '@/services/costing.js'

const confirm = useConfirm()

// Which WMS company database to operate on (FCL → calibra, CM → cml-calibra).
const props = defineProps({ company: { type: String, default: 'FCL' } })

// ── state ──────────────────────────────────────────────────────────────────
const rows    = ref([])
const loading = ref(false)
const error   = ref(null)
const saving  = ref(false)

const filter = reactive({
  q: '', process: null, recipe: null, outputItem: '', inputItem: '',
})

const processOptions = ref([])
const recipeOptions  = ref([])

const tableFilters = ref({
  global: { value: null, matchMode: 'contains' },
})

const groupCount = computed(() => new Set(rows.value.map(r => r.recipe || '(none)')).size)
const dbName = computed(() => (props.company === 'CM' ? 'cml-calibra' : 'calibra'))

// ── edit dialog ────────────────────────────────────────────────────────────
const editVisible = ref(false)
const form = reactive(blankForm())
function blankForm() {
  return {
    id: null,
    Process: '', output_item: '', recipe: '', output_item_dec: '',
    output_item_uom: '', batch_size: null, output_item_location: '',
    input_item: '', input_item_desc: '',
    input_item_uom: '', input_item_qt_per: null, input_item_location: '',
    process_code: '', no_series: '', routing: '',
  }
}
function assignForm(row) {
  Object.assign(form, blankForm(), row || {})
}

function newRow() {
  assignForm(null)
  // Pre-fill new line with the currently filtered recipe / process when set
  if (filter.recipe)  form.recipe  = filter.recipe
  if (filter.process) form.Process = filter.process
  editVisible.value = true
}

function editRow(row) {
  assignForm(row)
  editVisible.value = true
}

async function saveRow() {
  saving.value = true
  error.value  = null
  try {
    const body = { ...form }
    if (form.id) {
      await costingApi.update(form.id, body, props.company)
    } else {
      await costingApi.create(body, props.company)
    }
    editVisible.value = false
    await reload()
    await loadLookups()
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    saving.value = false
  }
}

function deleteSingle(row) {
  confirm.require({
    message: `Delete row #${row.id} (${row.output_item} ← ${row.input_item})?`,
    header: 'Confirm delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try { await costingApi.remove(row.id, props.company); await reload() }
      catch (e) { error.value = e.response?.data?.error || e.message }
    },
  })
}

function deleteRecipe(group) {
  if (!group.recipe) return
  confirm.require({
    message: `Delete ALL input lines for recipe "${group.recipe}"? This cannot be undone.`,
    header: 'Delete entire recipe',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', text: true },
    acceptProps: { label: 'Delete recipe', severity: 'danger' },
    accept: async () => {
      try { await costingApi.removeRecipe(group.recipe, props.company); await reload(); await loadLookups() }
      catch (e) { error.value = e.response?.data?.error || e.message }
    },
  })
}

// ── data loading ───────────────────────────────────────────────────────────
async function reload() {
  loading.value = true
  error.value   = null
  try {
    const { data } = await costingApi.list({
      q:          filter.q || undefined,
      process:    filter.process || undefined,
      recipe:     filter.recipe || undefined,
      outputItem: filter.outputItem || undefined,
      inputItem:  filter.inputItem || undefined,
      company:    props.company,
    })
    rows.value = data
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filter.q = ''
  filter.process = null
  filter.recipe = null
  filter.outputItem = ''
  filter.inputItem = ''
  reload()
}

async function loadLookups() {
  try {
    const [proc, rec] = await Promise.all([costingApi.processes(props.company), costingApi.recipes(props.company)])
    processOptions.value = proc.data
    recipeOptions.value  = rec.data
      .filter(r => r.recipe)
      .map(r => ({ value: r.recipe, label: `${r.recipe} — ${r.output_item || ''} (${r.line_count} lines)` }))
  } catch {
    /* don't block page on lookup errors */
  }
}

// ── template / export ──────────────────────────────────────────────────────
const TEMPLATE_COLUMNS = [
  'Process', 'output_item', 'recipe', 'output_item_dec', 'output_item_uom',
  'batch_size', 'output_item_location', 'input_item', 'input_item_desc',
  'input_item_uom', 'input_item_qt_per', 'input_item_location',
  'process_code', 'no_series', 'routing',
]

const TEMPLATE_SAMPLE_ROW = {
  Process: 'CUTTING',
  output_item: 'KG-FIL-RIB',
  recipe: 'RCP-RIB-001',
  output_item_dec: 'Pork ribs, retail pack',
  output_item_uom: 'KG',
  batch_size: 100,
  output_item_location: 'NRB-FG',
  input_item: 'RM-PORK-CARCASS',
  input_item_desc: 'Pork carcass — chilled',
  input_item_uom: 'KG',
  input_item_qt_per: 110,
  input_item_location: 'NRB-RM',
  process_code: 'CUT-01',
  no_series: 'RCP',
  routing: 'CUT-PRIMARY',
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet([TEMPLATE_SAMPLE_ROW], { header: TEMPLATE_COLUMNS })
  ws['!cols'] = TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, ws, 'RecipeData')

  // Second sheet: README
  const readme = [
    ['RecipeData — Upload Template'],
    [],
    ['Required columns (any extra columns are ignored):'],
    ...TEMPLATE_COLUMNS.map(c => [c]),
    [],
    ['Upsert key: Process + output_item + input_item'],
    ['Rows matching an existing combination are UPDATED.'],
    ['Rows that do not match are INSERTED.'],
  ]
  const wsR = XLSX.utils.aoa_to_sheet(readme)
  XLSX.utils.book_append_sheet(wb, wsR, 'README')

  XLSX.writeFile(wb, 'recipe-data-template.xlsx')
}

function exportCurrent() {
  if (!rows.value.length) return
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows.value.map(r => {
    const o = {}
    for (const c of TEMPLATE_COLUMNS) o[c] = r[c] ?? ''
    o.id         = r.id
    o.created_at = r.created_at
    o.updated_at = r.updated_at
    return o
  }))
  XLSX.utils.book_append_sheet(wb, ws, 'RecipeData')
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `recipe-data-${stamp}.xlsx`)
}

// ── upload ─────────────────────────────────────────────────────────────────
const uploadInput = ref(null)
const upload = reactive({
  visible: false,
  rows: [],
  parseError: '',
  posting: false,
  result: null,
})

function openImport() {
  upload.visible = true
  upload.rows = []
  upload.parseError = ''
  upload.result = null
  if (uploadInput.value) uploadInput.value.value = ''
}

// Build a header lookup that's tolerant of casing and a few common variants.
const HEADER_ALIASES = {
  process:              'Process',
  output_item:          'output_item',
  'output item':        'output_item',
  recipe:               'recipe',
  output_item_dec:      'output_item_dec',
  'output description': 'output_item_dec',
  output_item_uom:      'output_item_uom',
  'output uom':         'output_item_uom',
  batch_size:           'batch_size',
  'batch size':         'batch_size',
  output_item_location: 'output_item_location',
  'output location':    'output_item_location',
  input_item:           'input_item',
  'input item':         'input_item',
  input_item_desc:      'input_item_desc',
  'input description':  'input_item_desc',
  input_item_uom:       'input_item_uom',
  'input uom':          'input_item_uom',
  input_item_qt_per:    'input_item_qt_per',
  'qty per batch':      'input_item_qt_per',
  'qty/batch':          'input_item_qt_per',
  input_item_location:  'input_item_location',
  'input location':     'input_item_location',
  process_code:         'process_code',
  no_series:            'no_series',
  'no. series':         'no_series',
  routing:              'routing',
}

function normaliseHeader(h) {
  const key = String(h || '').trim().toLowerCase()
  return HEADER_ALIASES[key] || null
}

function parseSheet(sheet) {
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
  if (!json.length) return { rows: [], headers: [] }

  // Build a per-source-header → target mapping using the first row's keys.
  const sourceKeys = Object.keys(json[0])
  const mapping = {}
  for (const k of sourceKeys) {
    const target = normaliseHeader(k)
    if (target) mapping[k] = target
  }
  const out = []
  for (let i = 0; i < json.length; i++) {
    const src = json[i]
    const tgt = { _idx: i }
    for (const [k, target] of Object.entries(mapping)) {
      let v = src[k]
      if (typeof v === 'string') v = v.trim()
      tgt[target] = v === '' ? null : v
    }
    // Skip blank rows
    if (!tgt.Process && !tgt.output_item && !tgt.input_item) continue
    out.push(tgt)
  }
  return { rows: out, headers: sourceKeys }
}

function onUploadFile(ev) {
  upload.parseError = ''
  upload.rows = []
  upload.result = null
  const file = ev.target?.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = new Uint8Array(reader.result)
      const wb = XLSX.read(data, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        upload.parseError = 'Workbook has no sheets.'
        return
      }
      const { rows: parsed } = parseSheet(wb.Sheets[sheetName])
      if (!parsed.length) {
        upload.parseError = 'No usable rows. Header must include at least Process, output_item, input_item.'
        return
      }
      // Sanity check first row contains the key columns
      const sample = parsed[0]
      if (!('Process' in sample) || !('output_item' in sample) || !('input_item' in sample)) {
        upload.parseError = 'Required columns not found. Use the template — needs Process, output_item, input_item at minimum.'
        return
      }
      upload.rows = parsed
    } catch (e) {
      upload.parseError = `Failed to parse file: ${e.message}`
    }
  }
  reader.readAsArrayBuffer(file)
}

function postUpload() {
  if (!upload.rows.length) return
  const recipes = [...new Set(upload.rows.map(r => r.recipe).filter(Boolean))]
  const noRecipe = upload.rows.filter(r => !r.recipe).length
  if (!recipes.length) {
    error.value = 'Every row must have a "recipe" code — replace works per recipe.'
    return
  }
  const preview = recipes.slice(0, 6).join(', ') + (recipes.length > 6 ? '…' : '')
  confirm.require({
    header: 'Replace recipe(s) entirely',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Delete & replace',
    message: `This DELETES all existing rows for ${recipes.length} recipe(s) [${preview}] `
      + `and replaces them with the ${upload.rows.length - noRecipe} uploaded row(s).`
      + (noRecipe ? ` ${noRecipe} row(s) without a recipe code will be skipped.` : '')
      + ' This cannot be undone. Continue?',
    accept: runReplaceUpload,
  })
}

async function runReplaceUpload() {
  upload.posting = true
  upload.result = null
  try {
    const payload = upload.rows.map(r => {
      const { _idx, ...rest } = r
      return rest
    })
    const { data } = await costingApi.bulkReplace(payload, props.company)
    upload.result = data
    if (!data.errors?.length) {
      // refresh underlying data; keep dialog open so user can see the summary
      await reload()
      await loadLookups()
    }
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    upload.posting = false
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
function fmtNum(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-KE', { maximumFractionDigits: 4 }) : v
}

onMounted(async () => {
  await Promise.all([loadLookups(), reload()])
})

// Re-load when navigating between the FCL and CM Recipe Data pages (same component).
watch(() => props.company, async () => {
  resetFilters()
  await loadLookups()
})
</script>

<style scoped>
.costing-page { padding: 4px 0 24px; }
.page-head h2 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.co-badge { font-size: 12px; font-weight: 700; letter-spacing: .04em; padding: 2px 8px;
  border-radius: 6px; background: var(--bc-primary); color: #fff; }
.page-head p  { margin: 0 0 14px; }

.filter-bar {
  display: grid;
  grid-template-columns: 2fr 1fr 1.5fr 1fr 1fr auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
  background: var(--bc-surface-card);
  border: 1px solid var(--bc-border);
  border-radius: 8px;
}
.f-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.f-field label { font-size: 11px; font-weight: 600; color: var(--bc-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.f-grow { min-width: 220px; }
.f-actions { display: flex; gap: 6px; }

.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  margin: 10px 0 4px;
}

.recipe-group {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  background: var(--bc-surface-raised);
  border-radius: 4px;
}
.recipe-group strong { font-size: 13px; }

.row-actions { display: flex; gap: 2px; justify-content: flex-end; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px 14px;
}
.f-spacer { display: none; }

.upload-actions {
  display: flex; align-items: center; gap: 12px; margin: 8px 0;
}
.upload-actions input[type="file"] { font-size: 13px; }

@media (max-width: 900px) {
  .filter-bar { grid-template-columns: 1fr 1fr; }
  .form-grid  { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .filter-bar { grid-template-columns: 1fr; }
  .form-grid  { grid-template-columns: 1fr; }
}
</style>
