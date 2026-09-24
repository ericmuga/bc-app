// UnitOfMeasure may contain an eTIMS quantity/packaging code (e.g. U).
// BC sales prices must match the BC unit used for the item's selling price.
export function matchesPriceUnit(priceUnit, item) {
  const clean = value => String(value || '').trim().toUpperCase();
  const salesUnit = clean(item.SalesUnitOfMeasure) || clean(item.BaseUnitOfMeasure) || clean(item.UnitOfMeasure);
  return !clean(priceUnit) || clean(priceUnit) === salesUnit;
}
