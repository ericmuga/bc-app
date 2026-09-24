export function combinePaymentReferences(...values) {
  return [...new Set(values.flatMap(v => String(v || '').split(',')).map(v => v.trim()).filter(Boolean))].join(', ');
}
export function paymentReference(value) {
  const text = String(value || '').trim();
  if (text.length > 100) throw new Error('Payment reference must be at most 100 characters');
  return text || null;
}
