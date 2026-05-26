/**
 * models/PosTillModel.js
 * Cashier till sessions: open with opening balances per payment type,
 * record cash drops/payouts, close with declared amounts.
 *
 * Cash report per session = for each payment type:
 *   opening + sales (from PosPayment within session period) + adjustments → expected
 *   declared - expected = variance
 */
import { db as appDb, sql } from '../db/pool.js';
import logger from '../services/logger.js';

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }
async function appPool() { return appDb.getPool(); }

async function nextSessionNo(pool) {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TS-${today}-`;
  const r = await pool.request().query(`
    SELECT TOP 1 [SessionNo] FROM [dbo].[PosTillSession]
    WHERE [SessionNo] LIKE '${prefix}%' ORDER BY [SessionNo] DESC
  `);
  if (!r.recordset.length) return `${prefix}001`;
  const seq = parseInt(r.recordset[0].SessionNo.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function getCurrentSession(cashierUserId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('userId', sql.NVarChar(100), cashierUserId)
    .query(`SELECT TOP 1 * FROM [dbo].[PosTillSession]
            WHERE [CashierUserId]=@userId AND [Status]='open'
            ORDER BY [OpenedAt] DESC`);
  if (!r.recordset.length) return null;
  return getSession(r.recordset[0].SessionId);
}

export async function listSessions({ shopCode = null, role = 'shop', cashierUserId = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const conds = [];
  if (role !== 'admin') {
    if (cashierUserId) {
      req.input('userId', sql.NVarChar(100), cashierUserId);
      conds.push('[CashierUserId]=@userId');
    } else if (shopCode) {
      req.input('shopCode', sql.NVarChar(50), shopCode);
      conds.push('[ShopCode]=@shopCode');
    }
  } else if (shopCode) {
    req.input('shopCode', sql.NVarChar(50), shopCode);
    conds.push('[ShopCode]=@shopCode');
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await req.query(`
    SELECT [SessionId],[SessionNo],[ShopCode],[CashierUserId],[CashierName],
           [Status],[OpenedAt],[ClosedAt],[Notes]
    FROM [dbo].[PosTillSession]
    ${where}
    ORDER BY [OpenedAt] DESC
  `);
  return r.recordset;
}

export async function getSession(sessionId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('sessionId', sql.UniqueIdentifier, sessionId)
    .query(`SELECT * FROM [dbo].[PosTillSession] WHERE [SessionId]=@sessionId`);
  if (!hdr.recordset.length) return null;
  const balances = await pool.request()
    .input('sessionId', sql.UniqueIdentifier, sessionId)
    .query(`SELECT * FROM [dbo].[PosTillBalance] WHERE [SessionId]=@sessionId
            ORDER BY [PaymentTypeName]`);
  const txns = await pool.request()
    .input('sessionId', sql.UniqueIdentifier, sessionId)
    .query(`SELECT * FROM [dbo].[PosTillTransaction] WHERE [SessionId]=@sessionId
            ORDER BY [CreatedAt]`);
  const h = hdr.recordset[0];
  return {
    sessionId:    h.SessionId,
    sessionNo:    h.SessionNo,
    shopCode:     h.ShopCode,
    cashierUserId:h.CashierUserId,
    cashierName:  h.CashierName,
    status:       h.Status,
    openedAt:     h.OpenedAt,
    closedAt:     h.ClosedAt,
    notes:        h.Notes || '',
    balances: balances.recordset.map(b => ({
      balanceId:        b.BalanceId,
      paymentTypeCode:  b.PaymentTypeCode,
      paymentTypeName:  b.PaymentTypeName,
      openingAmount:    Number(b.OpeningAmount),
      declaredClosing:  b.DeclaredClosing == null ? null : Number(b.DeclaredClosing),
    })),
    transactions: txns.recordset.map(t => ({
      transactionId:    t.TransactionId,
      paymentTypeCode:  t.PaymentTypeCode,
      transactionType:  t.TransactionType,
      amount:           Number(t.Amount),
      reference:        t.Reference || '',
      notes:            t.Notes || '',
      createdBy:        t.CreatedBy,
      createdAt:        t.CreatedAt,
    })),
  };
}

export async function openSession({ shopCode, cashierUserId, cashierName, notes, balances }) {
  if (!shopCode) throw new Error('shopCode is required');
  // Refuse if user already has an open session
  const existing = await getCurrentSession(cashierUserId);
  if (existing) throw new Error(`You already have an open till (${existing.sessionNo}). Close it first.`);

  const pool = await appPool();
  const sessionNo = await nextSessionNo(pool);
  const r = await pool.request()
    .input('sessionNo',     sql.NVarChar(30),  sessionNo)
    .input('shopCode',      sql.NVarChar(50),  str(shopCode, 50).toUpperCase())
    .input('cashierUserId', sql.NVarChar(100), cashierUserId)
    .input('cashierName',   sql.NVarChar(200), str(cashierName))
    .input('notes',         sql.NVarChar(500), str(notes, 500) || null)
    .query(`
      INSERT INTO [dbo].[PosTillSession]
        ([SessionNo],[ShopCode],[CashierUserId],[CashierName],[Status],[Notes])
      OUTPUT INSERTED.[SessionId], INSERTED.[SessionNo]
      VALUES(@sessionNo,@shopCode,@cashierUserId,@cashierName,'open',@notes)
    `);
  const sessionId = r.recordset[0].SessionId;

  for (const b of (balances || [])) {
    if (!b.paymentTypeCode) continue;
    await pool.request()
      .input('sessionId',        sql.UniqueIdentifier, sessionId)
      .input('paymentTypeCode',  sql.NVarChar(50),     str(b.paymentTypeCode, 50).toUpperCase())
      .input('paymentTypeName',  sql.NVarChar(200),    str(b.paymentTypeName))
      .input('openingAmount',    sql.Decimal(18, 4),   num(b.openingAmount))
      .query(`
        INSERT INTO [dbo].[PosTillBalance]
          ([SessionId],[PaymentTypeCode],[PaymentTypeName],[OpeningAmount])
        VALUES(@sessionId,@paymentTypeCode,@paymentTypeName,@openingAmount)
      `);
  }
  return r.recordset[0];
}

export async function addTransaction(sessionId, { paymentTypeCode, transactionType, amount, reference, notes, createdBy }) {
  const VALID = ['cash-in', 'cash-out', 'drop', 'payout', 'expense'];
  if (!VALID.includes(transactionType)) throw new Error(`Invalid transactionType: ${transactionType}`);
  // Sign convention: cash-in/drop/payout-IN are positive; cash-out/payout/expense negative
  const isOutflow = ['cash-out', 'payout', 'expense'].includes(transactionType);
  const signedAmount = isOutflow ? -Math.abs(num(amount)) : Math.abs(num(amount));

  const pool = await appPool();
  await pool.request()
    .input('sessionId',       sql.UniqueIdentifier, sessionId)
    .input('paymentTypeCode', sql.NVarChar(50),     str(paymentTypeCode, 50).toUpperCase())
    .input('transactionType', sql.NVarChar(30),     transactionType)
    .input('amount',          sql.Decimal(18, 4),   signedAmount)
    .input('reference',       sql.NVarChar(100),    str(reference, 100) || null)
    .input('notes',           sql.NVarChar(500),    str(notes, 500) || null)
    .input('createdBy',       sql.NVarChar(100),    createdBy || null)
    .query(`
      INSERT INTO [dbo].[PosTillTransaction]
        ([SessionId],[PaymentTypeCode],[TransactionType],[Amount],[Reference],[Notes],[CreatedBy])
      VALUES(@sessionId,@paymentTypeCode,@transactionType,@amount,@reference,@notes,@createdBy)
    `);
}

/**
 * Close session. `declared` is { paymentTypeCode -> declaredAmount }.
 */
export async function closeSession(sessionId, declared = {}) {
  const pool = await appPool();
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');
  if (session.status === 'closed') throw new Error('Session already closed');

  for (const b of session.balances) {
    if (declared[b.paymentTypeCode] != null) {
      await pool.request()
        .input('balanceId', sql.UniqueIdentifier, b.balanceId)
        .input('declared',  sql.Decimal(18, 4),   num(declared[b.paymentTypeCode]))
        .query(`UPDATE [dbo].[PosTillBalance]
                SET [DeclaredClosing]=@declared,[UpdatedAt]=GETUTCDATE()
                WHERE [BalanceId]=@balanceId`);
    }
  }

  await pool.request()
    .input('sessionId', sql.UniqueIdentifier, sessionId)
    .query(`UPDATE [dbo].[PosTillSession]
            SET [Status]='closed',[ClosedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [SessionId]=@sessionId`);
}

// ── Cash report ──────────────────────────────────────────────────────────────
/**
 * Returns per-payment-type rollup for the session:
 *   opening, sales, cashIn, cashOut, expected, declared, variance, txnCount
 */
export async function cashReport(sessionId) {
  const pool = await appPool();
  const session = await getSession(sessionId);
  if (!session) return null;

  const closedAt = session.closedAt || new Date();

  // Sales totals per payment-type-code from confirmed payments within the session window
  const salesQ = await pool.request()
    .input('shopCode', sql.NVarChar(50),  session.shopCode)
    .input('cashier',  sql.NVarChar(100), session.cashierUserId)
    .input('openedAt', sql.DateTime2,     session.openedAt)
    .input('closedAt', sql.DateTime2,     closedAt)
    .query(`
      SELECT p.[PaymentTypeCode], p.[PaymentTypeName],
             SUM(p.[Amount]) AS TotalAmount,
             COUNT(*)        AS TxnCount
      FROM [dbo].[PosPayment] p
      JOIN [dbo].[PosOrder]   o ON o.[OrderId] = p.[OrderId]
      WHERE o.[ShopCode] = @shopCode
        AND o.[CashierUserId] = @cashier
        AND p.[Status] = 'confirmed'
        AND p.[CreatedAt] BETWEEN @openedAt AND @closedAt
      GROUP BY p.[PaymentTypeCode], p.[PaymentTypeName]
    `);
  const salesByCode = new Map(salesQ.recordset.map(r => [r.PaymentTypeCode, {
    sales:    Number(r.TotalAmount || 0),
    txnCount: Number(r.TxnCount    || 0),
    name:     r.PaymentTypeName,
  }]));

  // Cash adjustments per payment type
  const adjMap = new Map();
  for (const t of session.transactions) {
    const cur = adjMap.get(t.paymentTypeCode) || { cashIn: 0, cashOut: 0, txnCount: 0 };
    if (t.amount > 0) cur.cashIn += t.amount;
    else              cur.cashOut += Math.abs(t.amount);
    cur.txnCount++;
    adjMap.set(t.paymentTypeCode, cur);
  }

  // Build the per-type roll-up: include any payment type with opening balance,
  // sales, or adjustments — even if the cashier didn't open with one.
  const allCodes = new Set([
    ...session.balances.map(b => b.paymentTypeCode),
    ...salesByCode.keys(),
    ...adjMap.keys(),
  ]);

  const rows = [];
  for (const code of allCodes) {
    const balance = session.balances.find(b => b.paymentTypeCode === code);
    const sales   = salesByCode.get(code) || { sales: 0, txnCount: 0, name: code };
    const adj     = adjMap.get(code) || { cashIn: 0, cashOut: 0, txnCount: 0 };
    const opening = balance ? balance.openingAmount : 0;
    const expected = opening + sales.sales + adj.cashIn - adj.cashOut;
    const declared = balance?.declaredClosing ?? null;
    rows.push({
      paymentTypeCode: code,
      paymentTypeName: balance?.paymentTypeName || sales.name,
      opening,
      sales:    sales.sales,
      salesTxn: sales.txnCount,
      cashIn:   adj.cashIn,
      cashOut:  adj.cashOut,
      adjTxn:   adj.txnCount,
      expected,
      declared,
      variance: declared == null ? null : (declared - expected),
    });
  }
  rows.sort((a, b) => a.paymentTypeName.localeCompare(b.paymentTypeName));

  // Totals
  const totals = rows.reduce((t, r) => ({
    opening:  t.opening  + r.opening,
    sales:    t.sales    + r.sales,
    cashIn:   t.cashIn   + r.cashIn,
    cashOut:  t.cashOut  + r.cashOut,
    expected: t.expected + r.expected,
    declared: r.declared == null ? t.declared : (t.declared || 0) + r.declared,
    variance: r.variance == null ? t.variance : (t.variance || 0) + r.variance,
  }), { opening: 0, sales: 0, cashIn: 0, cashOut: 0, expected: 0, declared: null, variance: null });

  return { session, rows, totals };
}

/**
 * Cash movement report across many sessions.
 * Filters: shopCode (optional — admin sees all if omitted), dateFrom, dateTo.
 *
 * Returns rows aggregating cash flow per (Shop × Cashier × Payment Type), plus
 * counts of opened sessions, sales, cash-in/cash-out adjustments, expected
 * closing, and variance against declared closings.
 */
export async function cashMovementReport({ shopCode = null, dateFrom, dateTo, cashierUserId = null } = {}) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();
  const r = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
  let sessFilter = `CAST(s.[OpenedAt] AS DATE) BETWEEN @df AND @dt`;
  if (shopCode) { r.input('shop',    sql.NVarChar(50),  shopCode.toUpperCase()); sessFilter += ' AND s.[ShopCode]=@shop'; }
  if (cashierUserId) { r.input('uid', sql.NVarChar(100), cashierUserId);          sessFilter += ' AND s.[CashierUserId]=@uid'; }

  // Sessions in the period
  const sessRes = await r.query(`
    SELECT [SessionId],[SessionNo],[ShopCode],[CashierUserId],[CashierName],[Status],[OpenedAt],[ClosedAt]
    FROM   [dbo].[PosTillSession] s
    WHERE  ${sessFilter}
    ORDER BY [OpenedAt] DESC
  `);
  const sessions = sessRes.recordset;
  if (!sessions.length) return { rows: [], sessions: [], totals: defaultsCashTotals() };

  const sessionIds = sessions.map(s => s.SessionId);
  const idsReq = pool.request();
  sessionIds.forEach((id, i) => idsReq.input(`s${i}`, sql.UniqueIdentifier, id));
  const inList = sessionIds.map((_, i) => `@s${i}`).join(',');

  const balRes = await idsReq.query(`SELECT * FROM [dbo].[PosTillBalance] WHERE [SessionId] IN (${inList})`);
  // Need a fresh request for the txns query (reusing the same one is safe in mssql but keep clean)
  const txnReq = pool.request();
  sessionIds.forEach((id, i) => txnReq.input(`s${i}`, sql.UniqueIdentifier, id));
  const txnRes = await txnReq.query(`SELECT * FROM [dbo].[PosTillTransaction] WHERE [SessionId] IN (${inList})`);
  const payReq = pool.request();
  sessionIds.forEach((id, i) => payReq.input(`s${i}`, sql.UniqueIdentifier, id));
  // Sales per session — confirmed payments scoped by (shop, cashier) within open/close window
  // Pull all confirmed payments for the shops/cashiers in this set, then bucket by session in JS.
  const sessByKey = new Map(sessions.map(s => [`${s.ShopCode}__${s.CashierUserId}__${s.SessionId}`, s]));
  const allShops = [...new Set(sessions.map(s => s.ShopCode))];
  const allCashiers = [...new Set(sessions.map(s => s.CashierUserId))];
  const psReq = pool.request().input('df', sql.DateTime2, sessions[sessions.length-1].OpenedAt)
                              .input('dt', sql.DateTime2, sessions[0].ClosedAt || new Date());
  allShops.forEach((s,i) => psReq.input(`sh${i}`, sql.NVarChar(50), s));
  allCashiers.forEach((c,i) => psReq.input(`ca${i}`, sql.NVarChar(100), c));
  const shopList = allShops.map((_,i)=>`@sh${i}`).join(',');
  const cashList = allCashiers.map((_,i)=>`@ca${i}`).join(',');
  const paysRes = await psReq.query(`
    SELECT p.[PaymentTypeCode], p.[PaymentTypeName], p.[Amount], p.[CreatedAt],
           o.[ShopCode], o.[CashierUserId]
    FROM   [dbo].[PosPayment] p
    JOIN   [dbo].[PosOrder]   o ON o.[OrderId] = p.[OrderId]
    WHERE  p.[Status] = 'confirmed'
      AND  o.[ShopCode] IN (${shopList})
      AND  o.[CashierUserId] IN (${cashList})
      AND  p.[CreatedAt] BETWEEN @df AND @dt
  `);

  // Bucket payments into the session whose [openedAt, closedAt] window contains them.
  const payBySession = new Map();
  for (const p of paysRes.recordset) {
    const sess = sessions.find(s =>
      s.ShopCode === p.ShopCode && s.CashierUserId === p.CashierUserId &&
      new Date(p.CreatedAt) >= new Date(s.OpenedAt) &&
      (s.ClosedAt == null || new Date(p.CreatedAt) <= new Date(s.ClosedAt))
    );
    if (!sess) continue;
    const key = `${sess.SessionId}__${p.PaymentTypeCode}`;
    const cur = payBySession.get(key) || { name: p.PaymentTypeName, sales: 0, txn: 0 };
    cur.sales += Number(p.Amount); cur.txn += 1;
    payBySession.set(key, cur);
  }

  const rows = [];
  for (const sess of sessions) {
    const balances = balRes.recordset.filter(b => b.SessionId === sess.SessionId);
    const txns     = txnRes.recordset.filter(t => t.SessionId === sess.SessionId);
    const ptCodes  = new Set([
      ...balances.map(b => b.PaymentTypeCode),
      ...txns.map(t => t.PaymentTypeCode),
      ...[...payBySession.keys()].filter(k => k.startsWith(`${sess.SessionId}__`)).map(k => k.split('__')[1]),
    ]);
    for (const code of ptCodes) {
      const bal = balances.find(b => b.PaymentTypeCode === code);
      const adj = txns.filter(t => t.PaymentTypeCode === code).reduce((acc, t) => {
        const amt = Number(t.Amount);
        if (amt > 0) acc.cashIn  += amt;
        else         acc.cashOut += Math.abs(amt);
        acc.txn += 1;
        return acc;
      }, { cashIn: 0, cashOut: 0, txn: 0 });
      const sales = payBySession.get(`${sess.SessionId}__${code}`) || { sales: 0, txn: 0, name: code };
      const opening = bal ? Number(bal.OpeningAmount) : 0;
      const declared = bal && bal.DeclaredClosing != null ? Number(bal.DeclaredClosing) : null;
      const expected = opening + sales.sales + adj.cashIn - adj.cashOut;
      rows.push({
        sessionNo:       sess.SessionNo,
        shopCode:        sess.ShopCode,
        cashierName:     sess.CashierName,
        openedAt:        sess.OpenedAt,
        closedAt:        sess.ClosedAt,
        status:          sess.Status,
        paymentTypeCode: code,
        paymentTypeName: bal?.PaymentTypeName || sales.name || code,
        opening,
        sales:    sales.sales,
        salesTxn: sales.txn,
        cashIn:   adj.cashIn,
        cashOut:  adj.cashOut,
        adjTxn:   adj.txn,
        expected,
        declared,
        variance: declared == null ? null : (declared - expected),
      });
    }
  }

  rows.sort((a, b) =>
    String(a.shopCode).localeCompare(String(b.shopCode)) ||
    new Date(b.openedAt) - new Date(a.openedAt) ||
    String(a.paymentTypeName).localeCompare(String(b.paymentTypeName))
  );

  const totals = rows.reduce((t, r) => ({
    opening:  t.opening  + r.opening,
    sales:    t.sales    + r.sales,
    cashIn:   t.cashIn   + r.cashIn,
    cashOut:  t.cashOut  + r.cashOut,
    expected: t.expected + r.expected,
    declared: r.declared == null ? t.declared : (t.declared || 0) + r.declared,
    variance: r.variance == null ? t.variance : (t.variance || 0) + r.variance,
  }), defaultsCashTotals());

  return { rows, sessions, totals };
}
function defaultsCashTotals() {
  return { opening: 0, sales: 0, cashIn: 0, cashOut: 0, expected: 0, declared: null, variance: null };
}
