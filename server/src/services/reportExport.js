import * as XLSX from 'xlsx';

function toNumber(value) {
  return Number(value || 0);
}

function normalizeRows(reportType, result) {
  const rows = Array.isArray(result) ? result : (result?.rows || []);

  if (['postingGroup', 'sector', 'salesperson', 'route'].includes(reportType)) {
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.GroupKey)) groups.set(row.GroupKey, { GroupKey: row.GroupKey });
      const entry = groups.get(row.GroupKey);
      const company = row.Company || 'Unknown';
      if (!entry[`${company} Qty`]) entry[`${company} Qty`] = 0;
      if (!entry[`${company} Amount`]) entry[`${company} Amount`] = 0;
      entry[`${company} Qty`] += toNumber(row.Qty);
      entry[`${company} Amount`] += toNumber(row.Amount);
    }
    const aggregated = [...groups.values()].map((row) => {
      const totals = Object.entries(row).reduce((acc, [key, value]) => {
        if (key.endsWith(' Qty')) acc.totalQty += toNumber(value);
        if (key.endsWith(' Amount')) acc.totalAmount += toNumber(value);
        return acc;
      }, { totalQty: 0, totalAmount: 0 });
      return { ...row, TotalQty: totals.totalQty, TotalAmount: totals.totalAmount };
    }).sort((a, b) => b.TotalAmount - a.TotalAmount);
    aggregated.push(aggregated.reduce((acc, row, idx) => {
      const next = idx === 0 ? { GroupKey: 'TOTAL' } : acc;
      for (const [key, value] of Object.entries(row)) {
        if (key === 'GroupKey') continue;
        next[key] = toNumber(next[key]) + toNumber(value);
      }
      return next;
    }, null));
    return aggregated;
  }

  if (reportType === 'weekOnWeek') {
    const normalized = rows.map((row) => ({
      ...row,
      PreviousQty: toNumber(row.PreviousQty),
      CurrentQty: toNumber(row.CurrentQty),
      VarianceQty: toNumber(row.VarianceQty),
      PreviousAmount: toNumber(row.PreviousAmount),
      CurrentAmount: toNumber(row.CurrentAmount),
      VarianceAmount: toNumber(row.VarianceAmount),
    }));
    normalized.push(normalized.reduce((acc, row, idx) => ({
      GroupKey: idx === 0 ? 'TOTAL' : acc.GroupKey,
      PreviousQty: (acc.PreviousQty || 0) + row.PreviousQty,
      CurrentQty: (acc.CurrentQty || 0) + row.CurrentQty,
      VarianceQty: (acc.VarianceQty || 0) + row.VarianceQty,
      PreviousAmount: (acc.PreviousAmount || 0) + row.PreviousAmount,
      CurrentAmount: (acc.CurrentAmount || 0) + row.CurrentAmount,
      VarianceAmount: (acc.VarianceAmount || 0) + row.VarianceAmount,
    }), {}));
    return normalized;
  }

  if (reportType === 'productPerformance') {
    return rows.map((row) => ({
      PostingGroup: row.GroupKey,
      ProductKey: row.ProductKey,
      ProductDescription: row.ProductDescription,
      PreviousQty: toNumber(row.PreviousQty),
      CurrentQty: toNumber(row.CurrentQty),
      VarianceQty: toNumber(row.VarianceQty),
      PreviousAmount: toNumber(row.PreviousAmount),
      CurrentAmount: toNumber(row.CurrentAmount),
      VarianceAmount: toNumber(row.VarianceAmount),
    }));
  }

  return rows;
}

function escapePdfText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfBuffer(title, lines) {
  const pageHeight = 792;
  const top = 760;
  const left = 40;
  const lineHeight = 14;
  const pages = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));

  const objects = [];
  const addObject = (content) => { objects.push(content); return objects.length; };

  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const contentIds = [];

  for (const pageLines of pages) {
    const stream = [
      'BT',
      '/F1 11 Tf',
      `1 0 0 1 ${left} ${top} Tm`,
      `(${escapePdfText(title)}) Tj`,
      '/F1 9 Tf',
      ...pageLines.flatMap((line, idx) => [`1 0 0 1 ${left} ${top - ((idx + 2) * lineHeight)} Tm`, `(${escapePdfText(line)}) Tj`]),
      'ET',
    ].join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`));
  }

  const pagesId = addObject(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  for (let i = 0; i < pageIds.length; i += 1) {
    objects[pageIds[i] - 1] = objects[pageIds[i] - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
  }

  const chunks = ['%PDF-1.4'];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(chunks.join('\n'), 'utf8'));
    chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join('\n'), 'utf8');
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f `);
  for (let i = 1; i < offsets.length; i += 1) chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join('\n'), 'utf8');
}

export function buildReportAttachment({ reportType, result, scheduleName, deliveryFormat }) {
  const rows = normalizeRows(reportType, result);
  const title = `${scheduleName} (${reportType})`;

  if (deliveryFormat === 'pdf') {
    const headers = rows.length ? Object.keys(rows[0]) : ['No data'];
    const tableLines = [
      headers.join(' | '),
      '-'.repeat(Math.min(120, headers.join(' | ').length)),
      ...rows.slice(0, 200).map((row) => headers.map((key) => String(row[key] ?? '')).join(' | ')),
      ...(rows.length > 200 ? [`... ${rows.length - 200} more rows omitted ...`] : []),
    ];
    return {
      filename: `${scheduleName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      content: buildPdfBuffer(title, tableLines),
      contentType: 'application/pdf',
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Report');
  return {
    filename: `${scheduleName.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    content: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
