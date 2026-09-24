# Reporting and analytics

The sidebar and `/analytics` group reports under Sales, Finance, Costing,
Inventory, Production, and Downloads & Data. Empty categories are hidden.
POS Reports is under Sales; kitchen reports are under Production.

`shared/reportAccess.mjs` defines the report catalogue and permissions, shared
by the client route guards and server. Deploy the `shared` folder alongside
`server` when deploying the API. Admin role preview changes the visible list;
API authorization continues to use the authenticated user's actual role.

| Role | Report access |
| --- | --- |
| admin | All reports and existing administration |
| analyst | Sales/POS, finance, inventory, all downloads, warehouse monitoring |
| finance | Sales/POS, finance, inventory, all downloads |
| sales / sales-admin | Sales/POS, sales targets, sales invoice/credit memo downloads |
| costing | Costing, inventory, purchasing/value/item ledger/slaughter downloads |
| production | Inventory, purchase receipt/item ledger/slaughter downloads |
| shop-admin | POS and kitchen reports |
| shop / chef | POS reports for their assigned shop; chef also has kitchen reports |
| dispatch / security / dispatch-stage roles | Existing operational screens; no general report access |

Sales-admin retains existing kitchen/POS management access. Read access does
not grant POS writes or warehouse job execution. Legacy catalogue, preview,
lookup and export all enforce dataset permissions. Cashiers and chefs cannot
override their shop through report query parameters; unassigned accounts fail
instead of querying all shops.

## Legacy master dropdowns

- Customers: warehouse `dbo.ALLCUSTOMERS`.
- Items: warehouse `dbo.ALLITEMS`.
- Vendors: warehouse `dbo.dim_ALLVENDORS`, scoped by company.
- Inventory posting groups: union of the four warehouse download master tables.
- Each list also includes matching selected-source masters, retaining historical
  codes and current source descriptions. G/L accounts use the selected source.

ALLCUSTOMERS and ALLITEMS are globally deduplicated views. Their COMPANY is the
chosen canonical record's company, not complete company membership, so these
two views are deliberately searched across companies. Selecting a suggestion
still filters only the chosen report company and period.

Search matches code/name or BC text expressions (`JF*`, `JF*|JG*`, etc.). Results
are normalized, deduplicated and limited to 100; type more to narrow. The API
caches results for five minutes, caps its cache at 256 entries and shares
concurrent identical requests. Keys include source, master and search text.
Failed queries can fall back to the available source with a notice; a completely
failed lookup is not cached. Typed filters remain available.
