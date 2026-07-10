/**
 * services/posPdfService.js
 * Generate POS invoice PDFs locally (independent of the external printing service).
 * Renders the same look as F:\applications\printing-service\invoice.js but reads
 * order data directly from our DB and saves to server/printed/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
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

export function pdfPathFor(fileName) {
  return path.join(PRINTED_DIR, fileName);
}

/**
 * Generate a PDF for a POS order. Returns the saved filename.
 * `data` shape mirrors the printing-service /print-invoice payload.
 */
export async function generateInvoicePdf(data) {
  const fileName = `${data.invoice_no}_${timestampStr()}.pdf`;
  const filePath = path.join(PRINTED_DIR, fileName);

  const doc = new jsPDF('p', 'mm', 'a4');
  const printCount     = Number(data.no_printed ?? 1);
  const safePrintCount = Number.isNaN(printCount) ? 1 : printCount;
  const now            = new Date();
  const printTime      = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} `
                       + `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const copyLabel      = safePrintCount <= 1 ? 'ORIGINAL' : `COPY ${safePrintCount}`;

  doc.setFont('helvetica', 'bold');

  const totalPages    = () => doc.getNumberOfPages();
  const addPageNumber = () => {
    const pageCount = totalPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${pageCount}`, 200, 12, { align: 'right' });
    }
  };

  const addPrintHeader = () => {
    const headerX = 150;
    doc.setPage(1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sales - Invoice', headerX, 10);
    doc.text(copyLabel, headerX, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Printed At: ${printTime}`, headerX, 22);
  };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(String(data.customer_name || ''), 15, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 35;
  const ls = 8 * 0.7;
  const xA = 50, xB = 146, yA = 110;

  const row = (label, val, lbl2, val2) => {
    doc.text(label, 15, y);   doc.text(String(val ?? ''), xA, y);
    if (lbl2 != null) { doc.text(lbl2, yA, y); doc.text(String(val2 ?? ''), xB, y); }
    y += ls;
  };

  row("Customer's PIN:", data.customer_pin);
  row('Bill-to Customer No:', data.customer_no, 'LPO No:', data.lpo_no);

  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Mpesa:', 15, y); doc.text(String(data.mpesa_code || ''), xA, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Email:', yA, y); doc.text(String(data.email || ''), xB, y);
  y += ls;

  row('Invoice No:',     data.invoice_no,    'Home Page:',   data.home_page);
  row('Order No:',       data.order_no,      'VAT Reg No:',  data.vat_reg_no);
  row('Posting Date:',   data.posting_date);
  row('',                '',                 'SalesPerson Code:', data.sales_person_code);
  row('Payment Terms:',  data.payment_terms, 'SalesPerson Name:', data.sales_person_name);
  row('Shipment Method:',data.shipment_method,'Company PIN:', data.company_pin);
  row('Ext Doc No:',     data.external_doc_no,'Ship-To:',     data.ship_to);

  doc.setFontSize(10);

  const head = ['No.', 'Description', 'No. Of Units', 'Qty', 'UOM', 'VAT \nIdentifier', 'Amount', 'Crates'];
  const body = (data.lines || []).map(line => [
    line.item_no, line.item_description, line.units, line.qty,
    line.uom, line.vat_id, line.amount, line.crates,
  ]);

  let rowCount = 0;
  doc.autoTable({
    head: [head],
    body,
    startY: 92,
    margin: { left: 15, top: 38, bottom: 50, right: 15 },
    columnStyles: {
      0: { cellWidth: 25 }, 1: { cellWidth: 65 }, 2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' }, 6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 15, halign: 'center' },
    },
    headStyles: { fillColor: null, textColor: [0, 0, 0], fontSize: 9, fontStyle: 'bold', halign: 'left', valign: 'bottom' },
    didDrawCell: (d) => {
      if (d.section === 'head' && d.row.index === 0) {
        const lineY = d.cell.y + d.cell.height;
        doc.setDrawColor(0); doc.setLineWidth(0.5);
        doc.line(15, lineY, 200, lineY);
      }
      if (d.section === 'body') rowCount++;
    },
    didParseCell: (d) => {
      if (d.section === 'body') { d.cell.styles.fontStyle = 'normal'; d.cell.styles.fontSize = 8; }
      else                      { d.cell.styles.fontStyle = 'bold';   d.cell.styles.fontSize = 9; }
      d.cell.styles.textColor = [0, 0, 0];
    },
  });

  addPageNumber();

  let afterY = doc.lastAutoTable.finalY + 10;
  if (rowCount > 0) {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Total Amt. Ex. VAT', 110, afterY); doc.text('KSH', 160, afterY); doc.text(String(data.total_ex_vat || ''), 175, afterY);
    afterY += ls;
    doc.text('VAT Amount',         110, afterY); doc.text('KSH', 160, afterY); doc.text(String(data.vat || ''),          175, afterY);
    doc.setFont('helvetica', 'bold');
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(170, afterY + 2, 198, afterY + 2);
    afterY += ls;
    doc.text('Total Amt. Inc. VAT', 110, afterY); doc.text('KSH', 160, afterY); doc.text(String(data.total_inc_vat || ''), 175, afterY);
  }

  const paymentLines = Array.isArray(data.payment_lines) ? data.payment_lines : [];
  if (paymentLines.length || Number(data.change_given || 0) > 0) {
    afterY += ls * 2;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Payment Details', 110, afterY);
    afterY += ls;
    doc.setFont('helvetica', 'normal');
    for (const p of paymentLines) {
      const bits = [p.mode, p.couponCode ? `Coupon ${p.couponCode}` : '', p.reference && !p.couponCode ? p.reference : '', p.mobileNo || '']
        .filter(Boolean)
        .join(' / ');
      doc.text(bits.slice(0, 42), 110, afterY);
      doc.text('KSH', 160, afterY);
      doc.text(Number(p.amount || 0).toFixed(2), 175, afterY);
      afterY += ls;
    }
    if (data.amount_paid) {
      doc.text('Amount Paid', 110, afterY); doc.text('KSH', 160, afterY); doc.text(String(data.amount_paid), 175, afterY);
      afterY += ls;
    }
    if (Number(data.change_given || 0) > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Change', 110, afterY); doc.text('KSH', 160, afterY); doc.text(String(data.change_given), 175, afterY);
      doc.setFont('helvetica', 'normal');
    }
  }

  if (data.kra_invoice) {
    const kra = data.kra_invoice;
    const pageHeight = doc.internal.pageSize.height;
    if (kra.qr_image_data_url || kra.qr_url) {
      try {
        const qrCodeDataURL = kra.qr_image_data_url || await QRCode.toDataURL(kra.qr_url);
        doc.addImage(qrCodeDataURL, 'PNG', 15, pageHeight - 35, 20, 20);
      } catch (e) { /* skip QR if generation fails */ }
    }
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('CU Invoice No.', 40, pageHeight - 30); doc.text(String(kra.cu_invoice_no || ''), 70, pageHeight - 30);
    doc.text('CU Serial No.',  40, pageHeight - 25); doc.text(String(kra.cu_serial_no  || ''), 70, pageHeight - 25);
    doc.text('Signed At',      40, pageHeight - 20); doc.text(String(kra.signed_at     || ''), 70, pageHeight - 20);
  }

  addPrintHeader();
  doc.save(filePath);

  logger.info('pos PDF generated', { fileName, orderNo: data.invoice_no });
  return fileName;
}

