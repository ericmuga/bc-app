<template>
  <div class="bc-reports-layout">
    <aside class="slicer-panel" :class="{ 'filters-closed': !filtersOpen }">
      <div class="slicer-header">
        <i class="pi pi-sliders-h" />
        <span>Report Filters</span>
        <Button icon="pi pi-refresh" text rounded size="small" @click="resetFilters" style="margin-left:auto" />
        <Button icon="pi pi-times" text rounded size="small" @click="filtersOpen = false" v-tooltip.right="'Hide filters'" />
      </div>

      <details class="filter-box" open>
        <summary>Date Window</summary>
        <div class="filter-body">
          <label class="slicer-label">Posting Date From</label>
          <DatePicker v-model="filters.dateFrom" date-format="yy-mm-dd" show-icon fluid @date-select="onDateChange" />
          <label class="slicer-label">Posting Date To</label>
          <DatePicker v-model="filters.dateTo" date-format="yy-mm-dd" show-icon fluid @date-select="onDateChange" />
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Scope</summary>
        <div class="filter-body">
          <label class="slicer-label">Companies</label>
          <div v-for="c in ALL_COMPANIES" :key="c" class="slicer-check">
            <Checkbox :model-value="filters.companies.includes(c)" :input-id="`co-${c}`" binary @update:model-value="toggleCompany(c, $event)" />
            <label :for="`co-${c}`">{{ c }}</label>
          </div>
          <label class="slicer-label">Document Types</label>
          <div v-for="dt in DOC_TYPE_OPTIONS" :key="dt.value" class="slicer-check">
            <Checkbox :model-value="filters.docTypes.includes(dt.value)" :input-id="`dt-${dt.value}`" binary @update:model-value="toggleDocType(dt.value, $event)" />
            <label :for="`dt-${dt.value}`">{{ dt.label }}</label>
          </div>
          <div class="slicer-check" style="margin-top:6px">
            <Checkbox v-model="filters.includePda" input-id="include-pda" binary />
            <label for="include-pda">Add Current PDA (date to)</label>
          </div>
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Classification</summary>
        <div class="filter-body">
          <label class="slicer-label">Product Type</label>
          <div v-for="pt in PRODUCT_TYPE_OPTIONS" :key="pt.value" class="slicer-check">
            <RadioButton v-model="filters.productType" :input-id="`pt-${pt.value}`" :value="pt.value" />
            <label :for="`pt-${pt.value}`">{{ pt.label }}</label>
          </div>
          <label class="slicer-label">Market Type</label>
          <div v-for="g in GEN_BUS_OPTIONS" :key="g.value" class="slicer-check">
            <RadioButton v-model="filters.genBusMode" :input-id="`gb-${g.value}`" :value="g.value" />
            <label :for="`gb-${g.value}`">{{ g.label }}</label>
          </div>
          <label class="slicer-label">By-Products</label>
          <div v-for="bp in BY_PRODUCT_OPTIONS" :key="bp.value" class="slicer-check">
            <RadioButton v-model="filters.byProductMode" :input-id="`bp-${bp.value}`" :value="bp.value" />
            <label :for="`bp-${bp.value}`">{{ bp.label }}</label>
          </div>
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Comparison</summary>
        <div class="filter-body">
          <label class="slicer-label">Compare By</label>
          <div v-for="opt in WEEK_DIMENSION_OPTIONS" :key="opt.value" class="slicer-check">
            <RadioButton v-model="filters.weekDimension" :input-id="`wd-${opt.value}`" :value="opt.value" />
            <label :for="`wd-${opt.value}`">{{ opt.label }}</label>
          </div>
          <label class="slicer-label" style="margin-top:8px">Compare (baseline)</label>
          <DatePicker v-model="filters.compareFrom" date-format="yy-mm-dd" show-icon fluid placeholder="From" />
          <DatePicker v-model="filters.compareTo" date-format="yy-mm-dd" show-icon fluid placeholder="To" style="margin-top:4px" />
          <label class="slicer-label" style="margin-top:8px">With (period)</label>
          <DatePicker v-model="filters.withFrom" date-format="yy-mm-dd" show-icon fluid placeholder="From" />
          <DatePicker v-model="filters.withTo" date-format="yy-mm-dd" show-icon fluid placeholder="To" style="margin-top:4px" />
        </div>
      </details>

      <details class="filter-box" open>
        <summary>Search</summary>
        <div class="filter-body">
          <label class="slicer-label">Sector</label>
          <MultiSelect
            v-model="filters.sectorCodes"
            :options="sectorOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All sectors"
            class="filter-multi"
            :max-selected-labels="2"
          />
          <label class="slicer-label">Salesperson</label>
          <MultiSelect
            v-model="filters.salespersonCodes"
            :options="salespersonOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All salespersons"
            class="filter-multi"
            :max-selected-labels="2"
          />
          <label class="slicer-label">Route / Region</label>
          <MultiSelect
            v-model="filters.routeCodes"
            :options="routeOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All routes"
            class="filter-multi"
            :max-selected-labels="2"
          />
          <label class="slicer-label">Customer</label>
          <MultiSelect
            v-model="filters.customerNos"
            :options="customerOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All customers"
            class="filter-multi"
            :max-selected-labels="2"
          />
          <label class="slicer-label">Item No</label>
          <MultiSelect
            v-model="filters.itemNos"
            :options="itemOptions"
            option-label="label"
            option-value="value"
            filter
            display="chip"
            placeholder="All items"
            class="filter-multi"
            :max-selected-labels="2"
          />
        </div>
      </details>

      <Button v-if="!isDownloads" label="Run Report" icon="pi pi-play" class="run-btn" :loading="loading" @click="runReport" />
      <Button label="Refresh Data" icon="pi pi-refresh" severity="secondary" class="run-btn" :loading="loading" @click="forceRefresh" />
    </aside>

    <div class="report-main">
      <div class="tab-bar">
        <button class="filter-toggle-btn" @click="filtersOpen = !filtersOpen" :title="filtersOpen ? 'Hide filters' : 'Show filters'">
          <i class="pi pi-sliders-h" />
          <span class="filter-toggle-label">{{ filtersOpen ? 'Hide' : 'Filters' }}</span>
        </button>
        <button v-for="tab in TABS" :key="tab.value" class="tab-btn" :class="{ active: reportType === tab.value }" @click="switchReport(tab.value)">
          <i :class="tab.icon" /><span class="tab-label"> {{ tab.label }}</span>
        </button>
      </div>

      <div class="toolbar" v-if="loading || rawRows.length">
        <div v-if="isMatrixReport" class="view-toggle">
          <button v-for="v in VIEW_OPTIONS" :key="v.value" class="view-btn" :class="{ active: viewMode === v.value }" @click="viewMode = v.value">
            {{ v.label }}
          </button>
        </div>
        <div v-if="periodLabel" class="period-pill">{{ periodLabel }}</div>
        <div class="kpi-strip" v-if="summaryCards.length">
          <div v-for="card in summaryCards" :key="card.label" class="kpi-card">
            <span class="kpi-label">{{ card.label }}</span>
            <span class="kpi-val" :class="[card.className, { emphatic: card.emphatic }]">{{ card.value }}</span>
          </div>
        </div>
        <div class="toolbar-actions">
          <Button icon="pi pi-refresh" text size="small" @click="forceRefresh" />
          <Button icon="pi pi-download" text size="small" :disabled="!rawRows.length" @click="exportExcel" />
        </div>
      </div>

      <Message v-if="error" severity="error" :closable="false" class="mx">{{ error }}</Message>
      <Message v-if="noAccess" severity="warn" :closable="false" class="mx">Your account does not have access to Sales Reports.</Message>
      <div v-if="!loading && !error && !noAccess && !isDownloads && !rawRows.length" class="empty-state">
        <i class="pi pi-chart-bar" style="font-size:3rem;opacity:.25" />
        <p>Select filters and click <strong>Run Report</strong></p>
      </div>
      <div v-if="loading" class="skeleton-wrap">
        <Skeleton height="2rem" class="mb" v-for="n in 8" :key="n" />
      </div>

      <div v-if="!loading && isMatrixReport && matrixRows.length" class="matrix-wrap">
        <DataTable :value="matrixRowsForDisplay" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable>
          <Column :header="dimLabel" field="GroupKey" frozen style="min-width:170px" />
          <template v-for="co in activeCompanies" :key="co">
            <Column :header="`${co} Qty`" class="num-col" style="min-width:100px">
              <template #body="{ data }">{{ fmt(data[co]?.Qty) }}</template>
            </Column>
            <Column :header="`${co} Amount`" class="num-col" style="min-width:120px">
              <template #body="{ data }">{{ fmtAmt(data[co]?.Amount) }}</template>
            </Column>
          </template>
          <Column header="Total Qty" class="num-col" style="min-width:110px">
            <template #body="{ data }">{{ fmt(data._totQty) }}</template>
          </Column>
          <Column header="Total Amount" class="num-col" style="min-width:130px">
            <template #body="{ data }">{{ fmtAmt(data._totAmount) }}</template>
          </Column>
          <Column v-if="reportType === 'postingGroup'" header="" style="width:60px">
            <template #body="{ data }">
              <Button v-if="!data._isTotal" icon="pi pi-list" text rounded size="small" v-tooltip.left="'Items'" @click="openPgItemDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && (isRouteReport || isRouteWeekOnWeek) && routeCountries.length" class="matrix-wrap">
        <Message v-if="isRouteWeekOnWeek && reportMeta.compareFrom" severity="info" :closable="false" class="inline-message">
          Comparing {{ reportMeta.compareFrom }} → {{ reportMeta.compareTo }} vs {{ reportMeta.withFrom }} → {{ reportMeta.withTo }}
        </Message>
        <DataTable :value="routeCountriesForDisplay" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable>
          <Column header="Country/Region" field="CountryRegionKey" frozen style="min-width:190px" />
          <Column header="Routes" style="width:80px"><template #body="{ data }">{{ data._routeCount ?? data.routes.length }}</template></Column>
          <template v-if="isRouteReport">
            <Column v-for="sec in routeSectors" :key="sec" :header="sec" style="min-width:110px">
              <template #body="{ data }">{{ fmtAmt(data.sectors?.[sec]?.Amount ?? 0) }}</template>
            </Column>
          </template>
          <Column header="Total Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Total Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <Column v-if="isRouteWeekOnWeek" header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
          <Column v-if="isRouteWeekOnWeek" header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
          <Column v-if="isRouteWeekOnWeek" header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
          <Column v-if="isRouteWeekOnWeek" header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
          <Column header="Action" style="width:80px">
            <template #body="{ data }">
              <Button v-if="!data._isTotal" icon="pi pi-angle-right" text rounded size="small" @click="openRouteDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Customer report: grouped by sector (expandable) -->
      <div v-if="!loading && isCustomerReport && customerBySector.length" class="matrix-wrap">
        <DataTable :value="customerBySectorForDisplay" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable
          v-model:expanded-rows="expandedSectorRows" data-key="SectorKey">
          <Column expander style="width:50px" />
          <Column header="Sector" field="SectorKey" frozen style="min-width:200px" />
          <Column header="Customers" style="width:100px">
            <template #body="{ data }">{{ data._isTotal ? data._customerCount : data.customers.length }}</template>
          </Column>
          <Column header="Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Amount" style="width:130px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <template #expansion="{ data: sector }">
            <div v-if="!sector._isTotal" style="padding:0.4rem 1.5rem 0.8rem">
              <DataTable :value="sector.customers" show-gridlines size="small" responsive-layout="scroll">
                <Column header="Customer" field="CustomerKey" style="min-width:260px" />
                <Column header="Ship-tos" style="width:90px"><template #body="{ data: c }">{{ c.shipTos.length }}</template></Column>
                <Column header="Qty" style="width:110px"><template #body="{ data: c }">{{ fmt(c.CurrentQty) }}</template></Column>
                <Column header="Amount" style="width:130px"><template #body="{ data: c }">{{ fmtAmt(c.CurrentAmount) }}</template></Column>
                <Column header="Action" style="width:80px">
                  <template #body="{ data: c }">
                    <Button icon="pi pi-angle-right" text rounded size="small" @click="openCustomerDrawer(c)" />
                  </template>
                </Column>
              </DataTable>
            </div>
          </template>
        </DataTable>
      </div>

      <!-- Customer week-on-week: grouped by customer (flat list) -->
      <div v-if="!loading && isCustomerWeekOnWeek && customerGroups.length" class="matrix-wrap">
        <DataTable :value="customerGroupsForDisplay" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable>
          <Column header="Customer" field="CustomerKey" frozen style="min-width:220px" />
          <Column header="Ship-tos" style="width:90px"><template #body="{ data }">{{ data._shipToCount ?? data.shipTos.length }}</template></Column>
          <Column header="Current Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Current Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <Column header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
          <Column header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
          <Column header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
          <Column header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
          <Column header="Action" style="width:90px">
            <template #body="{ data }">
              <Button v-if="!data._isTotal" icon="pi pi-angle-right" text rounded size="small" @click="openCustomerDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isWeekOnWeek && weekRows.length" class="matrix-wrap">
        <DataTable :value="weekRowsForDisplay" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable>
          <Column :header="weekDimensionLabel" field="GroupKey" frozen style="min-width:190px" />
          <Column header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
          <Column header="Current Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
          <Column header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
          <Column header="Current Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <Column header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
          <Column header="Trend" style="width:110px">
            <template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isProductPerformance && productGroups.length" class="product-wrap">
        <div class="highlight-row">
          <div class="highlight-card">
            <span class="kpi-label">Top Gainer</span>
            <strong>{{ topGainer?.ProductKey || '–' }}</strong>
            <span>{{ topGainer?.ProductDescription || 'No product data' }}</span>
            <strong class="positive">{{ topGainer ? signedFmt(topGainer.VarianceAmount) : '–' }}</strong>
          </div>
          <div class="highlight-card">
            <span class="kpi-label">Top Loser</span>
            <strong>{{ topLoser?.ProductKey || '–' }}</strong>
            <span>{{ topLoser?.ProductDescription || 'No product data' }}</span>
            <strong class="negative">{{ topLoser ? signedFmt(topLoser.VarianceAmount) : '–' }}</strong>
          </div>
        </div>

        <DataTable :value="productGroups" show-gridlines size="small" responsive-layout="scroll">
          <Column header="Posting Group" field="GroupKey" style="min-width:180px" />
          <Column header="Products" style="width:100px">
            <template #body="{ data }">{{ data.products.length }}</template>
          </Column>
          <Column header="Prev Qty" style="min-width:110px">
            <template #body="{ data }">{{ fmt(data.PreviousQty) }}</template>
          </Column>
          <Column header="Current Qty" style="min-width:110px">
            <template #body="{ data }">{{ fmt(data.CurrentQty) }}</template>
          </Column>
          <Column header="Qty Var" style="min-width:110px">
            <template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template>
          </Column>
          <Column header="Prev Amount" style="min-width:120px">
            <template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template>
          </Column>
          <Column header="Current Amount" style="min-width:120px">
            <template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template>
          </Column>
          <Column header="Variance" style="min-width:120px">
            <template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template>
          </Column>
          <Column header="Action" style="width:100px">
            <template #body="{ data }">
              <Button icon="pi pi-list" text rounded size="small" @click="openProductDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isCustomerItem && customerItemGroups.length" class="product-wrap">
        <DataTable :value="customerItemGroupsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
          <Column header="Customer" field="CustomerKey" style="min-width:260px" />
          <Column header="Items" style="width:90px"><template #body="{ data }">{{ data._itemCount ?? data.items.length }}</template></Column>
          <Column header="Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
          <Column header="Amount" style="width:130px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
          <Column header="Price / Kilo" style="width:130px"><template #body="{ data }">{{ fmtAmt(pricePerKilo(data.CurrentAmount, data.CurrentQty)) }}</template></Column>
          <Column header="Action" style="width:100px">
            <template #body="{ data }">
              <Button v-if="!data._isTotal" icon="pi pi-list" text rounded size="small" @click="openCustomerItemDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isShopPaymentSummary && shopPaymentRows.length" class="product-wrap">
        <DataTable :value="shopPaymentRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
          <Column header="Shop" field="CustomerKey" style="min-width:260px" />
          <Column header="Invoices" style="width:90px"><template #body="{ data }">{{ fmt(data.InvoiceCount, 0) }}</template></Column>
          <Column header="Invoice Lines" style="width:110px"><template #body="{ data }">{{ fmt(data.InvoiceLines, 0) }}</template></Column>
          <Column header="Invoice Amount" style="width:130px"><template #body="{ data }">{{ fmtAmt(data.InvoiceAmount) }}</template></Column>
          <Column header="Payment Lines" style="width:110px"><template #body="{ data }">{{ fmt(data.PaymentLines, 0) }}</template></Column>
          <Column header="Payment Amount" style="width:130px"><template #body="{ data }">{{ fmtAmt(data.PaymentAmount) }}</template></Column>
          <Column header="Action" style="width:100px">
            <template #body="{ data }">
              <Button v-if="!data._isTotal" icon="pi pi-list" text rounded size="small" @click="openShopPaymentDrawer(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="!loading && isPdaVsShop && pdaVsShopRows.length" class="product-wrap">
        <DataTable :value="pdaVsShopForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
          <Column header="Customer" field="CustomerKey" style="min-width:260px" />
          <Column header="PDA Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PdaQty) }}</template></Column>
          <Column header="PDA Amount" style="width:130px"><template #body="{ data }">{{ fmtAmt(data.PdaAmount) }}</template></Column>
          <Column header="Shop Sales Qty" style="width:120px"><template #body="{ data }">{{ fmt(data.SalesQty) }}</template></Column>
          <Column header="Shop Sales Amount" style="width:140px"><template #body="{ data }">{{ fmtAmt(data.SalesAmount) }}</template></Column>
          <Column header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
          <Column header="Amt Var" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
        </DataTable>
      </div>

      <div v-if="!loading && isDownloads" class="product-wrap">
        <div class="download-grid">
          <div class="download-card">
            <h3>Customers With Blank Sector</h3>
            <p>Exports customer master records where sector is blank.</p>
            <Button label="Download Customers" icon="pi pi-download" :loading="downloadLoading" @click="exportDownloadDataset('customersBlankSector', 'customers-blank-sector')" />
          </div>
          <div class="download-card">
            <h3>Ship-to With Blank Route</h3>
            <p>Exports ship-to addresses where route code is blank.</p>
            <Button label="Download Ship-tos" icon="pi pi-download" :loading="downloadLoading" @click="exportDownloadDataset('shipTosBlankRoute', 'shiptos-blank-route')" />
          </div>
          <div class="download-card">
            <h3>All Salespeople</h3>
            <p>Exports the salesperson master list across the selected companies.</p>
            <Button label="Download Salespeople" icon="pi pi-download" :loading="downloadLoading" @click="exportDownloadDataset('salespersonsAll', 'salespersons')" />
          </div>
          <div class="download-card">
            <h3>Routes With Blank Country / Region</h3>
            <p>Exports district group codes where country or region is blank.</p>
            <Button label="Download Routes" icon="pi pi-download" :loading="downloadLoading" @click="exportDownloadDataset('routesBlankRegion', 'routes-blank-region')" />
          </div>
        </div>
      </div>

      <Drawer v-model:visible="productDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '720px' }" :header="productDrawerTitle">
        <div v-if="selectedProductGroup" class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export Details" severity="secondary" @click="exportProductDrawerExcel" />
          </div>
          <div class="drawer-kpis">
            <div class="kpi-card">
              <span class="kpi-label">Products</span>
              <span class="kpi-val emphatic">{{ selectedProductGroup.products.length }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Prev Qty</span>
              <span class="kpi-val emphatic">{{ fmt(selectedProductGroup.PreviousQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Current Qty</span>
              <span class="kpi-val emphatic positive">{{ fmt(selectedProductGroup.CurrentQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Qty Var</span>
              <span class="kpi-val emphatic" :class="varianceClass(selectedProductGroup.VarianceQty)">{{ signedFmt(selectedProductGroup.VarianceQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Prev Amount</span>
              <span class="kpi-val emphatic">{{ fmtAmt(selectedProductGroup.PreviousAmount) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Current Amount</span>
              <span class="kpi-val emphatic positive">{{ fmtAmt(selectedProductGroup.CurrentAmount) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Value Var</span>
              <span class="kpi-val emphatic" :class="varianceClass(selectedProductGroup.VarianceAmount)">{{ signedFmt(selectedProductGroup.VarianceAmount) }}</span>
            </div>
          </div>

          <div class="product-table-wrap">
            <DataTable :value="selectedProductRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Item" field="ProductKey" style="min-width:160px" />
              <Column header="Description" field="ProductDescription" style="min-width:240px" />
              <Column header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
              <Column header="Current Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
              <Column header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
              <Column header="Current Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
              <Column header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
              <Column header="Trend" style="width:110px"><template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template></Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <Drawer v-model:visible="routeDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '780px' }" :header="routeDrawerTitle">
        <div v-if="selectedRouteCountry" class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export" severity="secondary" @click="exportRouteDrawerExcel" />
          </div>
          <div class="drawer-kpis">
            <div class="kpi-card">
              <span class="kpi-label">Routes</span>
              <span class="kpi-val emphatic">{{ selectedRouteCountry.routes.length }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Prev Qty</span>
              <span class="kpi-val emphatic">{{ fmt(selectedRouteTotals.PreviousQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Current Qty</span>
              <span class="kpi-val emphatic positive">{{ fmt(selectedRouteTotals.CurrentQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Variance</span>
              <span class="kpi-val emphatic" :class="varianceClass(selectedRouteTotals.VarianceAmount)">{{ signedFmt(selectedRouteTotals.VarianceAmount) }}</span>
            </div>
          </div>

          <div class="product-table-wrap">
            <DataTable :value="selectedRouteRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Route" field="RouteKey" style="min-width:160px" frozen />
              <Column header="Description" field="RouteDescription" style="min-width:180px" />
              <template v-if="isRouteReport">
                <Column v-for="sec in routeSectors" :key="sec" :header="sec" style="min-width:110px">
                  <template #body="{ data }">{{ fmtAmt(data.sectors?.[sec]?.Amount ?? 0) }}</template>
                </Column>
              </template>
              <Column header="Total Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
              <Column header="Total Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
              <Column v-if="isRouteWeekOnWeek" header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
              <Column v-if="isRouteWeekOnWeek" header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
              <Column v-if="isRouteWeekOnWeek" header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
              <Column v-if="isRouteWeekOnWeek" header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
              <Column v-if="isRouteWeekOnWeek" header="Trend" style="width:110px"><template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template></Column>
              <Column header="" style="width:60px">
                <template #body="{ data }">
                  <Button v-if="!data._isTotal && data.RouteKey === '(Blank)'" icon="pi pi-list" text rounded size="small" v-tooltip.left="'View blank-route lines'" @click="openBlankRouteDrawer" />
                </template>
              </Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <!-- Blank route lines drill-down -->
      <Drawer v-model:visible="blankRouteDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '900px' }" header="Blank Route — Product Lines">
        <div class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export" severity="secondary" :disabled="!blankRouteRows.length" @click="exportBlankRouteExcel" />
          </div>
          <Message v-if="blankRouteError" severity="error" :closable="false">{{ blankRouteError }}</Message>
          <div v-if="blankRouteLoading" class="skeleton-wrap">
            <Skeleton height="2rem" class="mb" v-for="n in 6" :key="n" />
          </div>
          <div v-else-if="!blankRouteRows.length && !blankRouteError" class="empty-state">
            <i class="pi pi-check-circle" style="font-size:2rem;opacity:.3" />
            <p>No lines found with a blank route in this date range.</p>
          </div>
          <div v-else class="product-table-wrap">
            <DataTable :value="blankRouteRows" show-gridlines size="small" responsive-layout="scroll" :rows="200" paginator>
              <Column header="Company" field="Company" style="min-width:80px" />
              <Column header="Doc Type" field="DocType" style="min-width:110px" />
              <Column header="Doc No" field="DocNo" style="min-width:140px" />
              <Column header="Date" field="PostingDate" style="min-width:100px" />
              <Column header="Customer" style="min-width:200px">
                <template #body="{ data }">{{ data.CustomerNo }} – {{ data.CustomerName }}</template>
              </Column>
              <Column header="Item" style="min-width:200px">
                <template #body="{ data }">{{ data.ItemNo }} – {{ data.ItemDescription }}</template>
              </Column>
              <Column header="Qty" class="num-col" style="min-width:100px">
                <template #body="{ data }">{{ fmt(data.Qty) }}</template>
              </Column>
              <Column header="Amount" class="num-col" style="min-width:120px">
                <template #body="{ data }">{{ fmtAmt(data.Amount) }}</template>
              </Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <Drawer v-model:visible="customerDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '820px' }" :header="customerDrawerTitle">
        <div v-if="selectedCustomer" class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export Details" severity="secondary" @click="exportCustomerDrawerExcel" />
          </div>
          <div class="drawer-kpis">
            <div class="kpi-card">
              <span class="kpi-label">Ship-to Addresses</span>
              <span class="kpi-val emphatic">{{ selectedCustomer.shipTos.length }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Prev Qty</span>
              <span class="kpi-val emphatic">{{ fmt(selectedCustomerTotals.PreviousQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Current Qty</span>
              <span class="kpi-val emphatic positive">{{ fmt(selectedCustomerTotals.CurrentQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Variance</span>
              <span class="kpi-val emphatic" :class="varianceClass(selectedCustomerTotals.VarianceAmount)">{{ signedFmt(selectedCustomerTotals.VarianceAmount) }}</span>
            </div>
          </div>

          <div class="product-table-wrap">
            <DataTable :value="selectedCustomerRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Ship-to" field="ShipToKey" style="min-width:260px" />
              <Column header="Current Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
              <Column header="Current Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
              <Column v-if="isCustomerWeekOnWeek" header="Prev Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.PreviousQty) }}</template></Column>
              <Column v-if="isCustomerWeekOnWeek" header="Qty Var" style="width:110px"><template #body="{ data }"><span :class="varianceClass(data.VarianceQty)">{{ signedFmt(data.VarianceQty) }}</span></template></Column>
              <Column v-if="isCustomerWeekOnWeek" header="Prev Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PreviousAmount) }}</template></Column>
              <Column v-if="isCustomerWeekOnWeek" header="Variance" style="width:120px"><template #body="{ data }"><span :class="varianceClass(data.VarianceAmount)">{{ signedFmt(data.VarianceAmount) }}</span></template></Column>
              <Column v-if="isCustomerWeekOnWeek" header="Trend" style="width:110px"><template #body="{ data }"><span class="trend-pill" :class="trendClass(data.VarianceAmount)">{{ trendLabel(data.VarianceAmount) }}</span></template></Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <Drawer v-model:visible="customerItemDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '820px' }" :header="customerItemDrawerTitle">
        <div v-if="selectedCustomerItemGroup" class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export Details" severity="secondary" @click="exportCustomerItemDrawerExcel" />
          </div>
          <div class="drawer-kpis">
            <div class="kpi-card">
              <span class="kpi-label">Items</span>
              <span class="kpi-val emphatic">{{ selectedCustomerItemGroup.items.length }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Qty</span>
              <span class="kpi-val emphatic positive">{{ fmt(selectedCustomerItemTotals.CurrentQty) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Amount</span>
              <span class="kpi-val emphatic">{{ fmtAmt(selectedCustomerItemTotals.CurrentAmount) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Price / Kilo</span>
              <span class="kpi-val emphatic">{{ fmtAmt(pricePerKilo(selectedCustomerItemTotals.CurrentAmount, selectedCustomerItemTotals.CurrentQty)) }}</span>
            </div>
          </div>

          <div class="product-table-wrap">
            <DataTable :value="selectedCustomerItemRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Item" field="ProductKey" style="min-width:160px" />
              <Column header="Description" field="ProductDescription" style="min-width:260px" />
              <Column header="Qty" style="width:110px"><template #body="{ data }">{{ fmt(data.CurrentQty) }}</template></Column>
              <Column header="Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.CurrentAmount) }}</template></Column>
              <Column header="Price / Kilo" style="width:120px"><template #body="{ data }">{{ fmtAmt(pricePerKilo(data.CurrentAmount, data.CurrentQty)) }}</template></Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <Drawer v-model:visible="shopPaymentDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '780px' }" :header="shopPaymentDrawerTitle">
        <div v-if="selectedShop" class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export Details" severity="secondary" @click="exportShopPaymentDrawerExcel" />
          </div>
          <div class="drawer-kpis">
            <div class="kpi-card">
              <span class="kpi-label">Payment Types</span>
              <span class="kpi-val emphatic">{{ selectedShopPaymentDetailRows.length }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Payment Lines</span>
              <span class="kpi-val emphatic">{{ fmt(selectedShopPaymentTotals.PaymentLines, 0) }}</span>
            </div>
            <div class="kpi-card">
              <span class="kpi-label">Payment Amount</span>
              <span class="kpi-val emphatic positive">{{ fmtAmt(selectedShopPaymentTotals.PaymentAmount) }}</span>
            </div>
          </div>

          <div class="product-table-wrap">
            <DataTable :value="selectedShopPaymentRowsForDisplay" :row-class="rowClass" show-gridlines size="small" responsive-layout="scroll">
              <Column header="Payment Type" field="PaymentType" style="min-width:220px" />
              <Column header="Payment Lines" style="width:110px"><template #body="{ data }">{{ fmt(data.PaymentLines, 0) }}</template></Column>
              <Column header="Payment Amount" style="width:120px"><template #body="{ data }">{{ fmtAmt(data.PaymentAmount) }}</template></Column>
            </DataTable>
          </div>
        </div>
      </Drawer>

      <Drawer v-model:visible="pgItemDrawerVisible" position="right" :style="{ width: isMobile ? '100vw' : '900px' }" :header="selectedPgGroup ? `Items — ${selectedPgGroup.GroupKey}` : 'Items'">
        <div class="product-drawer">
          <div class="drawer-actions">
            <Button icon="pi pi-file-excel" label="Export" severity="secondary" :disabled="!pgItemPivoted.length" @click="exportPgItemExcel" />
          </div>
          <div v-if="pgItemLoading" class="skeleton-wrap">
            <Skeleton height="2rem" class="mb" v-for="n in 6" :key="n" />
          </div>
          <Message v-if="pgItemError" severity="error" :closable="false">{{ pgItemError }}</Message>
          <div v-if="!pgItemLoading && !pgItemError && pgItemPivoted.length" class="product-table-wrap">
            <div class="drawer-kpis" style="margin-bottom:0.6rem">
              <div class="kpi-card">
                <span class="kpi-label">Items</span>
                <span class="kpi-val emphatic">{{ pgItemPivoted.length - 1 }}</span>
              </div>
              <div class="kpi-card">
                <span class="kpi-label">Total Qty</span>
                <span class="kpi-val emphatic positive">{{ fmt(pgItemPivoted[0]?._totQty) }}</span>
              </div>
              <div class="kpi-card">
                <span class="kpi-label">Total Amount</span>
                <span class="kpi-val emphatic positive">{{ fmtAmt(pgItemPivoted[0]?._totAmount) }}</span>
              </div>
            </div>
            <DataTable :value="pgItemPivoted" :row-class="rowClass" show-gridlines size="small" scroll-height="flex" scrollable>
              <Column header="Item" field="ItemNo" frozen style="min-width:130px" />
              <Column header="Description" field="ItemDescription" frozen style="min-width:200px" />
              <template v-for="co in pgItemCompanies" :key="co">
                <Column :header="`${co} Qty`" class="num-col" style="min-width:100px">
                  <template #body="{ data }">{{ fmt(data[co]?.Qty) }}</template>
                </Column>
                <Column :header="`${co} Amt`" class="num-col" style="min-width:110px">
                  <template #body="{ data }">{{ fmtAmt(data[co]?.Amount) }}</template>
                </Column>
              </template>
              <Column header="Total Qty" class="num-col" style="min-width:110px">
                <template #body="{ data }">{{ fmt(data._totQty) }}</template>
              </Column>
              <Column header="Total Amount" class="num-col" style="min-width:120px">
                <template #body="{ data }">{{ fmtAmt(data._totAmount) }}</template>
              </Column>
            </DataTable>
          </div>
          <div v-if="!pgItemLoading && !pgItemError && !pgItemPivoted.length" class="empty-state">
            <i class="pi pi-inbox" style="font-size:2rem;opacity:.25" />
            <p>No items found for this group.</p>
          </div>
        </div>
      </Drawer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { bcReportsApi } from '@/services/bcReports.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import DatePicker from 'primevue/datepicker'
import MultiSelect from 'primevue/multiselect'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Drawer from 'primevue/drawer'
import * as XLSX from 'xlsx'
import { canAccessReports } from '@/lib/access.js'

const ALL_COMPANIES = ['FCL', 'CM', 'FLM', 'RMK']
const DOC_TYPE_OPTIONS = [
  { value: 'invoice', label: 'Posted Invoices' },
  { value: 'credit', label: 'Credit Memos' },
  { value: 'unposted', label: 'Unposted Orders' },
]
const PRODUCT_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Own Product' },
  { value: 'third', label: 'Third Party' },
]
const BY_PRODUCT_OPTIONS = [
  { value: 'all', label: 'Include All' },
  { value: 'exclude', label: 'Exclude By-Products' },
  { value: 'only', label: 'Only By-Products' },
]
const GEN_BUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'local', label: 'Local' },
  { value: 'foreign', label: 'Foreign' },
]
const WEEK_DIMENSION_OPTIONS = [
  { value: 'postingGroup', label: 'Posting Group' },
  { value: 'sector', label: 'Sector' },
]
const TABS = [
  { value: 'postingGroup', label: 'By Posting Group', icon: 'pi pi-tag' },
  { value: 'sector', label: 'By Sector', icon: 'pi pi-sitemap' },
  { value: 'salesperson', label: 'By Salesperson', icon: 'pi pi-user' },
  { value: 'route', label: 'By Route', icon: 'pi pi-map-marker' },
  { value: 'customer', label: 'By Customer', icon: 'pi pi-building' },
  { value: 'routeWeekOnWeek', label: 'Route WoW', icon: 'pi pi-directions-alt' },
  { value: 'customerWeekOnWeek', label: 'Customer WoW', icon: 'pi pi-chart-bar' },
  { value: 'weekOnWeek', label: 'Week On Week', icon: 'pi pi-chart-line' },
  { value: 'productPerformance', label: 'Product Performance', icon: 'pi pi-box' },
  { value: 'customerItem', label: 'Customer Item', icon: 'pi pi-th-large' },
  { value: 'shopPaymentSummary', label: 'Shop Payment Summary', icon: 'pi pi-wallet' },
  { value: 'pdaVsShop', label: 'PDA vs Shop', icon: 'pi pi-arrows-h' },
  { value: 'downloads', label: 'Downloads', icon: 'pi pi-download' },
]
const VIEW_OPTIONS = [
  { value: 'net', label: 'Net' },
  { value: 'sales', label: 'Sales Only' },
  { value: 'credits', label: 'Credits Only' },
]
const SALES_TYPES = ['Invoice', 'Unposted', 'PDA', 'PDA Archive']
const CREDIT_TYPES = ['Credit Memo']

const auth = useAuthStore()
const windowWidth = ref(window.innerWidth)
window.addEventListener('resize', () => { windowWidth.value = window.innerWidth })
const filtersOpen = ref(window.innerWidth >= 768)
const isMobile = computed(() => windowWidth.value < 768)
const loading = ref(false)
const downloadLoading = ref(false)
const error = ref(null)
const noAccess = ref(false)
const rawRows = ref([])
const rawDetailRows = ref([])
const rawExportRows = ref([])
const reportMeta = ref({})
const reportType = ref('postingGroup')
const viewMode = ref('net')
const routeDrawerVisible = ref(false)
const selectedRouteCountry = ref(null)
const blankRouteDrawerVisible = ref(false)
const blankRouteRows = ref([])
const blankRouteLoading = ref(false)
const blankRouteError = ref(null)
const customerDrawerVisible = ref(false)
const selectedCustomer = ref(null)
const productDrawerVisible = ref(false)
const selectedProductGroup = ref(null)
const customerItemDrawerVisible = ref(false)
const selectedCustomerItemGroup = ref(null)
const shopPaymentDrawerVisible = ref(false)
const selectedShop = ref(null)
const pgItemDrawerVisible = ref(false)
const pgItemRows = ref([])
const pgItemLoading = ref(false)
const pgItemError = ref(null)
const selectedPgGroup = ref(null)
const salespersonOptions = ref([])
const sectorOptions = ref([])
const routeOptions = ref([])
const customerOptions = ref([])
const itemOptions = ref([])

function defaultDate(offsetDays = 1) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}

const filters = ref({
  dateFrom: defaultDate(1),
  dateTo: defaultDate(1),
  compareFrom: defaultDate(1),
  compareTo: defaultDate(1),
  withFrom: defaultDate(1),
  withTo: defaultDate(1),
  companies: [...ALL_COMPANIES],
  docTypes: ['invoice', 'credit', 'unposted'],
  includePda: false,
  productType: 'all',
  byProductMode: 'all',
  genBusMode: 'all',
  weekDimension: 'postingGroup',
  sectorCodes: [],
  salespersonCodes: [],
  routeCodes: [],
  customerNos: [],
  itemNos: [],
})

const isMatrixReport = computed(() => ['postingGroup', 'sector', 'salesperson'].includes(reportType.value))
const isRouteReport = computed(() => reportType.value === 'route')
const isCustomerReport = computed(() => reportType.value === 'customer')
const isRouteWeekOnWeek = computed(() => reportType.value === 'routeWeekOnWeek')
const isCustomerWeekOnWeek = computed(() => reportType.value === 'customerWeekOnWeek')
const isWeekOnWeek = computed(() => reportType.value === 'weekOnWeek')
const isProductPerformance = computed(() => reportType.value === 'productPerformance')
const isCustomerItem = computed(() => reportType.value === 'customerItem')
const isShopPaymentSummary = computed(() => reportType.value === 'shopPaymentSummary')
const isPdaVsShop = computed(() => reportType.value === 'pdaVsShop')
const isDownloads = computed(() => reportType.value === 'downloads')
const isComparisonReport = computed(() => ['routeWeekOnWeek', 'customerWeekOnWeek', 'weekOnWeek', 'productPerformance'].includes(reportType.value))

const dimLabel = computed(() => ({ postingGroup: 'Posting Group', sector: 'Sector', salesperson: 'Salesperson', route: 'Route', customer: 'Customer' }[reportType.value] || 'Group'))
const weekDimensionLabel = computed(() => filters.value.weekDimension === 'sector' ? 'Sector' : 'Posting Group')
const comparisonLabel = computed(() => {
  if (!reportMeta.value.compareFrom) return ''
  return `${reportMeta.value.compareFrom} → ${reportMeta.value.compareTo}  vs  ${reportMeta.value.withFrom} → ${reportMeta.value.withTo}`
})
const periodLabel = computed(() => {
  if (isComparisonReport.value && reportMeta.value.compareFrom) return comparisonLabel.value
  if (isRouteReport.value && reportMeta.value.dateFrom) return `${reportMeta.value.dateFrom} to ${reportMeta.value.dateTo}`
  if (isCustomerReport.value && reportMeta.value.dateFrom) return `${reportMeta.value.dateFrom} to ${reportMeta.value.dateTo}`
  if ((isCustomerItem.value || isShopPaymentSummary.value || isPdaVsShop.value) && reportMeta.value.dateFrom) return `${reportMeta.value.dateFrom} to ${reportMeta.value.dateTo}`
  return ''
})

const activeCompanies = computed(() => {
  const seen = new Set(rawRows.value.map((r) => r.Company))
  return ALL_COMPANIES.filter((c) => seen.has(c))
})

const matrixTotal = computed(() => matrixRows.value.find((r) => r._isTotal) || null)
const matrixRowsForDisplay = computed(() => {
  if (!matrixRows.value.length) return []
  const total = matrixRows.value.find((row) => row._isTotal)
  const detailRows = matrixRows.value.filter((row) => !row._isTotal)
  return total ? [total, ...detailRows] : detailRows
})

// Item drill-down for Posting Group report
const pgItemCompanies = computed(() => {
  const seen = new Set(pgItemRows.value.map((r) => r.Company))
  return ALL_COMPANIES.filter((c) => seen.has(c))
})
const pgItemPivoted = computed(() => {
  const map = new Map()
  for (const row of pgItemRows.value) {
    const key = `${row.ItemNo}\x00${row.ItemDescription}`
    if (!map.has(key)) map.set(key, { ItemNo: row.ItemNo, ItemDescription: row.ItemDescription })
    const entry = map.get(key)
    if (!entry[row.Company]) entry[row.Company] = { Qty: 0, Amount: 0 }
    entry[row.Company].Qty += Number(row.Qty) || 0
    entry[row.Company].Amount += Number(row.Amount) || 0
  }
  const rows = [...map.values()].map((row) => {
    row._totQty = pgItemCompanies.value.reduce((s, co) => s + (row[co]?.Qty || 0), 0)
    row._totAmount = pgItemCompanies.value.reduce((s, co) => s + (row[co]?.Amount || 0), 0)
    return row
  }).sort((a, b) => b._totAmount - a._totAmount)
  const total = { ItemNo: 'TOTAL', ItemDescription: '', _isTotal: true }
  for (const co of pgItemCompanies.value) {
    total[co] = {
      Qty: rows.reduce((s, r) => s + (r[co]?.Qty || 0), 0),
      Amount: rows.reduce((s, r) => s + (r[co]?.Amount || 0), 0),
    }
  }
  total._totQty = rows.reduce((s, r) => s + r._totQty, 0)
  total._totAmount = rows.reduce((s, r) => s + r._totAmount, 0)
  return rows.length ? [total, ...rows] : []
})

const visibleRows = computed(() => {
  if (viewMode.value === 'sales') return rawRows.value.filter((r) => SALES_TYPES.includes(r.DocType))
  if (viewMode.value === 'credits') return rawRows.value.filter((r) => CREDIT_TYPES.includes(r.DocType))
  return rawRows.value
})

const matrixRows = computed(() => {
  if (!isMatrixReport.value || !visibleRows.value.length) return []
  const map = new Map()
  for (const row of visibleRows.value) {
    if (!map.has(row.GroupKey)) map.set(row.GroupKey, { GroupKey: row.GroupKey })
    const entry = map.get(row.GroupKey)
    if (!entry[row.Company]) entry[row.Company] = { Qty: 0, Amount: 0 }
    const sign = viewMode.value === 'credits' ? -1 : 1
    entry[row.Company].Qty += sign * (Number(row.Qty) || 0)
    entry[row.Company].Amount += sign * (Number(row.Amount) || 0)
  }
  const rows = [...map.values()].map((row) => {
    row._totQty = activeCompanies.value.reduce((sum, co) => sum + (row[co]?.Qty || 0), 0)
    row._totAmount = activeCompanies.value.reduce((sum, co) => sum + (row[co]?.Amount || 0), 0)
    return row
  }).sort((a, b) => b._totAmount - a._totAmount)
  const total = { GroupKey: 'TOTAL', _isTotal: true }
  for (const co of activeCompanies.value) {
    total[co] = { Qty: rows.reduce((sum, row) => sum + (row[co]?.Qty || 0), 0), Amount: rows.reduce((sum, row) => sum + (row[co]?.Amount || 0), 0) }
  }
  total._totQty = rows.reduce((sum, row) => sum + row._totQty, 0)
  total._totAmount = rows.reduce((sum, row) => sum + row._totAmount, 0)
  rows.push(total)
  return rows
})

const weekRows = computed(() => isWeekOnWeek.value ? rawRows.value.map(normalizeRow).sort((a, b) => {
  if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
  if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
  return b.VarianceAmount - a.VarianceAmount
}) : [])
const routeRows = computed(() => {
  if (!isRouteReport.value && !isRouteWeekOnWeek.value) return []
  if (isRouteWeekOnWeek.value) {
    return rawRows.value.map(normalizeRouteRow).sort((a, b) => {
      if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
      if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
      return b.VarianceAmount - a.VarianceAmount
    })
  }
  // Plain route report: aggregate (Country, Route) rows across sectors into pivoted rows
  const map = new Map()
  for (const raw of rawRows.value) {
    const r = normalizeRouteRow(raw)
    const key = `${r.CountryRegionKey}\x00${r.RouteKey}`
    if (!map.has(key)) {
      map.set(key, {
        CountryRegionKey: r.CountryRegionKey,
        RouteKey: r.RouteKey,
        RouteDescription: r.RouteDescription,
        CurrentQty: 0, CurrentAmount: 0,
        PreviousQty: 0, VarianceQty: 0, PreviousAmount: 0, VarianceAmount: 0,
        sectors: {},
      })
    }
    const entry = map.get(key)
    entry.CurrentQty += r.CurrentQty
    entry.CurrentAmount += r.CurrentAmount
    if (!entry.sectors[r.SectorKey]) entry.sectors[r.SectorKey] = { Qty: 0, Amount: 0 }
    entry.sectors[r.SectorKey].Qty += r.CurrentQty
    entry.sectors[r.SectorKey].Amount += r.CurrentAmount
  }
  return [...map.values()].sort((a, b) => {
    if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
    return b.CurrentAmount - a.CurrentAmount
  })
})
const routeSectors = computed(() => {
  if (!isRouteReport.value) return []
  const s = new Set()
  for (const row of routeRows.value) Object.keys(row.sectors || {}).forEach(k => s.add(k))
  return [...s].sort()
})
const routeCountries = computed(() => {
  const groups = new Map()
  for (const row of routeRows.value) {
    if (!groups.has(row.CountryRegionKey)) {
      groups.set(row.CountryRegionKey, {
        CountryRegionKey: row.CountryRegionKey,
        CurrentQty: 0, CurrentAmount: 0,
        PreviousQty: 0, VarianceQty: 0, PreviousAmount: 0, VarianceAmount: 0,
        sectors: {},
        routes: [],
      })
    }
    const group = groups.get(row.CountryRegionKey)
    group.PreviousQty += row.PreviousQty
    group.CurrentQty += row.CurrentQty
    group.VarianceQty += row.VarianceQty
    group.PreviousAmount += row.PreviousAmount
    group.CurrentAmount += row.CurrentAmount
    group.VarianceAmount += row.VarianceAmount
    for (const [sec, d] of Object.entries(row.sectors || {})) {
      if (!group.sectors[sec]) group.sectors[sec] = { Qty: 0, Amount: 0 }
      group.sectors[sec].Qty += d.Qty
      group.sectors[sec].Amount += d.Amount
    }
    group.routes.push(row)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    routes: group.routes.sort((a, b) => {
      if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
      return b.CurrentAmount - a.CurrentAmount
    }),
  })).sort((a, b) => {
    if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
    return b.CurrentAmount - a.CurrentAmount
  })
})
const routeDrawerTitle = computed(() => selectedRouteCountry.value ? `Routes - ${selectedRouteCountry.value.CountryRegionKey}` : 'Routes')
const routeTotals = computed(() => routeCountries.value.reduce((acc, row) => {
  for (const [sec, d] of Object.entries(row.sectors || {})) {
    if (!acc.sectors[sec]) acc.sectors[sec] = { Qty: 0, Amount: 0 }
    acc.sectors[sec].Qty += d.Qty
    acc.sectors[sec].Amount += d.Amount
  }
  return {
    ...acc,
    PreviousQty: acc.PreviousQty + row.PreviousQty,
    CurrentQty: acc.CurrentQty + row.CurrentQty,
    VarianceQty: acc.VarianceQty + row.VarianceQty,
    PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
    CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
    VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
  }
}, { PreviousQty: 0, CurrentQty: 0, VarianceQty: 0, PreviousAmount: 0, CurrentAmount: 0, VarianceAmount: 0, sectors: {} }))
const routeCountriesForDisplay = computed(() => routeCountries.value.length ? [{
  CountryRegionKey: 'TOTAL',
  _isTotal: true,
  _routeCount: routeRows.value.length,
  sectors: routeTotals.value.sectors,
  PreviousQty: routeTotals.value.PreviousQty,
  CurrentQty: routeTotals.value.CurrentQty,
  VarianceQty: routeTotals.value.VarianceQty,
  PreviousAmount: routeTotals.value.PreviousAmount,
  CurrentAmount: routeTotals.value.CurrentAmount,
  VarianceAmount: routeTotals.value.VarianceAmount,
  routes: [],
}, ...routeCountries.value] : [])
const selectedRouteTotals = computed(() => (selectedRouteCountry.value?.routes || []).reduce((acc, row) => {
  for (const [sec, d] of Object.entries(row.sectors || {})) {
    if (!acc.sectors[sec]) acc.sectors[sec] = { Qty: 0, Amount: 0 }
    acc.sectors[sec].Qty += d.Qty
    acc.sectors[sec].Amount += d.Amount
  }
  return {
    ...acc,
    PreviousQty: acc.PreviousQty + row.PreviousQty,
    CurrentQty: acc.CurrentQty + row.CurrentQty,
    VarianceQty: acc.VarianceQty + row.VarianceQty,
    PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
    CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
    VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
  }
}, { PreviousQty: 0, CurrentQty: 0, VarianceQty: 0, PreviousAmount: 0, CurrentAmount: 0, VarianceAmount: 0, sectors: {} }))
const selectedRouteRowsForDisplay = computed(() => {
  const rows = selectedRouteCountry.value?.routes || []
  if (!rows.length) return []
  return [{
    RouteKey: 'TOTAL',
    RouteDescription: '',
    _isTotal: true,
    sectors: selectedRouteTotals.value.sectors,
    PreviousQty: selectedRouteTotals.value.PreviousQty,
    CurrentQty: selectedRouteTotals.value.CurrentQty,
    VarianceQty: selectedRouteTotals.value.VarianceQty,
    PreviousAmount: selectedRouteTotals.value.PreviousAmount,
    CurrentAmount: selectedRouteTotals.value.CurrentAmount,
    VarianceAmount: selectedRouteTotals.value.VarianceAmount,
  }, ...rows]
})
const customerRows = computed(() => (isCustomerReport.value || isCustomerWeekOnWeek.value) ? rawRows.value.map(normalizeCustomerRow).sort((a, b) => {
  if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
  if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
  return b.VarianceAmount - a.VarianceAmount
}) : [])
const customerGroups = computed(() => {
  const groups = new Map()
  for (const row of customerRows.value) {
    if (!groups.has(row.CustomerKey)) {
      groups.set(row.CustomerKey, {
        CustomerKey: row.CustomerKey,
        PreviousQty: 0,
        CurrentQty: 0,
        VarianceQty: 0,
        PreviousAmount: 0,
        CurrentAmount: 0,
        VarianceAmount: 0,
        shipTos: [],
      })
    }
    const group = groups.get(row.CustomerKey)
    group.PreviousQty += row.PreviousQty
    group.CurrentQty += row.CurrentQty
    group.VarianceQty += row.VarianceQty
    group.PreviousAmount += row.PreviousAmount
    group.CurrentAmount += row.CurrentAmount
    group.VarianceAmount += row.VarianceAmount
    group.shipTos.push(row)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    shipTos: group.shipTos.sort((a, b) => {
      if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
      if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
      return b.VarianceAmount - a.VarianceAmount
    }),
  })).sort((a, b) => {
    if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
    if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
    return b.VarianceAmount - a.VarianceAmount
  })
})
const customerDrawerTitle = computed(() => selectedCustomer.value ? `Ship-to Addresses - ${selectedCustomer.value.CustomerKey}` : 'Ship-to Addresses')
const customerGroupsForDisplay = computed(() => customerGroups.value.length ? [{
  CustomerKey: 'TOTAL',
  _isTotal: true,
  _shipToCount: customerRows.value.length,
  PreviousQty: customerTotals.value.PreviousQty,
  CurrentQty: customerTotals.value.CurrentQty,
  VarianceQty: customerTotals.value.VarianceQty,
  PreviousAmount: customerTotals.value.PreviousAmount,
  CurrentAmount: customerTotals.value.CurrentAmount,
  VarianceAmount: customerTotals.value.VarianceAmount,
  shipTos: [],
}, ...customerGroups.value] : [])
const customerTotals = computed(() => customerGroups.value.reduce((acc, row) => ({
  PreviousQty: acc.PreviousQty + row.PreviousQty,
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  VarianceQty: acc.VarianceQty + row.VarianceQty,
  PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
  VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
}), {
  PreviousQty: 0,
  CurrentQty: 0,
  VarianceQty: 0,
  PreviousAmount: 0,
  CurrentAmount: 0,
  VarianceAmount: 0,
}))
const selectedCustomerRowsForDisplay = computed(() => {
  const rows = selectedCustomer.value?.shipTos || []
  if (!rows.length) return []
  return [{
    ShipToKey: 'TOTAL',
    _isTotal: true,
    PreviousQty: selectedCustomerTotals.value.PreviousQty,
    CurrentQty: selectedCustomerTotals.value.CurrentQty,
    VarianceQty: selectedCustomerTotals.value.VarianceQty,
    PreviousAmount: selectedCustomerTotals.value.PreviousAmount,
    CurrentAmount: selectedCustomerTotals.value.CurrentAmount,
    VarianceAmount: selectedCustomerTotals.value.VarianceAmount,
  }, ...rows]
})
const selectedCustomerTotals = computed(() => (selectedCustomer.value?.shipTos || []).reduce((acc, row) => ({
  PreviousQty: acc.PreviousQty + row.PreviousQty,
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  VarianceQty: acc.VarianceQty + row.VarianceQty,
  PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
  VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
}), {
  PreviousQty: 0,
  CurrentQty: 0,
  VarianceQty: 0,
  PreviousAmount: 0,
  CurrentAmount: 0,
  VarianceAmount: 0,
}))
const selectedCustomerRowsForExport = computed(() => (selectedCustomer.value ? [
  ...selectedCustomer.value.shipTos.map((row) => ({
    Customer: selectedCustomer.value.CustomerKey,
    ShipTo: row.ShipToKey,
    PreviousQty: row.PreviousQty,
    CurrentQty: row.CurrentQty,
    VarianceQty: row.VarianceQty,
    PreviousAmount: row.PreviousAmount,
    CurrentAmount: row.CurrentAmount,
    VarianceAmount: row.VarianceAmount,
    Trend: trendLabel(row.VarianceAmount),
  })),
  {
    Customer: selectedCustomer.value.CustomerKey,
    ShipTo: 'TOTAL',
    PreviousQty: selectedCustomerTotals.value.PreviousQty,
    CurrentQty: selectedCustomerTotals.value.CurrentQty,
    VarianceQty: selectedCustomerTotals.value.VarianceQty,
    PreviousAmount: selectedCustomerTotals.value.PreviousAmount,
    CurrentAmount: selectedCustomerTotals.value.CurrentAmount,
    VarianceAmount: selectedCustomerTotals.value.VarianceAmount,
    Trend: trendLabel(selectedCustomerTotals.value.VarianceAmount),
  },
] : []))
const customerBySector = computed(() => {
  if (!isCustomerReport.value) return []
  const sectorMap = new Map()
  for (const row of customerRows.value) {
    const sector = row.SectorKey || '(Blank)'
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { SectorKey: sector, CurrentQty: 0, CurrentAmount: 0, customers: new Map() })
    }
    const se = sectorMap.get(sector)
    se.CurrentQty += row.CurrentQty
    se.CurrentAmount += row.CurrentAmount
    if (!se.customers.has(row.CustomerKey)) {
      se.customers.set(row.CustomerKey, {
        CustomerKey: row.CustomerKey, CustomerNo: row.CustomerNo, CustomerName: row.CustomerName,
        CurrentQty: 0, CurrentAmount: 0, shipTos: [],
      })
    }
    const ce = se.customers.get(row.CustomerKey)
    ce.CurrentQty += row.CurrentQty
    ce.CurrentAmount += row.CurrentAmount
    ce.shipTos.push(row)
  }
  return [...sectorMap.values()].map((s) => ({
    ...s,
    customers: [...s.customers.values()].sort((a, b) => b.CurrentQty - a.CurrentQty),
  })).sort((a, b) => b.CurrentQty - a.CurrentQty)
})
const customerBySectorTotals = computed(() => customerBySector.value.reduce((acc, s) => ({
  CurrentQty: acc.CurrentQty + s.CurrentQty,
  CurrentAmount: acc.CurrentAmount + s.CurrentAmount,
  _customerCount: acc._customerCount + s.customers.length,
}), { CurrentQty: 0, CurrentAmount: 0, _customerCount: 0 }))
const customerBySectorForDisplay = computed(() => customerBySector.value.length ? [{
  SectorKey: 'TOTAL', _isTotal: true,
  ...customerBySectorTotals.value,
  customers: [],
}, ...customerBySector.value] : [])
const expandedSectorRows = ref({})
const productRows = computed(() => isProductPerformance.value ? rawRows.value.map(normalizeRow).sort((a, b) => b.VarianceAmount - a.VarianceAmount) : [])
const productGroups = computed(() => {
  const groups = new Map()
  for (const row of productRows.value) {
    if (!groups.has(row.GroupKey)) groups.set(row.GroupKey, { GroupKey: row.GroupKey, PreviousQty: 0, CurrentQty: 0, VarianceQty: 0, PreviousAmount: 0, CurrentAmount: 0, VarianceAmount: 0, products: [] })
    const group = groups.get(row.GroupKey)
    group.products.push(row)
    group.PreviousQty += row.PreviousQty
    group.CurrentQty += row.CurrentQty
    group.VarianceQty += row.VarianceQty
    group.PreviousAmount += row.PreviousAmount
    group.CurrentAmount += row.CurrentAmount
    group.VarianceAmount += row.VarianceAmount
  }
  return [...groups.values()].map((g) => ({
    ...g,
    products: g.products.sort((a, b) => {
      if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
      if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
      return b.VarianceAmount - a.VarianceAmount
    }),
  })).sort((a, b) => {
    const aQty = a.products.reduce((sum, row) => sum + row.CurrentQty, 0)
    const bQty = b.products.reduce((sum, row) => sum + row.CurrentQty, 0)
    if (bQty !== aQty) return bQty - aQty
    if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
    return b.VarianceAmount - a.VarianceAmount
  })
})
const topGainer = computed(() => productRows.value.find((row) => row.VarianceAmount >= 0) || productRows.value[0] || null)
const topLoser = computed(() => [...productRows.value].reverse().find((row) => row.VarianceAmount <= 0) || productRows.value.at(-1) || null)
const productDrawerTitle = computed(() => selectedProductGroup.value ? `Products - ${selectedProductGroup.value.GroupKey}` : 'Products')
const weekTotals = computed(() => weekRows.value.reduce((acc, row) => ({
  PreviousQty: acc.PreviousQty + row.PreviousQty,
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  VarianceQty: acc.VarianceQty + row.VarianceQty,
  PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
  VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
}), {
  PreviousQty: 0,
  CurrentQty: 0,
  VarianceQty: 0,
  PreviousAmount: 0,
  CurrentAmount: 0,
  VarianceAmount: 0,
}))
const weekRowsForExport = computed(() => ([
  ...weekRows.value,
  {
    GroupKey: 'TOTAL',
    ...weekTotals.value,
    Trend: trendLabel(weekTotals.value.VarianceAmount),
  },
]))
const weekRowsForDisplay = computed(() => weekRows.value.length ? [{
  GroupKey: 'TOTAL',
  _isTotal: true,
  ...weekTotals.value,
  Trend: trendLabel(weekTotals.value.VarianceAmount),
}, ...weekRows.value] : [])
const selectedProductTotals = computed(() => (selectedProductGroup.value?.products || []).reduce((acc, row) => ({
  PreviousQty: acc.PreviousQty + row.PreviousQty,
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  PreviousAmount: acc.PreviousAmount + row.PreviousAmount,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
  VarianceAmount: acc.VarianceAmount + row.VarianceAmount,
}), {
  PreviousQty: 0,
  CurrentQty: 0,
  PreviousAmount: 0,
  CurrentAmount: 0,
  VarianceAmount: 0,
}))
const selectedProductRowsForDisplay = computed(() => {
  const rows = selectedProductGroup.value?.products || []
  if (!rows.length) return []
  return [{
    ProductKey: 'TOTAL',
    ProductDescription: '',
    _isTotal: true,
    PreviousQty: selectedProductTotals.value.PreviousQty,
    CurrentQty: selectedProductTotals.value.CurrentQty,
    VarianceQty: selectedProductTotals.value.CurrentQty - selectedProductTotals.value.PreviousQty,
    PreviousAmount: selectedProductTotals.value.PreviousAmount,
    CurrentAmount: selectedProductTotals.value.CurrentAmount,
    VarianceAmount: selectedProductTotals.value.VarianceAmount,
  }, ...rows]
})
const selectedProductRowsForExport = computed(() => (selectedProductGroup.value ? [
  ...selectedProductGroup.value.products.map((row) => ({
    PostingGroup: selectedProductGroup.value.GroupKey,
    ProductKey: row.ProductKey,
    ProductDescription: row.ProductDescription,
    PreviousQty: row.PreviousQty,
    CurrentQty: row.CurrentQty,
    VarianceQty: row.VarianceQty,
    PreviousAmount: row.PreviousAmount,
    CurrentAmount: row.CurrentAmount,
    VarianceAmount: row.VarianceAmount,
    Trend: trendLabel(row.VarianceAmount),
  })),
  {
    PostingGroup: selectedProductGroup.value.GroupKey,
    ProductKey: 'TOTAL',
    ProductDescription: '',
    PreviousQty: selectedProductTotals.value.PreviousQty,
    CurrentQty: selectedProductTotals.value.CurrentQty,
    VarianceQty: selectedProductTotals.value.CurrentQty - selectedProductTotals.value.PreviousQty,
    PreviousAmount: selectedProductTotals.value.PreviousAmount,
    CurrentAmount: selectedProductTotals.value.CurrentAmount,
    VarianceAmount: selectedProductTotals.value.VarianceAmount,
    Trend: trendLabel(selectedProductTotals.value.VarianceAmount),
  },
] : []))
const customerItemRows = computed(() => isCustomerItem.value ? rawRows.value.map((row) => ({
  CustomerNo: row.CustomerNo || '(Blank)',
  CustomerName: row.CustomerName || '(Blank)',
  CustomerKey: `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}`,
  ProductKey: row.ProductKey || '(Blank)',
  ProductDescription: row.ProductDescription || '(Blank)',
  CurrentQty: Number(row.CurrentQty || 0),
  CurrentAmount: Number(row.CurrentAmount || 0),
})) : [])
const customerItemGroups = computed(() => {
  const groups = new Map()
  for (const row of customerItemRows.value) {
    if (!groups.has(row.CustomerKey)) groups.set(row.CustomerKey, { CustomerNo: row.CustomerNo, CustomerName: row.CustomerName, CustomerKey: row.CustomerKey, CurrentQty: 0, CurrentAmount: 0, items: [] })
    const group = groups.get(row.CustomerKey)
    group.CurrentQty += row.CurrentQty
    group.CurrentAmount += row.CurrentAmount
    group.items.push(row)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => {
      if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
      if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
      return a.ProductKey.localeCompare(b.ProductKey)
    }),
  })).sort((a, b) => {
    if (b.CurrentQty !== a.CurrentQty) return b.CurrentQty - a.CurrentQty
    if (b.CurrentAmount !== a.CurrentAmount) return b.CurrentAmount - a.CurrentAmount
    return a.CustomerKey.localeCompare(b.CustomerKey)
  })
})
const customerItemTotals = computed(() => customerItemGroups.value.reduce((acc, row) => ({
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
}), { CurrentQty: 0, CurrentAmount: 0 }))
const customerItemGroupsForDisplay = computed(() => customerItemGroups.value.length ? [{
  CustomerKey: 'TOTAL',
  _isTotal: true,
  _itemCount: customerItemRows.value.length,
  CurrentQty: customerItemTotals.value.CurrentQty,
  CurrentAmount: customerItemTotals.value.CurrentAmount,
  items: [],
}, ...customerItemGroups.value] : [])
const customerItemDrawerTitle = computed(() => selectedCustomerItemGroup.value ? `Items - ${selectedCustomerItemGroup.value.CustomerKey}` : 'Customer Items')
const selectedCustomerItemTotals = computed(() => (selectedCustomerItemGroup.value?.items || []).reduce((acc, row) => ({
  CurrentQty: acc.CurrentQty + row.CurrentQty,
  CurrentAmount: acc.CurrentAmount + row.CurrentAmount,
}), { CurrentQty: 0, CurrentAmount: 0 }))
const selectedCustomerItemRowsForDisplay = computed(() => {
  const rows = selectedCustomerItemGroup.value?.items || []
  if (!rows.length) return []
  return [{
    ProductKey: 'TOTAL',
    ProductDescription: '',
    _isTotal: true,
    CurrentQty: selectedCustomerItemTotals.value.CurrentQty,
    CurrentAmount: selectedCustomerItemTotals.value.CurrentAmount,
  }, ...rows]
})
const selectedCustomerItemRowsForExport = computed(() => (selectedCustomerItemGroup.value ? [
  ...selectedCustomerItemGroup.value.items.map((row) => ({
    Customer: selectedCustomerItemGroup.value.CustomerKey,
    ItemNo: row.ProductKey,
    Description: row.ProductDescription,
    Qty: row.CurrentQty,
    Amount: row.CurrentAmount,
    PricePerKg: pricePerKilo(row.CurrentAmount, row.CurrentQty),
  })),
  {
    Customer: selectedCustomerItemGroup.value.CustomerKey,
    ItemNo: 'TOTAL',
    Description: '',
    Qty: selectedCustomerItemTotals.value.CurrentQty,
    Amount: selectedCustomerItemTotals.value.CurrentAmount,
    PricePerKg: pricePerKilo(selectedCustomerItemTotals.value.CurrentAmount, selectedCustomerItemTotals.value.CurrentQty),
  },
] : []))
const shopPaymentRows = computed(() => isShopPaymentSummary.value ? rawRows.value.map((row) => ({
  CustomerNo: row.CustomerNo || '(Blank)',
  CustomerName: row.CustomerName || '(Blank)',
  CustomerKey: `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}`,
  InvoiceCount: Number(row.InvoiceCount || 0),
  InvoiceLines: Number(row.InvoiceLines || 0),
  InvoiceAmount: Number(row.InvoiceAmount || 0),
  PaymentLines: Number(row.PaymentLines || 0),
  PaymentAmount: Number(row.PaymentAmount || 0),
})).sort((a, b) => {
  if (b.PaymentAmount !== a.PaymentAmount) return b.PaymentAmount - a.PaymentAmount
  if (b.InvoiceAmount !== a.InvoiceAmount) return b.InvoiceAmount - a.InvoiceAmount
  return a.CustomerKey.localeCompare(b.CustomerKey)
}) : [])
const shopPaymentTotals = computed(() => shopPaymentRows.value.reduce((acc, row) => ({
  InvoiceCount: acc.InvoiceCount + row.InvoiceCount,
  InvoiceLines: acc.InvoiceLines + row.InvoiceLines,
  InvoiceAmount: acc.InvoiceAmount + row.InvoiceAmount,
  PaymentLines: acc.PaymentLines + row.PaymentLines,
  PaymentAmount: acc.PaymentAmount + row.PaymentAmount,
}), { InvoiceCount: 0, InvoiceLines: 0, InvoiceAmount: 0, PaymentLines: 0, PaymentAmount: 0 }))
const shopPaymentRowsForDisplay = computed(() => shopPaymentRows.value.length ? [{
  CustomerKey: 'TOTAL',
  _isTotal: true,
  InvoiceCount: shopPaymentTotals.value.InvoiceCount,
  InvoiceLines: shopPaymentTotals.value.InvoiceLines,
  InvoiceAmount: shopPaymentTotals.value.InvoiceAmount,
  PaymentLines: shopPaymentTotals.value.PaymentLines,
  PaymentAmount: shopPaymentTotals.value.PaymentAmount,
}, ...shopPaymentRows.value] : [])
const shopPaymentDrawerTitle = computed(() => selectedShop.value ? `Payment Types - ${selectedShop.value.CustomerKey}` : 'Payment Types')
const selectedShopPaymentDetailRows = computed(() => {
  if (!selectedShop.value) return []
  return rawDetailRows.value
    .filter((row) => `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}` === selectedShop.value.CustomerKey)
    .map((row) => ({
      PaymentType: row.PaymentType || '(Blank)',
      PaymentLines: Number(row.PaymentLines || 0),
      PaymentAmount: Number(row.PaymentAmount || 0),
    }))
    .sort((a, b) => {
      if (b.PaymentAmount !== a.PaymentAmount) return b.PaymentAmount - a.PaymentAmount
      return a.PaymentType.localeCompare(b.PaymentType)
    })
})
const selectedShopPaymentTotals = computed(() => selectedShopPaymentDetailRows.value.reduce((acc, row) => ({
  PaymentLines: acc.PaymentLines + row.PaymentLines,
  PaymentAmount: acc.PaymentAmount + row.PaymentAmount,
}), { PaymentLines: 0, PaymentAmount: 0 }))
const selectedShopPaymentRowsForDisplay = computed(() => selectedShopPaymentDetailRows.value.length ? [{
  PaymentType: 'TOTAL',
  _isTotal: true,
  PaymentLines: selectedShopPaymentTotals.value.PaymentLines,
  PaymentAmount: selectedShopPaymentTotals.value.PaymentAmount,
}, ...selectedShopPaymentDetailRows.value] : [])
const selectedShopPaymentExportRows = computed(() => {
  if (!selectedShop.value) return []
  return rawExportRows.value
    .filter((row) => `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}` === selectedShop.value.CustomerKey)
    .map((row) => ({
      Company: row.Company,
      Shop: `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}`,
      InvoiceNo: row.InvoiceNo || '(Blank)',
      PaymentHeaderNo: row.PaymentHeaderNo || '(Blank)',
      LinkedReceiptNo: row.LinkedReceiptNo || '',
      PostingDate: row.PostingDate,
      PaymentType: row.PaymentType || '(Blank)',
      PaymentReference: row.PaymentReference || '',
      PaymentDate: row.PaymentDate,
      MobileNo: row.MobileNo || '',
      PaymentAmount: Number(row.PaymentAmount || 0),
    }))
    .sort((a, b) => b.PaymentAmount - a.PaymentAmount)
})

const pdaVsShopRows = computed(() => isPdaVsShop.value ? rawRows.value.map((row) => ({
  CustomerNo: row.CustomerNo || '(Blank)',
  CustomerName: row.CustomerName || '(Blank)',
  CustomerKey: `${row.CustomerNo || '(Blank)'} - ${row.CustomerName || '(Blank)'}`,
  PdaQty: Number(row.PdaQty || 0),
  PdaAmount: Number(row.PdaAmount || 0),
  SalesQty: Number(row.SalesQty || 0),
  SalesAmount: Number(row.SalesAmount || 0),
  VarianceQty: Number(row.VarianceQty || 0),
  VarianceAmount: Number(row.VarianceAmount || 0),
})).sort((a, b) => b.PdaQty - a.PdaQty || b.SalesQty - a.SalesQty) : [])
const pdaVsShopTotals = computed(() => pdaVsShopRows.value.reduce((acc, r) => ({
  PdaQty: acc.PdaQty + r.PdaQty,
  PdaAmount: acc.PdaAmount + r.PdaAmount,
  SalesQty: acc.SalesQty + r.SalesQty,
  SalesAmount: acc.SalesAmount + r.SalesAmount,
  VarianceQty: acc.VarianceQty + r.VarianceQty,
  VarianceAmount: acc.VarianceAmount + r.VarianceAmount,
}), { PdaQty: 0, PdaAmount: 0, SalesQty: 0, SalesAmount: 0, VarianceQty: 0, VarianceAmount: 0 }))
const pdaVsShopForDisplay = computed(() => pdaVsShopRows.value.length ? [{
  CustomerKey: 'TOTAL', _isTotal: true, ...pdaVsShopTotals.value,
}, ...pdaVsShopRows.value] : [])

const summaryCards = computed(() => {
  if (isMatrixReport.value && matrixRows.value.length) {
    const total = matrixRows.value.find((row) => row._isTotal)
    return total ? [
      { label: 'Groups', value: String(matrixRows.value.length - 1) },
      { label: 'Qty', value: fmt(total._totQty), emphatic: true },
      { label: 'Amount', value: fmtAmt(total._totAmount), className: 'positive', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(total._totAmount, total._totQty)), emphatic: true },
    ] : []
  }
  if (isWeekOnWeek.value && weekRows.value.length) {
    const prevQty = weekRows.value.reduce((sum, row) => sum + row.PreviousQty, 0)
    const currQty = weekRows.value.reduce((sum, row) => sum + row.CurrentQty, 0)
    const prev = weekRows.value.reduce((sum, row) => sum + row.PreviousAmount, 0)
    const curr = weekRows.value.reduce((sum, row) => sum + row.CurrentAmount, 0)
    const variance = curr - prev
    return [
      { label: 'Groups', value: String(weekRows.value.length) },
      { label: 'Prev Qty', value: fmt(prevQty), emphatic: true },
      { label: 'Current Qty', value: fmt(currQty), className: 'positive', emphatic: true },
      { label: 'Prev Amount', value: fmtAmt(prev) },
      { label: 'Current Amount', value: fmtAmt(curr), className: 'positive', emphatic: true },
      { label: 'Variance', value: signedFmt(variance), className: variance >= 0 ? 'positive' : 'negative', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(curr, currQty)), emphatic: true },
    ]
  }
  if (isRouteReport.value && routeCountries.value.length) {
    return [
      { label: 'Countries/Regions', value: String(routeCountries.value.length) },
      { label: 'Routes', value: String(routeRows.value.length) },
      { label: 'Qty', value: fmt(routeTotals.value.CurrentQty), className: 'positive', emphatic: true },
      { label: 'Amount', value: fmtAmt(routeTotals.value.CurrentAmount), className: 'positive', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(routeTotals.value.CurrentAmount, routeTotals.value.CurrentQty)), emphatic: true },
    ]
  }
  if (isRouteWeekOnWeek.value && routeCountries.value.length) {
    return [
      { label: 'Countries/Regions', value: String(routeCountries.value.length) },
      { label: 'Routes', value: String(routeRows.value.length) },
      { label: 'Prev Qty', value: fmt(routeTotals.value.PreviousQty), emphatic: true },
      { label: 'Current Qty', value: fmt(routeTotals.value.CurrentQty), className: 'positive', emphatic: true },
      { label: 'Current Amount', value: fmtAmt(routeTotals.value.CurrentAmount), className: 'positive', emphatic: true },
      { label: 'Variance', value: signedFmt(routeTotals.value.VarianceAmount), className: routeTotals.value.VarianceAmount >= 0 ? 'positive' : 'negative', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(routeTotals.value.CurrentAmount, routeTotals.value.CurrentQty)), emphatic: true },
    ]
  }
  if (isCustomerReport.value && customerBySector.value.length) {
    return [
      { label: 'Sectors', value: String(customerBySector.value.length) },
      { label: 'Customers', value: String(customerBySectorTotals.value._customerCount) },
      { label: 'Ship-to Addresses', value: String(customerRows.value.length) },
      { label: 'Qty', value: fmt(customerBySectorTotals.value.CurrentQty), className: 'positive', emphatic: true },
      { label: 'Amount', value: fmtAmt(customerBySectorTotals.value.CurrentAmount), className: 'positive', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(customerBySectorTotals.value.CurrentAmount, customerBySectorTotals.value.CurrentQty)), emphatic: true },
    ]
  }
  if (isCustomerWeekOnWeek.value && customerGroups.value.length) {
    return [
      { label: 'Customers', value: String(customerGroups.value.length) },
      { label: 'Ship-to Addresses', value: String(customerRows.value.length) },
      { label: 'Prev Qty', value: fmt(customerTotals.value.PreviousQty), emphatic: true },
      { label: 'Current Qty', value: fmt(customerTotals.value.CurrentQty), className: 'positive', emphatic: true },
      { label: 'Current Amount', value: fmtAmt(customerTotals.value.CurrentAmount), className: 'positive', emphatic: true },
      { label: 'Variance', value: signedFmt(customerTotals.value.VarianceAmount), className: customerTotals.value.VarianceAmount >= 0 ? 'positive' : 'negative', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(customerTotals.value.CurrentAmount, customerTotals.value.CurrentQty)), emphatic: true },
    ]
  }
  if (isProductPerformance.value && productRows.value.length) {
    const currentQty = productRows.value.reduce((sum, row) => sum + row.CurrentQty, 0)
    const varianceQty = productRows.value.reduce((sum, row) => sum + row.VarianceQty, 0)
    const variance = productRows.value.reduce((sum, row) => sum + row.VarianceAmount, 0)
    return [
      { label: 'Posting Groups', value: String(productGroups.value.length) },
      { label: 'Products', value: String(productRows.value.length) },
      { label: 'Current Qty', value: fmt(currentQty), emphatic: true },
      { label: 'Qty Var', value: signedFmt(varianceQty), className: varianceQty >= 0 ? 'positive' : 'negative', emphatic: true },
      { label: 'Current Amount', value: fmtAmt(productRows.value.reduce((sum, row) => sum + row.CurrentAmount, 0)), emphatic: true },
      { label: 'Value Var', value: signedFmt(variance), className: variance >= 0 ? 'positive' : 'negative', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(productRows.value.reduce((sum, row) => sum + row.CurrentAmount, 0), currentQty)), emphatic: true },
    ]
  }
  if (isCustomerItem.value && customerItemGroups.value.length) {
    return [
      { label: 'Customers', value: String(customerItemGroups.value.length) },
      { label: 'Items', value: String(customerItemRows.value.length) },
      { label: 'Qty', value: fmt(customerItemTotals.value.CurrentQty), emphatic: true },
      { label: 'Amount', value: fmtAmt(customerItemTotals.value.CurrentAmount), className: 'positive', emphatic: true },
      { label: 'Price / Kilo', value: fmtAmt(ratio(customerItemTotals.value.CurrentAmount, customerItemTotals.value.CurrentQty)), emphatic: true },
    ]
  }
  if (isShopPaymentSummary.value && shopPaymentRows.value.length) {
    return [
      { label: 'Shops', value: String(shopPaymentRows.value.length) },
      { label: 'Invoice Amount', value: fmtAmt(shopPaymentTotals.value.InvoiceAmount), emphatic: true },
      { label: 'Payment Amount', value: fmtAmt(shopPaymentTotals.value.PaymentAmount), className: 'positive', emphatic: true },
      { label: 'Invoice Lines', value: fmt(shopPaymentTotals.value.InvoiceLines), emphatic: true },
      { label: 'Payment Lines', value: fmt(shopPaymentTotals.value.PaymentLines), emphatic: true },
    ]
  }
  if (isPdaVsShop.value && pdaVsShopRows.value.length) {
    return [
      { label: 'Customers', value: String(pdaVsShopRows.value.length) },
      { label: 'PDA Qty', value: fmt(pdaVsShopTotals.value.PdaQty), emphatic: true },
      { label: 'PDA Amount', value: fmtAmt(pdaVsShopTotals.value.PdaAmount), emphatic: true },
      { label: 'Shop Sales Qty', value: fmt(pdaVsShopTotals.value.SalesQty), className: 'positive', emphatic: true },
      { label: 'Shop Sales Amount', value: fmtAmt(pdaVsShopTotals.value.SalesAmount), className: 'positive', emphatic: true },
      { label: 'Variance', value: signedFmt(pdaVsShopTotals.value.VarianceAmount), className: pdaVsShopTotals.value.VarianceAmount >= 0 ? 'positive' : 'negative', emphatic: true },
    ]
  }
  return []
})

function normalizeRow(row) {
  return {
    ...row,
    PreviousQty: Number(row.PreviousQty || 0),
    CurrentQty: Number(row.CurrentQty || 0),
    VarianceQty: Number(row.VarianceQty || 0),
    PreviousAmount: Number(row.PreviousAmount || 0),
    CurrentAmount: Number(row.CurrentAmount || 0),
    VarianceAmount: Number(row.VarianceAmount || 0),
  }
}

const toDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}
const fmt = (val, dec = 2) => val == null || val === '' ? '–' : Number(val).toLocaleString('en-KE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtAmt = (val) => fmt(val, 2)
const ratio = (amount, qty) => Number(qty) ? Number(amount || 0) / Number(qty) : 0
const pricePerKilo = (amount, qty) => ratio(amount, qty)
const signedFmt = (val) => `${Number(val) >= 0 ? '+' : ''}${fmt(val, 2)}`
const varianceClass = (val) => Number(val) >= 0 ? 'positive' : 'negative'
const trendClass = (val) => Number(val) > 0 ? 'positive' : Number(val) < 0 ? 'negative' : 'neutral'
const trendLabel = (val) => Number(val) > 0 ? 'Increase' : Number(val) < 0 ? 'Decrease' : 'Flat'
const rowClass = (data) => data._isTotal ? 'total-row' : ''

function toggleCompany(company, checked) {
  const list = [...filters.value.companies]
  if (checked) { if (!list.includes(company)) list.push(company) } else { filters.value.companies = list.filter((value) => value !== company); return }
  filters.value.companies = list
}

function toggleDocType(docType, checked) {
  const list = [...filters.value.docTypes]
  if (checked) { if (!list.includes(docType)) list.push(docType) } else { filters.value.docTypes = list.filter((value) => value !== docType); return }
  filters.value.docTypes = list
}

function resetFilters() {
  filters.value = {
    dateFrom: defaultDate(1),
    dateTo: defaultDate(1),
    compareFrom: defaultDate(1),
    compareTo: defaultDate(1),
    withFrom: defaultDate(1),
    withTo: defaultDate(1),
    companies: [...ALL_COMPANIES],
    docTypes: ['invoice', 'credit', 'unposted'],
    includePda: false,
    productType: 'all',
    byProductMode: 'all',
    genBusMode: 'all',
    weekDimension: 'postingGroup',
    sectorCodes: [],
    salespersonCodes: [],
    routeCodes: [],
    customerNos: [],
    itemNos: [],
  }
  rawRows.value = []
  rawDetailRows.value = []
  rawExportRows.value = []
  reportMeta.value = {}
  error.value = null
  selectedRouteCountry.value = null
  routeDrawerVisible.value = false
  blankRouteRows.value = []
  blankRouteDrawerVisible.value = false
  selectedCustomer.value = null
  customerDrawerVisible.value = false
  selectedProductGroup.value = null
  productDrawerVisible.value = false
  selectedCustomerItemGroup.value = null
  customerItemDrawerVisible.value = false
  selectedShop.value = null
  shopPaymentDrawerVisible.value = false
  selectedPgGroup.value = null
  pgItemDrawerVisible.value = false
  pgItemRows.value = []
}

function onDateChange() {
  if (rawRows.value.length) runReport()
}

function switchReport(type) {
  reportType.value = type
  rawRows.value = []
  rawDetailRows.value = []
  rawExportRows.value = []
  reportMeta.value = {}
  viewMode.value = 'net'
  selectedRouteCountry.value = null
  routeDrawerVisible.value = false
  blankRouteRows.value = []
  blankRouteDrawerVisible.value = false
  selectedCustomer.value = null
  customerDrawerVisible.value = false
  selectedProductGroup.value = null
  productDrawerVisible.value = false
  selectedCustomerItemGroup.value = null
  customerItemDrawerVisible.value = false
  selectedShop.value = null
  shopPaymentDrawerVisible.value = false
  selectedPgGroup.value = null
  pgItemDrawerVisible.value = false
  pgItemRows.value = []
  if (!isDownloads.value) runReport()
}

function openRouteDrawer(country) {
  selectedRouteCountry.value = country
  routeDrawerVisible.value = true
}

function exportRouteDrawerExcel() {
  if (!selectedRouteCountry.value) return
  const wb = XLSX.utils.book_new()
  const rows = selectedRouteCountry.value.routes.map((r) => ({
    Route: r.RouteKey,
    Description: r.RouteDescription || '',
    CurrentQty: r.CurrentQty,
    CurrentAmount: r.CurrentAmount,
    ...(isRouteWeekOnWeek.value ? {
      PreviousQty: r.PreviousQty,
      VarianceQty: r.VarianceQty,
      PreviousAmount: r.PreviousAmount,
      VarianceAmount: r.VarianceAmount,
      Trend: trendLabel(r.VarianceAmount),
    } : {}),
  }))
  rows.push({
    Route: 'TOTAL',
    Description: '',
    CurrentQty: selectedRouteTotals.value.CurrentQty,
    CurrentAmount: selectedRouteTotals.value.CurrentAmount,
    ...(isRouteWeekOnWeek.value ? {
      PreviousQty: selectedRouteTotals.value.PreviousQty,
      VarianceQty: selectedRouteTotals.value.VarianceQty,
      PreviousAmount: selectedRouteTotals.value.PreviousAmount,
      VarianceAmount: selectedRouteTotals.value.VarianceAmount,
      Trend: '',
    } : {}),
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Routes')
  XLSX.writeFile(wb, `bc-routes-${selectedRouteCountry.value.CountryRegionKey}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

async function openBlankRouteDrawer() {
  blankRouteDrawerVisible.value = true
  blankRouteError.value = null
  if (blankRouteRows.value.length) return
  blankRouteLoading.value = true
  try {
    const thirdParty = filters.value.productType === 'own' ? 0 : filters.value.productType === 'third' ? 1 : null
    const byProduct = filters.value.byProductMode === 'only' ? 1 : filters.value.byProductMode === 'exclude' ? 0 : null
    const { data } = await bcReportsApi.blankRouteLines({
      dateFrom: toDateStr(filters.value.dateFrom),
      dateTo: toDateStr(filters.value.dateTo),
      companies: filters.value.companies,
      docTypes: filters.value.docTypes,
      thirdParty,
      byProduct,
      genBusMode: filters.value.genBusMode,
      customerNos: filters.value.customerNos,
      itemNos: filters.value.itemNos,
      salespersonCodes: filters.value.salespersonCodes,
    })
    blankRouteRows.value = data
  } catch (err) {
    blankRouteError.value = err.response?.data?.error || err.message
  } finally {
    blankRouteLoading.value = false
  }
}

function exportBlankRouteExcel() {
  if (!blankRouteRows.value.length) return
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blankRouteRows.value), 'BlankRouteLines')
  XLSX.writeFile(wb, `bc-blank-route-lines-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

function openCustomerDrawer(customer) {
  selectedCustomer.value = customer
  customerDrawerVisible.value = true
}

function openProductDrawer(group) {
  selectedProductGroup.value = group
  productDrawerVisible.value = true
}

function openCustomerItemDrawer(group) {
  selectedCustomerItemGroup.value = group
  customerItemDrawerVisible.value = true
}

function openShopPaymentDrawer(shop) {
  selectedShop.value = shop
  shopPaymentDrawerVisible.value = true
}

async function openPgItemDrawer(row) {
  if (row._isTotal) return
  selectedPgGroup.value = row
  pgItemRows.value = []
  pgItemError.value = null
  pgItemDrawerVisible.value = true
  pgItemLoading.value = true
  try {
    const thirdParty = filters.value.productType === 'own' ? 0 : filters.value.productType === 'third' ? 1 : null
    const byProduct = filters.value.byProductMode === 'only' ? 1 : filters.value.byProductMode === 'exclude' ? 0 : null
    const { data } = await bcReportsApi.run('postingGroupItems', {
      dateFrom: toDateStr(filters.value.dateFrom),
      dateTo: toDateStr(filters.value.dateTo),
      companies: filters.value.companies,
      docTypes: filters.value.docTypes,
      thirdParty,
      byProduct,
      genBusMode: filters.value.genBusMode,
      sectorCodes: filters.value.sectorCodes,
      salespersonCodes: filters.value.salespersonCodes,
      routeCodes: filters.value.routeCodes,
      customerNos: filters.value.customerNos,
      itemNos: filters.value.itemNos,
      postingGroupKey: row.GroupKey,
    })
    pgItemRows.value = Array.isArray(data) ? data : (data.rows || [])
  } catch (err) {
    pgItemError.value = err.response?.data?.error || err.message
  } finally {
    pgItemLoading.value = false
  }
}

function exportPgItemExcel() {
  if (!pgItemPivoted.value.length || !selectedPgGroup.value) return
  const wb = XLSX.utils.book_new()
  const exportRows = pgItemPivoted.value.map((row) => ({
    Item: row.ItemNo,
    Description: row.ItemDescription,
    ...Object.fromEntries(pgItemCompanies.value.flatMap((co) => [
      [`${co} Qty`, row[co]?.Qty ?? 0],
      [`${co} Amount`, row[co]?.Amount ?? 0],
    ])),
    'Total Qty': row._totQty,
    'Total Amount': row._totAmount,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'Items')
  XLSX.writeFile(wb, `bc-pg-items-${selectedPgGroup.value.GroupKey}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

async function loadMasterOptions(refresh = false) {
  const thirdParty = filters.value.productType === 'own' ? 0 : filters.value.productType === 'third' ? 1 : null
  const byProduct = filters.value.byProductMode === 'only' ? 1 : filters.value.byProductMode === 'exclude' ? 0 : null
  const [sectorsRes, salespersonsRes, routesRes, customersRes, itemsRes] = await Promise.allSettled([
    bcReportsApi.sectors(filters.value.companies),
    bcReportsApi.salespersons(filters.value.companies, refresh, { thirdParty, byProduct }),
    bcReportsApi.routes(filters.value.companies, refresh, { thirdParty, byProduct }),
    bcReportsApi.customers(filters.value.companies, refresh, { thirdParty, byProduct }),
    bcReportsApi.items(filters.value.companies, refresh, { thirdParty, byProduct }),
  ])

  sectorOptions.value = sectorsRes.status === 'fulfilled'
    ? sectorsRes.value.data.map((s) => ({ label: s, value: s }))
    : []
  salespersonOptions.value = salespersonsRes.status === 'fulfilled' ? salespersonsRes.value.data : []
  routeOptions.value = routesRes.status === 'fulfilled' ? routesRes.value.data : []
  customerOptions.value = customersRes.status === 'fulfilled' ? customersRes.value.data : []
  itemOptions.value = itemsRes.status === 'fulfilled' ? itemsRes.value.data : []

  const validSectors = new Set(sectorOptions.value.map((option) => option.value))
  const validSalespersons = new Set(salespersonOptions.value.map((option) => option.value))
  const validRoutes = new Set(routeOptions.value.map((option) => option.value))
  const validCustomers = new Set(customerOptions.value.map((option) => option.value))
  const validItems = new Set(itemOptions.value.map((option) => option.value))
  filters.value.sectorCodes = filters.value.sectorCodes.filter((value) => validSectors.has(value))
  filters.value.salespersonCodes = filters.value.salespersonCodes.filter((value) => validSalespersons.has(value))
  filters.value.routeCodes = filters.value.routeCodes.filter((value) => validRoutes.has(value))
  filters.value.customerNos = filters.value.customerNos.filter((value) => validCustomers.has(value))
  filters.value.itemNos = filters.value.itemNos.filter((value) => validItems.has(value))
}

function normalizeRouteRow(row) {
  return {
    ...normalizeRow(row),
    CountryRegionKey: row.CountryRegionKey || '(Blank)',
    RouteKey: row.RouteKey || '(Blank)',
    SectorKey: row.SectorKey || '(Blank)',
  }
}

function normalizeCustomerRow(row) {
  const customerNo = row.CustomerNo || '(Blank)'
  const customerName = row.CustomerName || '(Blank)'
  const shipToCode = row.ShipToCode || '(Blank)'
  const shipToName = row.ShipToName || '(Blank)'
  return {
    ...normalizeRow(row),
    SectorKey: row.SectorKey || '(Blank)',
    CustomerNo: customerNo,
    CustomerName: customerName,
    CustomerKey: `${customerNo} - ${customerName}`,
    ShipToCode: shipToCode,
    ShipToName: shipToName,
    ShipToKey: `${shipToCode} - ${shipToName}`,
  }
}

async function runReport(refresh = false) {
  const role = auth.user?.role
  if (!canAccessReports(role)) { noAccess.value = true; return }
  if (isDownloads.value) return
  noAccess.value = false
  error.value = null
  loading.value = true
  rawRows.value = []
  rawDetailRows.value = []
  rawExportRows.value = []
  reportMeta.value = {}
  try {
    const thirdParty = filters.value.productType === 'own' ? 0 : filters.value.productType === 'third' ? 1 : null
    const byProduct = filters.value.byProductMode === 'only' ? 1 : filters.value.byProductMode === 'exclude' ? 0 : null
    const commonParams = {
      dimension: filters.value.weekDimension,
      dateFrom: toDateStr(filters.value.dateFrom),
      dateTo: toDateStr(filters.value.dateTo),
      compareFrom: toDateStr(filters.value.compareFrom),
      compareTo: toDateStr(filters.value.compareTo),
      withFrom: toDateStr(filters.value.withFrom),
      withTo: toDateStr(filters.value.withTo),
      companies: filters.value.companies,
      docTypes: filters.value.docTypes,
      thirdParty,
      byProduct,
      genBusMode: filters.value.genBusMode,
      sectorCodes: filters.value.sectorCodes,
      salespersonCodes: filters.value.salespersonCodes,
      routeCodes: filters.value.routeCodes,
      customerNos: filters.value.customerNos,
      itemNos: filters.value.itemNos,
      refresh,
    }
    const { data } = await bcReportsApi.run(reportType.value, commonParams)
    let rows = Array.isArray(data) ? data : (data.rows || [])
    const detailRows = Array.isArray(data) ? [] : (data.detailRows || [])
    const exportRows = Array.isArray(data) ? [] : (data.exportRows || [])
    const meta = Array.isArray(data) ? {} : (data.meta || {})

    // Add PDA for the upper date only when "Include Current PDA" is ticked and this is not a comparison or PDA report
    if (filters.value.includePda && !isComparisonReport.value && !isPdaVsShop.value) {
      const pdaDate = toDateStr(filters.value.dateTo)
      try {
        const { data: pdaData } = await bcReportsApi.run(reportType.value, {
          ...commonParams,
          docTypes: ['pda'],
          dateFrom: pdaDate,
          dateTo: pdaDate,
        })
        rows = [...rows, ...(Array.isArray(pdaData) ? pdaData : (pdaData.rows || []))]
      } catch (_) { /* ignore PDA fetch errors silently */ }
    }

    rawRows.value = rows
    rawDetailRows.value = detailRows
    rawExportRows.value = exportRows
    reportMeta.value = meta
  } catch (err) {
    if (err.response?.status === 403) noAccess.value = true
    else error.value = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}

function exportExcel() {
  const wb = XLSX.utils.book_new()
  if (isMatrixReport.value) {
    const headers = [dimLabel.value, ...activeCompanies.value.flatMap((co) => [`${co} Qty`, `${co} Amount`]), 'Total Qty', 'Total Amount']
    const rows = matrixRows.value.map((row) => [row.GroupKey, ...activeCompanies.value.flatMap((co) => [row[co]?.Qty ?? '', row[co]?.Amount ?? '']), row._totQty, row._totAmount])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), dimLabel.value)
  } else if (isRouteReport.value) {
    // Flat export: one row per (Route, Sector)
    const exportRows = routeRows.value.flatMap((r) =>
      routeSectors.value.map((sec) => ({
        CountryRegion: r.CountryRegionKey,
        Route: r.RouteKey,
        Description: r.RouteDescription,
        Sector: sec,
        Qty: r.sectors?.[sec]?.Qty ?? 0,
        Amount: r.sectors?.[sec]?.Amount ?? 0,
        TotalQty: r.CurrentQty,
        TotalAmount: r.CurrentAmount,
      }))
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'RouteBySector')
  } else if (isRouteWeekOnWeek.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(routeRows.value), 'RouteAnalysis')
  } else if (isCustomerReport.value) {
    const exportRows = customerRows.value.map((r) => ({
      Sector: r.SectorKey,
      Customer: r.CustomerKey,
      ShipTo: r.ShipToKey,
      Qty: r.CurrentQty,
      Amount: r.CurrentAmount,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'CustomerBySector')
  } else if (isCustomerWeekOnWeek.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerRows.value), 'CustomerAnalysis')
  } else if (isWeekOnWeek.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekRowsForExport.value), 'WeekOnWeek')
  } else if (isProductPerformance.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows.value), 'ProductPerformance')
  } else if (isCustomerItem.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerItemRows.value), 'CustomerItem')
  } else if (isShopPaymentSummary.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shopPaymentRows.value), 'ShopSummary')
    if (rawDetailRows.value.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDetailRows.value), 'PaymentTypes')
    if (rawExportRows.value.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawExportRows.value), 'PaymentLines')
  } else if (isPdaVsShop.value) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pdaVsShopRows.value), 'PdaVsShop')
  }
  XLSX.writeFile(wb, `bc-${reportType.value}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

async function forceRefresh() {
  await bcReportsApi.clearCache().catch(() => {})
  await loadMasterOptions(true)
  await runReport(true)
}

function exportProductDrawerExcel() {
  if (!selectedProductGroup.value) return
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectedProductRowsForExport.value), 'Details')
  XLSX.writeFile(wb, `bc-product-details-${selectedProductGroup.value.GroupKey}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

function exportCustomerDrawerExcel() {
  if (!selectedCustomer.value) return
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectedCustomerRowsForExport.value), 'Details')
  XLSX.writeFile(wb, `bc-customer-details-${selectedCustomer.value.CustomerNo || 'customer'}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

function exportCustomerItemDrawerExcel() {
  if (!selectedCustomerItemGroup.value) return
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectedCustomerItemRowsForExport.value), 'Details')
  XLSX.writeFile(wb, `bc-customer-item-${selectedCustomerItemGroup.value.CustomerNo || 'customer'}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

function exportShopPaymentDrawerExcel() {
  if (!selectedShop.value) return
  const wb = XLSX.utils.book_new()
  if (selectedShopPaymentDetailRows.value.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectedShopPaymentDetailRows.value), 'PaymentTypes')
  if (selectedShopPaymentExportRows.value.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectedShopPaymentExportRows.value), 'PaymentLines')
  XLSX.writeFile(wb, `bc-shop-payment-${selectedShop.value.CustomerNo || 'shop'}-${toDateStr(filters.value.dateFrom)}.xlsx`)
}

async function exportDownloadDataset(kind, label) {
  downloadLoading.value = true
  error.value = null
  try {
    const { data } = await bcReportsApi.downloadDataset(kind, filters.value.companies)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.isArray(data) ? data : []), 'Data')
    XLSX.writeFile(wb, `bc-${label}-${toDateStr(filters.value.dateFrom)}.xlsx`)
  } catch (err) {
    error.value = err.response?.data?.error || err.message
  } finally {
    downloadLoading.value = false
  }
}

onMounted(() => {
  if (canAccessReports(auth.user?.role)) {
    loadMasterOptions()
    runReport()
  }
  else noAccess.value = true
})

watch(() => filters.value.companies.join(','), () => {
  loadMasterOptions()
})

watch(() => `${filters.value.productType}|${filters.value.byProductMode}`, () => {
  loadMasterOptions()
})
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
.bc-reports-layout { display:flex; height:100%; overflow:hidden; background:#f3f6fb; font-size:13px; }

/* ── Filter slicer panel ─────────────────────────────────────── */
.slicer-panel {
  width:270px; min-width:270px;
  background:#fff; border-right:1px solid #dbe3ee;
  padding:12px; overflow-y:auto; overflow-x:hidden;
  transition: width 0.25s ease, min-width 0.25s ease, padding 0.25s ease;
  flex-shrink:0;
}
.slicer-panel.filters-closed {
  width:0; min-width:0; padding:0;
}
.slicer-header { display:flex; align-items:center; gap:8px; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#000; margin-bottom:10px; }
.filter-box { border:1px solid #dbe3ee; border-radius:10px; background:#fbfdff; margin-bottom:10px; overflow:hidden; }
.filter-box summary { list-style:none; cursor:pointer; padding:10px 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#000; }
.filter-box summary::-webkit-details-marker { display:none; }
.filter-body { padding:10px 12px; }
.slicer-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#000; margin:0 0 6px; white-space:nowrap; }
.slicer-check { display:flex; align-items:center; gap:7px; padding:3px 0; }
.slicer-check label { color:#000; font-weight:600; white-space:nowrap; }
.filter-input, .filter-multi { width:100%; margin-bottom:10px; }
.run-btn { width:100%; margin-top:8px; }

/* ── Report main ─────────────────────────────────────────────── */
.report-main { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }

/* ── Tab bar ─────────────────────────────────────────────────── */
.tab-bar {
  display:flex; gap:4px; padding:8px 10px 0;
  background:#fff; border-bottom:1px solid #dbe3ee;
  overflow-x:auto; flex-shrink:0;
  scrollbar-width:none;
}
.tab-bar::-webkit-scrollbar { display:none; }
.tab-btn {
  display:flex; align-items:center; gap:6px;
  padding:7px 12px; border:none; border-radius:8px 8px 0 0;
  background:transparent; cursor:pointer; font-size:12px;
  color:#687487; font-weight:600; white-space:nowrap; flex-shrink:0;
}
.tab-btn.active { background:#1d4ed8; color:#fff; }
.filter-toggle-btn {
  display:flex; align-items:center; gap:6px;
  padding:7px 12px; border:none; border-radius:8px 8px 0 0;
  background:#f1f5f9; cursor:pointer; font-size:12px;
  color:#1d4ed8; font-weight:700; white-space:nowrap; flex-shrink:0;
  transition: background 0.15s;
}
.filter-toggle-btn:hover { background:#e2e8f0; }

/* ── Toolbar ─────────────────────────────────────────────────── */
.toolbar { display:flex; align-items:center; gap:10px; padding:8px 12px; background:#fff; border-bottom:1px solid #dbe3ee; flex-wrap:wrap; }
.toolbar-actions { margin-left:auto; display:flex; align-items:center; gap:4px; }
.view-toggle { display:flex; gap:2px; flex-shrink:0; }
.view-btn { padding:4px 10px; border:1px solid #d0d5dd; background:#fff; border-radius:4px; cursor:pointer; font-size:12px; color:#344054; }
.view-btn.active { background:#1d4ed8; color:#fff; border-color:#1d4ed8; }
.period-pill { padding:5px 10px; border-radius:999px; background:#eef4ff; color:#24407a; font-size:11px; flex-shrink:0; }

/* ── KPI strip ───────────────────────────────────────────────── */
.kpi-strip { display:flex; gap:8px; flex-wrap:nowrap; overflow-x:auto; flex:1; min-width:0; scrollbar-width:none; }
.kpi-strip::-webkit-scrollbar { display:none; }
.kpi-card, .highlight-card {
  display:flex; flex-direction:column; gap:4px; padding:10px 12px;
  border-radius:10px; background:linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border:1px solid #b8c7df; box-shadow:0 8px 18px rgba(15,23,42,.07);
  flex-shrink:0;
}
.kpi-label { font-size:10px; color:#000; text-transform:uppercase; letter-spacing:.06em; font-weight:800; }
.kpi-val { font-size:15px; font-weight:900; color:#000; font-variant-numeric:tabular-nums; line-height:1.1; }
.kpi-val.emphatic { font-size:20px; line-height:1.02; font-weight:950; color:#000; }
.positive { color:#0d5f2a; }
.negative { color:#9b1c1c; }
.neutral { color:#475467; }

/* ── Empty / skeleton ────────────────────────────────────────── */
.empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#98a2b3; gap:10px; }
.skeleton-wrap, .matrix-wrap, .product-wrap { padding:10px 12px; }
.matrix-wrap { flex:1; overflow:hidden; display:flex; flex-direction:column; }
.product-wrap { flex:1; min-height:0; overflow:auto; }

/* ── Product / highlight ─────────────────────────────────────── */
.highlight-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:10px; }
.product-drawer { display:flex; flex-direction:column; gap:10px; min-height:100%; }
.drawer-actions { display:flex; justify-content:flex-end; }
.drawer-kpis { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; margin-bottom:4px; }
.product-table-wrap { display:flex; flex-direction:column; min-height:0; overflow:auto; }

/* ── Sticky total rows ───────────────────────────────────────── */
.sticky-total-row {
  --sticky-total-bottom: clamp(48px, 15vh, 140px);
  --sticky-cell-padding-y: 6px;
  --sticky-cell-padding-x: 10px;
  display:grid;
  grid-template-columns: 190px 110px 110px 110px 120px 120px 120px 110px;
  gap:0;
  align-items:stretch;
  padding:0;
  border-top:2px solid #1d4ed8;
  background:#1d4ed8;
  color:#fff;
  font-weight:700;
  font-variant-numeric:tabular-nums;
  overflow-x:auto;
  position:sticky;
  bottom:var(--sticky-total-bottom);
  z-index:3;
  flex-shrink:0;
  min-height:36px;
  box-shadow:0 -4px 12px rgba(15, 23, 42, 0.18);
}
.sticky-total-row > span {
  box-sizing:border-box;
  min-width:0;
  padding:var(--sticky-cell-padding-y) var(--sticky-cell-padding-x);
  display:flex;
  align-items:center;
  justify-content:flex-end;
  min-height:36px;
  border-right:1px solid rgba(255,255,255,0.15);
  white-space:nowrap;
}
.sticky-total-row > span:first-child { justify-content:flex-start; }
.sticky-total-row > span:last-child { border-right:none; }
.week-total-row { grid-template-columns: 190px 110px 110px 110px 120px 120px 120px 110px; }
.drawer-total-row { grid-template-columns: 160px 200px 110px 120px 110px 110px 120px 120px 110px 60px; margin-top:auto; }
.route-total-row { grid-template-columns: 190px 90px 110px 120px 110px 110px 120px 120px 90px; }
.route-current-total-row { grid-template-columns: 190px 90px 110px 120px 90px; }
.customer-total-row { grid-template-columns: 220px 90px 110px 120px 110px 110px 120px 120px 90px; }
.customer-current-total-row { grid-template-columns: 220px 90px 110px 120px 90px; }
.route-drawer-total-row { grid-template-columns: 160px 240px 110px 110px 120px 120px 120px 110px; margin-top:auto; }
.route-current-drawer-total-row { grid-template-columns: 160px 200px 110px 120px 60px; margin-top:auto; }
.customer-drawer-total-row { grid-template-columns: 260px 110px 120px 110px 110px 120px 120px 110px; margin-top:auto; }
.customer-current-drawer-total-row { grid-template-columns: 260px 110px 120px; margin-top:auto; }
.customer-item-total-row { grid-template-columns: 260px 90px 110px 130px 130px 100px; }
.shop-payment-total-row { grid-template-columns: 260px 90px 110px 130px 110px 130px 100px; }
.customer-item-drawer-total-row { grid-template-columns: 160px 260px 110px 120px 120px; margin-top:auto; }
.shop-payment-drawer-total-row { grid-template-columns: 220px 110px 120px; margin-top:auto; }
.sticky-total-key { min-width:0; }

/* ── Misc ─────────────────────────────────────────────────────── */
.trend-pill { display:inline-flex; align-items:center; justify-content:center; min-width:72px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
.trend-pill.positive { background:#dcfce7; }
.trend-pill.negative { background:#fee4e2; }
.trend-pill.neutral { background:#eaecf0; }
.mx, .inline-message { margin:8px 12px; flex-shrink:0; }
.mb { margin-bottom:6px !important; }

/* ── Downloads grid ──────────────────────────────────────────── */
.download-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
.download-card { background:#fff; border:1px solid #dbe3ee; border-radius:14px; padding:16px; box-shadow:0 8px 16px rgba(15,23,42,.05); display:flex; flex-direction:column; gap:10px; }
.download-card h3 { margin:0; color:#000; font-size:15px; }
.download-card p { margin:0; color:#344054; line-height:1.5; }

/* ── Deep PrimeVue overrides ─────────────────────────────────── */
:deep(.p-datatable-tbody > tr > td) { color:#101828 !important; background:#fff !important; padding:6px 10px !important; border-color:#e4e7ec !important; }
:deep(.p-datatable-tbody > tr:nth-child(even) > td) { background:#f8fafc !important; }
:deep(.p-datatable-tbody > tr.total-row > td) { background:#1d4ed8 !important; color:#fff !important; font-weight:700 !important; }
:deep(.p-datatable-tbody > tr.total-row) { position:sticky; top:33px; z-index:2; }
:deep(.p-datatable-thead > tr > th) { background:#243247 !important; color:#f8fafc !important; font-size:11px !important; font-weight:700 !important; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px !important; border-color:#324256 !important; }
:deep(.num-col) { text-align:right !important; }
:deep(.filter-multi .p-multiselect) { width:100%; }
:deep(.filter-multi .p-multiselect-label),
:deep(.filter-multi .p-multiselect-label-empty),
:deep(.filter-multi .p-multiselect-item),
:deep(.filter-multi .p-placeholder) { color:#000 !important; }

/* ── Drawer full-width on mobile ─────────────────────────────── */
:deep(.p-drawer) { max-width: 100vw !important; }

/* ── Mobile (≤ 767px) ─────────────────────────────────────────── */
@media (max-width: 767px) {
  .sticky-total-row { --sticky-total-bottom: clamp(12px, 8vh, 48px); }
  .bc-reports-layout { flex-direction:column; height:auto; min-height:100%; overflow:visible; }
  .slicer-panel {
    width:100% !important; min-width:100% !important;
    border-right:none; border-bottom:1px solid #dbe3ee;
    max-height: 0; overflow:hidden; padding:0;
    transition: max-height 0.3s ease, padding 0.3s ease;
  }
  .slicer-panel:not(.filters-closed) {
    max-height: 80vh; padding:12px; overflow-y:auto;
  }
  .report-main { height:calc(100vh - 48px); flex:none; min-height:0; }
  .tab-bar { padding:6px 8px 0; }
  .tab-label { display:none; }
  .filter-toggle-label { display:none; }
  .kpi-val.emphatic { font-size:16px; }
  .view-toggle { display:none; }
  .toolbar { padding:6px 8px; gap:6px; }
  .toolbar-actions { margin-left:auto; }
  .drawer-kpis { grid-template-columns:1fr 1fr; }
  :deep(.p-drawer[style*="width:720px"]),
  :deep(.p-drawer[style*="width:760px"]),
  :deep(.p-drawer[style*="width:820px"]),
  :deep(.p-drawer[style*="width:780px"]) {
    width: 100vw !important;
  }
}

/* ── Tablet (768px – 1100px) ──────────────────────────────────── */
@media (min-width: 768px) and (max-width: 1100px) {
  .slicer-panel { width:220px; min-width:220px; }
  .tab-btn { padding:6px 10px; font-size:11.5px; }
  .kpi-val.emphatic { font-size:18px; }
}

</style>
