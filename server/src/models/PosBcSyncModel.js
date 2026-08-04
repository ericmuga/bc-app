/**
 * models/PosBcSyncModel.js
 * POS → Business Central sync (DB-to-DB). Maps paid POS orders to BC's
 * "Imported SalesAL" staging-table schema so they can be exported for review
 * and (later) inserted straight into
 *   [dbo].[{prefix}$Imported SalesAL$23dc970e-11e8-4d9b-8613-b7582aec86ba]
 * which BC's own AL then processes into sales documents.
 *
 * Phase 1 (this file): read-only mapping + export. The DB-to-DB writer will
 * reuse buildImportedSalesRows() once a writable BC connection is confirmed.
 */
import { db as appDb, sql } from '../db/pool.js';

const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));

// The exact BC staging columns (order matters for the export sheet). The
// system/$ columns are BC-generated and deliberately omitted.
export const IMPORTED_SALES_COLUMNS = [
  'ExtDocNo', 'LineNo', 'CustNO', 'Date', 'SPCode', 'ShiptoCOde', 'ItemNo', 'Qty',
  'Location', 'SUOM', 'UnitPrice', 'ShiptoName', 'TotalHeaderAmount', 'LineAmount',
  'TotalHeaderQty', 'Type', 'Executed', 'Posted', 'ItemBlockedStatus', 'RevertFlag',
  'CUInvoiceNo', 'CUNo', 'SigningTime', 'BillTo', 'Expected Line Count', 'Error', 'Error Message',
];

/**
 * Build Imported-SalesAL rows from paid POS orders.
 * @param {object} f { shopCode, dateFrom, dateTo, lineType }
 *   lineType → the BC [Type] value to stamp (default 0; item lines).
 * @returns {Array<object>} one object per order line, keyed by IMPORTED_SALES_COLUMNS.
 */
export async function buildImportedSalesRows({ shopCode = null, dateFrom, dateTo, lineType = 0 } = {}) {
  const pool = await appDb.getPool();
  const req = pool.request();
  req.input('from', sql.DateTime2, dateFrom ? new Date(dateFrom) : new Date('2000-01-01'));
  req.input('to',   sql.DateTime2, dateTo ? new Date(dateTo + 'T23:59:59') : new Date());
  let shopFilter = '';
  if (shopCode) { req.input('shop', sql.NVarChar(50), String(shopCode).toUpperCase()); shopFilter = 'AND o.[ShopCode] = @shop'; }

  const r = await req.query(`
    SELECT o.[OrderNo], o.[ContactNo], o.[ContactName], o.[TotalAmount], o.[CreatedAt],
           o.[EtimsInvoiceNo], o.[CuSerialNo], o.[SignedAt], o.[ShopCode],
           s.[SalespersonCode], s.[LocationCode],
           l.[ItemNo], l.[Quantity], l.[UnitPrice], l.[LineAmount], l.[SortOrder], l.[LineId],
           it.[UnitOfMeasure],
           hdr.TotalQty, hdr.LineCount
    FROM [dbo].[PosOrder] o
    JOIN [dbo].[PosOrderLine] l ON l.[OrderId] = o.[OrderId]
    LEFT JOIN [dbo].[PosShop] s ON s.[Code] = o.[ShopCode]
    LEFT JOIN [dbo].[PosItem] it ON it.[ItemNo] = l.[ItemNo]
    CROSS APPLY (
      SELECT SUM(l2.[Quantity]) AS TotalQty, COUNT(*) AS LineCount
      FROM [dbo].[PosOrderLine] l2 WHERE l2.[OrderId] = o.[OrderId]
    ) hdr
    WHERE o.[Status] NOT IN ('open', 'cancelled')
      AND o.[CreatedAt] BETWEEN @from AND @to
      ${shopFilter}
    ORDER BY o.[OrderNo], l.[SortOrder], l.[LineId]
  `);

  const rows = [];
  const lineNoByOrder = new Map();
  for (const x of r.recordset) {
    const seq = (lineNoByOrder.get(x.OrderNo) || 0) + 1;
    lineNoByOrder.set(x.OrderNo, seq);
    const cust = (x.ContactNo || '').slice(0, 10);
    rows.push({
      ExtDocNo:            (x.OrderNo || '').slice(0, 30),
      LineNo:              seq * 10000,
      CustNO:              cust,
      Date:                x.CreatedAt,
      SPCode:              (x.SalespersonCode || '').slice(0, 10),
      ShiptoCOde:          '',
      ItemNo:              (x.ItemNo || '').slice(0, 10),
      Qty:                 num(x.Quantity),
      Location:            (x.LocationCode || '').slice(0, 10),
      SUOM:                (x.UnitOfMeasure || '').slice(0, 10),
      UnitPrice:           num(x.UnitPrice),
      ShiptoName:          (x.ContactName || '').slice(0, 100),
      TotalHeaderAmount:   num(x.TotalAmount),
      LineAmount:          num(x.LineAmount),
      TotalHeaderQty:      num(x.TotalQty),
      Type:                Number(lineType) || 0,
      Executed:            0,
      Posted:              0,
      ItemBlockedStatus:   0,
      RevertFlag:          0,
      CUInvoiceNo:         (x.EtimsInvoiceNo || '').slice(0, 100),
      CUNo:                (x.CuSerialNo || '').slice(0, 100),
      SigningTime:         (x.SignedAt || '').slice(0, 100),
      BillTo:              cust,
      'Expected Line Count': Number(x.LineCount) || 0,
      Error:               0,
      'Error Message':     '',
    });
  }
  return rows;
}
