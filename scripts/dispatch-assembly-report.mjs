/**
 * One-off: Dispatch Assembly report (PDF) for the Dispatch Manager.
 * Month: October 2026. Assembly stats by day & user & tonnage, process flow,
 * role notes (chiller attendant, dispatch supervisor), and current reports.
 * Run from server/ so .env + pools resolve:  node ../scripts/dispatch-assembly-report.mjs
 */
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import fs from 'fs';
import { db, sql } from '../server/src/db/pool.js';

const FROM = '2026-10-01', TO = '2026-11-01', MONTH_LABEL = 'October 2026';
const OUT = 'f:/applications/bc-app/Dispatch-Assembly-Report-October-2026.pdf';

const pool = await db.getPool();
const Q = (s) => pool.request().query(s).then(r => r.recordset);

const dayUser = await Q(`
  SELECT CONVERT(varchar(10),CAST(AssembledAt AS date),23) AS Day, ISNULL(AssembledByName,'(unknown)') AS Worker,
    COUNT(*) AS Lines, SUM(AssembledQty) AS Qty, SUM(AssembledWeight) AS Kg, COUNT(DISTINCT DispatchOrderId) AS Orders
  FROM dbo.DispatchAssemblyLine
  WHERE AssembledAt>='${FROM}' AND AssembledAt<'${TO}' AND AssembledByName IS NOT NULL
  GROUP BY CAST(AssembledAt AS date), AssembledByName ORDER BY Day, Worker`);
const perDay = await Q(`
  SELECT CONVERT(varchar(10),CAST(AssembledAt AS date),23) AS Day, COUNT(*) AS Lines, SUM(AssembledQty) AS Qty,
    SUM(AssembledWeight) AS Kg, COUNT(DISTINCT DispatchOrderId) AS Orders, COUNT(DISTINCT AssembledByName) AS Workers
  FROM dbo.DispatchAssemblyLine
  WHERE AssembledAt>='${FROM}' AND AssembledAt<'${TO}' AND AssembledByName IS NOT NULL
  GROUP BY CAST(AssembledAt AS date) ORDER BY Day`);
const perWorker = await Q(`
  SELECT ISNULL(AssembledByName,'(unknown)') AS Worker, COUNT(DISTINCT CAST(AssembledAt AS date)) AS Days,
    COUNT(*) AS Lines, SUM(AssembledQty) AS Qty, SUM(AssembledWeight) AS Kg, COUNT(DISTINCT DispatchOrderId) AS Orders
  FROM dbo.DispatchAssemblyLine
  WHERE AssembledAt>='${FROM}' AND AssembledAt<'${TO}' AND AssembledByName IS NOT NULL
  GROUP BY AssembledByName ORDER BY SUM(AssembledWeight) DESC`);
const perChiller = await Q(`
  SELECT ISNULL(NULLIF(LTRIM(RTRIM(Chiller)),''),'(unassigned)') AS Chiller, COUNT(*) AS Lines,
    SUM(AssembledWeight) AS Kg, COUNT(DISTINCT DispatchOrderId) AS Orders
  FROM dbo.DispatchAssemblyLine
  WHERE AssembledAt>='${FROM}' AND AssembledAt<'${TO}' AND AssembledByName IS NOT NULL
  GROUP BY NULLIF(LTRIM(RTRIM(Chiller)),'') ORDER BY SUM(AssembledWeight) DESC`);
const grand = (await Q(`
  SELECT COUNT(*) AS Lines, SUM(AssembledQty) AS Qty, SUM(AssembledWeight) AS Kg,
    COUNT(DISTINCT DispatchOrderId) AS Orders, COUNT(DISTINCT AssembledByName) AS Workers,
    COUNT(DISTINCT CAST(AssembledAt AS date)) AS Days,
    MIN(CONVERT(varchar(10),CAST(AssembledAt AS date),23)) AS MinD, MAX(CONVERT(varchar(10),CAST(AssembledAt AS date),23)) AS MaxD
  FROM dbo.DispatchAssemblyLine
  WHERE AssembledAt>='${FROM}' AND AssembledAt<'${TO}' AND AssembledByName IS NOT NULL`))[0];

