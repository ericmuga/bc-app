/**
 * models/PosCouponModel.js
 * Prepaid coupons usable as a payment tender.
 *
 * PosCoupon         — header (Code, FaceValue, Balance, contact, validity, status)
 * PosCouponLedger   — every credit/debit (issuance, redemption, void, top-up)
 *
 * Idempotency on redemption: (CouponCode + OrderNo + Reference) PK so a
 * retry never double-charges the coupon.
 */
import { db as appDb, sql } from '../db/pool.js';

function s(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function n(v) { return isNaN(Number(v)) ? 0 : Number(v); }
async function pool() { return appDb.getPool(); }

export async function ensureCouponTables(p) {
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosCoupon' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosCoupon] (
      [CouponId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]          NVARCHAR(40)     NOT NULL UNIQUE,
      [FaceValue]     DECIMAL(18,4)    NOT NULL,
      [Balance]       DECIMAL(18,4)    NOT NULL,
      [Currency]      NVARCHAR(10)     NOT NULL DEFAULT 'KES',
      [ContactName]   NVARCHAR(200)    NULL,
      [ContactEmail]  NVARCHAR(200)    NULL,
      [ContactPhone]  NVARCHAR(40)     NULL,
      [ShopCode]      NVARCHAR(50)     NULL,
      [IssuedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [ExpiresAt]     DATETIME2        NULL,
      [Status]        NVARCHAR(20)     NOT NULL DEFAULT 'active',  -- active|exhausted|expired|void
      [Notes]         NVARCHAR(500)    NULL,
      [CreatedBy]     NVARCHAR(200)    NULL,
      [ModifiedBy]    NVARCHAR(200)    NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosCouponLedger' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosCouponLedger] (
      [LedgerId]    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      [CouponCode]  NVARCHAR(40)     NOT NULL,
      [EntryType]   NVARCHAR(20)     NOT NULL,   -- issue|redeem|topup|void
      [Amount]      DECIMAL(18,4)    NOT NULL,   -- positive=credit, negative=debit
      [BalanceAfter] DECIMAL(18,4)   NOT NULL,
      [OrderNo]     NVARCHAR(30)     NULL,
      [Reference]   NVARCHAR(100)    NULL,
      [Notes]       NVARCHAR(500)    NULL,
      [PerformedBy] NVARCHAR(200)    NULL,
      [PerformedAt] DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PosCouponLedger_Code'
                   AND object_id=OBJECT_ID('[dbo].[PosCouponLedger]'))
      CREATE INDEX [IX_PosCouponLedger_Code] ON [dbo].[PosCouponLedger]([CouponCode],[PerformedAt] DESC)
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PosCouponLedger_Idem'
                   AND object_id=OBJECT_ID('[dbo].[PosCouponLedger]'))
      CREATE UNIQUE INDEX [UX_PosCouponLedger_Idem] ON [dbo].[PosCouponLedger]([CouponCode],[OrderNo],[Reference])
        WHERE [OrderNo] IS NOT NULL AND [Reference] IS NOT NULL
  `);
}

function genCode() {
  // 12-char alphanumeric, no ambiguous 0/O/1/I/L
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function listCoupons({ status = null, q = null, dateFrom = null, dateTo = null } = {}) {
  const p = await pool();
  const r = p.request();
  const conds = [];
  if (status) { r.input('st', sql.NVarChar(20), status); conds.push('[Status]=@st'); }
  if (q) { r.input('q', sql.NVarChar(200), `%${q}%`); conds.push('([Code] LIKE @q OR [ContactName] LIKE @q OR [ContactEmail] LIKE @q OR [ContactPhone] LIKE @q)'); }
  if (dateFrom) { r.input('df', sql.Date, dateFrom); conds.push('CAST([IssuedAt] AS DATE) >= @df'); }
  if (dateTo)   { r.input('dt', sql.Date, dateTo);   conds.push('CAST([IssuedAt] AS DATE) <= @dt'); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const res = await r.query(`SELECT * FROM [dbo].[PosCoupon] ${where} ORDER BY [IssuedAt] DESC`);
  return res.recordset;
}

export async function getCouponByCode(code) {
  const p = await pool();
  const r = await p.request()
    .input('code', sql.NVarChar(40), s(code, 40).toUpperCase())
    .query(`SELECT * FROM [dbo].[PosCoupon] WHERE [Code]=@code`);
  return r.recordset[0] || null;
}

export async function listLedger(code) {
  const p = await pool();
  const r = await p.request()
    .input('code', sql.NVarChar(40), s(code, 40).toUpperCase())
    .query(`SELECT * FROM [dbo].[PosCouponLedger] WHERE [CouponCode]=@code ORDER BY [PerformedAt] DESC`);
  return r.recordset;
}

export async function issueCoupon({ faceValue, contactName, contactEmail, contactPhone,
                                    shopCode = null, expiresAt = null, notes = null,
                                    createdBy, code = null } = {}) {
  const fv = n(faceValue);
  if (!(fv > 0)) throw new Error('faceValue must be > 0');
  const p = await pool();
  // Generate a unique code
  let cpCode = (code || '').toUpperCase().trim() || genCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await p.request().input('c', sql.NVarChar(40), cpCode)
      .query(`SELECT 1 FROM [dbo].[PosCoupon] WHERE [Code]=@c`);
    if (!exists.recordset.length) break;
    cpCode = genCode();
  }
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('code',         sql.NVarChar(40),  cpCode)
      .input('faceValue',    sql.Decimal(18,4), fv)
      .input('contactName',  sql.NVarChar(200), s(contactName) || null)
      .input('contactEmail', sql.NVarChar(200), s(contactEmail, 200) || null)
      .input('contactPhone', sql.NVarChar(40),  s(contactPhone, 40)  || null)
      .input('shopCode',     sql.NVarChar(50),  s(shopCode, 50).toUpperCase() || null)
      .input('expiresAt',    sql.DateTime2,     expiresAt ? new Date(expiresAt) : null)
      .input('notes',        sql.NVarChar(500), s(notes, 500) || null)
      .input('createdBy',    sql.NVarChar(200), s(createdBy, 200) || null)
      .query(`
        INSERT INTO [dbo].[PosCoupon]
          ([Code],[FaceValue],[Balance],[ContactName],[ContactEmail],[ContactPhone],[ShopCode],
           [ExpiresAt],[Notes],[CreatedBy])
        VALUES (@code,@faceValue,@faceValue,@contactName,@contactEmail,@contactPhone,@shopCode,
                @expiresAt,@notes,@createdBy)
      `);
    await new sql.Request(tx)
      .input('code',        sql.NVarChar(40),  cpCode)
      .input('amount',      sql.Decimal(18,4), fv)
      .input('balanceAfter',sql.Decimal(18,4), fv)
      .input('performedBy', sql.NVarChar(200), s(createdBy, 200) || null)
      .query(`
        INSERT INTO [dbo].[PosCouponLedger]
          ([CouponCode],[EntryType],[Amount],[BalanceAfter],[Notes],[PerformedBy])
        VALUES (@code,'issue',@amount,@balanceAfter,'Coupon issued',@performedBy)
      `);
    await tx.commit();
    return await getCouponByCode(cpCode);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/**
 * Atomic redeem. Returns { applied, balance } where applied is the actual amount
 * deducted (capped at the coupon balance). Throws if expired/void/already used
 * for that (orderNo, reference).
 */
export async function redeemCoupon({ code, requestedAmount, orderNo, reference, performedBy }) {
  const cpCode = s(code, 40).toUpperCase();
  const requested = n(requestedAmount);
  if (!cpCode)              throw new Error('coupon code required');
  if (!(requested > 0))     throw new Error('amount must be > 0');
  if (!orderNo)             throw new Error('orderNo required');
  const p = await pool();
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    // Lock the row (HOLDLOCK + UPDLOCK) so two concurrent redemptions can't oversell the coupon.
    const cpRes = await new sql.Request(tx)
      .input('code', sql.NVarChar(40), cpCode)
      .query(`SELECT * FROM [dbo].[PosCoupon] WITH (UPDLOCK, HOLDLOCK) WHERE [Code]=@code`);
    if (!cpRes.recordset.length) throw new Error(`Coupon ${cpCode} not found`);
    const cp = cpRes.recordset[0];
    if (cp.Status !== 'active') throw new Error(`Coupon ${cpCode} is ${cp.Status}`);
    if (cp.ExpiresAt && new Date(cp.ExpiresAt).getTime() < Date.now()) {
      throw new Error(`Coupon ${cpCode} expired on ${new Date(cp.ExpiresAt).toISOString().slice(0, 10)}`);
    }
    const balance = Number(cp.Balance);
    if (balance <= 0) throw new Error(`Coupon ${cpCode} has no balance left`);

    // Idempotent on (Code, OrderNo, Reference) — second call for same payment is a no-op.
    const dup = await new sql.Request(tx)
      .input('code',  sql.NVarChar(40),  cpCode)
      .input('order', sql.NVarChar(30),  orderNo)
      .input('ref',   sql.NVarChar(100), reference || '')
      .query(`SELECT TOP 1 [Amount],[BalanceAfter] FROM [dbo].[PosCouponLedger]
              WHERE [CouponCode]=@code AND [OrderNo]=@order AND ISNULL([Reference],'')=@ref`);
    if (dup.recordset.length) {
      await tx.commit();
      return {
        applied: Math.abs(Number(dup.recordset[0].Amount)),
        balance: Number(dup.recordset[0].BalanceAfter),
        duplicate: true,
      };
    }

    const applied = Math.min(balance, requested);
    const newBalance = Math.round((balance - applied) * 10000) / 10000;
    const newStatus  = newBalance <= 0 ? 'exhausted' : 'active';

    await new sql.Request(tx)
      .input('code',       sql.NVarChar(40),  cpCode)
      .input('balance',    sql.Decimal(18,4), newBalance)
      .input('status',     sql.NVarChar(20),  newStatus)
      .input('modifiedBy', sql.NVarChar(200), s(performedBy, 200) || null)
      .query(`
        UPDATE [dbo].[PosCoupon]
        SET [Balance]=@balance,[Status]=@status,[ModifiedBy]=@modifiedBy,[UpdatedAt]=GETUTCDATE()
        WHERE [Code]=@code
      `);
    await new sql.Request(tx)
      .input('code',         sql.NVarChar(40),  cpCode)
      .input('amount',       sql.Decimal(18,4), -applied)
      .input('balanceAfter', sql.Decimal(18,4), newBalance)
      .input('orderNo',      sql.NVarChar(30),  orderNo)
      .input('reference',    sql.NVarChar(100), reference || null)
      .input('performedBy',  sql.NVarChar(200), s(performedBy, 200) || null)
      .query(`
        INSERT INTO [dbo].[PosCouponLedger]
          ([CouponCode],[EntryType],[Amount],[BalanceAfter],[OrderNo],[Reference],[Notes],[PerformedBy])
        VALUES (@code,'redeem',@amount,@balanceAfter,@orderNo,@reference,'Redeemed at POS',@performedBy)
      `);
    await tx.commit();
    return { applied, balance: newBalance, duplicate: false };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function voidCoupon({ code, performedBy, notes }) {
  const cpCode = s(code, 40).toUpperCase();
  const p = await pool();
  const cp = await getCouponByCode(cpCode);
  if (!cp) throw new Error(`Coupon ${cpCode} not found`);
  if (cp.Status === 'void') return cp;
  await p.request()
    .input('code', sql.NVarChar(40), cpCode)
    .input('by',   sql.NVarChar(200), s(performedBy, 200) || null)
    .query(`UPDATE [dbo].[PosCoupon] SET [Status]='void',[Balance]=0,[ModifiedBy]=@by,[UpdatedAt]=GETUTCDATE() WHERE [Code]=@code`);
  await p.request()
    .input('code',         sql.NVarChar(40),  cpCode)
    .input('amount',       sql.Decimal(18,4), -Number(cp.Balance || 0))
    .input('balanceAfter', sql.Decimal(18,4), 0)
    .input('notes',        sql.NVarChar(500), s(notes || 'Coupon voided', 500))
    .input('performedBy',  sql.NVarChar(200), s(performedBy, 200) || null)
    .query(`INSERT INTO [dbo].[PosCouponLedger]
              ([CouponCode],[EntryType],[Amount],[BalanceAfter],[Notes],[PerformedBy])
            VALUES (@code,'void',@amount,@balanceAfter,@notes,@performedBy)`);
  return await getCouponByCode(cpCode);
}
