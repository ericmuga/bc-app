import 'dotenv/config';
import { syncRmkShops } from '../models/RmkShopImportModel.js';

try {
  const result = await syncRmkShops({ dryRun: !process.argv.includes('--apply') });
  if (!result.dryRun) {
    const { refreshRmkShopData } = await import('../services/rmkShopRefresh.js');
    result.refresh = await refreshRmkShopData();
    result.errors.push(...result.refresh.errors);
  }
  console.log(JSON.stringify({ ...result, shops: result.shops.map(s => ({
    code: s.Code, customerNo: s.No, name: s.Name, location: s.LocationCode, action: s.action,
  })) }, null, 2));
  process.exit(result.errors.length ? 1 : 0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
