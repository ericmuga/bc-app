<template>
  <div class="yield-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">Yield &amp; Loss</h2>
        <p class="text-muted text-sm">Track transfers to third parties, the portions cut from them, sales of those portions, and write-offs — all rolled up in the yield report.</p>
      </div>
    </div>

    <Message v-if="error" severity="error" :closable="true" class="mb-3">{{ error }}</Message>

    <Tabs v-model:value="tab">
      <TabList>
        <Tab value="transfers">Transfers</Tab>
        <Tab value="portionings">Portioning</Tab>
        <Tab value="sales">Manual Sales</Tab>
        <Tab value="writeoffs">Write-offs</Tab>
        <Tab value="report">Yield Report</Tab>
      </TabList>

      <TabPanels>
        <!-- ── Transfers ────────────────────────────────────────────────── -->
        <TabPanel value="transfers">
          <div class="panel-actions">
            <Button v-if="canManage" label="New Transfer" icon="pi pi-plus" @click="newTransfer" />
            <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadTransfers" :loading="loading.transfers" />
            <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="openExport('transfers')" />
            <span v-if="!canManage" class="text-muted text-sm" style="margin-left:auto">Read-only — only Shop Admins can create / post transfers.</span>
          </div>
          <DataTable :value="transfers" dataKey="TransferId" size="small"
                     responsive-layout="scroll">
            <Column field="TransferNo"           header="No"            style="width:160px" />
            <Column field="TransferDate"         header="Date"          style="width:110px">
              <template #body="{ data }">{{ fmtDate(data.TransferDate) }}</template>
            </Column>
            <Column field="ThirdPartyName"       header="Third Party"   style="min-width:180px" />
            <Column field="DestinationShopCode"  header="Shop"          style="width:90px" />
            <Column field="LineCount"            header="Lines"         style="width:60px;text-align:right" />
            <Column field="TotalCost"            header="Total Cost"    style="width:120px;text-align:right">
              <template #body="{ data }">{{ n(data.TotalCost) }}</template>
            </Column>
            <Column field="Status" header="Status" style="width:100px">
              <template #body="{ data }"><Tag :value="data.Status" :severity="data.Status === 'posted' ? 'success' : 'info'" /></template>
            </Column>
            <Column header="" style="width:90px">
              <template #body="{ data }">
                <Button :icon="data.Status === 'posted' ? 'pi pi-eye' : 'pi pi-pencil'"
                        :label="data.Status === 'posted' ? 'View' : 'Edit'"
                        size="small" text @click="openTransfer({ data })" />
              </template>
            </Column>
          </DataTable>
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

        <!-- ── Manual Sales ─────────────────────────────────────────────── -->
        <TabPanel value="sales">
          <div class="panel-actions">
            <Button v-if="canManage" label="Record Sale" icon="pi pi-plus" severity="success" @click="newManualSale" />
            <Button v-if="canManage" label="Upload batch" icon="pi pi-upload" severity="info" @click="openSaleBatch" />
            <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadManualSales" :loading="loading.manualSales" />
            <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="openExport('manual-sales')" />
            <span class="text-muted text-sm" style="margin-left:auto">
              For sales of portioned items not captured via the POS terminal (e.g. a third party reporting back).
            </span>
          </div>
          <!-- Summary: one row per (date, shop) — lines hidden until you open the card -->
          <DataTable :value="manualSalesSummary" dataKey="key" size="small" responsive-layout="scroll">
            <Column field="saleDate" header="Date" style="width:120px">
              <template #body="{ data }">{{ fmtDate(data.saleDate) }}</template>
            </Column>
            <Column field="shopCode"  header="Shop"        style="width:100px" />
            <Column field="lineCount" header="Lines"       style="width:80px;text-align:right" />
            <Column field="totalQty"  header="Total Qty"   style="width:120px;text-align:right">
              <template #body="{ data }">{{ n(data.totalQty) }}</template>
            </Column>
            <Column header="Total Value" style="width:140px;text-align:right">
              <template #body="{ data }"><strong class="num pos">{{ n(data.totalValue) }}</strong></template>
            </Column>
            <Column header="" style="width:90px">
              <template #body="{ data }">
                <Button icon="pi pi-eye" label="View" size="small" text @click="openManualSaleCard(data)" />
              </template>
            </Column>
          </DataTable>
        </TabPanel>

        <!-- ── Write-offs ───────────────────────────────────────────────── -->
        <TabPanel value="writeoffs">
          <div class="panel-actions">
            <Button v-if="canManage" label="New Write-off" icon="pi pi-plus" severity="danger" @click="newWriteOff" />
            <Button label="Refresh" icon="pi pi-refresh" severity="secondary" @click="loadWriteOffs" :loading="loading.writeOffs" />
            <Button label="Export Excel" icon="pi pi-file-excel" severity="secondary" @click="openExport('write-offs')" />
          </div>
          <DataTable :value="writeOffs" dataKey="WriteOffId" size="small" responsive-layout="scroll">
            <Column field="WriteOffNo"     header="No"           style="width:160px" />
            <Column field="WriteOffDate"   header="Date"         style="width:110px">
              <template #body="{ data }">{{ fmtDate(data.WriteOffDate) }}</template>
            </Column>
            <Column field="ItemNo"         header="Item No"      style="width:100px" />
            <Column field="Description"    header="Description"  style="min-width:180px" />
            <Column header="Qty"           style="width:90px;text-align:right">
              <template #body="{ data }">{{ n(data.Quantity) }} {{ data.UnitOfMeasure }}</template>
            </Column>
            <Column header="Cost"          style="width:110px;text-align:right">
              <template #body="{ data }"><span class="num neg">{{ n(data.TotalCost) }}</span></template>
            </Column>
            <Column field="Reason"         header="Reason"       style="width:120px" />
            <Column field="ShopCode"       header="Shop"         style="width:90px" />
          </DataTable>
        </TabPanel>

        <!-- ── Yield Report ─────────────────────────────────────────────── -->
        <TabPanel value="report">
          <div class="filters">
            <div class="filter-field">
              <label>From</label>
              <DatePicker v-model="reportFrom" date-format="yy-mm-dd" />
            </div>
            <div class="filter-field">
              <label>To</label>
              <DatePicker v-model="reportTo" date-format="yy-mm-dd" />
            </div>
            <Button label="Run Report" icon="pi pi-play" @click="runReport" :loading="loading.report" />
          </div>

          <!-- Vector summary across all portionings in the period -->
          <div v-if="reportSummary.length" class="summary-block">
            <div class="summary-head">
              <strong>Yield summary</strong>
              <span class="text-muted text-sm">— vector summation across every portioning in the filtered period</span>
            </div>
            <DataTable :value="reportSummary" size="small" responsive-layout="scroll">
              <Column field="itemNo"      header="Item No"     style="width:120px" />
              <Column field="description" header="Output Item" style="min-width:200px" />
              <Column field="uom"         header="UoM"         style="width:60px" />
              <Column header="Produced Qty"  style="width:120px;text-align:right">
                <template #body="{ data }"><strong>{{ n(data.producedQty) }}</strong></template>
              </Column>
              <Column header="Produced Value" style="width:130px;text-align:right">
                <template #body="{ data }"><strong>{{ n(data.producedValue) }}</strong></template>
              </Column>
              <Column header="Sold Qty"   style="width:110px;text-align:right">
                <template #body="{ data }"><span class="num neg">{{ n(data.salesQty) }}</span></template>
              </Column>
              <Column header="Sold Value" style="width:120px;text-align:right">
                <template #body="{ data }"><span class="num neg">{{ n(data.salesValue) }}</span></template>
              </Column>
              <Column header="Written-off Qty"  style="width:120px;text-align:right">
                <template #body="{ data }">{{ n(data.writeOffQty) }}</template>
              </Column>
              <Column header="Stock Qty"  style="width:100px;text-align:right">
                <template #body="{ data }">{{ n(data.expectedStockQty) }}</template>
              </Column>
              <Column header="Stock Value" style="width:110px;text-align:right">
                <template #body="{ data }">{{ n(data.expectedStockValue) }}</template>
              </Column>
              <template #footer>
                <div class="summary-foot">
                  <span>Totals:</span>
                  <span>Produced <strong>{{ n(summaryTotals.producedQty) }}</strong> / <strong>{{ n(summaryTotals.producedValue) }}</strong></span>
                  <span>Sold <strong>{{ n(summaryTotals.salesQty) }}</strong> / <strong>{{ n(summaryTotals.salesValue) }}</strong></span>
                  <span>Stock <strong>{{ n(summaryTotals.stockQty) }}</strong> / <strong>{{ n(summaryTotals.stockValue) }}</strong></span>
                </div>
              </template>
            </DataTable>
          </div>

          <div v-if="!report.length && !reportSummary.length && reportRan" class="empty-report">
            No portionings or transfers in this period.
          </div>

          <div v-for="t in report" :key="t.transferId" class="transfer-block">
            <div class="tb-head">
              <strong>{{ t.transferNo }}</strong>
              <span>{{ fmtDate(t.transferDate) }}</span>
              <span>· {{ t.thirdPartyName || t.destinationShopCode || 'No third party' }}</span>
              <Tag :value="t.status" :severity="t.status === 'posted' ? 'success' : 'info'" />
              <span class="tb-total">Cost: <strong>{{ n(t.totalCost) }}</strong></span>
            </div>

            <!-- Transfers without lines still appear so the operator can see them in context -->
            <div v-if="!t.lines.length" class="empty-lines">
              No lines on this transfer yet. Open it from the Transfers tab to add lines.
            </div>

            <div v-for="ln in t.lines" :key="ln.lineId" class="src-block">
              <div class="src-head">
                <i class="pi pi-box" />
                <span class="src-desc">{{ ln.sourceDescription }}</span>
                <span class="src-meta">{{ n(ln.sourceQty) }} {{ ln.sourceUom }} @ {{ n(ln.sourceUnitCost) }} = <strong>{{ n(ln.sourceCost) }}</strong></span>
              </div>

              <!-- Stage 1: Yield variance — source MINUS portioned -->
              <div class="stage-card stage-yield">
                <div class="stage-title"><i class="pi pi-cog" /> Yield Variance (cutting / processing loss)</div>
                <div class="stage-grid">
                  <div><span class="stage-label">Source qty</span><strong>{{ n(ln.sourceQty) }} {{ ln.sourceUom }}</strong></div>
                  <div><span class="stage-label">Portioned qty</span><strong>{{ n(ln.totals.portionQty) }}</strong></div>
                  <div><span class="stage-label">Yield variance qty</span>
                    <strong :class="ln.totals.yieldVarianceQty > 0 ? 'num neg' : 'num pos'">
                      {{ n(ln.totals.yieldVarianceQty) }} {{ ln.sourceUom }}
                    </strong>
                  </div>
                  <div><span class="stage-label">Source cost</span><strong>{{ n(ln.sourceCost) }}</strong></div>
                  <div><span class="stage-label">Portioned cost</span><strong>{{ n(ln.totals.portionCost) }}</strong></div>
                  <div><span class="stage-label">Yield variance value</span>
                    <strong :class="ln.totals.yieldVarianceValue > 0 ? 'num neg' : 'num pos'">
                      {{ n(ln.totals.yieldVarianceValue) }}
                    </strong>
                  </div>
                </div>
              </div>

              <!-- Stage 2: Sales / Final variance per portion -->
              <DataTable :value="ln.portions" size="small" class="portion-table">
                <Column field="itemNo"       header="Portion"      style="width:110px" />
                <Column field="description"  header="Description"  style="min-width:160px" />
                <Column header="Produced" style="width:110px;text-align:right">
                  <template #body="{ data }">{{ n(data.producedQty) }} {{ data.uom }}</template>
                </Column>
                <Column header="Allocated Cost" style="width:120px;text-align:right">
                  <template #body="{ data }">{{ n(data.allocatedCost) }}</template>
                </Column>
                <Column header="Sold Qty" style="width:90px;text-align:right">
                  <template #body="{ data }"><span class="num pos">{{ n(data.salesQty) }}</span></template>
                </Column>
                <Column header="Sold Value" style="width:110px;text-align:right">
                  <template #body="{ data }"><span class="num pos">{{ n(data.salesValue) }}</span></template>
                </Column>
                <Column header="W-Off Qty" style="width:85px;text-align:right">
                  <template #body="{ data }"><span class="num neg">{{ n(data.writeOffQty) }}</span></template>
                </Column>
                <Column header="W-Off Cost" style="width:95px;text-align:right">
                  <template #body="{ data }"><span class="num neg">{{ n(data.writeOffValue) }}</span></template>
                </Column>
                <Column header="Final Var Qty" style="width:100px;text-align:right" v-tooltip.top="'Portioned − Sold − Written off'">
                  <template #body="{ data }">
                    <strong :class="data.finalVarianceQty > 0 ? 'num neg' : 'num pos'">{{ n(data.finalVarianceQty) }}</strong>
                  </template>
                </Column>
                <Column header="Final Var Value" style="width:110px;text-align:right">
                  <template #body="{ data }">
                    <strong :class="data.finalVarianceValue > 0 ? 'num neg' : 'num pos'">{{ n(data.finalVarianceValue) }}</strong>
                  </template>
                </Column>
              </DataTable>

              <!-- Stage 2 totals — final variance roll-up -->
              <div class="stage-card stage-final">
                <div class="stage-title"><i class="pi pi-shopping-cart" /> Final Variance (sales stage)</div>
                <div class="stage-grid">
                  <div><span class="stage-label">Sold qty</span><strong class="num pos">{{ n(ln.totals.salesQty) }}</strong></div>
                  <div><span class="stage-label">Sold value</span><strong class="num pos">{{ n(ln.totals.salesValue) }}</strong></div>
                  <div><span class="stage-label">Write-offs</span><strong class="num neg">{{ n(ln.totals.writeOffValue) }}</strong></div>
                  <div><span class="stage-label">Final variance qty</span>
                    <strong :class="ln.totals.finalVarianceQty > 0 ? 'num neg' : 'num pos'">
                      {{ n(ln.totals.finalVarianceQty) }}
                    </strong>
                  </div>
                  <div><span class="stage-label">Final variance value</span>
                    <strong :class="ln.totals.finalVarianceValue > 0 ? 'num neg' : 'num pos'">
                      {{ n(ln.totals.finalVarianceValue) }}
                    </strong>
                  </div>
                  <div><span class="stage-label">Expected stock value</span><strong>{{ n(ln.totals.stockValue) }}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Transfer editor -->
    <Dialog v-model:visible="transferEditor.visible" :header="transferEditor.title"
            :modal="true" :style="{ width: '900px' }">
      <div v-if="transferEditor.data" class="editor">
        <div class="editor-meta">
          <span><strong>{{ transferEditor.data.transferNo }}</strong> · {{ fmtDate(transferEditor.data.transferDate) }}</span>
          <span class="origin-pill"><i class="pi pi-arrow-right" />
            <strong>{{ transferEditor.data.originLabel || 'HQ dispatch' }}</strong>
            → {{ transferEditor.data.thirdPartyName || 'Third Party' }}
            <span v-if="transferEditor.data.destinationShopCode" class="dest-shop">({{ transferEditor.data.destinationShopCode }})</span>
          </span>
          <Tag :value="transferEditor.data.status" :severity="transferEditor.data.status === 'posted' ? 'success' : 'info'" />
        </div>

        <!-- Item picker (auto-fills from PosItem) + manual Add Line -->
        <div v-if="!isPostedXfer && canManage" class="line-add-row">
          <div class="line-add">
            <input v-model="xferItemQuery" type="text" class="line-add-input"
                   :placeholder="catalogueItems.length ? `Search item (${catalogueItems.length} in catalogue) — Enter to add` : 'Loading items…'"
                   @input="filterCatalogueXfer"
                   @focus="showXferDrop=true"
                   @blur="setTimeout(()=>showXferDrop=false,150)"
                   @keydown.enter.prevent="addFirstXferSuggestion" />
            <div v-if="showXferDrop && xferItemSuggestions.length" class="line-add-drop">
              <div v-for="it in xferItemSuggestions" :key="it.itemNo" class="line-add-opt"
                   @mousedown.prevent="addXferLineFromItem(it)">
                <span class="line-add-name">{{ it.description }}</span>
                <span class="line-add-no">{{ it.itemNo }} · {{ fmtPrice(it.unitPrice) }} · {{ it.unitOfMeasure || 'KG' }}</span>
              </div>
            </div>
            <div v-if="showXferDrop && xferItemQuery && !xferItemSuggestions.length" class="line-add-drop">
              <div class="co-empty">No matching item — use "Add blank line" to type one in.</div>
            </div>
          </div>
          <Button label="Add blank line" icon="pi pi-plus" size="small" @click="addBlankXferLine" />
        </div>

        <DataTable :value="transferEditor.data.lines" size="small" :pt="{ table: { class: 'editor-lines' } }">
          <Column header="Item No" style="width:120px">
            <template #body="{ data }">
              <InputText v-if="!isPostedXfer && canManage" v-model="data.itemNo" placeholder="Item No" fluid />
              <span v-else>{{ data.itemNo }}</span>
            </template>
          </Column>
          <Column header="Description" style="min-width:200px">
            <template #body="{ data }">
              <InputText v-if="!isPostedXfer && canManage" v-model="data.description" placeholder="Description" fluid />
              <span v-else>{{ data.description }}</span>
            </template>
          </Column>
          <Column header="Qty" style="width:110px">
            <template #body="{ data }">
              <InputNumber v-if="!isPostedXfer && canManage" v-model="data.quantity" :minFractionDigits="2" mode="decimal" fluid @blur="recalcXferTotals" />
              <span v-else>{{ n(data.quantity) }}</span>
            </template>
          </Column>
          <Column header="UoM" style="width:70px">
            <template #body="{ data }">
              <InputText v-if="!isPostedXfer && canManage" v-model="data.unitOfMeasure" fluid />
              <span v-else>{{ data.unitOfMeasure || 'KG' }}</span>
            </template>
          </Column>
          <Column header="Unit Cost" style="width:130px">
            <template #body="{ data }">
              <InputNumber v-if="!isPostedXfer && canManage" v-model="data.unitCost" :minFractionDigits="2" mode="decimal" fluid @blur="recalcXferTotals" />
              <span v-else>{{ n(data.unitCost) }}</span>
            </template>
          </Column>
          <Column header="Line Cost" style="width:120px;text-align:right">
            <template #body="{ data }"><strong>{{ n(data.quantity * data.unitCost) }}</strong></template>
          </Column>
          <Column header="" style="width:50px">
            <template #body="{ data, index }">
              <Button v-if="!isPostedXfer && canManage" icon="pi pi-times" text severity="danger" size="small" @click="transferEditor.data.lines.splice(index, 1)" />
            </template>
          </Column>
        </DataTable>
        <div class="editor-totals">
          <span>Total: <strong>{{ n(xferTotal) }}</strong></span>
        </div>
      </div>
      <template #footer>
        <Button label="Close" text @click="transferEditor.visible = false" />
        <Button v-if="!isPostedXfer && canManage" label="Save Draft" icon="pi pi-save" text :loading="saving" @click="saveXferLines" />
        <Button v-if="!isPostedXfer && canManage" label="Save & Post" icon="pi pi-send" severity="success"
                :disabled="!transferEditor.data?.lines.length" :loading="saving" @click="postXfer" />
      </template>
    </Dialog>

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

    <!-- New transfer dialog (HQ → Third Party) -->
    <Dialog v-model:visible="newXferDlg" header="New Transfer (HQ → Third Party)" :modal="true" :style="{ width: '460px' }">
      <div class="form-row">
        <label>Date</label>
        <DatePicker v-model="newXfer.transferDate" date-format="yy-mm-dd" fluid />
      </div>
      <div class="form-row">
        <label>Third Party <span style="color:#ef4444">*</span></label>
        <Select v-model="newXfer.thirdPartyId" :options="activeThirdParties" option-label="Name" option-value="ThirdPartyId"
          placeholder="Select recipient…" fluid />
        <div v-if="selectedTpShop" class="text-muted text-sm">
          Stock will be tracked at shop <strong>{{ selectedTpShop }}</strong>
        </div>
        <div v-else-if="newXfer.thirdPartyId" class="text-muted text-sm">
          No shop linked — transfer recorded for traceability only (no stock movement).
        </div>
      </div>
      <div class="form-row">
        <label>Notes</label>
        <InputText v-model="newXfer.notes" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="newXferDlg = false" />
        <Button label="Create" icon="pi pi-check" :loading="saving"
                :disabled="!newXfer.thirdPartyId" @click="createXfer" />
      </template>
    </Dialog>

    <!-- New portioning dialog -->
    <Dialog v-model:visible="newPortDlg" header="New Portioning" :modal="true" :style="{ width: '520px' }">
      <p class="text-muted text-sm" style="margin-top:0">Pick the source line that's being portioned. Source qty + cost are captured at creation.</p>
      <div class="form-row">
        <label>Date</label>
        <DatePicker v-model="newPort.portioningDate" date-format="yy-mm-dd" fluid />
      </div>
      <div class="form-row">
        <label>Source transfer line</label>
        <Select v-model="newPort.sourceTransferLineId" :options="sourceLineOpts" option-label="label" option-value="value" filter fluid />
      </div>
      <div class="form-row">
        <label>Notes</label>
        <InputText v-model="newPort.notes" fluid />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="newPortDlg = false" />
        <Button label="Create" icon="pi pi-check" :loading="saving" @click="createPort" />
      </template>
    </Dialog>

    <!-- New manual-sale dialog -->
    <Dialog v-model:visible="newSaleDlg" header="Record Manual Sale" :modal="true" :style="{ width: '520px' }">
      <p class="text-muted text-sm" style="margin-top:0">Use this when a portioned item is sold outside the POS terminal — the sale is added to the yield report alongside POS sales.</p>
      <div class="form-row"><label>Date</label><DatePicker v-model="newSale.saleDate" date-format="yy-mm-dd" fluid /></div>
      <!-- Item picker -->
      <div class="form-row" style="position:relative">
        <label>Item</label>
        <input v-model="saleItemQuery" type="text" class="line-add-input"
               placeholder="Search portion item…"
               @input="filterCatalogueSale"
               @focus="showSaleDrop=true"
               @blur="setTimeout(()=>showSaleDrop=false,150)" />
        <div v-if="showSaleDrop && saleItemSuggestions.length" class="line-add-drop">
          <div v-for="it in saleItemSuggestions" :key="it.itemNo" class="line-add-opt"
               @mousedown.prevent="pickSaleItem(it)">
            <span class="line-add-name">{{ it.description }}</span>
            <span class="line-add-no">{{ it.itemNo }} · {{ fmtPrice(it.unitPrice) }}</span>
          </div>
        </div>
        <div v-if="newSale.itemNo" class="text-muted text-sm">
          {{ newSale.itemNo }} — {{ newSale.description }}
        </div>
      </div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><label>Qty</label><InputNumber v-model="newSale.quantity" :minFractionDigits="2" mode="decimal" fluid /></div>
        <div><label>UoM</label><InputText v-model="newSale.unitOfMeasure" fluid /></div>
        <div><label>Unit Price</label><InputNumber v-model="newSale.unitPrice" :minFractionDigits="2" mode="decimal" fluid /></div>
      </div>
      <div class="form-row" style="background:#eff6ff;padding:8px 12px;border-radius:6px">
        <strong>Total: {{ n((newSale.quantity || 0) * (newSale.unitPrice || 0)) }}</strong>
      </div>
      <div class="form-row"><label>Notes</label><InputText v-model="newSale.notes" fluid /></div>
      <template #footer>
        <Button label="Cancel" text @click="newSaleDlg = false" />
        <Button label="Record Sale" icon="pi pi-check" severity="success"
                :disabled="!newSale.itemNo || !newSale.quantity || !newSale.unitPrice"
                :loading="saving" @click="recordSale" />
      </template>
    </Dialog>

    <!-- New write-off dialog -->
    <Dialog v-model:visible="newWoDlg" header="New Write-off" :modal="true" :style="{ width: '520px' }">
      <div class="form-row"><label>Date</label><DatePicker v-model="newWo.writeOffDate" date-format="yy-mm-dd" fluid /></div>
      <div class="form-row"><label>Item No</label><InputText v-model="newWo.itemNo" fluid /></div>
      <div class="form-row"><label>Description</label><InputText v-model="newWo.description" fluid /></div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><label>Qty</label><InputNumber v-model="newWo.quantity" :minFractionDigits="2" mode="decimal" fluid /></div>
        <div><label>UoM</label><InputText v-model="newWo.unitOfMeasure" fluid /></div>
        <div><label>Unit Cost</label><InputNumber v-model="newWo.unitCost" :minFractionDigits="2" mode="decimal" fluid /></div>
      </div>
      <div class="form-row"><label>Reason</label>
        <Select v-model="newWo.reason" :options="['spoilage','damage','theft','expired','other']" fluid />
      </div>
      <div class="form-row"><label>Notes</label><InputText v-model="newWo.notes" fluid /></div>
      <template #footer>
        <Button label="Cancel" text @click="newWoDlg = false" />
        <Button label="Post Write-off" icon="pi pi-check" severity="danger" :loading="saving" @click="createWo" />
      </template>
    </Dialog>

    <!-- Manual sale detail card (lines for one day at one shop) -->
    <Dialog v-model:visible="saleCard.visible" header="Manual Sales — daily detail"
            :modal="true" :style="{ width: '780px' }">
      <div v-if="saleCard.group" class="editor">
        <div class="editor-meta">
          <span><strong>{{ fmtDate(saleCard.group.saleDate) }}</strong> · Shop {{ saleCard.group.shopCode || '—' }}</span>
          <span class="tb-total">Total: <strong class="num pos">{{ n(saleCard.group.totalValue) }}</strong></span>
        </div>
        <DataTable :value="saleCard.group.lines" size="small" responsive-layout="scroll">
          <Column field="ManualSaleNo" header="No"          style="width:140px" />
          <Column field="ItemNo"       header="Item No"     style="width:100px" />
          <Column field="Description"  header="Description" style="min-width:180px" />
          <Column header="Qty" style="width:90px;text-align:right">
            <template #body="{ data }">{{ n(data.Quantity) }} {{ data.UnitOfMeasure }}</template>
          </Column>
          <Column header="Unit Price" style="width:110px;text-align:right">
            <template #body="{ data }">{{ n(data.UnitPrice) }}</template>
          </Column>
          <Column header="Total" style="width:120px;text-align:right">
            <template #body="{ data }"><strong class="num pos">{{ n(data.TotalAmount) }}</strong></template>
          </Column>
          <Column field="Notes" header="Notes" style="min-width:140px" />
        </DataTable>
      </div>
      <template #footer>
        <Button label="Close" text @click="saleCard.visible = false" />
      </template>
    </Dialog>

    <!-- Manual Sales — bulk upload (CSV) -->
    <Dialog v-model:visible="saleBatch.visible" header="Upload manual sales batch (CSV)"
            :modal="true" :style="{ width: '820px' }">
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label>Sale Date</label><DatePicker v-model="saleBatch.saleDate" date-format="yy-mm-dd" fluid /></div>
        <div><label>Notes</label><InputText v-model="saleBatch.notes" placeholder="Optional batch notes" fluid /></div>
      </div>

      <div class="form-row" style="margin-top:8px">
        <p class="text-muted text-sm" style="margin-bottom:6px">
          Upload a CSV with these columns (header row required, in any order):
          <strong>itemNo, description, quantity, unitOfMeasure, unitPrice</strong>.
          Lines that fail validation are skipped — successful rows still post.
        </p>
        <div style="display:flex;gap:8px;align-items:center">
          <input ref="saleFileRef" type="file" accept=".csv,text/csv"
                 @change="onSaleBatchFile" style="flex:1" />
          <Button label="Download template" icon="pi pi-download" text size="small" @click="downloadSaleTemplate" />
        </div>
        <p v-if="saleBatch.parseError" class="text-sm" style="color:#b91c1c;margin-top:4px">{{ saleBatch.parseError }}</p>
      </div>

      <DataTable v-if="saleBatch.lines.length"
                 :value="saleBatch.lines" size="small" style="margin-top:10px"
                 responsive-layout="scroll" :scrollable="true" scrollHeight="280px">
        <Column header="#" style="width:50px"><template #body="{ index }">{{ index + 1 }}</template></Column>
        <Column field="itemNo"        header="Item No"     style="width:120px" />
        <Column field="description"   header="Description" style="min-width:200px" />
        <Column field="quantity"      header="Qty"         style="width:90px;text-align:right" />
        <Column field="unitOfMeasure" header="UoM"         style="width:80px" />
        <Column field="unitPrice"     header="Unit Price"  style="width:100px;text-align:right">
          <template #body="{ data }">{{ n(data.unitPrice) }}</template>
        </Column>
        <Column header="Total" style="width:120px;text-align:right">
          <template #body="{ data }"><strong>{{ n(Number(data.quantity||0) * Number(data.unitPrice||0)) }}</strong></template>
        </Column>
      </DataTable>
      <div v-if="saleBatch.lines.length" class="editor-meta" style="margin-top:6px">
        <span class="text-muted text-sm">{{ saleBatch.lines.length }} line(s) ready</span>
        <span class="tb-total">Batch total: <strong class="num pos">{{ n(saleBatchTotal) }}</strong></span>
      </div>

      <div v-if="saleBatch.result" class="form-row" style="margin-top:10px">
        <Message :severity="saleBatch.result.failed ? 'warn' : 'success'" :closable="false">
          Posted {{ saleBatch.result.posted }} · Failed {{ saleBatch.result.failed }}
          <ul v-if="saleBatch.result.errors?.length" style="margin:4px 0 0 18px">
            <li v-for="(e, i) in saleBatch.result.errors" :key="i">Row {{ e.row }} ({{ e.itemNo }}): {{ e.error }}</li>
          </ul>
        </Message>
      </div>

      <template #footer>
        <Button label="Close" text @click="saleBatch.visible = false" />
        <Button label="Post batch" icon="pi pi-send" severity="success"
                :disabled="!saleBatch.lines.length" :loading="saleBatch.posting"
                @click="postSaleBatch" />
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
import { yieldApi, posApi } from '@/services/pos.js'
import { useAuthStore } from '@/stores/auth.js'
import { canManagePos } from '@/lib/posAccess.js'

