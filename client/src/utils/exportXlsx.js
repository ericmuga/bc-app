/**
 * utils/exportXlsx.js
 * Generate multi-sheet .xlsx files using SheetJS (xlsx).
 *
 * Usage:
 *   exportXlsx('orders-2026-03-17.xlsx', [
 *     { name: 'Orders', rows: [...], columns: [{ key, label, fmt? }] },
 *     { name: 'Lines',  rows: [...], columns: [...] },
 *   ])
 */
import * as XLSX from 'xlsx'

/**
 * @param {string} filename
 * @param {{ name: string, rows: object[], columns: { key: string, label: string, fmt?: (v) => any }[] }[]} sheets
 */
export function exportXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const header = sheet.columns.map(c => c.label)
    const data   = sheet.rows.map(row =>
      sheet.columns.map(c => {
        const v = row[c.key]
        return c.fmt ? c.fmt(v, row) : (v ?? '')
      })
    )
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])

    // Auto column widths (max of header or first 200 rows)
    const colWidths = sheet.columns.map((c, ci) => {
      const max = Math.max(
        c.label.length,
        ...data.slice(0, 200).map(r => String(r[ci] ?? '').length)
      )
      return { wch: Math.min(max + 2, 50) }
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }

  XLSX.writeFile(wb, filename)
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const fmtDate     = (v) => v ? new Date(v).toLocaleDateString('en-KE')  : ''
const fmtDatetime = (v) => v ? new Date(v).toLocaleString('en-KE')      : ''
const fmtNum      = (v) => v != null ? Number(v) : ''

// ── Pre-built column sets ──────────────────────────────────────────────────────

export const ORDER_HEADER_COLS = [
  { key: 'OrderNo',          label: 'Order No' },
  { key: 'CustomerNo',       label: 'Customer No' },
  { key: 'CustomerName',     label: 'Customer Name' },
  { key: 'SalespersonCode',  label: 'Salesperson' },
  { key: 'RouteCode',        label: 'Route' },
  { key: 'SectorCode',       label: 'Sector' },
  { key: 'ShipToName',       label: 'Ship-to Name' },
  { key: 'PaymentTerms',     label: 'Payment Terms' },
  { key: 'ExternalDocNo',    label: 'External Doc No' },
  { key: 'QuoteNo',          label: 'Quote No' },
  { key: 'OrderDate',        label: 'Order Date',     fmt: fmtDate },
  { key: 'ShipmentDate',     label: 'Shipment Date',  fmt: fmtDate },
  { key: 'PostingDate',      label: 'Posting Date',   fmt: fmtDate },
  { key: 'BCUserId',         label: 'Printed By' },
  { key: 'PrintingDatetime', label: 'Printed At',     fmt: fmtDatetime },
  { key: 'Status',           label: 'Status' },
  { key: 'ConfirmedBy',      label: 'Confirmed By' },
  { key: 'ConfirmedAt',      label: 'Confirmed At',   fmt: fmtDatetime },
  { key: 'CreatedAt',        label: 'Created At',     fmt: fmtDatetime },
  { key: 'UpdatedAt',        label: 'Updated At',     fmt: fmtDatetime },
]

export const ORDER_LINE_COLS = [
  { key: 'OrderNo',         label: 'Order No' },
  { key: 'CustomerNo',      label: 'Customer No' },
  { key: 'CustomerName',    label: 'Customer Name' },
  { key: 'SalespersonCode', label: 'Salesperson' },
  { key: 'RouteCode',       label: 'Route' },
  { key: 'SectorCode',      label: 'Sector' },
  { key: 'OrderDate',       label: 'Order Date',     fmt: fmtDate },
  { key: 'Status',          label: 'Status' },
  { key: 'ConfirmedBy',     label: 'Confirmed By' },
  { key: 'ConfirmedAt',     label: 'Confirmed At',   fmt: fmtDatetime },
  { key: 'LineNo',          label: 'Line No',        fmt: fmtNum },
  { key: 'ItemNo',          label: 'Item No' },
  { key: 'Description',     label: 'Description' },
  { key: 'UnitOfMeasure',   label: 'UOM' },
  { key: 'Quantity',        label: 'Qty',            fmt: fmtNum },
  { key: 'QuantityBase',    label: 'Qty Base',       fmt: fmtNum },
  { key: 'QtyAssigned',     label: 'Qty Assigned',   fmt: fmtNum },
  { key: 'QtyExecuted',     label: 'Qty Executed',   fmt: fmtNum },
  { key: 'UnitPrice',       label: 'Unit Price',     fmt: fmtNum },
  { key: 'LineAmount',      label: 'Amount',         fmt: fmtNum },
  { key: 'AmountInclVat',   label: 'Amount Incl VAT',fmt: fmtNum },
  { key: 'VatPct',          label: 'VAT %',          fmt: fmtNum },
  { key: 'PostingGroup',    label: 'Posting Group' },
  { key: 'CustomerSpec',    label: 'Customer Spec' },
  { key: 'Barcode',         label: 'Barcode' },
]

export const INVOICE_HEADER_COLS = [
  { key: 'InvoiceNo',        label: 'Invoice No' },
  { key: 'OriginalOrderNo',  label: 'Original Order No' },
  { key: 'CustomerNo',       label: 'Customer No' },
  { key: 'CustomerName',     label: 'Customer Name' },
  { key: 'CustomerPin',      label: 'Customer KRA PIN' },
  { key: 'SalespersonCode',  label: 'Salesperson Code' },
  { key: 'SalespersonName',  label: 'Salesperson Name' },
  { key: 'RouteCode',        label: 'Route' },
  { key: 'SectorCode',       label: 'Sector' },
  { key: 'ShipToName',       label: 'Ship-to Name' },
  { key: 'ShipmentMethod',   label: 'Shipment Method' },
  { key: 'PaymentTerms',     label: 'Payment Terms' },
  { key: 'ExternalDocNo',    label: 'External Doc No' },
  { key: 'OrderDate',        label: 'Order Date',       fmt: fmtDate },
  { key: 'PostingDate',      label: 'Posting Date',     fmt: fmtDate },
  { key: 'InvoicedAt',       label: 'Invoiced At',      fmt: fmtDatetime },
  { key: 'BCUserId',         label: 'Printed By' },
  { key: 'PrintingDatetime', label: 'Printed At',       fmt: fmtDatetime },
  { key: 'NoPrinted',        label: 'No. Printed',      fmt: fmtNum },
  { key: 'ETIMSInvoiceNo',   label: 'E-TIMS Invoice No' },
  { key: 'QRCodeUrl',        label: 'QR Code URL' },
  { key: 'CompanyName',      label: 'Company Name' },
  { key: 'CompanyPin',       label: 'Company KRA PIN' },
  { key: 'CompanyEmail',     label: 'Company Email' },
  { key: 'CompanyVatReg',    label: 'Company VAT Reg' },
  { key: 'Status',           label: 'Status' },
  { key: 'ConfirmedBy',      label: 'Confirmed By' },
  { key: 'ConfirmedAt',      label: 'Confirmed At',     fmt: fmtDatetime },
  { key: 'CreatedAt',        label: 'Created At',       fmt: fmtDatetime },
  { key: 'UpdatedAt',        label: 'Updated At',       fmt: fmtDatetime },
]

export const INVOICE_LINE_COLS = [
  { key: 'InvoiceNo',          label: 'Invoice No' },
  { key: 'CustomerNo',         label: 'Customer No' },
  { key: 'CustomerName',       label: 'Customer Name' },
  { key: 'SalespersonCode',    label: 'Salesperson' },
  { key: 'RouteCode',          label: 'Route' },
  { key: 'SectorCode',         label: 'Sector' },
  { key: 'OrderDate',          label: 'Order Date',       fmt: fmtDate },
  { key: 'Status',             label: 'Status' },
  { key: 'ConfirmedBy',        label: 'Confirmed By' },
  { key: 'ConfirmedAt',        label: 'Confirmed At',     fmt: fmtDatetime },
  { key: 'LineNo',             label: 'Line No',          fmt: fmtNum },
  { key: 'ItemNo',             label: 'Item No' },
  { key: 'Description',        label: 'Description' },
  { key: 'UnitOfMeasure',      label: 'UOM' },
  { key: 'Quantity',           label: 'Qty',              fmt: fmtNum },
  { key: 'QuantityBase',       label: 'Qty Base',         fmt: fmtNum },
  { key: 'UnitsPerParcel',     label: 'Units/Parcel',     fmt: fmtNum },
  { key: 'UnitPrice',          label: 'Unit Price',       fmt: fmtNum },
  { key: 'LineAmount',         label: 'Amount (Ex VAT)',  fmt: fmtNum },
  { key: 'LineAmountInclVat',  label: 'Amount (Incl VAT)',fmt: fmtNum },
  { key: 'VatPct',             label: 'VAT %',            fmt: fmtNum },
  { key: 'VatIdentifier',      label: 'VAT Identifier' },
  { key: 'PostingGroup',       label: 'Posting Group' },
  { key: 'CustomerSpec',       label: 'Customer Spec' },
  { key: 'Barcode',            label: 'Barcode' },
]
