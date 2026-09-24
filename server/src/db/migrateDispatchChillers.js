import { db } from './pool.js';
import { migrateDispatchChillers } from './dispatchChillers.js';

try {
  await migrateDispatchChillers(await db.getPool());
  console.log('Dispatch chiller configuration and 166 initial item mappings are ready.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
