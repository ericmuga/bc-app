/**
 * controllers/dispatchPackController.js
 * Pack sizes, numbered prepacks and the chiller DPL print.
 */
import * as Prepacks from '../models/DispatchPrepackModel.js';
import { getAssemblyOrder } from '../models/DispatchModel.js';
import { db, sql } from '../db/pool.js';
import { buildDplPdf, buildPrepackLabelsPdf } from '../services/dispatchPackPdf.js';
import { ensurePrepackSchema } from '../db/dispatchPrepacks.js';

const action = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: e.message }); } };
const pdf = (fn) => async (req, res) => {
  try {
    const { name, buffer } = await fn(req);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.send(buffer);
  } catch (e) { res.status(400).json({ error: e.message }); }
};
const userOf = (req) => ({ userId: req.user?.userId, userName: req.user?.userName || req.user?.name || req.user?.username || '' });

export const packItems = action((r) => Prepacks.listPackItems(r.query.company));
export const listPrepacks = action((r) => Prepacks.listPrepacks(r.query));
export const prepackStock = action((r) => Prepacks.prepackStock(r.query.company));
export const createPrepacks = action((r) => Prepacks.createPrepacks(r.body, userOf(r)));
export const voidPrepack = action((r) => Prepacks.voidPrepack(r.params.id, r.body?.reason, userOf(r)));
export const lookupPrepack = action((r) => Prepacks.lookupForLine(r.query.no, r.query.lineId));

export const prepackLabels = pdf(async (r) => {
  await ensurePrepackSchema();
  const ids = String(r.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!ids.length) throw new Error('Select prepacks to print');
  const pool = await db.getPool();
  const req = pool.request();
  const ps = ids.map((id, i) => { req.input(`p${i}`, sql.UniqueIdentifier, id); return `@p${i}`; });
  const rows = (await req.query(`SELECT * FROM dbo.DispatchPrepack WHERE PrepackId IN (${ps.join(',')}) ORDER BY PrepackNo`)).recordset;
  return { name: `prepacks-${rows[0]?.PrepackNo || 'labels'}.pdf`, buffer: await buildPrepackLabelsPdf(rows) };
});

/** DPL for an order, one section per chiller; ?chiller= prints only that chiller. */
export const orderDpl = pdf(async (r) => {
  const order = await getAssemblyOrder(r.params.id, null);
  if (!order) throw new Error('Dispatch order not found');
  const chiller = r.query.chiller ? String(r.query.chiller) : null;
  const buffer = buildDplPdf(order, { chiller, printedBy: userOf(r).userName });
  return { name: `DPL-${order.OrderNo || order.DispatchNo}${chiller ? '-' + chiller.replace(/\W+/g, '') : ''}.pdf`, buffer };
});
