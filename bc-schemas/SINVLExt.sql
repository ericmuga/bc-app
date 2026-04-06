USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:25:31 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[Document No_] [nvarchar](20) NOT NULL,
	[Line No_] [int] NOT NULL,
	[Customer Specification$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Salesperson Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Cust_ Statistics Group$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Label Text$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Customer Order No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[PDA Order$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Ship-to Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Assigned User ID$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Executed By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Execution Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Execution Time$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Ended By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Order Quantity$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[No_ of Parcels$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Parcel Serial No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Line Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Service Transaction Type Code$e2ae191d-8829-44c3-a373-3749a2742d4d] [nvarchar](20) NOT NULL,
	[Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d] [tinyint] NOT NULL,
	[Shpfy Order Line Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [bigint] NOT NULL,
	[Shpfy Order No_$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [nvarchar](50) NOT NULL,
	[etims Item Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[eTims VAT Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Sell-to Customer Name$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Packaging Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Quantity Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Item Class Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
 CONSTRAINT [FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[Document No_] ASC,
	[Line No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Customer Specification$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Salesperson Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Cust_ Statistics Group$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Label Text$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Customer Order No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PDA Order$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Ship-to Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Assigned User ID$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Executed By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Execution Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Execution Time$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Ended By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Order Quantity$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [No_ of Parcels$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Parcel Serial No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Line Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Service Transaction Type Code$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Shpfy Order Line Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Shpfy Order No_$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [etims Item Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [eTims VAT Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Sell-to Customer Name$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Packaging Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Quantity Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Item Class Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO


