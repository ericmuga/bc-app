import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileBcTextFilter } from '../server/src/services/bcTextFilter.js';
import { SOURCES, getSource, getDataset, tableRef, catalogue } from '../server/src/services/legacyReports.js';
import { buildFromWhere } from '../server/src/models/LegacyReportModel.js';

function compile(raw) {
  const values = [];
  const sql = compileBcTextFilter('h.[Code]', raw, value => { values.push(value); return `@p${values.length}`; });
  return { sql, values };
}
test('BC wildcards and SQL wildcard characters are kept distinct', () => {
  assert.deepEqual(compile('JF*').values, ['JF%']);
  assert.deepEqual(compile('*JF?').values, ['%JF_']);
  assert.deepEqual(compile('JF_%[~*').values, ['JF~_~%~[~~%']);
  assert.match(compile('JF*').sql, /LIKE @p1 ESCAPE '~'/);
  assert.match(compile('JF01').sql, /= @p1/);
});
test('BC alternatives, intersections, exclusions and grouping', () => {
  const r = compile('(JF*|JG*)&<>JF99');
  assert.deepEqual(r.values, ['JF%', 'JG%', 'JF99']);
  assert.match(r.sql, / OR /); assert.match(r.sql, / AND /);
  assert.match(compile('<>JF*').sql, /NOT LIKE/);
});
test('BC inclusive ranges, comparisons and case-insensitive prefix', () => {
  assert.deepEqual(compile('JF01..JF99').values, ['JF01', 'JF99']);
  assert.match(compile('..JF99').sql, /<= @p1/);
  assert.match(compile('JF01..').sql, />= @p1/);
  assert.match(compile('>=JF01').sql, />= @p1/);
  assert.deepEqual(compile('@JF*').values, ['jf%']);
  assert.match(compile('@JF*').sql, /LOWER\(h\.\[Code\]\)/);
});
test('quoted exact values and SQL-looking strings remain bound data', () => {
  assert.deepEqual(compile("'JF*|JG*'").values, ['JF*|JG*']);
  assert.match(compile("'JF*'").sql, /= @p1/);
  assert.deepEqual(compile("'O''BRIEN'").values, ["O'BRIEN"]);
  assert.deepEqual(compile("''").values, ['']);
  const input = "JF; DROP TABLE Users--";
  const result = compile(input);
  assert.deepEqual(result.values, [input]); assert.ok(!result.sql.includes(input));
});
test('invalid expressions fail instead of broadening a download', () => {
  for (const input of ['JF*|', '&JF', '(JF', 'JF)', "'JF", 'JF..JG..JH', '..', '>=JF*']) {
    assert.throws(() => compile(input), /Invalid filter/);
  }
  assert.throws(() => compile('J'.repeat(1001)), /Invalid filter/);
});
test('live sources use 172.16.10.8 and GUID tables; legacy RMK stays in rm-bc', () => {
  for (const company of ['CM', 'FCL', 'FLM', 'RMK']) {
    const source = getSource(`${company}-LIVE`);
    assert.equal(source.server, process.env.LEGACY_LIVE_DB_HOST || '172.16.10.8');
    assert.match(tableRef(source, 'Value Entry'), /\$Value Entry\$437dbf0e/);
    assert.ok(getDataset(source, 'valueEntries').summary);
    assert.ok(getDataset(getSource(company), 'valueEntries'));
  }
  assert.equal(getSource('RMK').database, 'rm-bc');
  assert.equal(tableRef(getSource('RMK'), 'Value Entry'), '[dbo].[RMK$Value Entry]');
  assert.equal(SOURCES.length, 8);
});
test('lookup controls are available across applicable datasets', () => {
  for (const source of catalogue()) for (const dataset of source.datasets) {
    for (const filter of dataset.filters.filter(f => ['itemNo','customerNo','inventoryPostingGroup','vendorNo'].includes(f.key))) {
      assert.ok(filter.lookup, `${source.key}/${dataset.key}/${filter.key}`);
    }
  }
});

