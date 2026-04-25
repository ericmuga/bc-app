<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Admin Setup</h2>
        <p class="text-muted text-sm">Manage users, SMTP, scheduled reports, and management account templates.</p>
      </div>
      <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadAll" :loading="loading" />
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-3">{{ error }}</Message>

    <div class="admin-sections">

      <!-- ── Users ──────────────────────────────────────────────────────── -->
      <details class="admin-accordion" open>
        <summary>
          <i class="pi pi-users acc-icon" />
          <span>Users</span>
          <span class="acc-count">{{ users.length }}</span>
        </summary>
        <div class="accordion-body">
          <p class="text-muted text-sm">Admin sees everything. Sales/Analyst see reports. Finance sees finance reports. Dispatch sees orders. Security sees invoices.</p>
          <DataTable :value="users" dataKey="userId" size="small" responsive-layout="scroll">
            <Column field="displayName" header="Name" style="min-width:180px">
              <template #body="{ data }"><InputText v-model="data.displayName" fluid /></template>
            </Column>
            <Column field="username" header="Username" style="min-width:140px" />
            <Column field="email" header="Email" style="min-width:180px">
              <template #body="{ data }"><InputText v-model="data.email" fluid /></template>
            </Column>
            <Column field="role" header="Role" style="min-width:140px">
              <template #body="{ data }">
                <Select v-model="data.role" :options="roleOptions" option-label="label" option-value="value" fluid />
              </template>
            </Column>
            <Column header="Active" style="width:90px">
              <template #body="{ data }"><Checkbox v-model="data.isActive" binary /></template>
            </Column>
            <Column header="" style="width:90px">
              <template #body="{ data }"><Button icon="pi pi-save" text @click="saveUser(data)" /></template>
            </Column>
          </DataTable>
        </div>
      </details>

      <!-- ── SMTP Setup ──────────────────────────────────────────────────── -->
      <details class="admin-accordion">
        <summary>
          <i class="pi pi-envelope acc-icon" />
          <span>SMTP Setup</span>
        </summary>
        <div class="accordion-body">
          <p class="text-muted text-sm">Stored in the app database and used for scheduled report delivery. Environment variables still work as fallback.</p>
          <div class="schedule-form">
            <InputText v-model="smtpForm.host" placeholder="SMTP host" />
            <InputText v-model="smtpForm.port" placeholder="Port" />
            <InputText v-model="smtpForm.from" placeholder="From email" />
            <InputText v-model="smtpForm.user" placeholder="SMTP user" />
            <InputText v-model="smtpForm.pass" type="password" placeholder="SMTP password" />
            <div class="schedule-toggle">
              <Checkbox v-model="smtpForm.secure" binary input-id="smtp-secure" />
              <label for="smtp-secure">Secure / SSL</label>
            </div>
          </div>
          <div class="schedule-actions">
            <Button label="Save SMTP" icon="pi pi-save" @click="saveSmtp" :loading="savingSmtp" />
          </div>
        </div>
      </details>

      <!-- ── Scheduled Sales Reports ────────────────────────────────────── -->
      <details class="admin-accordion">
        <summary>
          <i class="pi pi-calendar-clock acc-icon" />
          <span>Scheduled Sales Reports</span>
          <span class="acc-count">{{ schedules.length }}</span>
        </summary>
        <div class="accordion-body">
          <p class="text-muted text-sm">Each schedule can target a different set of users and run every 2, 4, 6, 8, or 12 hours, or on daily/weekly/monthly cadence.</p>
          <div class="acc-form-header">
            <span class="text-muted text-sm">{{ scheduleForm.scheduleId ? 'Edit schedule' : 'New schedule' }}</span>
            <span class="recipient-pill">{{ scheduleForm.recipientUserIds.length }} recipient(s)</span>
          </div>
          <div class="schedule-form">
            <InputText v-model="scheduleForm.name" placeholder="Schedule name" />
            <Select v-model="scheduleForm.reportType" :options="reportTypeOptions" option-label="label" option-value="value" placeholder="Report type" />
            <Select v-model="scheduleForm.deliveryFormat" :options="formatOptions" option-label="label" option-value="value" placeholder="Format" />
            <Select v-model="scheduleForm.frequency" :options="frequencyOptions" option-label="label" option-value="value" placeholder="Frequency" />
            <Select v-if="scheduleForm.frequency === 'interval'" v-model="scheduleForm.intervalHours" :options="intervalOptions" option-label="label" option-value="value" placeholder="Every n hours" />
            <InputText v-model="scheduleForm.timeOfDay" placeholder="HH:mm" />
            <InputNumber v-model="scheduleForm.lookbackDays" :min="1" show-buttons fluid placeholder="Lookback days" />
            <Select v-if="scheduleForm.frequency === 'weekly'" v-model="scheduleForm.dayOfWeek" :options="dayOptions" option-label="label" option-value="value" placeholder="Day of week" />
            <InputNumber v-if="scheduleForm.frequency === 'monthly'" v-model="scheduleForm.dayOfMonth" :min="1" :max="31" show-buttons fluid placeholder="Day of month" />
          </div>
          <MultiSelect v-model="scheduleForm.recipientUserIds" :options="recipientOptions" option-label="label" option-value="value" display="chip" placeholder="Recipients" filter />
          <div class="filter-grid">
            <MultiSelect v-model="scheduleForm.filters.companies" :options="companyOptions" option-label="label" option-value="value" display="chip" placeholder="Companies" filter />
            <MultiSelect v-model="scheduleForm.filters.docTypes" :options="docTypeOptions" option-label="label" option-value="value" display="chip" placeholder="Document types" />
            <Select v-model="scheduleForm.filters.productType" :options="productTypeOptions" option-label="label" option-value="value" placeholder="Product type" />
            <Select v-model="scheduleForm.filters.genBusMode" :options="marketTypeOptions" option-label="label" option-value="value" placeholder="Market type" />
            <Select v-model="scheduleForm.filters.weekDimension" :options="weekDimensionOptions" option-label="label" option-value="value" placeholder="Week comparison by" />
            <MultiSelect v-model="scheduleForm.filters.daysOfWeek" :options="dayOptions" option-label="label" option-value="value" display="chip" placeholder="Days of week" />
          </div>
          <div class="schedule-actions">
            <div class="schedule-toggle">
              <Checkbox v-model="scheduleForm.isActive" binary input-id="schedule-active" />
              <label for="schedule-active">Active</label>
            </div>
            <Button label="Save Schedule" icon="pi pi-save" @click="saveSchedule" :loading="savingSchedule" />
            <Button label="Clear" icon="pi pi-times" text @click="resetScheduleForm" />
          </div>
          <DataTable :value="schedules" dataKey="scheduleId" size="small" responsive-layout="scroll">
            <Column field="name" header="Name" style="min-width:180px" />
            <Column field="reportType" header="Report" style="min-width:130px" />
            <Column field="deliveryFormat" header="Format" style="width:90px" />
            <Column field="frequency" header="Frequency" style="width:100px" />
            <Column header="Recipients" style="width:100px">
              <template #body="{ data }">{{ data.recipientUserIds?.length || 0 }}</template>
            </Column>
            <Column field="nextRunAt" header="Next Run" style="min-width:150px">
              <template #body="{ data }">{{ fmtDateTime(data.nextRunAt) }}</template>
            </Column>
            <Column field="lastStatus" header="Last Status" style="width:100px" />
            <Column header="" style="width:170px">
              <template #body="{ data }">
                <div class="row-actions">
                  <Button icon="pi pi-pencil" text @click="editSchedule(data)" />
                  <Button icon="pi pi-play" text @click="runSchedule(data)" />
                  <Button icon="pi pi-trash" text severity="danger" @click="deleteSchedule(data)" />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </details>

      <!-- ── Management Account Builder ────────────────────────────────────── -->
      <details class="admin-accordion" open>
        <summary>
          <i class="pi pi-table acc-icon" />
          <span>Management Account Builder</span>
          <span class="acc-count">{{ templates.length }} template(s)</span>
        </summary>
        <div class="accordion-body">
          <p class="text-muted text-sm">Define report templates with formula-driven lines and measure columns. Each line uses a text formula like <code>FCL_33000 + CM_30000:39999</code>. Each measure defines a SQL query returning AccountNo + Amount rows (use <code>{GL_ENTRY}</code>, <code>@ReferenceDate</code>, <code>@Dim1Code</code>, <code>@Dim2Code</code>).</p>

        <!-- ── User guide ─────────────────────────────────────────────────── -->
        <details class="guide-box">
          <summary><i class="pi pi-question-circle" /> Formula &amp; SQL Reference</summary>
          <div class="guide-body">

            <div class="guide-section">
              <h5>Line Formula Syntax</h5>
              <p>Each <strong>data</strong> line has a text formula that specifies which GL accounts to sum, from which companies, with what sign.</p>
              <table class="guide-table">
                <thead><tr><th>Token</th><th>Meaning</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td><code>COMPANY_ACCT</code></td><td>Single account from a company</td><td><code>FCL_33000</code></td></tr>
                  <tr><td><code>COMPANY_FROM:TO</code></td><td>Account range (inclusive)</td><td><code>CM_30000:39999</code></td></tr>
                  <tr><td><code>+</code> / <code>-</code></td><td>Add or subtract the token (default is +)</td><td><code>FCL_33000 - FCL_34000</code></td></tr>
                  <tr><td><code>ALL_ACCT</code></td><td>Same account across all companies</td><td><code>ALL_33000</code></td></tr>
                </tbody>
              </table>
              <p class="guide-example"><strong>Example:</strong> <code>FCL_30000:39999 + CM_30000:39999 - FCL_35000</code></p>
            </div>

            <div class="guide-section">
              <h5>Measure SQL Query</h5>
              <p>Each measure's SQL runs once per company referenced in the line formula. It must return two columns: <code>AccountNo</code> and <code>Amount</code>.</p>
              <table class="guide-table">
                <thead><tr><th>Placeholder / Parameter</th><th>What it becomes</th></tr></thead>
                <tbody>
                  <tr><td><code>{GL_ENTRY}</code></td><td>The BC G/L Entry table for the current company</td></tr>
                  <tr><td><code>@ReferenceDate</code></td><td>The reference date selected in the report filter</td></tr>
                  <tr><td><code>@Dim1Code</code></td><td>Comma-separated DEPARTMENT codes (empty = no filter)</td></tr>
                  <tr><td><code>@Dim2Code</code></td><td>Comma-separated PROJECT codes (empty = no filter)</td></tr>
                </tbody>
              </table>
              <p class="guide-example"><strong>MTD example:</strong></p>
              <pre class="guide-pre">SELECT [G_L Account No_] AS AccountNo, SUM([Amount]) AS Amount
