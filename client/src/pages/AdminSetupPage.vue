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
      <details v-if="isFullAdmin" class="admin-accordion"
               @toggle="onAccordionToggle('users', loadUsersData, $event)">
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
            <Column field="shopCode" header="Shop" style="min-width:120px">
              <template #body="{ data }">
                <Select v-model="data.shopCode" :options="posShopOptions" option-label="label" option-value="value"
                  placeholder="— none —" show-clear fluid
                  :disabled="!['shop','admin'].includes(data.role)" />
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
      <details v-if="isFullAdmin" class="admin-accordion"
               @toggle="onAccordionToggle('smtp', loadSmtpData, $event)">
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
      <details v-if="isFullAdmin" class="admin-accordion"
               @toggle="onAccordionToggle('schedules', () => Promise.all([loadSchedulesData(), loadOnce('users', loadUsersData)]), $event)">
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
      <details v-if="isFullAdmin" class="admin-accordion"
               @toggle="onAccordionToggle('templates', loadTemplates, $event)">
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
      <details v-if="isFullAdmin" class="admin-accordion"
               @toggle="onAccordionToggle('custPg', loadCustPgMappings, $event)">
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

      <!-- ── POS Setup ───────────────────────────────────────────────────────── -->
      <details class="admin-accordion"
               @toggle="onAccordionToggle('posSetup', loadPosSetup, $event)">
        <summary>
          <i class="pi pi-shopping-cart acc-icon" />
          <span>POS Setup</span>
          <span class="acc-count">{{ posItems.length }} item(s)</span>
        </summary>
        <div class="accordion-body">

          <!-- Master sync banner -->
          <div class="sync-bar">
            <div class="sync-info">
              <i class="pi pi-cloud-download" />
              <div>
                <div class="sync-title">Sync master records from Business Central</div>
                <div class="sync-sub">Refreshes payment methods (M-PESA endpoint, balance accounts) and item prices/eTIMS codes for all PosItems already in the catalogue.</div>
              </div>
            </div>
            <Button label="Sync everything from BC" icon="pi pi-sync" severity="info"
                    :loading="syncingFromBc" @click="syncFromBc" />
          </div>

          <!-- Per-step buttons so admins can run individual stages on demand -->
          <div class="sync-steps">
            <Button v-for="step in syncSteps" :key="step.kind"
                    :label="step.label" :icon="step.icon" size="small" severity="secondary"
                    :loading="syncingStep === step.kind"
                    :disabled="!!syncingStep && syncingStep !== step.kind"
                    @click="syncStep(step.kind)" />
          </div>

          <Message v-if="syncResult" :severity="syncResult.errors?.length ? 'warn' : 'success'" :closable="true" class="mb-3">
            <span v-if="syncResult.kind">
              Step <strong>{{ syncResult.kind }}</strong>: {{ syncResult.count }} record(s) synced.
            </span>
            <span v-else>
              Synced {{ syncResult.paymentTypes }} payment type(s) and refreshed {{ syncResult.items }} item(s).
            </span>
            <span v-if="syncResult.errors?.length"> Errors: {{ syncResult.errors.join('; ') }}</span>
          </Message>

          <!-- Print configuration -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-print" /> Print Configuration (per shop)</summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Print Configuration — {{ printShopLabel }}</h4>
              <Button label="Refresh printers" icon="pi pi-refresh" text size="small" @click="loadPrinters" :loading="loadingPrinters" />
            </div>
            <div class="cf-field" style="max-width:260px;margin-bottom:8px">
              <label>Shop</label>
              <Select v-model="printShop" :options="printShopOpts" option-label="label" option-value="value"
                @change="loadPrintCfg" />
            </div>
            <p class="text-muted text-sm">Choose A4 or thermal format and pick which printer the POS should send invoices to for this shop.</p>
            <div class="builder-form" style="max-width:680px">
              <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr;gap:8px;align-items:end">
                <div class="cf-field">
                  <label>Format</label>
                  <Select v-model="printCfg.format" :options="formatOpts" option-label="label" option-value="value" fluid />
                </div>
                <div class="cf-field">
                  <label>Invoice Printer</label>
                  <Select v-model="printCfg.invoicePrinter" :options="installedPrinters" editable fluid placeholder="Pick or type printer name" />
                </div>
                <div class="cf-field">
                  <label>Thermal Width (mm)</label>
                  <InputNumber v-model="printCfg.thermalWidthMm" :min="48" :max="120" show-buttons fluid />
                </div>
                <div class="cf-field">
                  <label>Copies</label>
                  <InputNumber v-model="printCfg.copies" :min="1" :max="5" show-buttons fluid />
                </div>
              </div>
              <div class="schedule-actions" style="margin-top:8px">
                <Button label="Save Print Config" icon="pi pi-save" size="small" @click="savePrintCfg" :loading="savingPrintCfg" />
                <span v-if="installedPrinters.length" class="text-muted text-sm" style="margin-left:8px">
                  {{ installedPrinters.length }} printer(s) detected on this server.
                </span>
              </div>
            </div>
          </div>
          </details>

          <!-- Inventory display on the POS terminal item cards -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-inbox" /> Inventory display</summary>
            <div class="pos-setup-section">
              <h4>POS Terminal — item card inventory</h4>
              <p class="text-muted text-sm">
                Item cards on the POS terminal show the on-hand stock at the shop's location ("Remaining: N UoM").
                Toggle below to also auto-hide items with zero or negative stock so cashiers don't try to sell what isn't there.
              </p>
              <div class="builder-checks" style="margin-top:8px">
                <Checkbox v-model="invCfg.hideOutOfStock" binary input-id="inv-hide" />
                <label for="inv-hide">Auto-hide items that are out of stock</label>
              </div>
              <div class="schedule-actions" style="margin-top:8px">
                <Button label="Save Inventory Config" icon="pi pi-save" size="small"
                        :loading="savingInvCfg" @click="saveInvCfg" />
              </div>
            </div>
          </details>

          <!-- Third Parties (HQ → these recipients during transfers) -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-truck" /> Third Parties <span class="acc-count-sm">{{ thirdParties.length }}</span></summary>
            <div class="pos-setup-section">
              <p class="text-muted text-sm">Recipients of HQ stock transfers (butchers, depots, processors). Optionally link a third party to a shop where its stock + portioning are tracked.</p>
              <div v-if="editingTp" class="builder-form" style="max-width:740px">
                <div style="display:grid;grid-template-columns:1fr 2fr 1fr 80px;gap:8px;align-items:end">
                  <div class="cf-field"><label>Code</label><InputText v-model="tpForm.code" placeholder="TP001" /></div>
                  <div class="cf-field"><label>Name</label><InputText v-model="tpForm.name" placeholder="Third party name" /></div>
                  <div class="cf-field"><label>Linked Shop</label>
                    <Select v-model="tpForm.shopCode" :options="posShops" option-label="Name" option-value="Code"
                      placeholder="(optional)" show-clear />
                  </div>
                  <div class="builder-checks">
                    <Checkbox v-model="tpForm.isActive" binary input-id="tp-active" />
                    <label for="tp-active">Active</label>
                  </div>
                </div>
                <InputText v-model="tpForm.notes" placeholder="Notes (optional)" style="margin-top:8px" fluid />
                <div class="schedule-actions" style="margin-top:6px">
                  <Button label="Save" icon="pi pi-save" size="small" @click="saveTp" :loading="savingTp" />
                  <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingTp=false" />
                </div>
              </div>
              <div class="builder-panel-head" style="margin-top:6px">
                <span class="text-muted text-sm">{{ thirdParties.length }} third party(ies)</span>
                <Button icon="pi pi-plus" text size="small" v-tooltip="'New third party'" @click="newTp" />
              </div>
              <DataTable :value="thirdParties" dataKey="ThirdPartyId" size="small" responsive-layout="scroll">
                <Column field="Code"     header="Code"   style="width:100px" />
                <Column field="Name"     header="Name"   style="min-width:180px" />
                <Column field="ShopCode" header="Linked Shop" style="width:130px">
                  <template #body="{ data }">{{ data.ShopCode || '—' }}</template>
                </Column>
                <Column field="Notes"    header="Notes"  style="min-width:160px" />
                <Column header="Active" style="width:65px">
                  <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
                </Column>
                <Column header="" style="width:80px">
                  <template #body="{ data }">
                    <div class="row-actions">
                      <Button icon="pi pi-pencil" text size="small" @click="editTp(data)" />
                      <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deleteTp(data)" />
                    </div>
                  </template>
                </Column>
              </DataTable>
            </div>
          </details>

          <!-- eTIMS Integration -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-shield" /> eTIMS / KRA Integration (per shop)</summary>
            <div class="pos-setup-section">
              <div class="cf-field" style="max-width:260px;margin-bottom:8px">
                <label>Shop</label>
                <Select v-model="etimsShop" :options="etimsShopOpts" option-label="label" option-value="value"
                  @change="loadEtimsCfg" />
              </div>
              <p class="text-muted text-sm">Per-shop eTIMS endpoints and credentials. Each shop terminal uses its own gateway — admin can copy defaults from BC.</p>
              <div class="builder-form" style="max-width:780px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div class="cf-field">
                    <label>Invoice URL</label>
                    <InputText v-model="etimsCfg.invoiceUrl" placeholder="https://etims.../api/invoice" />
                  </div>
                  <div class="cf-field">
                    <label>Next Invoice Number URL</label>
                    <InputText v-model="etimsCfg.invoiceNumUrl" placeholder="https://etims.../api/invoice/next" />
                  </div>
                  <div class="cf-field">
                    <label>Credit Note URL</label>
                    <InputText v-model="etimsCfg.creditNoteUrl" placeholder="https://etims.../api/credit-note" />
                  </div>
                  <div class="cf-field">
                    <label>QR Code Service URL</label>
                    <InputText v-model="etimsCfg.qrServiceUrl" placeholder="(optional) QR microservice" />
                  </div>
                  <div class="cf-field">
                    <label>API Key</label>
                    <InputText v-model="etimsCfg.apiKey" type="password" placeholder="X-API-Key header value" />
                  </div>
                  <div class="cf-field">
                    <label>Payment Service (M-PESA lookup)</label>
                    <InputText v-model="etimsCfg.paymentService" placeholder="(optional) gateway lookup URL" />
                  </div>
                  <div class="cf-field">
                    <label>Branch ID</label>
                    <InputText v-model="etimsCfg.branchId" placeholder="00" />
                  </div>
                  <div class="cf-field">
                    <label>Company KRA PIN</label>
                    <InputText v-model="etimsCfg.companyPin" placeholder="P051234567X" />
                  </div>
                </div>
                <div class="schedule-actions" style="margin-top:8px">
                  <Button label="Save eTIMS Config" icon="pi pi-save" size="small" @click="saveEtimsCfg" :loading="savingEtimsCfg" />
                  <Button label="Load defaults from BC" icon="pi pi-cloud-download" text size="small" @click="loadEtimsBcDefaults" :loading="loadingEtimsBc" />
                </div>
                <Message v-if="etimsBcResult" :severity="etimsBcResult.ok ? 'success' : 'warn'" class="mb-3" style="margin-top:6px" :closable="true">
                  {{ etimsBcResult.message }}
                </Message>
              </div>
            </div>
          </details>

          <!-- Shops -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-shopping-bag" /> Shops / Terminals <span class="acc-count-sm">{{ posShops.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Shops / Terminals</h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New shop'" @click="newPosShop" />
            </div>
            <p class="text-muted text-sm">Each shop is a distinct terminal. Assign a Shop Code to users to restrict their POS access to that shop only.</p>
            <div v-if="editingPosShop" class="builder-form" style="max-width:700px">
              <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr 80px 80px;gap:8px;align-items:center">
                <InputText v-model="posShopForm.code"            placeholder="Code (e.g. SHOP1)" />
                <InputText v-model="posShopForm.name"            placeholder="Display name" />
                <InputText v-model="posShopForm.locationCode"    placeholder="BC Location" />
                <InputText v-model="posShopForm.salespersonCode" placeholder="Salesperson code" />
                <InputNumber v-model="posShopForm.sortOrder"     :min="0" show-buttons fluid placeholder="Sort" />
                <div class="builder-checks">
                  <Checkbox v-model="posShopForm.isActive" binary input-id="pos-shop-active" />
                  <label for="pos-shop-active">Active</label>
                </div>
              </div>
              <div class="schedule-actions" style="margin-top:6px">
                <Button label="Save" icon="pi pi-save" size="small" @click="savePosShop" :loading="savingPosShop" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingPosShop=false" />
              </div>
            </div>
            <DataTable :value="posShops" dataKey="ShopId" size="small">
              <Column field="Code"            header="Code"        style="width:100px" />
              <Column field="Name"            header="Name"        style="min-width:160px" />
              <Column field="LocationCode"    header="Location"    style="width:100px" />
              <Column field="SalespersonCode" header="Salesperson" style="width:110px" />
              <Column field="SortOrder"       header="Sort"        style="width:55px" />
              <Column header="Active" style="width:70px">
                <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editPosShop(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deletePosShop(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
          </details>

          <!-- Categories -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-tags" /> Item Categories <span class="acc-count-sm">{{ posCategories.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Item Categories</h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New category'" @click="newPosCategory" />
            </div>
            <div v-if="editingPosCategory" class="builder-form" style="max-width:540px">
              <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px;gap:8px;align-items:center">
                <InputText v-model="posCatForm.code" placeholder="Code (e.g. SNACKS)" />
                <InputText v-model="posCatForm.name" placeholder="Display name" />
                <InputNumber v-model="posCatForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort" />
                <div class="builder-checks">
                  <Checkbox v-model="posCatForm.isActive" binary input-id="pos-cat-active" />
                  <label for="pos-cat-active">Active</label>
                </div>
              </div>
              <div class="schedule-actions" style="margin-top:6px">
                <Button label="Save" icon="pi pi-save" size="small" @click="savePosCategory" :loading="savingPosCat" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingPosCategory=false" />
              </div>
            </div>
            <DataTable :value="posCategories" dataKey="CategoryId" size="small">
              <Column field="Code" header="Code" style="width:110px" />
              <Column field="Name" header="Name" style="min-width:140px" />
              <Column field="SortOrder" header="Sort" style="width:60px" />
              <Column header="Active" style="width:70px">
                <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editPosCategory(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deletePosCategory(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
          </details>

          <!-- Items -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-box" /> POS Items <span class="acc-count-sm">{{ posItems.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>POS Items</h4>
              <div style="display:flex;gap:6px">
                <Button label="Import from BC" icon="pi pi-download" text size="small" @click="showBcPicker=true" />
                <Button icon="pi pi-plus" text size="small" v-tooltip="'New item'" @click="newPosItem" />
              </div>
            </div>
            <div v-if="editingPosItem" class="builder-form" style="max-width:680px">
              <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px">
                <InputText v-model="posItemForm.itemNo"      placeholder="Item No" />
                <InputText v-model="posItemForm.description" placeholder="Description" />
                <InputNumber v-model="posItemForm.unitPrice" :minFractionDigits="2" :maxFractionDigits="4" mode="decimal" fluid placeholder="Price" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 80px 80px;gap:8px;margin-top:6px;align-items:center">
                <Select v-model="posItemForm.categoryCode" :options="posCategories" option-label="Name" option-value="Code"
                  placeholder="Category" show-clear />
                <InputText v-model="posItemForm.barcode" placeholder="Barcode (optional)" />
                <InputNumber v-model="posItemForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort" />
                <div class="builder-checks">
                  <Checkbox v-model="posItemForm.isActive" binary input-id="pos-item-active" />
                  <label for="pos-item-active">Active</label>
                </div>
              </div>
              <div class="schedule-actions" style="margin-top:6px">
                <Button label="Save" icon="pi pi-save" size="small" @click="savePosItem" :loading="savingPosItem" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingPosItem=false" />
              </div>
            </div>
            <DataTable :value="posItems" dataKey="ItemId" size="small" responsive-layout="scroll">
              <Column field="ItemNo"      header="No"          style="width:90px" />
              <Column field="Description" header="Description" style="min-width:180px" />
              <Column field="CategoryCode" header="Category"   style="width:110px" />
              <Column field="UnitPrice"   header="Price"       style="width:100px;text-align:right">
                <template #body="{ data }">{{ Number(data.UnitPrice||0).toFixed(2) }}</template>
              </Column>
              <Column field="SortOrder"   header="Sort"        style="width:55px" />
              <Column header="Active" style="width:70px">
                <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editPosItem(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deletePosItem(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
          </details>

          <!-- Special Prices (date-bound offers) -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-percentage" /> Special Prices (Offers) <span class="acc-count-sm">{{ specialPrices.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Special Prices (Offers)</h4>
              <div style="display:flex;gap:6px">
                <Button icon="pi pi-plus"      text size="small" v-tooltip="'New offer'"       @click="newSpecialPrice" />
                <Button icon="pi pi-upload"    text size="small" v-tooltip="'Import from CSV'" @click="openSpImport" />
                <Button icon="pi pi-download"  text size="small" v-tooltip="'Export current list to CSV'"
                        :loading="exportingSp" @click="exportSp" />
                <Button icon="pi pi-file"      text size="small" v-tooltip="'Download CSV template'"
                        @click="downloadSpTemplate" />
              </div>
            </div>
            <p class="text-muted text-sm">
              Date-bound price overrides. Leave Shop blank to apply to all shops.
              CSV columns: <strong>ItemNo, ShopCode, UnitPrice, StartingDate, EndingDate, Description, IsActive</strong>.
              Identity (ItemNo + ShopCode + StartingDate) is upserted on import — same key BC uses, so a round-trip stays consistent.
            </p>
            <div v-if="editingSpecial" class="builder-form" style="max-width:780px">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 80px;gap:8px;align-items:center">
                <InputText v-model="specialForm.itemNo" placeholder="Item No" />
                <Select v-model="specialForm.shopCode" :options="posShops" option-label="Name" option-value="Code"
                  placeholder="Shop (blank = all)" show-clear />
                <InputNumber v-model="specialForm.unitPrice" :minFractionDigits="2" mode="decimal" placeholder="Price" />
                <DatePicker v-model="specialForm.startingDate" date-format="yy-mm-dd" placeholder="Starts" />
                <DatePicker v-model="specialForm.endingDate"   date-format="yy-mm-dd" placeholder="Ends (optional)" show-clear />
                <div class="builder-checks">
                  <Checkbox v-model="specialForm.isActive" binary input-id="sp-active" />
                  <label for="sp-active">Active</label>
                </div>
              </div>
              <InputText v-model="specialForm.description" placeholder="Description / promo name" style="margin-top:6px" fluid />
              <div class="schedule-actions" style="margin-top:6px">
                <Button label="Save" icon="pi pi-save" size="small" @click="saveSpecialPrice" :loading="savingSpecial" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingSpecial=false" />
              </div>
            </div>
            <DataTable :value="specialPrices" dataKey="SpecialPriceId" size="small">
              <Column field="ItemNo"          header="Item No"     style="width:100px" />
              <Column field="ItemDescription" header="Description" style="min-width:160px" />
              <Column field="ShopCode"        header="Shop"        style="width:90px">
                <template #body="{ data }">{{ data.ShopCode || 'All' }}</template>
              </Column>
              <Column field="UnitPrice"       header="Price"       style="width:90px;text-align:right">
                <template #body="{ data }">{{ Number(data.UnitPrice||0).toFixed(2) }}</template>
              </Column>
              <Column field="StartingDate"    header="Starts"      style="width:100px">
                <template #body="{ data }">{{ data.StartingDate ? new Date(data.StartingDate).toLocaleDateString('en-KE') : '' }}</template>
              </Column>
              <Column field="EndingDate"      header="Ends"        style="width:100px">
                <template #body="{ data }">{{ data.EndingDate ? new Date(data.EndingDate).toLocaleDateString('en-KE') : '—' }}</template>
              </Column>
              <Column field="Description"     header="Promo"       style="min-width:140px" />
              <Column header="Active" style="width:65px">
                <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editSpecialPrice(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deleteSpecialPrice(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
          </details>

          <!-- Payment Types -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-credit-card" /> Payment Methods <span class="acc-count-sm">{{ posPaymentTypes.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Payment Methods</h4>
              <Button icon="pi pi-plus" text size="small" v-tooltip="'New payment method'" @click="newPosPayType" />
            </div>
            <div v-if="editingPosPayType" class="builder-form" style="max-width:700px">
              <div style="display:grid;grid-template-columns:1fr 2fr 1fr 1fr 80px 80px;gap:8px;align-items:center">
                <InputText v-model="posPayTypeForm.code" placeholder="Code (e.g. MPESA)" />
                <InputText v-model="posPayTypeForm.name" placeholder="Display name" />
                <Select v-model="posPayTypeForm.shopCode" :options="posShops" option-label="Name" option-value="Code"
                  placeholder="Shop (blank = all)" show-clear />
                <Select v-model="posPayTypeForm.paymentClass" :options="paymentClasses" placeholder="Class" />
                <InputNumber v-model="posPayTypeForm.sortOrder" :min="0" show-buttons fluid placeholder="Sort" />
                <div class="builder-checks">
                  <Checkbox v-model="posPayTypeForm.isActive" binary input-id="pos-pt-active" />
                  <label for="pos-pt-active">Active</label>
                </div>
              </div>
              <Textarea v-model="posPayTypeForm.description" :rows="2" placeholder="Description / instructions shown to cashier (optional)" style="margin-top:6px;width:100%" />

              <!-- ── Integration (STK push + payment fetch) ─────────────────── -->
              <details class="integration-block" :open="posPayTypeForm.paymentClass === 'Mobile' || posPayTypeForm.useApiEndpoint">
                <summary><i class="pi pi-link" /> Integration — STK push &amp; payment fetch</summary>
                <p class="text-muted text-sm" style="margin:6px 0 10px">
                  Fill in M-PESA Daraja credentials below to enable direct STK push from this app.
                  Or use a custom proxy by setting <em>API endpoint</em> (legacy mode).
                </p>

                <div class="builder-checks" style="margin-bottom:8px">
                  <Checkbox v-model="posPayTypeForm.useApiEndpoint" binary input-id="pt-use-api" />
                  <label for="pt-use-api">Enable STK push / external integration for this method</label>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div>
                    <label class="ig-label">API base URL</label>
                    <InputText v-model="posPayTypeForm.apiEndpoint" placeholder="https://api.safaricom.co.ke" fluid />
                  </div>
                  <div>
                    <label class="ig-label">API key (custom proxy / x-api-key)</label>
                    <InputText v-model="posPayTypeForm.apiKey" placeholder="optional" fluid />
                  </div>
                </div>

                <h5 style="margin:12px 0 4px">M-PESA Daraja credentials</h5>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div>
                    <label class="ig-label">Consumer key</label>
                    <InputText v-model="posPayTypeForm.consumerKey" fluid />
                  </div>
                  <div>
                    <label class="ig-label">Consumer secret</label>
                    <InputText v-model="posPayTypeForm.consumerSecret" type="password" fluid />
                  </div>
                  <div>
                    <label class="ig-label">Short code (PayBill / Till)</label>
                    <InputText v-model="posPayTypeForm.shortCode" fluid />
                  </div>
                  <div>
                    <label class="ig-label">Passkey</label>
                    <InputText v-model="posPayTypeForm.passkey" type="password" fluid />
                  </div>
                  <div>
                    <label class="ig-label">Transaction type</label>
                    <Select v-model="posPayTypeForm.transactionType"
                      :options="['CustomerPayBillOnline','CustomerBuyGoodsOnline']" placeholder="Type" fluid />
                  </div>
                  <div>
                    <label class="ig-label">Account reference template</label>
                    <InputText v-model="posPayTypeForm.accountReference" placeholder="defaults to order no" fluid />
                  </div>
                  <div style="grid-column:1/3">
                    <label class="ig-label">Callback URL (for STK result)</label>
                    <InputText v-model="posPayTypeForm.callbackUrl"
                      placeholder="https://nav.farmerschoice.co.ke:8088/api/pos/payments/mpesa-callback" fluid />
                  </div>
                </div>

                <h5 style="margin:12px 0 4px">Payment fetch</h5>
                <div>
                  <label class="ig-label">Payment fetch URL</label>
                  <InputText v-model="posPayTypeForm.paymentFetchUrl"
                    placeholder="http://172.16.10.5:8084/api/fetch-payments" fluid />
                  <p class="text-muted text-sm" style="margin-top:4px">
                    The app will poll this URL to reconcile mobile payments against open orders.
                    Expects JSON with a <code>payments</code> array (or a top-level array).
                  </p>
                </div>
              </details>

              <div class="schedule-actions" style="margin-top:10px">
                <Button label="Save" icon="pi pi-save" size="small" @click="savePosPayType" :loading="savingPosPayType" />
                <Button label="Cancel" icon="pi pi-times" text size="small" @click="editingPosPayType=false" />
              </div>
            </div>
            <DataTable :value="posPaymentTypes" dataKey="TypeId" size="small">
              <Column field="Code"         header="Code"  style="width:100px" />
              <Column field="Name"         header="Name"  style="min-width:160px" />
              <Column field="ShopCode"     header="Shop"  style="width:90px" />
              <Column field="PaymentClass" header="Class" style="width:110px" />
              <Column field="SortOrder"    header="Sort"  style="width:55px" />
              <Column header="Active" style="width:70px">
                <template #body="{ data }"><i :class="data.IsActive ? 'pi pi-check text-success' : 'pi pi-times text-muted'" /></template>
              </Column>
              <Column header="" style="width:80px">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button icon="pi pi-pencil" text size="small" @click="editPosPayType(data)" />
                    <Button icon="pi pi-trash"  text severity="danger" size="small" @click="deletePosPayType(data)" />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
          </details>

          <!-- Contacts -->
          <details class="pos-sub-accordion">
            <summary><i class="pi pi-users" /> Walk-in Contacts <span class="acc-count-sm">{{ posContacts.length }}</span></summary>
          <div class="pos-setup-section">
            <div class="builder-panel-head">
              <h4>Walk-in Contacts</h4>
              <Button label="Import from BC" icon="pi pi-download" text size="small" @click="showContactPicker=true" />
            </div>
            <p class="text-muted text-sm">Contacts imported from BC filtered by each shop's salesperson code. Used for promotions tracking at the POS terminal. Grouped by salesperson (SP) code — click a group to expand its members.</p>

            <div v-if="!posContacts.length" class="text-muted text-sm" style="padding:8px 0">
              No walk-in contacts imported yet — click "Import from BC" above.
            </div>
            <details v-for="grp in walkInGroups" :key="grp.spCode || '__no_sp__'" class="walkin-group">
              <summary>
                <i class="pi pi-id-card" />
                <span class="walkin-group-name">SP {{ grp.spCode || '(unassigned)' }}</span>
                <span class="acc-count-sm">{{ grp.contacts.length }} contact{{ grp.contacts.length === 1 ? '' : 's' }}</span>
              </summary>
              <DataTable :value="grp.contacts" dataKey="ContactId" size="small" responsive-layout="scroll">
                <Column field="BcContactNo"     header="Contact No" style="width:110px" />
                <Column field="Name"            header="Name"       style="min-width:180px" />
                <Column field="MobileNo"        header="Mobile"     style="width:120px" />
                <Column field="KraPin"          header="KRA PIN"    style="width:110px" />
                <Column field="ShopCode"        header="Shop"       style="width:90px" />
                <Column field="SalespersonCode" header="SP Code"    style="width:90px" />
                <Column header="" style="width:60px">
                  <template #body="{ data }">
                    <Button icon="pi pi-trash" text severity="danger" size="small"
                            v-tooltip.left="'Delete this walk-in contact'"
                            @click="deleteWalkIn(data)" />
                  </template>
                </Column>
              </DataTable>
            </details>
          </div>
          </details>

        </div>
      </details>

    </div>
  </div>

  <!-- BC Contact picker dialog -->
  <Dialog v-model:visible="showContactPicker" header="Import Walk-in Contacts from BC" :modal="true" :style="{ width: '680px' }">
    <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <Select v-model="contactShopFilter" :options="posShops" option-label="Name" option-value="Code"
        placeholder="Filter by shop" show-clear style="min-width:160px" />
      <span class="text-muted text-sm">{{ bcContacts.length }} contacts found.</span>
      <Button v-if="loadingBcContacts" label="Loading…" :loading="true" text size="small" />
    </div>
    <DataTable :value="bcContacts" v-model:selection="bcContactsSelected" dataKey="contactNo" size="small"
      responsive-layout="scroll" :scrollable="true" scrollHeight="340px">
      <Column selectionMode="multiple" style="width:40px" />
      <Column field="contactNo"  header="No"     style="width:90px" />
      <Column field="name"       header="Name"   style="min-width:180px" />
      <Column field="mobileNo"   header="Mobile" style="width:120px" />
      <Column field="kraPin"     header="KRA PIN" style="width:110px" />
      <Column field="routeCode"  header="Route"   style="width:90px" />
      <Column field="email"      header="Email"  style="min-width:160px" />
    </DataTable>
    <template #footer>
      <Button label="Cancel" text @click="showContactPicker=false" />
      <Button label="Import Selected" icon="pi pi-download" severity="success"
        :disabled="!bcContactsSelected.length" :loading="importingBcContacts"
        @click="importBcContacts" />
    </template>
  </Dialog>

  <!-- BC Item picker dialog -->
  <Dialog v-model:visible="showBcPicker" header="Import from BC (PDA Items)" :modal="true" :style="{ width: '700px' }">
    <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center">
      <span class="text-muted text-sm">{{ bcItems.length }} PDA items found. Select items to import.</span>
      <Button v-if="loadingBcItems" label="Loading…" :loading="true" text size="small" />
    </div>
    <DataTable :value="bcItems" v-model:selection="bcItemsSelected" dataKey="itemNo" size="small"
      responsive-layout="scroll" :scrollable="true" scrollHeight="350px">
      <Column selectionMode="multiple" style="width:40px" />
      <Column field="itemNo"      header="No"          style="width:90px" />
      <Column field="description" header="Description" style="min-width:180px" />
      <Column field="categoryName" header="Category"   style="width:130px" />
      <Column field="unitPrice"   header="Price"       style="width:90px;text-align:right">
        <template #body="{ data }">{{ Number(data.unitPrice||0).toFixed(2) }}</template>
      </Column>
    </DataTable>
    <template #footer>
      <Button label="Cancel" text @click="showBcPicker=false" />
      <Button label="Import Selected" icon="pi pi-download" severity="success"
        :disabled="!bcItemsSelected.length" :loading="importingBcItems"
        @click="importBcItems" />
    </template>
  </Dialog>

  <!-- Special prices CSV import -->
  <Dialog v-model:visible="spImport.visible" header="Import special prices (CSV)" :modal="true" :style="{ width: '780px' }">
    <p class="text-muted text-sm">
      CSV columns (header row required):
      <strong>ItemNo, ShopCode, UnitPrice, StartingDate, EndingDate, Description, IsActive</strong>.
      Dates use <code>YYYY-MM-DD</code>. Existing rows with the same (ItemNo + ShopCode + StartingDate) are updated; new ones are inserted.
    </p>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <input ref="spImportFileRef" type="file" accept=".csv,text/csv" @change="onSpImportFile" style="flex:1" />
      <Button label="Download template" icon="pi pi-download" text size="small" @click="downloadSpTemplate" />
    </div>
    <p v-if="spImport.parseError" class="text-sm" style="color:#b91c1c;margin-top:4px">{{ spImport.parseError }}</p>

    <DataTable v-if="spImport.rows.length" :value="spImport.rows" size="small" style="margin-top:10px"
               :scrollable="true" scrollHeight="280px">
      <Column header="#" style="width:50px"><template #body="{ index }">{{ index + 1 }}</template></Column>
      <Column field="itemNo"        header="Item No"     style="width:120px" />
      <Column field="shopCode"      header="Shop"        style="width:90px" />
      <Column field="unitPrice"     header="Price"       style="width:100px;text-align:right" />
      <Column field="startingDate"  header="Starts"      style="width:120px" />
      <Column field="endingDate"    header="Ends"        style="width:120px" />
      <Column field="description"   header="Description" style="min-width:160px" />
      <Column field="isActive"      header="Active"      style="width:80px" />
    </DataTable>

    <div v-if="spImport.result" style="margin-top:10px">
      <Message :severity="spImport.result.failed ? 'warn' : 'success'" :closable="false">
        Posted {{ spImport.result.posted }} · Failed {{ spImport.result.failed }}
        <ul v-if="spImport.result.errors?.length" style="margin:4px 0 0 18px">
          <li v-for="(e, i) in spImport.result.errors" :key="i">Row {{ e.row }} ({{ e.itemNo }}): {{ e.error }}</li>
        </ul>
      </Message>
    </div>

    <template #footer>
      <Button label="Close" text @click="spImport.visible = false" />
      <Button label="Import" icon="pi pi-send" severity="success"
              :disabled="!spImport.rows.length" :loading="spImport.posting"
              @click="postSpImport" />
    </template>
  </Dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
import { posSetupApi, yieldApi } from '@/services/pos.js'
import Dialog from 'primevue/dialog'
import { useAuthStore } from '@/stores/auth.js'
import { isGlobalAdmin } from '@/lib/posAccess.js'

const auth        = useAuthStore()
const isFullAdmin = computed(() => isGlobalAdmin(auth.user?.role))

// ── Option lists ──────────────────────────────────────────────────────────────
const roleOptions = [
  { label: 'Admin',    value: 'admin' },
  { label: 'Sales',    value: 'sales' },
  { label: 'Analyst',  value: 'analyst' },
  { label: 'Finance',  value: 'finance' },
  { label: 'Dispatch', value: 'dispatch' },
  { label: 'Security', value: 'security' },
  { label: 'Shop',     value: 'shop' },
  { label: 'Shop Admin', value: 'shop-admin' },
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
// Lazy-load registry: each section fires its loader at most once per page-open.
// Calling loadOnce(key, fn, { force: true }) re-runs (used by the manual Refresh button).
const loaded = reactive({})
async function loadOnce(key, fn, { force = false } = {}) {
  if (loaded[key] && !force) return
  loaded[key] = true
  try { await fn() }
  catch (e) { loaded[key] = false; throw e }
}
function onAccordionToggle(key, fn, ev) {
  if (ev?.target?.open) loadOnce(key, fn).catch(() => {})
}

// Per-section loaders (split from the old loadAll/loadPosSetup so the page paints
// in milliseconds and only fetches what the user actually opens).
async function loadUsersData() {
  try { users.value = (await adminApi.users()).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function loadSchedulesData() {
  try { schedules.value = (await adminApi.schedules()).data }
  catch (err) { error.value = err.response?.data?.error || err.message }
}
async function loadSmtpData() {
  try {
    const r = await adminApi.getSmtpSettings()
    smtpForm.value = {
      host:   r.data['smtp.host']   || '',
      port:   r.data['smtp.port']   || '587',
      user:   r.data['smtp.user']   || '',
      pass:   r.data['smtp.pass']   || '',
      from:   r.data['smtp.from']   || '',
      secure: String(r.data['smtp.secure'] || '').toLowerCase() === 'true',
    }
  } catch (err) { error.value = err.response?.data?.error || err.message }
}

// Manual "Refresh" button still works — it nukes the cache and reloads only sections
// that have been opened so far.
async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const reload = []
    for (const key of Object.keys(loaded)) {
      const fn = LOADERS[key]
      if (fn) { loaded[key] = false; reload.push(loadOnce(key, fn, { force: true })) }
    }
    await Promise.all(reload)
  } catch (err) { error.value = err.response?.data?.error || err.message }
  finally { loading.value = false }
}

async function saveUser(user) {
  error.value = ''
  try {
    await adminApi.updateUser(user.userId, {
      displayName: user.displayName, email: user.email, role: user.role,
      isActive: user.isActive, shopCode: user.shopCode || null,
    })
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

// ── POS Setup ────────────────────────────────────────────────────────────────

const posShops           = ref([])
const posShopOptions     = computed(() => [
  ...posShops.value.map(s => ({ label: `${s.Code} – ${s.Name}`, value: s.Code })),
])

// shops
const editingPosShop = ref(false)
const savingPosShop  = ref(false)
const posShopForm    = ref({ shopId: null, code: '', name: '', locationCode: '', salespersonCode: '', isActive: true, sortOrder: 0 })

function newPosShop()  { posShopForm.value = { shopId: null, code: '', name: '', locationCode: '', salespersonCode: '', isActive: true, sortOrder: 0 }; editingPosShop.value = true }
function editPosShop(d){ posShopForm.value = { shopId: d.ShopId, code: d.Code, name: d.Name, locationCode: d.LocationCode||'', salespersonCode: d.SalespersonCode||'', isActive: Boolean(d.IsActive), sortOrder: d.SortOrder }; editingPosShop.value = true }

async function savePosShop() {
  savingPosShop.value = true
  try { await posSetupApi.saveShop(posShopForm.value); editingPosShop.value = false; await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { savingPosShop.value = false }
}
async function deletePosShop(d) {
  try { await posSetupApi.deleteShop(d.ShopId); await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

const posCategories      = ref([])
const posItems           = ref([])
const posPaymentTypes    = ref([])

// categories
const editingPosCategory = ref(false)
const savingPosCat       = ref(false)
const posCatForm         = ref({ categoryId: null, code: '', name: '', sortOrder: 0, isActive: true })

function newPosCategory()  { posCatForm.value = { categoryId: null, code: '', name: '', sortOrder: 0, isActive: true }; editingPosCategory.value = true }
function editPosCategory(d){ posCatForm.value = { categoryId: d.CategoryId, code: d.Code, name: d.Name, sortOrder: d.SortOrder, isActive: Boolean(d.IsActive) }; editingPosCategory.value = true }

async function savePosCategory() {
  savingPosCat.value = true
  try { await posSetupApi.saveCategory(posCatForm.value); editingPosCategory.value = false; await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { savingPosCat.value = false }
}
async function deletePosCategory(d) {
  try { await posSetupApi.deleteCategory(d.CategoryId); await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// items
const editingPosItem  = ref(false)
const savingPosItem   = ref(false)
const posItemForm     = ref({ itemId: null, itemNo: '', description: '', categoryCode: '', unitPrice: 0, barcode: '', isActive: true, sortOrder: 0 })

function newPosItem()  { posItemForm.value = { itemId: null, itemNo: '', description: '', categoryCode: '', unitPrice: 0, barcode: '', isActive: true, sortOrder: 0 }; editingPosItem.value = true }
function editPosItem(d){ posItemForm.value = { itemId: d.ItemId, itemNo: d.ItemNo, description: d.Description, categoryCode: d.CategoryCode || '', unitPrice: Number(d.UnitPrice||0), barcode: d.Barcode||'', isActive: Boolean(d.IsActive), sortOrder: d.SortOrder }; editingPosItem.value = true }

async function savePosItem() {
  savingPosItem.value = true
  try { await posSetupApi.saveItem(posItemForm.value); editingPosItem.value = false; await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { savingPosItem.value = false }
}
async function deletePosItem(d) {
  try { await posSetupApi.deleteItem(d.ItemId); await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// BC item picker
const showBcPicker      = ref(false)
const bcItems           = ref([])
const bcItemsSelected   = ref([])
const loadingBcItems    = ref(false)
const importingBcItems  = ref(false)

async function openBcPicker() {
  showBcPicker.value = true; loadingBcItems.value = true; bcItems.value = []; bcItemsSelected.value = []
  try { const { data } = await posSetupApi.listBcItems('FCL'); bcItems.value = data }
  catch (e) { error.value = e.message }
  finally { loadingBcItems.value = false }
}

// watch showBcPicker opening
watch(showBcPicker, (v) => { if (v) openBcPicker() })

async function importBcItems() {
  importingBcItems.value = true
  try {
    for (const item of bcItemsSelected.value) {
      await posSetupApi.saveItem({
        itemNo: item.itemNo, description: item.description,
        categoryCode: '', unitPrice: item.unitPrice,
        barcode: item.barcode, isActive: true, sortOrder: 0,
      })
    }
    showBcPicker.value = false; await loadPosSetup()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { importingBcItems.value = false }
}

// payment types
const editingPosPayType  = ref(false)
const savingPosPayType   = ref(false)
const posPayTypeForm     = ref({
  typeId: null, code: '', shopCode: null, name: '',
  paymentClass: 'Cash', isActive: true, sortOrder: 0, description: '',
  // Integration (mostly relevant for Mobile / MPESA)
  useApiEndpoint: false, apiEndpoint: '', apiKey: '',
  consumerKey: '', consumerSecret: '', shortCode: '', passkey: '',
  transactionType: 'CustomerPayBillOnline', callbackUrl: '', accountReference: '',
  paymentFetchUrl: '',
})
function emptyPayTypeForm() {
  return {
    typeId: null, code: '', shopCode: null, name: '',
    paymentClass: 'Cash', isActive: true, sortOrder: 0, description: '',
    useApiEndpoint: false, apiEndpoint: '', apiKey: '',
    consumerKey: '', consumerSecret: '', shortCode: '', passkey: '',
    transactionType: 'CustomerPayBillOnline', callbackUrl: '', accountReference: '',
    paymentFetchUrl: '',
  }
}
const paymentClasses     = ['Cash', 'Card', 'Mobile', 'Credit', 'BankTransfer']

function newPosPayType()  { posPayTypeForm.value = emptyPayTypeForm(); editingPosPayType.value = true }
function editPosPayType(d){
  posPayTypeForm.value = {
    typeId: d.TypeId, code: d.Code, shopCode: d.ShopCode||null, name: d.Name,
    paymentClass: d.PaymentClass, isActive: Boolean(d.IsActive),
    sortOrder: d.SortOrder, description: d.Description||'',
    useApiEndpoint: Boolean(d.UseApiEndpoint), apiEndpoint: d.ApiEndpoint||'', apiKey: d.ApiKey||'',
    consumerKey: d.ConsumerKey||'', consumerSecret: d.ConsumerSecret||'',
    shortCode: d.ShortCode||'', passkey: d.Passkey||'',
    transactionType: d.TransactionType||'CustomerPayBillOnline',
    callbackUrl: d.CallbackUrl||'', accountReference: d.AccountReference||'',
    paymentFetchUrl: d.PaymentFetchUrl||'',
  }
  editingPosPayType.value = true
}

// Special prices CRUD
const specialPrices  = ref([])
const editingSpecial = ref(false)
const savingSpecial  = ref(false)
const specialForm    = ref({ specialPriceId: null, itemNo: '', shopCode: null, unitPrice: 0,
                             startingDate: new Date(), endingDate: null, description: '', isActive: true })

function newSpecialPrice()  { specialForm.value = { specialPriceId: null, itemNo: '', shopCode: null, unitPrice: 0, startingDate: new Date(), endingDate: null, description: '', isActive: true }; editingSpecial.value = true }
function editSpecialPrice(d){ specialForm.value = { specialPriceId: d.SpecialPriceId, itemNo: d.ItemNo, shopCode: d.ShopCode||null, unitPrice: Number(d.UnitPrice), startingDate: d.StartingDate ? new Date(d.StartingDate) : new Date(), endingDate: d.EndingDate ? new Date(d.EndingDate) : null, description: d.Description||'', isActive: Boolean(d.IsActive) }; editingSpecial.value = true }

function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function saveSpecialPrice() {
  savingSpecial.value = true
  try {
    await posSetupApi.saveSpecialPrice({
      ...specialForm.value,
      startingDate: isoDate(specialForm.value.startingDate),
      endingDate:   isoDate(specialForm.value.endingDate),
    })
    editingSpecial.value = false
    await loadPosSetup()
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { savingSpecial.value = false }
}
async function deleteSpecialPrice(d) {
  try { await posSetupApi.deleteSpecialPrice(d.SpecialPriceId); await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// ── Special prices CSV import / export ─────────────────────────────────────
const exportingSp = ref(false)
const spImportFileRef = ref(null)
const spImport = reactive({ visible: false, rows: [], parseError: '', posting: false, result: null })

function downloadBlob(res, filename) {
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function downloadSpTemplate() {
  try { downloadBlob(await posSetupApi.specialPricesTemplate(), 'special-prices-template.csv') }
  catch (e) { error.value = e.response?.data?.error || e.message }
}
async function exportSp() {
  exportingSp.value = true
  try {
    const stamp = new Date().toISOString().slice(0,10)
    downloadBlob(await posSetupApi.exportSpecialPricesCsv(), `special-prices-${stamp}.csv`)
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { exportingSp.value = false }
}

function openSpImport() {
  spImport.visible = true
  spImport.rows = []; spImport.parseError = ''; spImport.result = null
  if (spImportFileRef.value) spImportFileRef.value.value = ''
}
function parseSpCsv(text) {
  text = String(text || '').replace(/^﻿/, '')
  const out = []; let cur = []; let buf = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i+1] === '"') { buf += '"'; i++ }
      else if (ch === '"') inQ = false
      else buf += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { cur.push(buf); buf = '' }
      else if (ch === '\r') {}
      else if (ch === '\n') { cur.push(buf); out.push(cur); cur = []; buf = '' }
      else buf += ch
    }
  }
  if (buf.length || cur.length) { cur.push(buf); out.push(cur) }
  return out.filter(r => r.length && r.some(c => String(c).trim() !== ''))
}
function onSpImportFile(ev) {
  spImport.parseError = ''; spImport.result = null; spImport.rows = []
  const file = ev.target?.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const rows = parseSpCsv(String(reader.result || ''))
    if (rows.length < 2) { spImport.parseError = 'CSV must include a header row and at least one data row.'; return }
    const header = rows[0].map(h => String(h).trim().toLowerCase())
    const idx = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
    const cItem = idx('itemno', 'item no', 'sku')
    const cShop = idx('shopcode', 'shop')
    const cPrc  = idx('unitprice', 'price')
    const cFrom = idx('startingdate', 'starts', 'startdate', 'startingdate')
    const cTo   = idx('endingdate', 'ends', 'enddate')
    const cDesc = idx('description', 'desc')
    const cActv = idx('isactive', 'active')
    if (cItem < 0 || cPrc < 0 || cFrom < 0) {
      spImport.parseError = 'CSV must include at least: ItemNo, UnitPrice, StartingDate'
      return
    }
    const out = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const itemNo = String(row[cItem] || '').trim().toUpperCase()
      if (!itemNo) continue
      out.push({
        itemNo,
        shopCode:     cShop >= 0 ? (String(row[cShop] || '').trim().toUpperCase() || null) : null,
        unitPrice:    Number(row[cPrc] || 0),
        startingDate: String(row[cFrom] || '').trim(),
        endingDate:   cTo   >= 0 ? (String(row[cTo]   || '').trim() || null) : null,
        description:  cDesc >= 0 ? (String(row[cDesc] || '').trim() || null) : null,
        isActive:     cActv >= 0 ? (String(row[cActv] || '').trim() !== '0') : true,
      })
    }
    spImport.rows = out
    if (!out.length) spImport.parseError = 'No usable rows after parsing.'
  }
  reader.readAsText(file)
}
async function postSpImport() {
  spImport.posting = true; spImport.result = null
  try {
    const { data } = await posSetupApi.importSpecialPrices(spImport.rows)
    spImport.result = data
    if (data?.posted) await loadPosSetup()
  } catch (e) {
    spImport.parseError = e.response?.data?.error || e.message
  } finally {
    spImport.posting = false
  }
}

async function savePosPayType() {
  savingPosPayType.value = true
  try { await posSetupApi.savePaymentType(posPayTypeForm.value); editingPosPayType.value = false; await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally { savingPosPayType.value = false }
}
async function deletePosPayType(d) {
  try { await posSetupApi.deletePaymentType(d.TypeId); await loadPosSetup() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// contacts
const posContacts          = ref([])
const showContactPicker    = ref(false)
const bcContacts           = ref([])
const bcContactsSelected   = ref([])
const loadingBcContacts    = ref(false)
const importingBcContacts  = ref(false)
const contactShopFilter    = ref('')

// Group walk-ins by SP (salesperson) code — collapsed by default, expand to see members.
const walkInGroups = computed(() => {
  const map = new Map()
  for (const c of (posContacts.value || [])) {
    const key = (c.SalespersonCode || '').toUpperCase()
    if (!map.has(key)) map.set(key, { spCode: key, contacts: [] })
    map.get(key).contacts.push(c)
  }
  return [...map.values()].sort((a, b) => (a.spCode || 'zzz').localeCompare(b.spCode || 'zzz'))
})

async function deleteWalkIn(c) {
  if (!confirm(`Delete walk-in contact "${c.Name}" (${c.BcContactNo})?`)) return
  try {
    await posSetupApi.deleteSetupContact(c.ContactId)
    await loadPosSetup()
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  }
}

async function openContactPicker() {
  loadingBcContacts.value = true; bcContacts.value = []; bcContactsSelected.value = []
  // Use the first shop's salesperson code as default, or load all
  const shop = posShops.value.find(s => s.SalespersonCode) || posShops.value[0]
  contactShopFilter.value = shop?.Code || ''
  try {
    const spCode = shop?.SalespersonCode || ''
    if (!spCode) { error.value = 'Configure a Salesperson Code on a shop first'; showContactPicker.value = false; return }
    const { data } = await posSetupApi.listBcContacts('FCL', spCode)
    bcContacts.value = data
  } catch (e) { error.value = e.message }
  finally { loadingBcContacts.value = false }
}

watch(showContactPicker, (v) => { if (v) openContactPicker() })

async function importBcContacts() {
  importingBcContacts.value = true
  try {
    const { data } = await posSetupApi.importContacts(bcContactsSelected.value, contactShopFilter.value)
    showContactPicker.value = false
    await loadPosSetup()
    error.value = ''
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally { importingBcContacts.value = false }
}

// Third Parties enrolment
const thirdParties = ref([])
const editingTp    = ref(false)
const savingTp     = ref(false)
const tpForm       = ref({ thirdPartyId: null, code: '', name: '', shopCode: null, isActive: true, notes: '' })

function newTp()  { tpForm.value = { thirdPartyId: null, code: '', name: '', shopCode: null, isActive: true, notes: '' }; editingTp.value = true }
function editTp(d){ tpForm.value = { thirdPartyId: d.ThirdPartyId, code: d.Code, name: d.Name, shopCode: d.ShopCode || null, isActive: Boolean(d.IsActive), notes: d.Notes || '' }; editingTp.value = true }

async function saveTp() {
  savingTp.value = true
  try { await yieldApi.saveThirdParty(tpForm.value); editingTp.value = false; await loadThirdParties() }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { savingTp.value = false }
}
async function deleteTp(d) {
  try { await yieldApi.deleteThirdParty(d.ThirdPartyId); await loadThirdParties() }
  catch (e) { error.value = e.response?.data?.error || e.message }
}
async function loadThirdParties() {
  try { thirdParties.value = (await yieldApi.listThirdParties()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// eTIMS config (per shop)
const etimsShop      = ref('')   // '' = global / fallback
const etimsCfg       = ref({ invoiceUrl: '', invoiceNumUrl: '', creditNoteUrl: '', apiKey: '',
                              branchId: '00', companyPin: '', qrServiceUrl: '', paymentService: '' })
const savingEtimsCfg = ref(false)
const loadingEtimsBc = ref(false)
const etimsBcResult  = ref(null)

const etimsShopOpts = computed(() => [
  { label: 'Global / fallback', value: '' },
  ...posShops.value.map(s => ({ label: `${s.Code} – ${s.Name}`, value: s.Code })),
])

async function loadEtimsCfg() {
  try { etimsCfg.value = (await posSetupApi.getEtimsConfig(etimsShop.value)).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}
async function saveEtimsCfg() {
  savingEtimsCfg.value = true
  try {
    etimsCfg.value = (await posSetupApi.saveEtimsConfig({
      shopCode: etimsShop.value || null,
      ...etimsCfg.value,
    })).data
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { savingEtimsCfg.value = false }
}
async function loadEtimsBcDefaults() {
  loadingEtimsBc.value = true; etimsBcResult.value = null
  try {
    const { data } = await posSetupApi.fetchEtimsBcDefaults('FCL')
    // Only fill fields that are blank locally, so we don't overwrite an admin-changed value
    for (const k of Object.keys(data)) {
      if (!etimsCfg.value[k]) etimsCfg.value[k] = data[k]
    }
    etimsBcResult.value = { ok: true, message: 'Defaults loaded from BC. Review and click Save eTIMS Config to persist.' }
  } catch (e) {
    etimsBcResult.value = { ok: false, message: e.response?.data?.error || e.message }
  } finally {
    loadingEtimsBc.value = false
  }
}

// Print config (per shop)
const printShop         = ref('')
const printCfg          = ref({ format: 'a4', invoicePrinter: '', thermalWidthMm: 72, copies: 1 })
const installedPrinters = ref([])
const loadingPrinters   = ref(false)
const savingPrintCfg    = ref(false)
const formatOpts        = [{ label: 'A4', value: 'a4' }, { label: 'Thermal', value: 'thermal' }]

const printShopOpts = computed(() => [
  { label: 'Global / fallback', value: '' },
  ...posShops.value.map(s => ({ label: `${s.Code} – ${s.Name}`, value: s.Code })),
])
const printShopLabel = computed(() => printShopOpts.value.find(o => o.value === printShop.value)?.label || 'Global')

async function loadPrinters() {
  loadingPrinters.value = true
  try { installedPrinters.value = (await posSetupApi.listPrinters()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { loadingPrinters.value = false }
}

async function loadPrintCfg() {
  try { printCfg.value = (await posSetupApi.getPrintConfig(printShop.value)).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// ── Inventory display config (POS terminal item cards) ──────────────────────
const invCfg       = ref({ hideOutOfStock: false })
const savingInvCfg = ref(false)
async function loadInvCfg() {
  try { invCfg.value = (await posSetupApi.getInventoryConfig()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}
async function saveInvCfg() {
  savingInvCfg.value = true
  try {
    invCfg.value = (await posSetupApi.saveInventoryConfig({
      hideOutOfStock: !!invCfg.value.hideOutOfStock,
    })).data
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { savingInvCfg.value = false }
}

async function savePrintCfg() {
  savingPrintCfg.value = true
  try {
    printCfg.value = (await posSetupApi.savePrintConfig({
      shopCode: printShop.value || null,
      ...printCfg.value,
    })).data
  } catch (e) { error.value = e.response?.data?.error || e.message }
  finally   { savingPrintCfg.value = false }
}

// sync from BC
const syncingFromBc = ref(false)
const syncingStep   = ref('')
const syncSteps = [
  { kind: 'shops',         label: 'Shops / Terminals', icon: 'pi pi-building' },
  { kind: 'walk-ins',      label: 'Walk-ins',       icon: 'pi pi-user' },
  { kind: 'contacts',      label: 'Contacts',       icon: 'pi pi-users' },
  { kind: 'categories',    label: 'Categories',     icon: 'pi pi-th-large' },
  { kind: 'items',         label: 'Items',          icon: 'pi pi-box' },
  { kind: 'payment-types', label: 'Payment Methods',icon: 'pi pi-credit-card' },
]
async function syncStep(kind) {
  // Steps that support wipe-then-reimport: ask the user.
  let opts = {}
  if (kind === 'items') {
    const wipe = confirm(
      'Wipe the current PosItem catalogue and re-import from BC?\n\n' +
      'OK = wipe + fresh import (also clears favourites & special prices).\n' +
      'Cancel = upsert (keep existing items, refresh changed ones).'
    )
    opts.wipe = !!wipe
  } else if (kind === 'shops') {
    const wipe = confirm(
      'Wipe existing shops/terminals and re-import from BC?\n\n' +
      'OK = drop everything (also clears user→shop assignments) and re-import fresh.\n' +
      'Cancel = upsert (keep existing shops; new BC customers added, existing ones updated).'
    )
    opts.wipe = !!wipe
  }
  syncingStep.value = kind; syncResult.value = null
  try {
    const { data } = await posSetupApi.syncStepFromBc(kind, 'FCL', opts)
    syncResult.value = { ...data, errors: data.errors || [] }
  } catch (e) {
    syncResult.value = { kind, count: 0, errors: [e.response?.data?.error || e.message] }
  } finally {
    syncingStep.value = ''
  }
}
const syncResult    = ref(null)

async function syncFromBc() {
  syncingFromBc.value = true; syncResult.value = null
  try {
    const { data } = await posSetupApi.syncFromBc('FCL')
    syncResult.value = data
    await loadPosSetup()
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    syncingFromBc.value = false
  }
}

// Always pre-load just the shop list (small, used by many dropdowns).
async function loadPosShopsOnly() {
  try { posShops.value = (await posSetupApi.listShops()).data }
  catch (e) { error.value = e.response?.data?.error || e.message }
}

// All POS-Setup heavy loads — fired the first time the POS Setup accordion opens.
async function loadPosSetup() {
  try {
    const [shops, cats, items, pts, contacts, sp] = await Promise.all([
      posSetupApi.listShops(),
      posSetupApi.listCategories(),
      posSetupApi.listItems(),
      posSetupApi.listPaymentTypes(),
      posSetupApi.listSetupContacts(),
      posSetupApi.listSpecialPrices(),
    ])
    posShops.value        = shops.data
    posCategories.value   = cats.data
    posItems.value        = items.data
    posPaymentTypes.value = pts.data
    posContacts.value     = contacts.data
    specialPrices.value   = sp.data
    // Print config + installed printers + eTIMS config + third parties (parallel)
    Promise.all([loadPrintCfg(), loadPrinters(), loadEtimsCfg(), loadThirdParties(), loadInvCfg()]).catch(() => {})
  } catch (e) { error.value = e.response?.data?.error || e.message }
}

// Loader registry — keyed by accordion id; loadAll() re-runs only the ones already opened.
const LOADERS = {
  users:         loadUsersData,
  schedules:     loadSchedulesData,
  smtp:          loadSmtpData,
  templates:     loadTemplates,
  custPg:        loadCustPgMappings,
  posSetup:      loadPosSetup,
}

// Mount as cheap as possible: only the shop list (used in dropdowns elsewhere).
onMounted(() => { loadPosShopsOnly() })
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

.pos-setup-section { margin-bottom: 20px; }
.pos-setup-section:last-child { margin-bottom: 0; }
.text-success { color: #16a34a; }
.text-muted   { color: var(--text-color-secondary, #888); }

.cf-field { display:flex; flex-direction:column; gap:4px; }
.cf-field label { font-size:12px; color:#374151; font-weight:500; }

/* Walk-in contacts grouped by ship code (route) */
.walkin-group {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin: 6px 0;
  background: #fafafa;
  color: #111827;
  color-scheme: light;
}
.walkin-group > summary {
  display:flex; align-items:center; gap:8px;
  padding: 8px 12px;
  cursor: pointer;
  background:#f3f4f6;
  font-weight:600; color:#1f2937;
  border-radius:6px;
  user-select:none;
}
.walkin-group[open] > summary { border-radius:6px 6px 0 0; border-bottom:1px solid #e5e7eb; }
.walkin-group > summary::-webkit-details-marker { display:none; }
.walkin-group > summary::before {
  content:'▸'; transition: transform 0.15s; display:inline-block; font-size:11px; opacity:0.7;
}
.walkin-group[open] > summary::before { transform: rotate(90deg); }
.walkin-group .walkin-group-name { flex:1; }
.walkin-group :deep(.p-datatable-thead > tr > th)  { background:#fff !important; color:#111827 !important; }
.walkin-group :deep(.p-datatable-tbody > tr > td)  { background:#fff !important; color:#111827 !important; }

/* Nested POS Setup sub-accordions — explicit colours so Chrome dark mode doesn't invert text */
.pos-sub-accordion {
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #ffffff !important;
  color: #111827;
  overflow: hidden;
  color-scheme: light;
}
.pos-sub-accordion,
.pos-sub-accordion * {
  color: #111827;
}
.pos-sub-accordion .text-muted    { color: #6b7280 !important; }
.pos-sub-accordion .text-success  { color: #15803d !important; }
.pos-sub-accordion p              { color: #4b5563 !important; }
.pos-sub-accordion :deep(.p-inputtext),
.pos-sub-accordion :deep(.p-select-label),
.pos-sub-accordion :deep(.p-inputnumber-input),
.pos-sub-accordion :deep(.p-textarea) {
  background: #ffffff !important;
  color: #111827 !important;
}
.pos-sub-accordion :deep(.p-datatable-thead > tr > th) {
  background: #f3f4f6 !important; color: #111827 !important;
}
.pos-sub-accordion :deep(.p-datatable-tbody > tr) {
  background: #ffffff !important; color: #111827 !important;
}
.pos-sub-accordion :deep(.p-datatable-tbody > tr > td) { color: #111827 !important; }

.pos-sub-accordion > summary {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  font-size: 13px; font-weight: 600;
  color: #1f2937 !important;
  background: #f9fafb !important;
  cursor: pointer; user-select: none;
  list-style: none;
  transition: background 0.12s;
}
.pos-sub-accordion > summary::-webkit-details-marker { display: none; }
.pos-sub-accordion > summary::before {
  content: '▶'; font-size: 9px; color: #6b7280;
  transition: transform 0.15s; display: inline-block;
}
.pos-sub-accordion[open] > summary::before { transform: rotate(90deg); }
.pos-sub-accordion[open] > summary { background: #f1f5f9 !important; }
.pos-sub-accordion > summary:hover { background: #eff6ff !important; }
.pos-sub-accordion > summary > .pi { color: #2563eb !important; font-size: 14px; }
.pos-sub-accordion > .pos-setup-section { padding: 12px 14px; margin-bottom: 0; background: #ffffff; }
.acc-count-sm {
  margin-left: auto;
  font-size: 11px; font-weight: 600;
  color: #4b5563 !important; background: #e5e7eb !important;
  border-radius: 10px; padding: 1px 8px;
}

.sync-bar {
  display: flex; align-items: center; gap: 12px; justify-content: space-between;
  padding: 10px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;
  margin-bottom: 12px;
}
.sync-info { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; }
.sync-info > .pi { font-size: 22px; color: #0369a1; flex-shrink: 0; }
.sync-title { font-size: 13px; font-weight: 600; color: #0c4a6e; }
.sync-sub   { font-size: 11px; color: #475569; margin-top: 2px; }
.sync-steps { display:flex; flex-wrap:wrap; gap:6px; margin: 8px 0 12px; }

@media (max-width: 900px) {
  .schedule-form, .filter-grid { grid-template-columns:1fr 1fr; }
  .page-header { flex-direction:column; align-items:flex-start; }
}
@media (max-width: 600px) {
  .schedule-form, .filter-grid { grid-template-columns:1fr; }
}
</style>
