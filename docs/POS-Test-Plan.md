# POS Module — Test Plan

**System:** BC POS Application (Vue 3 client + Express/Node API + SQL Server, integrated with Microsoft Dynamics 365 Business Central)
**Audience:** Business Analysts, QA Analysts, Operations
**Purpose:** End-to-end UAT script for the POS module. Each test case is independently executable and has clear pass/fail criteria.

---

## How to use this document

1. Pre-load the **Test Environment** (Section 1) and create the **Test Users** (Section 2).
2. Run the test cases in order; later sections depend on earlier ones (e.g. you can't sell items if the catalogue hasn't been synced).
3. Record **Actual Result** + **Pass/Fail** + **Defect ID** in each row. The sign-off table at the end summarises run status.
4. Critical failures (marked **CRITICAL**) block release; majors warrant ticket + retest; minors are logged.

Severity legend: **C** = Critical · **H** = High · **M** = Medium · **L** = Low.

---

## 1. Test Environment

| Item | Value |
|---|---|
| API base URL | `http://<test-host>:3000/api` |
| Web client | `http://<test-host>:5173` (dev) or built artifact behind nginx |
| SQL Server (App DB) | `dbo.PosShop`, `PosItem`, `PosOrder`, `PosTillSession`, `PosUserShop`, etc. |
| BC SQL (read-only) | per-company schemas: `FCL$`, `CM$`, `RMK$`, `FLM$` |
| eTIMS sandbox | `ETIMS_BASE_URL` env on server |
| MPESA Daraja | sandbox keys in env (`DARAJA_*`) |
| Thermal printer | 72 mm receipt printer, default Windows print queue |
| Browsers | Chromium, Firefox latest |

### Required pre-test data
- BC company `FCL` has at least 12 customers tagged with `Customer Price Group = 'FCL SHOPS'`, with assigned Salesperson Codes.
- BC company `CM` has the same outlets tagged with `Customer Posting Group = 'FCL SHOPS'`.
- BC items have `PDA Item = 1`, non-blank `E-Tims Item Code`, non-zero Sales Price, `Description <> 'Discontiued'`.
- A test SMTP relay (or MailHog) is reachable for coupon-email tests.

---

## 2. Test Users (create before Section A)

| Username | Role | Purpose |
|---|---|---|
| `qa.admin` | `admin` | Full access |
| `qa.shopadmin` | `shop-admin` | POS scope, no global admin areas |
| `qa.cashier1` | `shop` | Cashier (single shop) |
| `qa.cashier2` | `shop` | Cashier (multi-shop) |
| `qa.dispatch` | `dispatch` | Orders only |
| `qa.security` | `security` | Invoices only |
| `qa.sales` | `sales` | Reports only |
| `qa.finance` | `finance` | Finance only |

---

## SECTION A — Inventory Load Per Location (BC → POS sync)

**Pre-condition:** Logged in as `qa.admin`, BC connectivity confirmed.

