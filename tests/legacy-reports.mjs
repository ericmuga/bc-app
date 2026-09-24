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
