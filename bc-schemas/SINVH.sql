USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:24:22 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
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
	[Order No_] [nvarchar](20) NOT NULL,
	[No_ Printed] [int] NOT NULL,
	[On Hold] [nvarchar](3) NOT NULL,
	[Applies-to Doc_ Type] [int] NOT NULL,
	[Applies-to Doc_ No_] [nvarchar](20) NOT NULL,
	[Bal_ Account No_] [nvarchar](20) NOT NULL,
	[VAT Registration No_] [nvarchar](20) NOT NULL,
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
	[Pre-Assigned No_ Series] [nvarchar](20) NOT NULL,
	[No_ Series] [nvarchar](20) NOT NULL,
	[Order No_ Series] [nvarchar](20) NOT NULL,
	[Pre-Assigned No_] [nvarchar](20) NOT NULL,
	[User ID] [nvarchar](50) NOT NULL,
	[Source Code] [nvarchar](10) NOT NULL,
	[Tax Area Code] [nvarchar](20) NOT NULL,
	[Tax Liable] [tinyint] NOT NULL,
	[VAT Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[VAT Base Discount _] [decimal](38, 20) NOT NULL,
	[Invoice Discount Calculation] [int] NOT NULL,
	[Invoice Discount Value] [decimal](38, 20) NOT NULL,
	[Prepayment No_ Series] [nvarchar](20) NOT NULL,
	[Prepayment Invoice] [tinyint] NOT NULL,
	[Prepayment Order No_] [nvarchar](20) NOT NULL,
	[Quote No_] [nvarchar](20) NOT NULL,
	[Company Bank Account Code] [nvarchar](20) NOT NULL,
	[Sell-to Phone No_] [nvarchar](30) NOT NULL,
	[Sell-to E-Mail] [nvarchar](80) NOT NULL,
	[Payment Instructions] [image] NULL,
	[Payment Instructions Name] [nvarchar](20) NOT NULL,
	[VAT Reporting Date] [datetime] NOT NULL,
	[Payment Reference] [nvarchar](50) NOT NULL,
	[Work Description] [image] NULL,
	[Dimension Set ID] [int] NOT NULL,
	[Payment Service Set ID] [int] NOT NULL,
	[Document Exchange Identifier] [nvarchar](50) NOT NULL,
	[Document Exchange Status] [int] NOT NULL,
	[Doc_ Exch_ Original Identifier] [nvarchar](50) NOT NULL,
	[Coupled to CRM] [tinyint] NOT NULL,
	[Direct Debit Mandate ID] [nvarchar](35) NOT NULL,
	[Cust_ Ledger Entry No_] [int] NOT NULL,
	[Dispute Status] [nvarchar](10) NOT NULL,
	[Promised Pay Date] [datetime] NOT NULL,
	[Campaign No_] [nvarchar](20) NOT NULL,
	[Sell-to Contact No_] [nvarchar](20) NOT NULL,
	[Bill-to Contact No_] [nvarchar](20) NOT NULL,
	[Opportunity No_] [nvarchar](20) NOT NULL,
	[Responsibility Center] [nvarchar](10) NOT NULL,
	[Price Calculation Method] [int] NOT NULL,
	[Allow Line Disc_] [tinyint] NOT NULL,
	[Get Shipment Used] [tinyint] NOT NULL,
	[Id] [uniqueidentifier] NOT NULL,
	[Draft Invoice SystemId] [uniqueidentifier] NOT NULL,
	[Dispute Status Id] [uniqueidentifier] NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Your Reference]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Order Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Posting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Shipment Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Posting Description]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Terms Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Due Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Payment Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Pmt_ Discount Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipment Method Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 1 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 2 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Currency Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Currency Factor]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Price Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prices Including VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Invoice Disc_ Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Disc_ Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Language Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Format Region]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Salesperson Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Order No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [No_ Printed]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [On Hold]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Applies-to Doc_ Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Applies-to Doc_ No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bal_ Account No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Registration No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Registration Number]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Reason Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [EU 3-Party Trade]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transport Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer Name 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Address]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Address 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to City]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Contact]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Post Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to County]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Country_Region Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Bal_ Account Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Exit Point]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Correction]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Document Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [External Document No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Area]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Specification]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Method Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Package Tracking No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Pre-Assigned No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Order No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Pre-Assigned No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [User ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Source Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Area Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Tax Liable]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [VAT Base Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Invoice Discount Calculation]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Invoice Discount Value]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment No_ Series]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prepayment Invoice]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment Order No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Quote No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Company Bank Account Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Phone No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to E-Mail]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Instructions Name]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [VAT Reporting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Reference]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Dimension Set ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Payment Service Set ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Document Exchange Identifier]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Document Exchange Status]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Doc_ Exch_ Original Identifier]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Coupled to CRM]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Direct Debit Mandate ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Cust_ Ledger Entry No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Dispute Status]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Promised Pay Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Campaign No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Contact No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Contact No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Opportunity No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Responsibility Center]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Calculation Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Line Disc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Get Shipment Used]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Id]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Draft Invoice SystemId]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Dispute Status Id]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Invoice Header$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


