/**
 * services/dispatchPackPdf.js
 * PDFs for the dispatch pack features:
 *  - DPL (dispatch packing list) for an order, one section per chiller (the chiller mapping
 *    used by assembly), with each pack item's breakdown, the assembled pieces and the
 *    numbered prepacks used;
 *  - prepack labels (one per page, with a QR of the prepack number).
 */
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { packBreakdown, groupByChiller } from '../../../shared/dispatchPacks.mjs';

const fmtQty = (v) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 10000) / 10000));
const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString().slice(0, 10);
};
const nowText = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Rows of the DPL table for one chiller. */
export function dplRows(lines) {
  return lines.map((l) => {
    const packs = Number(l.MainPackSize) > 0 ? packBreakdown(l, l.OrderQty).text : '';
    const assembled = l.Completed ? (l.Pieces != null ? `${l.Pieces} pcs` : fmtQty(l.AssembledQty)) : '';
    const prepacks = (l.Prepacks || []).map((p) => `${p.PrepackNo} (${p.PackSize})`).join(', ');
    return [l.Part || '', l.ItemNo || '', l.Description || '', l.Uom || '', fmtQty(l.OrderQty), packs, assembled || '_____', prepacks, l.BatchNo || ''];
  });
}

/**
 * DPL PDF for an order (as returned by getAssemblyOrder, with Chiller on each line).
 * `chiller` limits it to one chiller; otherwise every chiller starts on its own page.
 */
export function buildDplPdf(order, { chiller = null, printedBy = '' } = {}) {
  const all = groupByChiller(order.lines || []);
  const groups = chiller ? all.filter((g) => g.chiller === chiller) : all;
  if (!groups.length) throw new Error(chiller ? `Order has no lines for ${chiller}` : 'Order has no lines');

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const chillerNames = all.map((g) => g.chiller).join(' | ');

  groups.forEach((g, gi) => {
    if (gi > 0) doc.addPage();
    const startPage = doc.getNumberOfPages();
    const header = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text(`DISPATCH Packing List - ${g.chiller}`, W / 2, 12, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Chillers on order: ${chillerNames}`, W / 2, 17, { align: 'center' });
      doc.setFontSize(10);
      const left = [
        ['Dispatch No:', order.DispatchNo], ['Order No:', order.OrderNo], ['Company:', order.Company],
        ['Customer:', `${order.CustomerNo || ''} ${order.CustomerName || ''}`.trim()],
      ];
      const right = [
        ['Shipment Date:', fmtDate(order.ShipmentDate)], ['Salesperson:', `${order.SalespersonCode || ''} ${order.SalespersonName || ''}`.trim()],
        ['LPO / Ext. Doc:', order.LpoNo || ''], ['Printed:', `${nowText()} ${printedBy}`.trim()],
      ];
      left.forEach(([k, v], i) => { doc.setFont('helvetica', 'bold'); doc.text(k, 8, 25 + i * 5.5); doc.setFont('helvetica', 'normal'); doc.text(String(v || '').slice(0, 55), 33, 25 + i * 5.5); });
      right.forEach(([k, v], i) => { doc.setFont('helvetica', 'bold'); doc.text(k, 118, 25 + i * 5.5); doc.setFont('helvetica', 'normal'); doc.text(String(v || '').slice(0, 40), 146, 25 + i * 5.5); });
    };
    header();
    doc.autoTable({
      head: [['Part', 'Item No.', 'Description', 'UOM', 'Order Qty', 'Packs', 'Assembled', 'Prepacks', 'Batch']],
      body: dplRows(g.lines),
      startY: 48,
      margin: { left: 6, right: 6, top: 48, bottom: 40 },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.4, textColor: [0, 0, 0], lineColor: [160, 160, 160], lineWidth: 0.1, valign: 'middle' },
      headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 21 }, 2: { cellWidth: 45 }, 3: { cellWidth: 10 },
        4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 28, fontStyle: 'bold' }, 6: { cellWidth: 20 },
        7: { cellWidth: 36, fontSize: 7.5 }, 8: { cellWidth: 15 },
      },
      didDrawPage: () => { if (doc.getNumberOfPages() > startPage) header(); },
    });
    const totalQty = g.lines.reduce((s, l) => s + (Number(l.OrderQty) || 0), 0);
    const packItems = g.lines.filter((l) => Number(l.MainPackSize) > 0);
    const packs = packItems.reduce((s, l) => { const b = packBreakdown(l, l.OrderQty); return s + b.mainPacks + b.miniPacks; }, 0);
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`${g.chiller}: ${g.lines.length} line(s) · order qty ${fmtQty(totalQty)}${packItems.length ? ` · ${packs} pack(s)` : ''}`, 8, y);
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    [['Assembled By (Name & Sign):', 6], ['Packed By (Name & Sign):', 74], ['Checked By (Name & Sign):', 142]].forEach(([t, x]) => {
      doc.text(t, x, H - 32); doc.rect(x, H - 30, 62, 12);
    });
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pages}`, W - 6, H - 8, { align: 'right' });
    doc.text(`${order.DispatchNo || ''} · ${order.OrderNo || ''}`, 6, H - 8);
  }
  return Buffer.from(doc.output('arraybuffer'));
}

/** Prepack labels, one per page (100 x 70 mm). */
export async function buildPrepackLabelsPdf(prepacks) {
  if (!prepacks.length) throw new Error('No prepacks to print');
  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: [100, 70] });
  for (let i = 0; i < prepacks.length; i++) {
    const p = prepacks[i];
    if (i > 0) doc.addPage([100, 70], 'l');
    const qr = await QRCode.toDataURL(p.PrepackNo, { margin: 0, width: 240 });
    doc.addImage(qr, 'PNG', 4, 4, 30, 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(p.PrepackNo, 38, 12);
    doc.setFontSize(11);
    doc.text(`${p.PackType === 'mini' ? 'MINI' : 'MAIN'} PACK · ${p.PackSize} PCS`, 38, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(String(p.ItemNo || ''), 38, 27);
    doc.text(doc.splitTextToSize(String(p.Description || ''), 58).slice(0, 2), 38, 32);
    doc.setFontSize(9);
    doc.text(`Company: ${p.Company || ''}`, 4, 45);
    doc.text(`Chiller: ${p.Chiller || '-'}`, 4, 50);
    doc.text(`Batch: ${p.BatchNo || '-'}`, 52, 45);
    doc.text(`Packed: ${fmtDate(p.CreatedAt)}`, 52, 50);
    doc.text(`By: ${p.CreatedByName || p.CreatedByUserId || ''}`.slice(0, 50), 4, 56);
    doc.setLineWidth(0.3); doc.rect(2, 2, 96, 66);
  }
  return Buffer.from(doc.output('arraybuffer'));
}
