This is a reporting app, mainly for visualizing, and exporting to excel, sales related data from business central.


0. I have 4 companies, [FCL (FCL1), CM (CM3), FLM (FLM1), RMK (RMK) with identical table structure apart from the table prefix) Extensions have $ext as part of the table name
1. The application uses Business Central tables Sales Header and Sales Header Ext are before posting; with varius statuses. Posted data is in the Sales Invoice Header and Sales Credit Memo headers and lines, and in the item ledger entry, and PDA Archive header and lines.
2. I want to report about, Sales Quantity (Quantity (Base)) and Revenu, (Amount)
3. Dimension tables include : Customer, Ship-to Address, Route (District group code) a ship-to belongs to a route), salespersons, Items, (A customer)
4. Refer to the folder call bc-schemas for the table structures but remember the three branches.
5. Use polymorhism and inheritance to abstract common use across companies

Tasks1:Create the Report :Sales By Posting group (Posted and Unposted and PDA)
---------------------------------------------------------------------------
0. Get date filters, if missing, or on page load, do only tomorrow, (or Monday if today falls on saturday)
1. Get all posting groups from the Sales lines and sales invoice and credit memo lines (column called posting group) and sum the quantities (qty base) and values. display by company (use a company filter)

Task 2: Create Report: Sales by Sector 
-------------------------------------------------
0. Get date filters, if missing, or on page load, do only tomorrow, (or Monday if today falls on saturday)
1. Get all sectors from the sell-to customers in  Sales lines and sales invoice and credit memo lines (column called posting group) and sum the quantities (qty base) and values. display by company (use a company filter). It might be easier to use customer metrics table to fetch all the sectors, always include  a provision for blank, incase the sell-to customer on the sales line is not tagged to  sector.

Task 3. Week on Week
---------------------------------------------
This report shows a week on week comparison by the dimensions specifed in task 1 and 2 above, we should be able to select the days of the week to compare(by default all), when the dates span more than two weeks; then this we should just report the week of the latest date and the previous week; The week always starts on a Monday and ends on a sunday, this year started on 5th as per FCL calendar... the variance should be clearly reflected as an increasae or decrease visually

Task 4: Product Performance
----------------------------------------------
This should track the performance of a product (should be a matrix drill down from a posting group, to a product ) remember to match anything after "-" ie (in FCL JF-SAUSAGE should be the same as BF-SAUSAGE in CM) like done already on the report. this should then show a visual performance, beginning with gainers ending with losers across the filtered period, also make the filters to appear as a colapsible accordion for each section, add a fiter by customer, and by item no.





