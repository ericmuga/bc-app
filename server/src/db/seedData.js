/**
 * db/seedData.js
 * Seed realistic orders and the full order → confirm → invoice → confirm workflow.
 *
 * Usage (run from server/):
 *   node src/db/seedData.js              — seeds all migrated schemas
 *   node src/db/seedData.js FCL1 CM3    — seeds specific schemas only
 */
import dotenv from 'dotenv';
dotenv.config();

import { db }  from './pool.js';
import Order   from '../models/Order.js';
import Invoice from '../models/Invoice.js';

// ── Reference data ────────────────────────────────────────────────────────────

const SALESPERSONS = ['SP001', 'SP002', 'SP003', 'SP004'];

const ROUTES = ['RT-NBI', 'RT-MSA', 'RT-KSM', 'RT-NKR', 'RT-ELD'];

const SECTORS = ['RETAIL', 'WHOLESALE', 'HORECA'];

const CUSTOMERS = [
  { no: 'C001', name: 'Sunrise Supermarket Ltd' },
  { no: 'C002', name: 'Westlands Grocers' },
  { no: 'C003', name: 'Mama Mboga Distributors' },
  { no: 'C004', name: 'Parklands Mini-Mart' },
  { no: 'C005', name: 'Nakuru Fresh Foods' },
  { no: 'C006', name: 'Coast Beverages & More' },
  { no: 'C007', name: 'Kisumu Trade Centre' },
  { no: 'C008', name: 'Eldoret Wholesale Hub' },
  { no: 'C009', name: 'Karen Deli & Provisions' },
  { no: 'C010', name: 'Thika Road Traders' },
  { no: 'C011', name: 'Mombasa Retail Network' },
  { no: 'C012', name: 'Nairobi City Caterers' },
];

