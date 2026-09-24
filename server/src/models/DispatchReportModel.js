import {compileBcTextFilter} from '../services/bcTextFilter.js';
import {db,sql} from '../db/pool.js';
export async function report(filters={}){
  const r=(await db.getPool()).request().input('from',sql.Date,filters.dateFrom||null).input('to',sql.Date,filters.dateTo||null);
  let parameter=0;
  const match=(columns,value)=>{if(!String(value||'').trim())return '1=1';return '('+columns.map(c=>compileBcTextFilter(`ISNULL(${c},'')`,value,v=>{const key='f'+parameter++;r.input(key,sql.NVarChar(1000),v);return '@'+key})).join(' OR ')+')'};
  const common=()=>`${match(['o.OrderNo'],filters.order)} AND ${match(['o.CustomerNo','o.CustomerName'],filters.customer)} AND ${match(['o.RouteCode'],filters.route)} AND ${match(['o.SalespersonName','o.SalespersonCode'],filters.salesperson)}`;
  const sets=(await r.query(`
    SELECT 'assembly' Stage,e.EventId EntryId,e.CreatedAt ActivityAt,e.Company,e.OrderNo,o.CustomerNo,o.CustomerName,o.RouteCode,o.SalespersonCode,o.SalespersonName,
      e.ItemNo,l.Description,l.Uom,e.Quantity,e.Pieces,e.BatchNo,e.WeightKg,s.UserName Operator,e.SessionId,
      s.StartedAt,s.EndedAt,e.Revision,e.CorrectionReason,'assembled' Status
    FROM dbo.DispatchAssemblyEvent e JOIN dbo.DispatchAssemblySession s ON s.SessionId=e.SessionId
      JOIN dbo.DispatchOrder o ON o.DispatchOrderId=e.DispatchOrderId JOIN dbo.DispatchOrderLine l ON l.LineId=e.LineId
    WHERE e.Revision=(SELECT MAX(x.Revision) FROM dbo.DispatchAssemblyEvent x WHERE x.LineId=e.LineId)
      AND (@from IS NULL OR DATEADD(HOUR,3,e.CreatedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,e.CreatedAt)<DATEADD(DAY,1,@to))
      AND ${match(['e.ItemNo','l.Description'],filters.item)} AND ${common()} AND ${match(["s.UserName"],filters.operator)}
    UNION ALL
    SELECT 'packing',bl.BoxLineId,bl.CreatedAt,o.Company,o.OrderNo,o.CustomerNo,o.CustomerName,o.RouteCode,o.SalespersonCode,o.SalespersonName,
      bl.ItemNo,bl.Description,l.Uom,bl.Qty,bl.Pieces,bl.BatchNo,bl.Weight,COALESCE(bl.PackedByName,ps.PackerName),ps.RunId,
      COALESCE(run.StartedAt,ps.CreatedAt),COALESCE(run.EndedAt,ps.EndedAt),NULL,NULL,CASE WHEN b.Status IN ('closed','loaded') THEN 'packed' ELSE 'ongoing' END
    FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId JOIN dbo.DispatchOrder o ON o.DispatchOrderId=b.DispatchOrderId
      LEFT JOIN dbo.DispatchOrderLine l ON l.LineId=bl.LineId LEFT JOIN dbo.DispatchPackingSession ps ON ps.SessionId=b.SessionId
      LEFT JOIN dbo.DispatchPackingRun run ON run.RunId=ps.RunId
    WHERE bl.VoidedAt IS NULL AND (@from IS NULL OR DATEADD(HOUR,3,bl.CreatedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,bl.CreatedAt)<DATEADD(DAY,1,@to))
      AND ${match(['bl.ItemNo','bl.Description'],filters.item)} AND ${common()} AND ${match(["COALESCE(bl.PackedByName,ps.PackerName,'')"],filters.operator)} ORDER BY ActivityAt DESC;
    SELECT o.DispatchOrderId,o.OrderNo,o.Company,o.CustomerNo,o.CustomerName,o.Status,o.ShipmentDate,o.RouteCode,o.SalespersonName,l.ItemNo,l.Description,l.OrderQty,l.Uom,
      a.AssembledQty,a.Pieces AssembledPieces,COALESCE(p.PackedQty,0) PackedQty,c.UserName ClaimedBy
    FROM dbo.DispatchOrder o JOIN dbo.DispatchOrderLine l ON l.DispatchOrderId=o.DispatchOrderId
      LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId LEFT JOIN dbo.DispatchOrderClaim c ON c.DispatchOrderId=o.DispatchOrderId
      OUTER APPLY(SELECT SUM(bl.Qty) PackedQty FROM dbo.DispatchBoxLine bl WHERE bl.LineId=l.LineId AND bl.VoidedAt IS NULL) p
    WHERE o.Confirmed=1 AND (@from IS NULL OR o.ShipmentDate>=@from) AND (@to IS NULL OR o.ShipmentDate<DATEADD(DAY,1,@to))
      AND ${match(['l.ItemNo','l.Description'],filters.item)} AND ${common()}
      AND (${match(['c.UserName','a.AssembledByName'],filters.operator)}
        OR EXISTS(SELECT 1 FROM dbo.DispatchBoxLine bl WHERE bl.LineId=l.LineId AND bl.VoidedAt IS NULL AND ${match(['bl.PackedByName'],filters.operator)}))
    ORDER BY o.ShipmentDate DESC,o.OrderNo;
    SELECT 'packing' Stage,RunId SessionId,UserName,CheckerName,StartedAt,EndedAt,DATEDIFF(SECOND,StartedAt,COALESCE(EndedAt,GETUTCDATE())) DurationSeconds
      FROM dbo.DispatchPackingRun s WHERE (@from IS NULL OR DATEADD(HOUR,3,StartedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,StartedAt)<DATEADD(DAY,1,@to))
        AND ${match(['UserName'],filters.operator)}
    UNION ALL SELECT 'assembly',SessionId,UserName,NULL,StartedAt,EndedAt,DATEDIFF(SECOND,StartedAt,COALESCE(EndedAt,GETUTCDATE()))
      FROM dbo.DispatchAssemblySession WHERE (@from IS NULL OR DATEADD(HOUR,3,StartedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,StartedAt)<DATEADD(DAY,1,@to))
        AND ${match(['UserName'],filters.operator)} ORDER BY StartedAt DESC;
    SELECT c.*,o.OrderNo,o.CustomerNo,o.CustomerName FROM dbo.DispatchOrderClaim c JOIN dbo.DispatchOrder o ON o.DispatchOrderId=c.DispatchOrderId WHERE ${common()} AND ${match(['c.UserName'],filters.operator)} AND (@from IS NULL OR DATEADD(HOUR,3,c.ClaimedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,c.ClaimedAt)<DATEADD(DAY,1,@to)) AND EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l WHERE l.DispatchOrderId=o.DispatchOrderId AND ${match(['l.ItemNo','l.Description'],filters.item)});
  `)).recordsets;
  return {activity:sets[0],orders:sets[1],sessions:sets[2],claims:sets[3]};
}

