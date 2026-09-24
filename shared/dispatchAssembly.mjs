export const isWeightUnit = uom => ['KG','KGS','KILO','KILOGRAM','KILOGRAMS','G','GRAM','GRAMS','LB','LBS'].includes(String(uom || '').trim().toUpperCase());
export function assemblyValues(line, body) {
  const weighted = isWeightUnit(line.Uom) || !!line.IsWeighted;
  const pieces = Number(body.pieces);
  if (body.pieces == null || !Number.isSafeInteger(pieces) || pieces < 0 || pieces > 2147483647) throw new Error('Enter a whole, non-negative number of pieces');
  const qty = weighted ? Number(body.assembledWeight) : pieces;
  if (weighted && (body.assembledWeight == null || !Number.isFinite(qty) || qty < 0)) throw new Error('Enter a non-negative weight');
  if (qty > 0 && pieces === 0) throw new Error('Pieces are required for a positive assembled weight');
  const batch = String(body.batchNo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,5}$/.test(batch)) throw new Error('Batch number must contain 4 or 5 letters or digits');
  const differs = Math.abs(qty - Number(line.OrderQty)) > 0.00005;
  const reason = differs ? String(body.returnReasonCode || (qty < Number(line.OrderQty) ? 'SHORT_SUPPLY' : 'WEIGHT_DIFFERENCE')).trim() : null;
  if (reason && !['SHORT_SUPPLY','WEIGHT_DIFFERENCE'].includes(reason)) throw new Error('Select short supply or weight difference');
  const unit = String(line.Uom || '').trim().toUpperCase();
  const kgFactor = ['G','GRAM','GRAMS'].includes(unit) ? 0.001 : ['LB','LBS'].includes(unit) ? 0.45359237 : 1;
  return { qty, weight: weighted ? Math.round(qty * kgFactor * 10000) / 10000 : 0, pieces, batch, reason,
    reasonName: reason === 'SHORT_SUPPLY' ? 'Short supply' : reason === 'WEIGHT_DIFFERENCE' ? 'Weight difference' : null };
}