| # | Test Case | Steps | Expected | Sev | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| A1 | Sync — Shops (FCL, fresh) | Admin Setup → POS Setup → Sync from BC → company **FCL** → tick **Wipe** → Sync **Shops** | `PosShop` rows = count of FCL customers in `Customer Price Group = 'FCL SHOPS'` (~12); `FclCustomerNo` populated; `PosUserShop` cleared | C | | |
| A2 | Sync — Shops (CM, merge) | Same flow → company **CM** → leave wipe **off** → Sync **Shops** | Same `PosShop` row-count (12). Each row now has both `FclCustomerNo` and `CmCustomerNo` filled; merged by Name (case-insensitive trim) | C | | |
| A3 | Sync — Shops (other company, no rule) | Sync shops with company = `RMK` (no env override set) | Returns 0 BC rows; existing `PosShop` rows unchanged; server log: `no filter rule for company, skipping` | M | | |
| A4 | Sync — Categories (eTIMS-filtered) | Sync **Categories** for FCL | `PosCategory` populated only with Inventory Posting Groups that have at least one item where `PDA Item=1`, `EtimsItemCode<>''`, sales price `<>0`, Description `<> 'Discontiued'` | H | | |
| A5 | Sync — Items (FCL fresh) | Sync **Items** for FCL with **Wipe** ticked | `PosItem` cleared then refilled. Each row has `Code`, `Name`, `UnitPrice>0`, `BarCodeNo`, `EtimsItemCode`, `EtimsClassCode`, `VatPercent` (16 if VAT16, else 0), `SourceCompany='FCL'` | C | | |
| A6 | Sync — Items (CM, multi-company) | Sync **Items** for CM (no wipe) | New rows from CM appear with `SourceCompany='CM'`. FCL items unchanged. Items appearing in both companies appear as 2 rows with different `SourceCompany`. | H | | |
| A7 | Listing — items per shop | POS terminal: log in as `qa.cashier1` (assigned to shop X). Open POS. | Visible items = items active for shop X's `SourceCompany`. Out-of-stock items hidden if `HideOutOfStock` setting on. "Remaining" badge shown per card. | C | | |
| A8 | Listing — categories per shop | Same context | Categories listed contain at least one visible item. Empty categories hidden. | M | | |
| A9 | Stock at shop's location | Pick item, check Remaining; cross-check against BC inventory at the shop's `LocationCode` aggregated across BC item ledger | Remaining = `SUM(Quantity)` from BC `Item Ledger Entry` for `(Item No, Location Code)` | C | | |
| A10 | Stock fail-closed | Disconnect BC SQL temporarily, refresh POS terminal | Items load with **Remaining = N/A**, "Add to cart" disabled (don't allow guesses); error toast | H | | |
| A11 | Sync — Payment Types | Sync **Payment Types** for FCL | `PosPaymentType` populated. Composite uniqueness on `(Code, ShopCode)` with shop-scoped overrides allowed. No duplicate-key error if a code exists in both global and shop scope. | H | | |
| A12 | Sync — Walk-in customers | Sync **Walk-in Customers** for FCL | One walk-in `PosContact` per shop with `IsWalkIn=1`, linked to shop's `WalkInCustomerNo`, name + KraPin from BC | M | | |
| A13 | Sync — Contacts (sub-customers) | Sync **Contacts** for FCL | All BC contacts whose `Salesperson Code` matches a shop are imported; `RouteCode`, `KraPin`, `CustomerType` populated | M | | |
| A14 | Idempotency | Run any sync step twice in a row without wipe | Counts stable; no duplicate rows; `UpdatedAt` advances | H | | |
| A15 | Wipe-and-reimport — items | Run Items sync with **Wipe** twice | Both runs succeed; dependent rows in `PosItemShop`, `PosItemCategory` are cleared and rebuilt | H | | |

---

## SECTION B — User Creation & Access Control

**Pre-condition:** Logged in as `qa.admin`. Test users from §2 NOT yet created.

| # | Test Case | Steps | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|---|
| B1 | Create local user | Admin Setup → Users → Add. Username `qa.cashier1`, role `shop`, password set. | 201; user appears in list. Local login works. | C | | |
| B2 | Create AD user (auto-provision) | Log in via AD as a real domain user (qa.test) | First login provisions `Users` row, role = `user` (or `admin` if in AD admin group). Subsequent edits to role survive re-login. | H | | |
| B3 | Role validation | Try to create user with role `superuser` | 400 — `role must be one of …` | M | | |
| B4 | Disable user | Admin Setup → Users → toggle IsActive off for `qa.cashier1` | Login fails: 401 `Invalid credentials` | C | | |
| B5 | Login — bad password | POST `/api/auth/login` username `qa.admin`, wrong password | 401 `Invalid credentials`. No timing leak (constant-ish response) | C | | |
| B6 | Login — AD on local endpoint | POST `/api/auth/login` for an AD-only user | 400 `This account uses Active Directory…` | M | | |
| B7 | JWT lifetime | Log in, decode token | `exp` ≈ now + `JWT_EXPIRES_IN` (default 8h) | M | | |
| B8 | Route gate — admin-only | As `qa.cashier1`, GET `/api/pos/setup/items` | 403 | C | | |
| B9 | Route gate — POS access | As `qa.dispatch`, GET `/api/pos/items` | 403 | C | | |
| B10 | Route gate — orders | As `qa.shopadmin`, GET `/api/orders` | 403 (shop-admin is POS scope only) | C | | |
| B11 | Default route — admin | Log in as `qa.admin`, land on `/` | Redirects to `/orders/scan` | M | | |
| B12 | Default route — shop-admin | Log in as `qa.shopadmin`, land on `/` | Redirects to `/pos` (router-local fallback handles POS roles) | C | | |
| B13 | Default route — finance | Log in as `qa.finance`, land on `/` | Redirects to `/finance` | M | | |
| B14 | Sidebar visibility — shop-admin | Inspect sidebar | Shows POS nav + Administration **POS-related items only** (no Users, SMTP, Schedules) | H | | |
| B15 | Cashier ↔ Shops assign | Admin Setup → Users → "Cashiers ↔ Shops" → assign `qa.cashier2` to shops S1 + S2; mark S1 primary | `PosUserShop` rows: 2; one with `IsPrimary=1`. Legacy `Users.ShopCode` mirrors S1. | H | | |
| B16 | Multi-shop login | Log in as `qa.cashier2` | Loads POS for primary shop S1 by default. Shop switcher (if implemented) lists S1 + S2. | H | | |
| B17 | Single-shop assign | `qa.cashier1` assigned to S1 only | Logs in directly to S1 with no switcher prompt | M | | |
| B18 | Audit — user create | Create user; check `AuditLog` | Row inserted: `userId`, `action='POST /api/auth/create-user'`, `request body` redacted of password | H | | |
| B19 | Password change (self) | If self-service exists | Old password verified; new password rehashed (bcrypt 12 rounds); audit row written | M | | |
| B20 | Password reset (admin) | Admin resets a user's password | New `PasswordHash` set; `AuthProvider='local'` if previously empty | M | | |

---

## SECTION C — Setups

**Pre-condition:** Logged in as `qa.admin` or `qa.shopadmin` (where applicable).

| # | Test Case | Steps | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|---|
| C1 | Shops — list | Admin → POS Setup → Shops | All `PosShop` rows; columns Code, Name, Location, SP, TillNo, Email, Customer #s per company | M | | |
| C2 | Shops — edit till | Edit shop S1, set TillNo=`123456` | 200; reload shows new till | H | | |
| C3 | Categories — restricted to items | Categories list | Excludes empty categories (no active items) | M | | |
| C4 | Items — search & edit | Items grid, search "BREAD", edit price | Saved; reflected in POS within next refresh | H | | |
| C5 | Items — assign to shops | Edit item, tick shops S1+S2 | Item visible only to those shops | H | | |
| C6 | Items — out-of-stock toggle | Setting "Hide out-of-stock" ON | Items with Remaining ≤ 0 hidden in POS | M | | |
| C7 | Payment types — global | Add `MPESA` global (ShopCode=NULL) | Visible to all shops | M | | |
| C8 | Payment types — shop-scoped | Add `MPESA` for S1 only with custom paybill | S1 sees overridden config; other shops see global | H | | |
| C9 | Payment types — STK config | Edit MPESA, enable `useStk`, set Daraja keys | Saved encrypted; POS checkout offers STK push button | C | | |
| C10 | eTIMS endpoints | POS Setup → eTIMS → set `ETIMS_BASE_URL`, `pin` | Saved; payload tester can preview using new endpoint | H | | |
| C11 | eTIMS dry-run | Open an order, "Preview eTIMS payload" | JSON shown; no submission to eTIMS | H | | |
| C12 | Print config | Set thermal printer name + format (72mm) | Future receipts queue to that printer | H | | |
| C13 | Schedules — daily report | Add schedule "Daily sales — 06:00, recipients X,Y" | Cron registered; `dispatchSchedules` log shows next-run timestamp | M | | |
| C14 | SMTP — test mail | SMTP section → Send test email | 200 + email arrives at recipient | H | | |
| C15 | Customer PG mapper | Map BC `Customer Price Group` → category | `PosCustomerPgMap` row written | L | | |
| C16 | Items — special prices CSV import | Upload CSV with `(itemCode, customerPg, unitPrice)` | Rows merged; existing prices updated | M | | |
| C17 | Items — special prices CSV export | Export | Round-trips: re-importable without diffs | M | | |
| C18 | Lazy load — Admin Setup | Open Admin Setup; only "POS shops dropdown" loads on mount | Other sections fetch only when their accordion is expanded; verify in network panel | L | | |
| C19 | Master sync (composite) | "Sync All from BC (FCL)" | All 6 step counts > 0; `errors` array empty | C | | |

---

## SECTION D — POS Terminal: Cart & Checkout

**Pre-condition:** Logged in as `qa.cashier1`. Till session open.

| # | Test Case | Steps | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|---|
| D1 | Open till | Cashier dashboard → Open Till → opening float `1000` | Session row in `PosTillSession`, status `open`, openingFloat=1000 | C | | |
| D2 | Open till — already open | Try to open another | 400 `Already an open session` | M | | |
| D3 | Add item by tap | Tap an item card | Cart line appears qty 1 at unit price; line total updates | C | | |
| D4 | Add item by barcode scan | Type/scan barcode of item not in current category | Item added regardless of category filter | H | | |
| D5 | Quantity edit | Increment qty to 5 | Total updates; cap by Remaining (if hide-OOS off, allow but warn) | H | | |
| D6 | Apply walk-in vs sub-contact | Select walk-in (default), then change to a sub-contact | Order header `ContactId` updates; KRA PIN visible on receipt preview | M | | |
| D7 | Save cart (suspend) | Click "Save"; resume later | Cart restored with same lines; no till impact | M | | |
| D8 | Cancel order | Click Cancel | Order status `cancelled`; stock not deducted; audit row | H | | |
| D9 | Checkout — single tender (cash) | Pay 100% cash, exact amount | 200; receipt prints (72mm); stock deducted at shop's `LocationCode` (negative not allowed) | C | | |
| D10 | Checkout — change due | Cash > total | Change amount displayed and printed under payment methods on checkout and receipt | M | | |
| D11 | Checkout — split tender | 60% cash + 40% MPESA; include coupon if available | 200; all `PosPayment` rows recorded; checkout footer and receipt show payment method, amount, coupon code/reference, and change before QR/signing details | H | | |
| D12 | MPESA STK — happy path | Pay via MPESA → STK push to test number → confirm on phone | Polling completes; payment confirmed; receipt prints | C | | |
| D13 | MPESA STK — timeout | STK push, do not confirm | Polling times out; order stays in `awaiting_payment`; can retry or revert to other tender | H | | |
| D14 | Coupon redemption | Apply coupon code at checkout | Discount applied; coupon ledger debited; can't double-redeem | H | | |
| D15 | Stock check fail-closed | Force BC SQL outage; try checkout | Block checkout with "Cannot verify stock"; no PosOrder created | C | | |
| D16 | Receipt — VAT split | Cart with mixed VAT16 / VAT0 items | Receipt shows VAT-able subtotal, VAT amount, VAT-exempt subtotal correctly | C | | |
| D17 | Receipt — eTIMS submit | After successful checkout | eTIMS payload sent using POS terminal-prefixed document no.; control unit serial, signing time, and signing-service QR print below payment details | C | | |
| D18 | Reprint | Order list → Reprint | Same PDF; audit row with `action='reprint'` | M | | |
| D19 | Abandoned cart label | MPESA timeout → save as abandoned | Cart appears in "Abandoned" filter | L | | |
| D20 | Close till | End of shift → Close Till; declare counted cash | Session closed; cash variance = counted - (opening + cash sales − payouts); report PDF generated | C | | |
| D21 | eTIMS credit memo signing | Admin opens paid/signed POS order → Sign Credit Memo → enter admin PIN and reason | eTIMS credit note payload is submitted only for signage; shop role cannot access; no stock/payment reversal occurs | H | | |

---

## SECTION E — Stock Operations

| # | Test Case | Steps | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|---|
| E1 | Stock request — create | POS → Stock Requests → New, add lines, submit | Status `submitted`; admin sees in queue | H | | |
| E2 | Stock request — approve | Admin approves | Status `approved`; can export BC journal CSV | H | | |
| E3 | Stock request — complete (receive) | Cashier marks lines received with comments | Stock incremented at shop `LocationCode`; `PosStockMovement` rows written | C | | |
| E4 | BC journal CSV — request | Download `bc-journal.csv` for an approved request | Format matches BC `Item Journal` import; one row per line | H | | |
| E5 | Stock take — create | POS → Stock Take → New; lines auto-pre-filled from current `PosItemStock` | All shop items listed with system qty | H | | |
| E6 | Stock take — count & complete | Enter counted qtys; complete | Variance per line; status `completed` | H | | |
| E7 | Stock take — submit & approve | Submit → admin approves | BC physical inventory journal CSV available; movement entries posted to bring system to counted | C | | |
| E8 | Transfer — create & post | Manager → Transfer (origin S1 → S2 or third-party); lines; Save & Post | Stock decreases at S1, increases at S2; `PosStockMovement` audit rows | H | | |
| E9 | Portioning — input/output | Manager → Portioning; pick input items + qty; output items + qty | Inputs deducted, outputs added; gain/loss footer shown; CSV exports | H | | |
| E10 | Write-off | Manager → Write-Off; reason + qty | Stock deducted; reason recorded; reportable in yield | M | | |
| E11 | Manual sale | Manager → Manual Sales → record cash sale | `PosOrder` with `Source='manual'`; receipt CSV exportable | M | | |
| E12 | Manual sales batch | Upload CSV (50 rows) | All rows posted; row-level error report for any rejects | M | | |
| E13 | Negative stock prevented | Try to deduct more than on hand | 400 `Insufficient stock`; no movement row written | C | | |

---

## SECTION F — Reports

| # | Test Case | Steps | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|---|
| F1 | Stock position | POS Reports → Stock Position by shop/category | Matches `PosItemStock` snapshot; Excel export | M | | |
| F2 | Sales by item | Date range, shop filter | Qty + revenue per item; tally matches sum of `PosOrderLine` | H | | |
| F3 | Sales by contact | Date range | Tops sub-contacts by spend | M | | |
| F4 | Shop comparison | Multi-shop view, side-by-side | Rev, qty, AOV per shop in a single chart | M | | |
| F5 | Cash movement | Multi-session totals for a shift period | Reconciles against `PosTillSession` aggregate | H | | |
| F6 | Yield report | Per period | Vector summation across portionings; PDF + Excel | M | | |
| F7 | Targets vs actual | Today / week / month | Achievement % per shop per item | M | | |
| F8 | Daily sales by shop (pending #8) | (when implemented) | One-page summary per shop per day | M | | |
| F9 | Audit log | Admin → Audit Log; filter by user/action/date | Rows show actor, route, status, latency, IP | H | | |

---

## SECTION G — Non-functional

| # | Test Case | Expected | Sev | Actual | P/F |
|---|---|---|---|---|---|
| G1 | Thermal print — cuts ok | Receipt prints with HRs not chopped (text-baseline 'top') | H | | |
| G2 | Thermal print — QR readable | Camera scan resolves | M | | |
| G3 | Concurrent checkouts | 5 cashiers checkout at once on different shops | All succeed; no deadlocks; stock decrements correct | H | | |
| G4 | Auth — JWT rejected | Tamper token signature | 401 | C | | |
| G5 | Auth — expired token | Wait past expiry | 401 + client logout | H | | |
| G6 | SQL injection — login | Username `' OR 1=1 --` | 401 invalid creds; no SQL error | C | | |
| G7 | XSS — order item name | Inject `<script>` in BC source | Renders as text in receipt + UI | C | | |
| G8 | Rate limit — login | 100 failed logins/min | 429 after threshold | M | | |
| G9 | TLS — prod | HTTPS only on prod URL | M | | |

---

## Sign-off

| Section | Total | Passed | Failed | Blocked | Sign-off |
|---|---|---|---|---|---|
| A — Inventory | 15 | | | | |
| B — Users & Access | 20 | | | | |
| C — Setups | 19 | | | | |
| D — Terminal & Checkout | 21 | | | | |
| E — Stock Operations | 13 | | | | |
| F — Reports | 9 | | | | |
| G — Non-functional | 9 | | | | |
| **Total** | **106** | | | | |

**Approvers:** Business lead ____________   QA lead ____________   IT lead ____________   Date ________
