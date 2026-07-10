/**
 * services/posReceiptService.js
 * Sign POS orders with eTIMS (KRA) and dispatch them to the printing service.
 * Both operations are best-effort — failures are logged but never block payment confirmation.
 */
import logger from './logger.js';
import { generateInvoicePdf, pdfPathFor } from './posPdfService.js';
import { generateThermalInvoicePdf } from './posThermalPdfService.js';
import { getPrintConfig, getEtimsConfig } from '../models/PosModel.js';
import pkg from 'pdf-to-printer';
const { print: sendToPrinter, getPrinters } = pkg;

const PRINT_SERVICE_URL = process.env.PRINT_SERVICE_URL || 'http://localhost:3002';

// 30-second cache for eTIMS config, keyed by shop code (DB-backed).
const _etimsCache = new Map();   // shopCode → { cfg, at }
async function loadEtims(shopCode = null, force = false) {
  const key = (shopCode || '_GLOBAL_').toUpperCase();
  const now = Date.now();
  const hit = _etimsCache.get(key);
  if (!force && hit && (now - hit.at) < 30_000) return hit.cfg;

  // Try the shop-specific config first; fall back to global, then env
  const shopCfg   = shopCode ? await getEtimsConfig(shopCode) : null;
  const globalCfg = await getEtimsConfig(null);
  const merged = {
    invoiceUrl:    shopCfg?.invoiceUrl    || globalCfg.invoiceUrl    || process.env.ETIMS_INVOICE_URL    || '',
    invoiceNumUrl: shopCfg?.invoiceNumUrl || globalCfg.invoiceNumUrl || process.env.ETIMS_INVNUM_URL     || '',
    creditNoteUrl: shopCfg?.creditNoteUrl || globalCfg.creditNoteUrl || process.env.ETIMS_CREDIT_NOTE_URL|| '',
    apiKey:        shopCfg?.apiKey        || globalCfg.apiKey        || process.env.ETIMS_API_KEY        || '',
    branchId:      shopCfg?.branchId      || globalCfg.branchId      || process.env.ETIMS_BRANCH_ID      || '00',
    companyPin:    shopCfg?.companyPin    || globalCfg.companyPin    || process.env.COMPANY_PIN          || '',
    qrServiceUrl:  shopCfg?.qrServiceUrl  || globalCfg.qrServiceUrl  || '',
    paymentService:shopCfg?.paymentService|| globalCfg.paymentService|| '',
  };
  _etimsCache.set(key, { cfg: merged, at: now });
  return merged;
}
export function invalidateEtimsCache() { _etimsCache.clear(); }

// Per-shop print config cache
const _printCache = new Map();
async function loadPrint(shopCode = null, force = false) {
  const key = (shopCode || '_GLOBAL_').toUpperCase();
  const now = Date.now();
  const hit = _printCache.get(key);
  if (!force && hit && (now - hit.at) < 30_000) return hit.cfg;

  const shopCfg   = shopCode ? await getPrintConfig(shopCode) : null;
  const globalCfg = await getPrintConfig(null);
  const merged = {
    format:         shopCfg?.format         || globalCfg.format         || 'a4',
    invoicePrinter: shopCfg?.invoicePrinter || globalCfg.invoicePrinter || '',
    thermalWidthMm: shopCfg?.thermalWidthMm || globalCfg.thermalWidthMm || 72,
    copies:         shopCfg?.copies         || globalCfg.copies         || 1,
  };
  _printCache.set(key, { cfg: merged, at: now });
  return merged;
}
export function invalidatePrintCache() { _printCache.clear(); }

