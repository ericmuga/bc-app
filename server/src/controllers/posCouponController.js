/**
 * controllers/posCouponController.js
 * Coupons CRUD-ish + redemption + PDF + email.
 */
import fs from 'fs';
import * as Coupon from '../models/PosCouponModel.js';
import { generateCouponPdf } from '../services/posCouponPdf.js';
import { sendEmail } from '../services/email.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos-coupon error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

export async function listCoupons(req, res) {
  try {
    ok(res, await Coupon.listCoupons({
      status:   req.query.status   || null,
      q:        req.query.q        || null,
      dateFrom: req.query.dateFrom || null,
      dateTo:   req.query.dateTo   || null,
    }));
  } catch (e) { err(res, e); }
}

export async function getCoupon(req, res) {
  try {
    const cp = await Coupon.getCouponByCode(req.params.code);
    if (!cp) return res.status(404).json({ error: 'Coupon not found' });
    ok(res, cp);
  } catch (e) { err(res, e); }
}

export async function listLedger(req, res) {
  try { ok(res, await Coupon.listLedger(req.params.code)); }
  catch (e) { err(res, e); }
}

export async function issueCoupon(req, res) {
  try {
    const cp = await Coupon.issueCoupon({
      faceValue:    req.body.faceValue,
      contactName:  req.body.contactName,
      contactEmail: req.body.contactEmail,
      contactPhone: req.body.contactPhone,
      shopCode:     req.body.shopCode,
      expiresAt:    req.body.expiresAt,
      notes:        req.body.notes,
      code:         req.body.code,        // optional caller-supplied
      createdBy:    req.user.userName || req.user.userId,
    });
    ok(res, cp);
  } catch (e) { err(res, e, 400); }
}

/**
 * Redeem against an order. Body: { orderNo, amount, reference? }.
 * If `reference` is omitted, the orderNo is used so a retry stays idempotent.
 */
export async function redeemCoupon(req, res) {
  try {
    const result = await Coupon.redeemCoupon({
      code:             req.params.code,
      requestedAmount:  req.body.amount,
      orderNo:          req.body.orderNo,
      reference:        req.body.reference || req.body.orderNo,
      performedBy:      req.user.userName || req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

export async function voidCoupon(req, res) {
  try {
    const cp = await Coupon.voidCoupon({
      code:        req.params.code,
      notes:       req.body?.notes,
      performedBy: req.user.userName || req.user.userId,
    });
    ok(res, cp);
  } catch (e) { err(res, e, 400); }
}

export async function couponPdf(req, res) {
  try {
    const cp = await Coupon.getCouponByCode(req.params.code);
    if (!cp) return res.status(404).json({ error: 'Coupon not found' });
    const { filePath, fileName } = await generateCouponPdf(cp);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return fs.createReadStream(filePath).pipe(res);
  } catch (e) { err(res, e); }
}

export async function emailCoupon(req, res) {
  try {
    const cp = await Coupon.getCouponByCode(req.params.code);
    if (!cp) return res.status(404).json({ error: 'Coupon not found' });
    const to = req.body?.to || cp.ContactEmail;
    if (!to) return res.status(400).json({ error: 'No recipient — pass `to` in body or set ContactEmail on the coupon.' });

    const { filePath, fileName } = await generateCouponPdf(cp);
    const buf = fs.readFileSync(filePath);

    const subject = `Your gift coupon — ${cp.Currency || 'KES'} ${Number(cp.FaceValue).toFixed(2)}`;
    const validity = cp.ExpiresAt
      ? `Valid until ${new Date(cp.ExpiresAt).toISOString().slice(0, 10)}.`
      : 'No expiry date.';
    const html = `
      <p>Hi ${cp.ContactName || 'there'},</p>
      <p>Here is your coupon. Present it at the till — staff will scan or key in the code.</p>
      <p style="font:bold 20px monospace">Code: ${cp.Code}</p>
      <p>Face value: <strong>${cp.Currency || 'KES'} ${Number(cp.FaceValue).toFixed(2)}</strong><br/>
         Current balance: <strong>${cp.Currency || 'KES'} ${Number(cp.Balance).toFixed(2)}</strong><br/>
         ${validity}</p>
      ${req.body?.message ? `<p>${String(req.body.message).replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c]))}</p>` : ''}
      <p>Thank you.</p>
    `;
    await sendEmail({
      to,
      subject,
      html,
      text: `Coupon ${cp.Code} — face value ${cp.Currency || 'KES'} ${Number(cp.FaceValue).toFixed(2)}, balance ${Number(cp.Balance).toFixed(2)}. ${validity}`,
      attachments: [{ filename: fileName, content: buf, contentType: 'application/pdf' }],
    });
    ok(res, { ok: true, sentTo: to });
  } catch (e) { err(res, e, 400); }
}
