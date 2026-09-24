import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSource, getDataset, catalogue, tableRef } from '../server/src/services/legacyReports.js';
import { buildFromWhere } from '../server/src/models/LegacyReportModel.js';
import { DOWNLOAD_CUTOFF, DOWNLOAD_TABLES, downloadTable } from '../server/src/services/warehouseDownloadTables.js';
import { etlInstallation, etlJobSql, downloadColumns } from '../server/src/services/warehouseDownloadEtl.js';

test('current and LIVE aliases identify the same current source with no duplicate selector', () => {
  for (const company of ['CM','FCL','FLM','RMK']) {
    assert.equal(getSource(company+'-CUR'), getSource(company+'-LIVE'));
    assert.equal(getSource(company+'-CUR').minDate, '2025-01-06');
    assert.equal(getSource(company).beforeDate, DOWNLOAD_CUTOFF);
  }
  assert.equal(catalogue().length, 8);
  assert.ok(catalogue().every(s => !s.key.endsWith('-LIVE')));
});
test('the period boundary cannot be widened by a requested date range', () => {
  for (const [key, param, operator] of [['FCL-CUR','MinDate','>='],['RMK','BeforeDate','<']]) {
    const bindings = new Map();
    const req = { input(k,t,v) { bindings.set(k,v); return this; } };
    const source = getSource(key), dataset = getDataset(source, 'valueEntries');
    const query = buildFromWhere(req,source,dataset,{dateFrom:'2020-01-01',dateTo:'2030-01-01'});
    assert.equal(bindings.get(param).toISOString().slice(0,10),DOWNLOAD_CUTOFF);
    assert.ok(query.where.includes(`h.[Posting Date] ${operator} @${param}`));
  }
});
test('mirrors cover all selected report and master tables without leaking names from requests', () => {
  const columns = downloadColumns();
  assert.equal(columns.size, 17);
  for (const spec of DOWNLOAD_TABLES) {
    for (const key of spec.keys) assert.ok(columns.get(spec.table).has(key));
    if (spec.date) assert.ok(columns.get(spec.table).has(spec.date));
  }
  assert.ok(columns.get('Value Entry').has('Cost Amount (Actual)'));
  assert.ok(columns.get('Item').has('Inventory Posting Group'));
  assert.ok(columns.get('Customer').has('Name'));
  assert.throws(() => downloadTable('FCL','untrusted table'));
  assert.throws(() => downloadTable('untrusted company','Item'));
  assert.equal(tableRef({...getSource('RMK-CUR'),pool:'downloadWarehouse'},'Value Entry'),'[dbo].[DL_RMK_ValueEntry]');
});
test('warehouse reporting avoids dirty reads while ETL commits batches', () => {
  const source = {...getSource('CM-CUR'),pool:'downloadWarehouse'};
  const query = buildFromWhere({input(){return this;}},source,getDataset(source,'postedSalesInvoices'),{inventoryPostingGroup:'JF*'});
  assert.ok(!query.from.includes('NOLOCK'));
  assert.match(query.from,/DL_CM_SalesInvoiceHeader/);
  assert.match(query.from,/DL_CM_Item/);
});
test('ETL bounds remote fetches, persists checkpoints atomically and avoids OFFSET scans', () => {
  const batches = etlInstallation();
  const worker = batches.find(b => b.startsWith('CREATE OR ALTER PROCEDURE [dbo].[Refresh_DL_FCL_ValueEntry]'));
  assert.ok(worker.includes('MIN_ACTIVE_ROWVERSION()'));
  assert.ok(worker.includes('TOP ('));
  assert.ok(!worker.includes('OFFSET'));
  assert.ok(worker.indexOf('EXEC sys.sp_executesql @Sql') < worker.indexOf('BEGIN TRANSACTION'));
  assert.ok(worker.indexOf('SET CursorJson=@Cursor') > worker.indexOf('BEGIN TRANSACTION'));
  assert.ok(worker.indexOf('SET CursorJson=@Cursor') < worker.indexOf('COMMIT;'));
  assert.match(batches.at(-1),/sp_getapplock/);
  assert.match(etlJobSql(),/@freq_subday_interval=2/);
  assert.match(etlJobSql(),/@retry_attempts=2/);
});
