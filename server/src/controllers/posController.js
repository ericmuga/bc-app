/**
 * controllers/posController.js
 * POS module REST handlers.
 */
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Pos from '../models/PosModel.js';
import * as Stock from '../models/PosStockModel.js';
import { signPosOrder, signPosCreditMemo, printPosOrder, printConfirmationReceipt, sendStkPush, listInstalledPrinters,
         buildEtimsPayload, validateEtimsReadiness, invalidateEtimsCache, invalidatePrintCache,
         fetchPaymentsFromService, buildPrintPayload } from '../services/posReceiptService.js';
import { ordersDb, sql as ordersSql } from '../db/ordersPool.js';
import { pdfPathFor, generateInvoicePdf, generatePriceListPdf } from '../services/posPdfService.js';
import logger from '../services/logger.js';

function ok(res, data)  { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

async function resolveShopCode(userId, role, req = null) {
  // Admin priority: explicit X-Shop-Code header → assigned ShopCode on profile → null
  if (role === 'admin') {
    const headerShop = req?.headers?.['x-shop-code'];
    if (headerShop) return String(headerShop).trim().toUpperCase();
    return Pos.getUserShopCode(userId);   // admin can self-assign in their profile
  }
  return Pos.getUserShopCode(userId);
}

// ── POS terminal ──────────────────────────────────────────────────────────────

export async function getItems(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req)
                  || (req.headers['x-shop-code'] || '').trim().toUpperCase()
                  || null;
    ok(res, await Pos.listPosItemsGrouped({ shopCode, userId: req.user.userId }));
  } catch (e) { err(res, e); }
}

export async function getPaymentTypes(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    ok(res, await Pos.listPaymentTypes({ activeOnly: true, shopCode }));
  } catch (e) { err(res, e); }
}

export async function getMyShop(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    if (!shopCode) return ok(res, null);
    const shops = await Pos.listShops({ activeOnly: false });
    const shop  = shops.find(s => s.Code === shopCode) ?? null;
    ok(res, shop);
  } catch (e) { err(res, e); }
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function createOrder(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    const result   = await Pos.createOrder(req.user.userId, req.user.userName, shopCode);
    ok(res, result);
  } catch (e) { err(res, e); }
}

export async function listOrders(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    ok(res, await Pos.listOrders(req.user.userId, req.user.role, shopCode));
  } catch (e) { err(res, e); }
}

export async function getOrder(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    ok(res, order);
  } catch (e) { err(res, e); }
}

