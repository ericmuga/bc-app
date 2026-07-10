/**
 * data/releases.js — curated changelog shown on the Releases page.
 * Add a new entry to the TOP of the array for each release. `commit` is the
 * short hash the change shipped in (fill when committed); the page also shows
 * the live running build from GET /api/system/release.
 */
export const releases = [
  {
    version: 'unreleased',
    date: '2026-06-27',
    commit: '(working tree)',
    title: 'POS roadmap kickoff — release tracking + quick wins',
    items: [
      'Added this Releases / changelog page with live build-commit badge (GET /api/system/release).',
      'Published the POS feature roadmap (docs/POS-Roadmap.md).',
      'Payments: added "Bank Deposit" payment class and a Reference field at checkout for Card / Bank Deposit / Bank Transfer / Credit (persisted to PosPayment.Reference, single + split).',
      'Stock requests: added an RF (Return Form) number column captured at receipt for returned/short lines.',
    ],
  },
  {
    version: 'unreleased',
    date: '2026-06-26',
    commit: '(working tree)',
    title: 'M-Pesa reconciliation & checkout matching',
    items: [
      'Checkout: M-Pesa lookup is now a multi-select match table (latest first, name + code), allocating one or many transactions to an invoice with partial-utilisation balances; fully-used codes are excluded.',
      'Search by amount, with a confirmation-code fallback when the amount search does not surface the payment.',
      'New PosMpesaApplication ledger; two reports (Invoice→Payments, Payments→Invoice) under POS → M-Pesa Reconciliation.',
      'Currency rounded to the nearest whole KES at checkout/confirmation.',
    ],
  },
  {
    version: 'unreleased',
    date: '2026-06-26',
    commit: '(working tree)',
    title: 'POS performance & theming',
    items: [
      'Server-side pagination for Items, Special Prices, and Walk-in Contacts in Admin → POS Setup (50/page + search) — Special Prices alone was loading ~9,800 rows.',
      'Restricted contact sync to salesperson codes in the shop terminal list.',
      'Dark-theme contrast fixes: global table hover/selected/stripe rows, BC Reports, Cashier↔Shops, and Till pages.',
      'Fixed missing PosShop (CurrentRoute, TptLocationCode) and PosSpecialPrice (Source) columns; ran full migration for all companies.',
    ],
  },
  {
    version: 'unreleased',
    date: '2026-06-17',
    commit: '(working tree)',
    title: 'Costing & WMS — Phase 1',
    items: [
      'Recipe Templates CRUD (template_header / template_lines) with per-line add/edit/delete, search, upload-replace, and downloadable template.',
      'Multi-company Recipe Data: FCL (calibra) and CM (cml-calibra) via a config-driven WMS linked server.',
      'BC salesperson ext fields exposed for terminals; Dept Signature image endpoint.',
      'Full phased plan in docs/Costing-WMS-Plan.md.',
    ],
  },
]
