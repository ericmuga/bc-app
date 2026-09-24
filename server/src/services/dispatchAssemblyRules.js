export function validateAssemblyWrite(line, body, user, bypass) {
  if (!line || !line.Active || !line.Confirmed || !['confirmed', 'assigned', 'assembling'].includes(line.Status)) throw new Error('Order line is not available for assembly');
  if (!['admin', 'dispatch-supervisor', 'assembler', 'packer'].includes(user.role)) throw new Error('Assembly permission required');
  if (line.Assembled || line.Completed) throw new Error('This line is already completed');
  if (!bypass && !['admin', 'dispatch-supervisor'].includes(user.role) && String(line.AssignedToUserId) !== String(user.userId)) throw new Error('This part is assigned to another assembler');
  if (bypass && (!line.Chiller || body.chiller !== line.Chiller)) throw new Error('Select the mapped chiller before assembling this item');
  if (body.assembledQty == null || !Number.isFinite(Number(body.assembledQty)) || Number(body.assembledQty) < 0) throw new Error('A non-negative assembled quantity is required');
  if (Number(body.assembledQty) !== Number(line.OrderQty) && !String(body.returnReasonCode || '').trim()) throw new Error('Return reason is required when quantity differs');
  if ((line.IsWeighted || body.assembledWeight != null) && (body.assembledWeight == null || !Number.isFinite(Number(body.assembledWeight)) || Number(body.assembledWeight) < 0)) throw new Error('A non-negative weight is required');
}
