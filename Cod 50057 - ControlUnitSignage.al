codeunit 50057 "Control Unit Signage"

{
    var
        Amount: Decimal;




    procedure SignInvoices(Rec: Record "Sales Header")
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        RequestObject: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        Request: HttpRequestMessage;
        Content: HttpContent;
        TextContent: Text;
        Path: Text;
        Terminal: Text;
        Options: JsonObject;
        Trial: Text;
        J: JsonObject;
        CashierName: Text;
        AssignedInvoiceNo: Text;
        JT: JsonToken;
        QR: Text;
        Setup: Record "Control Unit Setup";
        Cust: Record Customer;
        INS: InStream;
        OUTS: OutStream;
        SINV: Record "Sales Invoice Header";
        InvOrCN: Code[10];
        GLS: Record "General Ledger Setup";
        LogCU: Codeunit "Device Signage Logs";
        logs: Record "Device Signage Log";
        LogEntryNo: Integer;
        successfulQR: Code[20];
        uplQRCM: Codeunit UploadQRToCreditMemo;
        uplQRINV: Codeunit UploadQRToInvoice;
        DevLogs: Record "Device Signage Log";
        JO: JsonObject;
        InStream: InStream;
        OutStream: OutStream;
        FileName: Text;
        CompanyInfo: Record "Company Information";
        UserSetup: Record "User Setup";
        RecVariant: Variant;

    begin

        if Rec.CUInvoiceNo <> '' then begin
            Message('This invoice has already been signed');
            exit;

        end;

        CompanyInfo.Get();
        CompanyInfo.TestField("Tax Signage Prefix");
        InvOrCN := CompanyInfo."Tax Signage Prefix";
        // ValidateUnPostedDocument(Rec);
        // Setup.Get();
        Terminal := 'invoices';



        RequestObject.Add('invoiceType', 0);



        if (Rec."Document Type" = Rec."Document Type"::Invoice) then begin
            RequestObject.Add('transactionType', 0);
            RequestObject.Add('cashier', CopyStr(UserId, StrPos(UserId, '\') + 1, StrLen(UserId)));
            RequestObject.Add('items', GetLineItems(Rec));
            if (Rec.pinOfBuyer <> '') then
                RequestObject.Add('buyer', GetBuyerDetails(Rec));
            RequestObject.Add('lines', GetLinesMember());
            RequestObject.Add('payment', GetPaymentArray(Rec));
            RequestObject.Add('TraderSystemInvoiceNumber', InvOrCN + DELCHR(FORMAT(Rec."No."), '=', DELCHR(FORMAT(Rec."No."), '=', '1234567890')));
            if Cust.Get(Rec."Sell-to Customer No.") then
                if Cust.ExemptionNo <> '' then
                    RequestObject.Add('ExemptionNumber', Cust.ExemptionNo);
        end
        else begin
            if Rec."Applies-to Doc. No." <> '' then begin
                SINV.SetRange("No.", Rec."Applies-to Doc. No.");
                if SINV.FindFirst() then begin
                    Rec."Tax Applied Document No." := SINV.CUInvoiceNo;
                    Rec.pinOfBuyer := SINV.pinOfBuyer;
                    if rec.pinOfBuyer = '' then begin
                        Cust.Get(SINV."Sell-to Customer No.");
                        Rec.pinOfBuyer := Cust."Telex Answer Back";
                    end;
                end;

                //resolve pin of buyer even if Applies-to Doc. No. is not set
                if Rec.pinOfBuyer = '' then begin
                    Cust.Get(Rec."Sell-to Customer No.");
                    Rec.pinOfBuyer := Cust."Telex Answer Back";
                end;
                if Rec."Tax Applied Document No." = '' then
                    Error('Tax Applied Document No. is not set for the Credit Memo %1', Rec."No.");

            end;

            RequestObject.Add('items', GetLineItems(Rec));
            if (Rec.pinOfBuyer <> '') then
                RequestObject.Add('buyer', GetBuyerDetails(Rec));
            RequestObject.Add('transactionType', 1);
            validateUnpostedCreditNote(Rec);
            RequestObject.Add('relevantNumber', Rec."Tax Applied Document No.");
        end;

        RequestObject.WriteTo(TextContent);
        TextContent := TextContent.Replace(' ', '');
        Content.WriteFrom(TextContent);
        Content.GetHeaders(ContentHeaders);
        ContentHeaders.Clear();
        ContentHeaders.Add('Content-Type', 'application/json');
        Request.Content := Content;
        Request.Method := 'POST';
        Path := resolveControlUnitIP(Rec, 1).ToLower() + Terminal;
        Request.SetRequestUri(Path);
        successfulQR := '';
        successfulQR := checkSuccessfulSignage(Rec);
        UserSetup.Get(UserId);

        if (UserSetup."System Admin") then begin
            if NOT (Confirm(Format(TextContent))) then exit;
        end;

        if StrPos(UserId, 'EMUGA') <> 0 then
            if NOT (Confirm(Format(TextContent))) then exit;
        //   Message('GetLineItems Called');



        if Client.Send(Request, Response) then begin
            if Rec."Document Type" = rec."Document Type"::"Credit Memo" then
                LogEntryNo := InsertLogs(resolveControlUnitIP(Rec, 2),
                                 Logs."Document Type"::CreditNote,
                                 Rec."No.",
                                 CopyStr(TextContent, 1, 2048),
                                 '',
                                 false,
                                 CurrentDateTime,
                                 0DT)
            else
                LogEntryNo := InsertLogs(resolveControlUnitIP(Rec, 2),
                                 Logs."Document Type"::Invoice,
                                 Rec."No.",
                                 CopyStr(TextContent, 1, 2048),
                                 '',
                                 false,
                                 CurrentDateTime,
                                 0DT);
            Commit();



            if Response.IsSuccessStatusCode() then begin

                // Message();
                Response.Content().ReadAs(ResponseText);

                logs.GET(LogEntryNo);
                logs.Response := ResponseText;
                logs."Response DateTime" := CurrentDateTime;
                logs.Modify();
                Commit();
                Clear(J);
                Clear(Rec.CUInvoiceNo);
                J.ReadFrom(ResponseText);
                // Message(Format(J));

                Rec.CUInvoiceNo := GetJSONValue(J, 'mtn');
                Rec.CUNo := GetJSONValue(J, 'msn');
                Rec.SignTime := GetJSONValue(J, 'DateTime');
                Rec.Modify();
                RecVariant := Rec;
                GenerateQRCodeAndStore(GetJSONValue(J, 'verificationUrl'), RecVariant);


            end
            else begin

                logs.GET(LogEntryNo);
                logs.Response := Format(Response.HttpStatusCode);
                logs."Response DateTime" := CurrentDateTime;
                logs.Error := true;
                logs.Modify();
                Commit();


                Rec.CUInvoiceNo := '';
                Rec.CUNo := '';
                Rec.SignTime := '';
                Rec.Modify();
                Response.Content().ReadAs(ResponseText);
                J.ReadFrom(ResponseText);
                // Message(Format(J));
                Error('Request failed because of %1 ', Response.ReasonPhrase());
            end;

            Rec.Modify();
        end;
    end;

    procedure SignPostedInvoices(Rec: Record "Sales Invoice Header")
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        RequestObject: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        Request: HttpRequestMessage;
        Content: HttpContent;
        TextContent: Text;
        Path: Text;
        Terminal: Text;
        J: JsonObject;
        CashierName: Text;
        AssignedInvoiceNo: Text;
        Setup: Record "Control Unit Setup";
        Cust: Record Customer;
        InvOrCN: Code[10];
        logs: Record "Device Signage Log";
        LogEntryNo: Integer;
        successfulQR: Code[20];
        uplQRCM: Codeunit UploadQRToCreditMemo;
        uplQRINV: Codeunit UploadQRToInvoice;
        CompanyInfo: Record "Company Information";
        UserSetup: Record "User Setup";
        RecVariant: Variant;
        UserIdentifier: Text;


    begin
        if Rec.CUInvoiceNo <> '' then
            exit;

        if VerifyPostedInvoicesPIN(Rec) <> '0100' then
            Error('Unable to initiate signage. Please check the connection to the Control Unit and try again');






        CompanyInfo.Get();
        CompanyInfo.TestField("Tax Signage Prefix");
        InvOrCN := CompanyInfo."Tax Signage Prefix";
        Terminal := 'invoices';

        RequestObject.Add('invoiceType', 0);
        RequestObject.Add('transactionType', 0);
        RequestObject.Add('cashier', CopyStr(UserId, StrPos(UserId, '\') + 1, StrLen(UserId)));
        RequestObject.Add('items', GetPostedLineItems(Rec));

        if (Rec.pinOfBuyer <> '') then
            RequestObject.Add('buyer', GetPostedInvoiceBuyerDetails(Rec));

        RequestObject.Add('lines', GetLinesMember());
        RequestObject.Add('payment', GetPostedPaymentArray(Rec));
        RequestObject.Add('TraderSystemInvoiceNumber', InvOrCN + DELCHR(FORMAT(Rec."No."), '=', DELCHR(FORMAT(Rec."No."), '=', '1234567890')));

        if Cust.Get(Rec."Sell-to Customer No.") then
            if Cust.ExemptionNo <> '' then
                RequestObject.Add('ExemptionNumber', Cust.ExemptionNo);

        RequestObject.WriteTo(TextContent);
        TextContent := TextContent.Replace(' ', '');
        Content.WriteFrom(TextContent);

        Content.GetHeaders(ContentHeaders);
        ContentHeaders.Clear();
        ContentHeaders.Add('Content-Type', 'application/json');

        Request.Content := Content;
        Request.Method := 'POST';

        Path := resolvePostedInvControlUnitIP(Rec, 1).ToLower() + Terminal;
        Request.SetRequestUri(Path);



        UserIdentifier := CopyStr(UserId, StrPos(UserId, '\') + 1, StrLen(UserId));
        UserSetup.SetFilter("User ID", '*%1', UserIdentifier);
        UserSetup.SetRange("System Admin", true);

        if UserSetup.FindFirst() then begin
            if not Confirm(Format(TextContent)) then
                exit;
        end;

        if Client.Send(Request, Response) then begin
            LogEntryNo := InsertLogs(
                resolvePostedInvControlUnitIP(Rec, 2),
                Logs."Document Type"::Invoice,
                Rec."No.",
                CopyStr(TextContent, 1, 2048),
                '',
                false,
                CurrentDateTime,
                0DT
            );
            Commit();

            if Response.IsSuccessStatusCode() then begin
                Response.Content().ReadAs(ResponseText);
                J.ReadFrom(ResponseText);
                Rec.CUNo := GetJSONValue(J, 'msn');         // set CUNo first — available in OnAfterValidate
                Rec.SignTime := GetJSONValue(J, 'DateTime');
                Rec.Validate(CUInvoiceNo, GetJSONValue(J, 'mtn'));  // syncs CLE via OnAfterValidate
                Rec.Modify();
                RecVariant := Rec;
                GenerateQRCodeAndStore(GetJSONValue(J, 'verificationUrl'), RecVariant);
            end else begin
                Response.Content().ReadAs(ResponseText);
                J.ReadFrom(ResponseText);
                Error('Request failed because of %1 ', Response.ReasonPhrase());
            end;

            Rec.Modify();

            logs.Get(LogEntryNo);
            logs.Response := ResponseText;
            logs."Response DateTime" := CurrentDateTime;
            logs.Modify();

            Commit();
        end;
    end;



    procedure InsertLogs(dev: Text[250]; DocType: Option Invoice,CreditNote; DocNo: Code[50]; Req: Text; Res: Text; Err: Boolean; ReqDT: DateTime; ResDT: DateTime): Integer
    var
        logs: Record "Device Signage Log";
    begin
        logs.Init();
        logs."Device ID" := dev;
        logs."Document Type" := DocType;
        logs."Document No." := DocNo;

        logs.Request := CopyStr(Req, 1, 2048);
        logs.Response := CopyStr(Res, 1, 2048);
        logs.Error := Err;
        logs."Request DateTime" := ReqDT;
        logs."Response DateTime" := ResDT;
        logs."User ID" := UserId;
        logs.Insert(true);
        exit(logs."Entry No.");
    end;





    procedure checkSuccessfulSignage(Rec: Record "Sales Header"): Code[30];
    var
        deviceLogs: Record "Device Signage Log";
        JO: JsonObject;
    begin
        deviceLogs.Reset();
        deviceLogs.SetRange("Document No.", Rec."No.");
        deviceLogs.SetFilter(Response, '*' + 'DateTime' + '*');
        if deviceLogs.FindFirst() then begin
            JO.ReadFrom(deviceLogs.Response);
            exit(GetJSONValue(JO, 'mtn'));
        end
        else
            exit('');

    end;

    procedure checkSuccessfulPostedInvoiceSignage(Rec: Record "Sales Invoice Header"): Code[30];
    var
        deviceLogs: Record "Device Signage Log";
        JO: JsonObject;
    begin
        deviceLogs.Reset();
        deviceLogs.SetRange("Document No.", Rec."No.");
        deviceLogs.SetFilter(Response, '*' + 'DateTime' + '*');
        if deviceLogs.FindFirst() then begin
            JO.ReadFrom(deviceLogs.Response);
            exit(GetJSONValue(JO, 'mtn'));
        end
        else
            exit('');

    end;


    procedure validateUnpostedCreditNote(Rec: Record "Sales Header")
    var
        SINVL: Record "Sales Invoice Line";
        SL: Record "Sales Line";
        AppliedCreditNotes: Code[250];
        SCMH: Record "Sales Cr.Memo Header";
        SCML: Record "Sales Cr.Memo Line";
        SUMCNLines: Decimal;
        SLAmt: Decimal;
    begin
        //check if all items exist in the applied invoice
        if (Rec."Document Type" = Rec."Document Type"::"Credit Memo") then begin


            SL.Reset();
            SL.SetRange("Document Type", SL."Document Type"::"Credit Memo");
            SL.SetRange("Document No.", Rec."No.");
            SL.SetFilter("Description", '<>%1', 'Currency Rounding');
            SL.SetFilter(Quantity, '>%1', 0);
            if SL.Find('-') then
                repeat
                    SINVL.Reset();
                    SINVL.SetRange("Document No.", Rec."Applies-to Doc. No.");
                    SINVL.SetRange(Description, SL.Description);
                    SINVL.SetFilter(Quantity, '<>%1', 0);
                    if SINVL.Find('-') then begin
                        if SINVL."Amount Including VAT" < SL."Amount Including VAT" then
                            if SINVL."VAT Identifier" <> SL."VAT Identifier" then
                                error('Invoice item line VAT Identifier: ' + SINVL.Description + ' is different from the Cr. Memo VAT Identifier');
                    end
                    else
                        error('Item: ' + SL.Description + ' was not found on the applied invoice: ' + SINVL."Document No.");
                until SL.Next() = 0;

            //check over credit
            //get all credit notes that are applied to the invoice
            AppliedCreditNotes := '';
            SCMH.Reset();
            SCMH.SetRange("Applies-to Doc. No.", Rec."Applies-to Doc. No.");
            if SCMH.Find('-') then
                repeat
                    AppliedCreditNotes += SCMH."No." + '|';
                until SCMH.Next() = 0;

            if (AppliedCreditNotes <> '') then
                // IF (StrPos(AppliedCreditNotes, '|') = StrLen(AppliedCreditNotes)) then
                AppliedCreditNotes := CopyStr(AppliedCreditNotes, 1, StrLen(AppliedCreditNotes) - 1);

            if AppliedCreditNotes <> '' then begin
                SL.Reset();
                SL.SetRange("Document Type", SL."Document Type"::"Credit Memo");
                SL.SetRange("Document No.", Rec."No.");
                SL.SetFilter("Description", '<>%1', 'Currency Rounding');
                SL.SetFilter(Quantity, '>%1', 0);
                if SL.Find('-') then
                    repeat
                        SLAmt := SL."Amount Including VAT";
                        SCML.Reset();
                        SCML.SetFilter("Document No.", AppliedCreditNotes);
                        SCML.SetRange(Description, SL.Description);
                        if SCML.Find('-') then
                            repeat
                                SLAmt -= SCML."Amount Including VAT";
                            until SCML.Next() = 0;
                        if SLAmt < 0 then error('An over-credit of item : ' + SL.Description + 'was attempted. Check documents:' + AppliedCreditNotes);
                    until SL.Next() = 0;
            end;

        end;

    end;



    procedure GenerateQRCode(Uri: Text; CUInvNo: Text): Text;
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        Path: Text;
        Req: JsonObject;
    begin
        Path := Uri + CUInvNo + '.';
        // Message(Path);
        if Client.GET(Path, Response) then
            if Response.IsSuccessStatusCode() then begin
                exit('Success');
            end
            else
                Error('Request failed because of %1 ', Response.ReasonPhrase());
    end;

    procedure CheckReturnReason(var SalesHeader: Record "Sales Header")
    var
        Lines: Record "Sales Line";
    begin
        lines.Reset();
        lines.SetRange("Document Type", lines."Document Type"::"Credit Memo");
        lines.SetRange("Document No.", SalesHeader."No.");
        lines.SetRange(Type, Lines.Type::Item);
        Lines.SetFilter("No.", '<>%1', '');
        Lines.SetRange("Return Reason Code", '');
        if lines.FindFirst() then Error('You have not entered a return reason in one or more lines');

    end;

    // procedure checkSalesPersonCode (SH: Record "Sales Header")
    // var
    //  SL: Record "Sales Line";
    //  begin
    //    SL.RESET;
    //    SL.SetRange("Document Type",SH."Document Type");
    //    SL.SetRange("Document No.",SH."No.");
    //    SL.SetFilter();
    //  end;

    procedure GetJSONValue(J: JsonObject; member: Text): Text
    var
        JT: JsonToken;
        ReturnText: Text;

    begin
        IF J.Get(member, JT) then begin
            JT.WriteTo(ReturnText);
            exit(ReturnText.Replace('"', ''));
        end

        else
            Error(Format(J));

    end;

    procedure GetPaymentArray(Rec: Record "Sales Header"): JsonArray
    var
        JA: JsonArray;
        JO: JsonObject;
        SL: Record "Sales Line";
        AMT: Decimal;
    begin

        JO.Add('amount', Round(Amount + 10, 0.01, '>'));
        JO.Add('paymentType', 'Cash');
        JA.Add(JO);
        exit(JA);
    end;

    procedure GetPostedPaymentArray(Rec: Record "Sales Invoice Header"): JsonArray
    var
        JA: JsonArray;
        JO: JsonObject;
        SL: Record "Sales Line";
        AMT: Decimal;
    begin

        JO.Add('amount', Round(Amount + 10, 0.01, '>'));
        JO.Add('paymentType', 'Cash');
        JA.Add(JO);
        exit(JA);
    end;

    procedure GetAlphabetPartOfString(InputString: Text[250]): Text[250]
    var
        i: Integer;
        Character: Char;
        AlphabetPart: Text[250];
    begin
        AlphabetPart := '';
        for i := 1 to StrLen(InputString) do begin
            Character := InputString[i];
            if (Character >= 'A') and (Character <= 'Z') then
                AlphabetPart := AlphabetPart + Character
            else
                if (Character >= 'a') and (Character <= 'z') then
                    AlphabetPart := AlphabetPart + Character;
        end;
        exit(AlphabetPart);
    end;



    procedure GetBuyerDetails(Rec: Record "Sales Header"): JsonObject
    var
        // cust: Record Customer;
        JO: JsonObject;
        TextContent: Text[250];
        cust: Record Customer;
    begin
        if Rec.pinOfBuyer <> '' then begin
            if not cust.Get(Rec."Sell-to Customer No.") then
                Error('Customer not found for Sales Header %1', Rec."No.");
            if Rec.buyerName = '' then
                Rec.buyerName := cust.Name;

        end;



        JO.Add('buyerName', CopyStr(GetAlphabetPartOfString(Rec.buyerName), 1, 30));
        JO.Add('pinOfBuyer', Rec.pinOfBuyer);
        exit(JO);


    end;

    procedure GetPostedInvoiceBuyerDetails(Rec: Record "Sales Invoice Header"): JsonObject
    var
        // cust: Record Customer;
        JO: JsonObject;
        TextContent: Text[250];
    begin
        JO.Add('buyerName', CopyStr(GetAlphabetPartOfString(Rec.buyerName), 1, 30));
        JO.Add('pinOfBuyer', Rec.pinOfBuyer);
        exit(JO);


    end;



    procedure GetQRASTEXT(SalesInvHeader: Record "Sales Invoice Header") QRCodeText: Text
    var
        MyInStream: InStream;

    begin
        Clear(QRCodeText);
        SalesInvHeader.Calcfields("Work Description");
        If SalesInvHeader.QRCode.HasValue() then begin
            SalesInvHeader.QRCode.CreateInStream(MyInStream);
            MyInStream.Read(QRCodeText);
        end;
    end;

    local procedure resolveControlUnitIP(Rec: Record "Sales Header"; what: Integer): Text
    var
        CUUsers: Record "Control Unit Users";
        Setup: Record "Control Unit Setup";
        SINV: Record "Sales Invoice Header";
    begin

        if (Rec."Document Type" = Rec."Document Type"::Invoice) then begin

            CUUsers.Reset();
            CUUsers.SetRange(UserID, UserId);
            if NOT CUUsers.FindFirst() then
                Page.Run(Page::"Control Unit Users");

            if NOT CUUsers.FindFirst() then
                Error('No users have been confifured with he control units')
            else begin
                Setup.Get(CUUsers."Control Unit No");
                if (what = 1) then exit(Setup."IP Address") else exit(Setup."CU No.");
            end;

        end
        else begin
            If NOT SINV.GET(Rec."Applies-to Doc. No.") then begin
                if Setup.Get(Rec.CUNo) then
                    exit(Setup."IP Address")
                else
                    Error('The Control unit could not be found');

            end

            else begin
                IF NOT Setup.Get(SINV.CUNo) then
                    Error('The Control unit could not be found')
                else
                    exit(Setup."IP Address");
            end;

        end;
    end;

    local procedure resolvePostedInvControlUnitIP(Rec: Record "Sales Invoice Header"; what: Integer): Text
    var
        CUUsers: Record "Control Unit Users";
        Setup: Record "Control Unit Setup";
        SINV: Record "Sales Invoice Header";
    begin

        CUUsers.Reset();
        CUUsers.SetRange(UserID, UserId);
        if NOT CUUsers.FindFirst() then
            Page.Run(Page::"Control Unit Users");

        if NOT CUUsers.FindFirst() then
            Error('No users have been configured with he control units')
        else begin
            Setup.Get(CUUsers."Control Unit No");
            // Message('CU No: %1', CUUsers."Control Unit No");
            if (what = 1) then exit(Setup."IP Address") else exit(Setup."CU No.");
        end;


    end;


    procedure VerifyPIN(Rec: Record "Sales Header"): Text
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        J: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        Request: HttpRequestMessage;
        Content: HttpContent;
        TextContent: Text;
        Path: Text;
        Terminal: Text;
        setup: Record "Control Unit Setup";

    begin
        Terminal := 'pin';

        Path := resolveControlUnitIP(Rec, 1).ToLower() + Terminal;
        setup.SetRange("IP Address", resolveControlUnitIP(Rec, 1));
        if setup.FindFirst() then TextContent := setup.PIN;


        TextContent := '0000';
        Content.WriteFrom(TextContent);
        Request.Content(Content);
        Request.Method('POST');
        Request.SetRequestUri(Path);
        // Message(Path);
        // Message(TextContent);

        if Client.Send(Request, Response) then
            if Response.IsSuccessStatusCode() then begin
                Response.Content().ReadAs(ResponseText);
                //save CU Invoice Numnber and CU serial Number, and Link
                // Message('100');
                exit(ResponseText);
            end
            else
                exit(Format(Response.HttpStatusCode));
    end;

    procedure VerifyPostedInvoicesPIN(Rec: Record "Sales Invoice Header"): Text
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        J: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        Request: HttpRequestMessage;
        Content: HttpContent;
        TextContent: Text;
        Path: Text;
        Terminal: Text;
        setup: Record "Control Unit Setup";

    begin
        Terminal := 'pin';
        Path := resolvePostedInvControlUnitIP(Rec, 1).ToLower() + Terminal;

        // Message(Path);

        setup.SetRange("IP Address", resolvePostedInvControlUnitIP(Rec, 1));

        if setup.FindFirst() then TextContent := setup.PIN;

        TextContent := '0000';
        Content.WriteFrom(TextContent);
        Request.Content(Content);
        Request.Method('POST');
        Request.SetRequestUri(Path);

        if Client.Send(Request, Response) then
            if Response.IsSuccessStatusCode() then begin
                Response.Content().ReadAs(ResponseText);
                // save CU Invoice Numnber and CU serial Number, and Link
                // Message(ResponseText);
                exit(ResponseText);
            end
            else
                exit(Format(Response.HttpStatusCode));
    end;




    procedure GetLineItems(Rec: Record "Sales Header"): JsonArray
    var
        Lines: Record "Sales Line";
        Item: Record "Item";
        VATSetup: Record "VAT Posting Setup";
        JA: JsonArray;
        Items: JsonObject;
        UP: Decimal;
        UP2: Decimal;
        hs: Text;
        counter: Integer;
        IntegerPart: Code[20];
        DecimalPart: Code[20];
        dec: Decimal;
        MaxLength: Integer;
        CNLines: Record "Sales Line";
        CNSumProdLine: Decimal;
        INVSumProdLines: Decimal;
        INVLines: Record "Sales Invoice Line";
        CrNoteQuery: Query 50102;
        INVQuery: Query 50103;
        ItemRec: Record Item;
        Checker: Text[100];
        NoChecker: Code[50];
        VATCheck: Code[10];
        CNPrdSum: Decimal;
        CurrentLine: Record "Sales Line";
        CurrentHsCode: Code[50];
        ExchRate: Decimal;
        FARecord: Record "Fixed Asset";
        JobsSetupRec: Record "Jobs Setup";
    // counter: Integer;
    begin
        // if StrPos(UserId, 'EMUGA') <> 0 then Message('GetLineItems Called');

        if Rec."Currency Factor" <> 0 then
            ExchRate := Rec."Currency Factor"
        else
            ExchRate := 1;

        if (Rec."Document Type" in [Rec."Document Type"::Invoice, Rec."Document Type"::Order]) then begin
            Lines.Reset;
            Lines.SETRANGE("Document No.", Rec."No.");
            Lines.SetRange("Document Type", Rec."Document Type");
            Lines.SetFilter("No.", '<>%1', '');
            Lines.SetFilter(Quantity, '<>%1', 0);
            counter := 0;
            Amount := 0;
            counter := 0;
            if Lines.Find('-') then
                Repeat
                    counter += 1;
                    Items.Add('name', CopyStr(Lines.Description, 1, 42));
                    Items.Add('quantity', Lines.Quantity);
                    UP := Round((Lines."Amount Including VAT" * ExchRate / Lines.Quantity), 0.000001);
                    Amount += ROUND(UP, 0.000001) * Lines.Quantity;
                    Items.Add('unitPrice', UP);
                    Clear(hs);
                    hs := resolveHSCode2(Lines.Description, Lines."VAT Identifier", Lines."No.");
                    // Fixed Asset fallback: look up FA eTIMS Item Code
                    if (hs = '') and (Lines.Type = Lines.Type::"Fixed Asset") then
                        if FARecord.Get(Lines."No.") then
                            hs := FARecord."E-Tims Item Code";
                    // Job GL Account fallback: use Jobs Setup eTIMS codes
                    if (hs = '') and (Rec."Job No." <> '') and (Lines.Type = Lines.Type::"G/L Account") then
                        if JobsSetupRec.Get() then begin
                            if Lines."No." = JobsSetupRec."Labour GL Account" then
                                hs := JobsSetupRec."Labour eTIMS Item Code"
                            else if Lines."No." = JobsSetupRec."Materials GL Account" then
                                hs := JobsSetupRec."Materials eTIMS Item Code";
                        end;
                    if hs <> '' then
                        Items.Add('hsCode', hs);
                    JA.Add(Items);
                    Clear(Items);
                until Lines.Next() = 0;
        end
        else begin //credit notes
                   // if StrPos(UserId, 'EMUGA') <> 0 then Message('Credit note portion');


            Checker := '';
            CNPrdSum := 0;
            VATCheck := '';
            counter := 0;
            CurrentHsCode := '';
            CNLines.Reset();
            CNLines.SetRange("Document No.", Rec."No.");
            CNLines.SetRange("Document Type", Rec."Document Type");
            CNLines.SetFilter("Amount Including VAT", '>%1', 0);
            CNLines.SetCurrentKey(Description);
            CNLines.SetAscending("Description", true);
            if CNLines.Find('-') then
                repeat
                    Clear(hs);
                    counter += 1;
                    if (Checker = '') then begin
                        //first line
                        Checker := CNLines.Description;
                        CNPrdSum += CNLines."Amount Including VAT" * ExchRate;
                        CurrentHsCode := resolveHSCode2(CNLines.Description, CNLines."VAT Identifier", CNLines."No.");
                    end
                    else begin  //meaning more than one line
                        if Checker = CNLines.Description then begin
                            CNPrdSum += CNLines."Amount Including VAT" * ExchRate;

                        end
                        else begin
                            //push the previous line
                            Items.Add('totalAmount', ROUND(CNPrdSum - 0.10, 0.000001, '<'));
                            Items.Add('name', CopyStr(Checker, 1, 42));
                            if CurrentHsCode <> '' then Items.Add('hsCode', CurrentHsCode);

                            JA.Add(Items);
                            Clear(Items);
                            //reset variables
                            CNPrdSum := CNLines."Amount Including VAT" * ExchRate;
                            Checker := CNLines.Description;
                            CurrentHsCode := resolveHSCode2(CNLines.Description, CNLines."VAT Identifier", CNLines."No.");
                        end;
                    end;

                    //if last line
                    if (CNLines.Count - counter = 0) then begin
                        Items.Add('totalAmount', ROUND(CNPrdSum - 0.10, 0.000001, '<'));
                        Items.Add('name', CopyStr(Checker, 1, 42));
                        CurrentHsCode := resolveHSCode2(CNLines.Description, CNLines."VAT Identifier", CNLines."No.");
                        if CurrentHsCode <> '' then
                            Items.Add('hsCode', CurrentHsCode);
                        JA.Add(Items);
                        Clear(Items);
                    end;

                until CNLines.Next() = 0;

        end; //end credit notes
        exit(JA);
    end;  //end procedure


    procedure GetPostedLineItems(Rec: Record "Sales Invoice Header"): JsonArray
    var
        Lines: Record "Sales Invoice Line";
        Item: Record "Item";
        VATSetup: Record "VAT Posting Setup";
        JA: JsonArray;
        Items: JsonObject;
        UP: Decimal;
        UP2: Decimal;
        hs: Text;
        counter: Integer;
        IntegerPart: Code[20];
        DecimalPart: Code[20];
        dec: Decimal;
        MaxLength: Integer;
        CNLines: Record "Sales Line";
        CNSumProdLine: Decimal;
        INVSumProdLines: Decimal;
        INVLines: Record "Sales Invoice Line";
        CrNoteQuery: Query 50102;
        INVQuery: Query 50103;
        ItemRec: Record Item;
        Checker: Text[100];
        NoChecker: Code[50];
        VATCheck: Code[10];
        CNPrdSum: Decimal;
        CurrentLine: Record "Sales Line";
        CurrentHsCode: Code[50];
        ExchRate: Decimal;
    begin

        if Rec."Currency Factor" <> 0 then
            ExchRate := Rec."Currency Factor"
        else
            ExchRate := 1;
        Lines.Reset;
        Lines.SETRANGE("Document No.", Rec."No.");
        Lines.SetFilter("No.", '<>%1', '');
        Lines.SetFilter(Quantity, '<>%1', 0);
        Lines.SetFilter(Description, '<>%1', 'Currency Rounding');
        counter := 0;
        Amount := 0;
        counter := 0;
        if Lines.Find('-') then
            Repeat
                counter += 1;
                Items.Add('name', CopyStr(Lines.Description, 1, 42));
                Items.Add('quantity', Lines.Quantity);
                UP := Round((Lines."Amount Including VAT" * ExchRate / Lines.Quantity), 0.000001);
                Amount += ROUND(UP, 0.000001) * Lines.Quantity;
                Items.Add('unitPrice', UP);
                Clear(hs);
                hs := resolveHSCode2(Lines.Description, Lines."VAT Identifier", Lines."No.");
                if hs <> '' then
                    Items.Add('hsCode', hs);
                JA.Add(Items);
                Clear(Items);
            until Lines.Next() = 0;
        exit(JA);
    end;  //end procedure


    local procedure resolveHSCode(Rec: Record "Sales Line"): Code[20]
    var
        HSCodes: Record "HS Codes";
        HSCode: Code[20];
        ItemRec: Record Item;
        GLAccount: Record "G/L Account";
    begin
        HSCode := '';

        if (Rec.Description <> 'Currency Rounding') then begin
            HSCodes.Reset();
            if (Rec.Type = Rec.Type::Item) then
                HSCodes.SetRange("Item No.", Rec."No.")
            else begin
                //RMK
                // IF CompanyName = 'RMK' then begin
                //     case Rec."No." of

                //         '50004':
                //             exit('0103.10.00');
                //         '50005':
                //             exit('0018.11.00');
                //         '60100':
                //             exit('3915.90.00');
                //         '60200':
                //             exit('3101.00.00');
                //         '60350':
                //             exit('0003.11.00');
                //         '60360':
                //             exit('0003.11.00');


                //     end;
                // end;

                if (Rec.Type = Rec.Type::"G/L Account") and (GLAccount.Get(Rec."No.")) then begin
                    if GLAccount."HS Code" <> '' then exit(GLAccount."HS Code")
                end;
                // search by description if not GL account
                // ItemRec.Reset();
                //     ItemRec.SetRange(Description, Rec.Description);
                //     if ItemRec.FindFirst() then
                //         HSCodes.SetRange("Item No.", ItemRec."No.");
            end;

            HSCodes.SetRange("VAT Identifier", Rec."VAT Identifier");
            if HSCodes.FindFirst() then
                exit(HSCodes.HSCode)
            else
                exit('');
        end;

    end;


    local procedure resolveHSCode2(Desc: Text[100]; VATID: code[10]; ItemNo: Code[10]): Code[20]
    var
        HSCodes: Record "HS Codes";
        HSCode: Code[20];
        ItemRec: Record Item;
        GLAccount: Record "G/L Account";
    // companyInfo: Record "Company Information";
    begin
        HSCode := '';
        companyInfo.Get();



        if (Desc <> 'Currency Rounding') then begin
            HSCodes.Reset();
            HSCodes.SetRange("Item No.", ItemNo);
            HSCodes.SetRange("VAT Identifier", VATID);
            if HSCodes.FindFirst() then
                exit(HSCodes.HSCode)
            else begin
                //check in GL Account first:
                if GLAccount.Get(ItemNo) then begin
                    if GLAccount."HS Code" <> '' then exit(GLAccount."HS Code")
                end
                else begin
                    ItemRec.Reset();
                    ItemRec.SetRange(Description, Desc);
                    if ItemRec.FindFirst() then begin
                        HSCodes.SetRange("Item No.", ItemRec."No.");
                        HSCodes.SetRange("VAT Identifier", VATID);
                        if HSCodes.FindFirst() then
                            exit(HSCodes.HSCode)
                        else
                            exit('');
                    end;

                end;

            end;

        end;

    end;


    procedure GetLinesMember(): JsonArray
    var
        JA: JsonArray;
        JO: JsonObject;
    begin
        JO.Add('lineType', 'Text');
        JO.Add('alignment', 'bold center');
        JO.Add('format', 'Bold');
        JO.Add('value', 'Thanks for your business!');
        JA.Add(JO);
        exit(JA);
    end;

    procedure GetJsonTextField(O: JsonObject; Member: Text): Text
    var
        Result: JsonToken;
    begin
        if O.Get(Member, Result) then begin
            exit(Result.AsValue().AsText());
        end
        else
            exit('NotFound');

    end;

    procedure SendSMSRequest(SalesInvoice: Record "Sales Header")
    var
        HttpClient: HttpClient;
        HttpRequestMessage: HttpRequestMessage;
        HttpResponseMessage: HttpResponseMessage;
        Content: HttpContent;
        JsonObject: JsonObject;
        ContentHeaders: HttpHeaders;
        Customer: Record Customer;
        TotalAmountIncludingVAT: Decimal;
        PhoneNumber: Text;
        MessageText: Text;
        EndpointUrl: Text;
        ResponseText: Text;
        TextContent: Text;
    begin
        // Retrieve customer details
        if Customer.Get(SalesInvoice."Sell-to Customer No.") and
          (SalesInvoice."Customer Posting Group" in ['CASH SALES', 'BCASH SALES', 'STAFF M', 'STAFF A', 'STAFF D']) then begin
            PhoneNumber := Customer."Phone No.";
            if ((StrLen(PhoneNumber) = 10)) then begin
                if (StrLen(PhoneNumber) = 10) and (CopyStr(PhoneNumber, 1, 1) = '0') then
                    PhoneNumber := '254' + CopyStr(PhoneNumber, 2, 9);
                SalesInvoice.CalcFields("Amount Including VAT");
                TotalAmountIncludingVAT := SalesInvoice."Amount Including VAT";
                MessageText := StrSubstNo('Dear Customer, your Farmers Choice order #%2 with a total value of :%1 has been invoiced to be delivered today. For any queries call 0707495932', Format(TotalAmountIncludingVAT), SalesInvoice."No.");
                JsonObject.Add('Number', PhoneNumber);
                JsonObject.Add('Text', MessageText);
                JsonObject.WriteTo(TextContent);
                Content.WriteFrom(TextContent);
                Content.GetHeaders(ContentHeaders);
                ContentHeaders.Clear();
                ContentHeaders.Add('Content-Type', 'application/json');
                EndpointUrl := 'http://100.100.2.54:3201/send-sms'; // Replace with your actual endpoint
                HttpRequestMessage.Method := 'POST';
                HttpRequestMessage.SetRequestUri(EndpointUrl);
                HttpRequestMessage.Content := Content;
                if HttpClient.Send(HttpRequestMessage, HttpResponseMessage) then begin
                    if HttpResponseMessage.IsSuccessStatusCode() then begin
                        HttpResponseMessage.Content().ReadAs(ResponseText);
                    end else begin
                        Message('Request failed with status code: %1', HttpResponseMessage.HttpStatusCode());
                    end;
                end else begin
                    Message('Failed to send request.');
                end;
            end
        end
        else begin
            Message('Customer not found.');

        end;
    end;

    procedure GenerateQRCodeAndStore(TargetUrl: Text; var RecVariant: Variant)
    var
        Client: HttpClient;
        Response: HttpResponseMessage;
        InStream: InStream;
        TempBlob: Codeunit "Temp Blob";
        TempOut: OutStream;
        IntegrationSetup: Record "FCL Integration Setup";
    begin
        // Fetch QR Code from Node.js API
        IntegrationSetup.Get();
        // Message('Fetching QR Code from URL: %1', IntegrationSetup."QRCodeServiceURL" + EscapeDataString(TargetUrl));
        IntegrationSetup.TestField(QRCodeServiceURL);

        Client.Get(IntegrationSetup."QRCodeServiceURL" + EscapeDataString(TargetUrl), Response);
        if not Response.IsSuccessStatusCode() then
            Error('Failed to generate QR code. Status: %1', Response.HttpStatusCode());

        // Read response into TempBlob
        Response.Content.ReadAs(InStream);
        TempBlob.CreateOutStream(TempOut);
        CopyStream(TempOut, InStream);

        // Write to appropriate record type
        WriteQRCodeToRecord(RecVariant, TempBlob);
    end;

    local procedure WriteQRCodeToRecord(var RecVariant: Variant; TempBlob: Codeunit "Temp Blob")
    var
        OutStream: OutStream;
        InStream: InStream;
        RecRef: RecordRef;
        SalesHdr: Record "Sales Header";
        SalesInvHdr: Record "Sales Invoice Header";
        SalesCrMemoHdr: Record "Sales Cr.Memo Header";
    begin
        TempBlob.CreateInStream(InStream);

        if RecVariant.IsRecord() then begin
            RecRef.GetTable(RecVariant); // Get the record reference from variant

            case RecRef.Number of
                DATABASE::"Sales Header":
                    begin
                        RecRef.SetTable(SalesHdr); // Transfer RecRef to Sales Header
                        SalesHdr.CalcFields(QRCode);
                        SalesHdr.QRCode.CreateOutStream(OutStream);
                        CopyStream(OutStream, InStream);
                        SalesHdr.Modify();
                        RecVariant := SalesHdr;
                    end;
                DATABASE::"Sales Invoice Header":
                    begin
                        RecRef.SetTable(SalesInvHdr);
                        SalesInvHdr.CalcFields(QRCode);
                        SalesInvHdr.QRCode.CreateOutStream(OutStream);
                        CopyStream(OutStream, InStream);
                        SalesInvHdr.Modify();
                        RecVariant := SalesInvHdr;
                    end;
                DATABASE::"Sales Cr.Memo Header":
                    begin
                        RecRef.SetTable(SalesCrMemoHdr);
                        SalesCrMemoHdr.CalcFields(QRCode);
                        SalesCrMemoHdr.QRCode.CreateOutStream(OutStream);
                        CopyStream(OutStream, InStream);
                        SalesCrMemoHdr.Modify();
                        RecVariant := SalesCrMemoHdr;
                    end;
                else
                    Error('Unsupported record type. Only Sales Header, Sales Invoice Header, and Sales Cr.Memo Header are supported.');
            end;
        end else
            Error('Variant does not contain a record.');
    end;

    local procedure EscapeDataString(UnescapedUrl: Text): Text
    var
        TypeHelper: Codeunit "Type Helper";
    begin
        exit(TypeHelper.UrlEncode(UnescapedUrl));
    end;

    // local procedure EscapeDataString(UnescapedUrl: Text): Text
    // var
    //     TypeHelper: Codeunit "Type Helper";
    // begin
    //     exit(TypeHelper.UrlEncode(UnescapedUrl));
    // end;


    local procedure ValidateUnPostedDocument(RecVariant: Variant)
    var
        RecRef: RecordRef;
        GLS: Record "General Ledger Setup";
        UserSetup: Record "User Setup";
        SH: Record "Sales Header";
        PD: Date;
    begin
        RecRef.GetTable(RecVariant);
        GLS.Get();
        UserSetup.Get(UserId);
        Evaluate(PD, RecRef.Field(20).Value); // Posting Date

        //check Posting Date 
        if PD < GLS."Allow Posting From" then begin
            //check user setup
            if (PD < UserSetup."Allow Posting From") then
                Error('The Posting Date %1 is after the allowed posting date %2', PD, UserSetup."Allow Posting To");
        end;

        if PD > GLS."Allow Posting To" then begin
            //check user setup
            if (PD > UserSetup."Allow Posting To") then
                Error('The Posting Date %1 is after the allowed posting date %2', PD, UserSetup."Allow Posting To");
        end;


        //if Inventory is sufficient in all the lines for sales invoice
        checkSufficientInventory(RecRef);


        // Add your validation logic here
    end;

    local procedure checkSufficientInventory(RecRef: RecordRef)//:Boolean
    var
        SalesLine: Record "Sales Line";
        Item: Record Item;
        LineRef: RecordRef;
        TypeField: FieldRef;
        NoField: FieldRef;
        QtyField: FieldRef;
        ItemNo: Code[20];
        Qty: Decimal;
        ILE: Record "Item Ledger Entry";
        Inventory: Decimal;
    begin
        // Only check for Sales Header table (36)
        if RecRef.Number = DATABASE::"Sales Header" then begin
            SalesLine.SetRange("Document Type", SalesLine."Document Type"::Invoice);
            SalesLine.SetRange("Document No.", RecRef.Field(3).Value); // "No." field
            if SalesLine.FindSet() then
                repeat
                    if (SalesLine.Type = SalesLine.Type::Item) and (SalesLine.Quantity > 0) then begin

                        //check item ledger for remaining balance in that location
                        ILE.SetRange("Item No.", SalesLine."No.");
                        ILE.SetRange("Location Code", SalesLine."Location Code");
                        if ILE.FindSet() then
                            repeat
                                Inventory += ILE."Remaining Quantity";
                            until ILE.Next() = 0;

                        if Inventory < SalesLine."Quantity (Base)" then begin
                            Error('Insufficient inventory for item %1', SalesLine."No.");
                            // exit(false);
                        end;
                        // exit(false);

                    end;
                    Inventory := 0; // Reset inventory for the next item
                until SalesLine.Next() = 0;
        end;
        // exit(true);
    end;

    procedure UpdateZeroSalesLines(Rec: Record "Sales Header")
    var
        SalesLineNew: Record "Sales Line";
    begin
        SalesLineNew.Reset();
        SalesLineNew.SetRange("Document No.", Rec."No.");
        SalesLineNew.SetRange("Document Type", Rec."Document Type");
        SalesLineNew.SetFilter("No.", '<>%1', ''); // Filter out empty lines
        SalesLineNew.SetRange(Type, SalesLineNew.Type::Item);
        // SalesLineNew.SetRange(Quantity, 0);
        if SalesLineNew.FindSet() then begin
            repeat
                if (SalesLineNew.Quantity = 0) or (SalesLineNew."Qty. to Ship" = 0) then begin
                    // SalesLineNew.Validate("Qty. to Ship", 0);
                    // SalesLineNew.Validate("Qty. to Invoice", 0);
                    SalesLineNew.Validate("Quantity", 0);
                    // SalesLineNew.Validate("Line Amount", 0);
                    // SalesLineNew.Validate("Line Discount Amount", 0);
                    // SalesLineNew.Validate("Line Discount %", 0);
                    // SalesLineNew.Validate("Line Weight", 0);
                    // SalesLineNew.Validate("Quantity (Base)", 0);
                    // SalesLineNew.Validate("Quantity (Base)", 0);
                    // SalesLineNew.Validate("Qty. Invoiced (Base)", 0);
                    // SalesLineNew.Validate("Qty. Shipped (Base)", 0);

                    // SalesLineNew.Validate("Amount Including VAT", 0);
                    // SalesLineNew.Validate("Amount", 0);
                    // SalesLineNew.Validate("Amount (LCY)", 0);
                    SalesLineNew.Modify();
                end;
            until SalesLineNew.Next() = 0;
        end;
    end;


    procedure SignPostShip(Rec: Record "Sales Header"; PrintShipment: Boolean; PrintInvoice: Boolean; Etims: Boolean)
    var
        SIN: Code[20];
        Signage: Codeunit "Control Unit Signage";
        CU: Codeunit UploadQRToInvoice;
        FCLInt: Codeunit "FCL Intergrations";
        SalesPost: Codeunit "Sales-Post";
        SINV: Record "Sales Invoice Header";
        SalesInvoiceLine: Record "Sales Invoice Line";
        CustLedgerEntry: Record "Cust. Ledger Entry";
        Prog: Dialog;
        ShowUI: Boolean;
        TxtDlgFmtLbl: Label 'Post & Print Progress\\Document: #1\\Stage: #2\\Invoice: #3\\Shipment: #4';
        Setup: Record "Sales & Receivables Setup";

    // Comment = '#1 No., #2 stage text, #3 invoice status, #4 shipment status';
    begin
        // Decide once whether to show UI (safe for job queue/web services)
        ShowUI := GUIALLOWED;

        // Open progress dialog with placeholders
        if ShowUI then begin
            Prog.Open(TxtDlgFmtLbl);
            Prog.Update(1, Rec."No.");     // Document
            Prog.Update(2, 'Validating…'); // Stage
            Prog.Update(3, '—');           // Invoice
            Prog.Update(4, '—');           // Shipment
        end;

        // Validations
        Signage.UpdateZeroSalesLines(Rec);
        Rec.TestField("Salesperson Code");
        Rec.TestField("VAT Bus. Posting Group");
        Rec.TestField("Gen. Bus. Posting Group");

        SIN := Rec."No.";

        if ShowUI then Prog.Update(2, 'Posting…');
        SalesPost.SetSuppressCommit(true);
        SalesPost.Run(Rec);

        //Override Etims and get directly from sales & receivables setup
        Setup.Get();
        Etims := Setup."Use eTims Integration";


        // Find the posted invoice by Pre-Assigned No.
        SINV.SetRange("Pre-Assigned No.", SIN);
        if SINV.FindFirst() then begin
            if ShowUI then Prog.Update(2, 'Signing / ETIMS…');

            if Etims then
                Signage.PostSalesInvoicePayload(SINV)
            else
                Signage.SignPostedInvoices(SINV);

            SalesInvoiceLine.SetRange("Document No.", SINV."No.");
            if SalesInvoiceLine.FindSet() then
                SalesInvoiceLine.ModifyAll("Salesperson Code", Rec."Salesperson Code", false);
        end;

        // Refresh handle to the posted invoice (defensive)
        SINV.SetRange("Pre-Assigned No.", SIN);
        if not SINV.FindFirst() then begin
            if ShowUI then begin
                Prog.Update(2, 'No posted invoice found.');
                Prog.Close();
            end;
            exit;
        end;

        // Direct CLE sync — belt-and-suspenders for eTIMS path which uses direct field assignment
        if SINV.CUInvoiceNo <> '' then begin
            CustLedgerEntry.SetRange("Document Type", CustLedgerEntry."Document Type"::Invoice);
            CustLedgerEntry.SetRange("Document No.", SINV."No.");
            if CustLedgerEntry.FindSet(true) then
                repeat
                    CustLedgerEntry."CU Invoice No" := SINV.CUInvoiceNo;
                    if SINV.CUNo <> '' then
                        CustLedgerEntry."Control Unit No." := SINV.CUNo;
                    CustLedgerEntry.Modify(false);
                until CustLedgerEntry.Next() = 0;
        end;

        // Print Invoice (auto, no confirm)
        if PrintInvoice then begin
            if ShowUI then Prog.Update(3, 'Printing…');
            FCLInt.PostPrintInvoice(SINV, SINV."Pre-Assigned No.");
            if ShowUI then Prog.Update(3, StrSubstNo('Printed (%1)', SINV."No."));
        end;

        // Print Shipment (auto, no confirm)
        if PrintShipment then begin
            if ShowUI then Prog.Update(4, 'Printing…');

            FCLInt.PostDeliveryNote(SINV, SINV."Pre-Assigned No.");
            // FCLInt.PostDeliveryNote(SINV, SIN);
            if ShowUI then Prog.Update(4, 'Printed');
        end;

        if ShowUI then begin
            Prog.Update(2, 'Done.');
            Prog.Close();
        end;
    end;



    //Etims...
    procedure GetNextInvoiceNum(url: Text): Text
    begin
        Clear(RequestMessage);
        // Clear(RequestHeaders);
        Clear(ContentHeaders);
        Clear(Response);
        // Message(url);
        RequestMessage.SetRequestUri(url);
        RequestMessage.Method('GET');
        // RequestMessage.GetHeaders(RequestHeaders);
        HttpContent.GetHeaders(ContentHeaders);
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        HttpContent.GetHeaders(ContentHeaders);
        RequestMessage.Content(HttpContent);

        if HttpClient.Send(RequestMessage, ResponseMessage) then begin
            ResponseMessage.Content.ReadAs(Response);
            if ResponseMessage.IsSuccessStatusCode then begin
                if jsonResponse.ReadFrom(Response) then begin
                    jsonResponse.Get('next', jsonTokenValue);
                    Response := jsonTokenValue.AsValue().AsText();
                    // Message(Response);
                    exit(Response);
                end else
                    exit('')
            end else
                exit('fail')
        end;
    end;

    procedure getTaxType(VAT_BusPG: Text; VAT_ProdPG: Text): Text
    var
        VATPostingSetup: Record "VAT Posting Setup";
    begin
        VATPostingSetup.SetRange("VAT Bus. Posting Group", VAT_BusPG);
        VATPostingSetup.SetRange("VAT Prod. Posting Group", VAT_ProdPG);
        if VATPostingSetup.FindFirst() and (VATPostingSetup."eTims VAT Code" <> '') then
            exit(VATPostingSetup."eTims VAT Code");
        Error('No eTims VAT Code found for VAT Bus PG  %1 and VAT Prod PG %2', VAT_BusPG, VAT_ProdPG);
    end;

    procedure PostSalesInvoicePayload(var SalesInvHeader: Record "Sales Invoice Header"): Text
    var
        Payload: JsonObject;
        CustomerObj: JsonObject;
        ItemsArray: JsonArray;
        ItemObj: JsonObject;
        PaymentInfoObj: JsonObject;
        MiniObject: JsonObject;
        ResponseData: JsonObject;
        PaymentModesArray: JsonArray;
        PaymentModeObj: JsonObject;
        Content: HttpContent;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        RemarkText: Text;
        eTimsInvNo: Text;
        // SignInvoices: Codeunit "Control Unit Signage";
        SH: Variant;
        DeviceLogs: Record "Device Signage Log";
        ExcRate: Decimal;
        LogEntryNo: Integer;
        Customer: Record Customer;
        SalesEventSubscribers: Codeunit "Event Subscribers";
        FCLIntegrations: Codeunit "FCL Intergrations";
    begin



        if SalesInvHeader.CUInvoiceNo <> '' then
            Error('Invoice %1 has already been posted to eTims with eTims Invoice No %2', SalesInvHeader."No.", SalesInvHeader.CUInvoiceNo);

        if SalesInvHeader.CUInvoiceNo <> '' then
            Error('Credit Note %1 has already been posted to eTims with eTims Credit Note No %2', SalesInvHeader."No.", SalesInvHeader.CUInvoiceNo);

        //skip if exists in device logs with same document no and type as credit note
        DEviceLogs.SetRange("Document No.", SalesInvHeader."No.");
        DEviceLogs.SetRange("Document Type", DEviceLogs."Document Type"::Invoice);
        if DEviceLogs.FindFirst() then
            exit;



        // Get Company PIN
        CompanyInfo.Get();
        // Get Integrations Setup (for URL)
        IntegrationsSetup.Reset();
        IntegrationsSetup.FindFirst();

        // Call API to get next invoice number
        eTimsInvNo := GetNextInvoiceNum(IntegrationsSetup."eTims InvoiceNum URL");
        if (eTimsInvNo = '') or (eTimsInvNo = 'fail') then
            Error('Invalid eTims invoice number');

        SalesInvHeader.EtimsNo := eTimsInvNo;
        if (SalesInvHeader."Currency Factor" <> 0) then
            ExcRate := 1 / SalesInvHeader."Currency Factor"
        else
            ExcRate := 1;

        // Root
        Payload.Add('businessPin', CompanyInfo.PIN);
        Payload.Add('branchId', '00');
        Payload.Add('invoiceNumber', eTimsInvNo);
        Payload.Add('traderInvoiceNo', SalesInvHeader."No.");

        // Customer
        // customer.Reset();
        // if customer.Get(SalesInvHeader."Sell-to Customer No.") then begin
        if SalesInvHeader.buyerName = '' then
            SalesInvHeader.buyerName := SalesInvHeader."Sell-to Customer Name";
        // Message(SalesInvHeader.pinOfBuyer);
        // Message(SalesInvHeader."Sell-to Customer No.");
        if SalesInvHeader.pinOfBuyer = '' then begin
            if customer.Get(SalesInvHeader."Sell-to Customer No.") then
                SalesInvHeader.pinOfBuyer := customer."Telex Answer Back";
            // Message(Customer."Telex Answer Back");
            // Message(SalesInvHeader.pinOfBuyer);
        end;


        CustomerObj.Add('name', SalesInvHeader.buyerName);
        if SalesInvHeader.pinOfBuyer <> '' then
            CustomerObj.Add('pin', SalesInvHeader.pinOfBuyer);
        // end;
        // CustomerObj.Add('CustBranchId', '00');
        //CustomerObj.Add('name', SalesInvHeader."Sell-to Customer Name");
        CustomerObj.Add('mobile', SalesInvHeader."Sell-to Phone No.");
        CustomerObj.Add('address', SalesInvHeader."Sell-to Address");
        Payload.Add('customer', CustomerObj);

        // Items
        SalesInvLine.SetRange("Document No.", SalesInvHeader."No.");
        SalesInvLine.SetFilter(Amount, '<>%1', 0);
        SalesInvLine.SetFilter(Description, '<>%1', 'Currency Rounding');
        if SalesInvLine.FindSet() then
            repeat
                if Item.Get(SalesInvLine."No.") then begin
                    Clear(ItemObj);
                    ItemObj.Add('itemCode', Item."E-Tims Item Code");
                    ItemObj.Add('itemClassCode', Item."Item Class Code");
                    ItemObj.Add('itemName', SalesInvLine.Description);
                    ItemObj.Add('quantity', SalesInvLine.Quantity);
                    ItemObj.Add('price', Round(SalesInvLine."Amount Including VAT" * ExcRate / SalesInvLine.Quantity, 0.01));
                    ItemObj.Add('taxType', getTaxType(SalesInvLine."VAT Bus. Posting Group", SalesInvLine."VAT Prod. Posting Group"));

                    ItemObj.Add('packageUnit', Item."Packaging Unit code");
                    ItemObj.Add('quantityUnit', Item."Quantity Unit Code");
                    ItemsArray.Add(ItemObj);
                    SalesInvLine."eTims VAT Code" := getTaxType(SalesInvLine."VAT Bus. Posting Group", SalesInvLine."VAT Prod. Posting Group");
                    SalesInvLine."etims Item Code" := Item."E-Tims Item Code";
                    SalesInvLine.Modify();

                end;
            until SalesInvLine.Next() = 0;
        SalesInvHeader.CalcFields("Amount Including VAT");

        Payload.Add('items', ItemsArray);

        // Payment Info
        PaymentInfoObj.Add('amountPaid', SalesInvHeader."Amount Including VAT" * ExcRate);
        PaymentInfoObj.Add('changeGiven', 0);

        Clear(PaymentModeObj);

        PaymentModeObj.Add('mode', 'Cash'); // Default Cash
        PaymentModeObj.Add('amount', SalesInvHeader."Amount Including VAT" * ExcRate);
        PaymentModesArray.Add(PaymentModeObj);
        PaymentInfoObj.Add('paymentModes', PaymentModesArray);

        Payload.Add('paymentInfo', PaymentInfoObj);

        // Remark
        RemarkText := 'Thanks for your business';
        Payload.Add('remark', RemarkText);
        // Message(Format(Payload));

        //Push to etims
        Clear(RequestMessage);
        Clear(RequestHeaders);
        Clear(ContentHeaders);
        Clear(Response);
        RequestMessage.SetRequestUri(IntegrationsSetup."eTims Invoice URL");
        RequestMessage.Method('POST');
        // RequestMessage.GetHeaders(RequestHeaders);
        HttpContent.GetHeaders(ContentHeaders);
        HttpContent.WriteFrom(Format(Payload));
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('X-API-Key', IntegrationsSetup."eTims API Key");
        HttpContent.GetHeaders(ContentHeaders);
        RequestMessage.Content(HttpContent);

        if HttpClient.Send(RequestMessage, ResponseMessage) then begin
            ResponseMessage.Content.ReadAs(Response);
            // Message(Response);
            if ResponseMessage.IsSuccessStatusCode then begin
                //insert into logs first
                // InsertLogs('Sales Invoice', SalesInvHeader."No.", Format(Payload), Response, 'eTims Invoice URL');


                if jsonResponse.ReadFrom(Response) then begin
                    if jsonResponse.Get('success', jsonTokenValue) then
                        if jsonTokenValue.AsValue().AsText() = 'true' then
                            if jsonResponse.Get('data', jsonTokenValue) then begin
                                ResponseData := jsonTokenValue.AsObject();
                                SalesInvHeader."Posted to eTims" := true;
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesInvHeader.QRCodeurl := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('rcptSign', jsonTokenValue) then
                                    SalesInvHeader.rcptSign := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesInvHeader.qrData := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('CuInvoiceNumber', jsonTokenValue) then
                                    SalesInvHeader.CUInvoiceNo := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('pdfPath', jsonTokenValue) then
                                    SalesInvHeader.pdfPath := jsonTokenValue.AsValue().AsText();
                                // customer.GET(SalesInvHeader."Sell-to Customer No.");
                                // SalesInvHeader.buyerName := SalesInvHeader."Sell-to Customer Name";
                                // SalesInvHeader.pinOfBuyer := customer."Telex Answer Back";
                                SalesInvHeader.SignTime := format(CURRENTDATETIME);
                                //save response to Device Logs


                                if jsonResponse.Get('data', jsonTokenValue) then begin
                                    MiniObject := jsonTokenValue.AsObject(); // data
                                    if MiniObject.Get('etimsResponse', jsonTokenValue) then begin
                                        MiniObject := jsonTokenValue.AsObject(); // etimsResponse
                                        if MiniObject.Get('data', jsonTokenValue) then begin
                                            MiniObject := jsonTokenValue.AsObject(); // etimsResponse.data
                                            if MiniObject.Get('mrcNo', jsonTokenValue) then
                                                SalesInvHeader.CUNo := jsonTokenValue.AsValue().AsText(); // "KRA00378248"
                                            // SalesInvHeader.Modify();
                                            // Message(SalesInvHeader.CUNo);
                                        end;
                                    end;
                                end;




                            end
                end
                else
                    exit('Unable to read response');
                SalesInvHeader.Modify();
                Commit();

                jsonResponse.Get('data', jsonTokenValue);
                MiniObject := jsonTokenValue.AsObject();
                Clear(ResponseText);
                jsonTokenValue.WriteTo(ResponseText);
                LogEntryNo := InsertLogs(
               SalesInvHeader.CUNo,
               DeviceLogs."Document Type"::Invoice,
               SalesInvHeader."No.",
               CopyStr(Format(Payload), 1, 2048),
               '',
               false,
               CurrentDateTime,
               0DT
           );
                SH := SalesInvHeader;

                GenerateQRCodeAndStore(SalesInvHeader.QRCodeurl, SH);

                SalesInvHeader.Modify();
                Commit();

                // Sync CUInvoiceNo/CUNo to Customer Ledger Entry immediately after signing
                if SalesInvHeader.CUInvoiceNo <> '' then
                    SalesEventSubscribers.SyncCustLedgerByPostedDocNo(
                        SalesInvHeader."No.", SalesInvHeader.CUInvoiceNo, SalesInvHeader.CUNo,
                        Enum::"Gen. Journal Document Type"::Invoice);

                DeviceLogs.Get(LogEntryNo);
                // DeviceLogs.Response := ResponseText;
                // DeviceLogs.Modify();

                DeviceLogs.Get(LogEntryNo);
                DeviceLogs.Response := ResponseText;
                DeviceLogs."Response DateTime" := CurrentDateTime;
                DeviceLogs.Modify();

                Commit();
                FCLIntegrations.PostInvoiceToPortal(SalesInvHeader);
                // exit('Unable to read response')
            end
            else begin
                InsertLogs(SalesInvHeader.CUNo,
                            DeviceLogs."Document Type"::Invoice,
                            SalesInvHeader."No.",
                            Format(Payload),
                            Response,
                            true,
                            CurrentDateTime,
                            CurrentDateTime

                   );
                Error('Request failed with status code: %1. Response: %2', ResponseMessage.HttpStatusCode(), Response);
            end;// exit('fail')
        end;
        // SH := SalesInvHeader;







    end;

    var
        Customer: Record Customer;
        Item: Record Item;
        IntegrationsSetup: Record "FCL Integration Setup";
        SalesSetup: Record "Sales & Receivables Setup";
        CompanyInfo: Record "Company Information";
        SalesInvLine: Record "Sales Invoice Line";

        RequestMessage: HttpRequestMessage;
        // Sa        RequestHeaders: HttpHeaders;
        ContentHeaders: HttpHeaders;
        HttpContent: HttpContent;
        HttpClient: HttpClient;
        ResponseMessage: HttpResponseMessage;
        Response: Text;
        jsonResponse, ResponseData : JsonObject;
        jsonTokenValue: JsonToken;
        rcptNo, rcptSign, CuInvoiceNumber, pdfPath, qrData : Text;
        SalesCrMemoLine: Record "Sales Cr.Memo Line";

    //CreditNote
    procedure PostSalesCreditMemoPayload(var SalesCrMemoHeader: Record "Sales Cr.Memo Header"): Text
    var
        Payload: JsonObject;
        CustomerObj: JsonObject;
        ItemsArray: JsonArray;
        ItemObj: JsonObject;
        Content: HttpContent;
        ResponseText: Text;
        eTimsCNNo: Text;
        RequestHeaders: HttpHeaders;
        salesInvoiceHeader: Record "Sales Invoice Header";
        DEviceLogs: Record "Device Signage Log";
        ExchRate: Decimal;
        MiniObject: JsonObject;
        LogEntryNo: Integer;
        SH: Variant;
        SalesDesc: Text[100];
        SalesEventSubscribers: Codeunit "Event Subscribers";

    begin

        //ensure credit note has not been posted to eTims already , check device logs just in case CUInvoiceNo is not populated for some reason
        // if SalesCrMemoHeader.CUInvoiceNo <> '' then
        //     Error('Credit Note %1 has already been posted to eTims with eTims Credit Note No %2', SalesCrMemoHeader."No.", SalesCrMemoHeader.CUInvoiceNo);

        //skip if exists in device logs with same document no and type as credit note
        DEviceLogs.SetRange("Document No.", SalesCrMemoHeader."No.");
        DEviceLogs.SetRange("Document Type", DEviceLogs."Document Type"::CreditNote);
        if DEviceLogs.FindFirst() then
            exit('success');

        // Get Company PIN
        CompanyInfo.Get();
        // Get Integrations Setup (for URL)
        IntegrationsSetup.Reset();
        IntegrationsSetup.FindFirst();

        // Call API to get next Credit Note number
        eTimsCNNo := GetNextInvoiceNum(IntegrationsSetup."eTims InvoiceNum URL");
        if (eTimsCNNo = '') or (eTimsCNNo = 'fail') then
            Error('Invalid eTims credit note number');



        salesInvoiceHeader.SetRange(CUInvoiceNo, SalesCrMemoHeader."Tax Applied Document No.");
        if salesInvoiceHeader.FindFirst() then
            if salesInvoiceHeader."Posted to eTims" then
                Payload.Add('originalInvoiceNumber', salesInvoiceHeader.EtimsNo)
            else
                Error('The related invoice %1 has not been posted to eTims. Please post the invoice first before posting the credit note.', SalesCrMemoHeader."Tax Applied Document No.")
        else
            Error('The related invoice %1 was not found. Please check and try again.', SalesCrMemoHeader."Tax Applied Document No.");

        // Root
        Payload.Add('businessPin', CompanyInfo.PIN);
        Payload.Add('branchId', '00');
        // Payload.Add('originalInvoiceNumber', SalesCrMemoHeader."Tax Applied Document No.");
        Payload.Add('creditNoteNumber', eTimsCNNo);
        Payload.Add('traderInvoiceNo', 'CN' + SalesCrMemoHeader."No.");

        if (SalesCrMemoHeader."Currency Factor" <> 0) then
            ExchRate := 1 / SalesCrMemoHeader."Currency Factor"
        else
            ExchRate := 1;



        // Customer
        // Customer.Reset();
        // if Customer.Get(SalesCrMemoHeader."Sell-to Customer No.") then begin
        CustomerObj.Add('name', SalesCrMemoHeader."Sell-to Customer Name");
        if SalesCrMemoHeader.pinOfBuyer <> '' then
            CustomerObj.Add('pin', SalesCrMemoHeader.pinOfBuyer);
        // end;
        // CustomerObj.Add('CustBranchId', '00');
        // CustomerObj.Add('name', SalesCrMemoHeader."Sell-to Customer Name");
        CustomerObj.Add('mobile', SalesCrMemoHeader."Sell-to Phone No.");
        CustomerObj.Add('address', SalesCrMemoHeader."Sell-to Address");
        Payload.Add('customer', CustomerObj);

        // Items
        SalesCrMemoLine.SetRange("Document No.", SalesCrMemoHeader."No.");
        SalesCrMemoLine.SetFilter(Amount, '<>%1', 0);
        SalesCrMemoLine.SetFilter("Description", '<>%1', 'Currency Rounding');
        if SalesCrMemoLine.FindSet() then
            repeat
                case SalesCrMemoLine.Type of

                    SalesCrMemoLine.Type::Item:
                        begin

                            if Item.Get(SalesCrMemoLine."No.") then begin

                                Clear(ItemObj);
                                ItemObj.Add('itemCode', Item."E-Tims Item Code");
                                ItemObj.Add('itemClassCode', Item."Item Class Code");
                                ItemObj.Add('itemName', Item.Description);
                                ItemObj.Add('quantity', SalesCrMemoLine.Quantity);
                                ItemObj.Add('price', Round(SalesCrMemoLine."Amount Including VAT" * ExchRate / SalesCrMemoLine.Quantity, 0.01));
                                ItemObj.Add('taxType', getTaxType(SalesCrMemoLine."VAT Bus. Posting Group", SalesCrMemoLine."VAT Prod. Posting Group"));
                                ItemObj.Add('packageUnit', Item."Packaging Unit code");
                                ItemObj.Add('quantityUnit', Item."Quantity Unit Code");
                                ItemsArray.Add(ItemObj);

                            end;
                        end;

                    SalesCrMemoLine.Type::"G/L Account":
                        begin
                            // Lookup Item using description
                            // Item.Reset();

                            // SalesDesc := DelChr(SalesCrMemoLine.Description, '<>');

                            Item.Reset();
                            // Item.SetRange(Description, SalesDesc);


                            if not Item.Get(SalesCrMemoLine."Description") then
                                Error(
                                  'No matching E-Tims item found for description %1.',
                                  SalesCrMemoLine.Description)
                            else begin
                                Clear(ItemObj);
                                ItemObj.Add('itemCode', Item."E-Tims Item Code");
                                ItemObj.Add('itemClassCode', Item."Item Class Code");
                                ItemObj.Add('itemName', Item.Description);
                                ItemObj.Add('quantity', SalesCrMemoLine.Quantity);
                                ItemObj.Add('price', Round(SalesCrMemoLine."Amount Including VAT" * ExchRate / SalesCrMemoLine.Quantity, 0.01));
                                ItemObj.Add('taxType', getTaxType(SalesCrMemoLine."VAT Bus. Posting Group", SalesCrMemoLine."VAT Prod. Posting Group"));
                                ItemObj.Add('packageUnit', Item."Packaging Unit code");
                                ItemObj.Add('quantityUnit', Item."Quantity Unit Code");
                                ItemsArray.Add(ItemObj);
                            end;
                        end;

                    else
                        Error(
                          'Line type %1 is not supported for E-Tims posting.',
                          SalesCrMemoLine.Type);


                end;
            until SalesCrMemoLine.Next() = 0;

        Payload.Add('items', ItemsArray);

        // Reason (lookup from Return Reason)
        Payload.Add('reason', SalesCrMemoHeader."Reason Code");

        // Push to ETIMS
        Clear(RequestMessage);
        // Clear(RequestHeaders);
        Clear(ContentHeaders);
        Clear(Response);
        RequestMessage.SetRequestUri(IntegrationsSetup."eTims Credit Note URL");
        RequestMessage.Method('POST');
        // RequestMessage.GetHeaders(RequestHeaders);

        // Message(Format(Payload));
        HttpContent.GetHeaders(ContentHeaders);
        HttpContent.WriteFrom(Format(Payload));
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('X-API-Key', IntegrationsSetup."eTims API Key");
        HttpContent.GetHeaders(ContentHeaders);
        RequestMessage.Content(HttpContent);
        if HttpClient.Send(RequestMessage, ResponseMessage) then begin
            ResponseMessage.Content.ReadAs(Response);
            // Message(Response);
            if ResponseMessage.IsSuccessStatusCode then begin
                if jsonResponse.ReadFrom(Response) then begin
                    if jsonResponse.Get('success', jsonTokenValue) then
                        if jsonTokenValue.AsValue().AsText() = 'true' then
                            if jsonResponse.Get('data', jsonTokenValue) then begin
                                ResponseData := jsonTokenValue.AsObject();
                                SalesCrMemoHeader."Posted to eTims" := true;
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesCrMemoHeader.QRCodeurl := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('rcptSign', jsonTokenValue) then
                                    SalesCrMemoHeader.rcptSign := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('CuInvoiceNumber', jsonTokenValue) then
                                    SalesCrMemoHeader.CUInvoiceNo := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('pdfPath', jsonTokenValue) then
                                    SalesCrMemoHeader.pdfPath := jsonTokenValue.AsValue().AsText();
                                SalesCrMemoHeader.SignTime := format(CURRENTDATETIME);
                                SalesCrMemoHeader.Modify();




                                // SalesInvHeader.Modify();
                                Commit();

                                jsonResponse.Get('data', jsonTokenValue);
                                MiniObject := jsonTokenValue.AsObject();
                                Clear(ResponseText);
                                jsonTokenValue.WriteTo(ResponseText);
                                LogEntryNo := InsertLogs(
                               SalesCrMemoHeader.CUNo,
                               DeviceLogs."Document Type"::Invoice,
                               SalesCrMemoHeader."No.",
                               CopyStr(Format(Payload), 1, 2048),
                               '',
                               false,
                               CurrentDateTime,
                               0DT
                           );
                                SH := SalesCrMemoHeader;

                                GenerateQRCodeAndStore(SalesCrMemoHeader.QRCodeurl, SH);

                                SalesCrMemoHeader.Modify();
                                Commit();

                                // Sync CUInvoiceNo/CUNo to Customer Ledger Entry immediately after signing
                                if SalesCrMemoHeader.CUInvoiceNo <> '' then
                                    SalesEventSubscribers.SyncCustLedgerByPostedDocNo(
                                        SalesCrMemoHeader."No.", SalesCrMemoHeader.CUInvoiceNo, SalesCrMemoHeader.CUNo,
                                        Enum::"Gen. Journal Document Type"::"Credit Memo");

                                DeviceLogs.Get(LogEntryNo);
                                // DeviceLogs.Response := ResponseText;
                                // DeviceLogs.Modify();

                                DeviceLogs.Get(LogEntryNo);
                                DeviceLogs.Response := ResponseText;
                                DeviceLogs."Response DateTime" := CurrentDateTime;
                                DeviceLogs.Modify();

                                Commit();
                                exit('success');
                            end;
                    // exit('fail');
                end
                else begin
                    InsertLogs(SalesCrMemoHeader.CUNo,
                                DeviceLogs."Document Type"::CreditNote,
                                SalesCrMemoHeader."No.",
                                Format(Payload),
                                Response,
                                true,
                                CurrentDateTime,
                                CurrentDateTime

                       );
                    // exit('fail');
                    Error('Request failed with status code: %1. Response: %2', ResponseMessage.HttpStatusCode(), Response);
                end;

            end;
        end;
        exit('fail');
    end;

    // ── Job Invoice / Credit-Memo Signing ────────────────────────────────────────
    // Public entry points called from the Job Task invoice flow.
    // They delegate to PostJobSalesInvoicePayload / PostJobSalesCreditMemoPayload
    // which understand GL Account lines and look up eTIMS codes from Jobs Setup.

    procedure SignJobInvoices(var SalesInvHeader: Record "Sales Invoice Header")
    begin
        PostJobSalesInvoicePayload(SalesInvHeader);
    end;

    procedure SignJobCreditMemos(var SalesCrMemoHeader: Record "Sales Cr.Memo Header")
    begin
        PostJobSalesCreditMemoPayload(SalesCrMemoHeader);
    end;

    // ── PostJobSalesInvoicePayload ────────────────────────────────────────────────
    // Mirrors PostSalesInvoicePayload but handles Item, Fixed Asset, and
    // G/L Account line types.  G/L Account lines are resolved against the
    // Labour / Materials GL Accounts in Jobs Setup.
    procedure PostJobSalesInvoicePayload(var SalesInvHeader: Record "Sales Invoice Header"): Text
    var
        Payload: JsonObject;
        CustomerObj: JsonObject;
        ItemsArray: JsonArray;
        ItemObj: JsonObject;
        PaymentInfoObj: JsonObject;
        PaymentModesArray: JsonArray;
        PaymentModeObj: JsonObject;
        MiniObject: JsonObject;
        ResponseData: JsonObject;
        ResponseText: Text;
        RequestHeaders: HttpHeaders;
        RemarkText: Text;
        eTimsInvNo: Text;
        SH: Variant;
        DEviceLogs: Record "Device Signage Log";
        ExcRate: Decimal;
        LogEntryNo: Integer;
        FARecord: Record "Fixed Asset";
        JobsSetupRec: Record "Jobs Setup";
        ItemCode: Text[20];
        ItemClassCode: Text[20];
        PackageUnit: Code[20];
        QuantityUnit: Code[20];
    begin
        if SalesInvHeader.CUInvoiceNo <> '' then
            Error('Invoice %1 has already been posted to eTims with eTims Invoice No %2',
                  SalesInvHeader."No.", SalesInvHeader.CUInvoiceNo);

        DEviceLogs.SetRange("Document No.", SalesInvHeader."No.");
        DEviceLogs.SetRange("Document Type", DEviceLogs."Document Type"::Invoice);
        if DEviceLogs.FindFirst() then exit;

        CompanyInfo.Get();
        IntegrationsSetup.Reset();
        IntegrationsSetup.FindFirst();

        eTimsInvNo := GetNextInvoiceNum(IntegrationsSetup."eTims InvoiceNum URL");
        if (eTimsInvNo = '') or (eTimsInvNo = 'fail') then
            Error('Invalid eTims invoice number');

        SalesInvHeader.EtimsNo := eTimsInvNo;
        if SalesInvHeader."Currency Factor" <> 0 then
            ExcRate := 1 / SalesInvHeader."Currency Factor"
        else
            ExcRate := 1;

        // Root
        Payload.Add('businessPin', CompanyInfo.PIN);
        Payload.Add('branchId', '00');
        Payload.Add('invoiceNumber', eTimsInvNo);
        Payload.Add('traderInvoiceNo', SalesInvHeader."No.");

        // Customer
        if SalesInvHeader.buyerName = '' then
            SalesInvHeader.buyerName := SalesInvHeader."Sell-to Customer Name";
        if SalesInvHeader.pinOfBuyer = '' then
            if Customer.Get(SalesInvHeader."Sell-to Customer No.") then
                SalesInvHeader.pinOfBuyer := Customer."Telex Answer Back";
        CustomerObj.Add('name', SalesInvHeader.buyerName);
        if SalesInvHeader.pinOfBuyer <> '' then
            CustomerObj.Add('pin', SalesInvHeader.pinOfBuyer);
        CustomerObj.Add('mobile', SalesInvHeader."Sell-to Phone No.");
        CustomerObj.Add('address', SalesInvHeader."Sell-to Address");
        Payload.Add('customer', CustomerObj);

        // Load Jobs Setup for GL Account eTIMS code resolution
        if not JobsSetupRec.Get() then Clear(JobsSetupRec);

        // Items
        SalesInvLine.SetRange("Document No.", SalesInvHeader."No.");
        SalesInvLine.SetFilter(Amount, '<>%1', 0);
        SalesInvLine.SetFilter(Description, '<>%1', 'Currency Rounding');
        if SalesInvLine.FindSet() then
            repeat
                Clear(ItemObj);
                Clear(ItemCode);
                Clear(ItemClassCode);
                Clear(PackageUnit);
                Clear(QuantityUnit);

                case SalesInvLine.Type of
                    SalesInvLine.Type::Item:
                        if Item.Get(SalesInvLine."No.") then begin
                            ItemCode := Item."E-Tims Item Code";
                            ItemClassCode := Item."Item Class code";
                            PackageUnit := Item."Packaging Unit code";
                            QuantityUnit := Item."Quantity Unit Code";
                        end;
                    SalesInvLine.Type::"Fixed Asset":
                        if FARecord.Get(SalesInvLine."No.") then begin
                            ItemCode := FARecord."E-Tims Item Code";
                            ItemClassCode := FARecord."Item Class Code";
                            PackageUnit := FARecord."Packaging Unit Code";
                            QuantityUnit := FARecord."Quantity Unit Code";
                        end;
                    SalesInvLine.Type::"G/L Account":
                        if SalesInvLine."No." = JobsSetupRec."Labour GL Account" then begin
                            ItemCode := JobsSetupRec."Labour eTIMS Item Code";
                            ItemClassCode := JobsSetupRec."Labour Item Class Code";
                            PackageUnit := JobsSetupRec."Labour Pkg Unit Code";
                            QuantityUnit := JobsSetupRec."Labour Qty Unit Code";
                        end else if SalesInvLine."No." = JobsSetupRec."Materials GL Account" then begin
                            ItemCode := JobsSetupRec."Materials eTIMS Item Code";
                            ItemClassCode := JobsSetupRec."Materials Item Class Code";
                            PackageUnit := JobsSetupRec."Materials Pkg Unit Code";
                            QuantityUnit := JobsSetupRec."Materials Qty Unit Code";
                        end;
                end;

                if ItemCode <> '' then begin
                    ItemObj.Add('itemCode', ItemCode);
                    ItemObj.Add('itemClassCode', ItemClassCode);
                    ItemObj.Add('itemName', SalesInvLine.Description);
                    ItemObj.Add('quantity', SalesInvLine.Quantity);
                    ItemObj.Add('price', Round(SalesInvLine."Amount Including VAT" * ExcRate / SalesInvLine.Quantity, 0.01));
                    ItemObj.Add('taxType', getTaxType(SalesInvLine."VAT Bus. Posting Group", SalesInvLine."VAT Prod. Posting Group"));
                    ItemObj.Add('packageUnit', PackageUnit);
                    ItemObj.Add('quantityUnit', QuantityUnit);
                    ItemsArray.Add(ItemObj);
                    SalesInvLine."eTims VAT Code" := getTaxType(SalesInvLine."VAT Bus. Posting Group", SalesInvLine."VAT Prod. Posting Group");
                    SalesInvLine."etims Item Code" := CopyStr(ItemCode, 1, MaxStrLen(SalesInvLine."etims Item Code"));
                    SalesInvLine.Modify();
                end;
            until SalesInvLine.Next() = 0;

        SalesInvHeader.CalcFields("Amount Including VAT");
        Payload.Add('items', ItemsArray);

        // Payment Info
        PaymentInfoObj.Add('amountPaid', SalesInvHeader."Amount Including VAT" * ExcRate);
        PaymentInfoObj.Add('changeGiven', 0);
        Clear(PaymentModeObj);
        PaymentModeObj.Add('mode', 'Cash');
        PaymentModeObj.Add('amount', SalesInvHeader."Amount Including VAT" * ExcRate);
        PaymentModesArray.Add(PaymentModeObj);
        PaymentInfoObj.Add('paymentModes', PaymentModesArray);
        Payload.Add('paymentInfo', PaymentInfoObj);
        RemarkText := 'Thanks for your business';
        Payload.Add('remark', RemarkText);

        // Push to eTims
        Clear(RequestMessage);
        Clear(ContentHeaders);
        Clear(Response);
        RequestMessage.SetRequestUri(IntegrationsSetup."eTims Invoice URL");
        RequestMessage.Method('POST');
        HttpContent.GetHeaders(ContentHeaders);
        HttpContent.WriteFrom(Format(Payload));
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('X-API-Key', IntegrationsSetup."eTims API Key");
        HttpContent.GetHeaders(ContentHeaders);
        RequestMessage.Content(HttpContent);

        if HttpClient.Send(RequestMessage, ResponseMessage) then begin
            ResponseMessage.Content.ReadAs(Response);
            if ResponseMessage.IsSuccessStatusCode then begin
                if jsonResponse.ReadFrom(Response) then begin
                    if jsonResponse.Get('success', jsonTokenValue) then
                        if jsonTokenValue.AsValue().AsText() = 'true' then
                            if jsonResponse.Get('data', jsonTokenValue) then begin
                                ResponseData := jsonTokenValue.AsObject();
                                SalesInvHeader."Posted to eTims" := true;
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesInvHeader.QRCodeurl := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('rcptSign', jsonTokenValue) then
                                    SalesInvHeader.rcptSign := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesInvHeader.qrData := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('CuInvoiceNumber', jsonTokenValue) then
                                    SalesInvHeader.CUInvoiceNo := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('pdfPath', jsonTokenValue) then
                                    SalesInvHeader.pdfPath := jsonTokenValue.AsValue().AsText();
                                SalesInvHeader.SignTime := format(CURRENTDATETIME);
                                if jsonResponse.Get('data', jsonTokenValue) then begin
                                    MiniObject := jsonTokenValue.AsObject();
                                    if MiniObject.Get('etimsResponse', jsonTokenValue) then begin
                                        MiniObject := jsonTokenValue.AsObject();
                                        if MiniObject.Get('data', jsonTokenValue) then begin
                                            MiniObject := jsonTokenValue.AsObject();
                                            if MiniObject.Get('mrcNo', jsonTokenValue) then
                                                SalesInvHeader.CUNo := jsonTokenValue.AsValue().AsText();
                                        end;
                                    end;
                                end;
                            end
                end else
                    exit('Unable to read response');
                SalesInvHeader.Modify();
                Commit();
                jsonResponse.Get('data', jsonTokenValue);
                MiniObject := jsonTokenValue.AsObject();
                Clear(ResponseText);
                jsonTokenValue.WriteTo(ResponseText);
                LogEntryNo := InsertLogs(
                    SalesInvHeader.CUNo,
                    DEviceLogs."Document Type"::Invoice,
                    SalesInvHeader."No.",
                    CopyStr(Format(Payload), 1, 2048),
                    '',
                    false,
                    CurrentDateTime,
                    0DT);
                SH := SalesInvHeader;
                GenerateQRCodeAndStore(SalesInvHeader.QRCodeurl, SH);
                SalesInvHeader.Modify();
                Commit();
                DEviceLogs.Get(LogEntryNo);
                DEviceLogs.Response := ResponseText;
                DEviceLogs."Response DateTime" := CurrentDateTime;
                DEviceLogs.Modify();
                Commit();
            end else begin
                InsertLogs(SalesInvHeader.CUNo,
                           DEviceLogs."Document Type"::Invoice,
                           SalesInvHeader."No.",
                           Format(Payload),
                           Response,
                           true,
                           CurrentDateTime,
                           CurrentDateTime);
            end;
            exit('fail')
        end;
    end;

    // ── PostJobSalesCreditMemoPayload ─────────────────────────────────────────────
    // Mirrors PostSalesCreditMemoPayload but handles Item, Fixed Asset, and
    // G/L Account line types without erroring on GL Account lines.
    procedure PostJobSalesCreditMemoPayload(var SalesCrMemoHeader: Record "Sales Cr.Memo Header"): Text
    var
        Payload: JsonObject;
        CustomerObj: JsonObject;
        ItemsArray: JsonArray;
        ItemObj: JsonObject;
        MiniObject: JsonObject;
        ResponseText: Text;
        eTimsCNNo: Text;
        RequestHeaders: HttpHeaders;
        salesInvoiceHeader: Record "Sales Invoice Header";
        DEviceLogs: Record "Device Signage Log";
        ExchRate: Decimal;
        LogEntryNo: Integer;
        SH: Variant;
        FARecord: Record "Fixed Asset";
        JobsSetupRec: Record "Jobs Setup";
        ItemCode: Text[20];
        ItemClassCode: Text[20];
        PackageUnit: Code[20];
        QuantityUnit: Code[20];
    begin
        DEviceLogs.SetRange("Document No.", SalesCrMemoHeader."No.");
        DEviceLogs.SetRange("Document Type", DEviceLogs."Document Type"::CreditNote);
        if DEviceLogs.FindFirst() then exit('success');

        CompanyInfo.Get();
        IntegrationsSetup.Reset();
        IntegrationsSetup.FindFirst();

        eTimsCNNo := GetNextInvoiceNum(IntegrationsSetup."eTims InvoiceNum URL");
        if (eTimsCNNo = '') or (eTimsCNNo = 'fail') then
            Error('Invalid eTims credit note number');

        salesInvoiceHeader.SetRange(CUInvoiceNo, SalesCrMemoHeader."Tax Applied Document No.");
        if salesInvoiceHeader.FindFirst() then
            if salesInvoiceHeader."Posted to eTims" then
                Payload.Add('originalInvoiceNumber', salesInvoiceHeader.EtimsNo)
            else
                Error('The related invoice %1 has not been posted to eTims. Please post the invoice first.',
                      SalesCrMemoHeader."Tax Applied Document No.")
        else
            Error('The related invoice %1 was not found. Please check and try again.',
                  SalesCrMemoHeader."Tax Applied Document No.");

        // Root
        Payload.Add('businessPin', CompanyInfo.PIN);
        Payload.Add('branchId', '00');
        Payload.Add('creditNoteNumber', eTimsCNNo);
        Payload.Add('traderInvoiceNo', 'CN' + SalesCrMemoHeader."No.");

        if SalesCrMemoHeader."Currency Factor" <> 0 then
            ExchRate := 1 / SalesCrMemoHeader."Currency Factor"
        else
            ExchRate := 1;

        // Customer
        CustomerObj.Add('name', SalesCrMemoHeader."Sell-to Customer Name");
        if SalesCrMemoHeader.pinOfBuyer <> '' then
            CustomerObj.Add('pin', SalesCrMemoHeader.pinOfBuyer);
        CustomerObj.Add('mobile', SalesCrMemoHeader."Sell-to Phone No.");
        CustomerObj.Add('address', SalesCrMemoHeader."Sell-to Address");
        Payload.Add('customer', CustomerObj);

        // Load Jobs Setup for GL Account eTIMS code resolution
        if not JobsSetupRec.Get() then Clear(JobsSetupRec);

        // Items
        SalesCrMemoLine.SetRange("Document No.", SalesCrMemoHeader."No.");
        SalesCrMemoLine.SetFilter(Amount, '<>%1', 0);
        SalesCrMemoLine.SetFilter(Description, '<>%1', 'Currency Rounding');
        if SalesCrMemoLine.FindSet() then
            repeat
                Clear(ItemObj);
                Clear(ItemCode);
                Clear(ItemClassCode);
                Clear(PackageUnit);
                Clear(QuantityUnit);

                case SalesCrMemoLine.Type of
                    SalesCrMemoLine.Type::Item:
                        if Item.Get(SalesCrMemoLine."No.") then begin
                            ItemCode := Item."E-Tims Item Code";
                            ItemClassCode := Item."Item Class code";
                            PackageUnit := Item."Packaging Unit code";
                            QuantityUnit := Item."Quantity Unit Code";
                        end;
                    SalesCrMemoLine.Type::"Fixed Asset":
                        if FARecord.Get(SalesCrMemoLine."No.") then begin
                            ItemCode := FARecord."E-Tims Item Code";
                            ItemClassCode := FARecord."Item Class Code";
                            PackageUnit := FARecord."Packaging Unit Code";
                            QuantityUnit := FARecord."Quantity Unit Code";
                        end;
                    SalesCrMemoLine.Type::"G/L Account":
                        if SalesCrMemoLine."No." = JobsSetupRec."Labour GL Account" then begin
                            ItemCode := JobsSetupRec."Labour eTIMS Item Code";
                            ItemClassCode := JobsSetupRec."Labour Item Class Code";
                            PackageUnit := JobsSetupRec."Labour Pkg Unit Code";
                            QuantityUnit := JobsSetupRec."Labour Qty Unit Code";
                        end else if SalesCrMemoLine."No." = JobsSetupRec."Materials GL Account" then begin
                            ItemCode := JobsSetupRec."Materials eTIMS Item Code";
                            ItemClassCode := JobsSetupRec."Materials Item Class Code";
                            PackageUnit := JobsSetupRec."Materials Pkg Unit Code";
                            QuantityUnit := JobsSetupRec."Materials Qty Unit Code";
                        end;
                end;

                if ItemCode <> '' then begin
                    ItemObj.Add('itemCode', ItemCode);
                    ItemObj.Add('itemClassCode', ItemClassCode);
                    ItemObj.Add('itemName', SalesCrMemoLine.Description);
                    ItemObj.Add('quantity', SalesCrMemoLine.Quantity);
                    ItemObj.Add('price', Round(SalesCrMemoLine."Amount Including VAT" * ExchRate / SalesCrMemoLine.Quantity, 0.01));
                    ItemObj.Add('taxType', getTaxType(SalesCrMemoLine."VAT Bus. Posting Group", SalesCrMemoLine."VAT Prod. Posting Group"));
                    ItemObj.Add('packageUnit', PackageUnit);
                    ItemObj.Add('quantityUnit', QuantityUnit);
                    ItemsArray.Add(ItemObj);
                end;
            until SalesCrMemoLine.Next() = 0;

        Payload.Add('items', ItemsArray);
        Payload.Add('reason', SalesCrMemoHeader."Reason Code");

        // Push to eTims
        Clear(RequestMessage);
        Clear(ContentHeaders);
        Clear(Response);
        RequestMessage.SetRequestUri(IntegrationsSetup."eTims Credit Note URL");
        RequestMessage.Method('POST');
        HttpContent.GetHeaders(ContentHeaders);
        HttpContent.WriteFrom(Format(Payload));
        ContentHeaders.Remove('Content-Type');
        ContentHeaders.Add('Content-Type', 'application/json');
        ContentHeaders.Add('X-API-Key', IntegrationsSetup."eTims API Key");
        HttpContent.GetHeaders(ContentHeaders);
        RequestMessage.Content(HttpContent);

        if HttpClient.Send(RequestMessage, ResponseMessage) then begin
            ResponseMessage.Content.ReadAs(Response);
            if ResponseMessage.IsSuccessStatusCode then begin
                if jsonResponse.ReadFrom(Response) then begin
                    if jsonResponse.Get('success', jsonTokenValue) then
                        if jsonTokenValue.AsValue().AsText() = 'true' then
                            if jsonResponse.Get('data', jsonTokenValue) then begin
                                ResponseData := jsonTokenValue.AsObject();
                                SalesCrMemoHeader."Posted to eTims" := true;
                                if ResponseData.Get('qrData', jsonTokenValue) then
                                    SalesCrMemoHeader.QRCodeurl := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('rcptSign', jsonTokenValue) then
                                    SalesCrMemoHeader.rcptSign := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('CuInvoiceNumber', jsonTokenValue) then
                                    SalesCrMemoHeader.CUInvoiceNo := jsonTokenValue.AsValue().AsText();
                                if ResponseData.Get('pdfPath', jsonTokenValue) then
                                    SalesCrMemoHeader.pdfPath := jsonTokenValue.AsValue().AsText();
                                SalesCrMemoHeader.SignTime := format(CURRENTDATETIME);
                                SalesCrMemoHeader.Modify();
                                Commit();
                                jsonResponse.Get('data', jsonTokenValue);
                                MiniObject := jsonTokenValue.AsObject();
                                Clear(ResponseText);
                                jsonTokenValue.WriteTo(ResponseText);
                                LogEntryNo := InsertLogs(
                                    SalesCrMemoHeader.CUNo,
                                    DEviceLogs."Document Type"::CreditNote,
                                    SalesCrMemoHeader."No.",
                                    CopyStr(Format(Payload), 1, 2048),
                                    '',
                                    false,
                                    CurrentDateTime,
                                    0DT);
                                SH := SalesCrMemoHeader;
                                GenerateQRCodeAndStore(SalesCrMemoHeader.QRCodeurl, SH);
                                SalesCrMemoHeader.Modify();
                                Commit();
                                DEviceLogs.Get(LogEntryNo);
                                DEviceLogs.Response := ResponseText;
                                DEviceLogs."Response DateTime" := CurrentDateTime;
                                DEviceLogs.Modify();
                                Commit();
                                exit('success');
                            end;
                    exit('fail');
                end else begin
                    InsertLogs(SalesCrMemoHeader.CUNo,
                               DEviceLogs."Document Type"::CreditNote,
                               SalesCrMemoHeader."No.",
                               Format(Payload),
                               Response,
                               true,
                               CurrentDateTime,
                               CurrentDateTime);
                end;
            end;
        end;
        exit('fail');
    end;

}




