# BC Sales Console

Full-stack Node.js + Vue 3 application that integrates with Microsoft Dynamics 365 Business Central. Provides order/invoice scanning, confirmation with duplicate detection, E-TIMS invoice management, and reporting — with full multi-company support.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/ericmuga/bc-app.git
cd bc-app
npm install

# 2. Configure
cp server/.env.example server/.env
# Edit server/.env with your SQL Server credentials and a strong JWT_SECRET

# 3. Create database tables (run once per company schema)
npm run migrate -- COMPANY_001

# 4. Seed first admin user and register companies
npm run seed

# 5. Start dev servers (API on :3000, Vue on :5173)
npm run dev
```

Open http://localhost:5173 and sign in with the credentials you set in step 4.

---

## Architecture

```
bc-app/
├── server/                        Node.js / Express API
│   └── src/
│       ├── db/
│       │   ├── pool.js            SQL Server connection pool (persistent, shared)
│       │   ├── migrate.js         Schema creator — run once per company
│       │   └── seed.js            Interactive first-run setup (admin + companies)
│       ├── models/
│       │   ├── BaseDocument.js    ← Inheritance root: search, confirm, audit, summary
│       │   ├── Order.js           extends BaseDocument — adds upsert, moveToInvoice
│       │   └── Invoice.js         extends BaseDocument
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── companyController.js
│       │   ├── orderController.js
│       │   └── invoiceController.js
│       ├── middleware/
│       │   ├── auth.js            JWT auth + BC webhook HMAC validation
│       │   └── company.js         X-Company-ID header → req.companyId
│       └── routes/index.js
│
└── client/                        Vue 3 + PrimeVue 4
    └── src/
        ├── composables/
        │   ├── useConfirmDocument.js  ← Shared confirm/copy logic (orders + invoices)
        │   └── useDocumentList.js     ← Shared filter/pagination state
        ├── components/base/
        │   ├── AppShell.vue           Sidebar layout + company switcher
        │   ├── BaseScanCard.vue       Reusable scan card (used by both doc types)
        │   ├── BaseDocumentList.vue   Tabbed list + summary (used by both doc types)
        │   ├── DocumentLines.vue      Lines table with totals footer
        │   ├── AuditLog.vue           Confirm/copy event timeline
        │   └── StatusBadge.vue
        ├── pages/
        │   ├── LoginPage.vue
        │   ├── OrderScanPage.vue      Barcode scan → confirm → COPY detection
        │   ├── OrdersListPage.vue     Filterable table + quick confirm + drawer
        │   ├── InvoiceScanPage.vue    Mirror of OrderScan for invoices
        │   ├── InvoicesListPage.vue   Invoice list + E-TIMS + totals strip
        │   └── ReportsPage.vue        Summary by customer/salesperson/route/sector/date
        └── stores/                    Pinia: auth, company, orders, invoices
```

---

## Multi-Company

Each company is a SQL Server **schema** (`[COMPANY_001]`, `[COMPANY_002]`…). All tables are isolated per company. The shared `[dbo]` schema holds `Users` and `Companies`.

```bash
# Add a second company
npm run migrate -- COMPANY_002
# Then either use npm run seed (adds company interactively) or:
# INSERT INTO [dbo].[Companies] (CompanyId, CompanyName) VALUES ('COMPANY_002', 'Branch Two')
```

Users switch companies from the sidebar dropdown. The active company is sent as `X-Company-ID` on every API request.

---

## API Reference

### Webhooks — called by Business Central

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/webhook/orders` | `X-BC-Signature` | Receive order + lines (upsert, idempotent) |
| `POST` | `/api/webhook/invoices` | `X-BC-Signature` | Receive invoice with E-TIMS data; atomically moves order → invoice |

**Order payload:**
```json
{
  "header": {
    "orderNo": "SO-00123",
    "customerNo": "C001",
    "customerName": "Acme Ltd",
    "salespersonCode": "SP01",
    "routeCode": "R-NAIROBI",
    "sectorCode": "SECTOR-A",
    "orderDate": "2025-03-15"
  },
  "lines": [
    {
      "lineNo": 10000,
      "itemNo": "ITEM-001",
      "description": "Maize Flour 2kg",
      "quantity": 100,
      "quantityBase": 100,
      "unitPrice": 180.00,
      "lineAmount": 18000.00,
      "unitOfMeasure": "BAG"
    }
  ]
}
```

**Invoice payload:**
```json
{
  "orderNo": "SO-00123",
  "invoiceNo": "INV-00456",
  "invoicedAt": "2025-03-15T14:30:00Z",
  "etimsInvoiceNo": "ETIMS-789",
  "etimsData": { "qrCode": "...", "controlUnit": "..." }
}
```

### App UI endpoints (JWT required)

```
GET  /api/orders                       List/search orders
GET  /api/orders/summary               Grouped totals
GET  /api/orders/:no                   Order + lines
POST /api/orders/:no/confirm           Confirm; 409 ALREADY_CONFIRMED if copy
GET  /api/orders/:no/audit             Audit trail

GET  /api/invoices                     (same pattern)
GET  /api/invoices/summary
GET  /api/invoices/:no
POST /api/invoices/:no/confirm
GET  /api/invoices/:no/audit

GET  /api/companies                    List active companies
POST /api/companies                    Register company (admin)
POST /api/auth/login                   { username, password } → { token, user }
POST /api/auth/create-user             Create user (admin only)
GET  /health                           DB connectivity check
```

---

## Key Design Decisions

**Server-side inheritance:** `BaseDocument` provides `search`, `findWithLines`, `confirm`, `audit`, `summary`. `Order` and `Invoice` extend it. Adding a third document type means one new model file.

**Client-side composables:** `useConfirmDocument(confirmFn, auditFn, docType)` handles the full confirm→copy→toast→audit-refresh flow. `useDocumentList(listFn)` handles filter state and date serialisation. Both are used by orders and invoices with zero duplication.

**Atomic invoice promotion:** When BC sends an invoice, `Order.moveToInvoice()` runs a single SQL Server transaction that inserts into `InvoiceHeader`/`InvoiceLine` and deletes from `SalesHeader`/`SalesLine`. An order can never appear in both tables.

**Copy audit:** Every confirm attempt on an already-confirmed document returns HTTP 409 with `code: ALREADY_CONFIRMED`, logs an `OrderCopy`/`InvoiceCopy` event in `AuditLog`, and the UI surfaces a persistent amber warning banner. All copy events are permanently stored with timestamp and user.

---

## Environment Variables

```bash
# server/.env
PORT=3000
NODE_ENV=development

JWT_SECRET=change-this-to-a-long-random-string
JWT_EXPIRES_IN=8h

DB_HOST=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourPassword
DB_ENCRYPT=false
DB_TRUST_CERT=true

DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_ACQUIRE_TIMEOUT=60000

DEFAULT_COMPANY=COMPANY_001
BC_WEBHOOK_SECRET=set-this-to-validate-bc-webhook-calls
CORS_ORIGIN=http://localhost:5173
```
