import { hasReportRole, POS_REPORT_ALL_SHOPS_ROLES } from '../../../shared/reportAccess.mjs';

export const canReadAllShops = role => hasReportRole(role, POS_REPORT_ALL_SHOPS_ROLES);

// Only reporting roles can choose another shop. An unassigned cashier/chef
// must never fall through to an unfiltered (all-shops) query.
export async function reportShopCode(req, getUserShopCode) {
  if (canReadAllShops(req.user.role)) return String(req.query.shopCode || '').trim().toUpperCase() || null;
  const own = await getUserShopCode(req.user.userId);
  if (!own) throw new Error('No shop assigned to your account');
  return own;
}