export async function setOrderLines(req, res) {
  try {
    const lines = req.body.lines;
    if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines must be an array' });
    await Pos.setOrderLines(req.params.orderId, lines);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function checkout(req, res) {
  try {
    const { paymentTypeCode, paymentTypeName, amount, mobileNo, reference, couponCode } = req.body;
    if (!paymentTypeCode) return res.status(400).json({ error: 'paymentTypeCode required' });
    if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'amount required' });

    // Coupon tender — debit the coupon ledger atomically before recording the payment row.
    let actualReference = reference;
    if (String(paymentTypeCode).toUpperCase() === 'COUPON' || couponCode) {
      const code = String(couponCode || reference || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'couponCode is required for coupon payments' });
      const order = await Pos.getOrder(req.params.orderId);
      if (!order)  return res.status(404).json({ error: 'Order not found' });
      const Coupon = await import('../models/PosCouponModel.js');
      try {
        const r = await Coupon.redeemCoupon({
          code,
          requestedAmount: amount,
          orderNo:         order.orderNo,
          reference:       order.orderNo,
          performedBy:     req.user.userName || req.user.userId,
        });
        if (r.applied < Number(amount)) {
          return res.status(400).json({
            error: `Coupon ${code} only had ${r.applied} available — short of ${Number(amount) - r.applied}. Use a second tender for the balance.`,
            applied: r.applied, balance: r.balance,
          });
        }
        actualReference = code;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const paymentId = await Pos.checkoutOrder(req.params.orderId, {
      paymentTypeCode, paymentTypeName, amount, mobileNo,
      reference: actualReference,
    });
    ok(res, { paymentId });
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
}

export async function confirmPayment(req, res) {
  try {
    const orderId = await Pos.confirmPayment(req.params.paymentId, req.body.reference || null);

    // Best-effort: sign with eTIMS + print receipt (non-fatal)
    let etimsResult = null;
    let printOk     = false;
    try {
      const order = await Pos.getOrder(orderId);
      // Post stock movements for the sale (inventory ledger)
      try { await Stock.postSaleMovementsForOrder(order); }
      catch (movErr) { logger.error('stock movement post failed', { error: movErr.message }); }
      etimsResult = await signPosOrder(order);
      if (etimsResult) await Pos.storeSignResult(orderId, etimsResult);
      const fresh = await Pos.getOrder(orderId);
      const printRes = await printPosOrder(fresh, etimsResult);
      printOk = printRes.ok;
      if (printRes.fileName) await Pos.markPrinted(orderId, printRes.fileName);
    } catch (e) {
      logger.error('post-payment sign/print error', { error: e.message });
    }

    ok(res, {
      ok: true,
      orderId,
      etims:   etimsResult,
      printed: printOk,
    });
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
}

export async function printConfirmation(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const previewOnly = req.query.preview === '1' || req.body?.preview === true;
    const r = await printConfirmationReceipt(order, { previewOnly });
    if (r.fileName) await Pos.markPrinted(order.orderId, r.fileName);
    if (!previewOnly && r.fileName) await Pos.markConfirmationPrinted(order.orderId);
    ok(res, { ok: r.ok, fileName: r.fileName });
  } catch (e) { err(res, e); }
}

export async function stkPush(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { paymentTypeCode, mobileNo, amount } = req.body;
    if (!paymentTypeCode) return res.status(400).json({ error: 'paymentTypeCode required' });
    if (!mobileNo)        return res.status(400).json({ error: 'mobileNo required' });

    const types = await Pos.listPaymentTypes({ activeOnly: true, shopCode: order.shopCode });
    const pt = types.find(t => t.Code === String(paymentTypeCode).toUpperCase());
    if (!pt) return res.status(400).json({ error: `Unknown payment type ${paymentTypeCode}` });
    // STK requires either full Daraja credentials OR a custom proxy endpoint.
    const hasDaraja = pt.ConsumerKey && pt.ConsumerSecret && pt.ShortCode && pt.Passkey;
    if (!hasDaraja && !pt.ApiEndpoint) {
      return res.status(400).json({
        error: 'STK push is not configured for this payment method. ' +
               'Open Admin Setup → POS Setup → Payment Methods → edit MPESA → "Integration — STK push & payment fetch" ' +
               'and either fill in Daraja credentials (Consumer key, Consumer secret, Short code, Passkey) ' +
               'or set the API base URL of your proxy.',
      });
    }

    const result = await sendStkPush({
      order, paymentType: pt, mobileNo,
      amount: amount ?? order.totalAmount,
    });
    if (result.ok) await Pos.markStkPushSent(order.orderId, result.reference);

    // Wrapper-mode confirmPayment may have already locked the payment in.
    // If so, reconcile against the most recent pending payment row so the order moves to 'paid'.
    if (result.ok && result.confirmed && result.reference) {
      try {
        await Pos.confirmPaymentByReference({
          orderNoOrRef:    order.orderNo,
          paymentTypeCode: paymentTypeCode.toUpperCase(),
          reference:       result.reference,
          amount:          amount ?? order.totalAmount,
        });
      } catch (e) {
        logger.warn('auto-confirm after wrapper STK failed', { error: e.message, orderNo: order.orderNo });
      }
    }

    ok(res, result);
  } catch (e) { err(res, e); }
}

/**
 * Split-tender checkout. Body:
 *   { tenders: [ { paymentTypeCode, amount, mobileNo?, reference?, couponCode? } ] }
 *
 * Flow:
 *   1. Sum of tenders must equal the order total (allows up to 0.05 rounding slack).
 *   2. Stock pre-flight (assertOrderHasStock) runs before any payment side-effects.
 *   3. For COUPON tenders, atomically redeem the coupon ledger.
 *   4. Insert each payment row, confirm it, then mark the order paid.
 *   5. Best-effort sign + print (same as single confirmPayment).
 */
export async function checkoutMulti(req, res) {
  try {
    const tenders = Array.isArray(req.body?.tenders) ? req.body.tenders : null;
    if (!tenders || !tenders.length) {
      return res.status(400).json({ error: 'tenders[] required' });
    }
    const order = await Pos.getOrder(req.params.orderId);
    if (!order)                       return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'open')      return res.status(409).json({ error: `Order is already ${order.status}` });

    // Sum check (small tolerance for cent rounding)
    const sum = tenders.reduce((s, t) => s + Number(t.amount || 0), 0);
    const total = Number(order.totalAmount || 0);
    if (Math.round((sum - total) * 100) / 100 < -0.01) {
      return res.status(400).json({ error: `Tenders total ${sum.toFixed(2)} is less than order total ${total.toFixed(2)}` });
    }
    if (Math.round((sum - total) * 100) / 100 > 0.05) {
      // Allow overpay only for cash/coupon? For simplicity, accept and treat the surplus as change/discount —
      // the cashier sees the actual line totals. Reject very large overpays as a typo.
      if (sum > total * 1.5) return res.status(400).json({ error: `Tenders ${sum.toFixed(2)} far exceed order total ${total.toFixed(2)} — please re-check.` });
    }

    // Pre-flight: stock + coupon validation in one pass (so a failure short-circuits before any payment row exists)
    const Stock = await import('../models/PosStockModel.js');
    await Stock.assertOrderHasStock({ shopCode: order.shopCode, lines: order.lines });

    const Coupon = await import('../models/PosCouponModel.js');
    const couponDebits = []; // remember coupon redemptions so we can null-flip on failure (best-effort)

    const paymentIds = [];
    for (const t of tenders) {
      const code = String(t.paymentTypeCode || '').toUpperCase();
      if (!code)                          throw new Error('Each tender needs paymentTypeCode');
      const amt = Number(t.amount || 0);
      if (!isFinite(amt) || amt <= 0)     throw new Error(`Tender for ${code} must have positive amount`);

      // Coupon — debit the coupon ledger first
      let reference = t.reference || null;
      if (code === 'COUPON' || t.couponCode) {
        const couponCode = String(t.couponCode || t.reference || '').trim().toUpperCase();
        if (!couponCode) throw new Error('Coupon tender requires couponCode');
        const r = await Coupon.redeemCoupon({
          code: couponCode,
          requestedAmount: amt,
          orderNo:   order.orderNo,
          reference: order.orderNo + '/' + couponCode,
          performedBy: req.user.userName || req.user.userId,
        });
        if (r.applied < amt) throw new Error(`Coupon ${couponCode} only had ${r.applied}, short of ${amt - r.applied}.`);
        couponDebits.push({ couponCode, amt });
        reference = couponCode;
      }

      // Insert + confirm in two model calls
      const paymentId = await Pos.checkoutOrder(req.params.orderId, {
        paymentTypeCode: code,
        paymentTypeName: t.paymentTypeName || code,
        amount:          amt,
        mobileNo:        t.mobileNo || null,
        reference,
      });
      paymentIds.push(paymentId);
      // Re-open the order so the next tender doesn't fail the "must be open" check
      // (checkoutOrder flips it to 'checkout'; subsequent tenders need it back at 'open' for the
      // model's current single-tender guard). Use a direct UPDATE.
      const pool = await (await import('../db/pool.js')).db.getPool();
      await pool.request()
        .input('orderId', (await import('../db/pool.js')).sql.UniqueIdentifier, req.params.orderId)
        .query(`UPDATE [dbo].[PosOrder] SET [Status]='open' WHERE [OrderId]=@orderId`);
    }

    // Now confirm each payment (this also gates the stock check internally).
    let confirmedOrderId = null;
    for (const pid of paymentIds) {
      try {
        confirmedOrderId = await Pos.confirmPayment(pid, null);
      } catch (e) {
        // already confirmed (e.g. wrapper auto-confirm) is OK
        if (!/already confirmed/i.test(e.message)) throw e;
      }
    }

    // Best-effort: post stock, sign with eTIMS, print receipt — mirrors confirmPayment side-effects.
    let etimsResult = null;
    let printOk     = false;
    try {
      const fresh = await Pos.getOrder(req.params.orderId);
      try { await Stock.postSaleMovementsForOrder(fresh); }
      catch (movErr) { logger.error('stock movement post failed', { error: movErr.message }); }
      etimsResult = await signPosOrder(fresh);
      if (etimsResult) await Pos.storeSignResult(req.params.orderId, etimsResult);
      const printRes = await printPosOrder(fresh, etimsResult);
      printOk = printRes.ok;
      if (printRes.fileName) await Pos.markPrinted(req.params.orderId, printRes.fileName);
    } catch (sideErr) {
      logger.warn('post-checkout side-effects failed', { error: sideErr.message });
    }

    return ok(res, {
      orderId:    req.params.orderId,
      paymentIds,
      etims:      etimsResult,
      printed:    printOk,
    });
  } catch (e) {
    return err(res, e, 400);
  }
}

