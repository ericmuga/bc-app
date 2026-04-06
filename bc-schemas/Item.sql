USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:28:40 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[No_ 2] [nvarchar](20) NOT NULL,
	[Description] [nvarchar](100) NOT NULL,
	[Search Description] [nvarchar](100) NOT NULL,
	[Description 2] [nvarchar](50) NOT NULL,
	[Base Unit of Measure] [nvarchar](10) NOT NULL,
	[Price Unit Conversion] [int] NOT NULL,
	[Type] [int] NOT NULL,
	[Inventory Posting Group] [nvarchar](20) NOT NULL,
	[Shelf No_] [nvarchar](10) NOT NULL,
	[Item Disc_ Group] [nvarchar](20) NOT NULL,
	[Allow Invoice Disc_] [tinyint] NOT NULL,
	[Statistics Group] [int] NOT NULL,
	[Commission Group] [int] NOT NULL,
	[Unit Price] [decimal](38, 20) NOT NULL,
	[Price_Profit Calculation] [int] NOT NULL,
	[Profit _] [decimal](38, 20) NOT NULL,
	[Costing Method] [int] NOT NULL,
	[Unit Cost] [decimal](38, 20) NOT NULL,
	[Standard Cost] [decimal](38, 20) NOT NULL,
	[Last Direct Cost] [decimal](38, 20) NOT NULL,
	[Indirect Cost _] [decimal](38, 20) NOT NULL,
	[Cost is Adjusted] [tinyint] NOT NULL,
	[Allow Online Adjustment] [tinyint] NOT NULL,
	[Vendor No_] [nvarchar](20) NOT NULL,
	[Vendor Item No_] [nvarchar](50) NOT NULL,
	[Lead Time Calculation] [varchar](32) NOT NULL,
	[Reorder Point] [decimal](38, 20) NOT NULL,
	[Maximum Inventory] [decimal](38, 20) NOT NULL,
	[Reorder Quantity] [decimal](38, 20) NOT NULL,
	[Alternative Item No_] [nvarchar](20) NOT NULL,
	[Unit List Price] [decimal](38, 20) NOT NULL,
	[Duty Due _] [decimal](38, 20) NOT NULL,
	[Duty Code] [nvarchar](10) NOT NULL,
	[Gross Weight] [decimal](38, 20) NOT NULL,
	[Net Weight] [decimal](38, 20) NOT NULL,
	[Units per Parcel] [decimal](38, 20) NOT NULL,
	[Unit Volume] [decimal](38, 20) NOT NULL,
	[Durability] [nvarchar](10) NOT NULL,
	[Freight Type] [nvarchar](10) NOT NULL,
	[Tariff No_] [nvarchar](20) NOT NULL,
	[Duty Unit Conversion] [decimal](38, 20) NOT NULL,
	[Country_Region Purchased Code] [nvarchar](10) NOT NULL,
	[Budget Quantity] [decimal](38, 20) NOT NULL,
	[Budgeted Amount] [decimal](38, 20) NOT NULL,
	[Budget Profit] [decimal](38, 20) NOT NULL,
	[Blocked] [tinyint] NOT NULL,
	[Block Reason] [nvarchar](250) NOT NULL,
	[Last DateTime Modified] [datetime] NOT NULL,
	[Last Date Modified] [datetime] NOT NULL,
	[Last Time Modified] [datetime] NOT NULL,
	[Price Includes VAT] [tinyint] NOT NULL,
	[VAT Bus_ Posting Gr_ (Price)] [nvarchar](20) NOT NULL,
	[Gen_ Prod_ Posting Group] [nvarchar](20) NOT NULL,
	[Picture] [uniqueidentifier] NOT NULL,
	[Country_Region of Origin Code] [nvarchar](10) NOT NULL,
	[Automatic Ext_ Texts] [tinyint] NOT NULL,
	[No_ Series] [nvarchar](20) NOT NULL,
	[Tax Group Code] [nvarchar](20) NOT NULL,
	[VAT Prod_ Posting Group] [nvarchar](20) NOT NULL,
	[Reserve] [int] NOT NULL,
	[Global Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Global Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Stockout Warning] [int] NOT NULL,
	[Prevent Negative Inventory] [int] NOT NULL,
	[Variant Mandatory if Exists] [int] NOT NULL,
	[Application Wksh_ User ID] [nvarchar](128) NOT NULL,
	[Coupled to CRM] [tinyint] NOT NULL,
	[Assembly Policy] [int] NOT NULL,
	[GTIN] [nvarchar](14) NOT NULL,
	[Default Deferral Template Code] [nvarchar](10) NOT NULL,
	[Low-Level Code] [int] NOT NULL,
	[Lot Size] [decimal](38, 20) NOT NULL,
	[Serial Nos_] [nvarchar](20) NOT NULL,
	[Last Unit Cost Calc_ Date] [datetime] NOT NULL,
	[Rolled-up Material Cost] [decimal](38, 20) NOT NULL,
	[Rolled-up Capacity Cost] [decimal](38, 20) NOT NULL,
	[Scrap _] [decimal](38, 20) NOT NULL,
	[Inventory Value Zero] [tinyint] NOT NULL,
	[Discrete Order Quantity] [int] NOT NULL,
	[Minimum Order Quantity] [decimal](38, 20) NOT NULL,
	[Maximum Order Quantity] [decimal](38, 20) NOT NULL,
	[Safety Stock Quantity] [decimal](38, 20) NOT NULL,
	[Order Multiple] [decimal](38, 20) NOT NULL,
	[Safety Lead Time] [varchar](32) NOT NULL,
	[Flushing Method] [int] NOT NULL,
	[Replenishment System] [int] NOT NULL,
	[Rounding Precision] [decimal](38, 20) NOT NULL,
	[Sales Unit of Measure] [nvarchar](10) NOT NULL,
	[Purch_ Unit of Measure] [nvarchar](10) NOT NULL,
	[Time Bucket] [varchar](32) NOT NULL,
	[Reordering Policy] [int] NOT NULL,
	[Include Inventory] [tinyint] NOT NULL,
	[Manufacturing Policy] [int] NOT NULL,
	[Rescheduling Period] [varchar](32) NOT NULL,
	[Lot Accumulation Period] [varchar](32) NOT NULL,
	[Dampener Period] [varchar](32) NOT NULL,
	[Dampener Quantity] [decimal](38, 20) NOT NULL,
	[Overflow Level] [decimal](38, 20) NOT NULL,
	[Manufacturer Code] [nvarchar](10) NOT NULL,
	[Item Category Code] [nvarchar](20) NOT NULL,
	[Created From Nonstock Item] [tinyint] NOT NULL,
	[Product Group Code] [nvarchar](10) NOT NULL,
	[Purchasing Code] [nvarchar](10) NOT NULL,
	[Excluded from Cost Adjustment] [tinyint] NOT NULL,
	[Service Item Group] [nvarchar](10) NOT NULL,
	[Item Tracking Code] [nvarchar](10) NOT NULL,
	[Lot Nos_] [nvarchar](20) NOT NULL,
	[Expiration Calculation] [varchar](32) NOT NULL,
	[Warehouse Class Code] [nvarchar](10) NOT NULL,
	[Special Equipment Code] [nvarchar](10) NOT NULL,
	[Put-away Template Code] [nvarchar](10) NOT NULL,
	[Put-away Unit of Measure Code] [nvarchar](10) NOT NULL,
	[Phys Invt Counting Period Code] [nvarchar](10) NOT NULL,
	[Last Counting Period Update] [datetime] NOT NULL,
	[Use Cross-Docking] [tinyint] NOT NULL,
	[Next Counting Start Date] [datetime] NOT NULL,
	[Next Counting End Date] [datetime] NOT NULL,
	[Id] [uniqueidentifier] NOT NULL,
	[Unit of Measure Id] [uniqueidentifier] NOT NULL,
	[Tax Group Id] [uniqueidentifier] NOT NULL,
	[Sales Blocked] [tinyint] NOT NULL,
	[Purchasing Blocked] [tinyint] NOT NULL,
	[Item Category Id] [uniqueidentifier] NOT NULL,
	[Inventory Posting Group Id] [uniqueidentifier] NOT NULL,
	[Gen_ Prod_ Posting Group Id] [uniqueidentifier] NOT NULL,
	[Service Blocked] [tinyint] NOT NULL,
	[Over-Receipt Code] [nvarchar](20) NOT NULL,
	[Routing No_] [nvarchar](20) NOT NULL,
	[Production BOM No_] [nvarchar](20) NOT NULL,
	[Single-Level Material Cost] [decimal](38, 20) NOT NULL,
	[Single-Level Capacity Cost] [decimal](38, 20) NOT NULL,
	[Single-Level Subcontrd_ Cost] [decimal](38, 20) NOT NULL,
	[Single-Level Cap_ Ovhd Cost] [decimal](38, 20) NOT NULL,
	[Single-Level Mfg_ Ovhd Cost] [decimal](38, 20) NOT NULL,
	[Overhead Rate] [decimal](38, 20) NOT NULL,
	[Rolled-up Subcontracted Cost] [decimal](38, 20) NOT NULL,
	[Rolled-up Mfg_ Ovhd Cost] [decimal](38, 20) NOT NULL,
	[Rolled-up Cap_ Overhead Cost] [decimal](38, 20) NOT NULL,
	[Order Tracking Policy] [int] NOT NULL,
	[Critical] [tinyint] NOT NULL,
	[Common Item No_] [nvarchar](20) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ 2]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Description]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Search Description]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Description 2]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Base Unit of Measure]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Unit Conversion]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Type]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Inventory Posting Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shelf No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Disc_ Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Invoice Disc_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Statistics Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Commission Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Price]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price_Profit Calculation]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Profit _]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Costing Method]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Standard Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Last Direct Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Indirect Cost _]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Cost is Adjusted]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Online Adjustment]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Vendor No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Vendor Item No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Lead Time Calculation]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Reorder Point]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Maximum Inventory]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Reorder Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Alternative Item No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit List Price]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Duty Due _]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Duty Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Gross Weight]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Net Weight]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Units per Parcel]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Unit Volume]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Durability]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Freight Type]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tariff No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Duty Unit Conversion]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Country_Region Purchased Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Budget Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Budgeted Amount]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Budget Profit]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Blocked]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Block Reason]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last DateTime Modified]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Date Modified]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Time Modified]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Includes VAT]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Bus_ Posting Gr_ (Price)]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Prod_ Posting Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Picture]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Country_Region of Origin Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Automatic Ext_ Texts]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ Series]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Group Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Prod_ Posting Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Reserve]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 1 Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 2 Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Stockout Warning]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prevent Negative Inventory]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Variant Mandatory if Exists]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Application Wksh_ User ID]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Coupled to CRM]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Assembly Policy]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [GTIN]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Default Deferral Template Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Low-Level Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Lot Size]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Serial Nos_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Unit Cost Calc_ Date]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rolled-up Material Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rolled-up Capacity Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Scrap _]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Inventory Value Zero]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Discrete Order Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Minimum Order Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Maximum Order Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Safety Stock Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Order Multiple]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Safety Lead Time]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Flushing Method]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Replenishment System]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rounding Precision]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Sales Unit of Measure]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Purch_ Unit of Measure]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Time Bucket]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Reordering Policy]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Include Inventory]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Manufacturing Policy]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Rescheduling Period]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Lot Accumulation Period]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Dampener Period]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Dampener Quantity]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Overflow Level]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Manufacturer Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Category Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Created From Nonstock Item]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Product Group Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Purchasing Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Excluded from Cost Adjustment]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Service Item Group]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Item Tracking Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Lot Nos_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Expiration Calculation]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Warehouse Class Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Special Equipment Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Put-away Template Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Put-away Unit of Measure Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Phys Invt Counting Period Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Counting Period Update]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Use Cross-Docking]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Next Counting Start Date]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Next Counting End Date]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Unit of Measure Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Tax Group Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Sales Blocked]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Purchasing Blocked]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Item Category Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Inventory Posting Group Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Gen_ Prod_ Posting Group Id]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Service Blocked]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Over-Receipt Code]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Routing No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Production BOM No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Single-Level Material Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Single-Level Capacity Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Single-Level Subcontrd_ Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Single-Level Cap_ Ovhd Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Single-Level Mfg_ Ovhd Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Overhead Rate]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rolled-up Subcontracted Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rolled-up Mfg_ Ovhd Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Rolled-up Cap_ Overhead Cost]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Order Tracking Policy]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Critical]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Common Item No_]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


