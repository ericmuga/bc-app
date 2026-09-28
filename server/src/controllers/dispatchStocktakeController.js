import XLSX from 'xlsx-js-style';
import * as Stocktake from '../models/DispatchStocktakeModel.js';

const action = fn => async(req,res) => {
  try { res.json(await fn(req)); }
  catch(e) { res.status(400).json({error:e.message}); }
};
export const catalog = action(r => Stocktake.catalog(r.query.company));
export const list = action(r => Stocktake.list(r.query));
export const detail = action(r => Stocktake.detail(r.params.id));
export const start = action(r => Stocktake.start(r.body,r.user));
export const save = action(r => Stocktake.saveCount(r.params.id,r.body,r.user));
export const complete = action(r => Stocktake.complete(r.params.id,r.user));
export async function exportExcel(req,res) {
  try {
    const session = await Stocktake.detail(req.params.id);
    const workbook = XLSX.utils.book_new();
    const metadata = [
      ['Session ID',session.StocktakeId],['Company',session.Company],['Location',session.LocationCode],['Chiller',session.Chiller],
      ['Counter',session.UserName],['Started (UTC)',session.StartedAt.toISOString()],
      ['Completed (UTC)',session.CompletedAt?.toISOString() || 'In progress'],['Reconciliation',session.ReconciliationStatus],
      ['Note','Physical counts only. WMS in-tray/opening balance is not connected; no stock adjustment has been posted.'],
      ['Weight','KG uses the cached BC item UOM factor captured at counting time. Blank KG means no conversion is available.'],
    ];
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(metadata),'Session');
    const headers = ['Session ID','Company','Location','Chiller','Item No','Description','UOM','Batch','Counted quantity','Pieces','KG per UOM','Weight KG','Tonnes','Counted at UTC','Counted by','Revision'];
    const lines = session.lines.map(l => [session.StocktakeId,session.Company,session.LocationCode,session.Chiller,l.ItemNo,l.Description,l.Uom,l.BatchNo,l.Quantity,l.Pieces,l.KgPerUom,l.WeightKg,l.WeightKg == null ? null : l.WeightKg/1000,l.CountedAt.toISOString(),l.CountedBy,l.Revision]);
    const sheet = XLSX.utils.aoa_to_sheet([headers,...lines]);
    sheet['!autofilter'] = {ref:sheet['!ref']};
    sheet['!cols'] = headers.map((h,i) => ({wch:i === 5 ? 40 : i === 0 ? 38 : 20}));
    XLSX.utils.book_append_sheet(workbook,sheet,'Counts');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="chiller-stocktake-${session.StocktakeId}.xlsx"`);
    res.send(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
  } catch(e) { res.status(400).json({error:e.message}); }
}
