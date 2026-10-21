export const workerPaths = Object.freeze({
  assembly: '/dispatch/assembly',
  packing: '/dispatch/packing',
  loading: '/dispatch/loading',
  stocktake: '/dispatch/stocktakes',
});
export function workerRoutes(user) {
  return (user?.workerStages || []).map(stage => workerPaths[stage]).filter(Boolean);
}
export function workerLanding(user) {
  return workerRoutes(user)[0] || '/no-access';
}
