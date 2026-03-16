/**
 * utils/exportCsv.js
 * Converts an array of objects to a CSV download.
 * Works in any modern browser without extra dependencies.
 *
 * @param {string}   filename  e.g. 'orders-2024-01-15.csv'
 * @param {object[]} rows      Array of plain objects
 * @param {Array<{key:string, label:string}>} columns  Column definitions
 */
export function exportCsv(filename, rows, columns) {
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const header = columns.map(c => escape(c.label)).join(',')
  const body   = rows.map(row =>
    columns.map(c => escape(row[c.key])).join(',')
  ).join('\n')

  const csv  = `${header}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Format today as YYYY-MM-DD for filenames */
export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