test('RMK January-to-March exception stays in rm-bc without a current-source overlap',()=>{
  const legacy=getSource('RMK'),current=getSource('RMK-CUR');
  assert.equal(legacy.database,'rm-bc');
  assert.equal(legacy.beforeDate,'2025-03-31');
  assert.equal(current.minDate,'2025-03-31');
  for(const day of ['2025-01-05','2025-01-06','2025-03-30']){
    assert.ok(day<legacy.beforeDate);assert.ok(day<current.minDate);
  }
  for(const source of [legacy,current,{...current,pool:'downloadWarehouse'}]){
    const bound=new Map(),req={input(k,t,v){bound.set(k,v);return this}};
    const query=buildFromWhere(req,source,getDataset(current,'valueEntries'),{dateFrom:'2025-01-05',dateTo:'2025-03-30'});
    const parameter=source===legacy?'BeforeDate':'MinDate';
    assert.equal(bound.get(parameter).toISOString().slice(0,10),'2025-03-31');
    assert.ok(query.where.includes('@'+parameter));
  }
});
test('preview and export builder binds wildcards, dedupes joins and scopes customers', () => {
  const source = getSource('FCL');
  const dataset = getDataset(source, 'itemLedgerEntries');
  const bound = [];
  const request = { input(name, type, value) { bound.push([name, value]); return this; } };
  const r = buildFromWhere(request, source, dataset, { inventoryPostingGroup: 'JF*|JG*', customerNo: 'C*' }, dataset.summary.joins);
  assert.equal((r.from.match(/ AS it /g) || []).length, 1);
  assert.match(r.where, /h\.\[Source Type\]=1/);
  assert.ok(bound.some(([, value]) => value === 'JF%'));
  assert.ok(bound.some(([, value]) => value === 'C%'));
  assert.ok(!r.where.includes('JF*'));
});

test('GL department/project filters bind BC patterns and summary groups retain dimensions',()=>{
 const source=getSource('FCL'),dataset=getDataset(source,'glEntries'),values=[];
 const request={input(name,type,value){values.push(value);return this}};
 const query=buildFromWhere(request,source,dataset,{departmentCode:'D*',projectCode:'P1|P2'},dataset.summary.joins);
 assert.match(query.where,/Global Dimension 1 Code/);
 assert.match(query.where,/Global Dimension 2 Code/);
 assert.ok(values.includes('D%'));assert.ok(values.includes('P1'));assert.ok(values.includes('P2'));
 assert.deepEqual(dataset.summary.groupBy.map(c=>c.as),['GLAccountNo','GLAccountName','DepartmentCode','ProjectCode']);
});

test('GL entry downloads include department and project dimensions across companies and periods',()=>{
 for(const sourceCode of ['FCL','CM','FLM','RMK','FCL-CUR','CM-CUR','FLM-CUR','RMK-CUR']){
  const columns=getDataset(getSource(sourceCode),'glEntries').columns;
  assert.equal(columns.find(c=>c.as==='DepartmentCode')?.col,'h.[Global Dimension 1 Code]');
  assert.equal(columns.find(c=>c.as==='ProjectCode')?.col,'h.[Global Dimension 2 Code]');
 }
});

test('sales invoice and credit memo downloads include line return reasons',()=>{
 for(const sourceCode of ['FCL','CM','FLM','RMK','FCL-CUR','CM-CUR','FLM-CUR','RMK-CUR']){
  const source=getSource(sourceCode);
  for(const key of ['postedSalesInvoices','postedSalesCreditMemos']){
   assert.equal(getDataset(source,key).columns.find(c=>c.as==='ReturnReasonCode')?.col,'l.[Return Reason Code]');
  }
 }
});

test('invoice downloads include LCY conversions and line/header dimensions for legacy and current sources',()=>{
 for(const sourceCode of ['FCL','FCL-CUR','RMK','RMK-CUR'])for(const key of ['postedSalesInvoices','postedSalesCreditMemos','postedPurchaseInvoices']){
  const dataset=getDataset(getSource(sourceCode),key);
  const columns=Object.fromEntries(dataset.columns.map(c=>[c.as,c.col]));
  assert.equal(columns.AmountLCY,'l.[Amount] / COALESCE(NULLIF(h.[Currency Factor],0),1)');
  assert.equal(columns.DepartmentCode,'l.[Shortcut Dimension 1 Code]');
  assert.equal(columns.ProjectCode,'l.[Shortcut Dimension 2 Code]');
  assert.ok(dataset.summary.aggregates.some(c=>c.as==='TotalAmountLCY'));
  assert.ok(dataset.summary.groupBy.some(c=>c.as==='HeaderProjectCode'));
 }
});

test('credit memos use credit tables and invoice-equivalent details across all source aliases',()=>{
 for(const company of ['CM','FCL','FLM','RMK'])for(const suffix of ['','-CUR','-LIVE']){
  const source=getSource(company+suffix),credit=getDataset(source,'postedSalesCreditMemos'),invoice=getDataset(source,'postedSalesInvoices');
  assert.equal(credit.header,'Sales Cr_Memo Header');assert.equal(credit.line,'Sales Cr_Memo Line');
  assert.deepEqual(credit.columns,invoice.columns.filter(c=>c.as!=='OrderNo'));
  assert.equal(credit.filters.documentNo.label,'Credit Memo No.');
  assert.deepEqual(credit.summary,invoice.summary);
 }
});