const auth = useAuthStore()
const canManage = computed(() => canManagePos(auth.user?.role))

const tab = ref('transfers')
const error  = ref('')
const saving = ref(false)
const loading = reactive({ transfers: false, portionings: false, writeOffs: false, manualSales: false, report: false })

const transfers     = ref([])
const portionings   = ref([])
const writeOffs     = ref([])
const manualSales   = ref([])
const thirdParties  = ref([])
const shops         = ref([])

const today = new Date()
// Default report window: start of the year → today (so existing transfers always appear)
const yearStart = new Date(today.getFullYear(), 0, 1)
const reportFrom    = ref(yearStart)
const reportTo      = ref(today)
const report        = ref([])
const reportSummary = ref([])
const reportRan     = ref(false)
const summaryTotals = computed(() => {
  const t = { producedQty: 0, producedValue: 0, salesQty: 0, salesValue: 0,
              writeOffQty: 0, writeOffValue: 0, stockQty: 0, stockValue: 0,
              lossQty: 0, lossValue: 0 }
  for (const r of reportSummary.value) {
    t.producedQty   += Number(r.producedQty || 0)
    t.producedValue += Number(r.producedValue || 0)
    t.salesQty      += Number(r.salesQty || 0)
    t.salesValue    += Number(r.salesValue || 0)
    t.writeOffQty   += Number(r.writeOffQty || 0)
    t.writeOffValue += Number(r.writeOffValue || 0)
    t.stockQty      += Number(r.expectedStockQty || 0)
    t.stockValue    += Number(r.expectedStockValue || 0)
    t.lossQty       += Number(r.lossQty || 0)
    t.lossValue     += Number(r.lossValue || 0)
  }
  return t
})

