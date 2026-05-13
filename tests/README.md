# Tests

## `pos-smoke.mjs`

Read-only API smoke test using Node's built-in test runner. No external deps.

### Run

```bash
# Anonymous-only (no logins) — verifies server is reachable + auth gates work
API_BASE=http://localhost:3000/api node --test tests/pos-smoke.mjs

# Full run (requires test users in §2 of POS-Test-Plan.md)
API_BASE=http://localhost:3000/api \
ADMIN_USER=qa.admin       ADMIN_PASS=...   \
CASHIER_USER=qa.cashier1  CASHIER_PASS=... \
node --test tests/pos-smoke.mjs
```

### Expected output (with valid creds)

```
ok 1 - API: server is reachable
ok 2 - Auth: bad credentials → 401
ok 3 - Auth: missing fields → 400
ok 4 - Auth: admin login
ok 5 - Auth: cashier login
ok 6 - RBAC: anonymous /pos/items → 401
ok 7 - RBAC: cashier reads /pos/items
ok 8 - RBAC: cashier reads /pos/payment-types
ok 9 - RBAC: cashier reads /pos/my-shop
ok 10 - RBAC: cashier reads /pos/contacts
ok 11 - RBAC: cashier reads /pos/orders
ok 12 - RBAC: cashier blocked from /pos/setup/items (admin-only)
ok 13 - RBAC: cashier blocked from /orders (dispatch/admin only)
ok 14 - Admin: GET /pos/setup/shops returns array
ok 15 - Admin: GET /pos/setup/categories returns array
ok 16 - Admin: GET /pos/setup/items returns array
ok 17 - Admin: GET /pos/setup/cashier-shops returns array
ok 18 - Shape: shops carry the multi-company customer columns
ok 19 - Shape: items expose VatPercent and SourceCompany

# tests 19
# pass 19   fail 0   skipped 0
```

### Last run summary (from `last-run.txt`)

```
1..19
# tests 19
# pass 0       ← server on :3000 was a stray node process, not bc-app
# fail 4       ← reachability + 401/400 expectations
# skipped 15   ← skipped because no creds were supplied
```

### To get green output

1. Start the bc-app API: `cd server && npm run dev`. Confirm `http://localhost:3000/api/companies` returns 401 (not 404).
2. Create the test users from `docs/POS-Test-Plan.md` §2.
3. Re-run with `ADMIN_USER` / `ADMIN_PASS` / `CASHIER_USER` / `CASHIER_PASS` set.

### What this script does NOT cover

- Mutations (orders, checkout, transfers, sync) — by design, these are part of the manual UAT plan in `docs/POS-Test-Plan.md` so QA can verify business outcomes (receipt printout, eTIMS code, BC journal CSV format, MPESA confirmation flow).
- Hardware (printer, MPESA STK on a real handset, eTIMS sandbox round-trip).
- UI rendering — leave to manual UAT or later add Playwright.

If you want a deeper API regression suite (mutating tests against an isolated DB), tell me and I'll add a Vitest project with seed/teardown.
