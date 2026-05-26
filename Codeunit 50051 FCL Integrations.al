codeunit 50051 "FCL Intergrations"
{
    Permissions = tabledata "Sales Invoice Header" = RIMD,
    tabledata "Sales Cr.Memo Header" = RIMD;
    trigger OnRun()
    var
        Object: JsonObject;
        Array: JsonArray;
        Cust: Record Customer;
        SecondObject: JsonObject;
        ThirdObject: JsonObject;
        SecondArray: JsonArray;
        TempBlob: Codeunit "Temp Blob";
        Instr: InStream;
        Outstream: OutStream;
        FileName: Text;
        Result: Text;
    begin
        Cust.get('1000');
        Object.Add('No.', Cust."No.");
        Object.Add('Name', Cust.Name);
        SecondObject.Add('Address', Cust.Address);
        SecondObject.Add('City', Cust.City);
        SecondObject.Add('Country', Cust."Country/Region Code");
        Array.Add(SecondObject);
        Object.Add('Correspondence', Array);
        ThirdObject.Add('GBPG', Cust."Gen. Bus. Posting Group");
        ThirdObject.Add('CPG', Cust."Customer Posting Group");
        SecondArray.Add(ThirdObject);
        Object.Add('Posting Group', SecondArray);
        //Download the Json File
        TempBlob.CreateInStream(Instr);
        TempBlob.CreateOutStream(Outstream);
        Object.WriteTo(Outstream);
        Outstream.WriteText(Result);
        Instr.ReadText(Result);
        DownloadFromStream(Instr, 'Download Json Data', '', '', FileName)

    end;


    procedure PaymentRequest(PaymentLine: Record "Invoice Payment Line"; SalesInvoice: Record "Sales Header")
    var
        PaymentRequestJson: JsonObject;
        AmountInclVAT: Decimal;
        RequestText: Text;
        PaymentMethod: Record "Payment Method";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        Content: HttpContent;
        ContentHeaders: HttpHeaders;
        Result: Text;
        HttpRequest: HttpRequestMessage;
        Output: Text;
        Routes: Record "District Group Code";
        SP: Record "Salesperson/Purchaser";
        IntSetup: Record "FCL Integration Setup";
        JSONManagement: Codeunit "JSON Management";
        responseText, NewResponse, Messages : Text;
        ShopPaymentSetup: Record "Shop Payment Types";
        JO: JsonObject;
        FCLIntegration: Codeunit WMSIntegrationsFinal;
        VariantValue: Variant;
        PaymentBuffer: Record "Payment Lookup Buffer";
    // WMSIntegration: Codeunit "WMS Integration";

    begin
        // Build JSON object
        PaymentRequestJson.Add('invoice_no', SalesInvoice."No.");
        PaymentRequestJson.Add('customer_no', SalesInvoice."Customer Contact No.");

        if CopyStr(PaymentLine."Mobile No.", 1, 1) = '0' then
            PaymentRequestJson.Add('phone', '254' + CopyStr(PaymentLine."Mobile No.", 2))
        else
            PaymentRequestJson.Add('phone', '254' + PaymentLine."Mobile No.");
        //  end;



        // PaymentRequestJson.Add('phone', SalesInvoice."Cust. Ref No.");
        // PaymentRequestJson.Add('transaction_type', SalesInvoice."Transaction Type"); // assuming custom field
        // PaymentRequestJson.Add('payment_method', SalesInvoice."Payment Method Code");
        PaymentRequestJson.Add('amount', Round(PaymentLine.Amount, 1)); // Round to 0 decimal places
        PaymentRequestJson.Add('currency', SalesInvoice."Currency Code");
        // PaymentRequestJson.Add('invoice_date', Format(SalesInvoice."Posting Date", 0, 4)); // ISO date format



        // Optional: Add stub for payment channel endpoint
        // if (PaymentMethod.Get(SalesInvoice."Payment Method Code")) then begin
        //     PaymentRequestJson.Add('payment_description', PaymentMethod.Description);
        // end;

        if sp.Get(SalesInvoice."Salesperson Code") then begin
            if SP."Current Route" <> '' then begin
                Routes.Get(SP."Current Route");
                PaymentRequestJson.Add('store_name', Format(SP.Name)); // ISO date format
                PaymentRequestJson.Add('till_number', Routes."Pay Bill");
            end;
        end;


        // Here you would POST the PaymentRequestJson to a service
        // For now, just log or return it

        // Message('Payment Request JSON: %1', PaymentRequestJson.ToString());
        PaymentRequestJson.WriteTo(RequestText);
        // Message('Payment Request JSON: %1', RequestText);
        // send the request to the payment service (implementation needed)

        // IntSetup.Get();
        // IntSetup.TestField("Payment Service");
        ShopPaymentSetup.SetRange("No.", PaymentLine."Payment Type");
        if not ShopPaymentSetup.FindFirst() then
            Error('Payment Type "%1" does not exist.', PaymentLine."Payment Type");



        PaymentRequestJson.WriteTo(RequestText);
        Content.WriteFrom(RequestText);
        Content.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        Content.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(ShopPaymentSetup."API Endpoint" + 'stkPush');
        HttpRequest.Method('POST');
        HttpRequest.Content(Content);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                JO.ReadFrom(responseText);
                /*
                 GetValue(ProductionOrder, 'uom', VariantValue);
                    UOM := VariantValue;
                */

                FCLIntegration.GetValue(JO, 'CustomerMessage', VariantValue);
                Messages := VariantValue;

                // Message('CustomerMessage: %1', Messages);
                if Messages = 'Success. Request accepted for processing' then begin

                    FCLIntegration.GetValue(JO, 'CheckoutRequestID', VariantValue);
                    Messages := VariantValue;

                    HttpRequest.SetRequestUri(ShopPaymentSetup."API Endpoint" + 'confirmPayment/' + Messages);
                    if HttpClient.Send(HttpRequest, HttpResponse) then begin
                        HttpResponse.Content().ReadAs(NewResponse);
                        if HttpResponse.IsSuccessStatusCode then begin
                            JSONManagement.InitializeObject(NewResponse);
                            if JSONManagement.GetStringPropertyValueByName('status', Messages) then begin
                                // FetchPayments(PaymentLine.Amount, );
                                // FetchPayments(PaymentLine.Amount, PaymentBuffer);
                                // if ((PaymentBuffer.FindSet()) and (PaymentBuffer.Count() = 1)) then begin
                                //     PaymentLine."Payment Reference" := PaymentBuffer."TransID";
                                //     PaymentLine.Modify(true);
                                // end;

                            end;
                        end else
                            Error('Failed to confirm payment: %1', NewResponse);
                    end;
                    //create a new httprequest to get the payment confirmation
                    /*
                      //get request ID and MerchantRequestID
                      http://172.16.10.5:8094/api/confirmPayment/ws_CO_30012024233645458724401515
                    */

                    // HttpRequest.SetRequestUri(ShopPaymentSetup."API Endpoint" + 'confirmPayment/' + JSONManagement.GetStringPropertyValueFromJObjectByName(NewResponse, 'CheckoutRequestID'));
                end;

                // PaymentLine."Payment Confirmation" := NewResponse;


                // Message(NewResponse, Messages);
            end;
        end
        else begin
            JSONManagement.InitializeObject(responseText);

            Message('Request failed!: %1', responseText);
        end;
    end;
    // end;

    procedure FetchPayments(amount: Decimal)
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        Content: Text;
        PaymentBuffer: Record "Payment Lookup Buffer";
        URL: Text;
        IntegrationSetup: Record "FCL Integration Setup";
        RootObj: JsonObject;
        PaymentsArray: JsonArray;
        PaymentObj: JsonObject;
        PaymentToken: JsonToken;
        i: Integer;
        ID: Text;
        FirstName: Text;
        LastName: Text;
        TransactionType: Text;
        TransID: Text;
        TransAmount: Decimal;
        TransTime: Text;
        TestAmount: Code[20];
        CustLedgerEntry: Record "Cust. Ledger Entry";
    begin
        // Clear old data before inserting new rows
        PaymentBuffer.DeleteAll();

        IntegrationSetup.FindFirst();
        IntegrationSetup.TestField("Payment Service");
        //tranform the amount to string without decimal places and currency code
        TestAmount := Format(amount, 0, 0);
        // Message('Fetching payments for amount: %1', TestAmount);
        //replace comma with ''
        TestAmount := RemoveCommas(TestAmount);

        URL := StrSubstNo(IntegrationSetup."Payment Service" + '?amount=%1', TestAmount);
        // Message('Fetching payments from: %1', URL);


        if not Client.Get(URL, Response) then
            Error('Failed to connect to the payment service.');

        Response.Content.ReadAs(Content);
        // Message('Response: %1', Content);

        if not RootObj.ReadFrom(Content) then
            Error('Invalid JSON response: %1', Content);

        // Parse "payments" array
        if RootObj.Get('payments', PaymentToken) then begin
            PaymentsArray := PaymentToken.AsArray();
            for i := 0 to PaymentsArray.Count() - 1 do begin
                PaymentsArray.Get(i, PaymentToken);
                PaymentObj := PaymentToken.AsObject();

                PaymentObj.Get('id', PaymentToken);
                ID := PaymentToken.AsValue().AsText();

                PaymentObj.Get('FirstName', PaymentToken);
                FirstName := PaymentToken.AsValue().AsText();

                // if PaymentObj.Get('LastName', PaymentToken) then
                //     LastName := PaymentToken.AsValue().AsText()
                // else
                LastName := '';

                PaymentObj.Get('TransactionType', PaymentToken);
                TransactionType := PaymentToken.AsValue().AsText();

                PaymentObj.Get('TransID', PaymentToken);
                TransID := PaymentToken.AsValue().AsText();

                if PaymentObj.Get('TransAmount', PaymentToken) then
                    Evaluate(TransAmount, PaymentToken.AsValue().AsText());

                PaymentObj.Get('TransTime', PaymentToken);
                TransTime := PaymentToken.AsValue().AsText();

                PaymentBuffer.Init();
                PaymentBuffer."ID" := ID;
                PaymentBuffer."FirstName" := FirstName;
                PaymentBuffer."LastName" := LastName;
                PaymentBuffer."TransactionType" := TransactionType;
                PaymentBuffer."TransID" := TransID;
                PaymentBuffer."TransAmount" := TransAmount;




                Evaluate(PaymentBuffer."TransTime", TransTime);
                if not PaymentBuffer.Get(PaymentBuffer."ID") then begin

                    CustLedgerEntry.Reset();
                    CustLedgerEntry.SetRange("Document Type", CustLedgerEntry."Document Type"::Payment);
                    CustLedgerEntry.SetRange("External Document No.", TransID);
                    if not CustLedgerEntry.FindFirst() then
                        PaymentBuffer.Insert();
                end;

            end;
        end;
    end;



    procedure APIConnect()
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        Content: HttpContent;
        Result: Text;
        Request: HttpRequestMessage;
        Output: Text;
    begin
        //Method 1
        Client.Get('http://100.100.2.39:3000/fetch-portal-orders', Response);
        if Response.IsSuccessStatusCode then
            Content := Response.Content
        else
            Message('Response was negative %1,%2', Response.HttpStatusCode, Response.ReasonPhrase);
        Content.ReadAs(Output);
        Message(Output);
        //Method 2
        Request.SetRequestUri('http://100.100.2.39:3000/fetch-portal-orders');
        Request.Method('Get');
        Client.Send(Request, Response);
    end;

    procedure JSONReadAndWrite(var Customer: Record Customer)
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        Content: HttpContent;
        Result: Text;
        Request: HttpRequestMessage;
        Output: Text;
        JsonObject: JsonObject;
        JsonToken: JsonToken;
        NewJsonObject: JsonObject;
        NewJsonToken: JsonToken;
    begin
        //Method 1
        Client.Get('http://100.100.2.39:3000/fetch-portal-orders' + Format(Customer."No."), Response);
        if Response.IsSuccessStatusCode then begin
            Content := Response.Content;
            Content.ReadAs(Result);
            // To store the content in JSON Object
            JsonObject.ReadFrom(Result);
            JsonObject.Get('Name', JsonToken);
            Customer.Name := JsonToken.AsValue().AsText();
            JsonObject.Get('username', JsonToken);
            Customer."User ID" := JsonToken.AsValue().AsText();
            JsonObject.Get('email', JsonToken);
            Customer."E-Mail" := JsonToken.AsValue().AsText();
            JsonObject.Get('address', JsonToken);
            if JsonToken.IsObject then begin
                JsonToken.WriteTo(Output);
                NewJsonObject.ReadFrom(Output);
                NewJsonObject.Get('street', NewJsonToken);
                Customer."Address 2" := NewJsonToken.AsValue().AsText();
            end
            else
                Error('Jsontoken is not having the data available as Json Object');
        end
        else
            Message('Response was negative %1,%2', Response.HttpStatusCode, Response.ReasonPhrase);
        Content.ReadAs(Output);
        Message(Output);
        //Method 2
        Request.SetRequestUri('http://100.100.2.39:3000/fetch-portal-orders');
        Request.Method('Get');
        Client.Send(Request, Response);
    end;

    procedure PostReceiptLines(FCLReceipt: Record "Farmer Receipt Ledger"; var Messages: Text[20])
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        //Modification on Json Object to add multiple JSON Objects: 11.04.25:
        Clear(JArray);
        //Modification on Json Object to add multiple JSON Objects: 11.04.25:

        Company.Get();
        Clear(JsonObjectWMS);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("FCL Receipt Lines");
        BaseUrl12 := FCLIntSetup."FCL Receipt Lines";
        ;
        JsonObjectWMS.Add('key', 'slaughter_receipts.wms');
        MainObject.Add('routing', JsonObjectWMS);
        FCLReceiptLinesRec.Reset();
        FCLReceiptLinesRec.SetRange(ReceiptNo, FCLReceipt.No);
        if FCLReceiptLinesRec.FindSet() then begin
            Clear(UserID);
            // UserID := DELCHR(FCLReceipt.ReceivedBy, '=', '*/');
            UserID := 'AGILEBIZPAIVY.ESHIRERA';
            // Message(UserID);
            repeat
                //Modification on Json Object to add multiple JSON Objects: 11.04.25:
                // Clear(JArray);
                Clear(JsonObject);
                JsonObject.Add('ReceiptNo', FCLReceipt.No);
                JsonObject.Add('Item', FCLReceiptLinesRec.Item);
                JsonObject.Add('ItemDescription', FCLReceiptLinesRec.Description);
                JsonObject.Add('Slapmark', FCLReceiptLinesRec.Slapmark);
                JsonObject.Add('FarmerNo', FCLReceipt.FarmerNo);
                JsonObject.Add('FarmerName', FCLReceipt.FarmerName);
                JsonObject.Add('ReceivedQty', FCLReceiptLinesRec.ReceivedQty);
                JsonObject.Add('OrderQty', FCLReceipt.OrderQty);
                JsonObject.Add('ReceiptDate', FCLReceiptLinesRec.ReceiptDate);
                JsonObject.Add('ReceiptTime', FCLReceipt.ReceiptTime);
                JsonObject.Add('ReceivedBy', UserID);
                JsonObject.Add('Status', FCLReceipt.Status);
                JsonObject.Add('ModeOfPayment', FCLReceipt.ModeOfPayment);
                JsonObject.Add('DeliveredBy', FCLReceipt."Delivered By");
                JsonObject.Add('SelfDelivery', FCLReceipt.SelfDelivery);
                JsonObject.Add('HaulierNo', FCLReceipt."Haulier No");
                JsonObject.Add('City', FCLReceipt.City);
                JsonObject.Add('MileageCode', FCLReceipt."Mileage Code");
                JsonObject.Add('HauliageDistance', FCLReceipt."Hauliage Distance");
                //Modified on 11.04.25: To add multiple Json Objects:
                JArray.Add(JsonObject);
            until FCLReceiptLinesRec.Next() = 0;
        end;
        // JArray.Add(JsonObject);
        MainObject.Add('receiptLines', JArray);
        // Message(Format(MainObject));
        // exit;
        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', NewResponse) then begin
                    // ObjectJSONManagement.InitializeObject(NewResponse);
                    JSONManagement.GetStringPropertyValueByName('newReceiptNo', Messages);
                    Message(NewResponse, Messages);
                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', NewResponse) then begin
                    // ObjectJSONManagement.InitializeObject(NewResponse);
                    JSONManagement.GetStringPropertyValueByName('newReceiptNo', Messages);
                    Message(NewResponse, Messages);
                end;
                JSONManagement.GetStringPropertyValueByName('error', Messages);
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure RemoveWhiteSpaces(InputText: Text): Text
    var
        OutputText: Text;
        i: Integer;
    begin
        OutputText := ''; // Initialize the output text variable
        for i := 1 to StrLen(InputText) do begin
            if CopyStr(InputText, i, 1) <> ' ' then
                OutputText := OutputText + CopyStr(InputText, i, 1); // Append non-space characters
        end;

        exit(OutputText); // Return the processed text
    end;

    procedure RemoveCommas(InputText: Text): Text
    var
        OutputText: Text;
        i: Integer;
    begin
        OutputText := ''; // Initialize the output text variable
        for i := 1 to StrLen(InputText) do begin
            if CopyStr(InputText, i, 1) <> ',' then
                OutputText := OutputText + CopyStr(InputText, i, 1); // Append non-comma characters
        end;

        exit(OutputText); // Return the processed text
    end;



    procedure GetSalesOrdersFromPortal()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, JsonMgt, ObjectMgt, LinesArrayMgt : Codeunit "JSON Management";
        StatusCode, i, n : Integer;
        PurchOrderText, OrderNo, CustomerNo, shipment_date, sales_code, ship_to_code, quantity, product_specifications, unit_of_measure : Text;
        ship_to_name, status, customer_specification, PDA, SalesInvoiceLinesTxt, LinesText, ItemCode : Text;
        SalesHeader, SalesHeader2 : Record "Sales Header";
        SalesLine: Record "Sales Line";
        LineNo: Integer;
        Company: Record "Company Information";
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Sales Order-Portal");
        BaseUrl2 := FCLIntSetup."Sales Order-Portal";
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                // Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    // Message(Format(i));
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(PurchOrderText, i);
                    ObjectJSONManagement.InitializeObject(PurchOrderText);
                    ObjectJSONManagement.GetStringPropertyValueByName('order_no', OrderNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('customer_code', CustomerNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('shipment_date', shipment_date);
                    ObjectJSONManagement.GetStringPropertyValueByName('sales_person_code', sales_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_code', ship_to_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_name', ship_to_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('customer_specification', customer_specification);
                    ObjectJSONManagement.GetStringPropertyValueByName('PDA', PDA);
                    // ObjectJSONManagement.InitializeObject(PurchOrderText);
                    // Message(OrderNo);

                    SalesHeader.Init();
                    SalesHeader."No." := '';
                    SalesHeader."WMS Order No." := OrderNo;
                    SalesHeader."External Document No." := OrderNo;
                    SalesHeader."Sell-to Customer No." := CustomerNo;
                    SalesHeader.Validate("Sell-to Customer No.");
                    SalesHeader."Document Type" := SalesHeader."Document Type"::Order;
                    Evaluate(SalesHeader."Shipment Date", shipment_date);
                    SalesHeader.Validate("Shipment Date");
                    SalesHeader."Salesperson Code" := sales_code;
                    SalesHeader.Validate("Salesperson Code");
                    SalesHeader."Ship-to Code" := ship_to_code;
                    SalesHeader."Ship-to Name" := ship_to_name;
                    SalesHeader."Posting Description" := customer_specification;
                    SalesHeader."PDA Order" := Evaluate(SalesHeader."PDA Order", PDA);
                    SalesHeader.Validate("PDA Order");
                    //Check if External Document No Exists
                    SalesHeader2.Reset();
                    SalesHeader2.SetRange("External Document No.", OrderNo);
                    if not SalesHeader2.FindFirst() then begin
                        SalesHeader."External Document No." := OrderNo;
                        SalesHeader.Insert(true);
                    end;
                    // Message(SalesHeader."No.");

                    JsonMgt.InitializeObject(PurchOrderText);
                    if JsonMgt.GetArrayPropertyValueAsStringByName('order_items', SalesInvoiceLinesTxt) then begin
                        LinesArrayMgt.InitializeCollection(SalesInvoiceLinesTxt);
                        for n := 0 to LinesArrayMgt.GetCollectionCount() - 1 do begin
                            Clear(SalesInvoiceLinesTxt);
                            Clear(LinesText);
                            Clear(ItemCode);
                            Clear(quantity);
                            Clear(unit_of_measure);
                            Clear(product_specifications);
                            LinesArrayMgt.GetObjectFromCollectionByIndex(LinesText, n);
                            ObjectMgt.InitializeObject(LinesText);
                            ObjectMgt.GetStringPropertyValueByName('item_code', ItemCode);
                            ObjectMgt.GetStringPropertyValueByName('quantity', quantity);
                            quantity := RemoveWhiteSpaces(quantity);
                            ObjectMgt.GetStringPropertyValueByName('unit_of_measure', unit_of_measure);
                            ObjectMgt.GetStringPropertyValueByName('product_specifications', product_specifications);

                            LineNo += 100;
                            SalesLine.Init();
                            SalesLine."Document No." := SalesHeader."No.";
                            SalesLine."Document Type" := SalesLine."Document Type"::Order;
                            SalesLine.Type := SalesLine.Type::Item;
                            SalesLine."No." := ItemCode;
                            SalesLine.Validate("No.");
                            SalesLine."Line No." := LineNo;
                            Evaluate(SalesLine."Order Quantity", quantity);
                            SalesLine.Validate("Order Quantity");
                            // SalesLine."Unit of Measure Code" := unit_of_measure;
                            SalesLine."Customer Specification" := product_specifications;
                            SalesLine.Insert();
                        end;
                    end;
                end;
            end else
                Message('GET request failed. Status Code: %1', StatusCode);
        end;
    end;

    procedure GetTransferOrdersFromWMS()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";
        StatusCode, i, j : Integer;
        PurchOrderText, TransferOrderNo, transfer_from_code, transfer_to_code, LineNo1, issuer, receiver : Text;
        shipment_date, status : Text;
        TransferHeader, Transfer, TransferHeader2 : Record "Transfer Header";
        TransferLines: Record "Transfer Line";
        LineNo: Integer;
        Company: Record "Company Information";
        TransferLinesTxt, LinesText, quantity, batchquantity, batch_no, ItemCode, product_specifications, unit_of_measure : Text;
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Transfer Orders From WMS");
        BaseUrl2 := FCLIntSetup."Transfer Orders From WMS";
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    // Message(Format(i));
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(PurchOrderText, i);
                    ObjectJSONManagement.InitializeObject(PurchOrderText);
                    ObjectJSONManagement.GetStringPropertyValueByName('transfer_order_no', TransferOrderNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('transfer_from_code', transfer_from_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('transfer_to_code', transfer_to_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('issuer', issuer);
                    ObjectJSONManagement.GetStringPropertyValueByName('receiver', receiver);
                    ObjectJSONManagement.GetStringPropertyValueByName('shipment_date', shipment_date);
                    ObjectJSONManagement.GetStringPropertyValueByName('status', status);
                    // ObjectJSONManagement.InitializeObject(PurchOrderText);

                    TransferHeader.Init();
                    TransferHeader."No." := '';
                    TransferHeader."Transfer Order No." := TransferOrderNo;
                    TransferHeader."Transfer-from Code" := transfer_from_code;
                    Evaluate(TransferHeader."Shipment Date", shipment_date);
                    TransferHeader.Validate("Shipment Date");
                    TransferHeader."Transfer-to Code" := transfer_to_code;
                    TransferHeader."Issued by" := issuer;
                    TransferHeader."Received by" := receiver;
                    TransferHeader."Direct Transfer" := true;
                    TransferHeader."Transfer Status" := TransferHeader."Transfer Status"::"Pending Approval";
                    TransferHeader.Insert(true);
                    Message(TransferHeader."No.");

                    JsonMgt.InitializeObject(PurchOrderText);
                    if JsonMgt.GetArrayPropertyValueAsStringByName('order_items', TransferLinesTxt) then begin
                        LinesArrayMgt.InitializeCollection(TransferLinesTxt);
                        for j := 0 to LinesArrayMgt.GetCollectionCount() - 1 do begin
                            LinesArrayMgt.GetObjectFromCollectionByIndex(LinesText, j);
                            ObjectMgt.InitializeObject(LinesText);
                            ObjectMgt.GetStringPropertyValueByName('transfer_line_no', LineNo1);
                            ObjectMgt.GetStringPropertyValueByName('item_code', ItemCode);
                            ObjectMgt.GetStringPropertyValueByName('quantity', quantity);
                            ObjectMgt.GetStringPropertyValueByName('unit_of_measure', unit_of_measure);
                            ObjectMgt.GetStringPropertyValueByName('product_specifications', product_specifications);
                            ObjectMgt.GetStringPropertyValueByName('batch_no', batch_no);
                            ObjectMgt.GetStringPropertyValueByName('quantity', batchquantity);
                            // JsonMgt.InitializeObject(PurchOrderText);

                            LineNo += 100;
                            TransferLines.Init();
                            TransferLines."Document No." := TransferHeader."No.";
                            TransferLines."Line No." := LineNo;
                            TransferLines."Item No." := ItemCode;
                            TransferLines.Validate("Item No.");
                            Evaluate(TransferLines.Quantity, quantity);
                            TransferLines.Validate(Quantity);
                            // TransferLines."Unit of Measure Code" := unit_of_measure;
                            // TransferLines.Description := product_specifications;
                            TransferLines."Batch No." := batch_no;
                            Evaluate(TransferLines."Batch Quantity", batchquantity);
                            TransferLines.Validate("Batch Quantity");
                            TransferLines.Insert(true);
                        end;
                        TransferHeader2.Reset();
                        TransferHeader2.SetRange("No.", resolveTransferHeaderNo(TransferOrderNo));
                        IF TransferHeader2.FindFirst() THEN BEGIN
                            CODEUNIT.Run(CODEUNIT::"TransferOrder-Post (Yes/No)", TransferHeader2);
                        END
                    end;
                end;

            end else
                Message('GET request failed. Status Code: %1', StatusCode);
        end;
    end;

    procedure resolveTransferHeaderNo(TransferOrderNo: Text): Text

    var
        TransferHeadeRec: Record "Transfer Header";
    begin
        TransferHeadeRec.SetRange("Transfer Order No.", TransferOrderNo);

        if TransferHeadeRec.FindFirst() then
            exit(TransferHeadeRec."No.")
        else
            Error('Transfer Order No %1 not found.', TransferOrderNo);

    end;

    procedure GetSalesInvoicesFromPortal()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, JsonMgt, ObjectMgt, LinesArrayMgt : Codeunit "JSON Management";
        StatusCode, i, n : Integer;
        PurchInvoiceText, InvoiceNo, CustomerNo, CUInvoiceNo, CUNo, CUDateTime, shipment_date, sales_person_code, ship_to_code, ship_to_name, sales_person_name, default_location, unit_of_measure : Text;
        status, customer_specification, qr_code, unit_price, quantity, sales_line_no, line_amount_incl_vat, SalesInvoiceLinesTxt, LinesText, ItemCode : Text;
        SalesHeader, SalesHeader2 : Record "Sales Header";
        SalesLine: Record "Sales Line";
        LineNo: Integer;
        Company: Record "Company Information";
        verificationURL: Text;
        ContrUnitUsers: Record "Control Unit Users";
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Sales Invoices From Portal");
        ContrUnitUsers.Reset();
        ContrUnitUsers.SetRange(UserID, UserId);
        if ContrUnitUsers.FindFirst() then begin
            BaseUrl2 := ContrUnitUsers."Printer IP Address" + '/print-invoice';
            // Message(BaseUrl12);
        end;
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                // Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    // Message(Format(i));
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(PurchInvoiceText, i);
                    ObjectJSONManagement.InitializeObject(PurchInvoiceText);
                    ObjectJSONManagement.GetStringPropertyValueByName('InvoiceNo', InvoiceNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('CUInvoiceNo', CUInvoiceNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('CUDateTime', CUDateTime);
                    ObjectJSONManagement.GetStringPropertyValueByName('CUNo', CUNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('customer_code', CustomerNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('shipment_date', shipment_date);
                    ObjectJSONManagement.GetStringPropertyValueByName('sales_person_code', sales_person_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('sales_person_name', sales_person_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('default_location', default_location);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_code', ship_to_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_name', ship_to_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('status', status);
                    ObjectJSONManagement.GetStringPropertyValueByName('qr_code', qr_code);
                    // ObjectJSONManagement.InitializeObject(PurchOrderText);
                    // Message(OrderNo);

                    SalesHeader.Init();
                    SalesHeader."No." := '';
                    SalesHeader."WMS Invoice No." := InvoiceNo;
                    SalesHeader."Document Type" := SalesHeader."Document Type"::Invoice;
                    SalesHeader.Status := SalesHeader.Status::Open;
                    SalesHeader."External Document No." := InvoiceNo;
                    SalesHeader.CUInvoiceNo := CUInvoiceNo;
                    SalesHeader."Sell-to Customer No." := CustomerNo;
                    SalesHeader.Validate("Sell-to Customer No.");
                    Evaluate(SalesHeader."Shipment Date", shipment_date);
                    SalesHeader.Validate("Shipment Date");
                    SalesHeader."Salesperson Code" := sales_person_code;
                    SalesHeader.Validate("Salesperson Code");
                    SalesHeader."Ship-to Code" := ship_to_code;
                    SalesHeader."Ship-to Name" := ship_to_name;
                    // SalesHeader.Status := SalesHeader.Status::Released;n                                 
                    SalesHeader."QR Code" := qr_code;
                    //Check if External Document No Exists
                    SalesHeader2.Reset();
                    SalesHeader2.SetRange("External Document No.", InvoiceNo);
                    if not SalesHeader2.FindFirst() then begin
                        SalesHeader."External Document No." := InvoiceNo;
                        SalesHeader.Insert(true);
                    end;
                    Message(SalesHeader."No.");

                    JsonMgt.InitializeObject(PurchInvoiceText);
                    if JsonMgt.GetArrayPropertyValueAsStringByName('invoice_items', SalesInvoiceLinesTxt) then begin
                        LinesArrayMgt.InitializeCollection(SalesInvoiceLinesTxt);
                        for n := 0 to LinesArrayMgt.GetCollectionCount() - 1 do begin
                            Clear(SalesInvoiceLinesTxt);
                            Clear(LinesText);
                            Clear(ItemCode);
                            // Clear(quantity);
                            Clear(unit_of_measure);
                            // Clear(product_specifications);
                            LinesArrayMgt.GetObjectFromCollectionByIndex(LinesText, n);
                            ObjectMgt.InitializeObject(LinesText);
                            ObjectMgt.GetStringPropertyValueByName('sales_line_no', sales_line_no);
                            ObjectMgt.GetStringPropertyValueByName('item_code', ItemCode);
                            ObjectMgt.GetStringPropertyValueByName('quantity', quantity);
                            ObjectMgt.GetStringPropertyValueByName('unit_price', unit_price);
                            ObjectMgt.GetStringPropertyValueByName('unit_of_measure', unit_of_measure);
                            ObjectMgt.GetStringPropertyValueByName('line_amount_incl_vat', line_amount_incl_vat);

                            LineNo += 100;
                            SalesLine.Init();
                            SalesLine."Document No." := SalesHeader."No.";
                            SalesLine."Document Type" := SalesLine."Document Type"::Invoice;
                            SalesLine.Type := SalesLine.Type::Item;
                            SalesLine."No." := ItemCode;
                            SalesLine.Validate("No.");
                            SalesLine."Line No." := LineNo;
                            Evaluate(SalesLine."Order Quantity", quantity);
                            SalesLine.Validate("Order Quantity");
                            Evaluate(SalesLine."Unit Price", unit_price);
                            SalesLine.Validate("Unit Price");
                            Evaluate(SalesLine."Amount Including VAT", line_amount_incl_vat);
                            SalesLine.Validate("Amount Including VAT");
                            SalesLine.Insert();
                        end;
                    end;
                end;
            end else
                Message('GET request failed. Status Code: %1', StatusCode);
        end;
    end;



    procedure GetProductionOrdersFromWMS()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, JsonMgt, ObjectMgt, LinesArrayMgt : Codeunit "JSON Management";
        StatusCode, i, n : Integer;
        PurchOrderText, production_order_no, ItemNo, quantity : Text;
        ship_to_name, status, customer_specification, UserID, type, uom, ProductionLinesTxt, LinesText, ItemCode, LocationCode, BIN, user, line_no, routing, date_time : Text;
        ProductionOrder: Record "Production Order";
        ProductionLine: Record "Prod. Order Line";
        LineNo: Integer;
        Noseries: Codeunit "No. Series";
        ManufactSetup: Record "Manufacturing Setup";
        Company: Record "Company Information";
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Production Orders From WMS");
        BaseUrl2 := FCLIntSetup."Production Orders From WMS";

        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    // Message(Format(i));
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(PurchOrderText, i);
                    ObjectJSONManagement.InitializeObject(PurchOrderText);
                    ObjectJSONManagement.GetStringPropertyValueByName('production_order_no', production_order_no);
                    ObjectJSONManagement.GetStringPropertyValueByName('ItemNo', ItemNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('Quantity', Quantity);
                    ObjectJSONManagement.GetStringPropertyValueByName('uom', uom);
                    ObjectJSONManagement.GetStringPropertyValueByName('LocationCode', LocationCode);
                    ObjectJSONManagement.GetStringPropertyValueByName('BIN', BIN);
                    ObjectJSONManagement.GetStringPropertyValueByName('user', user);
                    ObjectJSONManagement.GetStringPropertyValueByName('line_no', line_no);
                    ObjectJSONManagement.GetStringPropertyValueByName('routing', routing);
                    ObjectJSONManagement.GetStringPropertyValueByName('date_time', date_time);

                    // Message(OrderNo);

                    ProductionOrder.Init();
                    ProductionOrder."No." := Noseries.GetNextNo(ManufactSetup."Released Order Nos.", 0D, TRUE);
                    ProductionOrder."Production Order No." := production_order_no;
                    ProductionOrder.Status := ProductionOrder.Status::Released;
                    // ProductionOrder.ite := CustomerNo;
                    // ProductionOrder.Validate("Sell-to Customer No.");
                    // ProductionOrder."Document Type" := ProductionOrder."Document Type"::Order;
                    // Evaluate(ProductionOrder."Shipment Date", shipment_date);
                    // ProductionOrder.Validate("Shipment Date");
                    // ProductionOrder."Salesperson Code" := sales_code;
                    // ProductionOrder.Validate("Salesperson Code");
                    // ProductionOrder."Ship-to Code" := ship_to_code;
                    // ProductionOrder."Ship-to Name" := ship_to_name;
                    // ProductionOrder."Posting Description" := customer_specification;
                    // ProductionOrder."PDA Order" := Evaluate(ProductionOrder."PDA Order", PDA);
                    // ProductionOrder.Validate("PDA Order");
                    ProductionOrder.Insert(true);
                    // Message(SalesHeader."No.");
                    Clear(UserID);
                    UserID := 'AGILEBIZPAIVY.ESHIRERA';
                    JsonMgt.InitializeObject(PurchOrderText);
                    if JsonMgt.GetArrayPropertyValueAsStringByName('ProductionJournalLines', ProductionLinesTxt) then begin
                        LinesArrayMgt.InitializeCollection(ProductionLinesTxt);
                        for n := 0 to LinesArrayMgt.GetCollectionCount() - 1 do begin
                            Clear(ProductionLinesTxt);
                            Clear(LinesText);
                            Clear(ItemCode);
                            Clear(quantity);
                            LinesArrayMgt.GetObjectFromCollectionByIndex(LinesText, n);
                            ObjectMgt.InitializeObject(LinesText);
                            ObjectMgt.GetStringPropertyValueByName('ItemNo', ItemCode);
                            ObjectMgt.GetStringPropertyValueByName('Quantity', Quantity);
                            ObjectMgt.GetStringPropertyValueByName('uom', uom);
                            ObjectMgt.GetStringPropertyValueByName('LocationCode', LocationCode);
                            ObjectMgt.GetStringPropertyValueByName('BIN', BIN);
                            ObjectMgt.GetStringPropertyValueByName('line_no', line_no);
                            ObjectMgt.GetStringPropertyValueByName('type', type);
                            ObjectMgt.GetStringPropertyValueByName('date_time', date_time);
                            ObjectMgt.GetStringPropertyValueByName('user', UserID);

                            LineNo += 100;
                            ProductionLine.Init();
                            ProductionLine."Prod. Order No." := ProductionOrder."No.";
                            ProductionLine.Status := ProductionOrder.Status::Released;
                            ProductionLine."Item No." := ItemCode;
                            ProductionLine.Validate("Item No.");
                            ProductionLine."Line No." := LineNo;
                            Evaluate(ProductionLine.Quantity, quantity);
                            ProductionLine.Validate(Quantity);
                            // ProductionLine."Unit of Measure Code" := unit_of_measure;
                            ProductionLine."Location Code" := LocationCode;
                            ProductionLine."Bin Code" := BIN;
                            ProductionLine."Routing Type" := ProductionLine."Routing Type"::Serial;
                            // Evaluate(ProductionLine."Routing Type", type);
                            // ProductionLine.Validate("Routing Type");
                            Evaluate(ProductionLine."Ending Date-Time", date_time);
                            ProductionLine.Validate("Ending Date-Time");
                            ProductionLine.Insert();
                        end;
                    end;
                end;
            end else
                Message('GET request failed. Status Code: %1', StatusCode);
        end;
    end;


    procedure PostOrderPacking(var SalesOrder: Record "Sales Header")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        PrintLogRec: Record "Document Print Log";
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        CurrUserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        LineNo: Integer;
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        CUSetup: Record "Control Unit Setup";
        ContrUnitUsers: Record "Control Unit Users";
        CurrentUser: Text;
        CustomerPostingGroup: Record "Customer Posting Group";

        CopyNames: array[4] of Text[10];
        CopyValues: array[4] of Integer;
        CopiesObject: JsonObject;
        i: Integer;
        NoPrinted: Integer;
        DispSuperUserSetup: Record "User Setup";


    begin
        PrintLogRec.Reset();
        PrintLogRec.SetRange("Document No.", SalesOrder."No.");
        PrintLogRec.SetRange("Document Type", 'Packing List Print');
        NoPrinted := PrintLogRec.Count;

        if NoPrinted > 0 then begin
            if not DispSuperUserSetup.Get(UserId) then
                Error('Only users marked as Dispatch Supervisor in User Setup can reprint order packing lists.');
            if not DispSuperUserSetup."Dispatch Supervisor" then
                Error('Only users marked as Dispatch Supervisor in User Setup can reprint order packing lists.');
        end;

        if SalesOrder."Posting Date" < Today then
            Error('Posting Date must be greater than today.');

        if SalesOrder."Shipment Date" < Today then
            Error('Shipment Date must be greater than today.');

        Company.Get();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print  Orders FPacking");
        BaseUrl12 := FCLIntSetup."Print  Orders FPacking";

        // CurrentUser := UserID;

        // IF SalesOrder."Salesperson Code" = '270' then begin
        If NOT CustomerPostingGroup.Get(SalesOrder."Customer Posting Group") then
            Error('Customer Posting Group %1 not found.', SalesOrder."Customer Posting Group");

        IF (CustomerPostingGroup."Customer Type" = CustomerPostingGroup."Customer Type"::Export) then begin
            ContrUnitUsers.Reset();
            // User := UserId;
            ContrUnitUsers.SetRange(UserID, UserId);
            if ContrUnitUsers.FindFirst() then begin

                BaseUrl12 := FCLIntSetup."Export OrderPacking"
                // Message(BaseUrl12);
            end else begin
                Error('Kindly Check the IP Address on Control Unit Setup');
            end;
        end;
        //change URL if order is export



        salesPerson_Purchaser.Reset();
        salesPerson_Purchaser.SetRange(Code, SalesOrder."Salesperson Code");
        if salesPerson_Purchaser.FindFirst() then begin
            SalesName := salesPerson_Purchaser.Name;
        end;

        CurrUserID := WMSItegrations.ExtractAfterBackslash(SalesOrder."Assigned User ID");
        begin
            Clear(JArray);

            MainObject.Add('order_no', SalesOrder."No.");
            MainObject.Add('ended_by', CurrUserID);
            MainObject.Add('customer_no', SalesOrder."Sell-to Customer No.");
            MainObject.Add('customer_name', SalesOrder."Sell-to Customer Name");
            MainObject.Add('shp_code', SalesOrder."Ship-to Code");
            MainObject.Add('shp_name', SalesOrder."Ship-to Name");
            MainObject.Add('route_code', SalesOrder."Location Code");
            MainObject.Add('sp_code', SalesOrder."Salesperson Code");
            MainObject.Add('sp_name', SalesName);
            MainObject.Add('shp_date', SalesOrder."Shipment Date");
            MainObject.Add('assembler', '');
            MainObject.Add('order_receiver', SalesOrder."Assigned User ID");
            MainObject.Add('checker', '');
            MainObject.Add('status', SalesOrder.Status::Execute);
            MainObject.Add('pda', SalesOrder."PDA Order");
            MainObject.Add('ending_time', Time());
            MainObject.Add('ending_date', Today());
            MainObject.Add('ext_doc_no', SalesOrder."External Document No.");
            MainObject.Add('company_flag', Company.Name);
            MainObject.Add('no_printed', NoPrinted);

            CopyNames[1] := 'CopyA';
            CopyNames[2] := 'CopyB';
            CopyNames[3] := 'CopyC';
            CopyNames[4] := 'CopyD';

            CopyValues[1] := 0;
            CopyValues[2] := 0;
            CopyValues[3] := 0;
            CopyValues[4] := 0;

            for i := 1 to 4 do
                CopiesObject.Add(CopyNames[i], CopyValues[i]);
            MainObject.Add('Copy', CopiesObject);
        end;

        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesOrder."No.");
        SalesLines.SetRange("Document Type", SalesLines."Document Type"::Order);
        SalesLines.SETRANGE(Type, SalesLines.Type::Item);
        SalesLines.SETFILTER("Posting Group", PLS.Filters);
        if SalesLines.Find('-') then begin
            repeat
                if Items.Get(SalesLines."No.") then begin
                    Clear(PartNo);
                    PartNo := Items."Part No.";
                end;
                Clear(BarCode);
                barcode := SalesOrderSubform.GetBarcode(SalesLines."No.");
                Clear(JsonObject);
                JsonObject.Add('line_no', SalesLines."Line No.");
                JsonObject.Add('item_no', SalesLines."No.");
                JsonObject.Add('item_description', SalesLines.Description);
                JsonObject.Add('customer_spec', SalesLines."Customer Specification");
                JsonObject.Add('posting_group', SalesLines."Posting Group");
                JsonObject.Add('unit_of_measure', SalesLines."Unit of Measure Code");
                JsonObject.Add('part', PartNo);
                JsonObject.Add('order_qty', SalesLines."Order Quantity");
                JsonObject.Add('ass_qty', SalesLines."Qty. Assigned");
                JsonObject.Add('exec_qty', SalesLines.Quantity);
                JsonObject.Add('assembler', '');
                JsonObject.Add('checker', '');
                JsonObject.Add('barcode', barcode);
                JsonObject.Add('qty_base', SalesLines."Quantity (Base)");
                JArray.Add(JsonObject);
            until SalesLines.Next() = 0;
        end;

        MainObject.Add('lines', JArray);

        // Message(Format(MainObject));
        // exit;

        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                LogPrint(
               Database::"Sales Header",
               'Packing List Print',
               SalesOrder."No.",
               NoPrinted + 1,
               UserId,
               'Printed via Print API');
            end;
            JSONManagement.InitializeObject(responseText);
            if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                // Message(responseText);


            end else begin
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                // Message('Request failed!: %1', responseText);
            end;
        end;
        PostOrderConfirmationToPortal(SalesOrder);
    end;


    procedure PostOrderPackingExecute(SalesOrder: Record "Sales Header")
    var
        JsonObject, JsonObjectWMS, MainObject, CopiesObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        PrintLogRec2: Record "Document Print Log";
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        LineNo, i : Integer;
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        CUSetup: Record "Control Unit Setup";
        ContrUnitUsers: Record "Control Unit Users";
        CurrentUser: Text;
        CopyNames: array[4] of Text[10];
        CopyValues: array[4] of Integer;
        NoPrinted2: Integer;
        CustomerPostingGroup: Record "Customer Posting Group";
        DispSuperUserSetup2: Record "User Setup";



    begin
        PrintLogRec2.Reset();
        PrintLogRec2.SetRange("Document No.", SalesOrder."No.");
        PrintLogRec2.SetRange("Document Type", 'Packing List Print');
        NoPrinted2 := PrintLogRec2.Count;

        if NoPrinted2 > 0 then begin
            if not DispSuperUserSetup2.Get(UserId) then
                Error('Only users marked as Dispatch Supervisor in User Setup can reprint order packing lists.');
            if not DispSuperUserSetup2."Dispatch Supervisor" then
                Error('Only users marked as Dispatch Supervisor in User Setup can reprint order packing lists.');
        end;

        Company.Get();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print  Orders FPacking");
        BaseUrl12 := FCLIntSetup."Print  Orders FPacking";
        // CurrentUser := UserID;

        IF (CustomerPostingGroup."Customer Type" = CustomerPostingGroup."Customer Type"::Export) then begin
            ContrUnitUsers.Reset();
            // User := UserId;
            ContrUnitUsers.SetRange(UserID, UserId);
            if ContrUnitUsers.FindFirst() then begin

                BaseUrl12 := FCLIntSetup."Export OrderPacking"
                // Message(BaseUrl12);
            end else begin
                Error('Kindly Check the IP Address on Control Unit Setup');
            end;
        end;
        //change URL if order is export



        salesPerson_Purchaser.Reset();
        salesPerson_Purchaser.SetRange(Code, SalesOrder."Salesperson Code");
        if salesPerson_Purchaser.FindFirst() then begin
            SalesName := salesPerson_Purchaser.Name;
        end;

        CurrentUser := WMSItegrations.ExtractAfterBackslash(SalesOrder."Assigned User ID");
        begin
            Clear(JArray);
            MainObject.Add('order_no', SalesOrder."No.");
            MainObject.Add('ended_by', CurrentUser);
            MainObject.Add('customer_no', SalesOrder."Sell-to Customer No.");
            MainObject.Add('customer_name', SalesOrder."Sell-to Customer Name");
            MainObject.Add('shp_code', SalesOrder."Ship-to Code");
            MainObject.Add('shp_name', SalesOrder."Ship-to Name");
            MainObject.Add('route_code', SalesOrder."Location Code");
            MainObject.Add('sp_code', SalesOrder."Salesperson Code");
            MainObject.Add('sp_name', SalesName);
            MainObject.Add('shp_date', SalesOrder."Shipment Date");
            MainObject.Add('assembler', '');
            MainObject.Add('order_receiver', SalesOrder."Assigned User ID");
            MainObject.Add('checker', '');
            MainObject.Add('status', SalesOrder.Status::Execute);
            MainObject.Add('pda', SalesOrder."PDA Order");
            MainObject.Add('ending_time', Time());
            MainObject.Add('ending_date', Today());
            MainObject.Add('ext_doc_no', SalesOrder."External Document No.");
            MainObject.Add('company_flag', Company.Name);

            CopyNames[1] := 'CopyA';
            CopyNames[2] := 'CopyB';
            CopyNames[3] := 'CopyC';
            CopyNames[4] := 'CopyD';

            CopyValues[1] := 0;
            CopyValues[2] := 0;
            CopyValues[3] := 0;
            CopyValues[4] := 0;

            for i := 1 to 4 do
                CopiesObject.Add(CopyNames[i], CopyValues[i]);
            MainObject.Add('Copy', CopiesObject);
        end;

        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesOrder."No.");
        SalesLines.SetRange("Document Type", SalesLines."Document Type"::Order);
        SalesLines.SETRANGE(Type, SalesLines.Type::Item);
        SalesLines.SETFILTER("Posting Group", PLS.Filters);
        if SalesLines.Find('-') then begin
            repeat
                if Items.Get(SalesLines."No.") then begin
                    Clear(PartNo);
                    PartNo := Items."Part No.";
                end;
                Clear(BarCode);
                barcode := SalesOrderSubform.GetBarcode(SalesLines."No.");
                Clear(JsonObject);
                JsonObject.Add('line_no', SalesLines."Line No.");
                JsonObject.Add('item_no', SalesLines."No.");
                JsonObject.Add('item_description', SalesLines.Description);
                JsonObject.Add('customer_spec', SalesLines."Customer Specification");
                JsonObject.Add('posting_group', SalesLines."Posting Group");
                JsonObject.Add('unit_of_measure', SalesLines."Unit of Measure Code");
                JsonObject.Add('part', PartNo);
                JsonObject.Add('order_qty', SalesLines."Order Quantity");
                JsonObject.Add('ass_qty', SalesLines."Qty. Assigned");
                JsonObject.Add('exec_qty', SalesLines.Quantity);
                JsonObject.Add('assembler', '');
                JsonObject.Add('checker', '');
                JsonObject.Add('barcode', barcode);
                JsonObject.Add('qty_base', SalesLines."Quantity (Base)");
                JArray.Add(JsonObject);
            until SalesLines.Next() = 0;
        end;
        MainObject.Add('lines', JArray);
        // Message(Format(MainObject));
        // exit;

        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                LogPrint(
               Database::"Sales Header",
               'Packing List Print',
               SalesOrder."No.",
               NoPrinted2 + 1,
               UserId,
               'Printed via Print API');

                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    Message(responseText);
                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    Message(responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
        PostOrderConfirmationToPortal(SalesOrder);
    end;


    procedure PostInvoice(SalesOrder: Record "Sales Header")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        LineNo: Integer;
        WMSItegrations: Codeunit "WMSIntegrationsFinal";

    begin
        Company.Get();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print  Orders FPacking");
        BaseUrl12 := FCLIntSetup."Print  Orders FPacking";
        salesPerson_Purchaser.Reset();
        salesPerson_Purchaser.SetRange(Code, SalesOrder."Salesperson Code");
        if salesPerson_Purchaser.FindFirst() then begin
            SalesName := salesPerson_Purchaser.Name;
        end;

        UserID := WMSItegrations.ExtractAfterBackslash(SalesOrder."Assigned User ID");
        begin
            Clear(JArray);
            MainObject.Add('order_no', SalesOrder."No.");
            MainObject.Add('ended_by', UserID);
            MainObject.Add('customer_no', SalesOrder."Sell-to Customer No.");
            MainObject.Add('customer_name', SalesOrder."Sell-to Customer Name");
            MainObject.Add('shp_code', SalesOrder."Ship-to Code");
            MainObject.Add('shp_name', SalesOrder."Ship-to Name");
            MainObject.Add('route_code', SalesOrder."Location Code");
            MainObject.Add('sp_code', SalesOrder."Salesperson Code");
            MainObject.Add('sp_name', SalesName);
            MainObject.Add('shp_date', SalesOrder."Shipment Date");
            MainObject.Add('assembler', '');
            MainObject.Add('order_receiver', SalesOrder."Assigned User ID");
            MainObject.Add('checker', '');
            MainObject.Add('status', SalesOrder.Status::Execute);
            MainObject.Add('pda', SalesOrder."PDA Order");
            MainObject.Add('ending_time', Time());
            MainObject.Add('ending_date', Today());
            MainObject.Add('ext_doc_no', SalesOrder."External Document No.");
            MainObject.Add('company_flag', Company.Name);
        end;

        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesOrder."No.");
        SalesLines.SetRange("Document Type", SalesLines."Document Type"::Order);
        SalesLines.SETRANGE(Type, SalesLines.Type::Item);
        SalesLines.SETFILTER("Posting Group", PLS.Filters);
        if SalesLines.Find('-') then begin
            repeat
                if Items.Get(SalesLines."No.") then begin
                    Clear(PartNo);
                    PartNo := Items."Part No.";
                end;
                Clear(BarCode);
                barcode := SalesOrderSubform.GetBarcode(SalesLines."No.");
                Clear(JsonObject);
                JsonObject.Add('line_no', SalesLines."Line No.");
                JsonObject.Add('item_no', SalesLines."No.");
                JsonObject.Add('item_description', SalesLines.Description);
                JsonObject.Add('customer_spec', SalesLines."Customer Specification");
                JsonObject.Add('posting_group', SalesLines."Posting Group");
                JsonObject.Add('unit_of_measure', SalesLines."Unit of Measure Code");
                JsonObject.Add('part', PartNo);
                JsonObject.Add('order_qty', SalesLines."Order Quantity");
                JsonObject.Add('ass_qty', SalesLines."Qty. Assigned");
                JsonObject.Add('exec_qty', SalesLines.Quantity);
                JsonObject.Add('assembler', '');
                JsonObject.Add('checker', '');
                JsonObject.Add('barcode', barcode);
                JsonObject.Add('qty_base', SalesLines."Quantity (Base)");
                JArray.Add(JsonObject);
            until SalesLines.Next() = 0;
        end;
        MainObject.Add('lines', JArray);
        // Message(Format(MainObject));
        // exit;

        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                LogPrint(
                 Database::"Sales Header",
                 'Packing List Print',
                 SalesOrder."No.",
                 SalesOrder."No. Printed",
                 UserId,
                 'Printed via Print API');
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);

                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;


    procedure GetSlaughterLinesFromWMS(SalughterData: Record SlaughterData)
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        Noseries: Codeunit "No. Series";
        NoSeriesBatch: Codeunit "No. Series - Batch";
        SlaughtData: Record SlaughterData;
        MeatProcessSetup: Record "Meat Processing Setup";
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";
        StatusCode, i, j : Integer;
        PurchOrderText, TransferOrderNo, transfer_from_code, transfer_to_code, LineNo1, issuer, receiver : Text;
        shipment_date, status : Text;
        LineNo: Integer;
        Company: Record "Company Information";
        TransferLinesTxt, net_weight, item_code, UserID, vendor_no, settlement_weight, LinesText, quantity, batchquantity, batch_no, ItemCode, product_specifications, unit_of_measure, slapmark, is_imported, user_id, manual_weight, classification_code, meat_percent, vendor_name, time_stamp : Text;
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Get Slaughter Lines");
        MeatProcessSetup.Get();
        MeatProcessSetup.TestField("Slaughter Data Series Code");
        BaseUrl2 := FCLIntSetup."Get Slaughter Lines";
        Clear(UserID);
        UserID := 'AGILEBIZPAIVY.ESHIRERA';
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(LinesText, i);
                    // Message(Format(i));
                    ObjectMgt.InitializeObject(LinesText);
                    ObjectMgt.GetStringPropertyValueByName('receipt_no', LineNo1);
                    ObjectMgt.GetStringPropertyValueByName('slapmark', slapmark);
                    ObjectMgt.GetStringPropertyValueByName('item_code', item_code);
                    ObjectMgt.GetStringPropertyValueByName('vendor_no', vendor_no);
                    ObjectMgt.GetStringPropertyValueByName('vendor_name', vendor_name);
                    ObjectMgt.GetStringPropertyValueByName('net_weight', net_weight);
                    ObjectMgt.GetStringPropertyValueByName('settlement_weight', settlement_weight);
                    ObjectMgt.GetStringPropertyValueByName('meat_percent', meat_percent);
                    ObjectMgt.GetStringPropertyValueByName('classification_code', classification_code);
                    ObjectMgt.GetStringPropertyValueByName('manual_weight', manual_weight);
                    ObjectMgt.GetStringPropertyValueByName('user_id', user_id);
                    ObjectMgt.GetStringPropertyValueByName('is_imported', is_imported);
                    ObjectMgt.GetStringPropertyValueByName('timestamp', time_stamp);

                    SalughterData.Init();
                    SalughterData.SlaughterSequenceNo := Noseries.GetNextNo(MeatProcessSetup."Slaughter Data Series Code", 0D, TRUE);
                    SalughterData.ReceiptNo := LineNo1;
                    SalughterData.SlapMark := slapmark;
                    SalughterData.ItemNo := item_code;
                    SalughterData.VendorNo := vendor_no;
                    SalughterData.VendorName := vendor_name;
                    SalughterData.ClassificationCode := classification_code;
                    SalughterData.Validate(ClassificationCode);
                    Evaluate(SalughterData.StockWeight, net_weight);
                    SlaughtData.Validate(StockWeight);
                    // Evaluate(SalughterData.SettlementWeight, settlement_weight);
                    Evaluate(SalughterData.MeatPercent, meat_percent);
                    SalughterData.Validate(MeatPercent);
                    // SalughterData. := manual_weight;
                    SalughterData.SalughteredBy := UserID;
                    // SalughterData. := is_imported;
                    Evaluate(SlaughtData."Slaughter Date Time", time_stamp);
                    SalughterData.Validate("Slaughter Date Time");
                    SalughterData.SlaughterDate := DT2Date(SlaughtData."Slaughter Date Time");
                    SalughterData.SlaughterTime := DT2Time(SlaughtData."Slaughter Date Time");
                    SlaughtData.Validate(StockWeight);
                    SalughterData.Validate(ClassificationCode);
                    SalughterData.Insert();
                end;
            end;
        end else
            Message('GET request failed. Status Code: %1', StatusCode);
    end;

    procedure GetFetchBOTOrdersFromWMS(ImportedOrders: Record "Imported Orders")
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";
        StatusCode, i, j : Integer;
        PurchOrderText, TransferOrderNo, transfer_from_code, transfer_to_code, LineNo1, issuer, receiver : Text;
        shipment_date, status, ObjString, tmpString, FromDate, api_key, companys, FromCount, ToCount, recieved_date : Text;
        LineNo, Year, Month, Date : Integer;
        CompanyInfo: Record "Company Information";
        TransferLinesTxt, net_weight, item_no, cust_no, line_no, cust_spec, ext_doc_no, shp_date, company, uom_code, sp_code, UserID, item_spec, shp_code, vendor_no, settlement_weight, LinesText, quantity, batchquantity, batch_no, ItemCode, product_specifications, unit_of_measure, slapmark, is_imported, user_id, manual_weight, classification_code, meat_percent, vendor_name : Text;
    begin
        Clear(Year);
        Clear(Month);
        Clear(Date);
        CompanyInfo.get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Fetch BOT Orders Ungrouped");
        BaseUrl2 := FCLIntSetup."Fetch BOT Orders Ungrouped";
        Clear(UserID);
        UserID := 'AGILEBIZPAIVY.ESHIRERA';
        api_key := '412cce7c-a737-4d01-b929-534fcc80e79d';
        Companys := CompanyInfo.Name;
        Year := Date2DMY(Today, 3);
        Month := Date2DMY(Today, 2);
        Date := Date2DMY(Today, 1);
        recieved_date := Format(Year) + Format(Month) + Format(Date);
        FromCount := FCLIntSetup."From Count";
        ToCount := FCLIntSetup."To Count";
        ObjString := api_key + Companys + recieved_date + FromCount + ToCount;
        HttpContent.WriteFrom(ObjString);
        HttpContent.ReadAs(tmpString);
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(LinesText, i);
                    // Message(Format(i));
                    ObjectMgt.InitializeObject(LinesText);
                    ObjectMgt.GetStringPropertyValueByName('company', company);
                    ObjectMgt.GetStringPropertyValueByName('cust_no', cust_no);
                    ObjectMgt.GetStringPropertyValueByName('cust_spec', cust_spec);
                    ObjectMgt.GetStringPropertyValueByName('ext_doc_no', ext_doc_no);
                    ObjectMgt.GetStringPropertyValueByName('item_no', item_no);
                    ObjectMgt.GetStringPropertyValueByName('item_spec', item_spec);
                    ObjectMgt.GetStringPropertyValueByName('line_no', line_no);
                    ObjectMgt.GetStringPropertyValueByName('quantity', quantity);
                    ObjectMgt.GetStringPropertyValueByName('shp_code', shp_code);
                    ObjectMgt.GetStringPropertyValueByName('shp_date', shp_date);
                    ObjectMgt.GetStringPropertyValueByName('sp_code', sp_code);
                    ObjectMgt.GetStringPropertyValueByName('uom_code', uom_code);

                    LineNo += 100;
                    ImportedOrders.Init();
                    ImportedOrders.Company := company;
                    ImportedOrders."External Document No." := ext_doc_no;
                    ImportedOrders."Sell-to Customer No." := cust_no;
                    ImportedOrders."Item No." := item_no;
                    ImportedOrders."Line No." := LineNo;
                    ImportedOrders."Customer Specification" := item_spec;
                    Evaluate(ImportedOrders.Quantity, quantity);
                    ImportedOrders.Validate(Quantity);
                    ImportedOrders."Ship-to Code" := shp_code;
                    Evaluate(ImportedOrders."Shipment Date", shp_date);
                    ImportedOrders.Validate("Shipment Date");
                    ImportedOrders."Salesperson Code" := sp_code;
                    ImportedOrders."Unit of Measure" := uom_code;
                    ImportedOrders.Insert(true);
                end;
            end;
        end else
            Message('GET request failed. Status Code: %1', StatusCode);
    end;

    procedure PostLocations(Locations: Record "Location")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'Locations');
        JsonObject.Add('no', Locations.Code);
        JsonObject.Add('code', Locations.Code);
        JsonObject.Add('name', Locations.Name);

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure PostItems(Items: Record Item)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'Items');
        JsonObject.Add('no', Items."No.");
        JsonObject.Add('name', Items.Description);
        JsonObject.Add('inventory-posting-group', Items."Inventory Posting Group");
        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure PostCustomers(Customers: Record Customer)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'Customers');
        JsonObject.Add('no', Customers."No.");
        JsonObject.Add('name', Customers.Name);
        JsonObject.Add('sector', Customers.Sector);
        JsonObject.Add('country/region', Customers."Country/Region Code");
        JsonObject.Add('general-business-posting-group', Customers."Gen. Bus. Posting Group");
        JsonObject.Add('groupage-code', Customers."Groupage code");
        JsonObject.Add('customer-posting-group', Customers."Customer Posting Group");
        JsonObject.Add('customer-price-group', Customers."Customer Price Group");
        JsonObject.Add('customer-discount-group', Customers."Customer Disc. Group");
        JsonObject.Add('payment_terms', Customers."Payment Terms Code");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure PostVendors(Vendors: Record Vendor)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'Vendors');
        JsonObject.Add('no', Vendors."No.");
        JsonObject.Add('name', Vendors.Name);
        JsonObject.Add('address', Vendors.Address);
        JsonObject.Add('phone-no', Vendors."Phone No.");
        // JsonObject.Add('general-business-posting-group', Vendors.genera);
        // JsonObject.Add('groupage-code', Vendors."Groupage code");
        // JsonObject.Add('customer-posting-group', Vendors."Customer Posting Group");
        // JsonObject.Add('customer-price-group', Vendors."Customer Price Group");
        // JsonObject.Add('customer-discount-group', Vendors."Customer Disc. Group");
        JsonObject.Add('payment_terms', Vendors."Payment Terms Id");
        JsonObject.Add('application-method', '');
        JsonObject.Add('payment-terms-code', Vendors."Payment Terms Code");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure PostCustomerPriceGroups(CustPriceGroups: Record "Customer Price Group")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'CustPriceGroups');
        JsonObject.Add('description', CustPriceGroups.Description);
        JsonObject.Add('allow-line-disc.', CustPriceGroups."Allow Line Disc.");
        JsonObject.Add('allow-invoice-disc.', CustPriceGroups."Allow Invoice Disc.");
        JsonObject.Add('price-includes-vat', CustPriceGroups."Price Includes VAT");
        JsonObject.Add('vat-business-postiong-group', CustPriceGroups."VAT Bus. Posting Gr. (Price)");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostSalesPrice(SalesPrice: Record "Sales Price")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        Company: Record "Company Information";
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'SalesPrice');
        JsonObject.Add('sales-type', SalesPrice."Sales Type");
        JsonObject.Add('sales-code', SalesPrice."Sales Code");
        JsonObject.Add('item-no', SalesPrice."Item No.");
        JsonObject.Add('minimum-quantity', SalesPrice."Minimum Quantity");
        JsonObject.Add('unit-price', SalesPrice."Unit Price");
        JsonObject.Add('starting-date', SalesPrice."Starting Date");
        JsonObject.Add('ending-date', SalesPrice."Ending Date");
        JsonObject.Add('net-price', SalesPrice."Net Price");
        JsonObject.Add('line discount', SalesPrice."Line Discount %");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostFatGroupCode(FatGroupCode: Record "Fat Group Codes")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'FatGroupCode');
        JsonObject.Add('code', FatGroupCode."Fat Group Code");
        JsonObject.Add('price-deduction', FatGroupCode."Price Deduction");
        JsonObject.Add('start-date', FatGroupCode.StartDate);
        JsonObject.Add('end-date', FatGroupCode.EndDate);
        JsonObject.Add('current', FatGroupCode.Current);
        JsonObject.Add('report-classification', FatGroupCode."Report Classification");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostDiseaseCodeCode(DiseaseCode: Record Disease)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'DiseaseCode');
        JsonObject.Add('code', DiseaseCode."Disease Code");
        JsonObject.Add('description', DiseaseCode.Description);

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostFixedAsset(FAsset: Record "Fixed Asset")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'FAsset');
        JsonObject.Add('no.', FAsset."No.");
        JsonObject.Add('description', FAsset.Description);
        JsonObject.Add('responsible-employee', FAsset."Responsible Employee");
        JsonObject.Add('fa-class-code', FAsset."FA Class Code");
        JsonObject.Add('fa-subclass-code', FAsset."FA Subclass Code");
        JsonObject.Add('fa-location-code', FAsset."FA Location Code");
        JsonObject.Add('search-description', FAsset."Search Description");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostEmployees(Employees: Record Employee)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";

    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("WMS Master Data");
        BaseUrl12 := FCLIntSetup."WMS Master Data";
        JsonObject.Add('type', 'Employees');
        JsonObject.Add('no.', Employees."No.");
        JsonObject.Add('first-name', Employees."First Name");
        JsonObject.Add('last-name', Employees."Last Name");

        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if HttpResponse.IsSuccessStatusCode then begin
                end else begin
                    Message('Request failed!: %1', responseText);
                end;
            end;
        end;
    end;

    procedure PostShipment(var SalesInvoice: Record "Sales Invoice Header")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        SalesHeader: Record "Sales Header";
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        LineNo: Integer;
        companyInfo: Record "Company Information";
        contrUnitUsers: Record "Control Unit Users";

    begin
        Company.Get();
        companyInfo.FindFirst();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Invoice(Post)");
        ContrUnitUsers.Reset();
        ContrUnitUsers.SetRange(UserID, UserId);
        if ContrUnitUsers.FindFirst() then begin
            BaseUrl12 := ContrUnitUsers."Printer IP Address" + '/print-delivery';
            Message(BaseUrl12);
        end else begin
            Error('Kindly Check the IP Address on Control Unit Setup');
        end;
        SalesHeader.Reset();
        SalesHeader.SetRange("Document Type", SalesHeader."Document Type"::Invoice);
        SalesHeader.SetRange("No.", SalesInvoice."No.");
        if SalesHeader.FindFirst() then begin
            Clear(JArray);
            MainObject.Add('InvoiceNo', SalesInvoice."No.");
            MainObject.Add('customer_code', SalesInvoice."Sell-to Customer No.");
            MainObject.Add('shipment_date', SalesInvoice."Shipment Date");
            MainObject.Add('sales_person_code', SalesInvoice."Salesperson Code");
            MainObject.Add('load_to_code', SalesInvoice."Salesperson Code");
            MainObject.Add('sales_person_name', SalesName);
            MainObject.Add('default_location', SalesInvoice."Location Code");
            MainObject.Add('ship_to_code', SalesInvoice."Ship-to Code");
            MainObject.Add('ship_to_name', SalesInvoice."Ship-to Name");
            MainObject.Add('status', 'Shipped');
        end;
        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesInvoice."No.");
        SalesLines.SetRange("Document Type", SalesLines."Document Type"::Invoice);
        if SalesLines.Find('-') then begin
            repeat
                Clear(JsonObject);
                JsonObject.Add('sales_line_no', SalesLines."Line No.");
                JsonObject.Add('item_code', SalesLines."No.");
                JsonObject.Add('quantity', SalesLines.Quantity);
                JsonObject.Add('unit_of_measure', SalesLines."Unit of Measure");
                JsonObject.Add('unit_price', SalesLines."Unit Price");
                JsonObject.Add('line_amount_incl_vat', SalesLines."VAT Base Amount");
                JArray.Add(JsonObject);
            until SalesLines.Next() = 0;
        end;
        MainObject.Add('invoice_items', JArray);
        Message(Format(MainObject));
        // exit;

        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    Message(responseText);
                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    Message(responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure GetSalesReturnOrders()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, JsonMgt, ObjectMgt, LinesArrayMgt : Codeunit "JSON Management";
        StatusCode, i, n : Integer;
        PurchOrderText, InvoiceNo, LineNo1, rf_no, CustomerNo, shipment_date, sales_person_code, shipment_image_url, sales_person_name, ship_to_code, quantity, product_specifications, unit_of_measure : Text;
        ship_to_name, customer_name, tmpString, ObjString, status, return_reason, customer_specification, PDA, SalesInvoiceLinesTxt, customer_code, ItemCode, LinesText : Text;
        SalesHeader, SalesHeader2 : Record "Sales Header";
        SalesLine: Record "Sales Line";
        LineNo: Integer;
        Company: Record "Company Information";
    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Sales Return Orders");
        BaseUrl2 := FCLIntSetup."Sales Return Orders";
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                // Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    // Message(Format(i));
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(PurchOrderText, i);
                    ObjectJSONManagement.InitializeObject(PurchOrderText);
                    ObjectJSONManagement.GetStringPropertyValueByName('invoice_no', InvoiceNo);
                    ObjectJSONManagement.GetStringPropertyValueByName('rf_no', rf_no);
                    ObjectJSONManagement.GetStringPropertyValueByName('customer_code', customer_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('customer_name', customer_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('shipment_date', shipment_date);
                    ObjectJSONManagement.GetStringPropertyValueByName('sales_person_code', sales_person_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('sales_person_name', sales_person_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_code', ship_to_code);
                    ObjectJSONManagement.GetStringPropertyValueByName('ship_to_name', ship_to_name);
                    ObjectJSONManagement.GetStringPropertyValueByName('status', status);
                    ObjectJSONManagement.GetStringPropertyValueByName('shipment_image_url', shipment_image_url);
                    // ObjectJSONManagement.InitializeObject(PurchOrderText);
                    // Message(OrderNo);

                    SalesHeader.Init();
                    SalesHeader."No." := '';
                    SalesHeader."External Document No." := InvoiceNo;
                    SalesHeader."Sell-to Customer No." := customer_code;
                    SalesHeader.Validate("Sell-to Customer No.");
                    SalesHeader."Document Type" := SalesHeader."Document Type"::"Return Order";
                    Evaluate(SalesHeader."Shipment Date", shipment_date);
                    SalesHeader.Validate("Shipment Date");
                    SalesHeader."Salesperson Code" := sales_person_code;
                    SalesHeader.Validate("Salesperson Code");
                    SalesHeader."Ship-to Code" := ship_to_code;
                    SalesHeader."Ship-to Name" := ship_to_name;
                    SalesHeader.Status := SalesHeader.Status::Open;
                    //Check if External Document No Exists
                    SalesHeader2.Reset();
                    SalesHeader2.SetRange("External Document No.", InvoiceNo);
                    if not SalesHeader2.FindFirst() then begin
                        SalesHeader."External Document No." := InvoiceNo;
                        SalesHeader.Insert(true);
                    end;
                    // Message(SalesHeader."No.");

                    JsonMgt.InitializeObject(PurchOrderText);
                    if JsonMgt.GetArrayPropertyValueAsStringByName('order_items', SalesInvoiceLinesTxt) then begin
                        LinesArrayMgt.InitializeCollection(SalesInvoiceLinesTxt);
                        for n := 0 to LinesArrayMgt.GetCollectionCount() - 1 do begin
                            Clear(SalesInvoiceLinesTxt);
                            Clear(LinesText);
                            Clear(ItemCode);
                            Clear(quantity);
                            Clear(unit_of_measure);
                            Clear(product_specifications);
                            LinesArrayMgt.GetObjectFromCollectionByIndex(LinesText, n);
                            ObjectMgt.InitializeObject(LinesText);
                            ObjectMgt.GetStringPropertyValueByName('sales_line_no', LineNo1);
                            ObjectMgt.GetStringPropertyValueByName('item_code', ItemCode);
                            ObjectMgt.GetStringPropertyValueByName('quantity_returned', quantity);
                            ObjectMgt.GetStringPropertyValueByName('unit_of_measure', unit_of_measure);
                            ObjectMgt.GetStringPropertyValueByName('return_reason', return_reason);

                            LineNo += 100;
                            SalesLine.Init();
                            SalesLine."Document No." := SalesHeader."No.";
                            SalesLine."Document Type" := SalesLine."Document Type"::"Return Order";
                            SalesLine.Type := SalesLine.Type::Item;
                            SalesLine."No." := ItemCode;
                            SalesLine.Validate("No.");
                            SalesLine."Line No." := LineNo;
                            Evaluate(SalesLine."Return Qty. Received", quantity);
                            SalesLine.Validate("Order Quantity");
                            SalesLine."Unit of Measure Code" := unit_of_measure;
                            SalesLine."Return Reason Code" := return_reason;
                            SalesLine.Insert();
                        end;
                    end;
                end;
            end else
                Message('GET request failed. Status Code: %1', StatusCode);
        end;
    end;

    procedure GetExecuteQuantities(SalesHeader: Record "Sales Header")
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        Noseries: Codeunit "No. Series";
        NoSeriesBatch: Codeunit "No. Series - Batch";
        SalesLines: Record "Sales Line";
        responseText: Text;
        HttpClient: HttpClient;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";
        StatusCode, i, j : Integer;
        PurchOrderText, TransferOrderNo, transfer_from_code, transfer_to_code, LineNo1, issuer, receiver : Text;
        shipment_date, status : Text;
        LineNo: Integer;
        CompanyInfo: Record "Company Information";
        TransferLinesTxt, sales_order_no, sales_line_no, quantity_shipped, quantity_remaining, net_weight, item_code, UserID, vendor_no, settlement_weight, LinesText, quantity, batchquantity, batch_no, ItemCode, product_specifications, unit_of_measure, slapmark, is_imported, user_id, manual_weight, classification_code, meat_percent, vendor_name, time_stamp : Text;
    begin
        CompanyInfo.get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Fetch Execute Quantities");
        BaseUrl2 := FCLIntSetup."Fetch Execute Quantities";
        Clear(UserID);
        UserID := 'AGILEBIZPAIVY.ESHIRERA';
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(LinesText, i);
                    // Message(Format(i));
                    ObjectMgt.InitializeObject(LinesText);
                    ObjectMgt.GetStringPropertyValueByName('sales_order_no', sales_order_no);
                    ObjectMgt.GetStringPropertyValueByName('sales_line_no', sales_line_no);
                    ObjectMgt.GetStringPropertyValueByName('item_code', item_code);
                    ObjectMgt.GetStringPropertyValueByName('quantity', quantity);
                    ObjectMgt.GetStringPropertyValueByName('quantity_shipped', quantity_shipped);
                    ObjectMgt.GetStringPropertyValueByName('quantity_remaining', quantity_remaining);

                    LineNo += 100;
                    SalesLines.Reset();
                    SalesLines.SetRange("Document No.", SalesHeader."No.");
                    SalesLines.SetRange("Document Type", SalesLines."Document Type"::Order);
                    if SalesLines.FindFirst() then begin
                        SalesLines.Init();
                        SalesLines.Status := SalesHeader.Status::Execute;
                        SalesLines."Document Type" := SalesHeader."Document Type"::Order;
                        SalesLines.Type := SalesLines.Type::Item;
                        SalesLines."Document No." := sales_order_no;
                        SalesLines."Line No." := LineNo;
                        SalesLines."No." := item_code;
                        Evaluate(SalesLines.Quantity, quantity);
                        SalesLines.Validate(Quantity);
                        Evaluate(SalesLines."Quantity Shipped", quantity_shipped);
                        SalesLines.Validate("Quantity Shipped");
                        Evaluate(SalesLines."Outstanding Quantity", quantity_remaining);
                        SalesLines.Validate("Outstanding Quantity");
                        SalesLines.Insert();
                    end


                end;
            end;
        end else
            Message('GET request failed. Status Code: %1', StatusCode);
    end;

    procedure PostOrdersFromPortalStatus(SalesOrder: Record "Sales Header")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        SalesOrderRec: Record "Sales Header";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        WMSIntMgt: Codeunit WMSIntegrationsFinal;


    begin
        Company.Get();
        Clear(JsonObjectWMS);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Change Status Orders From Portal");
        BaseUrl12 := FCLIntSetup."Change Status Orders From Portal";
        SalesOrderRec.Reset();
        SalesOrderRec.SetRange("Document Type", SalesOrderRec."Document Type"::Order);
        SalesOrderRec.SetRange("Sales Order Portal", true);
        SalesOrderRec.SetRange("PDA Order", true);
        SalesOrderRec.SetRange("No.", SalesOrder."No.");
        if SalesOrderRec.FindFirst() then begin
            // Clear(UserID);
            UserID := WMSIntMgt.ExtractAfterBackslash(UserID);
            // UserID := 'AGILEBIZPAIVY.ESHIRERA';
            // Message(UserID);
            Clear(JArray);
            JsonObject.Add('order_no', SalesOrderRec."No.");
            JsonObject.Add('status', SalesOrderRec.Status::Execute);
        end;
        JArray.Add(JsonObject);
        // Message(Format(MainObject));
        // exit;
        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', NewResponse) then begin
                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', NewResponse) then begin
                    Message(NewResponse, responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;


    procedure GetNextLineNo(DocNo: Code[10]): Integer
    var
        ProdOrderLines: Record "Prod. Order Line";
    begin
        ProdOrderLines.RESET;
        ProdOrderLines.SETRANGE("Prod. Order No.", DocNo);
        IF ProdOrderLines.FINDLAST THEN
            EXIT(ProdOrderLines."Line No." + 1)
        ELSE
            EXIT(1);
    end;

    procedure resolveProductionOrderNo(ProductionOrderNo: Text): Text

    var
        ProdOrderRec: Record "Production Order";
    begin
        ProdOrderRec.SetRange("Description 2", ProductionOrderNo);

        if ProdOrderRec.FindFirst() then
            exit(ProdOrderRec."No.")
        else
            Error('Production Order %1 not found.', ProductionOrderNo);

    end;

    procedure PostPrintInvoice(var SalesInvoiceOrder: Record "Sales Invoice Header"; PreassignedNo: Code[20])
    var
        JsonObject, JsonObjectWMS, MainObject, JsonObject1, SuccessResponse : JsonObject;
        InvSuperUserSetup: Record "User Setup";
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Invoice Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        SalesInvoiceRec: Record "Sales Invoice Header";
        LineNo: Integer;
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        invoice_no: Text;
        ContrUnitUsers: Record "Control Unit Users";
        // PreassignedNo: Code[250];
        verificationURL: Text;
        custRec: Record "Customer";
        RouteCode: Record "District Group Code";
        mpesa_code: Text;
        companyInfo: Record "Company Information";
        vatAmount: Decimal;
        AmountExVat: Decimal;
        AmountIncVat: Decimal;
    begin
        if SalesInvoiceOrder."No. Printed" > 0 then begin
            if not InvSuperUserSetup.Get(UserId) then
                Error('Only users marked as Invoicing Supervisor in User Setup can reprint posted invoices.');
            if not InvSuperUserSetup."Invoicing Supervisor" then
                Error('Only users marked as Invoicing Supervisor in User Setup can reprint posted invoices.');
        end;

        Company.Get();
        companyInfo.FindFirst();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Invoice(Post)");
        ContrUnitUsers.Reset();
        ContrUnitUsers.SetRange(UserID, UserId);
        if ContrUnitUsers.FindFirst() then begin
            BaseUrl12 := ContrUnitUsers."Printer IP Address" + '/print-invoice';
            // Message(BaseUrl12);
        end else begin
            Error('Kindly Check the IP Address on Control Unit Setup');
        end;
        salesPerson_Purchaser.Reset();
        salesPerson_Purchaser.SetRange(Code, SalesInvoiceOrder."Salesperson Code");
        if salesPerson_Purchaser.FindFirst() then begin
            SalesName := salesPerson_Purchaser.Name;
        end;
        if salesPerson_Purchaser."Current Route" <> '' then begin
            if (RouteCode.Get(salesPerson_Purchaser."Current Route")) then begin
                mpesa_code := RouteCode."Pay Bill";
            end;
        end;
        // Message(SalesInvoiceOrder."Sell-to Customer No.");
        custRec.Reset();
        custRec.Get(SalesInvoiceOrder."Sell-to Customer No.");

        // SalesInvoiceRec.Reset();
        // SalesInvoiceRec.SetRange("No.", PreassignedNo);
        // if SalesInvoiceRec.FindFirst() then begin
        SalesInvoiceOrder."No. Printed" := SalesInvoiceOrder."No. Printed" + 1;
        Clear(JArray);
        MainObject.Add('invoice_no', SalesInvoiceOrder."No.");
        MainObject.Add('lpo_no', SalesInvoiceOrder."External Document No.");
        MainObject.Add('customer_name', SalesInvoiceOrder."Sell-to Customer Name");
        MainObject.Add('customer_pin', SalesInvoiceOrder.pinOfBuyer);
        MainObject.Add('customer_no', SalesInvoiceOrder."Sell-to Customer No.");
        MainObject.Add('mpesa_code', mpesa_code);
        MainObject.Add('order_no', SalesInvoiceOrder."Quote No.");
        MainObject.Add('posting_date', SalesInvoiceOrder."Posting Date");
        MainObject.Add('payment_terms', SalesInvoiceOrder."Payment Terms Code");
        MainObject.Add('external_doc_no', SalesInvoiceOrder."External Document No.");
        MainObject.Add('email', companyInfo."E-Mail");
        MainObject.Add('home_page', companyInfo."Home Page");
        MainObject.Add('vat_reg_no', companyInfo."VAT Registration No.");
        MainObject.Add('sales_person_code', SalesInvoiceOrder."Salesperson Code");
        MainObject.Add('sales_person_name', SalesName);
        MainObject.Add('ship_to', SalesInvoiceOrder."Ship-to Name");
        MainObject.Add('shipment_method', SalesInvoiceOrder."Shipment Method Code");
        MainObject.Add('company_pin', Company.PIN);
        MainObject.Add('no_printed', SalesInvoiceOrder."No. Printed");
        // end;

        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesInvoiceOrder."No.");
        // SalesLines.SetRange("Document Type", SalesLines."Document Type"::Invoice);
        // SalesLines.SETRANGE(Type, SalesLines.Type::Item);
        AmountExVat := 0;
        AmountIncVat := 0;
        vatAmount := 0;
        if SalesLines.Find('-') then begin
            repeat
                Clear(JsonObject);
                JsonObject.Add('item_no', Format(SalesLines."No."));
                JsonObject.Add('item_description', Format(SalesLines.Description));
                JsonObject.Add('units', SalesLines."Units per Parcel");
                JsonObject.Add('qty', SalesLines.Quantity);
                JsonObject.Add('uom', SalesLines."Unit of Measure Code");
                JsonObject.Add('vat_id', SalesLines."VAT Identifier");
                JsonObject.Add('amount', SalesLines.Amount);
                JsonObject.Add('crates', 0); // Already a string
                JArray.Add(JsonObject);
                AmountExVat += SalesLines.Amount;
                AmountIncVat += SalesLines."Amount Including VAT";
                vatAmount += (SalesLines."Amount Including VAT" - SalesLines.Amount);
            until SalesLines.Next() = 0;
        end;

        MainObject.Add('lines', JArray);
        MainObject.Add('total_ex_vat', Format(AmountExVat));
        MainObject.Add('vat', Format((vatAmount)));
        MainObject.Add('total_inc_vat', Format(AmountIncVat));

        Clear(JsonObject1);

        // Message(Format(MainObject));

        //use the helper function to build the verification URL
        //get this from Device Logs after posting the invoice


        // verificationURL := ExtractVerificationUrl(responseText);


        // verificationURL := 'https://itax.kra.go.ke/KRA-Portal/invoiceChk.htm?actionCode=loadPage&invoiceNo=';
        verificationURL := ExtractVerificationUrl(getJsonResponseFromDeviceLogs(SalesInvoiceOrder."No."));
        JsonObject1.Add('qr_url', verificationURL + SalesInvoiceOrder.CUInvoiceNo);
        JsonObject1.Add('cu_invoice_no', SalesInvoiceOrder.CUInvoiceNo);
        JsonObject1.Add('cu_serial_no', SalesInvoiceOrder.CUNo);
        JsonObject1.Add('signed_at', SalesInvoiceOrder.SignTime);

        // JArray2.Add(JsonObject1);
        MainObject.Add('kra_invoice', JsonObject1);


        // Message(Format(MainObject));
        // exit;



        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin


            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
        // SalesInvoiceOrder."No. Printed" += 1;
        LogPrint(
              Database::"Sales Invoice Header",
              'Sales Invoice',
              SalesInvoiceOrder."No.",
              SalesInvoiceOrder."No. Printed",
              ContrUnitUsers."Printer IP Address",
              'Printed via Print API');

        SalesInvoiceOrder.Modify(true);
        PostInvoiceToPortal(SalesInvoiceOrder);
    end;

    procedure LogPrint(
        TableID: Integer;
        DocumentType: Text;
        DocumentNo: Code[50];
        CopyNo: Integer;
        PrinterIP: Text;
        AdditionalInfo: Text)
    var
        PrintLog: Record "Document Print Log";
        UserRec: Record User;
    begin
        PrintLog.Init();

        PrintLog."Table ID" := TableID;
        PrintLog."Document Type" := DocumentType;
        PrintLog."Document No." := DocumentNo;
        PrintLog."User ID" := UserId;

        if UserRec.Get(UserSecurityId()) then
            PrintLog."User Name" := UserRec."Full Name";
        // message('here');
        PrintLog."Date" := Today();
        PrintLog."Time" := Time();
        PrintLog."Copy No." := CopyNo;
        PrintLog."Printer IP" := PrinterIP;
        PrintLog."Additional Info" := AdditionalInfo;

        PrintLog.Insert(true);
    end;

    procedure PostDeliveryNote(var SalesInvoiceHeader: Record "Sales Invoice Header"; PreassignedNo: Code[20])
    var
        JsonObject, JsonObjectWMS, MainObject, JsonObject1, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        JArray, JArray2 : JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        ContentHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Invoice Line";
        salesPerson_Purchaser: Record "Salesperson/Purchaser";
        SalesName: Text;
        Messages: Text;
        SalesOrderSubform: Page "Sales Order Subform";
        BarCode: Text;
        PackingLists, PLS : Record "Packing Lists";
        PartNo: Code[10];
        Items: Record Item;
        SalesInvoiceRec: Record "Sales Invoice Header";
        LineNo: Integer;
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        invoice_no: Text;
        ContrUnitUsers: Record "Control Unit Users";
        Amouttext: Text[50];

    begin
        Company.Get();
        Clear(SalesName);
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Invoice(Post)");
        ContrUnitUsers.Reset();
        ContrUnitUsers.SetRange(UserID, UserId);
        if ContrUnitUsers.FindFirst() then begin
            BaseUrl12 := ContrUnitUsers."Printer IP Address" + '/print-delivery';
            // Message(BaseUrl12);
        end else begin
            Error('Kindly Check the IP Address on Control Unit Setup');
        end;
        salesPerson_Purchaser.Reset();
        salesPerson_Purchaser.SetRange(Code, SalesInvoiceHeader."Salesperson Code");
        if salesPerson_Purchaser.FindFirst() then begin
            SalesName := salesPerson_Purchaser.Name;
        end;


        Clear(JArray);
        MainObject.Add('lpo_no', SalesInvoiceHeader."Quote No.");
        MainObject.Add('sell_to_customer_no', SalesInvoiceHeader."Sell-to Customer No.");
        MainObject.Add('customer_name', SalesInvoiceHeader."Sell-to Customer Name");
        MainObject.Add('document_date', SalesInvoiceHeader."Document Date");
        MainObject.Add('document_no', SalesInvoiceHeader."No.");
        MainObject.Add('shipment_date', SalesInvoiceHeader."Shipment Date");
        MainObject.Add('order_no', SalesInvoiceHeader."Quote No.");
        MainObject.Add('posting_date', SalesInvoiceHeader."Posting Date");
        MainObject.Add('payment_terms', SalesInvoiceHeader."Payment Terms Code");
        MainObject.Add('external_doc_no', SalesInvoiceHeader."External Document No.");
        MainObject.Add('phone_no', SalesInvoiceHeader."Sell-to Phone No.");
        MainObject.Add('email', SalesInvoiceHeader."Sell-to E-Mail");
        MainObject.Add('home_page', Company."Home Page");
        MainObject.Add('vat_reg_no', Company."VAT Registration No.");
        MainObject.Add('sales_person_code', SalesInvoiceHeader."Salesperson Code");
        MainObject.Add('sales_person_name', SalesName);
        MainObject.Add('invoice_ref_no', SalesInvoiceHeader."No.");
        MainObject.Add('ship_to', SalesInvoiceHeader."Ship-to Name");
        MainObject.Add('shipment_method', SalesInvoiceHeader."Shipment Method Code");
        MainObject.Add('company_pin', Company.PIN);


        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesInvoiceHeader."No.");
        // SalesLines.SETRANGE(Type, SalesLines.Type::Item);
        // SalesLines.SetRange("Document Type", SalesLines."Document Type"::Invoice);
        if SalesLines.Find('-') then begin
            repeat
                Clear(JsonObject);
                JsonObject.Add('item_no', SalesLines."No.");
                JsonObject.Add('item_description', SalesLines.Description);
                JsonObject.Add('ordered_qty', SalesLines."Order Quantity");
                JsonObject.Add('executed_qty', SalesLines.Quantity);
                JsonObject.Add('sales_qty', SalesLines."Quantity (Base)");
                JsonObject.Add('sales_unit', SalesLines."Unit of Measure Code");
                JsonObject.Add('order_unit', SalesLines."Unit of Measure Code");
                JArray.Add(JsonObject);
            until SalesLines.Next() = 0;
        end;
        MainObject.Add('lines', JArray);
        // Message(Format(MainObject));
        // exit;

        MainObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                LogPrint(
                Database::"Sales Invoice Header",
                'Delivery Note',
                SalesInvoiceHeader."No.",
                SalesInvoiceHeader."No. Printed",
                BaseUrl12,
                'Printed via Print API');
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);

                end;
            end else begin
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);
                end;
                JSONManagement.GetStringPropertyValueByName('error', responseText);
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    // procedure PostPrintCheques(PaymentJnl: Record "Gen. Journal Line"; longDescription: Text)
    // var
    //     JsonObject: JsonObject;
    //     FCLIntSetup: Record "FCL Integration Setup";
    //     HttpClient: HttpClient;
    //     HttpResponse: HttpResponseMessage;
    //     BaseUrl12, responseText, Body : Text;
    //     HttpRequest: HttpRequestMessage;
    //     HttpContent: HttpContent;
    //     Company: Record "Company Information";
    //     ContentHeaders: HttpHeaders;
    //     NetAmt: Decimal;
    //     PaymentMgt: Codeunit "Payments Management";
    //     NumberText: array[2] of Text[80];
    //     CurrencyCodeText: Code[10];
    //     JnlLine: Record "Gen. Journal Line";
    // begin
    //     Company.Get();
    //     FCLIntSetup.Get();
    //     FCLIntSetup.TestField("Print Cheque");

    //     BaseUrl12 := FCLIntSetup."Print Cheque";

    //     // 🔹 Sum all related journal lines
    //     NetAmt := 0;
    //     JnlLine.Reset();
    //     JnlLine.SetRange("Journal Template Name", PaymentJnl."Journal Template Name");
    //     JnlLine.SetRange("Journal Batch Name", PaymentJnl."Journal Batch Name");
    //     // JnlLine.SetRange("Document No.", PaymentJnl."Document No.");

    //     if JnlLine.FindSet() then
    //         repeat
    //             NetAmt += JnlLine.Amount;
    //         until JnlLine.Next() = 0;

    //     // 🔹 Convert amount to words
    //     PaymentMgt.InitTextVariable;
    //     PaymentMgt.FormatNoText(NumberText, NetAmt, CurrencyCodeText);

    //     // 🔹 Build JSON
    //     JsonObject.Add('file', 'cheque');
    //     JsonObject.Add('date', PaymentJnl."Posting Date");
    //     JsonObject.Add('payTo', longDescription);
    //     JsonObject.Add('amount', NetAmt);
    //     JsonObject.Add('amountInWords', NumberText[1]);

    //     JsonObject.WriteTo(Body);

    //     HttpContent.WriteFrom(Body);
    //     HttpContent.GetHeaders(ContentHeaders);
    //     ContentHeaders.Remove('Content-Type');
    //     ContentHeaders.Add('Content-Type', 'application/json');
    //     ContentHeaders.Add('Return-Type', 'application/json');

    //     HttpRequest.SetRequestUri(BaseUrl12);
    //     HttpRequest.Method('POST');
    //     HttpRequest.Content(HttpContent);

    //     if HttpClient.Send(HttpRequest, HttpResponse) then begin
    //         HttpResponse.Content().ReadAs(responseText);
    //         if not HttpResponse.IsSuccessStatusCode then
    //             Message('Request failed!: %1', responseText);
    //     end;
    // end;


    // procedure PostPrintCheques(PaymentJnl: Record "Gen. Journal Line"; longDescription: Text)
    // var
    //     JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
    //     FCLIntSetup: Record "FCL Integration Setup";
    //     HttpClient: HttpClient;
    //     HttpResponse: HttpResponseMessage;
    //     BaseUrl12, JsonData, responseText, ReceiptLines : Text;
    //     FCLReceiptLinesRec: Record "FP Receipt Lines";
    //     JArray: JsonArray;
    //     HttpRequest: HttpRequestMessage;
    //     HttpContent: HttpContent;
    //     JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
    //     UserID, NewResponse, ErrorText, Body : Text;
    //     XMLDoc: XmlDocument;
    //     XMLNode: XmlNode;
    //     Company: Record "Company Information";
    //     ContentHeaders: HttpHeaders;
    //     NetAmt: Decimal;
    //     PaymentMgt: Codeunit "Payments Management";
    //     NumberText: array[2] of Text[80];
    //     CurrencyCodeText: Code[10];


    // begin
    //     Company.Get();
    //     FCLIntSetup.Get();
    //     FCLIntSetup.TestField("Print Cheque");
    //     BaseUrl12 := FCLIntSetup."Print Cheque";
    //     NetAmt := SumJnlLinesAmount(PaymentJnl);
    //     PaymentMgt.InitTextVariable;
    //     PaymentMgt.FormatNoText(NumberText, NetAmt, CurrencyCodeText);
    //     JsonObject.Add('file', 'cheque');
    //     JsonObject.Add('date', PaymentJnl."Posting Date");
    //     JsonObject.Add('payTo', longDescription);
    //     JsonObject.Add('amount', NetAmt);
    //     JsonObject.Add('amountInWords', NumberText[1]);
    //     // Message(Format(JsonObject));

    //     JsonObject.WriteTo(Body);
    //     HttpContent.WriteFrom(Body);
    //     HttpContent.GetHeaders(ContentHeaders);
    //     ContentHeaders.Remove('Content-Type');
    //     ContentHeaders.Add('Content-Type', 'application/json');
    //     ContentHeaders.Add('Return-Type', 'application/json');
    //     HttpContent.GetHeaders(ContentHeaders);

    //     HttpRequest.SetRequestUri(BaseUrl12);
    //     HttpRequest.Method('POST');
    //     HttpRequest.Content(HttpContent);
    //     if HttpClient.Send(HttpRequest, HttpResponse) then begin
    //         HttpResponse.Content().ReadAs(responseText);
    //         if HttpResponse.IsSuccessStatusCode then begin
    //         end else begin
    //             Message('Request failed!: %1', responseText);
    //         end;
    //     end;
    // end;

    procedure PostPrintCheques(PaymentJnl: Record "Gen. Journal Line"; longDescription: Text)
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        GLSetupPreview: Record "General Ledger Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        UserID, NewResponse, ErrorText, Body, LineBreakdown : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;
        NetAmt: Decimal;
        PaymentMgt: Codeunit "Payments Management";
        NumberText: array[2] of Text[80];
        CurrencyCodeText: Code[10];


    begin
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Cheque");
        BaseUrl12 := FCLIntSetup."Print Cheque";
        //sum the amount across all lines for this payment journal
        NetAmt := 0;
        PaymentJnl.Reset();
        PaymentJnl.SetRange("Journal Template Name", PaymentJnl."Journal Template Name");
        PaymentJnl.SetRange("Journal Batch Name", PaymentJnl."Journal Batch Name");
        if PaymentJnl.FindSet() then
            repeat
                NetAmt += PaymentJnl.Amount;
            until PaymentJnl.Next() = 0;



        // Message(Format(PaymentJnl.Count));



        NetAmt := SumJnlLinesAmountWithBreakdown(PaymentJnl, LineBreakdown);
        PaymentMgt.InitTextVariable;
        PaymentMgt.FormatNoText(NumberText, NetAmt, CurrencyCodeText);
        JsonObject.Add('file', 'cheque');
        JsonObject.Add('date', PaymentJnl."Posting Date");
        JsonObject.Add('payTo', longDescription);
        JsonObject.Add('amount', NetAmt);
        JsonObject.Add('amountInWords', NumberText[1]);

        // If GL Setup flag is on: show the payload + line breakdown and ask for confirmation
        GLSetupPreview.Get();
        if GLSetupPreview."Show Cheque Payload Preview" then begin
            if not Confirm('=== LINE BREAKDOWN ===\%1\=== PAYLOAD TO SEND ===\%2\Send to the cheque API?',
                           true, LineBreakdown, Format(JsonObject)) then
                exit;
        end;

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                LogPrint(
               Database::"Gen. Journal Line",
               'Cheque',
               PaymentJnl."Document No.",
               1,
               BaseUrl12,
               'Printed via Print API');
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;



    procedure SumJnlLinesAmount(JnlLine: Record "Gen. Journal Line"): Decimal
    var
        TotalAmount: Decimal;
        LineBreakdown: Text;
    begin
        exit(SumJnlLinesAmountWithBreakdown(JnlLine, LineBreakdown));
    end;

    procedure SumJnlLinesAmountWithBreakdown(JnlLine: Record "Gen. Journal Line"; var LineBreakdown: Text): Decimal
    var
        TotalAmount: Decimal;
        LineCount: Integer;
        TemplateName: Code[10];
        BatchName: Code[10];
        DocumentNo: Code[20];
        LastLineNo: Integer;
    begin
        // Capture key values before Reset() clears filters
        TemplateName := JnlLine."Journal Template Name";
        BatchName := JnlLine."Journal Batch Name";
        DocumentNo := JnlLine."Document No.";

        TotalAmount := 0;
        LineCount := 0;
        LineBreakdown := '';

        // First pass: find the maximum line number
        JnlLine.Reset();
        JnlLine.SetRange("Journal Template Name", TemplateName);
        JnlLine.SetRange("Journal Batch Name", BatchName);
        // JnlLine.SetFilter(Amount, '>0');
        JnlLine.SetCurrentKey("Line No.");
        JnlLine.SetAscending("Line No.", false);

        LastLineNo := 0;
        if JnlLine.FindFirst() then
            LastLineNo := JnlLine."Line No.";

        // Second pass: sum all lines except the last
        JnlLine.Reset();
        JnlLine.SetRange("Journal Template Name", TemplateName);
        JnlLine.SetRange("Journal Batch Name", BatchName);
        // JnlLine.SetFilter(Amount, '>0');
        JnlLine.SetFilter("Line No.", '<>%1', LastLineNo);   // Exclude the last line
        if JnlLine.FindSet() then
            repeat
                TotalAmount += JnlLine.Amount;
                LineCount += 1;
                LineBreakdown += StrSubstNo('  Line %1: %2 — %3\',
                    JnlLine."Line No.", JnlLine.Description,
                    Format(JnlLine.Amount, 0, '<Sign><Integer Thousand><Decimals,2>'));
            until JnlLine.Next() = 0;

        LineBreakdown := StrSubstNo('Document: %1  |  Lines summed: %2  |  Total: %3\%4',
            DocumentNo, LineCount, Format(TotalAmount, 0, '<Sign><Integer Thousand><Decimals,2>'), LineBreakdown);
        exit(TotalAmount);
    end;

    procedure PostPrintReceiptCashOffice(PaymentJnl: Record "Gen. Journal Line")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        CurrUserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;
        GLEntry: Record "G/L Entry";
        Desc: Text[250];
        WMSItegrations: Codeunit "WMSIntegrationsFinal";

    begin
        CurrUserID := WMSItegrations.ExtractAfterBackslash(UserID);
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Receipt(Cash-Office)");
        BaseUrl12 := FCLIntSetup."Print Receipt(Cash-Office)";

        JsonObject.Add('file', 'receipt');
        JsonObject.Add('receivedFrom', PaymentJnl.Description);
        JsonObject.Add('amount', PaymentJnl.Amount);
        JsonObject.Add('paymentFor', PaymentJnl.Description);
        JsonObject.Add('servedBy', CurrUserID);
        // Message(Format(JsonObject));

        JsonObject.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
            end else begin
                Message('Request failed!: %1', responseText);
            end;
        end;
    end;



    LOCAL PROCEDURE ConvertNumberToWords(Number: Decimal): Text[250];
    VAR
        Ones: ARRAY[9] OF Text[250];
        Tens: ARRAY[10] OF Text[250];
        Hundreds: ARRAY[9] OF Text[250];
        Words: Text;
    BEGIN
        Ones[1] := 'One';
        Ones[2] := 'Two';
        Ones[3] := 'Three';
        Ones[4] := 'Four';
        Ones[5] := 'Five';
        Ones[6] := 'Six';
        Ones[7] := 'Seven';
        Ones[8] := 'Eight';
        Ones[9] := 'Nine';

        Tens[1] := 'Ten';
        Tens[2] := 'Twenty';
        Tens[3] := 'Thirty';
        Tens[4] := 'Forty';
        Tens[5] := 'Fifty';
        Tens[6] := 'Sixty';
        Tens[7] := 'Seventy';
        Tens[8] := 'Eighty';
        Tens[9] := 'Ninety';
        Tens[10] := 'Hundred';

        // hundreds array
        Hundreds[1] := 'One Hundred';
        Hundreds[2] := 'Two Hundred';
        Hundreds[3] := 'Three Hundred';
        Hundreds[4] := 'Four Hundred';
        Hundreds[5] := 'Five Hundred';
        Hundreds[6] := 'Six Hundred';
        Hundreds[7] := 'Seven Hundred';
        Hundreds[8] := 'Eight Hundred';
        Hundreds[9] := 'Nine Hundred';



        Words := '';

        IF Number = 0 THEN
            EXIT('Zero Only');

        // Convert hundreds place
        IF Number DIV 100 > 0 THEN BEGIN
            Words += Hundreds[Number DIV 100] + ' ';
            Number := Number MOD 100;
        END;

        // Convert tens place
        IF Number >= 20 THEN BEGIN
            Words += Tens[Number DIV 10] + ' ';
            Number := Number MOD 10;
        END;

        // Convert ones place
        IF Number > 0 THEN
            Words += Ones[Number] + ' ';

        EXIT(Words + 'Only');
    END;




    procedure PostPrintReceiptExport(ReceiptHeader: Record "Receipt Header")
    var
        JsonObject, JsonObjectWMS, MainObject, SuccessResponse : JsonObject;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        BaseUrl12, JsonData, responseText, ReceiptLines : Text;
        FCLReceiptLinesRec: Record "FP Receipt Lines";
        JArray: JsonArray;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        Amounttext: Text[50];
        // JSONManagement, ObjectJSONManagement : Codeunit "JSON Management";
        CurrUserID, NewResponse, ErrorText, Body : Text;
        XMLDoc: XmlDocument;
        XMLNode: XmlNode;
        Company: Record "Company Information";
        ContentHeaders: HttpHeaders;
        GLEntry: Record "G/L Entry";
        Desc: Text[250];
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        JArray2: JsonArray;
        FormattedTime: Text;
        AmountInWords: Text[250];
        Amount: Decimal;
        AmountInteger: Integer;
        AmountFraction: Integer;


        CurrentDateTime: DateTime;
        TimeValue: Time;
        Hour: Integer;
        Minute: Integer;
        AMPM: Text;

        Ones: Array[9] of Text[250];
        Tens: Array[10] of Text[250];
        Hundreds: Array[9] of Text[250];
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";

    begin

        CurrUserID := WMSItegrations.ExtractAfterBackslash(UserID);
        Company.Get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Print Receipt(Export)");
        BaseUrl12 := FCLIntSetup."Print Receipt(Export)";

        ReceiptHeader.CalcFields("Total Amount");

        // Initialize JSON object
        JsonObject.Add('receipt_no', ReceiptHeader."No.");

        // Format date as "YYYY/MM/DD"
        // Format date as "YYYY/MM/DD"
        JsonObject.Add('date', Format(ReceiptHeader."Posting Date", 0, '<Year4>/<Month,2>/<Day,2>'));

        // Format time as "hh:mm AM/PM" using built-in AL functions
        CurrentDateTime := CURRENTDATETIME;

        // FormattedTime := Format(Hour) + ':' + Format(Minute, 2) + ' ' + AMPM;
        JsonObject.Add('time', format(CurrentDateTime));


        JsonObject.Add('received_from', ReceiptHeader."Received From");

        // Format amount to 2 decimal places with commas
        AmountText := StrSubstNo('%1 %2', '', Format(ReceiptHeader."Total Amount", 0, '<Precision,2:2><Standard Format,0>'));
        JsonObject.Add('amount_in_words', Amounttext);
        JsonObject.Add('amount', FORMAT(ReceiptHeader."Total Amount"));

        JsonObject.Add('payment_for', ReceiptHeader.Description);
        JsonObject.Add('served_by', CurrUserID);

        // Add JSON object to array
        JArray2.Add(JsonObject);

        // Output for testing
        // Message(Format(JArray2));
        JArray2.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('Return-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);

        HttpRequest.SetRequestUri(BaseUrl12);
        // Message(BaseUrl12);

        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if HttpResponse.IsSuccessStatusCode then begin
                Message('Successfully sent request');
                JSONManagement.InitializeObject(responseText);
                if JSONManagement.GetArrayPropertyValueAsStringByName('success', responseText) then begin
                    // Message(responseText);
                end;
            end else begin

                Message('Request failed!: %1', responseText);
            end;
        end;
    end;

    procedure GetSalesInvoicesFromPortalImported()
    var
        FCLIntSetup: Record "FCL Integration Setup";
        BaseUrl2: Text;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        responseText: Text;
        ImportedSales: Record "Imported SalesAL";
        HttpClient: HttpClient;
        PurchInvoiceText, InvoiceNo, CustomerNo, CUInvoiceNo, CUNo, CUDateTime, shipment_date, sales_person_code, ship_to_code, ship_to_name, sales_person_name, default_location, unit_of_measure : Text;
        status, customer_specification, customer_code, Type, LinesText, unit_price, quantity, sales_line_no, line_amount_incl_vat, SalesInvoiceLinesTxt, ItemCode : Text;
        JSONManagement, ObjectJSONManagement, ArrayJSONManagement, LinesArrayMgt, JsonMgt, JsonManaget, ObjectMgt : Codeunit "JSON Management";
        StatusCode, i, j : Integer;
        PurchOrderText, TransferOrderNo, transfer_from_code, transfer_to_code, LineNo1, issuer, receiver : Text;
        ObjString, tmpString, FromDate, api_key, companys, FromCount, ToCount, recieved_date : Text;
        LineNo, Year, Month, Date : Integer;
        CompanyInfo: Record "Company Information";
        TransferLinesTxt, net_weight, item_no, cust_no, line_no, cust_spec, ext_doc_no, shp_date, company, uom_code, sp_code, UserID, item_spec, shp_code, vendor_no, settlement_weight, batchquantity, batch_no, product_specifications, slapmark, is_imported, user_id, manual_weight, classification_code, meat_percent, vendor_name : Text;
    begin
        Clear(Year);
        Clear(Month);
        Clear(Date);
        CompanyInfo.get();
        FCLIntSetup.Get();
        FCLIntSetup.TestField("Sales Invoices From Portal");
        BaseUrl2 := FCLIntSetup."Sales Invoices From Portal";
        // Clear(UserID);
        // UserID := 'AGILEBIZPAIVY.ESHIRERA';
        // api_key := '412cce7c-a737-4d01-b929-534fcc80e79d';
        // Companys := CompanyInfo.Name;
        // Year := Date2DMY(Today, 3);
        // Month := Date2DMY(Today, 2);
        // Date := Date2DMY(Today, 1);
        // recieved_date := Format(Year) + Format(Month) + Format(Date);
        // FromCount := FCLIntSetup."From Count";
        // ToCount := FCLIntSetup."To Count";
        // ObjString := api_key + Companys + recieved_date + FromCount + ToCount;
        // HttpContent.WriteFrom(ObjString);
        // HttpContent.ReadAs(tmpString);
        if HttpClient.Get(BaseUrl2, HttpResponse) then begin
            StatusCode := HttpResponse.HttpStatusCode();
            if HttpResponse.IsSuccessStatusCode() then begin
                HttpResponse.Content().ReadAs(responseText);
                Message(responseText);
                ArrayJSONManagement.InitializeCollection(responseText);
                for i := 0 to ArrayJSONManagement.GetCollectionCount() - 1 do begin
                    ArrayJSONManagement.GetObjectFromCollectionByIndex(LinesText, i);
                    // Message(Format(i));
                    ObjectMgt.InitializeObject(LinesText);
                    ObjectMgt.GetStringPropertyValueByName('InvoiceNo', InvoiceNo);
                    ObjectMgt.GetStringPropertyValueByName('CUInvoiceNo', CUInvoiceNo);
                    ObjectMgt.GetStringPropertyValueByName('CUDateTime', CUDateTime);
                    ObjectMgt.GetStringPropertyValueByName('CUNo', CUNo);
                    ObjectMgt.GetStringPropertyValueByName('customer_code', CustomerNo);
                    ObjectMgt.GetStringPropertyValueByName('shipment_date', shipment_date);
                    ObjectMgt.GetStringPropertyValueByName('sales_person_code', sales_person_code);
                    ObjectMgt.GetStringPropertyValueByName('default_location', default_location);
                    ObjectMgt.GetStringPropertyValueByName('ship_to_code', ship_to_code);
                    ObjectMgt.GetStringPropertyValueByName('ship_to_name', ship_to_name);

                    LineNo += 100;
                    ImportedSales.Init();
                    ImportedSales.LineNo := LineNo;
                    ImportedSales.No := InvoiceNo;
                    ImportedSales.CUInvoiceNo := CUInvoiceNo;
                    Evaluate(ImportedSales.Date, shp_date);
                    ImportedSales.Validate(Date);
                    ImportedSales.CustNO := CUNo;
                    ImportedSales.CustNO := customer_code;
                    Evaluate(ImportedSales.Date, shp_date);
                    ImportedSales.Validate(Date);
                    ImportedSales.SPCode := sales_person_code;
                    ImportedSales.Location := default_location;
                    ImportedSales.ShiptoCOde := ship_to_code;
                    ImportedSales.ShiptoName := ship_to_name;
                    ImportedSales.Insert(true);
                end;
            end;
        end else
            Message('GET request failed. Status Code: %1', StatusCode);
    end;


    procedure ReSignInvoice(SN: Record "Sales Invoice Header")
    var
        CreditMemo: Record "Sales Invoice Header";
        Client: HttpClient;
        Response: HttpResponseMessage;
        RequestObject: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        Request: HttpRequestMessage;
        Content: HttpContent;
        TextContent: Text;
        IntegrationSetup: Record "FCL Integration Setup";
        CUSetup: Record "Control Unit Setup";
        CUUsers: Record "Control Unit Users";
        BaseUrl: Text;


    begin

        //get the balance of the invoice from API
        /*
          get the device that was used to sign the invoice from the CUNo of the invoice
          Lookup the device in the CUSetup table
          User the device IP to get the transaction from the API
          use the transactions to create a credit memo request to the gadget
          //create a new request for the invoice with the new buyer PIN from the Sales Invoice Header


        */

        if CUSetup.Get(SN."CUNo") then begin
            BaseUrl := CUSetup."IP Address" + '/traactions/' + SN."CUInvoiceNo";
            //sample response
            /*
            
            {
messages: "Success",
items: [
{
name: "ValuePackBeefSausages1kg",
totalAmount: 665,
quantity: 1
},
{
name: "FCLCaponFrozen1.2-1.5kg-SR",
totalAmount: 1120,
quantity: 1,
hsCode: "0019.11.00"
}
]
}
            */

        end else begin
            Error('Control Unit Setup not found for the invoice %1', SN."No.");

        end;
    end;

    local procedure getJsonResponseFromDeviceLogs(DocNo: Code[20]): Text
    var
        DeviceLogs: Record "Device Signage Log";
    begin
        DeviceLogs.Reset();
        DeviceLogs.SetRange("Document No.", DocNo);
        if (DeviceLogs.FindLast()) then begin
            exit(DeviceLogs."Response");
        end;
        exit('');
    end;


    local procedure ExtractVerificationUrl(ResponseText: Text): Text[1000]
    var
        JObj: JsonObject;
        Token: JsonToken;
        EtimsObj: JsonObject;
        UrlTxt: Text;
    begin
        UrlTxt := '';

        if DelChr(ResponseText, '<>', ' ') = '' then
            exit('');

        // Parse JSON
        if not JObj.ReadFrom(ResponseText) then
            exit('');

        // 1) TIMS format: { ..., "verificationUrl": "https://itax.kra.go.ke/...." }
        if JObj.Get('verificationUrl', Token) then
            if Token.IsValue() then begin
                UrlTxt := Token.AsValue().AsText();
                exit(CopyStr(UrlTxt, 1, 1000));
            end;

        // 2) eTIMS format: { ..., "qrData": "https://etims.kra.go.ke/...." }
        if JObj.Get('qrData', Token) then
            if Token.IsValue() then begin
                UrlTxt := Token.AsValue().AsText();
                exit(CopyStr(UrlTxt, 1, 1000));
            end;

        // 3) Optional fallback: sometimes you might want to pull it from a nested object
        //    e.g. { "etimsResponse": { ... }, "qrData": "..." } (already handled above)
        //    but if your payload ever becomes { "etimsResponse": { "qrData": "..." } }:
        if JObj.Get('etimsResponse', Token) then
            if Token.IsObject() then begin
                EtimsObj := Token.AsObject();
                if EtimsObj.Get('qrData', Token) then
                    if Token.IsValue() then begin
                        UrlTxt := Token.AsValue().AsText();
                        exit(CopyStr(UrlTxt, 1, 1000));
                    end;
            end;

        exit('');
    end;



    //...End Etims

    procedure RegisterEtimsItem(var RegistrationCard: Record "eTIMS Registration Card")
    var
        FCLIntSetup: Record "FCL Integration Setup";
        Item: Record Item;
        FixedAsset: Record "Fixed Asset";
        JobsSetup: Record "Jobs Setup";
        RequestJson: JsonObject;
        RequestItems: JsonArray;
        RequestItemObject: JsonObject;
        HttpClient: HttpClient;
        HttpRequest: HttpRequestMessage;
        HttpResponse: HttpResponseMessage;
        RequestContent: HttpContent;
        ContentHeaders: HttpHeaders;
        RequestText: Text;
        ResponseText: Text;
        HttpCode: Integer;
        TargetNo: Code[20];
        RegisteredCount: Integer;
    begin
        FCLIntSetup.Get();
        FCLIntSetup.TestField("eTims Item Register URL");
        FCLIntSetup.TestField("eTims API Key");
        FCLIntSetup.TestField("eTims Business PIN");
        FCLIntSetup.TestField("eTims Branch ID");

        EtimsValidateRegistrationRequest(RegistrationCard);

        RequestJson.Add('businessPin', FCLIntSetup."eTims Business PIN");
        RequestJson.Add('branchId', FCLIntSetup."eTims Branch ID");

        case RegistrationCard."Registration Type" of
            RegistrationCard."Registration Type"::Item:
                begin
                    Item.Get(RegistrationCard."Item No.");
                    TargetNo := Item."No.";
                    EtimsBuildItemPayload(Item, RequestItems, RequestItemObject, RegisteredCount);
                end;
            RegistrationCard."Registration Type"::"Fixed Asset":
                begin
                    FixedAsset.Get(RegistrationCard."Fixed Asset No.");
                    TargetNo := FixedAsset."No.";
                    EtimsBuildFixedAssetPayload(FixedAsset, RequestItems, RequestItemObject, RegisteredCount);
                end;
            RegistrationCard."Registration Type"::"Job Setup":
                begin
                    if not JobsSetup.Get() then
                        Error('Jobs Setup is not configured.');
                    TargetNo := 'JOBSETUP';
                    EtimsBuildJobSetupPayload(RegistrationCard, JobsSetup, RequestItems, RequestItemObject, RegisteredCount);
                end;
        end;

        if RegisteredCount = 0 then
            Error('Nothing to register. Select at least one non-registered record.');

        RequestJson.Add('Items', RegisteredCount);
        RequestJson.Add('ItemsList', RequestItems);
        RequestJson.WriteTo(RequestText);

        RequestContent.WriteFrom(RequestText);
        RequestContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        HttpRequest.SetRequestUri(FCLIntSetup."eTims Item Register URL");
        HttpRequest.Method('POST');
        HttpRequest.Content(RequestContent);
        HttpRequest.GetHeaders(ContentHeaders);
        ContentHeaders.Add('X-API-Key', FCLIntSetup."eTims API Key");

        if not HttpClient.Send(HttpRequest, HttpResponse) then
            Error('Unable to connect to eTIMS registration service.');

        HttpCode := HttpResponse.HttpStatusCode();
        HttpResponse.Content.ReadAs(ResponseText);

        if HttpResponse.IsSuccessStatusCode() then begin
            EtimsAppendRegistrationResult(RegistrationCard, ResponseText, HttpCode, '');
            case RegistrationCard."Registration Type" of
                RegistrationCard."Registration Type"::Item:
                    begin
                        Item.Get(RegistrationCard."Item No.");
                        if Item."E-Tims Item Code" = '' then begin
                            Item.Validate("E-Tims Item Code", EtimsBuildCode(Item."No."));
                            Item.Modify(true);
                        end;
                    end;
                RegistrationCard."Registration Type"::"Fixed Asset":
                    begin
                        FixedAsset.Get(RegistrationCard."Fixed Asset No.");
                        if FixedAsset."E-Tims Item Code" = '' then begin
                            FixedAsset.Validate("E-Tims Item Code", EtimsBuildCode(FixedAsset."No."));
                            FixedAsset.Modify(true);
                        end;
                    end;
                RegistrationCard."Registration Type"::"Job Setup":
                    begin
                        if not JobsSetup.Get() then
                            Error('Jobs Setup is not configured.');
                        if RegistrationCard."Register Job Labour" and (JobsSetup."Labour eTIMS Item Code" = '') then
                            JobsSetup.Validate("Labour eTIMS Item Code", EtimsBuildCode('JOBLABOUR'));
                        if RegistrationCard."Register Job Materials" and (JobsSetup."Materials eTIMS Item Code" = '') then
                            JobsSetup.Validate("Materials eTIMS Item Code", EtimsBuildCode('JOBMAT'));
                        JobsSetup.Modify(true);
                    end;
            end;
            EtimsInsertLog(
                RegistrationCard."Registration Type",
                TargetNo,
                true,
                HttpCode,
                CopyStr(ResponseText, 1, 250),
                RequestText,
                ResponseText);
            LogPrint(
                Database::"eTIMS Registration Card",
                'eTIMS Registration',
                CopyStr(TargetNo, 1, 50),
                0,
                FCLIntSetup."eTims Item Register URL",
                'Registered via eTIMS API');
            Message('Registration completed successfully.');
        end else begin
            EtimsAppendRegistrationResult(RegistrationCard, ResponseText, HttpCode, CopyStr(ResponseText, 1, 250));
            EtimsInsertLog(
                RegistrationCard."Registration Type",
                TargetNo,
                false,
                HttpCode,
                CopyStr(ResponseText, 1, 250),
                RequestText,
                ResponseText);
            Error('eTIMS registration failed. Status: %1. Response: %2', HttpCode, ResponseText);
        end;
    end;

    procedure PreviewEtimsRequest(RegistrationCard: Record "eTIMS Registration Card"; var RequestUrl: Text; var RequestPayload: Text)
    var
        FCLIntSetup: Record "FCL Integration Setup";
        Item: Record Item;
        FixedAsset: Record "Fixed Asset";
        JobsSetup: Record "Jobs Setup";
        RequestJson: JsonObject;
        RequestItems: JsonArray;
        RequestItemObject: JsonObject;
        RegisteredCount: Integer;
    begin
        FCLIntSetup.Get();
        FCLIntSetup.TestField("eTims Item Register URL");
        FCLIntSetup.TestField("eTims Business PIN");
        FCLIntSetup.TestField("eTims Branch ID");

        RequestJson.Add('businessPin', FCLIntSetup."eTims Business PIN");
        RequestJson.Add('branchId', FCLIntSetup."eTims Branch ID");

        case RegistrationCard."Registration Type" of
            RegistrationCard."Registration Type"::Item:
                begin
                    RegistrationCard.TestField("Item No.");
                    Item.Get(RegistrationCard."Item No.");
                    EtimsBuildItemPayload(Item, RequestItems, RequestItemObject, RegisteredCount);
                end;
            RegistrationCard."Registration Type"::"Fixed Asset":
                begin
                    RegistrationCard.TestField("Fixed Asset No.");
                    FixedAsset.Get(RegistrationCard."Fixed Asset No.");
                    EtimsBuildFixedAssetPayload(FixedAsset, RequestItems, RequestItemObject, RegisteredCount);
                end;
            RegistrationCard."Registration Type"::"Job Setup":
                begin
                    if not JobsSetup.Get() then
                        Error('Jobs Setup is not configured.');
                    EtimsBuildJobSetupPayload(RegistrationCard, JobsSetup, RequestItems, RequestItemObject, RegisteredCount);
                end;
        end;

        RequestJson.Add('Items', RegisteredCount);
        RequestJson.Add('ItemsList', RequestItems);
        RequestJson.WriteTo(RequestPayload);
        RequestUrl := FCLIntSetup."eTims Item Register URL";
    end;

    local procedure EtimsValidateRegistrationRequest(RegistrationCard: Record "eTIMS Registration Card")
    var
        Item: Record Item;
        FixedAsset: Record "Fixed Asset";
        JobsSetup: Record "Jobs Setup";
    begin
        case RegistrationCard."Registration Type" of
            RegistrationCard."Registration Type"::Item:
                begin
                    RegistrationCard.TestField("Item No.");
                    Item.Get(RegistrationCard."Item No.");
                    if Item."E-Tims Item Code" <> '' then
                        Error('Item %1 is already registered with eTIMS Item Code %2.', Item."No.", Item."E-Tims Item Code");
                end;
            RegistrationCard."Registration Type"::"Fixed Asset":
                begin
                    RegistrationCard.TestField("Fixed Asset No.");
                    FixedAsset.Get(RegistrationCard."Fixed Asset No.");
                    if FixedAsset."E-Tims Item Code" <> '' then
                        Error('Fixed Asset %1 is already registered with eTIMS Item Code %2.', FixedAsset."No.", FixedAsset."E-Tims Item Code");
                end;
            RegistrationCard."Registration Type"::"Job Setup":
                begin
                    if not JobsSetup.Get() then
                        Error('Jobs Setup is not configured.');
                    if not (RegistrationCard."Register Job Labour" or RegistrationCard."Register Job Materials") then
                        Error('Select at least one of Register Job Labour or Register Job Materials.');
                    if RegistrationCard."Register Job Labour" and (JobsSetup."Labour eTIMS Item Code" <> '') then
                        Error('Job Setup Labour is already registered with eTIMS Item Code %1.', JobsSetup."Labour eTIMS Item Code");
                    if RegistrationCard."Register Job Materials" and (JobsSetup."Materials eTIMS Item Code" <> '') then
                        Error('Job Setup Materials are already registered with eTIMS Item Code %1.', JobsSetup."Materials eTIMS Item Code");
                end;
        end;
    end;

    local procedure EtimsBuildItemPayload(Item: Record Item; var RequestItems: JsonArray; var RequestItemObject: JsonObject; var RegisteredCount: Integer)
    begin
        Clear(RequestItemObject);
        RequestItemObject.Add('itemName', Item.Description);
        RequestItemObject.Add('ClassCode', Item."Item Class code");
        RequestItemObject.Add('itemCd', EtimsBuildCode(Item."No."));
        RequestItemObject.Add('ItemType', '1');
        RequestItemObject.Add('UnitOfQuantity', EtimsResolveCode(Item."Quantity Unit Code", 'U'));
        RequestItemObject.Add('PackagingUnit', EtimsResolveCode(Item."Packaging Unit code", 'NT'));
        RequestItemObject.Add('SellingPrice', Item."Unit Price");
        RequestItemObject.Add('TaxationType', 'A');
        RequestItemObject.Add('OpeningStock', 0);
        RequestItems.Add(RequestItemObject);
        RegisteredCount += 1;
    end;

    local procedure EtimsBuildFixedAssetPayload(FixedAsset: Record "Fixed Asset"; var RequestItems: JsonArray; var RequestItemObject: JsonObject; var RegisteredCount: Integer)
    begin
        Clear(RequestItemObject);
        RequestItemObject.Add('itemName', FixedAsset.Description);
        RequestItemObject.Add('ClassCode', FixedAsset."Item Class Code");
        RequestItemObject.Add('itemCd', EtimsBuildCode(FixedAsset."No."));
        RequestItemObject.Add('ItemType', '1');
        RequestItemObject.Add('UnitOfQuantity', EtimsResolveCode(FixedAsset."Quantity Unit Code", 'U'));
        RequestItemObject.Add('PackagingUnit', EtimsResolveCode(FixedAsset."Packaging Unit Code", 'NT'));
        RequestItemObject.Add('SellingPrice', 0);
        RequestItemObject.Add('TaxationType', 'A');
        RequestItemObject.Add('OpeningStock', 0);
        RequestItems.Add(RequestItemObject);
        RegisteredCount += 1;
    end;

    local procedure EtimsBuildJobSetupPayload(RegistrationCard: Record "eTIMS Registration Card"; JobsSetup: Record "Jobs Setup"; var RequestItems: JsonArray; var RequestItemObject: JsonObject; var RegisteredCount: Integer)
    begin
        if RegistrationCard."Register Job Labour" then begin
            Clear(RequestItemObject);
            RequestItemObject.Add('itemName', 'Job Labour');
            RequestItemObject.Add('ClassCode', JobsSetup."Labour Item Class Code");
            RequestItemObject.Add('itemCd', EtimsBuildCode('JOBLABOUR'));
            RequestItemObject.Add('ItemType', '1');
            RequestItemObject.Add('UnitOfQuantity', EtimsResolveCode(JobsSetup."Labour Qty Unit Code", 'U'));
            RequestItemObject.Add('PackagingUnit', EtimsResolveCode(JobsSetup."Labour Pkg Unit Code", 'NT'));
            RequestItemObject.Add('SellingPrice', 0);
            RequestItemObject.Add('TaxationType', 'A');
            RequestItemObject.Add('OpeningStock', 0);
            RequestItems.Add(RequestItemObject);
            RegisteredCount += 1;
        end;

        if RegistrationCard."Register Job Materials" then begin
            Clear(RequestItemObject);
            RequestItemObject.Add('itemName', 'Job Materials');
            RequestItemObject.Add('ClassCode', JobsSetup."Materials Item Class Code");
            RequestItemObject.Add('itemCd', EtimsBuildCode('JOBMAT'));
            RequestItemObject.Add('ItemType', '1');
            RequestItemObject.Add('UnitOfQuantity', EtimsResolveCode(JobsSetup."Materials Qty Unit Code", 'U'));
            RequestItemObject.Add('PackagingUnit', EtimsResolveCode(JobsSetup."Materials Pkg Unit Code", 'NT'));
            RequestItemObject.Add('SellingPrice', 0);
            RequestItemObject.Add('TaxationType', 'A');
            RequestItemObject.Add('OpeningStock', 0);
            RequestItems.Add(RequestItemObject);
            RegisteredCount += 1;
        end;
    end;

    local procedure EtimsAppendRegistrationResult(var RegistrationCard: Record "eTIMS Registration Card"; ResponseText: Text; HttpCode: Integer; ErrorText: Text)
    var
        UserRec: Record User;
    begin
        RegistrationCard."Last HTTP Status" := HttpCode;
        RegistrationCard."Last Response" := CopyStr(ResponseText, 1, MaxStrLen(RegistrationCard."Last Response"));
        RegistrationCard."Last Error" := CopyStr(ErrorText, 1, MaxStrLen(RegistrationCard."Last Error"));
        RegistrationCard."Last Registered At" := CurrentDateTime();
        RegistrationCard."Last Registered By" := CopyStr(UserId(), 1, MaxStrLen(RegistrationCard."Last Registered By"));
        if UserRec.Get(UserSecurityId()) then
            RegistrationCard."Last Registered By Name" := CopyStr(UserRec."Full Name", 1, MaxStrLen(RegistrationCard."Last Registered By Name"));
        if ErrorText = '' then
            RegistrationCard.Status := RegistrationCard.Status::Registered
        else
            RegistrationCard.Status := RegistrationCard.Status::Failed;
        RegistrationCard.Modify(true);
    end;

    local procedure EtimsInsertLog(RegistrationType: Enum "eTIMS Registration Type"; TargetNo: Code[20]; Success: Boolean; HttpStatusCode: Integer; MessageText: Text; RequestPayload: Text; ResponsePayload: Text)
    var
        RegistrationLog: Record "eTIMS Registration Log";
        UserRec: Record User;
    begin
        RegistrationLog.Init();
        RegistrationLog."Log Date Time" := CurrentDateTime();
        RegistrationLog."User ID" := CopyStr(UserId(), 1, MaxStrLen(RegistrationLog."User ID"));
        if UserRec.Get(UserSecurityId()) then
            RegistrationLog."User Name" := CopyStr(UserRec."Full Name", 1, MaxStrLen(RegistrationLog."User Name"));
        RegistrationLog."Registration Type" := RegistrationType;
        RegistrationLog."Target No." := TargetNo;
        RegistrationLog.Success := Success;
        RegistrationLog."HTTP Status Code" := HttpStatusCode;
        RegistrationLog.Message := CopyStr(MessageText, 1, MaxStrLen(RegistrationLog.Message));
        RegistrationLog."Request Payload" := CopyStr(RequestPayload, 1, MaxStrLen(RegistrationLog."Request Payload"));
        RegistrationLog."Response Payload" := CopyStr(ResponsePayload, 1, MaxStrLen(RegistrationLog."Response Payload"));
        RegistrationLog.Insert(true);
    end;

    local procedure EtimsResolveCode(CurrentCode: Code[20]; DefaultCode: Code[20]): Code[20]
    begin
        if CurrentCode = '' then
            exit(DefaultCode);
        exit(CurrentCode);
    end;

    local procedure EtimsBuildCode(SourceText: Text): Text[20]
    begin
        exit(CopyStr(DelChr(UpperCase(SourceText), '=', ' '), 1, 20));
    end;

    procedure PostOrderConfirmationToPortal(SalesOrder: Record "Sales Header")
    var
        HeaderObj, JsonLineObj, PayloadObj : JsonObject;
        JArray: JsonArray;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        RequestHeaders: HttpHeaders;
        SalesLines: Record "Sales Line";
        SalesOrderSubform: Page "Sales Order Subform";
        WMSItegrations: Codeunit "WMSIntegrationsFinal";
        PLS: Record "Packing Lists";
        BarCode: Text;
        Body: Text;
        responseText: Text;
        PortalUserRec: Record User;
        PortalUserName: Text;
    begin
        FCLIntSetup.Get();
        if FCLIntSetup."Portal Order URL" = '' then
            exit;

        if PortalUserRec.Get(UserSecurityId()) then
            PortalUserName := PortalUserRec."Full Name"
        else
            PortalUserName := WMSItegrations.ExtractAfterBackslash(UserId);

        // ── header object ────────────────────────────────────────────────────
        HeaderObj.Add('orderNo', SalesOrder."No.");
        HeaderObj.Add('customerNo', SalesOrder."Sell-to Customer No.");
        HeaderObj.Add('customerName', SalesOrder."Sell-to Customer Name");
        HeaderObj.Add('salespersonCode', SalesOrder."Salesperson Code");
        HeaderObj.Add('routeCode', SalesOrder."Location Code");
        HeaderObj.Add('sectorCode', SalesOrder."Customer Posting Group");
        HeaderObj.Add('orderDate', Format(SalesOrder."Document Date", 0, '<Year4>-<Month,2>-<Day,2>'));
        HeaderObj.Add('postingDate', Format(SalesOrder."Posting Date", 0, '<Year4>-<Month,2>-<Day,2>'));
        HeaderObj.Add('shipmentDate', Format(SalesOrder."Shipment Date", 0, '<Year4>-<Month,2>-<Day,2>'));
        HeaderObj.Add('shipToCode', SalesOrder."Ship-to Code");
        HeaderObj.Add('shipToName', SalesOrder."Ship-to Name");
        HeaderObj.Add('paymentTerms', SalesOrder."Payment Terms Code");
        HeaderObj.Add('externalDocNo', SalesOrder."External Document No.");
        HeaderObj.Add('quoteNo', SalesOrder."Quote No.");
        HeaderObj.Add('printingDatetime', Format(CurrentDateTime, 0, '<Year4>-<Month,2>-<Day,2>T<Hours24,2>:<Minutes,2>:<Seconds,2>.000Z'));
        HeaderObj.Add('bcUserId', WMSItegrations.ExtractAfterBackslash(UserId));
        HeaderObj.Add('bcUserName', PortalUserName);

        // ── lines array ──────────────────────────────────────────────────────
        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesOrder."No.");
        SalesLines.SetRange("Document Type", SalesLines."Document Type"::Order);
        SalesLines.SetRange(Type, SalesLines.Type::Item);
        SalesLines.SetFilter("Posting Group", PLS.Filters);
        if SalesLines.Find('-') then begin
            repeat
                Clear(BarCode);
                BarCode := SalesOrderSubform.GetBarcode(SalesLines."No.");
                Clear(JsonLineObj);
                JsonLineObj.Add('lineNo', SalesLines."Line No.");
                JsonLineObj.Add('itemNo', SalesLines."No.");
                JsonLineObj.Add('description', SalesLines.Description);
                JsonLineObj.Add('quantity', SalesLines."Order Quantity");
                JsonLineObj.Add('quantityBase', SalesLines."Quantity (Base)");
                JsonLineObj.Add('unitPrice', SalesLines."Unit Price");
                JsonLineObj.Add('lineAmount', SalesLines."Amount Including VAT");
                JsonLineObj.Add('unitOfMeasure', SalesLines."Unit of Measure Code");
                JsonLineObj.Add('customerSpec', SalesLines."Customer Specification");
                JsonLineObj.Add('postingGroup', SalesLines."Posting Group");
                JsonLineObj.Add('qtyAssigned', SalesLines."Qty. Assigned");
                JsonLineObj.Add('qtyExecuted', SalesLines.Quantity);
                JsonLineObj.Add('amountInclVat', SalesLines."Amount Including VAT");
                JsonLineObj.Add('vatPct', SalesLines."VAT %");
                JsonLineObj.Add('barcode', BarCode);
                JsonLineObj.Add('part', SalesLines."Part No.");
                JArray.Add(JsonLineObj);
            until SalesLines.Next() = 0;
        end;

        // ── wrap in { header, lines } ────────────────────────────────────────
        PayloadObj.Add('header', HeaderObj);
        PayloadObj.Add('lines', JArray);

        // ── HTTP send ────────────────────────────────────────────────────────
        PayloadObj.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');

        HttpRequest.SetRequestUri(FCLIntSetup."Portal Order URL");
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        HttpRequest.GetHeaders(RequestHeaders);
        RequestHeaders.Add('X-BC-Signature', FCLIntSetup."Portal Webhook Secret");
        RequestHeaders.Add('X-Company-ID', FCLIntSetup."Portal Company ID");

        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if not HttpResponse.IsSuccessStatusCode then
                Message('Portal order webhook failed (%1): %2', HttpResponse.HttpStatusCode(), responseText);
        end;
    end;

    procedure PostInvoiceToPortal(SalesInvoice: Record "Sales Invoice Header")
    var
        PayloadObj, JsonLineObj, EtimsDataObj : JsonObject;
        JArray: JsonArray;
        FCLIntSetup: Record "FCL Integration Setup";
        HttpClient: HttpClient;
        HttpResponse: HttpResponseMessage;
        HttpRequest: HttpRequestMessage;
        HttpContent: HttpContent;
        ContentHeaders: HttpHeaders;
        RequestHeaders: HttpHeaders;
        Company: Record "Company Information";
        SalesLines: Record "Sales Invoice Line";
        SalesPerson: Record "Salesperson/Purchaser";
        verificationURL: Text;
        SalesPersonName: Text;
        Body: Text;
        responseText: Text;
        AmountExVat, AmountIncVat, VatAmount : Decimal;
    begin
        FCLIntSetup.Get();
        if FCLIntSetup."Portal Invoice URL" = '' then
            exit;

        Company.Get();

        SalesPerson.Reset();
        SalesPerson.SetRange(Code, SalesInvoice."Salesperson Code");
        if SalesPerson.FindFirst() then
            SalesPersonName := SalesPerson.Name;

        // ── flat payload per spec ────────────────────────────────────────────
        PayloadObj.Add('orderNo', SalesInvoice."Order No.");
        PayloadObj.Add('invoiceNo', SalesInvoice."No.");
        PayloadObj.Add('invoicedAt', Format(CurrentDateTime, 0, '<Year4>-<Month,2>-<Day,2>T<Hours24,2>:<Minutes,2>:<Seconds,2>.000Z'));
        PayloadObj.Add('postingDate', Format(SalesInvoice."Posting Date", 0, '<Year4>-<Month,2>-<Day,2>'));
        PayloadObj.Add('printingDatetime', Format(CurrentDateTime, 0, '<Year4>-<Month,2>-<Day,2>T<Hours24,2>:<Minutes,2>:<Seconds,2>.000Z'));
        PayloadObj.Add('bcUserId', UserId);
        PayloadObj.Add('etimsInvoiceNo', SalesInvoice.CUInvoiceNo);

        // ── etimsData object ─────────────────────────────────────────────────
        EtimsDataObj.Add('cu', SalesInvoice.CUNo);
        EtimsDataObj.Add('signedAt', SalesInvoice.SignTime);
        PayloadObj.Add('etimsData', EtimsDataObj);

        // ── QR code URL ──────────────────────────────────────────────────────
        verificationURL := ExtractVerificationUrl(getJsonResponseFromDeviceLogs(SalesInvoice."No."));
        PayloadObj.Add('qrcodeUrl', verificationURL + SalesInvoice.CUInvoiceNo);

        // ── customer / salesperson / route / sector ───────────────────────────
        PayloadObj.Add('customerNo', SalesInvoice."Sell-to Customer No.");
        PayloadObj.Add('customerName', SalesInvoice."Sell-to Customer Name");
        PayloadObj.Add('customerPin', SalesInvoice.pinOfBuyer);
        PayloadObj.Add('salespersonCode', SalesInvoice."Salesperson Code");
        PayloadObj.Add('salespersonName', SalesPersonName);
        PayloadObj.Add('routeCode', SalesInvoice."Location Code");
        PayloadObj.Add('sectorCode', SalesInvoice."Customer Posting Group");
        PayloadObj.Add('shipToName', SalesInvoice."Ship-to Name");
        PayloadObj.Add('shipmentMethod', SalesInvoice."Shipment Method Code");
        PayloadObj.Add('paymentTerms', SalesInvoice."Payment Terms Code");
        PayloadObj.Add('externalDocNo', SalesInvoice."External Document No.");
        PayloadObj.Add('companyName', Company.Name);
        PayloadObj.Add('companyPin', Company.PIN);
        PayloadObj.Add('companyEmail', Company."E-Mail");
        PayloadObj.Add('companyVatReg', Company."VAT Registration No.");
        PayloadObj.Add('noPrinted', SalesInvoice."No. Printed");

        // ── lines ────────────────────────────────────────────────────────────
        SalesLines.Reset();
        SalesLines.SetRange("Document No.", SalesInvoice."No.");
        AmountExVat := 0;
        AmountIncVat := 0;
        VatAmount := 0;
        if SalesLines.Find('-') then begin
            repeat
                Clear(JsonLineObj);
                JsonLineObj.Add('lineNo', SalesLines."Line No.");
                JsonLineObj.Add('itemNo', SalesLines."No.");
                JsonLineObj.Add('description', SalesLines.Description);
                JsonLineObj.Add('quantity', SalesLines.Quantity);
                JsonLineObj.Add('unitOfMeasure', SalesLines."Unit of Measure Code");
                JsonLineObj.Add('unitPrice', SalesLines."Unit Price");
                JsonLineObj.Add('lineAmount', SalesLines.Amount);
                JsonLineObj.Add('lineAmountInclVat', SalesLines."Amount Including VAT");
                JsonLineObj.Add('vatPct', SalesLines."VAT %");
                JsonLineObj.Add('vatIdentifier', SalesLines."VAT Identifier");
                JsonLineObj.Add('unitsPerParcel', SalesLines."Units per Parcel");
                JsonLineObj.Add('postingGroup', SalesLines."Posting Group");
                JArray.Add(JsonLineObj);
                AmountExVat += SalesLines.Amount;
                AmountIncVat += SalesLines."Amount Including VAT";
                VatAmount += (SalesLines."Amount Including VAT" - SalesLines.Amount);
            until SalesLines.Next() = 0;
        end;
        PayloadObj.Add('lines', JArray);
        PayloadObj.Add('totalExVat', AmountExVat);
        PayloadObj.Add('vatAmount', VatAmount);
        PayloadObj.Add('totalInclVat', AmountIncVat);

        // ── HTTP send ────────────────────────────────────────────────────────
        PayloadObj.WriteTo(Body);
        HttpContent.WriteFrom(Body);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');

        HttpRequest.SetRequestUri(FCLIntSetup."Portal Invoice URL");
        HttpRequest.Method('POST');
        HttpRequest.Content(HttpContent);
        HttpRequest.GetHeaders(RequestHeaders);
        RequestHeaders.Add('X-BC-Signature', FCLIntSetup."Portal Webhook Secret");
        RequestHeaders.Add('X-Company-ID', FCLIntSetup."Portal Company ID");

        if HttpClient.Send(HttpRequest, HttpResponse) then begin
            HttpResponse.Content().ReadAs(responseText);
            if not HttpResponse.IsSuccessStatusCode then
                Message('Portal invoice webhook failed (%1): %2', HttpResponse.HttpStatusCode(), responseText);
        end;
    end;

}