/**
 * GET /pos/payments/fetch?paymentTypeCode=MPESA&since=...&limit=...
 * Pulls recent payments from the configured PaymentFetchUrl and (optionally) auto-confirms
 * any pending order whose orderNo (or AccountReference) matches the payment.
 */
export async function fetchPayments(req, res) {
  try {
    const code = String(req.query.paymentTypeCode || '').toUpperCase();
    if (!code) return res.status(400).json({ error: 'paymentTypeCode required' });
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    const types = await Pos.listPaymentTypes({ activeOnly: true, shopCode });
    const pt = types.find(t => t.Code === code);
    if (!pt) return res.status(404).json({ error: `Unknown payment type ${code}` });
    if (!pt.PaymentFetchUrl) return res.status(400).json({ error: 'PaymentFetchUrl is not configured for this method' });

    const amount = req.query.amount != null && req.query.amount !== '' ? parseFloat(req.query.amount) : null;
    const searchCode = String(req.query.code || '').trim();   // confirmation-code fallback search
    const r = await fetchPaymentsFromService({
      paymentType: pt,
      params: {
        since:     req.query.since || undefined,
        limit:     req.query.limit || undefined,
        amount:    (!searchCode && amount != null && !isNaN(amount)) ? amount : undefined,
        code:      searchCode || undefined,
        reference: searchCode || undefined,
        shop:      shopCode || undefined,
      },
    });
    if (!r.ok) return res.status(502).json({ error: r.message, count: 0, payments: [] });

    // Defensive filter even if the upstream service ignores our params.
    // By code: match the confirmation number. By amount: exact-amount match.
    if (searchCode) {
      const cu = searchCode.toUpperCase();
      r.payments = (r.payments || []).filter(p => String(p.reference || '').toUpperCase().includes(cu));
      r.count = r.payments.length;
    } else if (amount != null && !isNaN(amount)) {
      r.payments = (r.payments || []).filter(p => Math.abs(Number(p.amount) - amount) < 0.5);
      r.count = r.payments.length;
    }

    // Optional auto-reconciliation (default: on). Match by orderNo / accountRef → confirm payment row.
    const reconcile = req.query.reconcile !== '0' && req.query.reconcile !== 'false';

    // Checkout-lookup mode (reconcile off): annotate each transaction with how much
    // of its amount is still available (full amount − already applied to invoices),
    // drop fully-used codes, and order latest first.
    if (!reconcile) {
      const codes = (r.payments || []).map(p => p.reference);
      const util  = await Pos.getMpesaUtilization(codes);
      r.payments = (r.payments || []).map(p => {
        const used = util[String(p.reference || '').toUpperCase()] || 0;
        const availableAmount = Math.round((Number(p.amount || 0) - used) * 100) / 100;
        return { ...p, appliedAmount: used, availableAmount };
      }).filter(p => p.availableAmount > 0.009)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      r.count = r.payments.length;
    }

    let matched = 0, unmatched = 0;
    if (reconcile) {
      for (const p of r.payments) {
        const ref = String(p.accountRef || '').trim();
        if (!ref) { unmatched++; continue; }
        try {
          const ok = await Pos.confirmPaymentByReference({
            orderNoOrRef:    ref,
            paymentTypeCode: code,
            reference:       p.reference,
            amount:          p.amount,
          });
          if (ok) matched++; else unmatched++;
        } catch { unmatched++; }
      }
    }
    ok(res, { ...r, matched, unmatched, reconciled: reconcile });
  } catch (e) { err(res, e); }
}

