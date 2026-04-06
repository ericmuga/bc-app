USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:23:45 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[Document Type] [int] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Sell-to Customer No_] [nvarchar](20) NOT NULL,
	[Bill-to Customer No_] [nvarchar](20) NOT NULL,
	[Bill-to Name] [nvarchar](100) NOT NULL,
	[Bill-to Name 2] [nvarchar](50) NOT NULL,
	[Bill-to Address] [nvarchar](100) NOT NULL,
	[Bill-to Address 2] [nvarchar](50) NOT NULL,
	[Bill-to City] [nvarchar](30) NOT NULL,
	[Bill-to Contact] [nvarchar](100) NOT NULL,
	[Your Reference] [nvarchar](35) NOT NULL,
	[Ship-to Code] [nvarchar](10) NOT NULL,
	[Ship-to Name] [nvarchar](100) NOT NULL,
	[Ship-to Name 2] [nvarchar](50) NOT NULL,
	[Ship-to Address] [nvarchar](100) NOT NULL,
	[Ship-to Address 2] [nvarchar](50) NOT NULL,
	[Ship-to City] [nvarchar](30) NOT NULL,
	[Ship-to Contact] [nvarchar](100) NOT NULL,
	[Order Date] [datetime] NOT NULL,
	[Posting Date] [datetime] NOT NULL,
	[Shipment Date] [datetime] NOT NULL,
	[Posting Description] [nvarchar](100) NOT NULL,
	[Payment Terms Code] [nvarchar](10) NOT NULL,
	[Due Date] [datetime] NOT NULL,
	[Payment Discount _] [decimal](38, 20) NOT NULL,
	[Pmt_ Discount Date] [datetime] NOT NULL,
	[Shipment Method Code] [nvarchar](10) NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Shortcut Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Shortcut Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Customer Posting Group] [nvarchar](20) NOT NULL,
	[Currency Code] [nvarchar](10) NOT NULL,
	[Currency Factor] [decimal](38, 20) NOT NULL,
	[Customer Price Group] [nvarchar](10) NOT NULL,
	[Prices Including VAT] [tinyint] NOT NULL,
	[Invoice Disc_ Code] [nvarchar](20) NOT NULL,
	[Customer Disc_ Group] [nvarchar](20) NOT NULL,
	[Language Code] [nvarchar](10) NOT NULL,
	[Format Region] [nvarchar](80) NOT NULL,
	[Salesperson Code] [nvarchar](20) NOT NULL,
	[Order Class] [nvarchar](10) NOT NULL,
	[No_ Printed] [int] NOT NULL,
	[On Hold] [nvarchar](3) NOT NULL,
	[Applies-to Doc_ Type] [int] NOT NULL,
	[Applies-to Doc_ No_] [nvarchar](20) NOT NULL,
	[Bal_ Account No_] [nvarchar](20) NOT NULL,
	[Ship] [tinyint] NOT NULL,
	[Invoice] [tinyint] NOT NULL,
	[Print Posted Documents] [tinyint] NOT NULL,
	[Shipping No_] [nvarchar](20) NOT NULL,
	[Posting No_] [nvarchar](20) NOT NULL,
	[Last Shipping No_] [nvarchar](20) NOT NULL,
	[Last Posting No_] [nvarchar](20) NOT NULL,
	[Prepayment No_] [nvarchar](20) NOT NULL,
	[Last Prepayment No_] [nvarchar](20) NOT NULL,
	[Prepmt_ Cr_ Memo No_] [nvarchar](20) NOT NULL,
	[Last Prepmt_ Cr_ Memo No_] [nvarchar](20) NOT NULL,
	[VAT Registration No_] [nvarchar](20) NOT NULL,
	[Combine Shipments] [tinyint] NOT NULL,
	[Registration Number] [nvarchar](50) NOT NULL,
	[Reason Code] [nvarchar](10) NOT NULL,
	[Gen_ Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[EU 3-Party Trade] [tinyint] NOT NULL,
	[Transaction Type] [nvarchar](10) NOT NULL,
	[Transport Method] [nvarchar](10) NOT NULL,
	[VAT Country_Region Code] [nvarchar](10) NOT NULL,
	[Sell-to Customer Name] [nvarchar](100) NOT NULL,
	[Sell-to Customer Name 2] [nvarchar](50) NOT NULL,
	[Sell-to Address] [nvarchar](100) NOT NULL,
	[Sell-to Address 2] [nvarchar](50) NOT NULL,
	[Sell-to City] [nvarchar](30) NOT NULL,
	[Sell-to Contact] [nvarchar](100) NOT NULL,
	[Bill-to Post Code] [nvarchar](20) NOT NULL,
	[Bill-to County] [nvarchar](30) NOT NULL,
	[Bill-to Country_Region Code] [nvarchar](10) NOT NULL,
	[Sell-to Post Code] [nvarchar](20) NOT NULL,
	[Sell-to County] [nvarchar](30) NOT NULL,
	[Sell-to Country_Region Code] [nvarchar](10) NOT NULL,
	[Ship-to Post Code] [nvarchar](20) NOT NULL,
	[Ship-to County] [nvarchar](30) NOT NULL,
	[Ship-to Country_Region Code] [nvarchar](10) NOT NULL,
	[Bal_ Account Type] [int] NOT NULL,
	[Exit Point] [nvarchar](10) NOT NULL,
	[Correction] [tinyint] NOT NULL,
	[Document Date] [datetime] NOT NULL,
	[External Document No_] [nvarchar](35) NOT NULL,
	[Area] [nvarchar](10) NOT NULL,
	[Transaction Specification] [nvarchar](10) NOT NULL,
	[Payment Method Code] [nvarchar](10) NOT NULL,
	[Shipping Agent Code] [nvarchar](10) NOT NULL,
	[Package Tracking No_] [nvarchar](30) NOT NULL,
	[No_ Series] [nvarchar](20) NOT NULL,
	[Posting No_ Series] [nvarchar](20) NOT NULL,
	[Shipping No_ Series] [nvarchar](20) NOT NULL,
	[Tax Area Code] [nvarchar](20) NOT NULL,
	[Tax Liable] [tinyint] NOT NULL,
	[VAT Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[Reserve] [int] NOT NULL,
	[Applies-to ID] [nvarchar](50) NOT NULL,
	[VAT Base Discount _] [decimal](38, 20) NOT NULL,
	[Status] [int] NOT NULL,
	[Invoice Discount Calculation] [int] NOT NULL,
	[Invoice Discount Value] [decimal](38, 20) NOT NULL,
	[Send IC Document] [tinyint] NOT NULL,
	[IC Status] [int] NOT NULL,
	[Sell-to IC Partner Code] [nvarchar](20) NOT NULL,
	[Bill-to IC Partner Code] [nvarchar](20) NOT NULL,
	[IC Reference Document No_] [nvarchar](20) NOT NULL,
	[IC Direction] [int] NOT NULL,
	[Prepayment _] [decimal](38, 20) NOT NULL,
	[Prepayment No_ Series] [nvarchar](20) NOT NULL,
	[Compress Prepayment] [tinyint] NOT NULL,
	[Prepayment Due Date] [datetime] NOT NULL,
	[Prepmt_ Cr_ Memo No_ Series] [nvarchar](20) NOT NULL,
	[Prepmt_ Posting Description] [nvarchar](100) NOT NULL,
	[Prepmt_ Pmt_ Discount Date] [datetime] NOT NULL,
	[Prepmt_ Payment Terms Code] [nvarchar](10) NOT NULL,
	[Prepmt_ Payment Discount _] [decimal](38, 20) NOT NULL,
	[Quote No_] [nvarchar](20) NOT NULL,
	[Quote Valid Until Date] [datetime] NOT NULL,
	[Quote Sent to Customer] [datetime] NOT NULL,
	[Quote Accepted] [tinyint] NOT NULL,
	[Quote Accepted Date] [datetime] NOT NULL,
	[Job Queue Status] [int] NOT NULL,
	[Job Queue Entry ID] [uniqueidentifier] NOT NULL,
	[Company Bank Account Code] [nvarchar](20) NOT NULL,
	[Incoming Document Entry No_] [int] NOT NULL,
	[IsTest] [tinyint] NOT NULL,
	[Sell-to Phone No_] [nvarchar](30) NOT NULL,
	[Sell-to E-Mail] [nvarchar](80) NOT NULL,
	[Payment Instructions Id] [int] NOT NULL,
	[Journal Templ_ Name] [nvarchar](10) NOT NULL,
	[VAT Reporting Date] [datetime] NOT NULL,
	[Rcvd-from Country_Region Code] [nvarchar](10) NOT NULL,
	[Rcvd_-from Count__Region Code] [nvarchar](10) NOT NULL,
	[Work Description] [image] NULL,
	[Dimension Set ID] [int] NOT NULL,
	[Payment Service Set ID] [int] NOT NULL,
	[Coupled to CRM] [tinyint] NOT NULL,
	[Direct Debit Mandate ID] [nvarchar](35) NOT NULL,
	[Doc_ No_ Occurrence] [int] NOT NULL,
	[Campaign No_] [nvarchar](20) NOT NULL,
	[Sell-to Customer Template Code] [nvarchar](10) NOT NULL,
	[Sell-to Contact No_] [nvarchar](20) NOT NULL,
	[Bill-to Contact No_] [nvarchar](20) NOT NULL,
	[Bill-to Customer Template Code] [nvarchar](10) NOT NULL,
	[Opportunity No_] [nvarchar](20) NOT NULL,
	[Sell-to Customer Templ_ Code] [nvarchar](20) NOT NULL,
	[Bill-to Customer Templ_ Code] [nvarchar](20) NOT NULL,
	[Responsibility Center] [nvarchar](10) NOT NULL,
	[Shipping Advice] [int] NOT NULL,
	[Posting from Whse_ Ref_] [int] NOT NULL,
	[Requested Delivery Date] [datetime] NOT NULL,
	[Promised Delivery Date] [datetime] NOT NULL,
	[Shipping Time] [varchar](32) NOT NULL,
	[Outbound Whse_ Handling Time] [varchar](32) NOT NULL,
	[Shipping Agent Service Code] [nvarchar](10) NOT NULL,
	[Receive] [tinyint] NOT NULL,
	[Return Receipt No_] [nvarchar](20) NOT NULL,
	[Return Receipt No_ Series] [nvarchar](20) NOT NULL,
	[Last Return Receipt No_] [nvarchar](20) NOT NULL,
	[Price Calculation Method] [int] NOT NULL,
	[Allow Line Disc_] [tinyint] NOT NULL,
	[Get Shipment Used] [tinyint] NOT NULL,
	[Id] [uniqueidentifier] NOT NULL,
	[Assigned User ID] [nvarchar](50) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[Document Type] ASC,
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Your Reference]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Order Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Posting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Shipment Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Posting Description]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Terms Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Due Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Payment Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Pmt_ Discount Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipment Method Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 1 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 2 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Currency Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Currency Factor]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Price Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prices Including VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Invoice Disc_ Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Disc_ Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Language Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Format Region]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Salesperson Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Order Class]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [No_ Printed]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [On Hold]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Applies-to Doc_ Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Applies-to Doc_ No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bal_ Account No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Ship]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Invoice]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Print Posted Documents]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Posting No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Last Shipping No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Last Posting No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Last Prepayment No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepmt_ Cr_ Memo No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Last Prepmt_ Cr_ Memo No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Registration No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Combine Shipments]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Registration Number]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Reason Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [EU 3-Party Trade]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transport Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Bal_ Account Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Exit Point]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Correction]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Document Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [External Document No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Area]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Specification]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Method Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Package Tracking No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Posting No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Area Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Tax Liable]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Reserve]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Applies-to ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [VAT Base Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Status]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Invoice Discount Calculation]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Invoice Discount Value]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Send IC Document]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [IC Status]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to IC Partner Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to IC Partner Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [IC Reference Document No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [IC Direction]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment _]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Compress Prepayment]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Prepayment Due Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepmt_ Cr_ Memo No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepmt_ Posting Description]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Prepmt_ Pmt_ Discount Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepmt_ Payment Terms Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Payment Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Quote No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Quote Valid Until Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Quote Sent to Customer]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Quote Accepted]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Quote Accepted Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Job Queue Status]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Job Queue Entry ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Company Bank Account Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Incoming Document Entry No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [IsTest]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Phone No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to E-Mail]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Payment Instructions Id]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Journal Templ_ Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [VAT Reporting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Rcvd-from Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Rcvd_-from Count__Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Dimension Set ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Payment Service Set ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Coupled to CRM]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Direct Debit Mandate ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Doc_ No_ Occurrence]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Campaign No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Template Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Contact No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Contact No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer Template Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Opportunity No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Templ_ Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer Templ_ Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Responsibility Center]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Shipping Advice]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Posting from Whse_ Ref_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Requested Delivery Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Promised Delivery Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Shipping Time]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Outbound Whse_ Handling Time]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Service Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Receive]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Return Receipt No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Return Receipt No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Last Return Receipt No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Calculation Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Line Disc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Get Shipment Used]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Id]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Assigned User ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


