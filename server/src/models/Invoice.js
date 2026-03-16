/**
 * models/Invoice.js
 * Extends BaseDocument for sales invoices.
 * Invoice records are moved here from Order by Order.moveToInvoice().
 */
import { BaseDocument } from './BaseDocument.js';
import { db, sql } from '../db/pool.js';

export class Invoice extends BaseDocument {
  constructor() {
    super('InvoiceHeader', 'InvoiceLine', 'InvoiceNo');
  }

  /**
   * Override search to include per-invoice line aggregates
   * (TotalQuantity, TotalQuantityBase, TotalLineAmount) so the
   * list page can display a live totals strip without extra requests.
   */
  async search(companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector } = {}) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      const conditions = ['1=1'];

      if (q) {
        req.input('Q', sql.NVarChar(200), `%${q}%`);
        conditions.push('(h.[InvoiceNo] LIKE @Q OR h.[CustomerName] LIKE @Q OR h.[CustomerNo] LIKE @Q)');
      }
      if (customerNo) {
        req.input('CustomerNo', sql.NVarChar(30), customerNo);
        conditions.push('h.[CustomerNo] = @CustomerNo');
      }
      if (salesperson) {
        req.input('Salesperson', sql.NVarChar(20), salesperson);
        conditions.push('h.[SalespersonCode] = @Salesperson');
      }
      if (route) {
        req.input('Route', sql.NVarChar(20), route);
        conditions.push('h.[RouteCode] = @Route');
      }
      if (sector) {
        req.input('Sector', sql.NVarChar(20), sector);
        conditions.push('h.[SectorCode] = @Sector');
      }
      if (dateFrom) {
        req.input('DateFrom', sql.Date, new Date(dateFrom));
        conditions.push('h.[OrderDate] >= @DateFrom');
      }
      if (dateTo) {
        req.input('DateTo', sql.Date, new Date(dateTo));
        conditions.push('h.[OrderDate] <= @DateTo');
      }
      if (status) {
        req.input('Status', sql.NVarChar(20), status);
        conditions.push('h.[Status] = @Status');
      }

      const result = await req.query(`
        SELECT
          h.*,
          COALESCE(SUM(l.[Quantity]),     0) AS TotalQuantity,
          COALESCE(SUM(l.[QuantityBase]), 0) AS TotalQuantityBase,
          COALESCE(SUM(l.[LineAmount]),   0) AS TotalLineAmount
        FROM ${schema}.[InvoiceHeader] h
        LEFT JOIN ${schema}.[InvoiceLine] l ON l.[InvoiceNo] = h.[InvoiceNo]
        WHERE ${conditions.join(' AND ')}
        GROUP BY
          h.[Id], h.[InvoiceNo], h.[OriginalOrderNo], h.[CustomerNo], h.[CustomerName],
          h.[SalespersonCode], h.[RouteCode], h.[SectorCode], h.[OrderDate], h.[PostingDate],
          h.[InvoicedAt], h.[ETIMSInvoiceNo], h.[ETIMSData], h.[QRCodeUrl], h.[Status],
          h.[ConfirmedAt], h.[ConfirmedBy], h.[CreatedAt], h.[UpdatedAt]
        ORDER BY h.[CreatedAt] DESC
      `);
      return result.recordset;
    });
  }

  /** Look up a single invoice by its QR code URL */
  async findByQRCode(companyId, qrcodeUrl) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      req.input('QRCodeUrl', sql.NVarChar(500), qrcodeUrl);
      const headerResult = await req.query(
        `SELECT * FROM ${schema}.[InvoiceHeader] WHERE [QRCodeUrl] = @QRCodeUrl`
      );
      if (!headerResult.recordset.length) return null;
      const invoiceNo = headerResult.recordset[0].InvoiceNo;
      const lReq = pool.request();
      lReq.input('DocNo', sql.NVarChar(30), invoiceNo);
      const linesResult = await lReq.query(
        `SELECT * FROM ${schema}.[InvoiceLine] WHERE [InvoiceNo] = @DocNo ORDER BY [LineNo]`
      );
      return { header: headerResult.recordset[0], lines: linesResult.recordset };
    });
  }

  async summary(companyId, { groupBy = 'CustomerNo', dateFrom, dateTo } = {}) {
    return super.summary(companyId, { groupBy, dateFrom, dateTo });
  }
}

export default new Invoice();
