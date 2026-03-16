<template>
  <DataTable
    :value="lines"
    size="small"
    :showGridlines="false"
    class="lines-table"
  >
    <Column field="LineNo" header="Line" style="width: 60px" />
    <Column field="ItemNo" header="Item No" style="width: 120px">
      <template #body="{ data }">
        <span class="mono">{{ data.ItemNo }}</span>
      </template>
    </Column>
    <Column field="Description" header="Description" />
    <Column field="UnitOfMeasure" header="UOM" style="width: 70px" />
    <Column field="Quantity" header="Qty" style="width: 90px; text-align:right" header-style="text-align:right">
      <template #body="{ data }">
        <span class="mono">{{ fmt(data.Quantity) }}</span>
      </template>
    </Column>
    <Column field="QuantityBase" header="Qty Base" style="width: 100px; text-align:right" header-style="text-align:right">
      <template #body="{ data }">
        <span class="mono">{{ fmt(data.QuantityBase) }}</span>
      </template>
    </Column>
    <Column field="UnitPrice" header="Unit Price" style="width: 110px; text-align:right" header-style="text-align:right">
      <template #body="{ data }">
        <span class="mono">{{ fmtCurrency(data.UnitPrice) }}</span>
      </template>
    </Column>
    <Column field="LineAmount" header="Amount" style="width: 120px; text-align:right" header-style="text-align:right">
      <template #body="{ data }">
        <span class="mono" style="font-weight:600">{{ fmtCurrency(data.LineAmount) }}</span>
      </template>
    </Column>

    <ColumnGroup type="footer">
      <Row>
        <Column footer="Totals" :colspan="4" footerStyle="text-align:left;font-weight:700" />
        <Column :footer="fmt(totalQty)" footerStyle="text-align:right;font-family:var(--bc-mono)" />
        <Column :footer="fmt(totalQtyBase)" footerStyle="text-align:right;font-family:var(--bc-mono)" />
        <Column footer="" />
        <Column :footer="fmtCurrency(totalAmount)" footerStyle="text-align:right;font-family:var(--bc-mono);font-weight:700;color:var(--bc-primary-light)" />
      </Row>
    </ColumnGroup>
  </DataTable>
</template>

<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ColumnGroup from 'primevue/columngroup'
import Row from 'primevue/row'

const props = defineProps({ lines: { type: Array, default: () => [] } })

const totalQty     = computed(() => props.lines.reduce((s, l) => s + +l.Quantity, 0))
const totalQtyBase = computed(() => props.lines.reduce((s, l) => s + +l.QuantityBase, 0))
const totalAmount  = computed(() => props.lines.reduce((s, l) => s + +l.LineAmount, 0))

const fmt         = (v) => Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCurrency = (v) => `KES ${fmt(v)}`
</script>

<style scoped>
.lines-table { font-size: 13px; }
</style>