const newXferDlg = ref(false)
const newXfer    = reactive({ transferDate: today, thirdPartyId: null, notes: '' })

const activeThirdParties = computed(() => thirdParties.value.filter(t => t.IsActive))
const selectedTpShop     = computed(() => {
  const tp = thirdParties.value.find(t => t.ThirdPartyId === newXfer.thirdPartyId)
  return tp?.ShopCode || ''
})

const newPortDlg = ref(false)
const newPort    = reactive({ portioningDate: today, sourceTransferLineId: '', notes: '' })

const newWoDlg = ref(false)
const newWo    = reactive({ writeOffDate: today, itemNo: '', description: '', quantity: 0, unitOfMeasure: '', unitCost: 0, reason: 'spoilage', notes: '' })

const newSaleDlg          = ref(false)
const newSale             = reactive({ saleDate: today, itemNo: '', description: '', quantity: 0, unitOfMeasure: 'KG', unitPrice: 0, notes: '' })
const saleItemQuery       = ref('')
const saleItemSuggestions = ref([])
const showSaleDrop        = ref(false)

function filterCatalogueSale() {
  const q = saleItemQuery.value.trim().toLowerCase()
  if (!q) { saleItemSuggestions.value = []; return }
  saleItemSuggestions.value = catalogueItems.value
    .filter(i => i.description.toLowerCase().includes(q) || i.itemNo.toLowerCase().includes(q))
    .slice(0, 8)
}
function pickSaleItem(it) {
  newSale.itemNo        = it.itemNo
  newSale.description   = it.description
  newSale.unitOfMeasure = it.unitOfMeasure || 'KG'
  newSale.unitPrice     = Number(it.unitPrice || 0)
  saleItemQuery.value      = ''
  saleItemSuggestions.value = []
  showSaleDrop.value       = false
}
function newManualSale() {
  Object.assign(newSale, {
    saleDate: today, itemNo: '', description: '',
    quantity: 0, unitOfMeasure: 'KG', unitPrice: 0, notes: '',
  })
  saleItemQuery.value = ''
  newSaleDlg.value = true
}
async function recordSale() {
  saving.value = true; error.value = ''
  try {
    await yieldApi.recordManualSale({ ...newSale, saleDate: isoDate(newSale.saleDate) })
    newSaleDlg.value = false
    await loadManualSales()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}
async function loadManualSales() {
  loading.manualSales = true
  try { manualSales.value = (await yieldApi.listManualSales()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.manualSales = false }
}

// Group raw manual-sale rows into a daily summary per shop
const manualSalesSummary = computed(() => {
  const grouped = new Map()
  for (const r of manualSales.value || []) {
    const day = String(r.SaleDate || '').slice(0, 10)
    const key = `${day}__${r.ShopCode || ''}`
    let g = grouped.get(key)
    if (!g) { g = { key, saleDate: r.SaleDate, shopCode: r.ShopCode || '', lines: [], lineCount: 0, totalQty: 0, totalValue: 0 }; grouped.set(key, g) }
    g.lines.push(r)
    g.lineCount += 1
    g.totalQty   += Number(r.Quantity || 0)
    g.totalValue += Number(r.TotalAmount || 0)
  }
  return [...grouped.values()].sort((a, b) => (b.saleDate > a.saleDate ? 1 : -1))
})

// Manual sale detail card (read-only)
const saleCard = reactive({ visible: false, group: null })
function openManualSaleCard(group) {
  saleCard.group = group
  saleCard.visible = true
}

// ── Manual sales — bulk CSV upload ──────────────────────────────────────────
const saleFileRef = ref(null)
const saleBatch = reactive({
  visible: false, saleDate: today, notes: '',
  lines: [], parseError: '', posting: false, result: null,
})
const saleBatchTotal = computed(() =>
  (saleBatch.lines || []).reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0)
)
function openSaleBatch() {
  saleBatch.visible = true
  saleBatch.saleDate = today
  saleBatch.notes = ''
  saleBatch.lines = []
  saleBatch.parseError = ''
  saleBatch.result = null
  if (saleFileRef.value) saleFileRef.value.value = ''
}
function downloadSaleTemplate() {
  const csv = '﻿itemNo,description,quantity,unitOfMeasure,unitPrice\r\nKG-FIL-RIB,Pork ribs,2.5,KG,650\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'manual-sales-template.csv'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function parseCsv(text) {
  // Strip BOM, split rows respecting quoted fields with commas inside.
  text = String(text || '').replace(/^﻿/, '')
  const rows = []
  let cur = []
  let buf = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { buf += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { buf += ch }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { cur.push(buf); buf = '' }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { cur.push(buf); rows.push(cur); cur = []; buf = '' }
      else { buf += ch }
    }
  }
  if (buf.length || cur.length) { cur.push(buf); rows.push(cur) }
  return rows.filter(r => r.length && r.some(c => String(c).trim() !== ''))
}
function onSaleBatchFile(ev) {
  saleBatch.parseError = ''
  saleBatch.result = null
  saleBatch.lines = []
  const file = ev.target?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onerror = () => { saleBatch.parseError = 'Could not read file' }
  reader.onload = () => {
    const text = String(reader.result || '')
    const rows = parseCsv(text)
    if (rows.length < 2) { saleBatch.parseError = 'CSV must include a header row and at least one data row.'; return }
    const header = rows[0].map(h => String(h).trim().toLowerCase())
    const idx = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
    const cItem = idx('itemno', 'item no', 'item_no', 'sku')
    const cDesc = idx('description', 'desc', 'name')
    const cQty  = idx('quantity', 'qty')
    const cUom  = idx('unitofmeasure', 'unit_of_measure', 'uom')
    const cPrc  = idx('unitprice', 'unit_price', 'price')
    if (cItem < 0 || cQty < 0) {
      saleBatch.parseError = 'CSV must include at minimum: itemNo, quantity'
      return
    }
    const out = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const itemNo = String(row[cItem] || '').trim().toUpperCase()
      if (!itemNo) continue
      const cat = catalogueItems.value.find(c => c.itemNo === itemNo)
      out.push({
        itemNo,
        description:   String(row[cDesc] || cat?.description || itemNo).trim(),
        quantity:      Number(row[cQty] || 0),
        unitOfMeasure: String(row[cUom] || cat?.unitOfMeasure || 'KG').trim().toUpperCase(),
        unitPrice:     Number(row[cPrc] || cat?.unitPrice || 0),
      })
    }
    saleBatch.lines = out
    if (!out.length) saleBatch.parseError = 'No usable rows after parsing.'
  }
  reader.readAsText(file)
}
async function postSaleBatch() {
  saleBatch.posting = true
  saleBatch.result = null
  try {
    const { data } = await yieldApi.recordManualSaleBatch({
      saleDate: isoDate(saleBatch.saleDate),
      notes:    saleBatch.notes || null,
      lines:    saleBatch.lines,
    })
    saleBatch.result = data
    if (data?.posted) await loadManualSales()
  } catch (e) {
    saleBatch.parseError = e.response?.data?.error ?? e.message
  } finally {
    saleBatch.posting = false
  }
}

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