/**
 * Generate a Shop Price List PDF: items grouped by category, with price and any active offer.
 * `groups` shape: [{ name, items: [{ itemNo, description, basePrice, offerPrice, offerDescription, unitOfMeasure }] }]
 */
export async function generatePriceListPdf({ shopName = '', groups = [] }) {
  const fileName = `pricelist_${(shopName || 'all').replace(/\s+/g, '_')}_${timestampStr()}.pdf`;
  const filePath = path.join(PRINTED_DIR, fileName);

  const doc = new jsPDF('p', 'mm', 'a4');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Shop Price List${shopName ? ' — ' + shopName : ''}`, 15, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`, 15, 24);

  let cursorY = 32;
  for (const grp of groups) {
    if (cursorY > 270) { doc.addPage(); cursorY = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(grp.name || 'Items', 15, cursorY);
    cursorY += 4;

    const body = grp.items.map(it => {
      const base      = Number(it.basePrice ?? it.unitPrice ?? 0);
      const hasOffer  = it.offerPrice != null;
      const effective = hasOffer ? Number(it.offerPrice) : base;
      return [
        it.itemNo,
        it.description,
        it.unitOfMeasure || '',
        effective.toFixed(2),                    // prevailing price (special when active)
        hasOffer ? base.toFixed(2) : '',         // original price when a special applies
        it.offerDescription || '',
      ];
    });

    doc.autoTable({
      head: [['Item No', 'Description', 'UoM', 'Price', 'Was', 'Offer Notes']],
      body,
      startY: cursorY,
      margin: { left: 15, right: 15 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 70 },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 22, halign: 'right', textColor: [21, 128, 61] },
        4: { cellWidth: 22, halign: 'right', textColor: [156, 163, 175] },
        5: { cellWidth: 30, fontSize: 8 },
      },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [17, 24, 39] },
      didDrawPage: () => {},
    });
    cursorY = doc.lastAutoTable.finalY + 6;
  }

  // Page footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pageCount}`, 195, 290, { align: 'right' });
  }

  doc.save(filePath);
  logger.info('pos price list PDF generated', { fileName, groups: groups.length });
  return fileName;
}
