/**
 * bc-api-spec.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Business Central → BC App  |  Webhook API Specification
 *
 * Use this file to generate AL codeunits that call the app from Business Central.
 *
 * BASE URL  :  https://<your-app-host>/api
 * AUTH      :  Header  X-BC-Signature: <BC_WEBHOOK_SECRET>   (shared secret)
 * COMPANY   :  Header  X-Company-ID: <BC Company schema name, e.g. "FCL">
 * ──────────────────────────────────────────────────────────────────────────────
 */

export const BC_API = {

  /**
   * Base URL of the deployed app.
   * Set this via environment / AL setup page in BC.
   */
  baseUrl: 'https://<your-app-host>/api',

  /**
   * Required HTTP headers for every webhook call.
   */
  headers: {
    'Content-Type':   'application/json',
    'X-BC-Signature': '<BC_WEBHOOK_SECRET>',   // must match BC_WEBHOOK_SECRET env var on server
    'X-Company-ID':   '<CompanyId>',           // e.g. "FCL" — the SQL Server schema name
  },


  // ── 1. POST /webhook/orders ──────────────────────────────────────────────────
  //
  //  Called by BC whenever a Sales Order is created or updated (upsert).
  //  The app stores the order and marks it Open, ready for warehouse scanning.
  //
  webhookOrder: {
    method:   'POST',
    endpoint: '/webhook/orders',
    fullUrl:  'POST https://<your-app-host>/api/webhook/orders',

    /** Success response */
    response: {
      status:  201,
      body:    { message: 'Order saved', orderNo: 'FCL-SO00001' },
    },

    /** Error responses */
    errors: {
      400: 'Invalid payload — header.orderNo or lines[] missing',
      401: 'Invalid X-BC-Signature',
      500: 'Server error (check app logs)',
    },

    /**
     * Request body schema.
     * All fields are camelCase JSON.
     */
    body: {
      header: {
        orderNo:          'string   REQUIRED  — Sales Order No. from BC (e.g. "FCL-SO00001")',
        customerNo:       'string   REQUIRED  — Customer No.',
        customerName:     'string   REQUIRED  — Customer Name',
        salespersonCode:  'string   optional  — Salesperson Code',
        routeCode:        'string   optional  — Route Code / Location Code',
        sectorCode:       'string   optional  — Sector Code / Customer Posting Group',
        shipmentDate:     'string   optional  — ISO 8601 date, e.g. "2025-03-16"',
        shipToCode:       'string   optional  — Ship-to Code',
        shipToName:       'string   optional  — Ship-to Name',
        paymentTerms:     'string   optional  — Payment Terms Code',
        externalDocNo:    'string   optional  — External Document No.',
        quoteNo:          'string   optional  — Quote No.',
        orderDate:        'string   optional  — ISO 8601 date, e.g. "2025-03-16"',
        postingDate:      'string   optional  — ISO 8601 date, null if not yet posted',
        printingDatetime: 'string   optional  — ISO 8601 datetime when the document was printed in BC',
        bcUserId:         'string   optional  — Business Central User ID who created / printed the order',
      },
      lines: [
        {
          lineNo:        'integer  REQUIRED  — Line No. (e.g. 10000, 20000)',
          itemNo:        'string   REQUIRED  — Item No.',
          description:   'string   optional  — Item Description',
          quantity:      'number   REQUIRED  — Order Quantity',
          quantityBase:  'number   optional  — Quantity (Base UoM)',
          unitPrice:     'number   REQUIRED  — Unit Price',
          lineAmount:    'number   REQUIRED  — Amount Including VAT',
          amountInclVat: 'number   optional  — Amount Including VAT (explicit)',
          vatPct:        'number   optional  — VAT %',
          qtyAssigned:   'number   optional  — Qty. Assigned',
          qtyExecuted:   'number   optional  — Qty Executed (Quantity on shipment)',
          customerSpec:  'string   optional  — Customer Specification',
          barcode:       'string   optional  — Item Barcode',
          unitOfMeasure: 'string   optional  — Unit of Measure Code',
          postingGroup:  'string   optional  — Gen. Prod. Posting Group',
        },
      ],
    },

    /** Minimal example payload */
    example: {
      header: {
        orderNo:          'FCL-SO00001',
        customerNo:       'C001',
        customerName:     'Sunrise Supermarket Ltd',
        salespersonCode:  'SP001',
        routeCode:        'RT-NBI',
        sectorCode:       'RETAIL',
        orderDate:        '2025-03-16',
        postingDate:      null,
        printingDatetime: '2025-03-16T08:45:00.000Z',
        bcUserId:         'JSMITH',
      },
      lines: [
        {
          lineNo:        10000,
          itemNo:        'ITM001',
          description:   'Mineral Water 500ml (24pk)',
          quantity:      10,
          quantityBase:  10,
          unitPrice:     480,
          lineAmount:    4800,
          unitOfMeasure: 'CTN',
        },
        {
          lineNo:        20000,
          itemNo:        'ITM006',
          description:   'Cooking Oil 1L (12pk)',
          quantity:      5,
          quantityBase:  5,
          unitPrice:     2880,
          lineAmount:    14400,
          unitOfMeasure: 'CTN',
        },
      ],
    },
  },


  // ── 2. POST /webhook/invoices ────────────────────────────────────────────────
  //
  //  Called by BC after a Sales Invoice is posted and E-TIMS signing is complete.
  //  The app moves the matching order into the InvoiceHeader table and attaches
  //  the ETIMS data and QR code URL.
  //
  webhookInvoice: {
    method:   'POST',
    endpoint: '/webhook/invoices',
    fullUrl:  'POST https://<your-app-host>/api/webhook/invoices',

    /** Success response */
    response: {
      status:  201,
      body:    { message: 'Invoice created from order', invoiceNo: 'FCL-INV00001', orderNo: 'FCL-SO00001' },
    },

    /** Error responses */
    errors: {
      400: 'invoiceNo, invoicedAt, or orderNo missing',
      401: 'Invalid X-BC-Signature',
      404: 'Matching order not found for given orderNo',
      500: 'Server error',
    },

    /**
     * Request body schema.
     */
    body: {
      orderNo:          'string   optional  — Original Sales Order No. If present, order is moved to InvoiceHeader and deleted from SalesHeader. If absent, invoice is stored directly.',
      invoiceNo:        'string   REQUIRED  — Posted Invoice No.',
      invoicedAt:       'string   REQUIRED  — ISO 8601 datetime of posting, e.g. "2025-03-16T10:30:00.000Z"',
      postingDate:      'string   optional  — ISO 8601 date of posting',
      printingDatetime: 'string   optional  — ISO 8601 datetime when the invoice was printed in BC',
      bcUserId:         'string   optional  — Business Central User ID who posted the invoice',
      customerPin:      'string   optional  — KRA PIN of the buyer',
      salespersonName:  'string   optional  — Salesperson full name',
      shipToName:       'string   optional  — Ship-to Name',
      shipmentMethod:   'string   optional  — Shipment Method Code',
      paymentTerms:     'string   optional  — Payment Terms Code',
      externalDocNo:    'string   optional  — External Document No.',
      companyName:      'string   optional  — Selling company name',
      companyPin:       'string   optional  — Selling company KRA PIN',
      companyEmail:     'string   optional  — Selling company email',
      companyVatReg:    'string   optional  — Selling company VAT registration no.',
      noPrinted:        'integer  optional  — No. of times the invoice was printed in BC',
      etimsInvoiceNo:   'string   optional  — E-TIMS Invoice Number returned by KRA',
      etimsData:        'object   optional  — Raw E-TIMS signing response (stored as JSON)',
      qrcodeUrl:        'string   optional  — KRA E-TIMS QR code URL for the invoice',
      lines: [
        {
          lineNo:            'integer  REQUIRED',
          itemNo:            'string   REQUIRED',
          description:       'string   optional',
          quantity:          'number   REQUIRED',
          quantityBase:      'number   optional',
          unitPrice:         'number   REQUIRED',
          lineAmount:        'number   REQUIRED  — Line Amount excl. VAT',
          lineAmountInclVat: 'number   optional  — Line Amount incl. VAT',
          vatPct:            'number   optional  — VAT %',
          vatIdentifier:     'string   optional  — VAT Identifier',
          unitsPerParcel:    'number   optional  — Units per Parcel',
          unitOfMeasure:     'string   optional',
          postingGroup:      'string   optional',
        },
      ],
    },

    /** Full example payload */
    example: {
      orderNo:          'FCL-SO00001',
      invoiceNo:        'FCL-INV00001',
      invoicedAt:       '2025-03-16T10:30:00.000Z',
      postingDate:      '2025-03-16',
      printingDatetime: '2025-03-16T10:32:00.000Z',
      bcUserId:         'AMUGO',
      etimsInvoiceNo:   'ETIMS-482910',
      etimsData: {
        cu:   'CU4821',
        vscu: 'VSCU192',
      },
      qrcodeUrl: 'https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd',
      lines: null,
    },
  },

};


