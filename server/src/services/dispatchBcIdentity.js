// These are BC source identifiers, never local display/sequence numbers.
export function bcOrderIdentity(orderNo, lines) {
  const documentNo = String(orderNo ?? '').trim();
  if (!documentNo || documentNo.length > 40) throw new Error('Original BC order number is missing or invalid');
  const seen = new Set();
  const lineNumbers = lines.map(line => {
    const number = Number(line.LineNo);
    if (!Number.isInteger(number) || number <= 0 || number > 2147483647) throw new Error(`Original BC line number is missing or invalid for ${documentNo}`);
    if (seen.has(number)) throw new Error(`Duplicate BC line number ${number} for ${documentNo}`);
    seen.add(number);
    return number;
  });
  return {documentNo, lineNumbers};
}
