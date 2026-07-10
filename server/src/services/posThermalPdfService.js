/**
 * services/posThermalPdfService.js
 * Thermal-roll invoice PDF (default 72mm wide × dynamic height).
 * Mirrors BC ThermalInvoice72.rdl layout: header, customer, lines, totals,
 * payment lines, KRA QR + CU details.
 *
 * Page geometry:
 *   - jsPDF uses [width, height] in mm when format is an array
 *   - We render to a tall canvas (200mm) then crop to actual content height.
 *   - For thermal printers, the printer driver typically auto-trims trailing whitespace.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import logger from './logger.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const PRINTED_DIR = path.resolve(__dirname, '../../printed');
if (!fs.existsSync(PRINTED_DIR)) fs.mkdirSync(PRINTED_DIR, { recursive: true });

function timestampStr() {
  const n = new Date();
  return n.getFullYear()
    + String(n.getMonth() + 1).padStart(2, '0')
    + String(n.getDate()).padStart(2, '0')
    + String(n.getHours()).padStart(2, '0')
    + String(n.getMinutes()).padStart(2, '0')
    + String(n.getSeconds()).padStart(2, '0')
    + String(n.getMilliseconds()).padStart(3, '0');
}

/**
 * Generate a thermal invoice PDF.
 * @param {object}  data    Same shape as the A4 invoice payload (see posPdfService.generateInvoicePdf)
 * @param {object}  opts
 * @param {number}  opts.widthMm    Paper width (default 72)
 */
