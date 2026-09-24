// BC Contact extension Route Code is Text[100], including full route names.
export const CONTACT_ROUTE_LENGTH = 100;
export function contactRoute(value) {
  const route = String(value ?? '').trim();
  if (route.length > CONTACT_ROUTE_LENGTH) throw new Error('Contact route code exceeds 100 characters');
  return route || null;
}