// POST /pos/orders/:orderId/mpesa-match  body: { matches:[{code,mpesaAmount,applied,phone,name,timestamp}] }
// Records the selected M-Pesa confirmation codes against this invoice (1→many).
export async function recordMpesaMatch(req, res) {
  try {
    const matches = Array.isArray(req.body?.matches) ? req.body.matches : null;
    if (!matches) return res.status(400).json({ error: 'matches array required' });
    const out = await Pos.recordMpesaApplications({
      orderId:   req.params.orderId,
      matches,
      createdBy: req.user?.userName || req.user?.userId || null,
    });
    ok(res, out);
  } catch (e) { err(res, e, 400); }
}

// GET /pos/reports/mpesa-invoices?from=&to=&shopCode=   (invoice → payments)
export async function mpesaInvoiceReport(req, res) {
  try {
    const shopCode = req.user?.role === 'admin' ? (req.query.shopCode || null)
                                                : await resolveShopCode(req.user.userId, req.user.role, req);
    ok(res, await Pos.mpesaInvoiceReport({ from: req.query.from, to: req.query.to, shopCode }));
  } catch (e) { err(res, e); }
}

// GET /pos/reports/mpesa-payments?from=&to=   (payment code → invoices, incl. partial)
export async function mpesaPaymentReport(req, res) {
  try {
    ok(res, await Pos.mpesaPaymentReport({ from: req.query.from, to: req.query.to }));
  } catch (e) { err(res, e); }
}

/**
 * Local mpesa fetch — mirrors order-invoice-service's /api/fetch-payments,
 * but adds a ?till=BusinessShortCode filter so each shop only sees its own till.
 *   GET /api/pos/payments/fetch-mpesa?till=12345&amount=350&limit=100&hours=24
 */
export async function fetchMpesaLocal(req, res) {
  try {
    const limit  = Math.max(1, Math.min(1000, parseInt(req.query.limit || '100')));
    const amount = req.query.amount != null && req.query.amount !== '' ? parseFloat(req.query.amount) : null;
    const till   = req.query.till ? String(req.query.till).trim() : null;
    const hours  = Math.max(1, Math.min(24 * 30, parseInt(req.query.hours || '24')));

    const pool = await ordersDb.getPool();
    const rq   = pool.request().input('hours', ordersSql.Int, hours);
    const conds = ['TransTime >= DATEADD(HOUR, -@hours, GETDATE())'];
    if (amount != null && !isNaN(amount)) {
      rq.input('amount', ordersSql.Decimal(18, 2), amount);
      conds.push('TransAmount = @amount');
    }
    if (till) {
      rq.input('till', ordersSql.NVarChar(20), till);
      conds.push('BusinessShortCode = @till');
    }
    const where = conds.join(' AND ');
    const r = await rq.query(`
      SELECT TOP ${limit}
        [id],[FirstName],[MiddleName],[LastName],[TransactionType],[TransID],[TransTime],
        [BusinessShortCode],[BillRefNumber],[InvoiceNumber],[ThirdPartyTransID],[MSISDN],
        [TransAmount],[OrgAccountBalance],[PaymentType],[is_claimed],[created_at],[updated_at]
      FROM   [dbo].[mpesa_transactions]
      WHERE  ${where}
      ORDER BY [TransTime] DESC
    `);
    return res.json({ success: true, count: r.recordset.length, payments: r.recordset });
  } catch (e) {
    logger.error('fetchMpesaLocal failed', { error: e.message });
    return res.status(500).json({ success: false, error: e.message, count: 0, payments: [] });
  }
}

/**
 * Public Daraja STK callback. Body shape (Safaricom):
 *   { Body: { stkCallback: { ResultCode, ResultDesc, CheckoutRequestID,
 *                            CallbackMetadata: { Item: [{Name,Value}] } } } }
 */
