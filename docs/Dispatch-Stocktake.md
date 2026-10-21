# Chiller stock take

Dispatch → Chiller stock take is available to chiller attendants, assemblers, dispatch supervisors and admins. Select company, location code and chiller, then start a timed counting session. Open existing sessions from the history list to resume or export them; filter by company, chiller and Nairobi date range.

Scan a barcode (scanner sends Enter), type an item number, or select an item by number/name/barcode. Items and units come from the app's company-specific BC cache. Refresh items and units in Dispatch Admin when missing. Items mapped to another chiller can be counted where physically found; the screen warns about the mapping. Ambiguous barcodes require manual selection.

Record the total quantity for each item/UOM/batch, not an increment. PC quantities are whole pieces; other units accept four decimal places and an optional piece count. Batch is 4–5 alphanumeric characters or blank for unlabelled stock. Edit a counted line to replace its total, including zero. Concurrent stale edits are rejected rather than silently overwriting counts. The owner or a supervisor can edit; other attendants and assemblers can view/export. Only one open session is allowed per company/location/chiller.

Complete locks the session. Further recounts use a new session. Excel export contains session metadata plus every counted line, including zero counts, batch, units, pieces, captured KG conversion, counted-at time, user and revision. Export is available during counting and after completion; in-progress exports are labelled accordingly. Missing KG conversions stay blank rather than appearing as zero stock weight.

`DispatchStocktake`, `DispatchStocktakeLine` and `DispatchStocktakeEvent` are created by the existing startup chiller migration. Count changes and completion are transactionally audited. Physical counts do not post movements, overwrite balances, or write to BC. Reconciliation remains `awaiting-intray` until WMS opening balances and inbound transfers can be aligned by company, location, chiller, item, UOM/batch and count timestamp. A completed session also records its completion time, so movements during counting can be accounted for by the future reconciliation process.

## Session counting and mapping

Select the chiller, company and location, then start a session. Search the item dropdown or scan its barcode to open the count modal. Enter pieces to calculate KG using cached BC piece conversions, or enter measured KG. Save displays the item in the counted list. Selecting the same item again opens its saved count with a warning; correct its total instead of adding a duplicate. Existing historical batch lines remain editable from the list.

End stock take closes even an empty session and makes its saved counts read-only. Counts remain exportable and await WMS reconciliation. Chiller attendants, supervisors and admins can keep the mapping checkbox selected to map the counted item to the session chiller in the same transaction. This follows the existing shared item/chiller mapping across companies and updates cached item rules; JF-SAUSAGE must remain in CHILLER U. Assemblers can count but cannot update mappings.