// ── PDF ──────────────────────────────────────────────────────────────────────
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
const NAVY = [30, 58, 95], NAVY2 = [21, 41, 74], GREY = [90, 100, 115], LIGHT = [238, 242, 248], LINE = [210, 218, 230];
const n0 = (v) => Math.round(Number(v || 0)).toLocaleString('en-US');
const n1 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maxFractionDigits: 1 });
const kg = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const t  = (v) => (Number(v || 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let y = M;
function ensure(space) { if (y + space > H - M) { doc.addPage(); y = M; } }
function h1(txt) {
  doc.setFillColor(...NAVY); doc.rect(M, y, W - 2 * M, 24, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(txt, M + 8, y + 16); y += 34; doc.setTextColor(0);
}
function para(txt, opts = {}) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 9.5);
  doc.setTextColor(...(opts.color || [40, 45, 55]));
  const lines = doc.splitTextToSize(txt, W - 2 * M - (opts.indent || 0));
  for (const ln of lines) { ensure(14); doc.text(ln, M + (opts.indent || 0), y); y += (opts.lh || 13); }
  doc.setTextColor(0);
}
function gap(h = 8) { y += h; }

// ── Cover header ──
doc.setFillColor(...NAVY); doc.rect(0, 0, W, 90, 'F');
doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
doc.text('Dispatch Assembly Report', M, 46);
doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
doc.text(`${MONTH_LABEL}  ·  Farmer's Choice Dispatch`, M, 68);
doc.setTextColor(0); y = 110;
doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
doc.text(`Prepared for: Dispatch Manager`, M, y);
doc.text(`Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })} EAT`, W - M, y, { align: 'right' });
y += 13;
doc.text(`Coverage: ${grand.MinD} to ${grand.MaxD} (assembly activity to date)`, M, y);
doc.setTextColor(0); y += 20;

// ── KPI strip ──
const kpis = [
  ['Total tonnage', `${t(grand.Kg)} t`, `${kg(grand.Kg)} kg`],
  ['Lines assembled', n0(grand.Lines), `${grand.Orders} orders`],
  ['Active days', String(grand.Days), `${grand.Workers} assemblers`],
  ['Avg / active day', `${t(grand.Kg / grand.Days)} t`, `${n0(grand.Lines / grand.Days)} lines`],
];
const kw = (W - 2 * M - 3 * 10) / 4;
kpis.forEach((k, i) => {
  const x = M + i * (kw + 10);
  doc.setFillColor(...LIGHT); doc.roundedRect(x, y, kw, 54, 4, 4, 'F');
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(k[0].toUpperCase(), x + 8, y + 15);
  doc.setTextColor(...NAVY2); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(String(k[1]), x + 8, y + 34);
  doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(String(k[2]), x + 8, y + 48);
});
doc.setTextColor(0); y += 54 + 18;

para('This report summarises assembly-stage output for the dispatch pick-and-pack line: the quantity (pieces) and weight (tonnage) completed each day, broken down by assembler. Assembly is the stage where confirmed order lines are weighed and issued from the chillers; the next stage in the pipeline is packing. Figures are drawn directly from the dispatch system (DispatchAssemblyLine) and reflect completed assembly entries at their recorded weights.', { size: 9.5 });
gap(6);

// ── Section 1: daily by user & tonnage ──
h1('1.  Daily assembly — by day, assembler and tonnage');
const body = [];
let curDay = null, dT = { l: 0, q: 0, k: 0 };
const pushDayTotal = () => { if (curDay) body.push([{ content: `${curDay} — subtotal`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: LIGHT, textColor: NAVY2 } },
  { content: n0(dT.l), styles: { fontStyle: 'bold', fillColor: LIGHT, halign: 'right' } },
  { content: n0(dT.q), styles: { fontStyle: 'bold', fillColor: LIGHT, halign: 'right' } },
  { content: kg(dT.k), styles: { fontStyle: 'bold', fillColor: LIGHT, halign: 'right' } },
  { content: t(dT.k), styles: { fontStyle: 'bold', fillColor: LIGHT, halign: 'right' } }]); };
for (const r of dayUser) {
  if (r.Day !== curDay) { pushDayTotal(); curDay = r.Day; dT = { l: 0, q: 0, k: 0 }; }
  dT.l += r.Lines; dT.q += Number(r.Qty); dT.k += Number(r.Kg);
  body.push([r.Day, r.Worker, { content: n0(r.Lines), styles: { halign: 'right' } },
    { content: n0(r.Qty), styles: { halign: 'right' } },
    { content: kg(r.Kg), styles: { halign: 'right' } }, { content: t(r.Kg), styles: { halign: 'right' } }]);
}
pushDayTotal();
body.push([{ content: 'GRAND TOTAL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255] } },
  { content: n0(grand.Lines), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255], halign: 'right' } },
  { content: n0(grand.Qty), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255], halign: 'right' } },
  { content: kg(grand.Kg), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255], halign: 'right' } },
  { content: t(grand.Kg), styles: { fontStyle: 'bold', fillColor: NAVY, textColor: [255, 255, 255], halign: 'right' } }]);