export async function mpesaCallback(req, res) {
  try {
    const cb  = req.body?.Body?.stkCallback;
    if (!cb) return res.json({ ResultCode: 0, ResultDesc: 'Ignored' });
    if (cb.ResultCode !== 0) {
      logger.warn('Daraja STK callback failure', { rc: cb.ResultCode, desc: cb.ResultDesc, id: cb.CheckoutRequestID });
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
    const items   = cb.CallbackMetadata?.Item || [];
    const lookup  = (n) => items.find(i => i.Name === n)?.Value;
    const mref    = lookup('MpesaReceiptNumber');
    const acctRef = String(lookup('AccountReference') || cb.CheckoutRequestID || '').trim();
    const amount  = Number(lookup('Amount') || 0);
    if (acctRef) {
      try {
        await Pos.confirmPaymentByReference({
          orderNoOrRef:    acctRef,
          paymentTypeCode: 'MPESA',
          reference:       mref || cb.CheckoutRequestID,
          amount,
        });
      } catch (e) {
        logger.warn('Daraja callback reconcile failed', { error: e.message, acctRef });
      }
    }
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (e) {
    logger.error('Daraja callback exception', { error: e.message });
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });   // never 4xx Safaricom
  }
}

export async function saveCart(req, res) {
  try {
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: 'label required' });
    await Pos.saveAbandonedCart(req.params.orderId, label);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}
export async function resumeCart(req, res) {
  try {
    await Pos.resumeAbandonedCart(req.params.orderId);
    const order = await Pos.getOrder(req.params.orderId);
    ok(res, order);
  } catch (e) { err(res, e, 400); }
}

export async function reprintOrder(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const etimsResult = order.etimsInvoiceNo ? {
      etimsInvoiceNo: order.etimsInvoiceNo,
      cuSerialNo:     order.cuSerialNo,
      qrUrl:          order.qrUrl,
      signedAt:       order.signedAt,
    } : null;
    const printRes = await printPosOrder(order, etimsResult);
    if (printRes.fileName) await Pos.markPrinted(order.orderId, printRes.fileName);
    ok(res, { printed: printRes.ok, fileName: printRes.fileName });
  } catch (e) { err(res, e); }
}

export async function getOrderPdf(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let fileName = order.pdfFileName;
    let filePath = fileName ? pdfPathFor(fileName) : null;

    // Regenerate on demand if missing or file deleted
    if (!fileName || !filePath || !fs.existsSync(filePath)) {
      const etimsResult = order.etimsInvoiceNo ? {
        etimsInvoiceNo: order.etimsInvoiceNo,
        cuSerialNo:     order.cuSerialNo,
        qrUrl:          order.qrUrl,
        signedAt:       order.signedAt,
      } : null;
      const payload = await buildPrintPayload(order, etimsResult);
      fileName = await generateInvoicePdf(payload);
      filePath = pdfPathFor(fileName);
      await Pos.markPrinted(order.orderId, fileName);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${order.orderNo}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { err(res, e); }
}

export async function previewEtimsPayload(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    ok(res, await validateEtimsReadiness(order));
  } catch (e) { err(res, e); }
}

export async function signOrder(req, res) {
  try {
    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be signed' });
    if (order.etimsInvoiceNo)    return res.status(400).json({ error: 'Order already signed' });
    const result = await signPosOrder(order);
    if (!result) return res.status(502).json({ error: 'eTIMS signing failed — check logs' });
    await Pos.storeSignResult(order.orderId, result);
    ok(res, { etims: result });
  } catch (e) { err(res, e); }
}

export async function signCreditMemo(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
    const adminPin = String(req.body?.adminPin || '');
    if (!adminPin) return res.status(400).json({ error: 'Admin PIN required' });
    await Pos.verifyAdminPin(req.user.userId, adminPin);

    const order = await Pos.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be credit-memo signed' });
    if (!order.etimsInvoiceNo && !order.etimsNo) {
      return res.status(400).json({ error: 'Original eTIMS invoice must be signed before credit memo signing' });
    }

    const result = await signPosCreditMemo(order, { reason: req.body?.reason || 'RETURN' });
    ok(res, { ok: true, creditMemo: result });
  } catch (e) { err(res, e, /required|invalid|not found|only paid/i.test(e.message) ? 400 : 500); }
}

export async function syncFromBc(req, res) {
  try {
    const company = req.body.company || 'FCL';
    const result  = await Pos.syncMasterFromBc(company);
    ok(res, result);
  } catch (e) { err(res, e); }
}

// ── Cashier ↔ Shops admin ────────────────────────────────────────────────────

export async function listCashiersWithShops(_req, res) {
  try { ok(res, await Pos.listUsersWithShops()); }
  catch (e) { err(res, e); }
}

export async function getCashierShops(req, res) {
  try { ok(res, await Pos.listUserShops(req.params.userId)); }
  catch (e) { err(res, e); }
}

