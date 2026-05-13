/**
 * services/posCouponPdf.js
 * Single-card PDF for a coupon — face value + code + QR + validity.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const PRINTED_DIR = path.resolve(__dirname, '../../printed');
if (!fs.existsSync(PRINTED_DIR)) fs.mkdirSync(PRINTED_DIR, { recursive: true });

function ts() {
  const n = new Date(); const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

export async function generateCouponPdf(coupon) {
  const fileName = `coupon_${coupon.Code}_${ts()}.pdf`;
  const filePath = path.join(PRINTED_DIR, fileName);

  // Half-A4 landscape card (105mm x 148mm) — fits two on a page if printed n-up.
  const doc = new jsPDF('p', 'mm', [148, 105]);
  const W = 148, H = 105, m = 8;

  // Frame
  doc.setLineWidth(0.6); doc.setDrawColor(15, 113, 115);
  doc.roundedRect(m / 2, m / 2, W - m, H - m, 3, 3);

  // Brand band
  doc.setFillColor(15, 113, 115);
  doc.rect(m / 2, m / 2, W - m, 14, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('GIFT COUPON', W / 2, m / 2 + 9, { align: 'center' });

  doc.setTextColor(0);
  let y = m + 18;

  // Face value
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
  doc.text(`${coupon.Currency || 'KES'} ${Number(coupon.FaceValue).toFixed(2)}`, W / 2, y, { align: 'center' });
  y += 7;

  if (Number(coupon.Balance) !== Number(coupon.FaceValue)) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Balance: ${coupon.Currency || 'KES'} ${Number(coupon.Balance).toFixed(2)}`, W / 2, y, { align: 'center' });
    doc.setTextColor(0);
    y += 5;
  }

  // Code (large + monospaced look)
  y += 4;
  doc.setFont('courier', 'bold'); doc.setFontSize(20);
  doc.text(String(coupon.Code), W / 2, y, { align: 'center' });
  y += 8;

  // QR
  try {
    const qr = await QRCode.toDataURL(String(coupon.Code), { margin: 1, width: 220 });
    const qrSize = 32;
    doc.addImage(qr, 'PNG', (W - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 4;
  } catch { /* ignore */ }

  // Recipient
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  if (coupon.ContactName) {
    doc.text(`Issued to: ${coupon.ContactName}`, W / 2, y, { align: 'center' }); y += 4;
  }
  const validity = coupon.ExpiresAt
    ? `Valid until ${new Date(coupon.ExpiresAt).toISOString().slice(0, 10)}`
    : 'No expiry';
  doc.setTextColor(120);
  doc.text(validity, W / 2, y, { align: 'center' });
  doc.setTextColor(0); y += 5;

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text('Present this coupon at the till — staff will scan or key in the code.', W / 2, H - 6, { align: 'center' });

  doc.save(filePath);
  return { fileName, filePath };
}
