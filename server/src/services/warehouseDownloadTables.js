export const DOWNLOAD_CUTOFF = '2025-01-06';
export const DOWNLOAD_COMPANIES = ['CM', 'FCL', 'FLM', 'RMK'];
// Immutable whitelist, shared by the SQL installer and report routing.
export const DOWNLOAD_TABLES = [
  ['Inventory Posting Group', ['Code']], ['Item', ['No_']], ['Customer', ['No_']],
  ['Vendor', ['No_']], ['G_L Account', ['No_']],
  ['Purch_ Inv_ Header', ['No_'], 'Posting Date'],
  ['Purch_ Inv_ Line', ['Document No_', 'Line No_'], 'Posting Date'],
  ['Purch_ Rcpt_ Header', ['No_'], 'Posting Date'],
  ['Purch_ Rcpt_ Line', ['Document No_', 'Line No_'], 'Posting Date'],
  ['Sales Invoice Header', ['No_'], 'Posting Date'],
  ['Sales Invoice Line', ['Document No_', 'Line No_'], 'Posting Date'],
  ['Sales Cr_Memo Header', ['No_'], 'Posting Date'],
  ['Sales Cr_Memo Line', ['Document No_', 'Line No_'], 'Posting Date'],
  ['G_L Entry', ['Entry No_'], 'Posting Date'],
  ['Item Ledger Entry', ['Entry No_'], 'Posting Date'],
  ['Value Entry', ['Entry No_'], 'Posting Date'],
  ['SlaughterData', ['SlaughterSequenceNo'], 'SlaughterDate'],
].map(([table, keys, date]) => ({ table, keys, date, key: table.replace(/[^a-zA-Z0-9]/g, '') }));
export function downloadTable(company, table) {
  const spec = DOWNLOAD_TABLES.find(t => t.table === table);
  if (!DOWNLOAD_COMPANIES.includes(company) || !spec) throw new Error('Unknown warehouse download table');
  return `[dbo].[DL_${company}_${spec.key}]`;
}
