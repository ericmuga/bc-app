/**
 * docs/swagger.js
 * OpenAPI 3.0 specification for the BC Sales Console API.
 */
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'BC Sales Console API',
      version:     '1.0.0',
      description: 'REST API for the Business Central Sales Console — orders, invoices, companies, auth, and webhooks.',
    },
    servers: [{ url: '/api', description: 'API base' }],

    components: {
      securitySchemes: {
        bearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT token obtained from POST /auth/login',
        },
      },

      parameters: {
        CompanyID: {
          name:        'X-Company-ID',
          in:          'header',
          required:    true,
          description: 'Company schema identifier (e.g. FCL, CM)',
          schema:      { type: 'string' },
        },
      },

      schemas: {
        // ── Auth ──────────────────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'admin' },
            password: { type: 'string', example: 'secret' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user:  {
              type: 'object',
              properties: {
                userId:      { type: 'string' },
                userName:    { type: 'string' },
                displayName: { type: 'string' },
                role:        { type: 'string', enum: ['admin', 'user'] },
              },
            },
          },
        },

        // ── Company ───────────────────────────────────────────────────────
        Company: {
          type: 'object',
          properties: {
            CompanyId:   { type: 'string', example: 'FCL' },
            CompanyName: { type: 'string', example: 'Freight Carriers Ltd' },
            IsActive:    { type: 'boolean' },
            CreatedAt:   { type: 'string', format: 'date-time' },
          },
        },

        // ── Order ─────────────────────────────────────────────────────────
        OrderHeader: {
          type: 'object',
          properties: {
            OrderNo:         { type: 'string', example: 'FCL-SO00001' },
            CustomerNo:      { type: 'string', example: 'C001' },
            CustomerName:    { type: 'string', example: 'Sunrise Supermarket Ltd' },
            SalespersonCode: { type: 'string', example: 'SP001' },
            RouteCode:       { type: 'string', example: 'RT-NBI' },
            SectorCode:      { type: 'string', example: 'RETAIL' },
            ShipmentDate:    { type: 'string', format: 'date', nullable: true },
            ShipToCode:      { type: 'string', nullable: true },
            ShipToName:      { type: 'string', nullable: true },
            PaymentTerms:    { type: 'string', nullable: true },
            ExternalDocNo:   { type: 'string', nullable: true },
            QuoteNo:         { type: 'string', nullable: true },
            OrderDate:       { type: 'string', format: 'date', example: '2026-03-01' },
            PostingDate:     { type: 'string', format: 'date', nullable: true },
            PrintingDatetime:{ type: 'string', format: 'date-time', nullable: true },
            BCUserId:        { type: 'string', nullable: true },
            Status:          { type: 'string', enum: ['Open', 'Confirmed'], example: 'Open' },
            ConfirmedAt:     { type: 'string', format: 'date-time', nullable: true },
            ConfirmedBy:     { type: 'string', nullable: true },
            CreatedAt:       { type: 'string', format: 'date-time' },
            UpdatedAt:       { type: 'string', format: 'date-time' },
          },
        },
        SalesLine: {
          type: 'object',
          properties: {
            OrderNo:        { type: 'string' },
            LineNo:         { type: 'integer' },
            ItemNo:         { type: 'string', example: 'ITM001' },
            Description:    { type: 'string', example: 'Mineral Water 500ml (24pk)' },
            Quantity:       { type: 'number', example: 10 },
            QuantityBase:   { type: 'number', example: 10 },
            UnitPrice:      { type: 'number', example: 480 },
            LineAmount:     { type: 'number', example: 4800, description: 'Amount incl. VAT (as sent by BC for orders)' },
            AmountInclVat:  { type: 'number', nullable: true },
            VatPct:         { type: 'number', nullable: true },
            QtyAssigned:    { type: 'number', nullable: true },
            QtyExecuted:    { type: 'number', nullable: true },
            CustomerSpec:   { type: 'string', nullable: true },
            Barcode:        { type: 'string', nullable: true },
            UnitOfMeasure:  { type: 'string', example: 'CTN' },
            PostingGroup:   { type: 'string', nullable: true },
          },
        },
        OrderWithLines: {
          type: 'object',
          properties: {
            header: { $ref: '#/components/schemas/OrderHeader' },
            lines:  { type: 'array', items: { $ref: '#/components/schemas/SalesLine' } },
          },
        },

        // ── Invoice ───────────────────────────────────────────────────────
        InvoiceHeader: {
          type: 'object',
          properties: {
            InvoiceNo:       { type: 'string', example: 'FCL-INV00001' },
            OriginalOrderNo: { type: 'string', example: 'FCL-SO00001' },
            CustomerNo:      { type: 'string' },
            CustomerName:    { type: 'string' },
            CustomerPin:     { type: 'string', nullable: true },
            SalespersonCode: { type: 'string' },
            SalespersonName: { type: 'string', nullable: true },
            RouteCode:       { type: 'string' },
            SectorCode:      { type: 'string' },
            ShipToName:      { type: 'string', nullable: true },
            ShipmentMethod:  { type: 'string', nullable: true },
            PaymentTerms:    { type: 'string', nullable: true },
            ExternalDocNo:   { type: 'string', nullable: true },
            CompanyName:     { type: 'string', nullable: true },
            CompanyPin:      { type: 'string', nullable: true },
            CompanyEmail:    { type: 'string', nullable: true },
            CompanyVatReg:   { type: 'string', nullable: true },
            NoPrinted:       { type: 'integer', nullable: true },
            OrderDate:       { type: 'string', format: 'date' },
            PostingDate:     { type: 'string', format: 'date', nullable: true },
            InvoicedAt:      { type: 'string', format: 'date-time' },
            PrintingDatetime:{ type: 'string', format: 'date-time', nullable: true },
            BCUserId:        { type: 'string', nullable: true },
            ETIMSInvoiceNo:  { type: 'string', nullable: true, example: 'ETIMS-123456' },
            ETIMSData:       { type: 'string', nullable: true, description: 'JSON string of ETIMS payload' },
            QRCodeUrl:       { type: 'string', nullable: true },
            Status:          { type: 'string', enum: ['Invoiced', 'Confirmed'] },
            ConfirmedAt:     { type: 'string', format: 'date-time', nullable: true },
            ConfirmedBy:     { type: 'string', nullable: true },
            TotalLineAmount: { type: 'number', description: 'Sum of LineAmount (excl. VAT)' },
            TotalInclVat:    { type: 'number', description: 'Sum of LineAmountInclVat' },
          },
        },
        InvoiceLine: {
          type: 'object',
          properties: {
            InvoiceNo:          { type: 'string' },
            LineNo:             { type: 'integer' },
            ItemNo:             { type: 'string' },
            Description:        { type: 'string' },
            Quantity:           { type: 'number' },
            QuantityBase:       { type: 'number' },
            UnitPrice:          { type: 'number' },
            LineAmount:         { type: 'number', description: 'Amount excl. VAT' },
            LineAmountInclVat:  { type: 'number', nullable: true, description: 'Amount incl. VAT' },
            VatPct:             { type: 'number', nullable: true },
            VatIdentifier:      { type: 'string', nullable: true },
            UnitsPerParcel:     { type: 'number', nullable: true },
            UnitOfMeasure:      { type: 'string' },
            PostingGroup:       { type: 'string', nullable: true },
          },
        },
        InvoiceWithLines: {
          type: 'object',
          properties: {
            header: { $ref: '#/components/schemas/InvoiceHeader' },
            lines:  { type: 'array', items: { $ref: '#/components/schemas/InvoiceLine' } },
          },
        },

        // ── Audit log ─────────────────────────────────────────────────────
        AuditEntry: {
          type: 'object',
          properties: {
            Id:           { type: 'string', format: 'uuid' },
            EventType:    { type: 'string', example: 'OrderConfirmed' },
            DocumentNo:   { type: 'string' },
            DocumentType: { type: 'string', enum: ['Order', 'Invoice'] },
            UserId:       { type: 'string', nullable: true },
            UserName:     { type: 'string', nullable: true },
            Metadata:     { type: 'string', nullable: true },
            OccurredAt:   { type: 'string', format: 'date-time' },
          },
        },

        // ── Summary ───────────────────────────────────────────────────────
        SummaryRow: {
          type: 'object',
          properties: {
            GroupKey:          { type: 'string' },
            DocumentCount:     { type: 'integer' },
            TotalQuantity:     { type: 'number' },
            TotalQuantityBase: { type: 'number' },
            TotalLineAmount:   { type: 'number' },
          },
        },

        // ── Webhook payloads ──────────────────────────────────────────────
        WebhookOrderPayload: {
          type: 'object',
          required: ['header', 'lines'],
          properties: {
            header: {
              type: 'object',
              required: ['orderNo', 'customerNo', 'customerName', 'orderDate'],
              properties: {
                orderNo:         { type: 'string', example: 'SO-0001' },
                customerNo:      { type: 'string' },
                customerName:    { type: 'string' },
                salespersonCode: { type: 'string', example: 'SP001' },
                routeCode:       { type: 'string', example: 'RT-NBI', description: 'Location Code' },
                sectorCode:      { type: 'string', example: 'RETAIL', description: 'Customer Posting Group' },
                shipmentDate:    { type: 'string', format: 'date', nullable: true },
                shipToCode:      { type: 'string', nullable: true },
                shipToName:      { type: 'string', nullable: true },
                paymentTerms:    { type: 'string', nullable: true },
                externalDocNo:   { type: 'string', nullable: true },
                quoteNo:         { type: 'string', nullable: true },
                orderDate:       { type: 'string', format: 'date' },
                postingDate:     { type: 'string', format: 'date', nullable: true },
                printingDatetime:{ type: 'string', format: 'date-time', nullable: true },
                bcUserId:        { type: 'string', nullable: true },
              },
            },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                required: ['lineNo', 'itemNo', 'quantity', 'unitPrice', 'lineAmount'],
                properties: {
                  lineNo:        { type: 'integer' },
                  itemNo:        { type: 'string' },
                  description:   { type: 'string' },
                  quantity:      { type: 'number', description: 'Order Quantity' },
                  quantityBase:  { type: 'number' },
                  unitPrice:     { type: 'number' },
                  lineAmount:    { type: 'number', description: 'Amount Including VAT' },
                  amountInclVat: { type: 'number', nullable: true },
                  vatPct:        { type: 'number', nullable: true },
                  qtyAssigned:   { type: 'number', nullable: true },
                  qtyExecuted:   { type: 'number', nullable: true },
                  customerSpec:  { type: 'string', nullable: true },
                  barcode:       { type: 'string', nullable: true },
                  unitOfMeasure: { type: 'string' },
                  postingGroup:  { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        WebhookInvoicePayload: {
          type: 'object',
          required: ['invoiceNo', 'invoicedAt'],
          properties: {
            orderNo:          { type: 'string', nullable: true, example: 'FCL-SO00001', description: 'If provided, order is moved to invoice' },
            invoiceNo:        { type: 'string', example: 'FCL-INV00001' },
            invoicedAt:       { type: 'string', format: 'date-time' },
            postingDate:      { type: 'string', format: 'date', nullable: true },
            printingDatetime: { type: 'string', format: 'date-time', nullable: true },
            bcUserId:         { type: 'string', nullable: true },
            customerPin:      { type: 'string', nullable: true },
            salespersonName:  { type: 'string', nullable: true },
            shipToName:       { type: 'string', nullable: true },
            shipmentMethod:   { type: 'string', nullable: true },
            paymentTerms:     { type: 'string', nullable: true },
            externalDocNo:    { type: 'string', nullable: true },
            companyName:      { type: 'string', nullable: true },
            companyPin:       { type: 'string', nullable: true },
            companyEmail:     { type: 'string', nullable: true },
            companyVatReg:    { type: 'string', nullable: true },
            noPrinted:        { type: 'integer', nullable: true },
            etimsInvoiceNo:   { type: 'string', nullable: true },
            etimsData:        { type: 'object', nullable: true },
            qrcodeUrl:        { type: 'string', nullable: true },
            lines:            { type: 'array', nullable: true, description: 'If omitted, order lines are carried over', items: { $ref: '#/components/schemas/InvoiceLine' } },
          },
        },

        // ── Errors ────────────────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code:  { type: 'string', nullable: true },
          },
        },
      },
    },

    // All authenticated routes require bearer token by default
    security: [{ bearerAuth: [] }],

    paths: {
      // ── Auth ─────────────────────────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Local username/password login',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: {
            200: { description: 'JWT token + user', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/login-ad': {
        post: {
          tags: ['Auth'],
          summary: 'Active Directory login',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: {
            200: { description: 'JWT token + user', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
            401: { description: 'AD authentication failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/create-user': {
        post: {
          tags: ['Auth'],
          summary: 'Create a new local user (admin only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password', 'displayName'],
                  properties: {
                    username:    { type: 'string' },
                    password:    { type: 'string' },
                    displayName: { type: 'string' },
                    email:       { type: 'string' },
                    role:        { type: 'string', enum: ['admin', 'user'], default: 'user' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User created' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // ── Companies ─────────────────────────────────────────────────────────
      '/companies': {
        get: {
          tags: ['Companies'],
          summary: 'List all active companies / migrated schemas',
          responses: {
            200: { description: 'Array of companies', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Company' } } } } },
          },
        },
        post: {
          tags: ['Companies'],
          summary: 'Register or update a company in dbo.Companies',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['companyId', 'companyName'],
                  properties: {
                    companyId:   { type: 'string', example: 'FCL' },
                    companyName: { type: 'string', example: 'Freight Carriers Ltd' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Company saved' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },

      // ── Webhooks ──────────────────────────────────────────────────────────
      '/webhook/orders': {
        post: {
          tags: ['Webhooks'],
          summary: 'Receive order from Business Central',
          security: [],
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'x-webhook-secret', in: 'header', required: true, schema: { type: 'string' }, description: 'Shared webhook secret (BC_WEBHOOK_SECRET env var)' },
          ],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookOrderPayload' } } } },
          responses: {
            201: { description: 'Order saved' },
            400: { description: 'Invalid payload' },
            401: { description: 'Invalid webhook secret' },
          },
        },
      },
      '/webhook/invoices': {
        post: {
          tags: ['Webhooks'],
          summary: 'Receive invoice from Business Central (moves order → invoice)',
          security: [],
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'x-webhook-secret', in: 'header', required: true, schema: { type: 'string' } },
          ],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookInvoicePayload' } } } },
          responses: {
            201: { description: 'Invoice created from order' },
            400: { description: 'Invalid payload or order not found' },
          },
        },
      },

      // ── Orders ────────────────────────────────────────────────────────────
      '/orders': {
        get: {
          tags: ['Orders'],
          summary: 'List / search orders',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'q',          in: 'query', schema: { type: 'string' },  description: 'Search OrderNo, CustomerName, CustomerNo' },
            { name: 'status',     in: 'query', schema: { type: 'string', enum: ['Open', 'Confirmed'] } },
            { name: 'customerNo', in: 'query', schema: { type: 'string' } },
            { name: 'salesperson',in: 'query', schema: { type: 'string' } },
            { name: 'route',      in: 'query', schema: { type: 'string' } },
            { name: 'sector',     in: 'query', schema: { type: 'string' } },
            { name: 'dateFrom',   in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',     in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { description: 'Array of order headers', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/OrderHeader' } } } } },
          },
        },
      },
      '/orders/summary': {
        get: {
          tags: ['Orders'],
          summary: 'Aggregated order summary grouped by a dimension',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'groupBy',  in: 'query', schema: { type: 'string', enum: ['CustomerNo', 'CustomerName', 'SalespersonCode', 'RouteCode', 'SectorCode', 'OrderDate'] }, description: 'Grouping dimension' },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',   in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { description: 'Summary rows', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SummaryRow' } } } } },
          },
        },
      },
      '/orders/{orderNo}': {
        get: {
          tags: ['Orders'],
          summary: 'Get a single order with lines',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'orderNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Order with lines', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderWithLines' } } } },
            404: { description: 'Order not found' },
          },
        },
      },
      '/orders/{orderNo}/confirm': {
        post: {
          tags: ['Orders'],
          summary: 'Confirm an order',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'orderNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Order confirmed' },
            404: { description: 'Order not found' },
            409: { description: 'Already confirmed (COPY scan)', content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'string', example: 'ALREADY_CONFIRMED' }, confirmedAt: { type: 'string' }, confirmedBy: { type: 'string' } } } } } },
          },
        },
      },
      '/orders/{orderNo}/audit': {
        get: {
          tags: ['Orders'],
          summary: 'Audit trail for an order',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'orderNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Audit entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } } },
          },
        },
      },

      // ── Invoices ──────────────────────────────────────────────────────────
      '/invoices': {
        get: {
          tags: ['Invoices'],
          summary: 'List / search invoices',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'q',          in: 'query', schema: { type: 'string' } },
            { name: 'status',     in: 'query', schema: { type: 'string', enum: ['Invoiced', 'Confirmed'] } },
            { name: 'customerNo', in: 'query', schema: { type: 'string' } },
            { name: 'salesperson',in: 'query', schema: { type: 'string' } },
            { name: 'route',      in: 'query', schema: { type: 'string' } },
            { name: 'sector',     in: 'query', schema: { type: 'string' } },
            { name: 'dateFrom',   in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',     in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { description: 'Invoice headers with line totals', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/InvoiceHeader' } } } } },
          },
        },
      },
      '/invoices/summary': {
        get: {
          tags: ['Invoices'],
          summary: 'Aggregated invoice summary grouped by a dimension',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'groupBy',  in: 'query', schema: { type: 'string', enum: ['CustomerNo', 'CustomerName', 'SalespersonCode', 'RouteCode', 'SectorCode', 'OrderDate'] } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo',   in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { description: 'Summary rows', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SummaryRow' } } } } },
          },
        },
      },
      '/invoices/{invoiceNo}': {
        get: {
          tags: ['Invoices'],
          summary: 'Get a single invoice with lines',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'invoiceNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Invoice with lines', content: { 'application/json': { schema: { $ref: '#/components/schemas/InvoiceWithLines' } } } },
            404: { description: 'Invoice not found' },
          },
        },
      },
      '/invoices/{invoiceNo}/confirm': {
        post: {
          tags: ['Invoices'],
          summary: 'Confirm an invoice',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'invoiceNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Invoice confirmed' },
            404: { description: 'Invoice not found' },
            409: { description: 'Already confirmed (COPY scan)' },
          },
        },
      },
      '/invoices/{invoiceNo}/audit': {
        get: {
          tags: ['Invoices'],
          summary: 'Audit trail for an invoice',
          parameters: [
            { $ref: '#/components/parameters/CompanyID' },
            { name: 'invoiceNo', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Audit entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } } },
          },
        },
      },
    },
  },
  apis: [],
};

export default swaggerJsdoc(options);