const transferEditor   = reactive({ visible: false, title: '', data: null })
const portioningEditor = reactive({ visible: false, title: '', data: null })

// Catalogue (flat list of PosItems) — used to auto-fill transfer/portion lines
const catalogueItems   = ref([])
const xferItemQuery    = ref('')
const xferItemSuggestions = ref([])
const showXferDrop     = ref(false)
const portItemQuery    = ref('')
const portItemSuggestions = ref([])
const showPortDrop     = ref(false)

async function loadCatalogue() {
  try {
    const { data } = await posApi.getItems()
    catalogueItems.value = data.flatMap(c => c.items)
  } catch {}
}
function filterCatalogueXfer() {
  const q = xferItemQuery.value.trim().toLowerCase()
  if (!q) { xferItemSuggestions.value = []; return }
  xferItemSuggestions.value = catalogueItems.value
    .filter(i => i.description.toLowerCase().includes(q) || i.itemNo.toLowerCase().includes(q))
    .slice(0, 8)
}
function addFirstXferSuggestion() {
  if (xferItemSuggestions.value.length) addXferLineFromItem(xferItemSuggestions.value[0])
}
function addXferLineFromItem(it) {
  // Auto-fill: itemNo, description, unitOfMeasure (default KG), unitCost (= item's UnitPrice)
  const existing = transferEditor.data.lines.find(l => l.itemNo === it.itemNo)
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + 1
  } else {
    transferEditor.data.lines.push({
      lineId: null,
      itemNo: it.itemNo,
      description: it.description,
      quantity: 1,
      unitOfMeasure: it.unitOfMeasure || 'KG',
      unitCost: Number(it.unitPrice || 0),
    })
  }
  xferItemQuery.value = ''
  xferItemSuggestions.value = []
  showXferDrop.value = false
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

