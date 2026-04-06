USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:26:01 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[Document Type] [int] NOT NULL,
	[Document No_] [nvarchar](20) NOT NULL,
	[Line No_] [int] NOT NULL,
	[Sell-to Customer No_] [nvarchar](20) NOT NULL,
	[Type] [int] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Posting Group] [nvarchar](20) NOT NULL,
	[Shipment Date] [datetime] NOT NULL,
	[Description] [nvarchar](100) NOT NULL,
	[Description 2] [nvarchar](50) NOT NULL,
	[Unit of Measure] [nvarchar](50) NOT NULL,
	[Quantity] [decimal](38, 20) NOT NULL,
	[Outstanding Quantity] [decimal](38, 20) NOT NULL,
	[Qty_ to Invoice] [decimal](38, 20) NOT NULL,
	[Qty_ to Ship] [decimal](38, 20) NOT NULL,
	[Unit Price] [decimal](38, 20) NOT NULL,
	[Unit Cost (LCY)] [decimal](38, 20) NOT NULL,
	[VAT _] [decimal](38, 20) NOT NULL,
	[Line Discount _] [decimal](38, 20) NOT NULL,
	[Line Discount Amount] [decimal](38, 20) NOT NULL,
	[Amount] [decimal](38, 20) NOT NULL,
	[Amount Including VAT] [decimal](38, 20) NOT NULL,
	[Allow Invoice Disc_] [tinyint] NOT NULL,
	[Gross Weight] [decimal](38, 20) NOT NULL,
	[Net Weight] [decimal](38, 20) NOT NULL,
	[Units per Parcel] [decimal](38, 20) NOT NULL,
	[Unit Volume] [decimal](38, 20) NOT NULL,
	[Appl_-to Item Entry] [int] NOT NULL,
	[Shortcut Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Shortcut Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Customer Price Group] [nvarchar](10) NOT NULL,
	[Job No_] [nvarchar](20) NOT NULL,
	[Work Type Code] [nvarchar](10) NOT NULL,
	[Recalculate Invoice Disc_] [tinyint] NOT NULL,
	[Outstanding Amount] [decimal](38, 20) NOT NULL,
	[Qty_ Shipped Not Invoiced] [decimal](38, 20) NOT NULL,
	[Shipped Not Invoiced] [decimal](38, 20) NOT NULL,
	[Quantity Shipped] [decimal](38, 20) NOT NULL,
	[Quantity Invoiced] [decimal](38, 20) NOT NULL,
	[Shipment No_] [nvarchar](20) NOT NULL,
	[Shipment Line No_] [int] NOT NULL,
	[Profit _] [decimal](38, 20) NOT NULL,
	[Bill-to Customer No_] [nvarchar](20) NOT NULL,
	[Inv_ Discount Amount] [decimal](38, 20) NOT NULL,
	[Purchase Order No_] [nvarchar](20) NOT NULL,
	[Purch_ Order Line No_] [int] NOT NULL,
	[Drop Shipment] [tinyint] NOT NULL,
	[Gen_ Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[Gen_ Prod_ Posting Group] [nvarchar](20) NOT NULL,
	[VAT Calculation Type] [int] NOT NULL,
	[Transaction Type] [nvarchar](10) NOT NULL,
	[Transport Method] [nvarchar](10) NOT NULL,
	[Attached to Line No_] [int] NOT NULL,
	[Exit Point] [nvarchar](10) NOT NULL,
	[Area] [nvarchar](10) NOT NULL,
	[Transaction Specification] [nvarchar](10) NOT NULL,
	[Tax Category] [nvarchar](10) NOT NULL,
	[Tax Area Code] [nvarchar](20) NOT NULL,
	[Tax Liable] [tinyint] NOT NULL,
	[Tax Group Code] [nvarchar](20) NOT NULL,
	[VAT Clause Code] [nvarchar](20) NOT NULL,
	[VAT Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[VAT Prod_ Posting Group] [nvarchar](20) NOT NULL,
	[Currency Code] [nvarchar](10) NOT NULL,
	[Outstanding Amount (LCY)] [decimal](38, 20) NOT NULL,
	[Shipped Not Invoiced (LCY)] [decimal](38, 20) NOT NULL,
	[Shipped Not Inv_ (LCY) No VAT] [decimal](38, 20) NOT NULL,
	[Reserve] [int] NOT NULL,
	[Blanket Order No_] [nvarchar](20) NOT NULL,
	[Blanket Order Line No_] [int] NOT NULL,
	[VAT Base Amount] [decimal](38, 20) NOT NULL,
	[Unit Cost] [decimal](38, 20) NOT NULL,
	[System-Created Entry] [tinyint] NOT NULL,
	[Line Amount] [decimal](38, 20) NOT NULL,
	[VAT Difference] [decimal](38, 20) NOT NULL,
	[Inv_ Disc_ Amount to Invoice] [decimal](38, 20) NOT NULL,
	[VAT Identifier] [nvarchar](20) NOT NULL,
	[IC Partner Ref_ Type] [int] NOT NULL,
	[IC Partner Reference] [nvarchar](20) NOT NULL,
	[Prepayment _] [decimal](38, 20) NOT NULL,
	[Prepmt_ Line Amount] [decimal](38, 20) NOT NULL,
	[Prepmt_ Amt_ Inv_] [decimal](38, 20) NOT NULL,
	[Prepmt_ Amt_ Incl_ VAT] [decimal](38, 20) NOT NULL,
	[Prepayment Amount] [decimal](38, 20) NOT NULL,
	[Prepmt_ VAT Base Amt_] [decimal](38, 20) NOT NULL,
	[Prepayment VAT _] [decimal](38, 20) NOT NULL,
	[Prepmt_ VAT Calc_ Type] [int] NOT NULL,
	[Prepayment VAT Identifier] [nvarchar](20) NOT NULL,
	[Prepayment Tax Area Code] [nvarchar](20) NOT NULL,
	[Prepayment Tax Liable] [tinyint] NOT NULL,
	[Prepayment Tax Group Code] [nvarchar](20) NOT NULL,
	[Prepmt Amt to Deduct] [decimal](38, 20) NOT NULL,
	[Prepmt Amt Deducted] [decimal](38, 20) NOT NULL,
	[Prepayment Line] [tinyint] NOT NULL,
	[Prepmt_ Amount Inv_ Incl_ VAT] [decimal](38, 20) NOT NULL,
	[Prepmt_ Amount Inv_ (LCY)] [decimal](38, 20) NOT NULL,
	[IC Partner Code] [nvarchar](20) NOT NULL,
	[Prepmt_ VAT Amount Inv_ (LCY)] [decimal](38, 20) NOT NULL,
	[Prepayment VAT Difference] [decimal](38, 20) NOT NULL,
	[Prepmt VAT Diff_ to Deduct] [decimal](38, 20) NOT NULL,
	[Prepmt VAT Diff_ Deducted] [decimal](38, 20) NOT NULL,
	[IC Item Reference No_] [nvarchar](50) NOT NULL,
	[Pmt_ Discount Amount] [decimal](38, 20) NOT NULL,
	[Prepmt_ Pmt_ Discount Amount] [decimal](38, 20) NOT NULL,
	[Line Discount Calculation] [int] NOT NULL,
	[Dimension Set ID] [int] NOT NULL,
	[Qty_ to Assemble to Order] [decimal](38, 20) NOT NULL,
	[Qty_ to Asm_ to Order (Base)] [decimal](38, 20) NOT NULL,
	[Job Task No_] [nvarchar](20) NOT NULL,
	[Job Contract Entry No_] [int] NOT NULL,
	[Deferral Code] [nvarchar](10) NOT NULL,
	[Returns Deferral Start Date] [datetime] NOT NULL,
	[Selected Alloc_ Account No_] [nvarchar](20) NOT NULL,
	[Allocation Account No_] [nvarchar](20) NOT NULL,
	[Variant Code] [nvarchar](10) NOT NULL,
	[Bin Code] [nvarchar](20) NOT NULL,
	[Qty_ per Unit of Measure] [decimal](38, 20) NOT NULL,
	[Planned] [tinyint] NOT NULL,
	[Qty_ Rounding Precision] [decimal](38, 20) NOT NULL,
	[Qty_ Rounding Precision (Base)] [decimal](38, 20) NOT NULL,
	[Unit of Measure Code] [nvarchar](10) NOT NULL,
	[Quantity (Base)] [decimal](38, 20) NOT NULL,
	[Outstanding Qty_ (Base)] [decimal](38, 20) NOT NULL,
	[Qty_ to Invoice (Base)] [decimal](38, 20) NOT NULL,
	[Qty_ to Ship (Base)] [decimal](38, 20) NOT NULL,
	[Qty_ Shipped Not Invd_ (Base)] [decimal](38, 20) NOT NULL,
	[Qty_ Shipped (Base)] [decimal](38, 20) NOT NULL,
	[Qty_ Invoiced (Base)] [decimal](38, 20) NOT NULL,
	[FA Posting Date] [datetime] NOT NULL,
	[Depreciation Book Code] [nvarchar](10) NOT NULL,
	[Depr_ until FA Posting Date] [tinyint] NOT NULL,
	[Duplicate in Depreciation Book] [nvarchar](10) NOT NULL,
	[Use Duplication List] [tinyint] NOT NULL,
	[Responsibility Center] [nvarchar](10) NOT NULL,
	[Out-of-Stock Substitution] [tinyint] NOT NULL,
	[Originally Ordered No_] [nvarchar](20) NOT NULL,
	[Originally Ordered Var_ Code] [nvarchar](10) NOT NULL,
	[Cross-Reference No_] [nvarchar](20) NOT NULL,
	[Unit of Measure (Cross Ref_)] [nvarchar](10) NOT NULL,
	[Cross-Reference Type] [int] NOT NULL,
	[Cross-Reference Type No_] [nvarchar](30) NOT NULL,
	[Item Category Code] [nvarchar](20) NOT NULL,
	[Nonstock] [tinyint] NOT NULL,
	[Purchasing Code] [nvarchar](10) NOT NULL,
	[Product Group Code] [nvarchar](10) NOT NULL,
	[Special Order] [tinyint] NOT NULL,
	[Special Order Purchase No_] [nvarchar](20) NOT NULL,
	[Special Order Purch_ Line No_] [int] NOT NULL,
	[Item Reference No_] [nvarchar](50) NOT NULL,
	[Item Reference Unit of Measure] [nvarchar](10) NOT NULL,
	[Item Reference Type] [int] NOT NULL,
	[Item Reference Type No_] [nvarchar](30) NOT NULL,
	[Completely Shipped] [tinyint] NOT NULL,
	[Requested Delivery Date] [datetime] NOT NULL,
	[Promised Delivery Date] [datetime] NOT NULL,
	[Shipping Time] [varchar](32) NOT NULL,
	[Outbound Whse_ Handling Time] [varchar](32) NOT NULL,
	[Planned Delivery Date] [datetime] NOT NULL,
	[Planned Shipment Date] [datetime] NOT NULL,
	[Shipping Agent Code] [nvarchar](10) NOT NULL,
	[Shipping Agent Service Code] [nvarchar](10) NOT NULL,
	[Allow Item Charge Assignment] [tinyint] NOT NULL,
	[Return Qty_ to Receive] [decimal](38, 20) NOT NULL,
	[Return Qty_ to Receive (Base)] [decimal](38, 20) NOT NULL,
	[Return Qty_ Rcd_ Not Invd_] [decimal](38, 20) NOT NULL,
	[Ret_ Qty_ Rcd_ Not Invd_(Base)] [decimal](38, 20) NOT NULL,
	[Return Rcd_ Not Invd_] [decimal](38, 20) NOT NULL,
	[Return Rcd_ Not Invd_ (LCY)] [decimal](38, 20) NOT NULL,
	[Return Qty_ Received] [decimal](38, 20) NOT NULL,
	[Return Qty_ Received (Base)] [decimal](38, 20) NOT NULL,
	[Appl_-from Item Entry] [int] NOT NULL,
	[BOM Item No_] [nvarchar](20) NOT NULL,
	[Return Receipt No_] [nvarchar](20) NOT NULL,
	[Return Receipt Line No_] [int] NOT NULL,
	[Return Reason Code] [nvarchar](10) NOT NULL,
	[Copied From Posted Doc_] [tinyint] NOT NULL,
	[Price Calculation Method] [int] NOT NULL,
	[Allow Line Disc_] [tinyint] NOT NULL,
	[Customer Disc_ Group] [nvarchar](20) NOT NULL,
	[Subtype] [int] NOT NULL,
	[Price description] [nvarchar](80) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[Document Type] ASC,
	[Document No_] ASC,
	[Line No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sell-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Shipment Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Description]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Description 2]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Unit of Measure]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Quantity]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Outstanding Quantity]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Invoice]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Ship]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Price]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Cost (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [VAT _]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Line Discount _]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Line Discount Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Amount Including VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Invoice Disc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Gross Weight]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Net Weight]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Units per Parcel]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Volume]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Appl_-to Item Entry]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 1 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shortcut Dimension 2 Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Price Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Job No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Work Type Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Recalculate Invoice Disc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Outstanding Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Shipped Not Invoiced]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Shipped Not Invoiced]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Quantity Shipped]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Quantity Invoiced]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipment No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Shipment Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Profit _]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Inv_ Discount Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Purchase Order No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Purch_ Order Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Drop Shipment]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Prod_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [VAT Calculation Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transport Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Attached to Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Exit Point]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Area]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Specification]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Category]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Area Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Tax Liable]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Group Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Clause Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Bus_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Prod_ Posting Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Currency Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Outstanding Amount (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Shipped Not Invoiced (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Shipped Not Inv_ (LCY) No VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Reserve]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Blanket Order No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Blanket Order Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [VAT Base Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Cost]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [System-Created Entry]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Line Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [VAT Difference]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Inv_ Disc_ Amount to Invoice]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Identifier]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [IC Partner Ref_ Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [IC Partner Reference]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment _]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Line Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Amt_ Inv_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Amt_ Incl_ VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ VAT Base Amt_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment VAT _]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prepmt_ VAT Calc_ Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment VAT Identifier]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment Tax Area Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prepayment Tax Liable]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Prepayment Tax Group Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt Amt to Deduct]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt Amt Deducted]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prepayment Line]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Amount Inv_ Incl_ VAT]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Amount Inv_ (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [IC Partner Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ VAT Amount Inv_ (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment VAT Difference]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt VAT Diff_ to Deduct]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt VAT Diff_ Deducted]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [IC Item Reference No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Pmt_ Discount Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepmt_ Pmt_ Discount Amount]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Line Discount Calculation]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Dimension Set ID]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Assemble to Order]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Asm_ to Order (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Job Task No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Job Contract Entry No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Deferral Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Returns Deferral Start Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Selected Alloc_ Account No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Allocation Account No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Variant Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bin Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ per Unit of Measure]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Planned]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Rounding Precision]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Rounding Precision (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Unit of Measure Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Quantity (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Outstanding Qty_ (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Invoice (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ to Ship (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Shipped Not Invd_ (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Shipped (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ Invoiced (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [FA Posting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Depreciation Book Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Depr_ until FA Posting Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Duplicate in Depreciation Book]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Use Duplication List]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Responsibility Center]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Out-of-Stock Substitution]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Originally Ordered No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Originally Ordered Var_ Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Cross-Reference No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Unit of Measure (Cross Ref_)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Cross-Reference Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Cross-Reference Type No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Category Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Nonstock]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Purchasing Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Product Group Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Special Order]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Special Order Purchase No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Special Order Purch_ Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Reference No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Reference Unit of Measure]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Item Reference Type]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Reference Type No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Completely Shipped]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Requested Delivery Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Promised Delivery Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Shipping Time]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Outbound Whse_ Handling Time]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Planned Delivery Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Planned Shipment Date]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Service Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Item Charge Assignment]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Qty_ to Receive]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Qty_ to Receive (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Qty_ Rcd_ Not Invd_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Ret_ Qty_ Rcd_ Not Invd_(Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Rcd_ Not Invd_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Rcd_ Not Invd_ (LCY)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Qty_ Received]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Return Qty_ Received (Base)]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Appl_-from Item Entry]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [BOM Item No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Return Receipt No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Return Receipt Line No_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Return Reason Code]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Copied From Posted Doc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Calculation Method]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Line Disc_]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Disc_ Group]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Subtype]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Price description]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$FCL1$Sales Line$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


