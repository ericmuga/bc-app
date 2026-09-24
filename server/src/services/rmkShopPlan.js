// BC Customer Ext field 63014: Customer, Student, Staff, Shop.
export const RMK_SHOP_CUSTOMER_TYPE = 3;
const norm = value => String(value || '').trim().toUpperCase();

export function planRmkShops(customers, existing) {
  const shops = existing.map(s => ({ ...s }));
  return customers.map(customer => {
    const no = norm(customer.No);
    if (!no) throw new Error('RMK shop customer number is required');
    const mapped = shops.filter(s => norm(s.RmkCustomerNo) === no);
    if (mapped.length > 1) throw new Error(`RMK customer ${no} is mapped to multiple shops`);
    const names = shops.filter(s => norm(s.Name) === norm(customer.Name) && !norm(s.RmkCustomerNo));
    if (!mapped.length && names.length > 1) throw new Error(`Ambiguous existing shop name for RMK customer ${no}`);
    const match = mapped[0] || names[0];
    const code = match?.Code || `RMK-${no}`;
    if (!match && shops.some(s => norm(s.Code) === code)) throw new Error(`Shop code ${code} already belongs to another customer`);
    const row = { ...customer, No: no, Code: code, action: match ? 'update' : 'insert' };
    if (match) match.RmkCustomerNo = no;
    else shops.push({ Code: code, Name: customer.Name, RmkCustomerNo: no });
    return row;
  });
}