const ITEMS = [
  { no: 'ITM001', desc: 'Mineral Water 500ml (24pk)',  uom: 'CTN',  price: 480  },
  { no: 'ITM002', desc: 'Mineral Water 1.5L (12pk)',   uom: 'CTN',  price: 720  },
  { no: 'ITM003', desc: 'Soft Drink 300ml (24pk)',     uom: 'CTN',  price: 960  },
  { no: 'ITM004', desc: 'Juice 1L Mango (12pk)',       uom: 'CTN',  price: 1440 },
  { no: 'ITM005', desc: 'Juice 1L Orange (12pk)',      uom: 'CTN',  price: 1440 },
  { no: 'ITM006', desc: 'Cooking Oil 1L (12pk)',       uom: 'CTN',  price: 2880 },
  { no: 'ITM007', desc: 'Cooking Oil 5L (4pk)',        uom: 'CTN',  price: 3840 },
  { no: 'ITM008', desc: 'Wheat Flour 2kg (10pk)',      uom: 'CTN',  price: 1800 },
  { no: 'ITM009', desc: 'Sugar 1kg (20pk)',            uom: 'CTN',  price: 2200 },
  { no: 'ITM010', desc: 'Rice Basmati 5kg',            uom: 'BAG',  price: 950  },
  { no: 'ITM011', desc: 'Milk UHT 500ml (24pk)',       uom: 'CTN',  price: 1680 },
  { no: 'ITM012', desc: 'Milk UHT 1L (12pk)',          uom: 'CTN',  price: 1800 },
  { no: 'ITM013', desc: 'Tomato Paste 400g (24pk)',    uom: 'CTN',  price: 2160 },
  { no: 'ITM014', desc: 'Salt 1kg (20pk)',             uom: 'CTN',  price: 600  },
  { no: 'ITM015', desc: 'Washing Powder 1kg (10pk)',   uom: 'CTN',  price: 2400 },
  { no: 'ITM016', desc: 'Bar Soap 175g (72pk)',        uom: 'CTN',  price: 2880 },
  { no: 'ITM017', desc: 'Toothpaste 75ml (24pk)',      uom: 'CTN',  price: 1920 },
  { no: 'ITM018', desc: 'Canned Tuna 185g (24pk)',     uom: 'CTN',  price: 3360 },
  { no: 'ITM019', desc: 'Instant Noodles (24pk)',      uom: 'CTN',  price: 720  },
  { no: 'ITM020', desc: 'Coffee 200g (12pk)',          uom: 'CTN',  price: 4320 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns a Date offset by `daysAgo` from today */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(rand(7, 17), rand(0, 59), rand(0, 59), 0);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

let orderSeq   = 1;
let invoiceSeq = 1;

function nextOrderNo(prefix)   { return `${prefix}-SO${String(orderSeq++).padStart(5, '0')}`; }
function nextInvoiceNo(prefix) { return `${prefix}-INV${String(invoiceSeq++).padStart(5, '0')}`; }

/** Generate a random alphanumeric string of given length */
function randAlphaNum(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars[rand(0, chars.length - 1)];
  return result;
}

function buildLines(orderNo) {
  const count = rand(1, 5);
  const chosen = [...ITEMS].sort(() => Math.random() - 0.5).slice(0, count);
  return chosen.map((item, i) => {
    const qty = rand(1, 20);
    return {
      lineNo:        (i + 1) * 10000,
      itemNo:        item.no,
      description:   item.desc,
      quantity:      qty,
      quantityBase:  qty,
      unitPrice:     item.price,
      lineAmount:    qty * item.price,
      unitOfMeasure: item.uom,
    };
  });
}

// ── Seed one company schema ────────────────────────────────────────────────────

async function seedCompany(companyId) {
  const prefix = companyId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  console.log(`\nSeeding [${companyId}]...`);

  // Reset counters per company so numbers start clean
  orderSeq   = 1;
  invoiceSeq = 1;

  const SYSTEM_USER = { id: 'system', name: 'Seed Script' };
  const USERS = [
    { id: 'usr-001', name: 'Alice Wanjiru'  },
    { id: 'usr-002', name: 'Brian Otieno'   },
    { id: 'usr-003', name: 'Caroline Mwangi'},
  ];

  // We'll create 40 orders spread over the past 90 days.
  // Workflow distribution:
  //   ~30 % — Open (recent, not yet acted on)
  //   ~20 % — Confirmed (confirmed by user, not yet invoiced)
  //   ~50 % — Invoiced, of which ~80 % are also Confirmed

  const TOTAL = 40;

  for (let i = 0; i < TOTAL; i++) {
    const customer  = pick(CUSTOMERS);
    const orderDate = daysAgo(rand(1, 90));
    const orderNo   = nextOrderNo(prefix);

    const bcUser = pick(USERS);
    const header = {
      orderNo,
      customerNo:       customer.no,
      customerName:     customer.name,
      salespersonCode:  pick(SALESPERSONS),
      routeCode:        pick(ROUTES),
      sectorCode:       pick(SECTORS),
      orderDate:        isoDate(orderDate),
      postingDate:      null,
      printingDatetime: new Date(orderDate.getTime() + rand(0, 30) * 60000).toISOString(),
      bcUserId:         bcUser.id,
    };
    const lines = buildLines(orderNo);

    // 1. Insert the order via the model (same path as the BC webhook)
    await Order.upsert(companyId, header, lines);
    await Order.audit(companyId, 'ORDER_RECEIVED', orderNo, 'Order', SYSTEM_USER.id, SYSTEM_USER.name, { source: 'seed' });

    const roll = Math.random();

    if (roll < 0.30) {
      // ── Open — nothing more to do ─────────────────────────────────────────
      process.stdout.write('  O');
      continue;
    }

    // 2. Confirm the order
    const confirmUser = pick(USERS);
    const confirmDate = new Date(orderDate.getTime() + rand(1, 3) * 86400000);
    await Order.confirm(companyId, orderNo, confirmUser.id, confirmUser.name);
    await Order.audit(companyId, 'ORDER_CONFIRMED', orderNo, 'Order', confirmUser.id, confirmUser.name, { confirmedAt: confirmDate.toISOString() });

    if (roll < 0.50) {
      // ── Confirmed but not yet invoiced ────────────────────────────────────
      process.stdout.write('  C');
      continue;
    }

    // 3. Move to invoice
    const invoiceNo   = nextInvoiceNo(prefix);
    const invoicedAt  = new Date(confirmDate.getTime() + rand(0, 2) * 86400000);
    const hasETIMS    = Math.random() > 0.4;

    const etimsNo = hasETIMS ? `ETIMS-${rand(100000, 999999)}` : null;
    const qrcodeUrl = hasETIMS
      ? `https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=${randAlphaNum(40)}`
      : null;

    const invPrintDatetime = new Date(invoicedAt.getTime() + rand(0, 15) * 60000);

    await Order.moveToInvoice(companyId, orderNo, {
      invoiceNo,
      invoicedAt:       invoicedAt.toISOString(),
      postingDate:      isoDate(invoicedAt),
      printingDatetime: invPrintDatetime.toISOString(),
      bcUserId:         header.bcUserId,
      etimsInvoiceNo:   etimsNo,
      etimsData:        hasETIMS ? { cu: `CU${rand(1000,9999)}`, vscu: `VSCU${rand(100,999)}` } : null,
      qrcodeUrl,
    });
    await Invoice.audit(companyId, 'INVOICE_CREATED', invoiceNo, 'Invoice', SYSTEM_USER.id, SYSTEM_USER.name, { originalOrderNo: orderNo });

    if (Math.random() < 0.80) {
      // 4. Confirm the invoice
      const invConfirmUser = pick(USERS);
      await Invoice.confirm(companyId, invoiceNo, invConfirmUser.id, invConfirmUser.name);
      await Invoice.audit(companyId, 'INVOICE_CONFIRMED', invoiceNo, 'Invoice', invConfirmUser.id, invConfirmUser.name, {});
      process.stdout.write('  I✓');
    } else {
      process.stdout.write('  I');
    }
  }

  console.log(`\n  ✓ [${companyId}] seeded ${TOTAL} orders.`);
}

// ── Auto-discover migrated schemas ─────────────────────────────────────────────

async function getMigratedSchemas() {
  await db.connect();
  const pool = await db.getPool();
  const result = await pool.request().query(`
    SELECT s.name
    FROM sys.schemas s
    JOIN sys.tables  t ON t.schema_id = s.schema_id AND t.name = 'SalesHeader'
    WHERE s.name NOT IN ('dbo', 'guest', 'INFORMATION_SCHEMA', 'sys')
    ORDER BY s.name
  `);
  return result.recordset.map(r => r.name);
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  try {
    await db.connect();

    const args     = process.argv.slice(2);
    const targets  = args.length ? args : await getMigratedSchemas();

    if (!targets.length) {
      console.error('No migrated schemas found. Run migrate first.');
      process.exit(1);
    }

    console.log(`Seeding ${targets.length} schema(s): ${targets.join(', ')}`);

    for (const companyId of targets) {
      await seedCompany(companyId);
    }

    console.log('\nAll schemas seeded.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    console.error(err.stack);
  } finally {
    await db.close();
    process.exit(0);
  }
})();