export async function generateThermalInvoicePdf(data, { widthMm = 72 } = {}) {
  const fileName = `thermal_${data.invoice_no}_${timestampStr()}.pdf`;
  const filePath = path.join(PRINTED_DIR, fileName);

  const maxHeightMm = 600;
  const doc = new jsPDF('p', 'mm', [widthMm, maxHeightMm]);

  const margin     = 4;                    // mm side padding (slightly wider for breathing room)
  const innerW     = widthMm - margin * 2;
  const lineGap    = 1.4;                  // extra mm between rows so text never collides
  let y = 5;

  // ── helpers ───────────────────────────────────────────────────────────────
  // All text is rendered with baseline:'top' so y always refers to the TOP of
  // the rendered text. That way advancing y by the line height puts the cursor
  // cleanly BELOW the previous run, and `hr()` doesn't cut through descenders
  // or ascenders of adjacent lines.
  const lineHeight = (size) => size * 0.45 + lineGap;
  const setF = (size, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const TXT = { baseline: 'top' };
  const center = (text, size = 8, bold = false) => {
    if (text == null || text === '') return;
    setF(size, bold);
    const wrapped = doc.splitTextToSize(String(text), innerW);
    for (const seg of wrapped) {
      doc.text(seg, widthMm / 2, y, { align: 'center', ...TXT });
      y += lineHeight(size);
    }
  };
  const left = (text, size = 7, bold = false) => {
    if (text == null || text === '') return;
    setF(size, bold);
    const wrapped = doc.splitTextToSize(String(text), innerW);
    for (const seg of wrapped) {
      doc.text(seg, margin, y, TXT);
      y += lineHeight(size);
    }
  };
  // Two-column key/value, value right-aligned. Wraps the value on its own row if too long.
  const kv = (label, value, size = 7, bold = true) => {
    if (value == null || value === '') return;
    setF(size, false);
    doc.text(String(label), margin, y, TXT);
    setF(size, bold);
    const valStr = String(value);
    const valW   = doc.getTextWidth(valStr);
    const labelW = doc.getTextWidth(String(label));
    if (labelW + 2 + valW <= innerW) {
      doc.text(valStr, widthMm - margin, y, { align: 'right', ...TXT });
      y += lineHeight(size);
    } else {
      y += lineHeight(size);
      const wrapped = doc.splitTextToSize(valStr, innerW);
      for (const seg of wrapped) {
        doc.text(seg, widthMm - margin, y, { align: 'right', ...TXT });
        y += lineHeight(size);
      }
    }
  };
  const hr = (style = 'solid') => {
    // Add a small breathing space before the rule so it never sits on top of
    // descenders from the line above.
    y += 0.6;
    if (style === 'dashed') doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    doc.line(margin, y, widthMm - margin, y);
    if (style === 'dashed') doc.setLineDashPattern([], 0);
    y += 2.2;   // gap between the rule and the next line of text
  };
  const fmtMoney = (v) => Number(v ?? 0).toFixed(2);

  // ── Header ────────────────────────────────────────────────────────────────
  if (data.shop_name)        center(data.shop_name, 10, true);
  if (data.company_name)     center(data.company_name, 8, true);
  if (data.company_address)  center(data.company_address, 6.5);
  if (data.company_pin)      center('PIN: ' + data.company_pin, 6.5);
  if (data.company_email)    center(data.company_email, 6.5);
  y += 1;
  hr();

  const isProforma = data.no_printed === 0 && !data.kra_invoice;
  center(isProforma ? 'CONFIRMATION RECEIPT' : 'TAX INVOICE', 9, true);
  y += 0.6;

  // ── Order meta ────────────────────────────────────────────────────────────
  kv('Invoice No', data.invoice_no);
  if (data.order_no && data.order_no !== data.invoice_no) kv('Order No', data.order_no);
  kv('Date', data.posting_date || new Date().toISOString().slice(0, 10));
  if (data.sales_person_name) kv('Cashier', data.sales_person_name);
  hr('dashed');

  // ── Customer ──────────────────────────────────────────────────────────────
  if (data.customer_name) {
    left(data.customer_name, 7.5, true);
    if (data.customer_pin)   left('PIN: ' + data.customer_pin, 6.5);
    if (data.customer_no)    left('No: '  + data.customer_no,  6.5);
    if (data.customer_phone) left('Tel: ' + data.customer_phone, 6.5);
    hr('dashed');
  }

  // ── Lines: 2-row layout per line so columns never collide on 72mm ────────
  // Row 1: description (wrapped, full width minus right pad)
  // Row 2: "{qty} {uom} × {price}            {amount}"
  setF(7, true);
  doc.text('Item',   margin,           y, TXT);
  doc.text('Amount', widthMm - margin, y, { align: 'right', ...TXT });
  y += lineHeight(7);
  hr();

  setF(7, false);
  for (const ln of (data.lines || [])) {
    // Row 1 — description (and code if room is tight)
    const desc = String(ln.item_description || ln.item_no || '').trim();
    const descLines = doc.splitTextToSize(desc, innerW);
    setF(7, true);
    for (const seg of descLines) {
      doc.text(seg, margin, y, TXT);
      y += lineHeight(7);
    }
    // Row 2 — qty x price = amount
    const qty   = Number(ln.qty   || 0);
    const amt   = Number(ln.amount || 0);
    const price = qty > 0 ? amt / qty : 0;
    const uom   = ln.uom ? ` ${ln.uom}` : '';
    const left2 = `${qty.toFixed(2)}${uom}  ×  ${fmtMoney(price)}`;
    setF(6.8, false);
    doc.text(left2, margin, y, TXT);
    setF(7.5, true);
    doc.text(fmtMoney(amt), widthMm - margin, y, { align: 'right', ...TXT });
    y += lineHeight(7) + 0.6;   // small gap between line items
  }

  hr();

  // ── Totals ────────────────────────────────────────────────────────────────
  kv('Subtotal',  fmtMoney(data.total_ex_vat));
  kv('VAT',       fmtMoney(data.vat));
  setF(9, true);
  doc.text('TOTAL', margin, y, TXT);
  doc.text(fmtMoney(data.total_inc_vat), widthMm - margin, y, { align: 'right', ...TXT });
  y += lineHeight(9) + 0.4;
  hr();

  // ── Payment lines ─────────────────────────────────────────────────────────
  const paymentLines = Array.isArray(data.payment_lines) ? data.payment_lines : [];
  if (paymentLines.length || Number(data.change_given || 0) > 0) {
    left('Payment Details', 7, true);
    for (const p of paymentLines) {
      const ref = p.couponCode ? `Coupon ${p.couponCode}` : (p.reference || p.mobileNo || '');
      kv(ref ? `${p.mode} (${ref})` : p.mode, fmtMoney(p.amount), 6.6);
    }
    if (data.amount_paid) kv('Amount Paid', fmtMoney(data.amount_paid), 6.8);
    if (Number(data.change_given || 0) > 0) kv('Change', fmtMoney(data.change_given), 7, true);
    hr('dashed');
  }

  // ── KRA / QR section (always at the bottom, mirrors A4 layout) ───────────
  if (data.kra_invoice) {
    const kra    = data.kra_invoice;
    const qrSize = 28;        // larger than before so phone scanners pick it up reliably
    if (kra.qr_image_data_url || kra.qr_url) {
      try {
        const qrDataUrl = kra.qr_image_data_url || await QRCode.toDataURL(kra.qr_url, { margin: 1, width: 200 });
        doc.addImage(qrDataUrl, 'PNG', (widthMm - qrSize) / 2, y, qrSize, qrSize);
        y += qrSize + 2;
      } catch { /* skip QR */ }
    }
    setF(7, true);  doc.text('eTIMS Verification', widthMm / 2, y, { align: 'center', ...TXT }); y += lineHeight(7);
    setF(6.5, false);
    if (kra.cu_invoice_no) { doc.text('CU Invoice: ' + kra.cu_invoice_no, widthMm / 2, y, { align: 'center', ...TXT }); y += lineHeight(6.5); }
    if (kra.cu_serial_no)  { doc.text('CU No: '      + kra.cu_serial_no,  widthMm / 2, y, { align: 'center', ...TXT }); y += lineHeight(6.5); }
    if (kra.signed_at)     { doc.text('Signed: '     + kra.signed_at,     widthMm / 2, y, { align: 'center', ...TXT }); y += lineHeight(6.5); }
    y += 1;
    hr('dashed');
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  y += 1.5;
  center('Thank you for your business!', 7.5, true);
  if (isProforma) {
    y += 0.6;
    center('** Proforma — not a tax invoice **', 6.5, true);
  }
  y += 8;  // bottom whitespace for printer cut

  doc.save(filePath);

  logger.info('thermal PDF generated', { fileName, orderNo: data.invoice_no, widthMm });
  return fileName;
}