doc.autoTable({
  startY: y, head: [['Date', 'Assembler', 'Lines', 'Pieces', 'Weight (kg)', 'Tonnes']],
  body, margin: { left: M, right: M }, theme: 'grid',
  styles: { fontSize: 8, cellPadding: 3, lineColor: LINE, lineWidth: 0.3 },
  headStyles: { fillColor: NAVY2, textColor: [255, 255, 255], fontSize: 8 },
  columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
});
y = doc.lastAutoTable.finalY + 18;

// ── Section 2: per-day + per-worker summaries ──
ensure(40); h1('2.  Totals by day and by assembler');
doc.autoTable({ startY: y, head: [['Date', 'Assemblers', 'Orders', 'Lines', 'Pieces', 'Weight (kg)', 'Tonnes']],
  body: perDay.map(r => [r.Day, r.Workers, r.Orders, n0(r.Lines), n0(r.Qty), kg(r.Kg), t(r.Kg)]),
  margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 3 },
  headStyles: { fillColor: NAVY2, textColor: [255, 255, 255] },
  columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
y = doc.lastAutoTable.finalY + 14;
ensure(40);
para('Assembler leaderboard (by tonnage)', { bold: true, size: 10, color: NAVY2 }); gap(2);
doc.autoTable({ startY: y, head: [['Assembler', 'Days', 'Orders', 'Lines', 'Pieces', 'Weight (kg)', 'Tonnes']],
  body: perWorker.map(r => [r.Worker, r.Days, r.Orders, n0(r.Lines), n0(r.Qty), kg(r.Kg), t(r.Kg)]),
  margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 3 },
  headStyles: { fillColor: NAVY2, textColor: [255, 255, 255] },
  columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
y = doc.lastAutoTable.finalY + 14;
ensure(40);
para('Tonnage by chiller', { bold: true, size: 10, color: NAVY2 }); gap(2);
doc.autoTable({ startY: y, head: [['Chiller', 'Orders', 'Lines', 'Weight (kg)', 'Tonnes']],
  body: perChiller.map(r => [r.Chiller, r.Orders, n0(r.Lines), kg(r.Kg), t(r.Kg)]),
  margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 3 },
  headStyles: { fillColor: NAVY2, textColor: [255, 255, 255] },
  columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
y = doc.lastAutoTable.finalY + 18;

// ── Section 3: process flow diagram ──
doc.addPage(); y = M;
h1('3.  Assembly process flow');
const stages = [
  ['Registry — receive & confirm', 'Confirmed BC order lands in Dispatch; registry confirms it is ready for the floor. An order, once picked, is claimed exclusively for assembly + packing.'],
  ['Assign — chiller / part', 'Supervisor assigns parts/chillers (or "Bypass assignment" lets an assembler pick a chiller directly; registry confirmation still required).'],
  ['Assemble — weigh & issue', 'Assembler opens a timed session, weighs each line (pieces + kg), records batch and chiller. Completing a line writes a negative stock movement to BC in base units. Corrections ("Correct / reassemble") reverse and re-issue atomically, before packing starts.'],
  ['Packing  (next phase)', 'Assembled quantities are packed into boxes/vessels; closing a box generates its QR label. When all assembled pieces are boxed and every box closed, the order is fully packed.'],
  ['Load & depart', 'Packed, labelled boxes are scanned onto the vehicle for the route and dispatched.'],
];
const bx = M, bw = W - 2 * M, bh = 48, gapY = 26;
stages.forEach((s, i) => {
  ensure(bh + gapY + 4);
  const highlight = /next phase/i.test(s[0]);
  doc.setFillColor(...(highlight ? [224, 236, 255] : LIGHT));
  doc.setDrawColor(...(highlight ? NAVY : LINE)); doc.setLineWidth(highlight ? 1.2 : 0.5);
  doc.roundedRect(bx, y, bw, bh, 5, 5, 'FD');
  doc.setFillColor(...NAVY); doc.circle(bx + 16, y + bh / 2, 9, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(String(i + 1), bx + 16, y + bh / 2 + 3.5, { align: 'center' });
  doc.setTextColor(...NAVY2); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(s[0], bx + 34, y + 17);
  doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(doc.splitTextToSize(s[1], bw - 44), bx + 34, y + 30);
  y += bh;
  if (i < stages.length - 1) {
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.2);
    doc.line(bx + 16, y, bx + 16, y + gapY);
    doc.line(bx + 12, y + gapY - 6, bx + 16, y + gapY); doc.line(bx + 20, y + gapY - 6, bx + 16, y + gapY);
    y += gapY;
  }
  doc.setTextColor(0);
});
gap(10);
para('Attribution & audit: every assembly line records the assembler (or delegated casual worker code), session, batch, chiller and weight. Casual workers can act via delegation from a main account or by direct worker login; the account that performed each action is retained for traceability.', { size: 8.5, color: GREY });

// ── Section 4: roles ──
gap(6); ensure(60); h1('4.  Key roles');
para('Chiller attendant', { bold: true, size: 11, color: NAVY2 }); gap(2);
para('Owns the cold-room (chiller) side of dispatch. Responsibilities and system permissions:', {});
for (const b of [
  'Runs chiller stock takes — timed counting sessions per company / location / chiller; counts are saved, closed read-only, exported and await WMS reconciliation.',
  'Maintains the item-to-chiller mapping during a stock take (e.g. JF-SAUSAGE must remain in CHILLER U), keeping the shared cross-company mapping current.',
  'Monitors Chiller movements — the running log of stock issued out of each chiller by assembly (negative BC base-unit movements) and the positive reversals from corrections.',
  'Can view all assemblers\u2019 sessions (not just their own), giving oversight of what has left the chillers.',
]) { para('\u2022  ' + b, { indent: 10, size: 9 }); }
gap(6); ensure(60);
para('Dispatch supervisor', { bold: true, size: 11, color: NAVY2 }); gap(2);
para('Runs the dispatch floor end-to-end and holds the control/override permissions:', {});
for (const b of [
  'Maintains casual workers (Admin setups) — creates worker codes, allowed functions (assembly/packing/loading/stock take) and passcodes; resets locks/passcodes and reviews delegation history.',
  'Assigns parts/chillers and the assembler / packer / confirmer roles; may enable "Bypass assignment" so assemblers self-select chillers.',
  'Authorises corrections and un-packing — approves re-assembly of completed lines and the supervisor-password-gated unpack of a closed box, with reasons recorded to audit.',
  'Releases abandoned order claims from Dispatch Reports so stuck orders can move.',
  'Owns BC integration — manual "Push packed lines to BC" and the per-company pull/push schedules (supervisor/admin only).',
  'Has full visibility across every assembler, packer and loader session and all dispatch reports.',
]) { para('\u2022  ' + b, { indent: 10, size: 9 }); }

// ── Section 5: current reports ──
gap(6); ensure(60); h1('5.  Current dispatch reports and their use');
const reports = [
  ['Dispatch Reports (main)', 'The consolidated operational report (Dispatch \u2192 Reports). Filter by date, order, customer, route, salesperson, item or operator. Shows: line-level activity across assembly + packing; order progress (ordered vs assembled vs packed, and who claimed each order); operator sessions with duration and delegation/worker codes; and active order claims. Use it for daily throughput, productivity per operator, order traceability, and to release abandoned claims.'],
  ['My Assemblies', 'Per-assembler view of their own sessions \u2014 duration, orders, line counts, corrections and the detailed entries. Supervisors / chiller attendants can see all assemblers. Use it for individual performance and to audit corrections.'],
  ['Chiller Movements', 'Stock issued out of each chiller by completed assembly, in BC base units, with corrections shown as reversal + re-issue. Linked to batch, operator, order, part and session. Use it to reconcile cold-room stock with what was assembled.'],
  ['Chiller Stock Take', 'Timed physical count sessions per chiller; saved counts close read-only and are exported for WMS reconciliation. Use it for periodic cold-room stock verification.'],
  ['Packed-line export / BC dispatch sync', 'Pushes packed lines to each company\u2019s BC "Imported Assemblies" table (manual, supervisor/admin), plus scheduled pull of execute orders and push of packed lines. Use it to post completed dispatch work back to BC.'],
  ['Loading', 'Loading sessions showing boxes scanned onto vehicles by route. Use it to confirm what physically left on each trip.'],
];
for (const [name, desc] of reports) {
  ensure(30);
  para(name, { bold: true, size: 9.5, color: NAVY2 });
  para(desc, { indent: 10, size: 8.8, color: [55, 60, 70] }); gap(4);
}

// footer page numbers
const pages = doc.getNumberOfPages();
for (let p = 1; p <= pages; p++) {
  doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text(`Dispatch Assembly Report \u2014 ${MONTH_LABEL}`, M, H - 18);
  doc.text(`Page ${p} of ${pages}`, W - M, H - 18, { align: 'right' });
}

fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')));
console.log('WROTE', OUT, '(' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB), pages=', pages);
process.exit(0);
