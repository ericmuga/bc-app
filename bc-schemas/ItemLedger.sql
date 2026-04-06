USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:41:50 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[Entry No_] [int] NOT NULL,
	[Item No_] [nvarchar](20) NOT NULL,
	[Posting Date] [datetime] NOT NULL,
	[Entry Type] [int] NOT NULL,
	[Source No_] [nvarchar](20) NOT NULL,
	[Document No_] [nvarchar](20) NOT NULL,
	[Description] [nvarchar](100) NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Quantity] [decimal](38, 20) NOT NULL,
	[Remaining Quantity] [decimal](38, 20) NOT NULL,
	[Invoiced Quantity] [decimal](38, 20) NOT NULL,
	[Applies-to Entry] [int] NOT NULL,
	[Open] [tinyint] NOT NULL,
	[Global Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Global Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Positive] [tinyint] NOT NULL,
	[Shpt_ Method Code] [nvarchar](10) NOT NULL,
	[Source Type] [int] NOT NULL,
	[Drop Shipment] [tinyint] NOT NULL,
	[Transaction Type] [nvarchar](10) NOT NULL,
	[Transport Method] [nvarchar](10) NOT NULL,
	[Country_Region Code] [nvarchar](10) NOT NULL,
	[Entry_Exit Point] [nvarchar](10) NOT NULL,
	[Document Date] [datetime] NOT NULL,
	[External Document No_] [nvarchar](35) NOT NULL,
	[Area] [nvarchar](10) NOT NULL,
	[Transaction Specification] [nvarchar](10) NOT NULL,
	[No_ Series] [nvarchar](20) NOT NULL,
	[Document Type] [int] NOT NULL,
	[Document Line No_] [int] NOT NULL,
	[Order Type] [int] NOT NULL,
	[Order No_] [nvarchar](20) NOT NULL,
	[Order Line No_] [int] NOT NULL,
	[Dimension Set ID] [int] NOT NULL,
	[Assemble to Order] [tinyint] NOT NULL,
	[Job No_] [nvarchar](20) NOT NULL,
	[Job Task No_] [nvarchar](20) NOT NULL,
	[Job Purchase] [tinyint] NOT NULL,
	[Variant Code] [nvarchar](10) NOT NULL,
	[Qty_ per Unit of Measure] [decimal](38, 20) NOT NULL,
	[Unit of Measure Code] [nvarchar](10) NOT NULL,
	[Derived from Blanket Order] [tinyint] NOT NULL,
	[Cross-Reference No_] [nvarchar](20) NOT NULL,
	[Originally Ordered No_] [nvarchar](20) NOT NULL,
	[Originally Ordered Var_ Code] [nvarchar](10) NOT NULL,
	[Out-of-Stock Substitution] [tinyint] NOT NULL,
	[Item Category Code] [nvarchar](20) NOT NULL,
	[Nonstock] [tinyint] NOT NULL,
	[Purchasing Code] [nvarchar](10) NOT NULL,
	[Product Group Code] [nvarchar](10) NOT NULL,
	[Item Reference No_] [nvarchar](50) NOT NULL,
	[Completely Invoiced] [tinyint] NOT NULL,
	[Last Invoice Date] [datetime] NOT NULL,
	[Applied Entry to Adjust] [tinyint] NOT NULL,
	[Correction] [tinyint] NOT NULL,
	[Shipped Qty_ Not Returned] [decimal](38, 20) NOT NULL,
	[Prod_ Order Comp_ Line No_] [int] NOT NULL,
	[Serial No_] [nvarchar](50) NOT NULL,
	[Lot No_] [nvarchar](50) NOT NULL,
	[Warranty Date] [datetime] NOT NULL,
	[Expiration Date] [datetime] NOT NULL,
	[Item Tracking] [int] NOT NULL,
	[Package No_] [nvarchar](50) NOT NULL,
	[Return Reason Code] [nvarchar](10) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[Entry No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Posting Date]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Entry Type]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Source No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Document No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Description]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Quantity]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Remaining Quantity]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Invoiced Quantity]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Applies-to Entry]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Open]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 1 Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 2 Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Positive]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shpt_ Method Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Source Type]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Drop Shipment]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Type]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transport Method]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Country_Region Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Entry_Exit Point]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Document Date]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [External Document No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Area]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Transaction Specification]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ Series]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Document Type]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Document Line No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Order Type]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Order No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Order Line No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Dimension Set ID]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Assemble to Order]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Job No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Job Task No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Job Purchase]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Variant Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Qty_ per Unit of Measure]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Unit of Measure Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Derived from Blanket Order]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Cross-Reference No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Originally Ordered No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Originally Ordered Var_ Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Out-of-Stock Substitution]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Category Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Nonstock]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Purchasing Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Product Group Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Reference No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Completely Invoiced]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Invoice Date]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Applied Entry to Adjust]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Correction]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Shipped Qty_ Not Returned]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prod_ Order Comp_ Line No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Serial No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Lot No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Warranty Date]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Expiration Date]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Item Tracking]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Package No_]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Return Reason Code]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item Ledger Entry$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


