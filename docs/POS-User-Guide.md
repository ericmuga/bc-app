# POS Module — User Guide

**Version:** 1.0  ·  **Audience:** Cashiers, Shop Managers, IT Admins, Finance

---

## Contents

1. Logging in
2. Roles
3. Cashier — Daily routine
4. Cashier — Taking a sale
5. Cashier — Stock requests
6. Cashier — Stock take
7. Manager — Transfers, portioning, write-offs
8. Manager — Manual sales
9. Manager — Targets and coupons
10. Reports
11. IT Admin — BC sync (catalogue & shops)
12. IT Admin — Users, roles, cashier-shop assignment
13. IT Admin — Setups (eTIMS, MPESA, printer, SMTP, schedules)
14. Troubleshooting

---

## 1. Logging in

Open `https://<your-host>/login`.

- **Local account** — Username + Password (assigned by IT).
- **Active Directory** — Click *AD Login*; enter your domain credentials.

After login the system routes you to the page that matches your role:

| Role | Default page |
|---|---|
| `admin` | Orders Scan |
| `dispatch` | Orders Scan |
| `security` | Invoice Scan |
| `sales`, `analyst` | Reports |
| `finance` | Finance Reports |
| `shop`, `shop-admin` | POS terminal |

If you ever land on Login again right after entering correct credentials, your role isn't mapped — contact IT.

---

## 2. Roles

| Role | Can do |
|---|---|
| `admin` | Everything |
| `shop-admin` | All POS scope (cart, checkout, transfers, portioning, write-offs, manual sales, master-data sync, cashier-shop assignment). **Cannot** access Users, SMTP, Schedules, Finance |
| `shop` (cashier) | Cart, checkout, view shop reports, stock requests, stock take. **Cannot** post transfers/portioning/write-offs |
| `dispatch` | Orders only (scan, confirm) |
| `security` | Invoices only (scan, confirm) |
| `sales`, `analyst` | Reports only |
| `finance` | Finance reports + GL queries |

---

## 3. Cashier — Daily routine

**Opening the shift**
1. Log in. POS terminal loads.
2. *Top right* → **Open Till**. Enter your opening cash float. Press **Open**.
3. The till banner shows *Open since hh:mm — Float Ksh n,nnn*.

You cannot take card or cash payments without an open till.

**During the shift**
- Take orders (Section 4).
- Add cash payouts (e.g. petty cash) via *Till → Add Transaction → Type: Payout*.
- Suspend a cart with **Save** if a customer steps away. Resume it from *Saved Carts*.

**Closing the shift**
1. *Top right* → **Close Till**.
2. Count the drawer; enter counted cash.
3. The system computes variance = counted − (float + cash sales − payouts).
4. Confirm. The shift report PDF prints automatically.

---

## 4. Cashier — Taking a sale

1. Choose customer:
   - **Walk-in** (default) — no KRA PIN on receipt.
   - **Sub-contact** — type 3+ chars; pick from the list. Receipt will show their KRA PIN.
2. Add items:
   - **Tap** an item card.
   - Or scan a barcode (works across categories).
   - Set quantity in the cart line.
3. **Discounts:** apply a coupon code in the cart footer. The discount line appears below subtotal.
4. **Checkout** → choose payment method(s):
   - Single tender — pick one method, type amount.
   - Split tender — *Add Method*; the remainder auto-fills.
5. **MPESA STK push:**
   - Enter customer phone, *Push*.
   - Phone receives prompt; customer enters PIN.
   - Terminal polls; on confirmation the receipt prints.
   - If timeout: switch to another tender or save as abandoned.
6. **Cash:** enter received cash; change due is shown and printed.
7. Receipt prints automatically (72 mm thermal). eTIMS submission happens in the background; the control unit code is included.

**Failure paths**
- *No stock* → the item shows Remaining = 0 and the Add button is disabled.
- *eTIMS down* → checkout still completes, payload is queued for retry; manager sees pending eTIMS in the report hub.
- *Printer offline* → receipt still saved; reprint from Orders list once the printer is back.

---

## 5. Cashier — Stock requests

Use this when you need stock from the central store.

1. *Sidebar* → **Stock Requests** → **New**.
2. Add items + quantity needed.
3. **Submit**. The request enters *pending approval*.
4. Admin approves it. You'll see status update.
5. When the goods arrive, open the request → *Receive Lines*. Enter received qty + comments per line.
6. **Complete**. Stock is added to your shop's location.

The admin can export a BC item-journal CSV for the request from the same page.

---

## 6. Cashier — Stock take

Run periodically to reconcile system stock with what's physically on the shelf.

1. **Stock Take → New**. Lines pre-fill with all shop items + system quantity.
2. Walk the shop, count, type **Counted Qty**.
3. **Complete** — variance per line is shown.
4. **Submit** → admin reviews, approves.
5. Once approved, the BC physical-inventory journal CSV is available; importing it in BC reconciles the books.

---

## 7. Manager — Transfers, portioning, write-offs

Available to `shop-admin` and `admin` only.

**Transfer**
- Move stock from one shop to another, or to a third party.
- *POS → Transfers → New* → pick origin, destination, lines. **Save & Post**.

**Portioning**
- One input item becomes several output items (e.g., whole carcass → cuts).
- *POS → Yield → Portioning* → input card (item + qty), output card (items + qty). Footer shows gain/loss kg.
- **Save & Post** to commit.

**Write-off**
- *POS → Yield → Write-Off* → item, qty, reason.
- The deduction appears in the Yield report.

