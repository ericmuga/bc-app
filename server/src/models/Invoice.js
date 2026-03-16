/**
 * models/Invoice.js
 * Extends BaseDocument for sales invoices.
 * Invoice records are moved here from Order by Order.moveToInvoice().
 */
import { BaseDocument } from './BaseDocument.js';

export class Invoice extends BaseDocument {
  constructor() {
    // InvoiceHeader uses InvoiceNo and OrderDate for grouping
    super('InvoiceHeader', 'InvoiceLine', 'InvoiceNo');
  }

  // All shared methods (findWithLines, search, confirm, audit, summary) inherited.
  // Override summary to include InvoicedAt ranges as well.
  async summary(companyId, { groupBy = 'CustomerNo', dateFrom, dateTo } = {}) {
    // Delegate to parent but filter on InvoicedAt instead of OrderDate
    return super.summary(companyId, { groupBy, dateFrom, dateTo });
  }
}

export default new Invoice();
