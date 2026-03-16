/**
 * models/Order.js
 * Extends BaseDocument for sales orders.
 * Uses mssql v10 Transaction API: new sql.Transaction(pool)
 */
import { BaseDocument } from './BaseDocument.js';
import { db, sql } from '../db/pool.js';

export class Order extends BaseDocument {
  constructor() {
    super('SalesHeader', 'SalesLine', 'OrderNo');
  }

  /** Upsert header + lines (called from BC webhook). Idempotent. */
  async upsert(companyId, header, lines) {
    return db.query(companyId, async (pool, schema) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // ── Header MERGE ──────────────────────────────────────────────────
        const hReq = new sql.Request(transaction);
        hReq.input('OrderNo',        sql.NVarChar(30),   header.orderNo);
        hReq.input('CustomerNo',     sql.NVarChar(30),   header.customerNo);
        hReq.input('CustomerName',   sql.NVarChar(200),  header.customerName);
        hReq.input('SalespersonCode',sql.NVarChar(20),   header.salespersonCode || null);
        hReq.input('RouteCode',      sql.NVarChar(20),   header.routeCode       || null);
        hReq.input('SectorCode',     sql.NVarChar(20),   header.sectorCode      || null);
        hReq.input('OrderDate',      sql.Date,           new Date(header.orderDate));
        hReq.input('PostingDate',    sql.Date,           header.postingDate ? new Date(header.postingDate) : null);

        await hReq.query(`
          MERGE ${schema}.[SalesHeader] AS target
          USING (SELECT @OrderNo AS OrderNo) AS src ON target.OrderNo = src.OrderNo
          WHEN MATCHED AND target.Status = 'Open' THEN
            UPDATE SET
              CustomerNo=@CustomerNo, CustomerName=@CustomerName,
              SalespersonCode=@SalespersonCode, RouteCode=@RouteCode, SectorCode=@SectorCode,
              OrderDate=@OrderDate, PostingDate=@PostingDate, UpdatedAt=GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT (OrderNo,CustomerNo,CustomerName,SalespersonCode,RouteCode,SectorCode,OrderDate,PostingDate)
            VALUES (@OrderNo,@CustomerNo,@CustomerName,@SalespersonCode,@RouteCode,@SectorCode,@OrderDate,@PostingDate);
        `);

        // ── Delete then re-insert lines ────────────────────────────────────
        const delReq = new sql.Request(transaction);
        delReq.input('OrderNo', sql.NVarChar(30), header.orderNo);
        await delReq.query(`DELETE FROM ${schema}.[SalesLine] WHERE OrderNo = @OrderNo`);

        for (const line of lines) {
          const lr = new sql.Request(transaction);
          lr.input('OrderNo',       sql.NVarChar(30),    header.orderNo);
          lr.input('LineNo',        sql.Int,              line.lineNo);
          lr.input('ItemNo',        sql.NVarChar(30),    line.itemNo);
          lr.input('Description',   sql.NVarChar(200),   line.description);
          lr.input('Quantity',      sql.Decimal(18, 4),  line.quantity);
          lr.input('QuantityBase',  sql.Decimal(18, 4),  line.quantityBase ?? line.quantity);
          lr.input('UnitPrice',     sql.Decimal(18, 4),  line.unitPrice);
          lr.input('LineAmount',    sql.Decimal(18, 4),  line.lineAmount);
          lr.input('UnitOfMeasure', sql.NVarChar(20),    line.unitOfMeasure || null);
          await lr.query(`
            INSERT INTO ${schema}.[SalesLine]
              (OrderNo,LineNo,ItemNo,Description,Quantity,QuantityBase,UnitPrice,LineAmount,UnitOfMeasure)
            VALUES
              (@OrderNo,@LineNo,@ItemNo,@Description,@Quantity,@QuantityBase,@UnitPrice,@LineAmount,@UnitOfMeasure)
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

  /**
   * Atomically move an order (header + lines) into InvoiceHeader/InvoiceLine
   * and delete from SalesHeader/SalesLine.
   */
  async moveToInvoice(companyId, orderNo, invoiceData) {
    return db.query(companyId, async (pool, schema) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // ── Fetch original order ──────────────────────────────────────────
        const oReq = new sql.Request(transaction);
        oReq.input('OrderNo', sql.NVarChar(30), orderNo);
        const orderRes = await oReq.query(
          `SELECT * FROM ${schema}.[SalesHeader] WHERE OrderNo = @OrderNo`
        );
        if (!orderRes.recordset.length) throw new Error(`Order ${orderNo} not found`);
        const order = orderRes.recordset[0];

        const lReq = new sql.Request(transaction);
        lReq.input('OrderNo', sql.NVarChar(30), orderNo);
        const linesRes = await lReq.query(
          `SELECT * FROM ${schema}.[SalesLine] WHERE OrderNo = @OrderNo`
        );

        // ── Insert InvoiceHeader ──────────────────────────────────────────
        const ih = new sql.Request(transaction);
        ih.input('InvoiceNo',       sql.NVarChar(30),   invoiceData.invoiceNo);
        ih.input('OriginalOrderNo', sql.NVarChar(30),   orderNo);
        ih.input('CustomerNo',      sql.NVarChar(30),   order.CustomerNo);
        ih.input('CustomerName',    sql.NVarChar(200),  order.CustomerName);
        ih.input('SalespersonCode', sql.NVarChar(20),   order.SalespersonCode);
        ih.input('RouteCode',       sql.NVarChar(20),   order.RouteCode);
        ih.input('SectorCode',      sql.NVarChar(20),   order.SectorCode);
        ih.input('OrderDate',       sql.Date,           order.OrderDate);
        ih.input('PostingDate',     sql.Date,           order.PostingDate);
        ih.input('InvoicedAt',      sql.DateTime2,      new Date(invoiceData.invoicedAt));
        ih.input('ETIMSInvoiceNo',  sql.NVarChar(60),   invoiceData.etimsInvoiceNo || null);
        ih.input('ETIMSData',       sql.NVarChar(sql.MAX), invoiceData.etimsData ? JSON.stringify(invoiceData.etimsData) : null);

        await ih.query(`
          INSERT INTO ${schema}.[InvoiceHeader]
            (InvoiceNo,OriginalOrderNo,CustomerNo,CustomerName,SalespersonCode,RouteCode,SectorCode,
             OrderDate,PostingDate,InvoicedAt,ETIMSInvoiceNo,ETIMSData)
          VALUES
            (@InvoiceNo,@OriginalOrderNo,@CustomerNo,@CustomerName,@SalespersonCode,@RouteCode,@SectorCode,
             @OrderDate,@PostingDate,@InvoicedAt,@ETIMSInvoiceNo,@ETIMSData)
        `);

        // ── Insert InvoiceLines ───────────────────────────────────────────
        for (const line of linesRes.recordset) {
          const il = new sql.Request(transaction);
          il.input('InvoiceNo',    sql.NVarChar(30),   invoiceData.invoiceNo);
          il.input('LineNo',       sql.Int,             line.LineNo);
          il.input('ItemNo',       sql.NVarChar(30),   line.ItemNo);
          il.input('Description',  sql.NVarChar(200),  line.Description);
          il.input('Quantity',     sql.Decimal(18, 4), line.Quantity);
          il.input('QuantityBase', sql.Decimal(18, 4), line.QuantityBase);
          il.input('UnitPrice',    sql.Decimal(18, 4), line.UnitPrice);
          il.input('LineAmount',   sql.Decimal(18, 4), line.LineAmount);
          il.input('UnitOfMeasure',sql.NVarChar(20),   line.UnitOfMeasure);
          await il.query(`
            INSERT INTO ${schema}.[InvoiceLine]
              (InvoiceNo,LineNo,ItemNo,Description,Quantity,QuantityBase,UnitPrice,LineAmount,UnitOfMeasure)
            VALUES
              (@InvoiceNo,@LineNo,@ItemNo,@Description,@Quantity,@QuantityBase,@UnitPrice,@LineAmount,@UnitOfMeasure)
          `);
        }

        // ── Delete from Sales tables ──────────────────────────────────────
        const dl = new sql.Request(transaction);
        dl.input('OrderNo', sql.NVarChar(30), orderNo);
        await dl.query(`DELETE FROM ${schema}.[SalesLine]   WHERE OrderNo = @OrderNo`);

        const dh = new sql.Request(transaction);
        dh.input('OrderNo', sql.NVarChar(30), orderNo);
        await dh.query(`DELETE FROM ${schema}.[SalesHeader] WHERE OrderNo = @OrderNo`);

        await transaction.commit();
        return true;
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    });
  }
}

export default new Order();
