// These SQL fragments use alias sp and the Nairobi order date bound as @priceDate.
export const priceWindowSql = `sp.[IsActive]=1 AND sp.[StartingDate]<=@priceDate
  AND (sp.[EndingDate] IS NULL OR sp.[EndingDate]>=@priceDate)`;
export const pricePrioritySql = `CASE WHEN sp.[ShopCode] IS NULL THEN 1 ELSE 0 END,
  CASE sp.[Source] WHEN 'MANUAL' THEN 0 WHEN 'BC_CUSTOMER' THEN 1 ELSE 2 END,
  sp.[StartingDate] DESC, sp.[UnitPrice] ASC, sp.[SpecialPriceId]`;
