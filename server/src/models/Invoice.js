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
  async search(companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector, postingGroup } = {}) {
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
      if (postingGroup) {
        req.input('PostingGroup', sql.NVarChar(50), postingGroup);
        conditions.push('l.[PostingGroup] = @PostingGroup');
      }

      const result = await req.query(`
        SELECT
          h.*,
          COALESCE(SUM(l.[Quantity]),          0) AS TotalQuantity,
          COALESCE(SUM(l.[QuantityBase]),      0) AS TotalQuantityBase,
          COALESCE(SUM(l.[LineAmount]),        0) AS TotalLineAmount,
          COALESCE(SUM(l.[LineAmountInclVat]), 0) AS TotalInclVat
        FROM ${schema}.[InvoiceHeader] h
        LEFT JOIN ${schema}.[InvoiceLine] l ON l.[InvoiceNo] = h.[InvoiceNo]
        WHERE ${conditions.join(' AND ')}
        GROUP BY
          h.[Id], h.[InvoiceNo], h.[OriginalOrderNo], h.[CustomerNo], h.[CustomerName],
          h.[CustomerPin], h.[SalespersonCode], h.[SalespersonName],
          h.[RouteCode], h.[SectorCode],
          h.[ShipToName], h.[ShipmentMethod], h.[PaymentTerms], h.[ExternalDocNo],
          h.[CompanyName], h.[CompanyPin], h.[CompanyEmail], h.[CompanyVatReg],
          h.[OrderDate], h.[PostingDate],
          h.[InvoicedAt], h.[PrintingDatetime], h.[BCUserId], h.[NoPrinted],
          h.[ETIMSInvoiceNo], h.[ETIMSData], h.[QRCodeUrl], h.[Status],
          h.[ConfirmedAt], h.[ConfirmedBy], h.[CreatedAt], h.[UpdatedAt]
        ORDER BY h.[CreatedAt] DESC
      `);
      return result.recordset;
    });
  }

  /**
   * Insert a standalone invoice that has no matching order.
   * Used when BC posts an invoice webhook without an orderNo.
   */
  async insertDirect(companyId, invoiceData, lines = []) {
    return db.query(companyId, async (pool, schema) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const ih = new sql.Request(transaction);
        ih.input('InvoiceNo',       sql.NVarChar(30),      invoiceData.invoiceNo);
        ih.input('CustomerNo',      sql.NVarChar(30),      invoiceData.customerNo      || '');
        ih.input('CustomerName',    sql.NVarChar(200),     invoiceData.customerName    || '');
        ih.input('CustomerPin',     sql.NVarChar(50),      invoiceData.customerPin     || null);
        ih.input('SalespersonCode', sql.NVarChar(20),      invoiceData.salespersonCode || null);
        ih.input('SalespersonName', sql.NVarChar(200),     invoiceData.salespersonName || null);
        ih.input('RouteCode',       sql.NVarChar(20),      invoiceData.routeCode       || null);
        ih.input('SectorCode',      sql.NVarChar(20),      invoiceData.sectorCode      || null);
        ih.input('ShipToName',      sql.NVarChar(200),     invoiceData.shipToName      || null);
        ih.input('ShipmentMethod',  sql.NVarChar(30),      invoiceData.shipmentMethod  || null);
        ih.input('PaymentTerms',    sql.NVarChar(30),      invoiceData.paymentTerms    || null);
        ih.input('ExternalDocNo',   sql.NVarChar(50),      invoiceData.externalDocNo   || null);
        ih.input('CompanyName',     sql.NVarChar(200),     invoiceData.companyName     || null);
        ih.input('CompanyPin',      sql.NVarChar(50),      invoiceData.companyPin      || null);
        ih.input('CompanyEmail',    sql.NVarChar(200),     invoiceData.companyEmail    || null);
        ih.input('CompanyVatReg',   sql.NVarChar(50),      invoiceData.companyVatReg   || null);
        ih.input('NoPrinted',       sql.Int,               invoiceData.noPrinted       ?? null);
        ih.input('OrderDate',       sql.Date,              invoiceData.orderDate ? new Date(invoiceData.orderDate) : new Date(invoiceData.invoicedAt));
        ih.input('PostingDate',     sql.Date,              invoiceData.postingDate      ? new Date(invoiceData.postingDate)      : null);
        ih.input('PrintingDatetime',sql.DateTime2,         invoiceData.printingDatetime ? new Date(invoiceData.printingDatetime) : null);
        ih.input('BCUserId',        sql.NVarChar(100),     invoiceData.bcUserId        || null);
        ih.input('InvoicedAt',      sql.DateTime2,         new Date(invoiceData.invoicedAt));
        ih.input('ETIMSInvoiceNo',  sql.NVarChar(60),      invoiceData.etimsInvoiceNo  || null);
        ih.input('ETIMSData',       sql.NVarChar(sql.MAX), invoiceData.etimsData ? JSON.stringify(invoiceData.etimsData) : null);
        ih.input('QRCodeUrl',       sql.NVarChar(500),     invoiceData.qrcodeUrl       || null);

        await ih.query(`
          IF NOT EXISTS (SELECT 1 FROM ${schema}.[InvoiceHeader] WHERE [InvoiceNo] = @InvoiceNo)
          INSERT INTO ${schema}.[InvoiceHeader]
            ([InvoiceNo],[OriginalOrderNo],[CustomerNo],[CustomerName],[CustomerPin],
             [SalespersonCode],[SalespersonName],[RouteCode],[SectorCode],
             [ShipToName],[ShipmentMethod],[PaymentTerms],[ExternalDocNo],
             [CompanyName],[CompanyPin],[CompanyEmail],[CompanyVatReg],[NoPrinted],
             [OrderDate],[PostingDate],[PrintingDatetime],[BCUserId],[InvoicedAt],
             [ETIMSInvoiceNo],[ETIMSData],[QRCodeUrl])
          VALUES
            (@InvoiceNo,'',@CustomerNo,@CustomerName,@CustomerPin,
             @SalespersonCode,@SalespersonName,@RouteCode,@SectorCode,
             @ShipToName,@ShipmentMethod,@PaymentTerms,@ExternalDocNo,
             @CompanyName,@CompanyPin,@CompanyEmail,@CompanyVatReg,@NoPrinted,
             @OrderDate,@PostingDate,@PrintingDatetime,@BCUserId,@InvoicedAt,
             @ETIMSInvoiceNo,@ETIMSData,@QRCodeUrl)
        `);

        for (const line of lines) {
          const il = new sql.Request(transaction);
          il.input('InvoiceNo',         sql.NVarChar(30),   invoiceData.invoiceNo);
          il.input('LineNo',            sql.Int,             line.lineNo);
          il.input('ItemNo',            sql.NVarChar(30),   line.itemNo);
          il.input('Description',       sql.NVarChar(200),  line.description         || '');
          il.input('Quantity',          sql.Decimal(18, 4), line.quantity            ?? 0);
          il.input('QuantityBase',      sql.Decimal(18, 4), line.quantityBase        ?? line.quantity ?? 0);
          il.input('UnitPrice',         sql.Decimal(18, 4), line.unitPrice           ?? 0);
          il.input('LineAmount',        sql.Decimal(18, 4), line.lineAmount          ?? 0);
          il.input('LineAmountInclVat', sql.Decimal(18, 4), line.lineAmountInclVat   ?? null);
          il.input('VatPct',            sql.Decimal(18, 4), line.vatPct              ?? null);
          il.input('VatIdentifier',     sql.NVarChar(50),   line.vatIdentifier       || null);
          il.input('UnitsPerParcel',    sql.Decimal(18, 4), line.unitsPerParcel      ?? null);
          il.input('UnitOfMeasure',     sql.NVarChar(20),   line.unitOfMeasure       || null);
          il.input('PostingGroup',      sql.NVarChar(50),   line.postingGroup        || null);
          await il.query(`
            INSERT INTO ${schema}.[InvoiceLine]
              ([InvoiceNo],[LineNo],[ItemNo],[Description],[Quantity],[QuantityBase],[UnitPrice],
               [LineAmount],[LineAmountInclVat],[VatPct],[VatIdentifier],[UnitsPerParcel],
               [UnitOfMeasure],[PostingGroup])
            VALUES
              (@InvoiceNo,@LineNo,@ItemNo,@Description,@Quantity,@QuantityBase,@UnitPrice,
               @LineAmount,@LineAmountInclVat,@VatPct,@VatIdentifier,@UnitsPerParcel,
               @UnitOfMeasure,@PostingGroup)
          `);
        }

        await transaction.commit();
        return true;
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
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
