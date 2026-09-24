import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { ALL_COMPANIES, bcTable } from '../services/bcTables.js';
import { matchesPriceUnit } from '../services/posPriceUnit.js';

const clean = v => String(v || '').trim().toUpperCase();

// Refresh all company mirrors together. Read everything before atomically replacing
// BC prices, so a source failure cannot leave shops with a partial price list.
export async function syncShopPricesFromBc() {
  const out = { count: 0, shops: 0, priceGroups: [], pruned: 0, byCompany: {}, customerPrices: 0, errors: [] };
  try {
    const pool = await db.getPool();
    const source = await bcDb.getPool();
    const shops = (await pool.request().query(`SELECT * FROM dbo.PosShop WHERE IsActive=1`)).recordset;
    const mirrors = (await pool.request().query(`SELECT * FROM dbo.PosShopCompany`)).recordset;
    const items = (await pool.request().query(`SELECT ItemNo,VatPercent,SourceCompany,UnitOfMeasure,SalesUnitOfMeasure,BaseUnitOfMeasure FROM dbo.PosItem WHERE IsActive=1`)).recordset;
    out.shops = shops.length;
    if (!shops.length) return out;
    const rows = [];
    const groups = new Set();
    for (const company of ALL_COMPANIES) {
      const customerColumn = { FCL:'FclCustomerNo', CM:'CmCustomerNo', RMK:'RmkCustomerNo', FLM:'FlmCustomerNo' }[company];
      const mapped = shops.map(shop => {
        const mirror = mirrors.find(m => m.ShopCode === shop.Code && clean(m.Company) === company);
        const customer = mirror ? (mirror.IsActive ? mirror.CustomerNo : null) : shop[customerColumn];
        return { shop: shop.Code, customer: clean(customer) };
      }).filter(s => s.customer);
      if (!mapped.length) { out.byCompany[company] = 0; continue; }
      const customers = [...new Set(mapped.map(s => s.customer))];
      const req = source.request();
      const params = customers.map((c,i) => { req.input(`c${i}`,sql.NVarChar(20),c); return `@c${i}`; }).join(',');
      const customerRows = (await req.query(`SELECT [No_] CustomerNo,[Customer Price Group] PriceGroup
        FROM ${bcTable(company,'Customer')} WHERE [No_] IN (${params})`)).recordset;
      const groupByCustomer = new Map(customerRows.map(c => [clean(c.CustomerNo),clean(c.PriceGroup)]));
      const companyGroups = [...new Set(customerRows.map(c => clean(c.PriceGroup)).filter(Boolean))];
      companyGroups.forEach(g => groups.add(g));
      const pr = source.request();
      const cp = customers.map((c,i) => { pr.input(`c${i}`,sql.NVarChar(20),c); return `@c${i}`; }).join(',');
      const gp = companyGroups.map((g,i) => { pr.input(`g${i}`,sql.NVarChar(40),g); return `@g${i}`; }).join(',');
      const prices = (await pr.query(`SELECT [Item No_] ItemNo,[Sales Type] SalesType,[Sales Code] SalesCode,
        [Unit Price] UnitPrice,[Price Includes VAT] PriceInclVat,[Unit of Measure Code] Uom,
        CAST([Starting Date] AS date) StartingDate,
        CASE WHEN [Ending Date] <= '1753-01-01' THEN NULL ELSE CAST([Ending Date] AS date) END EndingDate
        FROM ${bcTable(company,'Sales Price')}
        WHERE (([Sales Type]=0 AND [Sales Code] IN (${cp}))
          ${gp ? `OR ([Sales Type]=1 AND [Sales Code] IN (${gp}))` : ''})
          AND [Unit Price]<>0 AND ISNULL([Minimum Quantity],0)<=1
          AND ISNULL([Variant Code],'')='' AND ISNULL([Currency Code],'')=''`)).recordset;
      const catalogue = new Map(items.filter(i => clean(i.SourceCompany || 'FCL') === company).map(i => [clean(i.ItemNo),i]));
      let count = 0;
      for (const shop of mapped) {
        const selected = new Map();
        for (const p of prices) {
          const customerPrice = Number(p.SalesType) === 0;
          if (clean(p.SalesCode) !== (customerPrice ? shop.customer : groupByCustomer.get(shop.customer))) continue;
          const item = catalogue.get(clean(p.ItemNo));
          if (!item || !matchesPriceUnit(p.Uom, item)) continue;
          if (p.EndingDate && p.EndingDate < p.StartingDate) continue;
          const price = Number(p.UnitPrice) * (p.PriceInclVat ? 1 : 1 + Number(item.VatPercent || 0)/100);
          const row = { itemNo:clean(p.ItemNo), shopCode:shop.shop, unitPrice:Math.round(price*10000)/10000,
            startingDate:p.StartingDate || new Date('1753-01-01'), endingDate:p.EndingDate,
            description:`BC ${company} ${customerPrice ? 'customer' : 'group'} ${clean(p.SalesCode)}`,
            source:customerPrice ? 'BC_CUSTOMER' : 'BC' };
          const key = [row.itemNo,row.source,row.startingDate.toISOString(),row.endingDate?.toISOString()].join('|');
          if (!selected.has(key) || selected.get(key).unitPrice > row.unitPrice) selected.set(key,row);
        }
        rows.push(...selected.values());
        count += selected.size;
      }
      out.byCompany[company] = count;
    }
    out.priceGroups = [...groups];
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const deleted = await new sql.Request(tx).query(`DELETE p FROM dbo.PosSpecialPrice p
        JOIN dbo.PosShop s ON s.Code=p.ShopCode WHERE s.IsActive=1 AND p.Source IN ('BC','BC_CUSTOMER');
        SELECT @@ROWCOUNT N;`);
      for (let i=0;i<rows.length;i+=500) {
        await new sql.Request(tx).input('rows',sql.NVarChar(sql.MAX),JSON.stringify(rows.slice(i,i+500))).query(`
          INSERT dbo.PosSpecialPrice(ItemNo,ShopCode,UnitPrice,StartingDate,EndingDate,Description,Source,IsActive)
          SELECT itemNo,shopCode,unitPrice,startingDate,endingDate,description,source,1
          FROM OPENJSON(@rows) WITH (itemNo nvarchar(30),shopCode nvarchar(50),unitPrice decimal(18,4),
            startingDate date,endingDate date,description nvarchar(200),source nvarchar(20));`);
      }
      await tx.commit();
      out.pruned = deleted.recordset[0].N;
      out.count = rows.length;
      out.customerPrices = rows.filter(r => r.source === 'BC_CUSTOMER').length;
    } catch(e) { await tx.rollback(); throw e; }
  } catch(e) { out.errors.push(e.message); }
  return out;
}
