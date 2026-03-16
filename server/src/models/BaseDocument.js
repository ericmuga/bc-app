/**
 * models/BaseDocument.js
 * Abstract base class providing shared DB query patterns.
 * Order and Invoice extend this – zero code duplication.
 */
import { db, sql } from '../db/pool.js';

export class BaseDocument {
  /**
   * @param {string} headerTable - 'SalesHeader' | 'InvoiceHeader'
   * @param {string} lineTable   - 'SalesLine'   | 'InvoiceLine'
   * @param {string} noField     - 'OrderNo'      | 'InvoiceNo'
   */
  constructor(headerTable, lineTable, noField) {
    this.headerTable = headerTable;
    this.lineTable   = lineTable;
    this.noField     = noField;
  }

  /** Find a single document with its lines */
  async findWithLines(companyId, docNo) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      req.input('DocNo', sql.NVarChar(30), docNo);

      const headerResult = await req.query(
        `SELECT * FROM ${schema}.[${this.headerTable}] WHERE [${this.noField}] = @DocNo`
      );
      if (!headerResult.recordset.length) return null;

      const lReq = pool.request();
      lReq.input('DocNo', sql.NVarChar(30), docNo);
      const linesResult = await lReq.query(
        `SELECT * FROM ${schema}.[${this.lineTable}] WHERE [${this.noField}] = @DocNo ORDER BY [LineNo]`
      );
      return { header: headerResult.recordset[0], lines: linesResult.recordset };
    });
  }

  /** Search / list documents */
  async search(companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector, postingGroup } = {}) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      const conditions = ['1=1'];

      if (q) {
        req.input('Q', sql.NVarChar(200), `%${q}%`);
        conditions.push(`([${this.noField}] LIKE @Q OR [CustomerName] LIKE @Q OR [CustomerNo] LIKE @Q)`);
      }
      if (customerNo) {
        req.input('CustomerNo', sql.NVarChar(30), customerNo);
        conditions.push('[CustomerNo] = @CustomerNo');
      }
      if (salesperson) {
        req.input('Salesperson', sql.NVarChar(20), salesperson);
        conditions.push('[SalespersonCode] = @Salesperson');
      }
      if (route) {
        req.input('Route', sql.NVarChar(20), route);
        conditions.push('[RouteCode] = @Route');
      }
      if (sector) {
        req.input('Sector', sql.NVarChar(20), sector);
        conditions.push('[SectorCode] = @Sector');
      }
      if (dateFrom) {
        req.input('DateFrom', sql.Date, new Date(dateFrom));
        conditions.push('[OrderDate] >= @DateFrom');
      }
      if (dateTo) {
        req.input('DateTo', sql.Date, new Date(dateTo));
        conditions.push('[OrderDate] <= @DateTo');
      }
      if (status) {
        req.input('Status', sql.NVarChar(20), status);
        conditions.push('[Status] = @Status');
      }
      if (postingGroup) {
        req.input('PostingGroup', sql.NVarChar(50), postingGroup);
        conditions.push(`EXISTS (SELECT 1 FROM ${schema}.[${this.lineTable}] ln WHERE ln.[${this.noField}] = [${this.noField}] AND ln.[PostingGroup] = @PostingGroup)`);
      }

      const result = await req.query(
        `SELECT * FROM ${schema}.[${this.headerTable}]
         WHERE ${conditions.join(' AND ')}
         ORDER BY [CreatedAt] DESC`
      );
      return result.recordset;
    });
  }

  /** Confirm a document – sets Status, ConfirmedAt, ConfirmedBy */
  async confirm(companyId, docNo, userId, userName) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      req.input('DocNo',    sql.NVarChar(30),  docNo);
      req.input('UserName', sql.NVarChar(200), userName);
      req.input('Now',      sql.DateTime2,     new Date());

      const result = await req.query(`
        UPDATE ${schema}.[${this.headerTable}]
        SET [Status] = 'Confirmed', [ConfirmedAt] = @Now, [ConfirmedBy] = @UserName, [UpdatedAt] = @Now
        WHERE [${this.noField}] = @DocNo AND [Status] != 'Confirmed'
      `);
      return result.rowsAffected[0] > 0;
    });
  }

  /** Write an audit log entry */
  async audit(companyId, eventType, documentNo, documentType, userId, userName, metadata = null) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      req.input('EventType',    sql.NVarChar(30),      eventType);
      req.input('DocumentNo',   sql.NVarChar(30),      documentNo);
      req.input('DocumentType', sql.NVarChar(20),      documentType);
      req.input('UserId',       sql.NVarChar(100),     userId   || null);
      req.input('UserName',     sql.NVarChar(200),     userName || null);
      req.input('Metadata',     sql.NVarChar(sql.MAX), metadata ? JSON.stringify(metadata) : null);

      await req.query(`
        INSERT INTO ${schema}.[AuditLog]
          ([EventType], [DocumentNo], [DocumentType], [UserId], [UserName], [Metadata])
        VALUES
          (@EventType, @DocumentNo, @DocumentType, @UserId, @UserName, @Metadata)
      `);
    });
  }

  /** Get audit log for a document */
  async getAuditLog(companyId, documentNo) {
    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      req.input('DocNo', sql.NVarChar(30), documentNo);
      const result = await req.query(
        `SELECT * FROM ${schema}.[AuditLog]
         WHERE [DocumentNo] = @DocNo
         ORDER BY [OccurredAt] DESC`
      );
      return result.recordset;
    });
  }

  /** Summary: group by a dimension with line amount/qty totals */
  async summary(companyId, { groupBy = 'CustomerNo', dateFrom, dateTo } = {}) {
    const headerGroups = ['CustomerNo', 'CustomerName', 'SalespersonCode', 'RouteCode', 'SectorCode', 'OrderDate'];
    const lineGroups   = ['PostingGroup'];
    const allAllowed   = [...headerGroups, ...lineGroups];
    const safeGroup    = allAllowed.includes(groupBy) ? groupBy : 'CustomerNo';
    const isLineGroup  = lineGroups.includes(safeGroup);
    const groupExpr    = isLineGroup ? `l.[${safeGroup}]` : `h.[${safeGroup}]`;

    return db.query(companyId, async (pool, schema) => {
      const req = pool.request();
      const conditions = ["h.[Status] = 'Confirmed'"];

      if (dateFrom) {
        req.input('DateFrom', sql.Date, new Date(dateFrom));
        conditions.push('h.[OrderDate] >= @DateFrom');
      }
      if (dateTo) {
        req.input('DateTo', sql.Date, new Date(dateTo));
        conditions.push('h.[OrderDate] <= @DateTo');
      }

      const result = await req.query(`
        SELECT
          ${groupExpr}                             AS GroupKey,
          COUNT(DISTINCT h.[${this.noField}])     AS DocumentCount,
          SUM(l.[Quantity])                        AS TotalQuantity,
          SUM(l.[QuantityBase])                    AS TotalQuantityBase,
          SUM(l.[LineAmount])                      AS TotalLineAmount
        FROM ${schema}.[${this.headerTable}] h
        JOIN ${schema}.[${this.lineTable}]   l ON h.[${this.noField}] = l.[${this.noField}]
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${groupExpr}
        ORDER BY TotalLineAmount DESC
      `);
      return result.recordset;
    });
  }
}