function addBlankXferLine() {
  if (!transferEditor.data) return
  transferEditor.data.lines.push({
    lineId: null, itemNo: '', description: '', quantity: 1,
    unitOfMeasure: 'KG', unitCost: 0,
  })
}
function addBlankPortLine() {
  if (!portioningEditor.data) return
  portioningEditor.data.lines.push({
    lineId: null, itemNo: '', description: '', quantity: 1,
    unitOfMeasure: 'KG', unitPrice: 0, allocatedCost: 0,
  })
}

function fmtPrice(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }

const isPostedXfer = computed(() => transferEditor.data?.status === 'posted')
const isPostedPort = computed(() => portioningEditor.data?.status === 'posted')

const xferTotal     = computed(() => (transferEditor.data?.lines ?? []).reduce((s, l) => s + (Number(l.quantity || 0) * Number(l.unitCost || 0)), 0))
const portionQty    = computed(() => (portioningEditor.data?.lines ?? []).reduce((s, l) => s + Number(l.quantity || 0), 0))
const portionTotal  = computed(() => (portioningEditor.data?.lines ?? []).reduce((s, l) => s + Number(l.allocatedCost || 0), 0))
const portionVariance = computed(() => Number(portioningEditor.data?.sourceTotalCost || 0) - portionTotal.value)
// loss = source − output (positive = lost, negative = gained)
const lossQty       = computed(() => Number(portioningEditor.data?.sourceQuantity   || 0) - portionQty.value)
const lossValue     = computed(() => Number(portioningEditor.data?.sourceTotalCost || 0) - portionTotal.value)