async function getNextEtimsNumber(cfg) {
  if (!cfg.invoiceNumUrl) throw new Error('eTIMS InvoiceNum URL not configured');
  const res = await fetch(cfg.invoiceNumUrl, {
    headers: { 'X-API-Key': cfg.apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`eTIMS num service ${res.status}`);
  const data = await res.json();
  if (!data.next) throw new Error('eTIMS num response missing "next"');
  return String(data.next);
}

function responseData(body) {
  return body?.data || body || {};
}

function etimsResponseData(data) {
  return data?.etimsResponse?.data || data?.etimsResponse || {};
}

function paymentSummary(order) {
  const total = Number(order?.totalAmount || 0);
  const lines = (order?.payments || [])
    .filter(p => p && p.status !== 'void')
    .map(p => {
      const code = String(p.paymentTypeCode || '').toUpperCase();
      const reference = String(p.reference || '').trim();
      const isCoupon = code === 'COUPON';
      return {
        mode: isCoupon ? 'Coupon' : (p.paymentTypeName || p.paymentTypeCode || 'Payment'),
        amount: Number(p.amount || 0),
        reference,
        mobileNo: p.mobileNo || '',
        couponCode: isCoupon ? reference : '',
        isCoupon,
      };
    });
  const amountPaid = lines.reduce((s, p) => s + Number(p.amount || 0), 0);
  return {
    lines,
    amountPaid,
    changeGiven: Math.max(0, Math.round((amountPaid - total) * 100) / 100),
  };
}

/**
 * Build the exact eTIMS payload for an order without sending it.
 * Useful for the dry-run / payload-tester UI.
 */
export async function buildEtimsPayload(order, etimsNo = null) {
  const cfg = await loadEtims(order?.shopCode);
  const payments = paymentSummary(order);
  return {
    businessPin:       cfg.companyPin,
    branchId:          cfg.branchId,
    invoiceNumber:     etimsNo || '<assigned at send-time>',
    traderInvoiceNo:   order.orderNo,
    customer: {
      name:    order.contactName || 'Walk-in',
      pin:     order.contactPin  || '',
      mobile:  order.contactPhone || '',
      address: '',
    },
    items: (order.lines || []).map(l => ({
      itemCode:      l.etimsItemCode      || '',
      itemClassCode: l.etimsItemClassCode || '',
      itemName:      String(l.description || '').slice(0, 42),
      quantity:      Number(l.quantity),
      price:         Number(l.unitPrice),
      taxType:       l.taxType        || 'A',
      packageUnit:   l.unitOfMeasure  || 'EA',
      quantityUnit:  l.unitOfMeasure  || 'EA',
    })),
    paymentInfo: {
      amountPaid:   payments.amountPaid || Number(order.totalAmount),
      changeGiven:  payments.changeGiven,
      paymentModes: payments.lines.length
        ? payments.lines.map(p => ({ mode: p.mode, amount: p.amount }))
        : [{ mode: 'Cash', amount: Number(order.totalAmount) }],
    },
    remark: `POS Sale - ${order.orderNo}`,
  };
}

export async function buildEtimsCreditMemoPayload(order, { creditNoteNumber, reason = 'RETURN' } = {}) {
  const cfg = await loadEtims(order?.shopCode);
  return {
    originalInvoiceNumber: order.etimsNo || order.etimsInvoiceNo || '',
    businessPin:           cfg.companyPin,
    branchId:              cfg.branchId,
    creditNoteNumber:      creditNoteNumber || '<assigned at send-time>',
    traderInvoiceNo:       `CN${order.orderNo}`,
    customer: {
      name:    order.contactName || 'Walk-in',
      pin:     order.contactPin  || '',
      mobile:  order.contactPhone || '',
      address: '',
    },
    items: (order.lines || []).map(l => ({
      itemCode:      l.etimsItemCode      || '',
      itemClassCode: l.etimsItemClassCode || '',
      itemName:      String(l.description || '').slice(0, 42),
      quantity:      Number(l.quantity),
      price:         Number(l.unitPrice),
      taxType:       l.taxType        || 'A',
      packageUnit:   l.unitOfMeasure  || 'EA',
      quantityUnit:  l.unitOfMeasure  || 'EA',
    })),
    reason: String(reason || 'RETURN').slice(0, 50),
  };
}

/**
 * Validate eTIMS-readiness without sending. Returns { ok, issues, payload }.
 */
export async function validateEtimsReadiness(order) {
  const cfg = await loadEtims(order?.shopCode);
  const issues = [];
  if (!cfg.invoiceUrl)    issues.push('eTIMS Invoice URL not configured (POS Setup → eTIMS Integration)');
  if (!cfg.invoiceNumUrl) issues.push('eTIMS InvoiceNum URL not configured');
  if (!cfg.apiKey)        issues.push('eTIMS API Key not configured');
  if (!cfg.companyPin)    issues.push('Company PIN not configured');
  if (!order?.orderNo)    issues.push('Order has no orderNo');
  if (!order?.lines?.length) issues.push('Order has no lines');
  for (const l of (order?.lines ?? [])) {
    if (!l.etimsItemCode)      issues.push(`Line ${l.itemNo}: missing eTIMS Item Code`);
    if (!l.etimsItemClassCode) issues.push(`Line ${l.itemNo}: missing Item Class code`);
    if (!l.taxType)            issues.push(`Line ${l.itemNo}: missing tax type (default 'A' will be used)`);
  }
  return { ok: issues.length === 0, issues, payload: await buildEtimsPayload(order) };
}

/**
 * Sign a POS order with eTIMS.
 * Returns { etimsInvoiceNo, cuSerialNo, qrUrl, signedAt } on success or null on failure.
 */
export async function signPosOrder(order) {
  const cfg = await loadEtims(order?.shopCode);
  if (!cfg.invoiceUrl || !cfg.apiKey) {
    logger.warn('eTIMS not configured — skipping sign', { orderNo: order.orderNo });
    return null;
  }
  if (!cfg.companyPin) {
    logger.warn('Company PIN not set — skipping sign', { orderNo: order.orderNo });
    return null;
  }

  try {
    const etimsNo = await getNextEtimsNumber(cfg);
    const payload = await buildEtimsPayload(order, etimsNo);

    logger.info('eTIMS sign request', { orderNo: order.orderNo, etimsNo });

    const res = await fetch(cfg.invoiceUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eTIMS HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = await res.json();
    if (!body?.success) throw new Error(`eTIMS rejected: ${JSON.stringify(body).slice(0, 300)}`);

    const data    = responseData(body);
    const etimsRs = etimsResponseData(data);

    return {
      etimsNo:        etimsNo,
      etimsInvoiceNo: data.CuInvoiceNumber || data.cuInvoiceNumber || '',
      cuSerialNo:     etimsRs.mrcNo || '',
      qrUrl:          data.qrData || data.qrUrl || '',
      signedAt:       new Date().toISOString(),
    };
  } catch (e) {
    logger.error('eTIMS sign failed', { orderNo: order.orderNo, error: e.message });
    return null;
  }
}

export async function signPosCreditMemo(order, { reason = 'RETURN' } = {}) {
  const cfg = await loadEtims(order?.shopCode);
  if (!cfg.creditNoteUrl || !cfg.apiKey) throw new Error('eTIMS Credit Note URL/API key not configured');
  if (!cfg.companyPin) throw new Error('Company PIN not configured');
  if (!order?.etimsInvoiceNo && !order?.etimsNo) throw new Error('Original eTIMS invoice number is required before credit memo signing');

  const creditNoteNumber = await getNextEtimsNumber(cfg);
  const payload = await buildEtimsCreditMemoPayload(order, { creditNoteNumber, reason });

  const res = await fetch(cfg.creditNoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`eTIMS credit memo HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (body?.success === false) throw new Error(`eTIMS credit memo rejected: ${JSON.stringify(body).slice(0, 300)}`);

  const data = responseData(body);
  const etimsRs = etimsResponseData(data);
  return {
    etimsNo: creditNoteNumber,
    etimsCreditMemoNo: data.CuInvoiceNumber || data.cuInvoiceNumber || data.creditNoteNumber || '',
    cuSerialNo: etimsRs.mrcNo || '',
    qrUrl: data.qrData || data.qrUrl || '',
    signedAt: new Date().toISOString(),
    payload,
  };
}

/**
 * Print a PDF file directly to the configured printer using pdf-to-printer.
 * Returns true on success, false on failure (logged).
 */
async function printPdfToPrinter(filePath, printerName, paperSize, orientation = 'portrait') {
  if (!printerName) {
    logger.warn('printer name not configured — skipping hardware print', { filePath });
    return false;
  }
  try {
    await sendToPrinter(filePath, { printer: printerName, paperSize, orientation });
    logger.info('printed via pdf-to-printer', { filePath, printerName, paperSize });
    return true;
  } catch (e) {
    logger.error('pdf-to-printer failed', { filePath, printerName, error: e.message });
    return false;
  }
}

/** Returns the list of installed printers on this host. */
export async function listInstalledPrinters() {
  try {
    const printers = await getPrinters();
    return printers.map(p => p.name || String(p));
  } catch (e) {
    logger.warn('listInstalledPrinters failed', { error: e.message });
    return [];
  }
}

export async function generateQrCodeFromSigningService(qrUrl, shopCode = null) {
  if (!qrUrl) return '';
  const cfg = await loadEtims(shopCode);
  if (!cfg.qrServiceUrl) return '';
  try {
    const res = await fetch(`${cfg.qrServiceUrl}${encodeURIComponent(qrUrl)}`);
    if (!res.ok) throw new Error(`QR service ${res.status}`);
    const contentType = res.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (e) {
    logger.warn('QR service generation failed', { error: e.message });
    return '';
  }
}

export async function buildPrintPayload(order, etimsResult) {
  const cfg = await loadEtims(order?.shopCode);
  const payments = paymentSummary(order);
  // Compute VAT split per line. POS prices are stored VAT-inclusive (PriceIncludesVat=1).
  //   inclusive: vat = amount - amount/(1+rate/100)
  //   exclusive: vat = amount * rate/100
  const lineCalcs = (order.lines || []).map(l => {
    const amt  = Number(l.lineAmount || 0);
    const rate = Number(l.vatPercent || 0);
    const incl = l.priceIncludesVat == null ? true : Boolean(l.priceIncludesVat);
    const vatAmount = rate <= 0 ? 0
      : incl ? amt - (amt / (1 + rate / 100))
             : amt * (rate / 100);
    return { line: l, vat: Math.round(vatAmount * 100) / 100, incl };
  });
  const totalIncNum = lineCalcs.reduce((s, c) => s + (c.incl ? Number(c.line.lineAmount || 0) : Number(c.line.lineAmount || 0) + c.vat), 0);
  const totalVatNum = lineCalcs.reduce((s, c) => s + c.vat, 0);
  const totalExNum  = totalIncNum - totalVatNum;
  const qrImage = etimsResult?.qrUrl
    ? await generateQrCodeFromSigningService(etimsResult.qrUrl, order?.shopCode)
    : '';
  return {
    invoice_no:        order.orderNo,
    customer_name:     order.contactName || 'Walk-in Customer',
    customer_pin:      order.contactPin  || '',
    customer_no:       order.contactNo   || '',
    lpo_no:            '',
    mpesa_code:        payments.lines.map(p => p.reference).filter(Boolean).join(', '),
    email:             '',
    home_page:         '',
    vat_reg_no:        '',
    order_no:          order.orderNo,
    posting_date:      new Date().toISOString().slice(0, 10),
    sales_person_code: order.cashierName || '',
    payment_terms:     payments.lines.map(p => p.mode).join(', '),
    sales_person_name: order.cashierName || '',
    shipment_method:   '',
    company_pin:       cfg.companyPin,
    external_doc_no:   '',
    ship_to:           order.shopCode || '',
    total_ex_vat:      totalExNum.toFixed(2),
    vat:               totalVatNum.toFixed(2),
    total_inc_vat:     totalIncNum.toFixed(2),
    payment_lines:     payments.lines,
    amount_paid:       payments.amountPaid.toFixed(2),
    change_given:      payments.changeGiven.toFixed(2),
    no_printed:        1,
    lines: lineCalcs.map(({ line: l, vat }) => ({
      item_no:          l.itemNo,
      item_description: l.description,
      units:            String(l.quantity),
      qty:              String(l.quantity),
      uom:              l.unitOfMeasure || '',
      vat_id:           l.taxType || '',
      vat_rate:         Number(l.vatPercent || 0).toFixed(2),
      vat_amount:       vat.toFixed(2),
      amount:           Number(l.lineAmount).toFixed(2),
      crates:           '',
    })),
    kra_invoice: etimsResult ? {
      qr_url:        etimsResult.qrUrl,
      qr_image_data_url: qrImage,
      cu_invoice_no: etimsResult.etimsInvoiceNo,
      cu_serial_no:  etimsResult.cuSerialNo,
      signed_at:     etimsResult.signedAt,
    } : null,
  };
}

/**
 * Generate a PDF (A4 or thermal) honouring the admin print config.
 * Returns the saved fileName (or null on failure).
 */
async function generateByConfig(payload, shopCode = null) {
  const cfg = await loadPrint(shopCode);
  try {
    if (cfg.format === 'thermal') {
      return { fileName: await generateThermalInvoicePdf(payload, { widthMm: cfg.thermalWidthMm }), cfg };
    }
    return { fileName: await generateInvoicePdf(payload), cfg };
  } catch (e) {
    logger.error('PDF generation failed', { orderNo: payload.invoice_no, format: cfg.format, error: e.message });
    return { fileName: null, cfg };
  }
}

/**
 * Print a confirmation receipt BEFORE payment.
 * Same renderer, but no eTIMS block (it's a proforma/confirmation, not a tax invoice).
 * Pass { previewOnly: true } to skip the hardware print (used by the preview modal).
 */
export async function printConfirmationReceipt(order, { previewOnly = false } = {}) {
  const payload = await buildPrintPayload(order, null);
  payload.no_printed = 0;
  const { fileName, cfg } = await generateByConfig(payload, order?.shopCode);
  if (fileName && !previewOnly) {
    const paperSize    = cfg.format === 'thermal' ? `${cfg.thermalWidthMm}mm` : 'A4';
    const filePath     = pdfPathFor(fileName);
    for (let i = 0; i < cfg.copies; i++) {
      await printPdfToPrinter(filePath, cfg.invoicePrinter, paperSize);
    }
  }
  return { ok: !!fileName, fileName };
}

function normalizePhone(raw) {
  const phone = String(raw || '').replace(/[^\d+]/g, '');
  if (!phone) return '';
  if (phone.startsWith('254')) return phone;
  if (phone.startsWith('+254')) return phone.slice(1);
  if (phone.startsWith('0'))   return '254' + phone.slice(1);
  if (phone.startsWith('7') || phone.startsWith('1')) return '254' + phone;
  return phone;
}

function darajaTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Send M-PESA STK push for an order. Mode selection (in this order):
 *
 *   1. WRAPPER  — if ApiEndpoint is set, use the BC-style two-step flow:
 *        POST <ApiEndpoint>/stkPush       → { CustomerMessage, CheckoutRequestID }
 *        POST <ApiEndpoint>/confirmPayment/<CheckoutRequestID> → { status }
 *      The wrapper itself bridges to Safaricom Daraja, so this mode lets the
 *      app stay agnostic to Daraja credentials.
 *   2. DARAJA   — else, if ConsumerKey + ConsumerSecret + ShortCode + Passkey
 *      are configured, call Safaricom Daraja directly.
 *   3. FETCH    — else, if PaymentFetchUrl is configured, return a friendly
 *      hint and rely on the customer initiating payment to the till; the
 *      cashier reconciles by clicking "Fetch M-PESA payments".
 *
 * Returns { ok, reference, message, confirmed }.
 */
export async function sendStkPush({ order, paymentType, mobileNo, amount }) {
  const phone = normalizePhone(mobileNo);
  if (!phone) return { ok: false, message: 'Phone number required' };
  const amt   = Math.max(1, Math.round(Number(amount)));

  // ── Mode 1: wrapper (preferred when ApiEndpoint is set) ───────────────────
  if (paymentType?.ApiEndpoint) {
    const base = paymentType.ApiEndpoint.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json', 'Return-Type': 'application/json' };
    if (paymentType.ApiKey) headers['X-API-Key'] = paymentType.ApiKey;
    const stkBody = {
      invoice_no:  order.orderNo,
      customer_no: order.contactNo || '',
      phone, amount: amt,
      currency:    'KES',
      store_name:  order.shopCode || '',
      till_number: paymentType.ShortCode || paymentType.BalanceAcctNo || '',
    };
    try {
      // Step 1 — initiate STK
      logger.info('Wrapper STK push', { orderNo: order.orderNo, url: `${base}/stkPush`, phone });
      const stkRes = await fetch(`${base}/stkPush`, {
        method: 'POST', headers, body: JSON.stringify(stkBody),
      });
      const stkText = await stkRes.text();
      let stkJson = {};
      try { stkJson = JSON.parse(stkText); } catch {}
      if (!stkRes.ok) {
        return { ok: false, message: stkJson?.errorMessage || stkJson?.error || `STK HTTP ${stkRes.status}` };
      }
      const customerMsg = stkJson?.CustomerMessage || stkJson?.customerMessage || '';
      const checkoutId  = stkJson?.CheckoutRequestID || stkJson?.checkoutRequestId || '';
      // BC's wrapper signals success with this exact phrase, but accept any "success" wording.
      const accepted = !customerMsg || /success/i.test(customerMsg);
      if (!accepted) return { ok: false, message: customerMsg };
      if (!checkoutId) {
        // Service responded ok but no id — treat as "sent, awaiting confirmation"
        return { ok: true, reference: '', message: customerMsg || 'STK prompt sent.', confirmed: false };
      }

      // Step 2 — confirmPayment by id (mirrors the BC codeunit)
      let confirmed = false;
      let cfmStatus = '';
      try {
        const cfmRes  = await fetch(`${base}/confirmPayment/${encodeURIComponent(checkoutId)}`, {
          method: 'POST', headers,
        });
        const cfmText = await cfmRes.text();
        let cfmJson   = {};
        try { cfmJson = JSON.parse(cfmText); } catch {}
        cfmStatus = String(cfmJson?.status || cfmJson?.Status || '').toLowerCase();
        confirmed = cfmRes.ok && (cfmStatus === 'success' || cfmStatus === 'paid' || cfmStatus === 'confirmed');
      } catch (e) {
        logger.warn('Wrapper confirmPayment failed', { error: e.message, checkoutId });
      }

      return {
        ok:        true,
        reference: checkoutId,
        confirmed,
        message:   confirmed
          ? `Payment confirmed (ref ${checkoutId}).`
          : `STK prompt sent — ${customerMsg || 'awaiting customer'}. ${cfmStatus ? `Status: ${cfmStatus}.` : ''}`,
      };
    } catch (e) {
      logger.error('Wrapper STK exception', { error: e.message });
      return { ok: false, message: e.message };
    }
  }

  // ── Mode 2: Daraja-direct (used when no wrapper URL but Daraja creds are present) ──
  const hasDaraja = paymentType?.ConsumerKey && paymentType?.ConsumerSecret
                 && paymentType?.ShortCode   && paymentType?.Passkey;

  if (hasDaraja) {
    const base = (paymentType.ApiEndpoint || 'https://api.safaricom.co.ke').replace(/\/$/, '');
    try {
      // 1. OAuth token
      const auth = Buffer.from(`${paymentType.ConsumerKey}:${paymentType.ConsumerSecret}`).toString('base64');
      const tokRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
      });
      const tokBody = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tokBody.access_token) {
        return { ok: false, message: `Daraja auth failed: ${tokBody.errorMessage || tokRes.status}` };
      }

      // 2. STK push
      const ts       = darajaTimestamp();
      const password = Buffer.from(`${paymentType.ShortCode}${paymentType.Passkey}${ts}`).toString('base64');
      const txnType  = paymentType.TransactionType || 'CustomerPayBillOnline';
      const acctRef  = (paymentType.AccountReference || order.orderNo).slice(0, 12);
      const stkBody = {
        BusinessShortCode: paymentType.ShortCode,
        Password:          password,
        Timestamp:         ts,
        TransactionType:   txnType,
        Amount:            amt,
        PartyA:            phone,
        PartyB:            paymentType.ShortCode,
        PhoneNumber:       phone,
        CallBackURL:       paymentType.CallbackUrl || `${process.env.PUBLIC_API_URL || ''}/api/pos/payments/mpesa-callback`,
        AccountReference:  acctRef,
        TransactionDesc:   `Order ${order.orderNo}`,
      };
      logger.info('Daraja STK push', { orderNo: order.orderNo, phone, shortCode: paymentType.ShortCode });
      const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokBody.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(stkBody),
      });
      const stkResp = await stkRes.json().catch(() => ({}));
      if (!stkRes.ok || stkResp.ResponseCode !== '0') {
        return { ok: false, message: stkResp.errorMessage || stkResp.ResponseDescription || `STK HTTP ${stkRes.status}` };
      }
      return {
        ok:        true,
        reference: stkResp.CheckoutRequestID || '',
        confirmed: false,
        message:   stkResp.CustomerMessage || 'STK prompt sent.',
      };
    } catch (e) {
      logger.error('Daraja STK exception', { error: e.message });
      return { ok: false, message: e.message };
    }
  }

  // ── Mode 3: fetch-only (poll-based reconciliation; no outbound STK) ───────
  if (paymentType?.PaymentFetchUrl) {
    return {
      ok:        true,
      reference: '',
      confirmed: false,
      message:   `Customer should pay ${amt} to Till ${paymentType.ShortCode || '—'}. ` +
                 `Click "Fetch M-PESA payments" once the customer has paid to reconcile.`,
    };
  }

  return {
    ok: false,
    message: 'STK push is not configured for this payment method. Set the wrapper API base URL, ' +
             'Daraja credentials, or a Payment Fetch URL on Admin Setup → POS Setup → Payment Methods.',
  };
}

/**
 * Pull recent payments from the payment service URL configured on a payment type.
 * Expected payload shape (any of these fields per row will be used):
 *   { success, count, payments: [ { phone, amount, mpesaCode|transactionId, accountRef|invoiceNo, timestamp } ] }
 * Returns { ok, count, payments[] } — caller decides how to reconcile.
 */
export async function fetchPaymentsFromService({ paymentType, params = {} }) {
  if (!paymentType?.PaymentFetchUrl) {
    return { ok: false, message: 'No PaymentFetchUrl configured', count: 0, payments: [] };
  }
  try {
    const u = new URL(paymentType.PaymentFetchUrl);
    // Always send the shop's till identifier (BusinessShortCode) when we have it,
    // unless the URL already specifies one explicitly.
    if (paymentType.ShortCode && !u.searchParams.has('till')) {
      u.searchParams.set('till', String(paymentType.ShortCode));
    }
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    }
    const headers = {};
    if (paymentType.ApiKey) headers['X-API-Key'] = paymentType.ApiKey;
    const res = await fetch(u.toString(), { headers });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    if (!res.ok) return { ok: false, message: `Fetch HTTP ${res.status}`, count: 0, payments: [] };
    const list = Array.isArray(body) ? body : (body.payments || body.data || []);
    // Accept both snake/camel (our local impl) and PascalCase (mpesa_transactions columns)
    const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return ''; };
    const fullName = (p) => [pick(p, 'FirstName','firstName'), pick(p, 'MiddleName','middleName'), pick(p, 'LastName','lastName')]
      .filter(Boolean).join(' ').trim();
    const payments = list.map(p => ({
      reference:   pick(p, 'mpesaCode','transactionId','transId','TransID','reference','id'),
      name:        pick(p, 'name','customerName','payerName','fullName') || fullName(p),
      phone:       normalizePhone(pick(p, 'phone','msisdn','mobileNo','MSISDN')),
      amount:      Number(pick(p, 'amount','transAmount','TransAmount') || 0),
      accountRef:  pick(p, 'accountRef','accountReference','billRefNumber','BillRefNumber','invoiceNo','InvoiceNumber','orderNo'),
      till:        pick(p, 'till','BusinessShortCode','shortCode'),
      timestamp:   pick(p, 'timestamp','transTime','TransTime','createdAt','created_at') || null,
      raw:         p,
    }));
    return { ok: true, count: payments.length, payments };
  } catch (e) {
    logger.error('fetchPaymentsFromService exception', { error: e.message });
    return { ok: false, message: e.message, count: 0, payments: [] };
  }
}

/**
 * Print a POS order to the configured printer (A4 or thermal).
 * 1. Generate PDF locally using the configured format
 * 2. Print directly via pdf-to-printer to the configured printer name
 * Returns { ok, fileName }.
 */
export async function printPosOrder(order, etimsResult = null) {
  const payload = await buildPrintPayload(order, etimsResult);
  const { fileName, cfg } = await generateByConfig(payload, order?.shopCode);
  if (fileName) {
    const paperSize = cfg.format === 'thermal' ? `${cfg.thermalWidthMm}mm` : 'A4';
    const filePath  = pdfPathFor(fileName);
    for (let i = 0; i < cfg.copies; i++) {
      await printPdfToPrinter(filePath, cfg.invoicePrinter, paperSize);
    }
  }
  return { ok: !!fileName, fileName };
}