let lookupCache;
export async function reportLookups(){
 if(lookupCache&&lookupCache.expires>Date.now())return lookupCache.data;
 const sets=(await (await db.getPool()).request().query(`
 SELECT DISTINCT ItemNo value,CONCAT(ItemNo,' - ',Description) label FROM dbo.DispatchOrderLine;
 SELECT DISTINCT CustomerNo value,CONCAT(CustomerNo,' - ',CustomerName) label FROM dbo.DispatchOrder WHERE CustomerNo IS NOT NULL;
 SELECT DISTINCT OrderNo value,OrderNo label FROM dbo.DispatchOrder;
 SELECT DISTINCT RouteCode value,RouteCode label FROM dbo.DispatchOrder WHERE NULLIF(RouteCode,'') IS NOT NULL;
 SELECT DISTINCT SalespersonCode value,CONCAT(SalespersonCode,' - ',SalespersonName) label FROM dbo.DispatchOrder WHERE NULLIF(SalespersonCode,'') IS NOT NULL;
 SELECT DISTINCT UserName value,UserName label FROM dbo.DispatchAssemblySession UNION SELECT DISTINCT UserName,UserName FROM dbo.DispatchPackingRun;`)).recordsets;
 const data=Object.fromEntries(['item','customer','order','route','salesperson','operator'].map((key,i)=>[key,sets[i].filter(r=>r.value).sort((a,b)=>a.label.localeCompare(b.label))]));
 lookupCache={data,expires:Date.now()+300000};return data;
}
