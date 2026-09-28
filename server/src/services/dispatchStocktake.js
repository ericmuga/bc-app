export function validateCount(body) {
  const itemNo = String(body.itemNo || '').trim().toUpperCase();
  const uom = String(body.uom || '').trim().toUpperCase();
  const batchNo = String(body.batchNo || '').trim().toUpperCase();
  if (!itemNo || itemNo.length > 30 || !uom || uom.length > 20) throw new Error('Select an item and unit of measure');
  if (batchNo && !/^[A-Z0-9]{4,5}$/.test(batchNo)) throw new Error('Batch must be 4 or 5 letters/numbers, or blank for unlabelled stock');
  if (body.quantity === null || body.quantity === undefined || body.quantity === '' || typeof body.quantity === 'boolean') throw new Error('Enter the counted quantity');
  const quantity = Number(body.quantity), revision = Number(body.revision ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 999999999 || Math.abs(quantity * 10000 - Math.round(quantity * 10000)) > 0.001) throw new Error('Quantity must be between 0 and 999999999 with at most 4 decimals');
  const pieceUnit = /^(PC|PCS|PCE|PIECE|PIECES)$/.test(uom);
  if (pieceUnit && !Number.isInteger(quantity)) throw new Error('Piece quantities must be whole numbers');
  const pieces = pieceUnit ? quantity : body.pieces == null || body.pieces === '' ? null : Number(body.pieces);
  if (pieces !== null && (!Number.isInteger(pieces) || pieces < 0 || pieces > 999999999)) throw new Error('Pieces must be a non-negative whole number');
  if (!Number.isInteger(revision) || revision < 0) throw new Error('Invalid count revision');
  return {itemNo, uom, batchNo, quantity, pieces, revision};
}

export function assertCanCount(session, user) {
  if (!session) throw new Error('Stock take not found');
  if (session.CompletedAt) throw new Error('Completed stock takes are read-only. Start a new count for corrections');
  if (session.UserId !== String(user.userId) && !['admin', 'dispatch-supervisor'].includes(user.role)) throw new Error('Only the counter or a supervisor can change this stock take');
}