const sourceLineOpts = computed(() => {
  // Pull all transfer lines from posted transfers, latest first
  const out = []
  for (const t of transfers.value) {
    if (t.Status !== 'posted') continue
    out.push({ label: `${t.TransferNo} (placeholder)`, value: t.TransferId, postedTransferId: t.TransferId })
  }
  return _flatLines.value
})
const _flatLines = ref([])  // populated when newPort dialog opens

async function loadAll() {
  await Promise.all([
    loadTransfers(), loadPortionings(), loadWriteOffs(), loadManualSales(),
    yieldApi.listThirdParties().then(r => thirdParties.value = r.data),
    posApi.listShops().then(r => shops.value = r.data).catch(() => {}),
    loadCatalogue(),
  ])
}
async function loadTransfers() {
  loading.transfers = true
  try { transfers.value = (await yieldApi.listTransfers()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.transfers = false }
}
async function loadPortionings() {
  loading.portionings = true
  try { portionings.value = (await yieldApi.listPortionings()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.portionings = false }
}
async function loadWriteOffs() {
  loading.writeOffs = true
  try { writeOffs.value = (await yieldApi.listWriteOffs()).data }
  catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.writeOffs = false }
}

function newTransfer() {
  newXfer.transferDate = today
  newXfer.thirdPartyId = null
  newXfer.notes = ''
  newXferDlg.value = true
}
async function createXfer() {
  if (!newXfer.thirdPartyId) { error.value = 'Pick a third party'; return }
  saving.value = true; error.value = ''
  try {
    const { data } = await yieldApi.createTransfer({
      transferDate: isoDate(newXfer.transferDate),
      thirdPartyId: newXfer.thirdPartyId,
      notes:        newXfer.notes,
    })
    newXferDlg.value = false
    await loadTransfers()
    await openTransfer({ data: { TransferId: data.TransferId || data.transferId } })
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

async function openTransfer(e) {
  const id = e.data.TransferId
  try {
    const { data } = await yieldApi.getTransfer(id)
    transferEditor.data    = data
    transferEditor.title   = `Transfer ${data.transferNo}`
    transferEditor.visible = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
}

function addXferLine() {
  transferEditor.data.lines.push({ itemNo: '', description: '', quantity: 0, unitOfMeasure: '', unitCost: 0 })
}
function recalcXferTotals() { /* re-evaluates via computed */ }
async function saveXferLines() {
  saving.value = true
  try {
    await yieldApi.setTransferLines(transferEditor.data.transferId, transferEditor.data.lines)
    transferEditor.data = (await yieldApi.getTransfer(transferEditor.data.transferId)).data
    await loadTransfers()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}
async function postXfer() {
  saving.value = true
  try {
    await yieldApi.setTransferLines(transferEditor.data.transferId, transferEditor.data.lines)
    await yieldApi.postTransfer(transferEditor.data.transferId)
    transferEditor.data = (await yieldApi.getTransfer(transferEditor.data.transferId)).data
    await loadTransfers()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

async function newPortioning() {
  newPort.portioningDate = today; newPort.sourceTransferLineId = ''; newPort.notes = ''
  // Load all lines from posted transfers
  _flatLines.value = []
  for (const t of transfers.value.filter(x => x.Status === 'posted')) {
    try {
      const { data } = await yieldApi.getTransfer(t.TransferId)
      for (const l of data.lines) {
        _flatLines.value.push({
          label: `${data.transferNo} · ${l.description} (${l.quantity} ${l.unitOfMeasure || ''})`,
          value: l.lineId,
        })
      }
    } catch {}
  }
  newPortDlg.value = true
}
async function createPort() {
  saving.value = true
  try {
    const { data } = await yieldApi.createPortioning({
      portioningDate:       isoDate(newPort.portioningDate),
      sourceTransferLineId: newPort.sourceTransferLineId,
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

function newWriteOff() {
  Object.assign(newWo, { writeOffDate: today, itemNo: '', description: '', quantity: 0, unitOfMeasure: '', unitCost: 0, reason: 'spoilage', notes: '' })
  newWoDlg.value = true
}
async function createWo() {
  saving.value = true
  try {
    await yieldApi.postWriteOff({ ...newWo, writeOffDate: isoDate(newWo.writeOffDate) })
    newWoDlg.value = false
    await loadWriteOffs()
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { saving.value = false }
}

async function runReport() {
  loading.report = true; reportRan.value = false; error.value = ''
  try {
    const { data } = await yieldApi.report({ dateFrom: isoDate(reportFrom.value), dateTo: isoDate(reportTo.value) })
    // Backwards compat: server now returns { transfers, summary }; older callers may still receive a bare array.
    if (Array.isArray(data)) {
      report.value = data
      reportSummary.value = []
    } else {
      report.value         = data?.transfers || []
      reportSummary.value  = data?.summary   || []
    }
    reportRan.value = true
  } catch (e) { error.value = e.response?.data?.error ?? e.message }
  finally { loading.report = false }
}

function isoDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('en-KE') : '' }
function n(v) { return Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Auto-run the yield report whenever the user opens the Report tab (and on first mount)
watch(tab, async (val) => {
  if (val === 'report' && !reportRan.value) await runReport()
})

onMounted(async () => {
  await loadAll()
  if (tab.value === 'report') await runReport()
})
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
