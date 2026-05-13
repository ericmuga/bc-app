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
        hReq.input('OrderNo',           sql.NVarChar(30),   header.orderNo);
        hReq.input('CustomerNo',        sql.NVarChar(30),   header.customerNo);
        hReq.input('CustomerName',      sql.NVarChar(200),  header.customerName);
        hReq.input('SalespersonCode',   sql.NVarChar(20),   header.salespersonCode   || null);
        hReq.input('RouteCode',         sql.NVarChar(20),   header.routeCode         || null);
        hReq.input('SectorCode',        sql.NVarChar(20),   header.sectorCode        || null);
        hReq.input('ShipmentDate',      sql.Date,            header.shipmentDate      ? new Date(header.shipmentDate)      : null);
        hReq.input('ShipToCode',        sql.NVarChar(20),   header.shipToCode        || null);
        hReq.input('ShipToName',        sql.NVarChar(200),  header.shipToName        || null);
        hReq.input('PaymentTerms',      sql.NVarChar(30),   header.paymentTerms      || null);
        hReq.input('ExternalDocNo',     sql.NVarChar(50),   header.externalDocNo     || null);
        hReq.input('QuoteNo',           sql.NVarChar(30),   header.quoteNo           || null);
        hReq.input('OrderDate',         sql.Date,            new Date(header.orderDate));
        hReq.input('PostingDate',       sql.Date,            header.postingDate       ? new Date(header.postingDate)       : null);
        hReq.input('PrintingDatetime',  sql.DateTime2,       header.printingDatetime  ? new Date(header.printingDatetime)  : null);
        hReq.input('BCUserId',          sql.NVarChar(100),  header.bcUserId          || null);

        await hReq.query(`
          IF NOT EXISTS (SELECT 1 FROM ${schema}.[SalesHeader] WHERE [OrderNo] = @OrderNo)
            INSERT INTO ${schema}.[SalesHeader]
              ([OrderNo],[CustomerNo],[CustomerName],[SalespersonCode],[RouteCode],[SectorCode],
               [ShipmentDate],[ShipToCode],[ShipToName],[PaymentTerms],[ExternalDocNo],[QuoteNo],
               [OrderDate],[PostingDate],[PrintingDatetime],[BCUserId])
            VALUES
              (@OrderNo,@CustomerNo,@CustomerName,@SalespersonCode,@RouteCode,@SectorCode,
               @ShipmentDate,@ShipToCode,@ShipToName,@PaymentTerms,@ExternalDocNo,@QuoteNo,
               @OrderDate,@PostingDate,@PrintingDatetime,@BCUserId);
        `);

        // ── Insert lines only if the header was just inserted ─────────────
        const chkReq = new sql.Request(transaction);
        chkReq.input('OrderNo', sql.NVarChar(30), header.orderNo);
        const existsRes = await chkReq.query(
          `SELECT 1 FROM ${schema}.[SalesLine] WHERE [OrderNo] = @OrderNo`
        );
        if (existsRes.recordset.length > 0) {
          // Order already existed — skip lines too
          await transaction.commit();
          return false;
        }

        // Detect once whether the [Part] column is present on this company's SalesLine.
        // Older deployments that haven't picked up the additive column will still work.
        const colChk = new sql.Request(transaction);
        const hasPartCol = await colChk.query(
          `SELECT COL_LENGTH('[${schema.replace(/[\[\]]/g, '')}].[SalesLine]', 'Part') AS L`
        );
        const includePart = hasPartCol.recordset[0]?.L != null;

        for (const line of lines) {
          const lr = new sql.Request(transaction);
          lr.input('OrderNo',       sql.NVarChar(30),   header.orderNo);
          lr.input('LineNo',        sql.Int,             line.lineNo);
          lr.input('ItemNo',        sql.NVarChar(30),   line.itemNo);
          lr.input('Description',   sql.NVarChar(200),  line.description);
          lr.input('Quantity',      sql.Decimal(18, 4), line.quantity);
          lr.input('QuantityBase',  sql.Decimal(18, 4), line.quantityBase ?? line.quantity);
          lr.input('UnitPrice',     sql.Decimal(18, 4), line.unitPrice);
          lr.input('LineAmount',    sql.Decimal(18, 4), line.lineAmount);
          lr.input('AmountInclVat', sql.Decimal(18, 4), line.amountInclVat ?? line.lineAmount ?? 0);
          lr.input('VatPct',        sql.Decimal(18, 4), line.vatPct        ?? null);
          lr.input('QtyAssigned',   sql.Decimal(18, 4), line.qtyAssigned   ?? null);
          lr.input('QtyExecuted',   sql.Decimal(18, 4), line.qtyExecuted   ?? null);
          lr.input('CustomerSpec',  sql.NVarChar(200),  line.customerSpec  || null);
          lr.input('Barcode',       sql.NVarChar(100),  line.barcode       || null);
          lr.input('UnitOfMeasure', sql.NVarChar(20),   line.unitOfMeasure || null);
          lr.input('PostingGroup',  sql.NVarChar(50),   line.postingGroup  || null);
          if (includePart) {
            lr.input('Part',        sql.NVarChar(50),   String(line.part || '').trim() || null);
            await lr.query(`
              INSERT INTO ${schema}.[SalesLine]
                ([OrderNo],[LineNo],[ItemNo],[Description],[Quantity],[QuantityBase],[UnitPrice],
                 [LineAmount],[AmountInclVat],[VatPct],[QtyAssigned],[QtyExecuted],[CustomerSpec],[Barcode],
                 [UnitOfMeasure],[PostingGroup],[Part])
              VALUES
                (@OrderNo,@LineNo,@ItemNo,@Description,@Quantity,@QuantityBase,@UnitPrice,
                 @LineAmount,@AmountInclVat,@VatPct,@QtyAssigned,@QtyExecuted,@CustomerSpec,@Barcode,
                 @UnitOfMeasure,@PostingGroup,@Part)
            `);
          } else {
            await lr.query(`
              INSERT INTO ${schema}.[SalesLine]
                ([OrderNo],[LineNo],[ItemNo],[Description],[Quantity],[QuantityBase],[UnitPrice],
                 [LineAmount],[AmountInclVat],[VatPct],[QtyAssigned],[QtyExecuted],[CustomerSpec],[Barcode],
                 [UnitOfMeasure],[PostingGroup])
              VALUES
                (@OrderNo,@LineNo,@ItemNo,@Description,@Quantity,@QuantityBase,@UnitPrice,
                 @LineAmount,@AmountInclVat,@VatPct,@QtyAssigned,@QtyExecuted,@CustomerSpec,@Barcode,
                 @UnitOfMeasure,@PostingGroup)
            `);
          }
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
   * Group an order's lines by `Part` and return each part with its lines and
   * confirmation status. Lines without a `Part` value collapse into a single
   * synthetic `__no_part__` group so they're still visible.
   */
  async getParts(companyId, orderNo) {
    return db.query(companyId, async (pool, schema) => {
      const linesQ = await pool.request()
        .input('OrderNo', sql.NVarChar(30), orderNo)
        .query(`SELECT * FROM ${schema}.[SalesLine] WHERE [OrderNo]=@OrderNo ORDER BY [LineNo]`);
      if (!linesQ.recordset.length) return null;

      const confQ = await pool.request()
        .input('OrderNo', sql.NVarChar(30), orderNo)
        .query(`SELECT * FROM ${schema}.[OrderPartConfirmation] WHERE [OrderNo]=@OrderNo`);
      const confByPart = new Map();
      for (const c of confQ.recordset) confByPart.set(c.Part, c);

      const groups = new Map();
      for (const ln of linesQ.recordset) {
        const partKey = ln.Part || '__no_part__';
        if (!groups.has(partKey)) {
          const c = confByPart.get(partKey);
          groups.set(partKey, {
            part: partKey === '__no_part__' ? '' : partKey,
            confirmed: !!c,
            confirmedAt: c?.ConfirmedAt || null,
            confirmedBy: c?.ConfirmedBy || null,
            confirmedByName: c?.ConfirmedByName || null,
            notes: c?.Notes || null,
            lines: [],
            totals: { quantity: 0, lineAmount: 0, amountInclVat: 0 },
          });
        }
        const g = groups.get(partKey);
        g.lines.push(ln);
        g.totals.quantity      += Number(ln.Quantity || 0);
        g.totals.lineAmount    += Number(ln.LineAmount || 0);
        g.totals.amountInclVat += Number(ln.AmountInclVat || 0);
      }
      const parts = [...groups.values()].sort((a, b) => a.part.localeCompare(b.part));
      const allConfirmed = parts.length > 0 && parts.every(p => p.confirmed);
      return { orderNo, parts, allConfirmed };
    });
  }

  /**
   * Confirm a single part on an order. Idempotent: a second attempt returns
   * null + audits an "OrderPartCopy" entry. When all parts are confirmed,
   * the overall order is also moved to Confirmed (so existing flows keep working).
   */
  async confirmPart(companyId, orderNo, part, userId, userName) {
    const cleanPart = String(part || '').trim();
    return db.query(companyId, async (pool, schema) => {
      // Verify the part actually exists on the order so we don't accept invented part codes.
      const partsExist = await pool.request()
        .input('OrderNo', sql.NVarChar(30), orderNo)
        .input('Part',    sql.NVarChar(50), cleanPart || null)
        .query(`
          SELECT COUNT(*) AS n FROM ${schema}.[SalesLine]
          WHERE [OrderNo]=@OrderNo AND
                ((@Part IS NULL AND [Part] IS NULL) OR [Part]=@Part)
        `);
      if (!partsExist.recordset[0].n) {
        const e = new Error(`Part "${cleanPart || '(blank)'}" not found on order ${orderNo}`);
        e.code = 'PART_NOT_FOUND';
        throw e;
      }

      // Idempotent: already-confirmed → return false so the controller can 409.
      const dup = await pool.request()
        .input('OrderNo', sql.NVarChar(30), orderNo)
        .input('Part',    sql.NVarChar(50), cleanPart)
        .query(`SELECT [ConfirmedAt],[ConfirmedBy],[ConfirmedByName]
                FROM   ${schema}.[OrderPartConfirmation]
                WHERE  [OrderNo]=@OrderNo AND [Part]=@Part`);
      if (dup.recordset.length) return { duplicate: true, ...dup.recordset[0] };

      await pool.request()
        .input('OrderNo',         sql.NVarChar(30),  orderNo)
        .input('Part',            sql.NVarChar(50),  cleanPart)
        .input('ConfirmedBy',     sql.NVarChar(100), userId)
        .input('ConfirmedByName', sql.NVarChar(200), userName || null)
        .query(`
          INSERT INTO ${schema}.[OrderPartConfirmation]
            ([OrderNo],[Part],[ConfirmedBy],[ConfirmedByName])
          VALUES (@OrderNo,@Part,@ConfirmedBy,@ConfirmedByName)
        `);

      // Auto-confirm the order overall when every part has been signed off.
      const remaining = await pool.request()
        .input('OrderNo', sql.NVarChar(30), orderNo)
        .query(`
          SELECT COUNT(*) AS n FROM (
            SELECT DISTINCT ISNULL([Part], '') AS p
            FROM ${schema}.[SalesLine] WHERE [OrderNo]=@OrderNo
          ) sl
          WHERE NOT EXISTS (
            SELECT 1 FROM ${schema}.[OrderPartConfirmation] c
            WHERE c.[OrderNo]=@OrderNo AND ISNULL(c.[Part], '') = sl.p
          )
        `);
      const allConfirmed = remaining.recordset[0].n === 0;
      if (allConfirmed) {
        await pool.request()
          .input('OrderNo',     sql.NVarChar(30),  orderNo)
          .input('ConfirmedBy', sql.NVarChar(200), userName || userId)
          .query(`
            UPDATE ${schema}.[SalesHeader]
            SET [Status]='Confirmed', [ConfirmedAt]=GETUTCDATE(),
                [ConfirmedBy]=@ConfirmedBy, [UpdatedAt]=GETUTCDATE()
            WHERE [OrderNo]=@OrderNo AND [Status] <> 'Confirmed'
          `);
      }

      return { duplicate: false, allConfirmed };
    });
  }

  /**
   * Atomically move an order (header + lines) into InvoiceHeader/InvoiceLine
   * and delete from SalesHeader/SalesLine.
   */
  async moveToInvoice(companyId, orderNo, invoiceData, invoiceLines = null) {
    return db.query(companyId, async (pool, schema) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // ── Idempotency: if invoice already exists, skip silently ─────────
        const dupReq = new sql.Request(transaction);
        dupReq.input('InvoiceNo', sql.NVarChar(30), invoiceData.invoiceNo);
        const dupRes = await dupReq.query(
          `SELECT 1 FROM ${schema}.[InvoiceHeader] WHERE [InvoiceNo] = @InvoiceNo`
        );
        if (dupRes.recordset.length) {
          await transaction.commit();
          return false;
        }

        // ── Fetch original order ──────────────────────────────────────────
        const oReq = new sql.Request(transaction);
        oReq.input('OrderNo', sql.NVarChar(30), orderNo);
        const orderRes = await oReq.query(
          `SELECT * FROM ${schema}.[SalesHeader] WHERE [OrderNo] = @OrderNo`
        );
        if (!orderRes.recordset.length) throw new Error(`Order ${orderNo} not found`);
        const order = orderRes.recordset[0];

        const lReq = new sql.Request(transaction);
        lReq.input('OrderNo', sql.NVarChar(30), orderNo);
        const linesRes = await lReq.query(
          `SELECT * FROM ${schema}.[SalesLine] WHERE [OrderNo] = @OrderNo`
        );

        // ── Insert InvoiceHeader ──────────────────────────────────────────
        const ih = new sql.Request(transaction);
        ih.input('InvoiceNo',       sql.NVarChar(30),      invoiceData.invoiceNo);
        ih.input('OriginalOrderNo', sql.NVarChar(30),      orderNo);
        ih.input('CustomerNo',      sql.NVarChar(30),      order.CustomerNo);
        ih.input('CustomerName',    sql.NVarChar(200),     order.CustomerName);
        ih.input('CustomerPin',     sql.NVarChar(50),      invoiceData.customerPin     || null);
        ih.input('SalespersonCode', sql.NVarChar(20),      order.SalespersonCode);
        ih.input('SalespersonName', sql.NVarChar(200),     invoiceData.salespersonName || null);
        ih.input('RouteCode',       sql.NVarChar(20),      order.RouteCode);
        ih.input('SectorCode',      sql.NVarChar(20),      order.SectorCode);
        ih.input('ShipToName',      sql.NVarChar(200),     invoiceData.shipToName      || order.ShipToName  || null);
        ih.input('ShipmentMethod',  sql.NVarChar(30),      invoiceData.shipmentMethod  || null);
        ih.input('PaymentTerms',    sql.NVarChar(30),      invoiceData.paymentTerms    || order.PaymentTerms || null);
        ih.input('ExternalDocNo',   sql.NVarChar(50),      invoiceData.externalDocNo   || order.ExternalDocNo || null);
        ih.input('CompanyName',     sql.NVarChar(200),     invoiceData.companyName     || null);
        ih.input('CompanyPin',      sql.NVarChar(50),      invoiceData.companyPin      || null);
        ih.input('CompanyEmail',    sql.NVarChar(200),     invoiceData.companyEmail    || null);
        ih.input('CompanyVatReg',   sql.NVarChar(50),      invoiceData.companyVatReg   || null);
        ih.input('NoPrinted',       sql.Int,               invoiceData.noPrinted       ?? null);
        ih.input('OrderDate',       sql.Date,              order.OrderDate);
        ih.input('PostingDate',     sql.Date,              invoiceData.postingDate      ? new Date(invoiceData.postingDate)      : order.PostingDate);
        ih.input('PrintingDatetime',sql.DateTime2,         invoiceData.printingDatetime ? new Date(invoiceData.printingDatetime) : order.PrintingDatetime || null);
        ih.input('BCUserId',        sql.NVarChar(100),     invoiceData.bcUserId        || order.BCUserId || null);
        ih.input('InvoicedAt',      sql.DateTime2,         new Date(invoiceData.invoicedAt));
        ih.input('ETIMSInvoiceNo',  sql.NVarChar(60),      invoiceData.etimsInvoiceNo  || null);
        ih.input('ETIMSData',       sql.NVarChar(sql.MAX), invoiceData.etimsData ? JSON.stringify(invoiceData.etimsData) : null);
        ih.input('QRCodeUrl',       sql.NVarChar(500),     invoiceData.qrcodeUrl       || null);
        ih.input('Barcode',         sql.NVarChar(60),      invoiceData.barcode         || invoiceData.invoiceNo);

        await ih.query(`
          INSERT INTO ${schema}.[InvoiceHeader]
            ([InvoiceNo],[OriginalOrderNo],[CustomerNo],[CustomerName],[CustomerPin],
             [SalespersonCode],[SalespersonName],[RouteCode],[SectorCode],
             [ShipToName],[ShipmentMethod],[PaymentTerms],[ExternalDocNo],
             [CompanyName],[CompanyPin],[CompanyEmail],[CompanyVatReg],[NoPrinted],
             [OrderDate],[PostingDate],[PrintingDatetime],[BCUserId],[InvoicedAt],
             [ETIMSInvoiceNo],[ETIMSData],[QRCodeUrl],[Barcode])
          VALUES
            (@InvoiceNo,@OriginalOrderNo,@CustomerNo,@CustomerName,@CustomerPin,
             @SalespersonCode,@SalespersonName,@RouteCode,@SectorCode,
             @ShipToName,@ShipmentMethod,@PaymentTerms,@ExternalDocNo,
             @CompanyName,@CompanyPin,@CompanyEmail,@CompanyVatReg,@NoPrinted,
             @OrderDate,@PostingDate,@PrintingDatetime,@BCUserId,@InvoicedAt,
             @ETIMSInvoiceNo,@ETIMSData,@QRCodeUrl,@Barcode)
        `);

        // ── Insert InvoiceLines (use BC-provided lines if available, else copy from order) ──
        const linesToInsert = invoiceLines && invoiceLines.length
          ? invoiceLines.map(l => ({
              LineNo:             l.lineNo,
              ItemNo:             l.itemNo,
              Description:        l.description        || '',
              Quantity:           l.quantity            ?? 0,
              QuantityBase:       l.quantityBase        ?? l.quantity ?? 0,
              UnitPrice:          l.unitPrice           ?? 0,
              LineAmount:         l.lineAmount          ?? 0,
              LineAmountInclVat:  l.lineAmountInclVat   ?? null,
              VatPct:             l.vatPct              ?? null,
              VatIdentifier:      l.vatIdentifier       || null,
              UnitsPerParcel:     l.unitsPerParcel      ?? null,
              UnitOfMeasure:      l.unitOfMeasure       || null,
              PostingGroup:       l.postingGroup        || null,
            }))
          : linesRes.recordset.map(l => ({
              LineNo:             l.LineNo,
              ItemNo:             l.ItemNo,
              Description:        l.Description,
              Quantity:           l.Quantity,
              QuantityBase:       l.QuantityBase,
              UnitPrice:          l.UnitPrice,
              LineAmount:         l.LineAmount,
              LineAmountInclVat:  l.AmountInclVat ?? null,
              VatPct:             l.VatPct        ?? null,
              VatIdentifier:      null,
              UnitsPerParcel:     null,
              UnitOfMeasure:      l.UnitOfMeasure,
              PostingGroup:       l.PostingGroup  || null,
            }));

        for (const line of linesToInsert) {
          const il = new sql.Request(transaction);
          il.input('InvoiceNo',          sql.NVarChar(30),   invoiceData.invoiceNo);
          il.input('LineNo',             sql.Int,             line.LineNo);
          il.input('ItemNo',             sql.NVarChar(30),   line.ItemNo);
          il.input('Description',        sql.NVarChar(200),  line.Description);
          il.input('Quantity',           sql.Decimal(18, 4), line.Quantity);
          il.input('QuantityBase',       sql.Decimal(18, 4), line.QuantityBase);
          il.input('UnitPrice',          sql.Decimal(18, 4), line.UnitPrice);
          il.input('LineAmount',         sql.Decimal(18, 4), line.LineAmount);
          il.input('LineAmountInclVat',  sql.Decimal(18, 4), line.LineAmountInclVat);
          il.input('VatPct',             sql.Decimal(18, 4), line.VatPct);
          il.input('VatIdentifier',      sql.NVarChar(50),   line.VatIdentifier);
          il.input('UnitsPerParcel',     sql.Decimal(18, 4), line.UnitsPerParcel);
          il.input('UnitOfMeasure',      sql.NVarChar(20),   line.UnitOfMeasure);
          il.input('PostingGroup',       sql.NVarChar(50),   line.PostingGroup || null);
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

        // ── Delete from Sales tables ──────────────────────────────────────
        const dl = new sql.Request(transaction);
        dl.input('OrderNo', sql.NVarChar(30), orderNo);
        await dl.query(`DELETE FROM ${schema}.[SalesLine] WHERE [OrderNo] = @OrderNo`);

        const dh = new sql.Request(transaction);
        dh.input('OrderNo', sql.NVarChar(30), orderNo);
        await dh.query(`DELETE FROM ${schema}.[SalesHeader] WHERE [OrderNo] = @OrderNo`);

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
