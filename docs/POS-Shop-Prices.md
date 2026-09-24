# Shop customer prices

Run **Shop Prices** in the sync centre to refresh both customer-specific and customer-price-group sales prices from BC. All company mirrors refresh together. Each mirror uses its own BC customer number and that customer's price group; FCL customer numbers are never used to look up CM, RMK or FLM prices.

For each item, a valid shop customer price takes precedence over a valid price-group price, even when the customer price is higher. Date limits are inclusive. Open-ended prices remain valid after their start date. The latest starting date wins overlapping prices of the same type. Existing manual shop offers remain explicit overrides; without a valid offer, the item-card price applies.

The terminal uses today's Nairobi date for a new cart and the order's Nairobi creation date when loading the catalogue for a resumed order. Saved order lines retain their agreed prices. Prices are converted to VAT-inclusive amounts where necessary. Only the item's BC sales unit of measure (falling back to its BC base unit, or an unspecified price unit), local currency, no variant and minimum quantity at most one are supported; quantity-break pricing is not applied to single-unit sales.

Future and historical windows are retained. Synced customer prices have source `BC_CUSTOMER`, group prices `BC`, and descriptions identify the company and customer/group code. Refresh is atomic and chunked in batches of 500; a failed source read preserves the previous cache, and manual offers are retained.

SQL pricing tests (temporary table variables only): run from `server` with `POS_PRICE_SQL_TEST=1`, using `node --test ../tests/pos-shop-prices.mjs`.

BC unit matching uses `SalesUnitOfMeasure` / `BaseUnitOfMeasure`, not the eTIMS quantity or packaging code stored in `UnitOfMeasure`. For example, CM customer B2235 prices in PC apply even when the eTIMS unit is U. All six historical/current rows for BJ31015201, BJ31015310 and BJ31015501 are retained.
