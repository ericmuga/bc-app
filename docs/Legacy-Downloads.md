# Legacy and live downloads

The source selector now shows **Current** and **Legacy** for CM, FCL, FLM and RMK. Current includes 2025-01-06 onward; Legacy includes earlier dates. Old `*-LIVE` keys alias `*-CUR`. See [Warehouse download ETL](Warehouse-Download-ETL.md) for the installed two-hour refresh and automatic warehouse cutover.

| Sources | Server | Database / tables |
| --- | --- | --- |
| CM, FCL, FLM legacy | 172.16.10.9 | `fcl-bc-main`, classic NAV company tables |
| RMK legacy | 172.16.10.9 | `rm-bc`, RMK tables |
| Four Current sources | FCLWHS on 172.16.10.9 after bootstrap | `DL_*` mirrors; ERP on 172.16.10.8 during bootstrap |

The live server is overridable through `LEGACY_LIVE_DB_HOST`; the live database follows `BC_DB_NAME`. Legacy host configuration remains `LEGACY_DB_HOST`. Connections are cached by both host and database. This feature only reads data; no migration is required.

## Value Entries

Available for all four legacy and live companies, with detail and summary by item/inventory posting group. Includes quantities, actual and expected costs, actual and expected sales/purchases, document/source references, and posting groups. Inventory posting group filters use the group recorded on the value entry. Other legacy item reports retain their Item-card posting-group filter. Current report layouts match the ERP datasets.

Customer filtering on Value Entries and Item Ledger Entries restricts Source Type to Customer as well as matching the customer code.

## Searchable filters

Inventory Posting Group, Item, Customer, and Vendor filters offer searchable suggestions from their master tables, wherever the dataset supports that filter. Posting groups come from **Inventory Posting Group**, not a distinct list of transaction groups. Codes are trimmed, normalized, and deduplicated before limiting results. Search matches code or description; at most 100 suggestions are shown, with a message to narrow the search when more exist.

Lookups are scoped to the selected source/company. Legacy RMK lookups use `rm-bc`. Current master lookups use the same ready warehouse mirror or ERP fallback as their reports. Dropdown selection matches an exact code. Users can instead type a BC text expression:

| Expression | Meaning |
| --- | --- |
| `JF*` | Starts with JF |
| `*JF*` | Contains JF |
| `JF?` | JF followed by one character |
| `JF*\|JG*` | Either prefix |
| `JF*&<>JF99` | JF prefix excluding JF99 |
| `JF01..JF99` | Inclusive code range |
| `..JF99` or `JF01..` | Open-ended range |
| `>=JF01` | Comparison |
| `@jf*` | Case-insensitive prefix |
| `'JF*'` | Literal code containing an asterisk |

`&` combines conditions, `|` provides alternatives, and parentheses group them. SQL wildcard characters `%`, `_`, and `[` are treated literally. Quotes around literal codes are supported, with doubled apostrophes inside them. This is a text-filter implementation; BC date formulas are not accepted in these text controls. Dates use the existing date pickers.

Preview, detail/summary, Excel and streamed CSV share the same parameterized filter compiler. Unknown sources or malformed expressions are rejected. Existing role restrictions and export row limits remain in place.

## Verification

Run `node --test tests/legacy-reports.mjs`. The implementation was also checked against the configured databases: all source/dataset detail and summary queries compiled, all lookup types were queried, and bounded Value Entry preview/Excel/CSV query results matched for each of the eight legacy/live companies. Client production build passed.
