# Finished-good production costs

Open Analytics → Costing → FG Production Costs (Live). Access: admin, costing, finance, analyst and production. Data is read directly from the live ERP host 172.16.10.8, pinned for this report, for the selected FCL, CM, FLM and RMK mirrors; warehouse snapshots are not used.

Select one or more companies (all four are selected initially). Enter an FG item-code expression (BC wildcards, e.g. BJ* or ITEM1|ITEM2), date range up to 93 days and 1–5 ingredient levels. Export the FG totals and filtered detail rows to Excel. Quantities are in each item’s base UOM; never sum unlike units. Costs are company LCY, with actual and expected shown separately.

Dates select Item Ledger Entry output (6) and positive adjustment (2) postings. Consumption (5) links by company, production order and production order line. Full production-line consumption is allocated to each selected FG output using its quantity divided by net total output for that production line, including postings outside the selected period. Multiple FG items on a production line, missing links and non-positive output totals stop allocation and are identified in Trace status. Positive adjustments are listed separately with no invented ingredients.

Value Entries are summed per Item Ledger Entry before use, so multiple valuation records cannot multiply ledger quantities. All currently recorded costs are included, including later adjustments; this is not an as-of historical valuation. Output cost includes capitalized production costs; direct ingredient cost excludes other production overhead. Summary cost per output unit uses actual output cost.

Level 1 lists directly consumed ingredients. Deeper levels follow Item Application Entry links from consumption to inbound production outputs, then expand their production-line consumption proportionally. Purchased or adjustment-sourced inputs, missing links, over-applied quantities, ambiguous production output and cycles stop that branch. Partial application is explicitly marked. Child quantities/costs are allocated production detail, not a substitute for the parent input’s posted Value Entry valuation. Do not sum parent and child costs. Summary ingredient cost includes Level 1 only.

The report bounds work to 5,000 root entries per mirror, 20,000 detail rows, 600 SQL requests and five levels. Narrow filters if limits are exceeded; no truncated partial result is presented. Production-line and application lookups are cached within each run. Companies are queried sequentially. No data is written to BC.
