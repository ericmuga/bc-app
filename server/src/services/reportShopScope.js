import { hasReportRole, POS_REPORT_ALL_SHOPS_ROLES } from '../../../shared/reportAccess.mjs';

export const canReadAllShops = role => hasReportRole(role, POS_REPORT_ALL_SHOPS_ROLES);

// Only reporting roles can choose another shop. An unassigned cashier/chef
// must never fall through to an unfiltered (all-shops) query.
export async function reportShopCode(req, getUserShopCode, listUserShopCodes = null) {
  if (canReadAllShops(req.user.role)) return String(req.query.shopCode || '').trim().toUpperCase() || null;
  const own = await getUserShopCode(req.user.userId);
  const selected=String(req.query.shopCode||'').trim().toUpperCase();
  if(selected&&listUserShopCodes){const allowed=await listUserShopCodes(req.user.userId);if(selected===String(own||'').toUpperCase()||allowed.includes(selected))return selected;throw new Error('Shop not assigned to your account')}
  if (!own) throw new Error('No shop assigned to your account');
  return own;
}
