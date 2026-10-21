import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('report date selections retain their calendar day in Nairobi and UTC', () => {
  for (const TZ of ['Africa/Nairobi', 'UTC', 'America/New_York']) {
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { reportDate, localReportDate } from './shared/reportDates.mjs';
      for (const date of ['2026-01-05', '2026-08-31', '2026-10-04']) {
        assert.equal(reportDate(localReportDate(date)), date);
        assert.equal(reportDate(date), date);
      }
      assert.equal(reportDate(new Date(2026, 0, 5)), '2026-01-05');
      assert.equal(reportDate(null), null);
      assert.throws(() => reportDate(new Date('invalid')));
    `], { env: { ...process.env, TZ }, stdio: 'pipe' });
  }
  assert.ok(true);
});
