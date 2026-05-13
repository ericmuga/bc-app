/**
 * In-app help topics, organised step-wise from setup → actions → reports.
 * Each topic belongs to a `section` so the sidebar groups them naturally.
 *
 * `roles` = roles for which the topic is most relevant (used to badge results).
 * Topics are searchable across all roles.
 */

export const SECTIONS = [
  { key: 'getting-started', label: '1 · Getting started' },
  { key: 'admin-setup',     label: '2 · Setup (admin)'   },
  { key: 'daily-routine',   label: '3 · Cashier daily routine' },
  { key: 'stock-ops',       label: '4 · Stock operations' },
  { key: 'sales-tools',     label: '5 · Sales tools' },
  { key: 'reports',         label: '6 · Reports' },
  { key: 'support',         label: '7 · Support' },
];

export const HELP_TOPICS = [
  // ── 1 · Getting started ────────────────────────────────────────────────────
  {
    id: 'login',
    section: 'getting-started',
    title: 'Logging in',
    roles: ['admin', 'shop-admin', 'shop'],
    keywords: ['login', 'sign in', 'password', 'AD', 'active directory'],
    body: `
Open the app URL and sign in:

- **Local account** — username + password assigned by IT.
- **Active Directory** — click *AD Login* and use your domain credentials.

After login the system routes you to your default page based on role:
- **admin / dispatch** → Orders Scan
- **security** → Invoice Scan
- **sales / analyst** → Reports
- **finance** → Finance Reports
- **shop / shop-admin** → POS Terminal

If you bounce back to /login after entering valid credentials, your role isn't mapped to a default route — contact IT.
`.trim(),
  },
  {
    id: 'roles',
    section: 'getting-started',
    title: 'Roles & permissions',
    roles: ['admin', 'shop-admin', 'shop'],
    keywords: ['role', 'permission', 'access', 'shop-admin', 'cashier', 'admin'],
    body: `
| Role | Scope |
|---|---|
| **admin** | Everything |
| **shop-admin** | All POS scope: cart, checkout, transfers, portioning, write-offs, manual sales, master-data sync, cashier-shop assignment. **Cannot** access Users, SMTP, Schedules, Finance |
| **shop** (cashier) | Cart, checkout, view shop reports, stock requests, stock take. **Cannot** post transfers / portioning / write-offs |
| **dispatch** | Orders only |
| **security** | Invoices only |
| **sales / analyst** | Reports only |
| **finance** | Finance reports + GL queries |
`.trim(),
  },

  // ── 2 · Setup (admin) — order matters ──────────────────────────────────────
  {
    id: 'users',
    section: 'admin-setup',
    title: 'Step 1 — Create users',
    roles: ['admin'],
    keywords: ['user', 'account', 'create user', 'reset password', 'deactivate'],
    body: `
**Admin Setup → Users**: add, deactivate, reset password, change role.

1. **Add** → username, display name, email, role, password (or leave blank if AD).
2. **AuthProvider** is set automatically: \`local\` if a password is supplied, \`AD\` otherwise (auto-provisioned on first AD login).
3. To **disable** a user, toggle IsActive off — login will fail with 401.
4. Valid roles: \`admin\`, \`sales\`, \`dispatch\`, \`security\`, \`analyst\`, \`finance\`, \`shop\`, \`shop-admin\`.
`.trim(),
  },
  {
    id: 'bc-sync',
    section: 'admin-setup',
    title: 'Step 2 — Sync master data from Business Central',
    roles: ['admin', 'shop-admin'],
    keywords: ['BC sync', 'business central', 'shops', 'items', 'wipe', 'categories', 'walk-in', 'multi-company'],
    body: `
*Admin Setup → POS Setup → Sync from BC* — run individual steps or a bulk sync. Run **per company**.

**Recommended order for a fresh tenant:**

1. **Shops (FCL, with WIPE)** — clears \`PosShop\` + \`PosUserShop\`. Imports outlets where \`Customer Price Group = 'FCL SHOPS'\` (~12 rows).
2. **Shops (CM, no wipe)** — folds in CM customers; merges by Name (case-insensitive). Each row gets both \`FclCustomerNo\` and \`CmCustomerNo\`.
3. **Walk-in Customers (FCL)** — one walk-in \`PosContact\` per shop.
4. **Contacts (FCL)** — sub-contacts, grouped by route.
5. **Categories (FCL)** — only categories with at least one eligible item.
6. **Items (FCL, with WIPE)** — imports items where \`PDA Item=1\`, eTIMS Item Code present, sales price ≠ 0, Description ≠ 'Discontiued'. VAT% derived (\`VAT16 → 16\`, else 0).
7. **Items (CM)** — adds CM-sourced items.
8. **Payment Types (FCL)**.

**Per-company filter override** in server \`.env\`:
\`\`\`
BC_SHOP_FILTER_RMK=Customer Posting Group=RMK SHOPS
\`\`\`

Defaults: FCL = \`Customer Price Group\`, CM = \`Customer Posting Group\`. Other companies return 0 unless overridden.
`.trim(),
  },
  {
    id: 'cashier-shops',
    section: 'admin-setup',
    title: 'Step 3 — Assign cashiers to shops',
    roles: ['admin', 'shop-admin'],
    keywords: ['cashier shop', 'assignment', 'multi-shop', 'primary shop', 'tagging'],
    body: `
**Admin → Cashiers ↔ Shops** (\`/admin/cashier-shops\`).

1. Search for the cashier.
2. Click **Assign** → tick the shops they can serve (multi-company outlets allowed).
3. Mark **one** shop as Primary — that's the default the POS opens to.
4. **Save**.

Behind the scenes: writes \`PosUserShop\` rows (UserId, ShopCode, IsPrimary) and mirrors the primary to the legacy \`Users.ShopCode\`. Users without an assignment can't open POS.
`.trim(),
  },
  {
    id: 'etims',
    section: 'admin-setup',
    title: 'Step 4 — eTIMS configuration',
    roles: ['admin'],
    keywords: ['eTIMS', 'KRA', 'control unit', 'fiscal', 'tax'],
    body: `
*Admin Setup → POS Setup → eTIMS*: endpoint URL, PIN, customer branch ID.

1. Pull defaults from BC (button on the form).
2. Override per environment if needed.
3. Open any order → **Preview eTIMS payload** to dry-run before going live.

Items must have a non-blank eTIMS Item Code in BC for the receipt to be valid — the items sync filters on this automatically.
`.trim(),
  },
  {
    id: 'mpesa',
    section: 'admin-setup',
    title: 'Step 5 — MPESA / Daraja',
    roles: ['admin'],
    keywords: ['mpesa', 'daraja', 'STK push', 'paybill', 'till', 'callback'],
    body: `
1. Sync **Payment Types** from BC (or create one manually).
2. Edit the MPESA payment method:
   - Paybill / shortcode
   - Daraja consumer key + secret
   - Passkey
   - Callback URL (must be reachable from the internet)
3. Toggle **Use STK push** ON to enable the prompt at checkout.
4. Per-shop overrides: create a shop-scoped row with the same Code and a non-NULL ShopCode.

Reconcile missing confirmations via **Till → Fetch Payments**.
`.trim(),
  },
  {
    id: 'printer',
    section: 'admin-setup',
    title: 'Step 6 — Printer (thermal 72mm)',
    roles: ['admin', 'shop-admin'],
    keywords: ['printer', 'thermal', 'receipt', '72mm', 'A4'],
    body: `
*Admin Setup → POS Setup → Print Config*:

1. Pick the Windows printer queue (per shop if needed).
2. Format: **A4** or **72mm thermal** (default 72mm).

Receipts print directly to the chosen queue. If the printer is offline at checkout, the receipt is saved — reprint from the Orders list once the printer is back.
`.trim(),
  },
  {
    id: 'smtp-schedules',
    section: 'admin-setup',
    title: 'Step 7 — SMTP & scheduled reports',
    roles: ['admin'],
    keywords: ['smtp', 'email', 'mail', 'schedule', 'cron', 'daily report'],
    body: `
*Admin Setup → SMTP*: server, port, TLS, sender. Use **Send Test Email** to validate.

*Admin Setup → Schedules*: cron entries for scheduled emails (daily sales report, etc.).

Recipients are picked from \`Users\` where \`ReceiveScheduledReports=1\`. Tick this on each user that should receive auto-emails.
`.trim(),
  },

  // ── 3 · Cashier daily routine ──────────────────────────────────────────────
  {
    id: 'open-till',
    section: 'daily-routine',
    title: 'Open the till (start of shift)',
    roles: ['shop', 'shop-admin'],
    keywords: ['till', 'open shift', 'float', 'cash drawer', 'session'],
    body: `
1. Log in. The POS terminal loads.
2. Top right → **Open Till**.
3. Enter the opening cash float (e.g., 1,000).
4. Click **Open**.

The till banner now shows *Open since hh:mm — Float Ksh n,nnn*. You cannot take payments without an open till.

If you see "Already an open session", another cashier (or you on another device) opened a session that wasn't closed. Reconcile and close it first.
`.trim(),
  },
  {
    id: 'taking-sale',
    section: 'daily-routine',
    title: 'Take a sale (cart → checkout)',
    roles: ['shop', 'shop-admin'],
    keywords: ['sale', 'order', 'cart', 'checkout', 'receipt', 'mpesa', 'cash', 'split tender', 'walk-in'],
    body: `
1. Choose customer:
   - **Walk-in** (default) — no KRA PIN on receipt.
   - **Sub-contact** — type 3+ chars; pick from the list. Receipt shows their KRA PIN.
2. Add items:
   - **Tap** an item card.
   - Or **scan a barcode** — works across categories.
   - Adjust quantity in the cart line.
3. Apply a coupon code in the cart footer if the customer has one.
4. Click **Checkout** and pick payment method(s):
   - **Single tender:** pick one method, enter amount.
   - **Split tender:** click *Add Method* — the remainder auto-fills.
5. **MPESA STK push:**
   - Enter customer phone, click *Push*.
   - Customer confirms on phone; terminal polls.
   - On success, receipt prints. On timeout, switch to another tender or save as abandoned.
6. **Cash:** enter received cash; change due is shown and printed.
7. Receipt prints (72mm thermal). eTIMS submission happens in the background; the control unit code is on the receipt.

**Common failure paths**
- *No stock* → Add button is disabled when Remaining = 0.
- *eTIMS down* → checkout still completes; payload is queued for retry.
- *Printer offline* → receipt is saved; reprint from Orders list once printer is back.
`.trim(),
  },
  {
    id: 'close-till',
    section: 'daily-routine',
    title: 'Close the till (end of shift)',
    roles: ['shop', 'shop-admin'],
    keywords: ['close till', 'shift end', 'cash variance', 'reconcile', 'X report', 'Z report'],
    body: `
1. Top right → **Close Till**.
2. Count the drawer; enter counted cash.
3. The system computes:
   \`variance = counted − (opening_float + cash_sales − payouts)\`
4. Confirm. The shift report PDF prints automatically.

A non-zero variance is logged but doesn't block close. Investigate large variances same-day.
`.trim(),
  },

  // ── 4 · Stock operations ───────────────────────────────────────────────────
  {
    id: 'stock-requests',
    section: 'stock-ops',
    title: 'Request stock from the central store',
    roles: ['shop', 'shop-admin'],
    keywords: ['stock request', 'order stock', 'transfer in', 'receive'],
    body: `
1. Sidebar → **Stock Requests** → **New**.
2. Add items + quantity needed.
3. **Submit**. Status: *pending approval*.
4. Admin approves. Status updates.
5. When goods arrive: open the request → **Receive Lines**. Enter received qty + comments per line.
6. **Complete**. Stock is added to your shop's location.

Admin can export a BC item-journal CSV for the request to import into Business Central.
`.trim(),
  },
  {
    id: 'stock-take',
    section: 'stock-ops',
    title: 'Stock take (count the shelf)',
    roles: ['shop', 'shop-admin'],
    keywords: ['stock take', 'count', 'inventory', 'variance', 'physical inventory'],
    body: `
1. **Stock Take → New**. Lines pre-fill with all shop items + system quantity.
2. Walk the shop, count, type **Counted Qty** per item.
3. **Complete** — variance per line shown.
4. **Submit** → admin reviews and approves.
5. Once approved, the BC physical-inventory journal CSV is available for import into Business Central.
`.trim(),
  },
  {
    id: 'transfers',
    section: 'stock-ops',
    title: 'Transfers (manager)',
    roles: ['admin', 'shop-admin'],
    keywords: ['transfer', 'move stock', 'shop to shop', 'third party'],
    body: `
Move stock between shops or to a third party.

POS → **Transfers → New** → pick origin, destination, lines → **Save & Post**.

Posting decreases stock at origin and increases at destination, with audit rows in \`PosStockMovement\`.
`.trim(),
  },
  {
    id: 'portioning',
    section: 'stock-ops',
    title: 'Portioning (one item → many)',
    roles: ['admin', 'shop-admin'],
    keywords: ['portioning', 'cuts', 'breakdown', 'yield', 'gain loss'],
    body: `
Use when a single input becomes several outputs (e.g., whole carcass → cuts).

POS → **Yield → Portioning**:
- **Input card:** item + quantity in.
- **Output card:** items + quantities out.
- Footer shows gain/loss kg.
- **Save & Post** to commit.

Inputs deducted, outputs added. Visible in the Yield report.
`.trim(),
  },
  {
    id: 'write-offs',
    section: 'stock-ops',
    title: 'Write-offs',
    roles: ['admin', 'shop-admin'],
    keywords: ['write-off', 'damage', 'spoilage', 'loss'],
    body: `
POS → **Yield → Write-Off** → item, quantity, reason.

Stock deducted; reason recorded; reportable in the Yield report.
`.trim(),
  },
  {
    id: 'manual-sales',
    section: 'stock-ops',
    title: 'Manual sales (off-terminal)',
    roles: ['admin', 'shop-admin'],
    keywords: ['manual sale', 'offline', 'event', 'batch upload'],
    body: `
For sales completed outside the POS terminal (off-site events, etc.).

- **POS → Yield → Manual Sales → New** — record per-line.
- Or **Batch upload** a CSV.

Resulting orders are tagged \`Source='manual'\` and excluded from till variance.
`.trim(),
  },

  // ── 5 · Sales tools ───────────────────────────────────────────────────────
  {
    id: 'targets',
    section: 'sales-tools',
    title: 'Daily sales targets',
    roles: ['admin', 'shop-admin'],
    keywords: ['target', 'achievement', 'daily target', 'KPI'],
    body: `
**POS → Targets** — set per-shop / per-item daily targets.

- **Copy previous** — copies last period's targets in one click.
- **Achievement** tab — actual vs target with %.
`.trim(),
  },
  {
    id: 'coupons',
    section: 'sales-tools',
    title: 'Coupons (issue, redeem)',
    roles: ['admin', 'shop-admin', 'shop'],
    keywords: ['coupon', 'discount', 'voucher', 'QR', 'redeem'],
    body: `
**Admin / Shop-admin** issues coupons:
- POS → **Coupons → Issue** — amount, expiry, recipient email.
- The system emails a PDF with QR.

**Cashier** at checkout:
- Apply coupon code in the cart footer, or scan the QR.
- Discount applied; coupon ledger debited; double-redeem blocked.
`.trim(),
  },

  // ── 6 · Reports ───────────────────────────────────────────────────────────
  {
    id: 'reports',
    section: 'reports',
    title: 'Reports hub',
    roles: ['admin', 'shop-admin', 'shop'],
    keywords: ['report', 'sales', 'stock position', 'comparison', 'export', 'excel', 'pdf'],
    body: `
**POS Reports** at \`/pos/reports\`:

- **Stock Position** — current stock by shop & category.
- **Sales by Item** — qty + revenue per item over a date range.
- **Sales by Contact** — top sub-contacts.
- **Shop Comparison** — side-by-side rev/qty/AOV.
- **Cash Movement** — across till sessions.
- **Yield** — gain/loss summation across portionings.
- **Targets vs Actual** — achievement %.

All reports support Excel + PDF export.
`.trim(),
  },

  // ── 7 · Support ───────────────────────────────────────────────────────────
  {
    id: 'shortcuts',
    section: 'support',
    title: 'POS keyboard shortcuts',
    roles: ['shop', 'shop-admin'],
    keywords: ['shortcut', 'keyboard', 'hotkey', 'F2', 'F8'],
    body: `
| Key | Action |
|---|---|
| **F2** | Focus search bar |
| **F4** | Open Cart |
| **F8** | Checkout |
| **F9** | Save cart (suspend) |
| **Esc** | Close dialog |
| **Enter** in qty | Confirm qty change |
`.trim(),
  },
  {
    id: 'troubleshooting',
    section: 'support',
    title: 'Troubleshooting',
    roles: ['admin', 'shop-admin', 'shop'],
    keywords: ['error', 'problem', 'fix', 'help', 'broken', 'login loop', 'no items'],
    body: `
| Symptom | Likely cause | Fix |
|---|---|---|
| Login bounces back to /login | Role has no default route | IT: ensure router-local default-route fallback covers your role |
| "Insufficient stock" at checkout | Live BC inventory ≤ 0 at the shop's location | Move stock via Transfer or Stock Request → Receive |
| Item missing from POS | Filtered by eTIMS rule (no eTIMS code, blank price, "Discontiued" desc) | Fix in BC, then re-sync items |
| MPESA STK never confirms | Network/Daraja or callback URL wrong | Check Daraja keys + callback URL; *Fetch Payments* to reconcile |
| Receipt cuts letters | Old PDF generator | Update to latest server build |
| Categories list missing some | Empty (no active items) — by design | Sync items first |
| Sync runs but 0 shops imported | Wrong filter for company | Set \`BC_SHOP_FILTER_<COMPANY>\` env, or use FCL/CM defaults |
| Audit log empty | Middleware not loaded | Restart server |
| Shop-admin sees Users section | Role mis-tagged | Ensure role is exactly \`shop-admin\` (hyphenated) |
`.trim(),
  },
];

/** Lightweight scorer: title hits weigh more than body hits.
 *  Returns 0 when no match (caller should drop the topic). */
export function scoreTopic(topic, query) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  const title = topic.title.toLowerCase();
  const kw    = (topic.keywords || []).join(' ').toLowerCase();
  const body  = topic.body.toLowerCase();
  for (const t of tokens) {
    if (title.includes(t)) score += 10;
    if (kw.includes(t))    score += 5;
    if (body.includes(t))  score += 1;
  }
  return score;
}
