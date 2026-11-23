/**
 * routes/dispatchPacks.js
 * Pack sizes (from BC), numbered prepacks (assembler job) and the chiller DPL print.
 */
import * as packs from '../controllers/dispatchPackController.js';

export function registerDispatchPackRoutes(router, { canDispAssemble, canDispatch }) {
  router.get(   '/dispatch/pack-items',            ...canDispAssemble, packs.packItems);
  router.get(   '/dispatch/prepacks',              ...canDispAssemble, packs.listPrepacks);
  router.get(   '/dispatch/prepacks/stock',        ...canDispAssemble, packs.prepackStock);
  router.get(   '/dispatch/prepacks/lookup',       ...canDispAssemble, packs.lookupPrepack);
  router.get(   '/dispatch/prepacks/labels',       ...canDispAssemble, packs.prepackLabels);
  router.post(  '/dispatch/prepacks',              ...canDispAssemble, packs.createPrepacks);
  router.post(  '/dispatch/prepacks/:id/void',     ...canDispAssemble, packs.voidPrepack);
  router.get(   '/dispatch/orders/:id/dpl',        ...canDispatch,     packs.orderDpl);
}