// ── AL codeunit template hints ─────────────────────────────────────────────────
//
// Use the following as a guide when writing AL integration codeunits in BC:
//
//  codeunit 50100 "BC App Webhook Mgt"
//  {
//    procedure SendOrder(SalesHeader: Record "Sales Header")
//    var
//      HttpClient  : HttpClient;
//      HttpContent : HttpContent;
//      HttpRequest : HttpRequestMessage;
//      HttpResponse: HttpResponseMessage;
//      JsonBody    : JsonObject;
//      JsonLines   : JsonArray;
//      JsonLine    : JsonObject;
//      SalesLine   : Record "Sales Line";
//      Setup       : Record "BC App Setup";   // store BaseUrl + Secret here
//      ResponseText: Text;
//    begin
//      Setup.Get();
//
//      // Build header object
//      JsonBody.Add('orderNo',          SalesHeader."No.");
//      JsonBody.Add('customerNo',       SalesHeader."Sell-to Customer No.");
//      JsonBody.Add('customerName',     SalesHeader."Sell-to Customer Name");
//      JsonBody.Add('salespersonCode',  SalesHeader."Salesperson Code");
//      JsonBody.Add('routeCode',        SalesHeader."Route Code");            // custom field
//      JsonBody.Add('sectorCode',       SalesHeader."Sector Code");           // custom field
//      JsonBody.Add('orderDate',        Format(SalesHeader."Order Date",    0, '<Year4>-<Month,2>-<Day,2>'));
//      JsonBody.Add('postingDate',      Format(SalesHeader."Posting Date",  0, '<Year4>-<Month,2>-<Day,2>'));
//      JsonBody.Add('printingDatetime', Format(CurrentDateTime,             9, '<Year4>-<Month,2>-<Day,2>T<Hours24>:<Minutes,2>:<Seconds,2>.000Z'));
//      JsonBody.Add('bcUserId',         UserId());
//
//      // Build lines array
//      SalesLine.SetRange("Document Type", SalesLine."Document Type"::Order);
//      SalesLine.SetRange("Document No.",  SalesHeader."No.");
//      if SalesLine.FindSet() then
//        repeat
//          Clear(JsonLine);
//          JsonLine.Add('lineNo',        SalesLine."Line No.");
//          JsonLine.Add('itemNo',        SalesLine."No.");
//          JsonLine.Add('description',   SalesLine.Description);
//          JsonLine.Add('quantity',      SalesLine.Quantity);
//          JsonLine.Add('quantityBase',  SalesLine."Quantity (Base)");
//          JsonLine.Add('unitPrice',     SalesLine."Unit Price");
//          JsonLine.Add('lineAmount',    SalesLine."Line Amount");
//          JsonLine.Add('unitOfMeasure', SalesLine."Unit of Measure Code");
//          JsonLines.Add(JsonLine);
//        until SalesLine.Next() = 0;
//
//      JsonBody.Add('lines', JsonLines);   // <-- note: order webhook wraps in { header, lines }
//      // Wrap: { "header": {...}, "lines": [...] }
//      // See webhookOrder.body above — the order payload is { header: {}, lines: [] }
//
//      // Send
//      HttpContent.WriteFrom(Format(JsonBody));  // serialize to text first
//      HttpContent.GetHeaders().Remove('Content-Type');
//      HttpContent.GetHeaders().Add('Content-Type', 'application/json');
//
//      HttpRequest.Method  := 'POST';
//      HttpRequest.SetRequestUri(Setup."Base URL" + '/webhook/orders');
//      HttpRequest.GetHeaders().Add('X-BC-Signature', Setup."Webhook Secret");
//      HttpRequest.GetHeaders().Add('X-Company-ID',   Setup."Company ID");
//      HttpRequest.Content := HttpContent;
//
//      HttpClient.Send(HttpRequest, HttpResponse);
//      HttpResponse.Content.ReadAs(ResponseText);
//
//      if not HttpResponse.IsSuccessStatusCode() then
//        Error('BC App webhook failed (%1): %2', HttpResponse.HttpStatusCode, ResponseText);
//    end;
//  }
//
// ── Setup table suggestion ──────────────────────────────────────────────────────
//
//  table 50100 "BC App Setup"
//  {
//    fields
//    {
//      field(1; "Primary Key";      Code[10])     {}
//      field(2; "Base URL";         Text[250])    { Caption = 'App Base URL'; }
//      field(3; "Webhook Secret";   Text[250])    { Caption = 'Webhook Secret'; }
//      field(4; "Company ID";       Code[20])     { Caption = 'Company ID (Schema)'; }
//    }
//  }
//
// ──────────────────────────────────────────────────────────────────────────────