---

## 8. Manager — Manual sales

For sales completed outside the POS terminal (e.g., off-site events).

- *POS → Yield → Manual Sales → New* — record per-line.
- Or **Batch** upload a CSV.
- Resulting orders are tagged `Source='manual'`.

---

## 9. Manager — Targets and coupons

**Targets**
- *POS → Targets* — set per shop / per item daily targets.
- Copy previous-period targets in one click.
- *Achievement* tab shows actual vs target.

**Coupons**
- *POS → Coupons* — issue a coupon: amount, expiry, recipient email.
- The system emails a PDF with QR.
- At checkout the cashier scans the QR; the discount applies and the coupon ledger debits.

---

## 10. Reports

Hub at `/pos/reports`:

- **Stock Position** — current stock by shop & category.
- **Sales by Item** — qty + revenue per item over a date range.
- **Sales by Contact** — top sub-contacts.
- **Shop Comparison** — side-by-side rev/qty/AOV.
- **Cash Movement** — across till sessions.
- **Yield** — gain/loss summation across portionings.
- **Targets vs Actual** — achievement %.
- **Audit Log** — full action trail (admin only).

All reports support Excel + PDF export.

---

## 11. IT Admin — BC sync (catalogue & shops)

*Admin Setup → POS Setup → Sync from BC*

For each company you can run individual steps or a bulk sync.

**Recommended order** for a fresh tenant:

1. **Shops (FCL, with WIPE)** — clears `PosShop` + `PosUserShop`. Imports outlets where `Customer Price Group = 'FCL SHOPS'`.
2. **Shops (CM, no wipe)** — folds in CM customers; merges by Name (case-insensitive). Each row now has both `FclCustomerNo` and `CmCustomerNo`.
3. **Walk-in Customers (FCL)** — one walk-in `PosContact` per shop.
4. **Contacts (FCL)** — sub-contacts.
5. **Categories (FCL)** — only categories with at least one eligible item.
6. **Items (FCL, with WIPE)** — clears `PosItem`, then imports items where `PDA Item=1`, eTIMS Item Code present, sales price ≠ 0, Description ≠ 'Discontiued'. VAT% is derived (`VAT16 → 16`, else 0).
7. **Items (CM)** — adds CM-sourced items (`SourceCompany='CM'`).
8. **Payment Types (FCL)**.

**Per-company filter override** (set in server `.env`):
```
BC_SHOP_FILTER_RMK=Customer Posting Group=RMK SHOPS
```

The default sources are: FCL = `Customer Price Group`, CM = `Customer Posting Group`. Other companies return 0 unless overridden.

---

## 12. IT Admin — Users, roles, cashier-shop assignment

**Users**
*Admin Setup → Users*: add, deactivate, reset password, change role.

**Cashiers ↔ Shops** (`/admin/cashier-shops`)
- Each cashier can be tagged to multiple shops (multi-company outlets).
- Mark **one** shop as Primary — that's the default the POS opens to.
- Saving writes `PosUserShop` rows and mirrors the primary to the legacy `Users.ShopCode`.

---

## 13. IT Admin — Setups

**eTIMS** — endpoint URL, PIN, customer branch ID. Test with the *eTIMS Payload Tester*.

**MPESA / Daraja** — per payment method, configure paybill, passkey, callback URL. The "STK push" toggle on a payment method enables the prompt at checkout.

**Printer** — pick the Windows printer queue and format (A4 or 72mm). Receipt format defaults to 72mm thermal.

**SMTP** — server, port, TLS, sender. Use *Send Test Email* to validate.

**Schedules** — add cron-style entries for scheduled emails (daily sales report, etc.). Recipients picked from `Users` where `ReceiveScheduledReports=1`.

**Customer PG mapper** — map BC `Customer Price Group` → POS Category for default category presentation.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login bounces back to /login after correct credentials | Role has no default route | IT: add the role to router-local default-route fallback (currently handles admin/sales/dispatch/security/analyst/finance/shop-admin/shop) |
| "Insufficient stock" at checkout | Live BC inventory ≤ 0 at the shop's `LocationCode` | Move stock via Transfer or Stock Request → Receive |
| Item missing from POS | Filtered out by eTIMS rule (no eTIMS code, blank price, Description = 'Discontiued') | Fix in BC, then re-sync items |
| MPESA STK never confirms | Network/Daraja issue, or callback URL wrong | Check Daraja keys + callback URL in payment method config; *Fetch Payments* to reconcile |
| Receipt cuts letters | Old PDF generator | Already fixed (text baseline = 'top'); ensure server is on latest build |
| Categories list missing some | Empty (no active items) — by design | Sync items first, then categories will repopulate |
| Sync runs but 0 shops imported | Wrong filter for company | Set `BC_SHOP_FILTER_<COMPANY>` env or use FCL/CM defaults |
| Audit log empty | `auditMiddleware` not loaded | Restart server; check `services/audit.js` |
| Shop-admin sees Users section | Role mis-tagged | Ensure role string is exactly `shop-admin` (hyphenated) |

---

## Appendix — Keyboard shortcuts on POS terminal

| Key | Action |
|---|---|
| `F2` | Focus search bar |
| `F4` | Open Cart |
| `F8` | Checkout |
| `F9` | Save cart |
| `Esc` | Close dialog |
| `Enter` (in qty) | Confirm qty change |

(Available where the page sets keydown handlers — see `PosPage.vue`.)
