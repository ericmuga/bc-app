# POS Module — Business Analyst Release Readiness

**Audience:** Business Analyst, QA Lead, Operations Lead, IT Lead  
**Purpose:** Provide a release-facing view of the POS module, the acceptance evidence required before rollout, and the go/no-go checklist for merging `feat/pos-module` to `main`.

---

## 1. Rollout Summary

The POS module adds shop-level selling, inventory control, till management, coupons, POS reporting, and Business Central master-data synchronization to the existing BC app.

The rollout should be treated as a controlled business process release because it affects:

- Cashier sales and receipts.
- Stock movements and shop inventory balances.
- eTIMS receipt compliance.
- MPESA/cash/card payment reconciliation.
- BC item-journal export files.
- Role-based access for shop users and shop administrators.

---

## 2. Feature Coverage Matrix

| Feature Area | Business Outcome | Primary Users | UAT Evidence |
|---|---|---|---|
| BC to POS sync | Shops, items, categories, walk-in customers, contacts, and payment methods are loaded from BC with company-specific rules | IT Admin, BA | `POS-Test-Plan.md` Section A |
| Role and access control | Users see only the modules they are allowed to operate | BA, IT Admin | `POS-Test-Plan.md` Section B and `tests/pos-unit.mjs` |
| POS setup | Shops, items, payment methods, printers, eTIMS, MPESA, special prices, VAT, and inventory display options are maintained | IT Admin, Shop Admin | `POS-Test-Plan.md` Section C |
| Cart and checkout | Cashiers sell items, select customer contacts, take split tenders/coupons, print receipts with payment/change details, and submit/sign eTIMS payloads | Cashier, Shop Admin | `POS-Test-Plan.md` Section D and `pos-smoke.mjs` |
| eTIMS credit memo signage | Admin can sign a credit memo payload against a paid/signed POS invoice using an admin PIN without granting shop users credit-note authority | IT Admin, Finance | `POS-Test-Plan.md` D21 and `tests/pos-unit.mjs` |
| Stock operations | Requests, stock take, transfers, portioning, write-offs, and manual sales update shop stock movements | Cashier, Shop Admin | `POS-Test-Plan.md` Section E |
| POS reports | BA and operations can validate stock, sales, cash movement, yield, targets, and audit history | BA, Operations, Shop Admin | `POS-Test-Plan.md` Section F |
| Non-functional controls | Auth, concurrency, print quality, SQL injection, XSS, TLS, and rate limiting are checked | QA, IT Admin | `POS-Test-Plan.md` Section G |

---

## 3. Acceptance Evidence

Before production rollout, attach or reference the following evidence in the release ticket:

| Evidence | Owner | Required Result |
|---|---|---|
| `npm test` output | Developer | All POS unit tests pass |
| `npm run build` output | Developer | Client build completes |
| `node --test tests/pos-smoke.mjs` against test API | QA / Developer | All non-skipped tests pass with QA admin and cashier users |
| `node tests/pos-roles.mjs` against seeded test API | QA / Developer | Role matrix shows no mismatches |
| Completed `POS-Test-Plan.md` sign-off table | BA / QA | All critical and high cases passed or formally waived |
| Receipt print sample | Operations | 72 mm receipt prints cleanly and QR scans |
| eTIMS sandbox sample | Finance / IT | Control unit response captured for a paid test order; credit memo signage sample captured by admin |
| MPESA test payment sample | Finance / IT | STK or fetch reconciliation confirms payment |
| BC journal CSV sample | Finance / Operations | CSV accepted by BC test import |

---

## 4. Rollout Decision

Use this as the final go/no-go check before merging to `main`.

| Check | Go Criteria | Status |
|---|---|---|
| Business process | BA confirms Sections A to G of the UAT plan cover current rollout scope | |
| Access control | No unauthorized role can access POS setup, finance, dispatch, or security functions | |
| Data sync | FCL and CM syncs produce expected shop and item counts | |
| Checkout | Cash, MPESA, split tender, coupon, receipt payment breakdown/change, and eTIMS paths are accepted | |
| Stock | Stock deductions, requests, stock take, and transfers reconcile to expected balances | |
| Reporting | POS reports reconcile with order, payment, and movement tables | |
| Build/test | `npm test` and `npm run build` pass on the release branch | |
| Rollback | IT has database backup and deployment rollback steps ready | |

**Decision:** Go / No-Go  
**Approvers:** BA ____________  QA ____________  Operations ____________  IT ____________  Date ____________

---

## 5. Related Documents

- `POS-Test-Plan.md` — feature-based UAT execution workbook.
- `POS-User-Guide.md` — user and administrator operating guide.
- `tests/README.md` — runnable test commands and environment setup.