export async function setCashierShops(req, res) {
  try {
    const result = await Pos.setUserShops(req.params.userId, req.body?.shops || []);
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

/** Per-step BC sync. POST /pos/setup/sync-from-bc/:kind  body: { company, wipe? } */
export async function syncStepFromBc(req, res) {
  try {
    const company = req.body?.company || 'FCL';
    const wipe    = !!req.body?.wipe;
    const kind    = String(req.params.kind || '').toLowerCase();
    const stepFns = {
      'shops':           (c) => Pos.syncShopsFromBc(c, { wipe }),
      'walk-ins':        (c) => Pos.syncWalkInCustomersFromBc(c),
      'walkins':         (c) => Pos.syncWalkInCustomersFromBc(c),
      'contacts':        (c) => Pos.syncContactsFromBc(c),
      'categories':      (c) => Pos.syncCategoriesFromBc(c),
      'items':           (c) => Pos.syncItemsFromBc(c, { wipe }),
      'payment-types':   (c) => Pos.syncPaymentTypesFromBc(c),
      'paymenttypes':    (c) => Pos.syncPaymentTypesFromBc(c),
      'shop-prices':     (c) => Pos.syncShopPricesFromBc(c),
      'shopprices':      (c) => Pos.syncShopPricesFromBc(c),
    };
    const fn = stepFns[kind];
    if (!fn) {
      return res.status(400).json({
        error: `Unknown sync step "${kind}". Use one of: shops, walk-ins, contacts, categories, items, payment-types, shop-prices`,
      });
    }
    const result = await fn(company);
    ok(res, { kind, ...result });
  } catch (e) { err(res, e); }
}

export async function cancelOrder(req, res) {
  try {
    await Pos.cancelOrder(req.params.orderId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
}

export async function setOrderContact(req, res) {
  try {
    const { contactNo, contactName, contactPhone, contactPin } = req.body;
    await Pos.setOrderContact(req.params.orderId, { contactNo, contactName, contactPhone, contactPin });
    ok(res, { ok: true });
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
}

export async function completeOrder(req, res) {
  try {
    await Pos.completeOrder(req.params.orderId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
}

// ── Contacts (walk-in customers) ──────────────────────────────────────────────

export async function listContacts(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    const all = await Pos.listContacts({ shopCode, activeOnly: true });
    // Walk-ins are umbrella accounts shown separately; exclude from selectable list
    ok(res, all.filter(c => !c.IsWalkIn));
  } catch (e) { err(res, e); }
}

export async function getMyWalkIn(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    if (!shopCode) return ok(res, null);
    ok(res, await Pos.getWalkInForShop(shopCode));
  } catch (e) { err(res, e); }
}

export async function createContact(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    if (!shopCode) return res.status(400).json({ error: 'No shop assigned/selected' });
    const walkIn = await Pos.getWalkInForShop(shopCode);
    const result = await Pos.createSubContact({
      shopCode,
      salespersonCode: walkIn?.SalespersonCode || null,
      parentContactNo: walkIn?.BcContactNo     || null,
      name:     req.body.name,
      mobileNo: req.body.mobileNo,
      kraPin:   req.body.kraPin,
      email:    req.body.email,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

// ── Terminal: favourites (per-user) ──────────────────────────────────────────

export async function listFavourites(req, res) {
  try { ok(res, await Pos.listFavourites(req.user.userId)); } catch (e) { err(res, e); }
}

export async function addFavourite(req, res) {
  try {
    if (!req.body.itemNo) return res.status(400).json({ error: 'itemNo required' });
    await Pos.addFavourite(req.user.userId, req.body.itemNo);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

export async function removeFavourite(req, res) {
  try {
    await Pos.removeFavourite(req.user.userId, req.params.itemNo);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

// ── Terminal: price list PDF (per shop) ──────────────────────────────────────

export async function getPriceListPdf(req, res) {
  try {
    const shopCode = await resolveShopCode(req.user.userId, req.user.role, req);
    const groups   = await Pos.listPosItemsGrouped({ shopCode, userId: req.user.userId });
    const shops    = shopCode ? await Pos.listShops() : [];
    const shopName = shops.find(s => s.Code === shopCode)?.Name || (shopCode ? shopCode : 'All Shops');
    // Drop the "Favourites" virtual category from the price list
    const printable = groups.filter(g => g.code !== '__favourites__').map(g => ({
      name:  g.name,
      items: g.items.map(i => ({
        itemNo:           i.itemNo,
        description:      i.description,
        unitOfMeasure:    i.unitOfMeasure,
        basePrice:        i.basePrice ?? i.unitPrice,
        offerPrice:       i.offerPrice,
        offerDescription: i.offerDescription,
      })),
    }));
    const fileName = await generatePriceListPdf({ shopName, groups: printable });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    fs.createReadStream(pdfPathFor(fileName)).pipe(res);
  } catch (e) { err(res, e); }
}

// ── Terminal: shops list (admin shop selector) ───────────────────────────────

export async function listShopsForTerminal(req, res) {
  try { ok(res, await Pos.listShops({ activeOnly: true })); } catch (e) { err(res, e); }
}

// ── Admin setup: special prices ──────────────────────────────────────────────

export async function listSpecialPrices(req, res) {
  try {
    const { page, pageSize, q } = req.query;
    ok(res, await Pos.listSpecialPrices({ page, pageSize, q }));
  } catch (e) { err(res, e); }
}

export async function saveSpecialPrice(req, res) {
  try {
    const id = await Pos.saveSpecialPrice({ specialPriceId: req.params.specialPriceId || null, ...req.body });
    ok(res, { specialPriceId: id });
  } catch (e) { err(res, e); }
}

export async function deleteSpecialPrice(req, res) {
  try {
    await Pos.deleteSpecialPrice(req.params.specialPriceId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

export async function importSpecialPricesBatch(req, res) {
  try {
    if (!Array.isArray(req.body?.rows) || !req.body.rows.length) {
      return res.status(400).json({ error: 'rows array required' });
    }
    const result = await Pos.importSpecialPricesBatch({
      rows:      req.body.rows,
      createdBy: req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

/** GET /pos/setup/special-prices.csv — full table as CSV (BC-friendly column names). */
export async function exportSpecialPricesCsv(_req, res) {
  try {
    const rows = await Pos.listSpecialPrices();
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmtDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    const header  = ['ItemNo','ItemDescription','ShopCode','UnitPrice','StartingDate','EndingDate','Description','IsActive'];
    let csv = '﻿' + header.join(',') + '\r\n';   // UTF-8 BOM for Excel
    for (const r of rows) {
      csv += [r.ItemNo, r.ItemDescription, r.ShopCode, r.UnitPrice,
              fmtDate(r.StartingDate), fmtDate(r.EndingDate),
              r.Description, r.IsActive ? 1 : 0].map(esc).join(',') + '\r\n';
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="special-prices-${stamp}.csv"`);
    return res.send(csv);
  } catch (e) { err(res, e); }
}

/** GET /pos/setup/special-prices/template.csv — empty template with headers + one example row. */
export async function specialPricesTemplate(_req, res) {
  const csv = '﻿' +
    'ItemNo,ShopCode,UnitPrice,StartingDate,EndingDate,Description,IsActive\r\n' +
    'KG-FIL-RIB,NRB-A,580,2026-04-29,2026-05-31,Weekend ribs offer,1\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="special-prices-template.csv"');
  return res.send(csv);
}

// ── Admin setup: eTIMS config (per shop) ────────────────────────────────────

export async function getEtimsCfg(req, res) {
  try {
    const shopCode = req.query.shopCode || null;
    ok(res, await Pos.getEtimsConfig(shopCode));
  } catch (e) { err(res, e); }
}

export async function saveEtimsCfg(req, res) {
  try {
    const { shopCode = null, ...cfg } = req.body || {};
    const saved = await Pos.saveEtimsConfig(shopCode, cfg);
    invalidateEtimsCache();
    ok(res, saved);
  } catch (e) { err(res, e); }
}

export async function getEtimsBcDefaults(req, res) {
  try {
    const company = req.query.company || 'FCL';
    const result = await Pos.fetchBcEtimsDefaults(company);
    if (!result) return res.status(404).json({ error: 'BC FCL Integration Setup not found / unreadable' });
    ok(res, result);
  } catch (e) { err(res, e); }
}

// ── Admin setup: inventory display (item-card on-hand + auto-hide) ─────────

export async function getInventoryCfg(_req, res) {
  try { ok(res, await Pos.getInventoryConfig()); }
  catch (e) { err(res, e); }
}
export async function saveInventoryCfg(req, res) {
  try {
    const saved = await Pos.saveInventoryConfig({
      hideOutOfStock: !!req.body?.hideOutOfStock,
    });
    ok(res, saved);
  } catch (e) { err(res, e); }
}

// ── Admin setup: print config (per shop) ────────────────────────────────────

export async function getPrintCfg(req, res) {
  try {
    const shopCode = req.query.shopCode || null;
    ok(res, await Pos.getPrintConfig(shopCode));
  } catch (e) { err(res, e); }
}

export async function savePrintCfg(req, res) {
  try {
    const { shopCode = null, ...cfg } = req.body || {};
    const saved = await Pos.savePrintConfig(shopCode, cfg);
    invalidatePrintCache();
    ok(res, saved);
  } catch (e) { err(res, e); }
}

export async function listPrinters(req, res) {
  try { ok(res, await listInstalledPrinters()); } catch (e) { err(res, e); }
}

// ── Admin setup: VAT rates ────────────────────────────────────────────────────

export async function listVatRates(req, res) {
  try { ok(res, await Pos.listVatRates()); } catch (e) { err(res, e); }
}

export async function saveVatRate(req, res) {
  try {
    const id = await Pos.saveVatRate({ vatRateId: req.params.vatRateId || null, ...req.body });
    ok(res, { vatRateId: id });
  } catch (e) { err(res, e); }
}

export async function deleteVatRate(req, res) {
  try {
    await Pos.deleteVatRate(req.params.vatRateId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

// ── Admin setup: shops ────────────────────────────────────────────────────────

export async function listShops(req, res) {
  try { ok(res, await Pos.listShops()); } catch (e) { err(res, e); }
}

export async function saveShop(req, res) {
  try {
    const id = await Pos.saveShop({ shopId: req.params.shopId || null, ...req.body });
    ok(res, { shopId: id });
  } catch (e) { err(res, e); }
}

export async function deleteShop(req, res) {
  try {
    await Pos.deleteShop(req.params.shopId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

// ── Admin setup: categories ───────────────────────────────────────────────────

export async function listCategories(req, res) {
  try { ok(res, await Pos.listCategories()); } catch (e) { err(res, e); }
}

export async function saveCategory(req, res) {
  try {
    const id = await Pos.saveCategory({ categoryId: req.params.categoryId || null, ...req.body });
    ok(res, { categoryId: id });
  } catch (e) { err(res, e); }
}

export async function deleteCategory(req, res) {
  try {
    await Pos.deleteCategory(req.params.categoryId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

// ── Admin setup: items ────────────────────────────────────────────────────────

export async function listSetupItems(req, res) {
  try {
    const { page, pageSize, q } = req.query;
    ok(res, await Pos.listPosItems({ page, pageSize, q }));
  } catch (e) { err(res, e); }
}

// POST /pos/setup/items/:itemId/photo  body: { photoBase64, photoMime }
// Writes the image under server/uploads/items and stores /api/uploads/items/<file> on the item.
const ITEM_IMG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/items');
const PHOTO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export async function uploadItemPhoto(req, res) {
  try {
    const { itemId } = req.params;
    const { photoBase64, photoMime } = req.body || {};
    if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
    const ext = PHOTO_EXT[String(photoMime || '').toLowerCase()];
    if (!ext) return res.status(400).json({ error: 'photoMime must be png, jpeg, webp, or gif' });
    const cleaned = String(photoBase64).replace(/^data:[^;]+;base64,/, '');
    let buf;
    try { buf = Buffer.from(cleaned, 'base64'); } catch { return res.status(400).json({ error: 'invalid base64' }); }
    if (!buf.length) return res.status(400).json({ error: 'empty image' });
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'image exceeds 5MB' });

    fs.mkdirSync(ITEM_IMG_DIR, { recursive: true });
    const fname = `${String(itemId).replace(/[^a-zA-Z0-9-]/g, '')}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(ITEM_IMG_DIR, fname), buf);
    const url = `/api/uploads/items/${fname}`;
    await Pos.setItemImageUrl(itemId, url);
    ok(res, { imageUrl: url });
  } catch (e) { err(res, e); }
}

export async function listBcItems(req, res) {
  try {
    const company = req.query.company || 'FCL';
    const shopCode = req.query.shopCode || null;
    ok(res, await Pos.listBcPdaItems(company, shopCode));
  } catch (e) { err(res, e); }
}

export async function listBcContacts(req, res) {
  try {
    const company         = req.query.company || 'FCL';
    const salespersonCode = req.query.salespersonCode || '';
    if (!salespersonCode) return res.status(400).json({ error: 'salespersonCode required' });
    ok(res, await Pos.listBcShopContacts(company, salespersonCode));
  } catch (e) { err(res, e); }
}

export async function listBcSalespersons(req, res) {
  try {
    const company = req.query.company || 'FCL';
    ok(res, await Pos.listBcSalespersons(company));
  } catch (e) { err(res, e); }
}

// GET /pos/setup/bc-salespersons/:code/signature — Dept Signature image (base64).
export async function getSalespersonSignature(req, res) {
  try {
    const company = req.query.company || 'FCL';
    const sig = await Pos.getSalespersonSignature(company, req.params.code);
    if (!sig) return res.status(404).json({ error: 'No signature on file' });
    ok(res, sig);
  } catch (e) { err(res, e); }
}

export async function importContacts(req, res) {
  try {
    const { contacts, shopCode } = req.body;
    if (!Array.isArray(contacts) || !contacts.length) return res.status(400).json({ error: 'contacts array required' });
    const count = await Pos.upsertContacts(contacts, shopCode || null);
    ok(res, { imported: count });
  } catch (e) { err(res, e); }
}

export async function listSetupContacts(req, res) {
  try {
    const { page, pageSize, q } = req.query;
    ok(res, await Pos.listContacts({ activeOnly: false, page, pageSize, q }));
  } catch (e) { err(res, e); }
}

export async function deleteSetupContact(req, res) {
  try {
    await Pos.deleteContact(req.params.contactId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function saveItem(req, res) {
  try {
    const id = await Pos.savePosItem({ itemId: req.params.itemId || null, ...req.body });
    ok(res, { itemId: id });
  } catch (e) { err(res, e); }
}

export async function deleteItem(req, res) {
  try {
    await Pos.deletePosItem(req.params.itemId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

// ── Admin setup: payment types ────────────────────────────────────────────────

export async function listSetupPaymentTypes(req, res) {
  try { ok(res, await Pos.listPaymentTypes()); } catch (e) { err(res, e); }
}

export async function savePaymentType(req, res) {
  try {
    const id = await Pos.savePaymentType({ typeId: req.params.typeId || null, ...req.body });
    ok(res, { typeId: id });
  } catch (e) { err(res, e); }
}

export async function deletePaymentType(req, res) {
  try {
    await Pos.deletePaymentType(req.params.typeId);
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}
