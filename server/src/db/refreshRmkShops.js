import 'dotenv/config';
import { refreshRmkShopData } from '../services/rmkShopRefresh.js';
try {
  const result = await refreshRmkShopData();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length ? 1 : 0);
} catch (error) { console.error(error.message); process.exit(1); }
