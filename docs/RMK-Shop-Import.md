# RMK SHOP customers in POS

RMK Customer Ext field 63014 (`Customer Type`) has options
`Customer,Student,Staff,Shop`: SHOP is numeric value **3**, verified from BC
application object metadata. Import only unblocked, non-privacy-blocked customers.

In Admin Setup > POS Setup > Shops / Terminals, **Import RMK shops** adds or
updates the shops, RMK company mirrors and walk-in/customer accounts together.
The existing RMK shops and walk-ins sync steps use the same importer.

The RMK shops import action then refreshes categories and eligible POS items,
followed by stock for each distinct configured RMK location. New locations get
an opening balance from the net BC ledger; existing locations pull entries after
their saved watermark. Shared locations are refreshed once, avoiding duplicate
stock for the three STR002 shop accounts. A missing location is reported and
skipped. These watermarks participate in the existing enabled 10-minute ledger
pull scheduler (sales, adjustments and transfers).

To repeat only item/category and ledger refreshes from `server`, run
`node src/db/refreshRmkShops.js`. Refreshes upsert items without wiping or pruning.

For command-line use, from `server`:

```powershell
node src/db/importRmkShops.js          # read-only preview
node src/db/importRmkShops.js --apply  # apply the additive import
```

New shop codes are `RMK-<Customer No.>`. Salesperson codes are not identities:
they may be blank or shared. Existing RMK customer mappings are reused first,
then a unique matching shop name without an RMK mapping. Ambiguous identities
or conflicting contacts fail the transaction rather than overwrite another shop.
Other company mirrors, cashier assignments and walk-ins are preserved. The
importer uses a transaction and application lock so reruns do not create duplicates.

Each imported account is the RMK shop's walk-in and is also available in its POS
customer selector. Cashiers still need the appropriate shop assignment.

RMK contact sync now loads all non-privacy-blocked BC RMK contacts, regardless
of salesperson, in 500-row batches into `PosRmkContact`. This company-specific
cache avoids overwriting another company's contact with the same number. Its
replacement is atomic; contacts removed or privacy-blocked in BC disappear on
the next successful sync. Every active RMK shop receives the same searchable
list, plus local RMK contacts and RMK shop accounts, deduplicated by contact
number. Other companies retain their existing shop-level contact scope.

Initial import: six shops (C00600, C00601, C00602, C00650, C00700, C00750).
C00700 (SEMEN SALES) has no location in BC; configure its location before stock
operations. Existing multi-company shop header settings remain intact; RMK
customer/location/salesperson details live in the RMK company mirror.