FROM {GL_ENTRY}
WHERE [Posting Date] >= DATEFROMPARTS(YEAR(@ReferenceDate),MONTH(@ReferenceDate),1)
  AND [Posting Date] &lt;= EOMONTH(@ReferenceDate)
  AND (@Dim1Code='' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim1Code,',')))
  AND (@Dim2Code='' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim2Code,',')))
GROUP BY [G_L Account No_]</pre>
            </div>

            <div class="guide-section">
              <h5>Enabled Measures per Line</h5>
              <p>By default all measure columns are computed for every line. Tick specific measures to only populate those columns for that line — useful for lines that are only relevant in certain periods (e.g. a budget line that only has YTD data).</p>
            </div>

          </div>
        </details>

        <!-- Top tier: Templates | Lines | Measures -->
        <div class="builder-layout">

          <!-- Templates -->
          <div class="builder-panel">
            <div class="builder-panel-head">
              <h4>Templates</h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New template'" @click="newTemplate" />
            </div>
            <div v-if="editingTemplate" class="builder-form">
              <InputText v-model="templateForm.templateName" placeholder="Template name" />
              <InputText v-model="templateForm.description"  placeholder="Description (optional)" />
              <InputNumber v-model="templateForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort order" />
              <div class="schedule-actions" style="margin-top:0">
                <Button label="Save" icon="pi pi-save" size="small" @click="saveTemplate" :loading="savingTemplate" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="cancelTemplate" />
              </div>
            </div>
            <DataTable :value="templates" dataKey="TemplateId" size="small"
              selection-mode="single" v-model:selection="selectedTemplate" @row-select="onTemplateSelect">
              <Column field="TemplateName" header="Template" style="min-width:160px" />
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click.stop="editTemplate(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click.stop="deleteTemplate(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>

          <!-- Lines (visible when template selected) -->
          <div class="builder-panel" v-if="selectedTemplate">
            <div class="builder-panel-head">
              <h4>Lines <span class="builder-sub-title">— {{ selectedTemplate.TemplateName }}</span></h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New line'" @click="newLine" />
            </div>
            <div v-if="editingLine" class="builder-form">
              <InputText v-model="lineForm.lineCode"  placeholder="Code (e.g. SALES_FCL)" />
              <InputText v-model="lineForm.lineLabel" placeholder="Label" />
              <Select v-model="lineForm.lineType" :options="lineTypeOptions" option-label="label" option-value="value" placeholder="Type" />
              <InputText v-if="lineForm.lineType === 'subtotal'" v-model="lineForm.subtotalOf" placeholder="Sum of codes (comma-separated)" />
              <InputNumber v-model="lineForm.indentLevel" :min="0" :max="4" show-buttons fluid placeholder="Indent level" />
              <div class="builder-checks">
                <Checkbox v-model="lineForm.isBold"    binary input-id="line-bold" /><label for="line-bold">Bold</label>
                <Checkbox v-model="lineForm.isNegated" binary input-id="line-neg"  /><label for="line-neg">Negate sign</label>
              </div>
              <InputNumber v-model="lineForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort order" />

              <!-- Formula text (data lines only) -->
              <template v-if="lineForm.lineType === 'data'">
                <label class="formula-label" style="margin-top:4px">
                  GL Formula — e.g. <code>FCL_33000 + CM_30000:39999 - FCL_40000</code>
                </label>
                <Textarea v-model="lineForm.formula" :rows="3" placeholder="FCL_33000 + CM_30000:39999"
                  style="font-family:monospace;font-size:12px;width:100%" fluid auto-resize />

                <!-- Enabled measures checkboxes -->
                <template v-if="measures.length">
                  <label class="formula-label" style="margin-top:4px">
                    Enabled measures <span class="hint">(all enabled when none ticked)</span>
                  </label>
                  <div style="display:flex;flex-wrap:wrap;gap:10px">
                    <div v-for="m in measures" :key="m.MeasureCode" class="builder-checks">
                      <Checkbox :input-id="`em-${m.MeasureCode}`" binary
                        :model-value="lineEnabledMeasures.includes(m.MeasureCode)"
                        @update:model-value="toggleEnabledMeasure(m.MeasureCode, $event)" />
                      <label :for="`em-${m.MeasureCode}`">{{ m.MeasureLabel }}</label>
                    </div>
                  </div>
                </template>
              </template>

              <div class="schedule-actions" style="margin-top:0">
                <Button label="Save" icon="pi pi-save" size="small" @click="saveLine" :loading="savingLine" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="cancelLine" />
              </div>
            </div>
            <DataTable :value="lines" dataKey="LineId" size="small"
              selection-mode="single" v-model:selection="selectedLine" @row-select="onLineSelect">
              <Column field="SortOrder" header="#"     style="width:45px" />
              <Column field="LineCode"  header="Code"  style="min-width:110px" />
              <Column field="LineLabel" header="Label" style="min-width:160px" />
              <Column field="LineType"  header="Type"  style="width:85px" />
              <Column header="Formula" style="width:60px">
                <template #body="{ data }">
                  <span v-if="data.Formula" class="op-add" title="Formula text set">f(x)</span>
                </template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click.stop="editLine(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click.stop="deleteLine(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>

          <!-- Measures (visible when template selected) -->
          <div class="builder-panel" v-if="selectedTemplate">
            <div class="builder-panel-head">
              <h4>Measures <span class="builder-sub-title">— {{ selectedTemplate.TemplateName }}</span></h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New measure'" @click="newMeasure" />
            </div>
            <div v-if="editingMeasure" class="builder-form">
              <InputText v-model="measureForm.measureCode"  placeholder="Code (e.g. MTD)" />
              <InputText v-model="measureForm.measureLabel" placeholder="Label (e.g. Month to Date)" />
              <InputNumber v-model="measureForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort order" />

              <!-- SQL query for measure (new style) -->
              <label class="formula-label" style="margin-top:4px">
                SQL Query — use <code>{GL_ENTRY}</code>, <code>@ReferenceDate</code>, <code>@Dim1Code</code>, <code>@Dim2Code</code>; return <code>AccountNo</code>, <code>Amount</code>
              </label>
              <Textarea v-model="measureForm.sqlQuery" :rows="8"
                placeholder="SELECT [G_L Account No_] AS AccountNo, SUM([Amount]) AS Amount&#10;FROM {GL_ENTRY}&#10;WHERE [Posting Date] >= DATEFROMPARTS(YEAR(@ReferenceDate),MONTH(@ReferenceDate),1)&#10;  AND [Posting Date] <= EOMONTH(@ReferenceDate)&#10;  AND (@Dim1Code='' OR [Global Dimension 1 Code]=@Dim1Code)&#10;  AND (@Dim2Code='' OR [Global Dimension 2 Code]=@Dim2Code)&#10;GROUP BY [G_L Account No_]"
                style="width:100%;font-family:monospace;font-size:12px" fluid auto-resize />

              <!-- Legacy date mode fallback -->
              <details>
                <summary class="hint" style="cursor:pointer">Legacy fallback date mode (used when SQL Query is empty)</summary>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
                  <Select v-model="measureForm.dateMode" :options="dateModeOptions" option-label="label" option-value="value" placeholder="Date mode" />
                  <template v-if="measureForm.dateMode === 'custom'">
                    <DatePicker v-model="measureForm.customDateFrom" date-format="yy-mm-dd" show-icon fluid placeholder="From date" />
                    <DatePicker v-model="measureForm.customDateTo"   date-format="yy-mm-dd" show-icon fluid placeholder="To date" />
                  </template>
                </div>
              </details>

              <div class="schedule-actions" style="margin-top:0">
                <Button label="Save" icon="pi pi-save" size="small" @click="saveMeasure" :loading="savingMeasure" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="cancelMeasure" />
              </div>
            </div>
            <DataTable :value="measures" dataKey="MeasureId" size="small">
              <Column field="MeasureCode"  header="Code"  style="width:90px" />
              <Column field="MeasureLabel" header="Label" style="min-width:120px" />
              <Column header="Mode" style="width:80px">
                <template #body="{ data }">
                  <span v-if="data.SqlQuery" class="op-add" title="SQL query defined">SQL</span>
                  <span v-else class="hint">{{ data.DateMode }}</span>
                </template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editMeasure(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deleteMeasure(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>

        <!-- Formulas sub-panel (legacy fallback — used when the line has no Formula text) -->
        <div v-if="selectedLine && selectedLine.LineType === 'data'" class="builder-formula-panel">
          <div class="builder-panel-head">
            <h4>Legacy GL Formulas <span class="builder-sub-title">— {{ selectedLine.LineLabel }}</span></h4>
            <span v-if="selectedLine.Formula" class="hint" style="font-size:11px">overridden by formula text</span>
            <Button icon="pi pi-plus" text size="small" v-tooltip="'New formula'" @click="newFormula" style="margin-left:auto" />
          </div>
          <div v-if="editingFormula" class="formula-form" style="margin-bottom:8px">
            <!-- Row 1: Company · Selection mode · Operation · Sort -->
            <div class="formula-row">
              <Select v-model="formulaForm.companyId" :options="glCompanyOptions" option-label="label" option-value="value"
                placeholder="Company" @update:model-value="onFormulaCompanyChange" />
              <Select v-model="formulaForm.selectionMode" :options="selectionModeOptions" option-label="label" option-value="value" placeholder="Selection mode" />
              <Select v-model="formulaForm.operation" :options="operationOptions" option-label="label" option-value="value" placeholder="Operation" />
              <InputNumber v-model="formulaForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort" />
            </div>
            <!-- Row 2: Account range (range / except modes) -->
            <div class="formula-row" v-if="formulaForm.selectionMode !== 'specific'">
              <template v-if="formulaForm.companyId !== 'ALL' && formulaAccounts.length">
                <Select v-model="formulaForm.accountFrom" :options="formulaAccounts" option-label="label" option-value="value" filter placeholder="Account From" style="flex:1" />
                <Select v-model="formulaForm.accountTo"   :options="formulaAccounts" option-label="label" option-value="value" filter placeholder="Account To"   style="flex:1" />
              </template>
              <template v-else>
                <InputText v-model="formulaForm.accountFrom" placeholder="Account From" style="flex:1" />
                <InputText v-model="formulaForm.accountTo"   placeholder="Account To"   style="flex:1" />
              </template>
            </div>
            <!-- Row 3: Specific accounts (specific mode) or Excluded accounts (except mode) -->
            <div v-if="formulaForm.selectionMode === 'specific' || formulaForm.selectionMode === 'except'" class="formula-row">
              <label class="formula-label">{{ formulaForm.selectionMode === 'specific' ? 'Accounts to include:' : 'Accounts to exclude:' }}</label>
              <MultiSelect v-if="formulaForm.companyId !== 'ALL' && formulaAccounts.length"
                v-model="accountsSelected" :options="formulaAccounts" option-label="label" option-value="value"
                filter display="chip" placeholder="Select accounts…" style="flex:1" />
              <InputText v-else v-model="formulaForm.accountList" placeholder="Account numbers, comma-separated" style="flex:1" />
            </div>
          </div>
          <div v-if="editingFormula" class="schedule-actions" style="margin-bottom:8px">
            <Button label="Save Formula" icon="pi pi-save" size="small" @click="saveFormula" :loading="savingFormula" />
            <Button label="Cancel" icon="pi pi-times" text size="small" @click="cancelFormula" />
          </div>
          <DataTable :value="formulas" dataKey="FormulaId" size="small" responsive-layout="scroll">
            <Column field="CompanyId"     header="Company" style="width:80px" />
            <Column field="SelectionMode" header="Mode"    style="width:80px" />
            <Column header="Accounts" style="min-width:180px">
              <template #body="{ data }">
                <span v-if="data.SelectionMode === 'range' || !data.SelectionMode">
                  {{ data.AccountFrom }} → {{ data.AccountTo }}
                </span>
                <span v-else class="text-sm" :title="data.AccountList">
                  {{ (data.AccountList || '').split(',').slice(0,4).join(', ') }}{{ (data.AccountList || '').split(',').length > 4 ? ' …' : '' }}
                </span>
              </template>
            </Column>
            <Column header="Operation" style="width:100px">
              <template #body="{ data }">
                <span :class="data.Operation === 'ADD' ? 'op-add' : 'op-sub'">{{ data.Operation }}</span>
              </template>
            </Column>
            <Column field="SortOrder" header="Sort" style="width:55px" />
            <Column header="" style="width:80px">
              <template #body="{ data }">
                <div class="row-actions">
                  <Button icon="pi pi-pencil" text size="small" @click="editFormula(data)" />
                  <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deleteFormula(data)" />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
        </div><!-- /accordion-body -->
      </details>

      <!-- ── Customer Posting Group Mapper ────────────────────────────────── -->
      <details class="admin-accordion">
        <summary>
          <i class="pi pi-users acc-icon" />
          <span>Customer Posting Group Mapper</span>
          <span class="acc-count">{{ custPgMappings.length }} mapping(s)</span>
        </summary>
        <div class="accordion-body">
          <p class="text-muted text-sm">
            Map native BC customer posting group codes to display names so they can be consolidated across companies in the Aging report.
            Example: FCL → LOCAL &amp; FCL → LOCAL2 &amp; CM → BTRADEDEBT can all map to display name <code>LOCAL</code>.
          </p>

          <div v-if="editingCustPgMap" class="builder-form" style="max-width:600px;margin-bottom:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 80px;gap:8px">
              <Select v-model="custPgMapForm.companyId" :options="glCompanyOptions.filter(o => o.value !== 'ALL')"
                option-label="label" option-value="value" placeholder="Company" />
              <InputText v-model="custPgMapForm.nativeGroupCode" placeholder="Native BC group code" />
              <InputText v-model="custPgMapForm.displayGroupCode" placeholder="Display name" />
              <InputNumber v-model="custPgMapForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort" />
            </div>
            <div class="schedule-actions" style="margin-top:8px">
              <Button label="Save" icon="pi pi-save" size="small" @click="saveCustPgMap" :loading="savingCustPgMap" />
              <Button label="Cancel" icon="pi pi-times" text size="small" @click="cancelCustPgMap" />
            </div>
          </div>

          <div class="builder-panel-head" style="margin-bottom:6px">
            <span class="text-muted text-sm">{{ custPgMappings.length }} mapping(s) configured</span>
            <Button icon="pi pi-plus" text size="small" v-tooltip="'New mapping'" @click="newCustPgMap" />
          </div>

          <DataTable :value="custPgMappings" dataKey="MapId" size="small" responsive-layout="scroll">
            <Column field="CompanyId"        header="Company"       style="width:90px" />
            <Column field="NativeGroupCode"  header="Native Code"   style="min-width:140px" />
            <Column field="DisplayGroupCode" header="Display Name"  style="min-width:140px" />
            <Column field="SortOrder"        header="Sort"          style="width:60px" />
            <Column header="" style="width:80px">
              <template #body="{ data }">
                <div class="row-actions">
                  <Button icon="pi pi-pencil" text size="small" @click="editCustPgMap(data)" />
                  <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deleteCustPgMap(data)" />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </details>

    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import DataTable    from 'primevue/datatable'
import Column       from 'primevue/column'
import Button       from 'primevue/button'
import InputText    from 'primevue/inputtext'
import InputNumber  from 'primevue/inputnumber'
import Textarea     from 'primevue/textarea'
import Select       from 'primevue/select'
import MultiSelect  from 'primevue/multiselect'
import Checkbox     from 'primevue/checkbox'
import DatePicker   from 'primevue/datepicker'
import Message      from 'primevue/message'
import { adminApi }          from '@/services/api.js'
import { financeReportsApi } from '@/services/financeReports.js'
import { mgmtApi }           from '@/services/mgmtReports.js'
import { bcReportsApi }      from '@/services/bcReports.js'

// ── Option lists ──────────────────────────────────────────────────────────────
const roleOptions = [
  { label: 'Admin',    value: 'admin' },
  { label: 'Sales',    value: 'sales' },
  { label: 'Analyst',  value: 'analyst' },
  { label: 'Finance',  value: 'finance' },
  { label: 'Dispatch', value: 'dispatch' },
  { label: 'Security', value: 'security' },
]
const reportTypeOptions = [
  { label: 'Posting Group',       value: 'postingGroup' },
  { label: 'Sector',              value: 'sector' },
  { label: 'Salesperson',         value: 'salesperson' },
  { label: 'Route',               value: 'route' },
  { label: 'Week On Week',        value: 'weekOnWeek' },
  { label: 'Product Performance', value: 'productPerformance' },
]
const formatOptions     = [{ label: 'Excel', value: 'xlsx' }, { label: 'PDF', value: 'pdf' }]
const frequencyOptions  = [
  { label: 'Every N Hours', value: 'interval' },
  { label: 'Daily',         value: 'daily' },
  { label: 'Weekly',        value: 'weekly' },
  { label: 'Monthly',       value: 'monthly' },
]
const intervalOptions   = [2, 4, 6, 8, 12].map(v => ({ label: `Every ${v} hours`, value: v }))
const companyOptions    = ['FCL', 'CM', 'FLM', 'RMK'].map(v => ({ label: v, value: v }))
const docTypeOptions    = [
  { label: 'Posted Invoices', value: 'invoice' },
  { label: 'Credit Memos',    value: 'credit' },
  { label: 'Unposted Orders', value: 'unposted' },
  { label: 'PDA Archive',     value: 'pda' },
]
const productTypeOptions = [
  { label: 'All', value: 'all' }, { label: 'Own Product', value: 'own' }, { label: 'Third Party', value: 'third' },
]
const marketTypeOptions = [
  { label: 'All', value: 'all' }, { label: 'Local', value: 'local' }, { label: 'Foreign', value: 'foreign' },
]
const weekDimensionOptions = [
  { label: 'Posting Group', value: 'postingGroup' }, { label: 'Sector', value: 'sector' },
]
const dayOptions = [
  { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 }, { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 }, { label: 'Sunday', value: 7 },
]
const glCompanyOptions = [
  { label: 'ALL (all companies)', value: 'ALL' },
  { label: 'FCL', value: 'FCL' }, { label: 'CM', value: 'CM' },
  { label: 'FLM', value: 'FLM' }, { label: 'RMK', value: 'RMK' },
]
const lineTypeOptions = [
  { label: 'Data (GL formula)', value: 'data' },
  { label: 'Subtotal',          value: 'subtotal' },
  { label: 'Heading',           value: 'heading' },
  { label: 'Spacer',            value: 'spacer' },
]
const dateModeOptions = [
  { label: 'Month-to-Date (MTD)',      value: 'MTD' },
  { label: 'Year-to-Date (YTD)',       value: 'YTD' },
  { label: 'Last Year MTD (LMTD)',     value: 'LMTD' },
  { label: 'Last Year YTD (LYTD)',     value: 'LYTD' },
  { label: 'Last Full Month (LMON)',   value: 'LMON' },
  { label: 'Custom date range',        value: 'custom' },
]
const operationOptions = [
  { label: 'ADD (+)',      value: 'ADD' },
  { label: 'SUBTRACT (−)', value: 'SUBTRACT' },
]
const selectionModeOptions = [
  { label: 'Range (From → To)',          value: 'range' },
  { label: 'Specific accounts',          value: 'specific' },
  { label: 'Range except listed accounts', value: 'except' },
]

// ── Core state ────────────────────────────────────────────────────────────────
const users    = ref([])
const schedules = ref([])
const loading  = ref(false)
const error    = ref('')
const savingSchedule = ref(false)
const savingSmtp     = ref(false)
const smtpForm = ref({ host: '', port: '587', user: '', pass: '', from: '', secure: false })

function blankSchedule() {
  return {
    scheduleId: null, name: '', reportType: 'postingGroup', deliveryFormat: 'xlsx',
    frequency: 'daily', intervalHours: 4, dayOfWeek: 1, dayOfMonth: 1,
    timeOfDay: '08:00', lookbackDays: 7, isActive: true, recipientUserIds: [],
    filters: { companies: ['FCL','CM','FLM','RMK'], docTypes: ['invoice','credit','unposted','pda'], productType: 'all', genBusMode: 'all', weekDimension: 'postingGroup', daysOfWeek: [1,2,3,4,5,6,7] },
  }
}
const scheduleForm      = ref(blankSchedule())
const recipientOptions  = computed(() => users.value
  .filter(u => u.isActive)
  .map(u => ({ value: u.userId, label: u.email ? `${u.displayName} (${u.email})` : `${u.displayName} (${u.username})` })))
const fmtDateTime = (v) => v ? new Date(v).toLocaleString('en-KE') : '—'

// ── Account lookups (from BC DB) ──────────────────────────────────────────────
const glMapAccounts  = ref([])   // accounts for GL Mapper form dropdowns
const formulaAccounts = ref([])  // accounts for Formula form dropdowns
const accountsSelected = ref([]) // MultiSelect model for 'specific' / 'except' modes

async function loadAccountsFor(company, targetRef) {
  if (!company || company === 'ALL') { targetRef.value = []; return }
  try {
    const { data } = await mgmtApi.listAccounts(company)
    targetRef.value = data.map(a => ({ label: `${a.AccountNo}  ${a.AccountName}`, value: a.AccountNo }))
  } catch { targetRef.value = [] }
}

// ── GL Mapper state ───────────────────────────────────────────────────────────
const glMappings  = ref([])
const editingGlMap = ref(false)
const savingGlMap  = ref(false)

function blankGlMap() {
  return { mapId: null, companyId: 'ALL', accountFrom: '', accountTo: '', section: '', lineLabel: '', sortOrder: 0 }
}
const glMapForm = ref(blankGlMap())

function newGlMap()        { glMapForm.value = blankGlMap(); glMapAccounts.value = []; editingGlMap.value = true }
function cancelGlMap()     { editingGlMap.value = false }
function editGlMap(row)    {
  glMapForm.value = { mapId: row.MapId, companyId: row.CompanyId, accountFrom: row.AccountFrom, accountTo: row.AccountTo, section: row.Section, lineLabel: row.LineLabel, sortOrder: row.SortOrder }
  editingGlMap.value = true
  loadAccountsFor(row.CompanyId, glMapAccounts)
}
function onGlMapCompanyChange(company) {
  glMapForm.value.accountFrom = ''; glMapForm.value.accountTo = ''
  loadAccountsFor(company, glMapAccounts)
}

async function loadGlMappings() {
  try { glMappings.value = (await financeReportsApi.listMappings()).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveGlMap() {
  savingGlMap.value = true; error.value = ''
  try { await financeReportsApi.saveMapping(glMapForm.value); await loadGlMappings(); cancelGlMap() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingGlMap.value = false }
}
async function deleteGlMap(row) {
  error.value = ''
  try { await financeReportsApi.deleteMapping(row.MapId); await loadGlMappings() }
  catch (err) { error.value = err.response?.data?.error || err.message }
}

// ── Customer Posting Group Mapper state ───────────────────────────────────────
const custPgMappings  = ref([])
const editingCustPgMap = ref(false)
const savingCustPgMap  = ref(false)

function blankCustPgMap() {
  return { mapId: null, companyId: 'FCL', nativeGroupCode: '', displayGroupCode: '', sortOrder: 0 }
}
const custPgMapForm = ref(blankCustPgMap())

function newCustPgMap()      { custPgMapForm.value = blankCustPgMap(); editingCustPgMap.value = true }
function cancelCustPgMap()   { editingCustPgMap.value = false }
function editCustPgMap(row)  {
  custPgMapForm.value = { mapId: row.MapId, companyId: row.CompanyId, nativeGroupCode: row.NativeGroupCode, displayGroupCode: row.DisplayGroupCode, sortOrder: row.SortOrder }
  editingCustPgMap.value = true
}

async function loadCustPgMappings() {
  try { custPgMappings.value = (await bcReportsApi.listCustPgMappings()).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveCustPgMap() {
  savingCustPgMap.value = true; error.value = ''
  try { await bcReportsApi.saveCustPgMapping(custPgMapForm.value); await loadCustPgMappings(); cancelCustPgMap() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingCustPgMap.value = false }
}
async function deleteCustPgMap(row) {
  error.value = ''
  try { await bcReportsApi.deleteCustPgMapping(row.MapId); await loadCustPgMappings() }
  catch (err) { error.value = err.response?.data?.error || err.message }
}

// ── Templates state ───────────────────────────────────────────────────────────
const templates        = ref([])
const selectedTemplate = ref(null)
const editingTemplate  = ref(false)
const savingTemplate   = ref(false)

function blankTemplate() { return { templateId: null, templateName: '', description: '', sortOrder: 0 } }
const templateForm = ref(blankTemplate())

function newTemplate()     { templateForm.value = blankTemplate(); editingTemplate.value = true }
function cancelTemplate()  { editingTemplate.value = false }
function editTemplate(row) {
  templateForm.value = { templateId: row.TemplateId, templateName: row.TemplateName, description: row.Description || '', sortOrder: row.SortOrder }
  editingTemplate.value = true
}

async function loadTemplates() {
  try { templates.value = (await mgmtApi.listTemplates()).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveTemplate() {
  savingTemplate.value = true; error.value = ''
  try { await mgmtApi.saveTemplate(templateForm.value); await loadTemplates(); cancelTemplate() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingTemplate.value = false }
}
async function deleteTemplate(row) {
  error.value = ''
  try {
    await mgmtApi.deleteTemplate(row.TemplateId)
    if (selectedTemplate.value?.TemplateId === row.TemplateId) {
      selectedTemplate.value = null; lines.value = []; measures.value = []
      selectedLine.value = null; formulas.value = []
    }
    await loadTemplates()
  } catch (err) { error.value = err.response?.data?.error || err.message }
}
async function onTemplateSelect(event) {
  selectedTemplate.value = event.data
  selectedLine.value = null; formulas.value = []
  editingLine.value = false; editingMeasure.value = false
  await Promise.all([loadLines(event.data.TemplateId), loadMeasures(event.data.TemplateId)])
}

// ── Lines state ───────────────────────────────────────────────────────────────
const lines        = ref([])
const selectedLine = ref(null)
const editingLine  = ref(false)
const savingLine   = ref(false)

function blankLine() { return { lineId: null, lineCode: '', lineLabel: '', lineType: 'data', subtotalOf: '', indentLevel: 0, isBold: false, isNegated: false, sortOrder: 0, formula: '', enabledMeasures: '' } }
const lineForm = ref(blankLine())
const lineEnabledMeasures = computed({
  get: () => (lineForm.value.enabledMeasures || '').split(',').map(s => s.trim()).filter(Boolean),
  set: (arr) => { lineForm.value.enabledMeasures = arr.join(',') },
})
function toggleEnabledMeasure(code, checked) {
  const current = lineEnabledMeasures.value
  if (checked) { if (!current.includes(code)) lineEnabledMeasures.value = [...current, code] }
  else lineEnabledMeasures.value = current.filter(c => c !== code)
}

function newLine()     { lineForm.value = blankLine(); editingLine.value = true }
function cancelLine()  { editingLine.value = false }
function editLine(row) {
  lineForm.value = { lineId: row.LineId, lineCode: row.LineCode, lineLabel: row.LineLabel, lineType: row.LineType, subtotalOf: row.SubtotalOf || '', indentLevel: row.IndentLevel, isBold: !!row.IsBold, isNegated: !!row.IsNegated, sortOrder: row.SortOrder, formula: row.Formula || '', enabledMeasures: row.EnabledMeasures || '' }
  editingLine.value = true
}

async function loadLines(templateId) {
  try { lines.value = (await mgmtApi.listLines(templateId)).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveLine() {
  if (!selectedTemplate.value) return
  savingLine.value = true; error.value = ''
  try { await mgmtApi.saveLine(selectedTemplate.value.TemplateId, lineForm.value); await loadLines(selectedTemplate.value.TemplateId); cancelLine() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingLine.value = false }
}
async function deleteLine(row) {
  error.value = ''
  try {
    await mgmtApi.deleteLine(selectedTemplate.value.TemplateId, row.LineId)
    if (selectedLine.value?.LineId === row.LineId) { selectedLine.value = null; formulas.value = [] }
    await loadLines(selectedTemplate.value.TemplateId)
  } catch (err) { error.value = err.response?.data?.error || err.message }
}
async function onLineSelect(event) {
  selectedLine.value = event.data; editingFormula.value = false
  if (event.data.LineType === 'data') await loadFormulas(event.data.LineId)
  else formulas.value = []
}

// ── Formulas state ────────────────────────────────────────────────────────────
const formulas       = ref([])
const editingFormula = ref(false)
const savingFormula  = ref(false)

function blankFormula() {
  return { formulaId: null, companyId: 'ALL', accountFrom: '', accountTo: '', operation: 'ADD', selectionMode: 'range', accountList: '', sortOrder: 0 }
}
const formulaForm = ref(blankFormula())

function newFormula()     { formulaForm.value = blankFormula(); accountsSelected.value = []; formulaAccounts.value = []; editingFormula.value = true }
function cancelFormula()  { editingFormula.value = false; accountsSelected.value = [] }
function editFormula(row) {
  formulaForm.value = {
    formulaId: row.FormulaId, companyId: row.CompanyId,
    accountFrom: row.AccountFrom, accountTo: row.AccountTo,
    operation: row.Operation, selectionMode: row.SelectionMode || 'range',
    accountList: row.AccountList || '', sortOrder: row.SortOrder,
  }
  accountsSelected.value = (row.AccountList || '').split(',').map(a => a.trim()).filter(Boolean)
  editingFormula.value = true
  loadAccountsFor(row.CompanyId, formulaAccounts)
}
function onFormulaCompanyChange(company) {
  formulaForm.value.accountFrom = ''; formulaForm.value.accountTo = ''
  accountsSelected.value = []
  loadAccountsFor(company, formulaAccounts)
}

async function loadFormulas(lineId) {
  try { formulas.value = (await mgmtApi.listFormulas(lineId)).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveFormula() {
  if (!selectedLine.value) return
  savingFormula.value = true; error.value = ''
  try {
    // Merge MultiSelect array → comma string when a specific company is chosen
    const payload = {
      ...formulaForm.value,
      accountList: formulaForm.value.companyId !== 'ALL'
        ? accountsSelected.value.join(',')
        : formulaForm.value.accountList,
    }
    await mgmtApi.saveFormula(selectedLine.value.LineId, payload)
    await loadFormulas(selectedLine.value.LineId)
    cancelFormula()
  } catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingFormula.value = false }
}
async function deleteFormula(row) {
  error.value = ''
  try { await mgmtApi.deleteFormula(selectedLine.value.LineId, row.FormulaId); await loadFormulas(selectedLine.value.LineId) }
  catch (err) { error.value = err.response?.data?.error || err.message }
}

// ── Measures state ────────────────────────────────────────────────────────────
const measures       = ref([])
const editingMeasure = ref(false)
const savingMeasure  = ref(false)

function blankMeasure() { return { measureId: null, measureCode: '', measureLabel: '', dateMode: 'MTD', customDateFrom: null, customDateTo: null, sqlQuery: '', sortOrder: 0 } }
const measureForm = ref(blankMeasure())

function newMeasure()      { measureForm.value = blankMeasure(); editingMeasure.value = true }
function cancelMeasure()   { editingMeasure.value = false }
function editMeasure(row)  {
  measureForm.value = { measureId: row.MeasureId, measureCode: row.MeasureCode, measureLabel: row.MeasureLabel, dateMode: row.DateMode, customDateFrom: row.CustomDateFrom, customDateTo: row.CustomDateTo, sqlQuery: row.SqlQuery || '', sortOrder: row.SortOrder }
  editingMeasure.value = true
}

async function loadMeasures(templateId) {
  try { measures.value = (await mgmtApi.listMeasures(templateId)).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function saveMeasure() {
  if (!selectedTemplate.value) return
  savingMeasure.value = true; error.value = ''
  try { await mgmtApi.saveMeasure(selectedTemplate.value.TemplateId, measureForm.value); await loadMeasures(selectedTemplate.value.TemplateId); cancelMeasure() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingMeasure.value = false }
}
async function deleteMeasure(row) {
  error.value = ''
  try { await mgmtApi.deleteMeasure(selectedTemplate.value.TemplateId, row.MeasureId); await loadMeasures(selectedTemplate.value.TemplateId) }
  catch (err) { error.value = err.response?.data?.error || err.message }
}

// ── Core CRUD (users / SMTP / schedules) ─────────────────────────────────────
async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const [usersRes, schedulesRes, smtpRes] = await Promise.all([
      adminApi.users(), adminApi.schedules(), adminApi.getSmtpSettings(),
    ])
    users.value     = usersRes.data
    schedules.value = schedulesRes.data
    smtpForm.value  = {
      host:   smtpRes.data['smtp.host']   || '',
      port:   smtpRes.data['smtp.port']   || '587',
      user:   smtpRes.data['smtp.user']   || '',
      pass:   smtpRes.data['smtp.pass']   || '',
      from:   smtpRes.data['smtp.from']   || '',
      secure: String(smtpRes.data['smtp.secure'] || '').toLowerCase() === 'true',
    }
  } catch (err) { error.value = err.response?.data?.error || err.message }
  finally { loading.value = false }
}

async function saveUser(user) {
  error.value = ''
  try {
    await adminApi.updateUser(user.userId, { displayName: user.displayName, email: user.email, role: user.role, isActive: user.isActive })
  } catch (err) { error.value = err.response?.data?.error || err.message }
}

function resetScheduleForm() { scheduleForm.value = blankSchedule() }
function editSchedule(schedule) {
  scheduleForm.value = JSON.parse(JSON.stringify(schedule))
  if (!Array.isArray(scheduleForm.value.recipientUserIds)) scheduleForm.value.recipientUserIds = []
}

async function saveSmtp() {
  savingSmtp.value = true; error.value = ''
  try { await adminApi.saveSmtpSettings(smtpForm.value); await loadAll() }
  catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingSmtp.value = false }
}

async function saveSchedule() {
  savingSchedule.value = true; error.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(scheduleForm.value))
    if (payload.scheduleId) await adminApi.updateSchedule(payload.scheduleId, payload)
    else await adminApi.createSchedule(payload)
    await loadAll(); resetScheduleForm()
  } catch (err) { error.value = err.response?.data?.error || err.message }
  finally { savingSchedule.value = false }
}

async function runSchedule(schedule) {
  error.value = ''
  try { await adminApi.runSchedule(schedule.scheduleId); await loadAll() }
  catch (err) { error.value = err.response?.data?.error || err.message }
}

async function deleteSchedule(schedule) {
  error.value = ''
  try {
    await adminApi.deleteSchedule(schedule.scheduleId)
    await loadAll()
    if (scheduleForm.value.scheduleId === schedule.scheduleId) resetScheduleForm()
  } catch (err) { error.value = err.response?.data?.error || err.message }
}

onMounted(async () => {
  await loadAll()
  await loadTemplates()
  await loadCustPgMappings()
})
</script>

<style scoped>
.admin-page { display:flex; flex-direction:column; gap:16px; }
.page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.page-title { font-size:24px; font-weight:700; margin:0 0 4px; }

/* ── Accordion sections ──────────────────────────────────────────── */
.admin-sections { display:flex; flex-direction:column; gap:10px; }
.admin-accordion { border:1px solid var(--bc-border,#e4e7ec); border-radius:10px; overflow:hidden; background:var(--bc-surface-card,#fff); }
.admin-accordion > summary {
  display:flex; align-items:center; gap:10px; padding:14px 18px;
  cursor:pointer; font-size:14px; font-weight:700; color:var(--bc-text,#1f2937);
  list-style:none; user-select:none; background:var(--bc-surface-raised,#f9fafb);
  border-bottom:1px solid transparent; transition:background .15s;
}
.admin-accordion > summary:hover { background:var(--bc-border,#e4e7ec); }
.admin-accordion[open] > summary { border-bottom-color:var(--bc-border,#e4e7ec); background:var(--bc-surface-raised,#f9fafb); }
.admin-accordion > summary::-webkit-details-marker { display:none; }
.admin-accordion > summary::after { content:'\203A'; margin-left:auto; font-size:20px; line-height:1; transition:transform .2s; color:#9ca3af; }
.admin-accordion[open] > summary::after { transform:rotate(90deg); }
.acc-icon { font-size:15px; color:var(--bc-text-muted,#687487); }
.acc-count { margin-left:6px; padding:2px 8px; border-radius:999px; background:var(--bc-surface-raised,#f1f5f9); color:var(--bc-text-muted,#687487); font-size:11px; font-weight:600; }
.accordion-body { padding:18px; display:flex; flex-direction:column; gap:14px; }
.acc-form-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }

.recipient-pill { padding:4px 10px; border-radius:999px; background:var(--bc-surface-raised,#f1f5f9); color:var(--bc-text-muted,#687487); font-weight:600; font-size:12px; }
.schedule-form, .filter-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
.schedule-actions { display:flex; align-items:center; gap:10px; }
.schedule-toggle { display:flex; align-items:center; gap:8px; margin-right:auto; }
.row-actions { display:flex; align-items:center; gap:4px; }

/* ── Builder layout ──────────────────────────────────────────────────── */
.builder-layout { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; align-items:start; }
.builder-panel { border:1px solid var(--bc-border,#e4e7ec); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px; }
.builder-panel-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.builder-panel-head h4 { margin:0; font-size:13px; font-weight:700; }
.builder-sub-title { color:var(--bc-text-muted,#687487); font-weight:400; }
.builder-form { display:flex; flex-direction:column; gap:8px; padding:10px; background:var(--bc-surface-raised,#f9fafb); border-radius:6px; }
.builder-checks { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.builder-checks label { font-size:12px; }
.builder-formula-panel { border-top:2px solid var(--bc-border,#e4e7ec); padding-top:14px; display:flex; flex-direction:column; gap:10px; margin-top:8px; }
.op-add { color:var(--bc-text-muted,#687487); font-weight:600; }
.op-sub { color:var(--bc-text-muted,#687487); font-weight:600; opacity:.7; }
.formula-form { display:flex; flex-direction:column; gap:8px; padding:10px; background:var(--bc-surface-raised,#f9fafb); border-radius:6px; }
.formula-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.formula-row > * { flex:1; min-width:160px; }
.formula-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#687487; flex:none; white-space:nowrap; }
.hint { font-size:11px; font-weight:400; color:#687487; }
.text-sm { font-size:12px; }

/* ── User guide ──────────────────────────────────────────────────── */
.guide-box { border:1px solid var(--bc-border,#e4e7ec); border-radius:8px; padding:10px 14px; }
.guide-box > summary { cursor:pointer; font-size:13px; font-weight:600; color:#374151; list-style:none; display:flex; align-items:center; gap:6px; }
.guide-box > summary::-webkit-details-marker { display:none; }
.guide-body { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; margin-top:12px; }
.guide-section h5 { margin:0 0 6px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#374151; }
.guide-section p { margin:4px 0; font-size:12px; color:#4b5563; line-height:1.5; }
.guide-table { width:100%; border-collapse:collapse; font-size:11px; margin:6px 0; }
.guide-table th { background:#f3f4f6; padding:4px 8px; text-align:left; font-weight:600; color:#374151; border:1px solid #e5e7eb; }
.guide-table td { padding:4px 8px; border:1px solid #e5e7eb; color:#374151; vertical-align:top; }
.guide-table code { background:#f3f4f6; padding:1px 4px; border-radius:3px; font-size:11px; }
.guide-example { margin:6px 0 2px; font-size:12px; }
.guide-pre { background:#1e293b; color:#e2e8f0; padding:10px 12px; border-radius:6px; font-size:11px; line-height:1.6; overflow-x:auto; white-space:pre; margin:6px 0 0; }

@media (max-width: 900px) {
  .schedule-form, .filter-grid { grid-template-columns:1fr 1fr; }
  .page-header { flex-direction:column; align-items:flex-start; }
}
@media (max-width: 600px) {
  .schedule-form, .filter-grid { grid-template-columns:1fr; }
}
</style>
