USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:28:53 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Item G_L Budget Account$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Item Duty$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Item Empty No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Export$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Product Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Allow Customer Disc_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Weight per Piece$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[PDA Item$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Weekly Usage$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Unit Price (Sales Unit)$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Fixed Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Default Department Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Production Plan Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Has Open Outbound Entry$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Bar Code Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Bar Code No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](15) NOT NULL,
	[Bar Code Text$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](40) NOT NULL,
	[Shadow Cost$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Reset Flag$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Direct Sales Item$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Production Category$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Label Category$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Frozen Temperature$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Chilled Temperature$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Arabic Name$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Item Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Part No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Approval Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Slaughter Charge$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Inspection Charge$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Service Transaction Type Code$e2ae191d-8829-44c3-a373-3749a2742d4d] [nvarchar](20) NOT NULL,
	[Exclude From Service Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d] [tinyint] NOT NULL,
	[Exclude from Intrastat Report$70912191-3c4c-49fc-a1de-bc6ea1ac9da6] [tinyint] NOT NULL,
	[Supplementary Unit of Measure$70912191-3c4c-49fc-a1de-bc6ea1ac9da6] [nvarchar](10) NOT NULL,
	[Has Sales Forecast$c526b3e9-b8ca-4683-81ba-fcd5f6b1472a] [tinyint] NOT NULL,
	[Third Party$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[FCL No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[CM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[RMK No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Packaging Unit code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Quantity Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Item Class code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[E-Tims Item Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Forward Enabled$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Forward Item No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Forward Production BOM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Forward Routing No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Forward Loss Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Forward Loss Value$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Forward Auto Post$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Forward Max Hops$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Forward Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Forward Bin Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Forward Cascade On Partial$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Backward Enabled$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Backward Item No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Backward Production BOM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Backward Routing No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Backward Loss Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Backward Loss Value$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Backward Auto Post$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Backward Max Hops$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Backward Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Backward Bin Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
 CONSTRAINT [CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Item G_L Budget Account$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Item Duty$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Item Empty No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Export$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Product Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Allow Customer Disc_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Weight per Piece$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PDA Item$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Weekly Usage$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Unit Price (Sales Unit)$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Fixed Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Default Department Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Production Plan Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Has Open Outbound Entry$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Bar Code Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Bar Code No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Bar Code Text$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Shadow Cost$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Reset Flag$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Direct Sales Item$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Production Category$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Label Category$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Frozen Temperature$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Chilled Temperature$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Arabic Name$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Item Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Part No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Approval Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Slaughter Charge$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Inspection Charge$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Service Transaction Type Code$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Exclude From Service Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Exclude from Intrastat Report$70912191-3c4c-49fc-a1de-bc6ea1ac9da6]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Supplementary Unit of Measure$70912191-3c4c-49fc-a1de-bc6ea1ac9da6]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Has Sales Forecast$c526b3e9-b8ca-4683-81ba-fcd5f6b1472a]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Third Party$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [FCL No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [RMK No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Packaging Unit code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Quantity Unit Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Item Class code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [E-Tims Item Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Forward Enabled$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Forward Item No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Forward Production BOM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Forward Routing No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Forward Loss Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Forward Loss Value$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Forward Auto Post$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Forward Max Hops$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Forward Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Forward Bin Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Forward Cascade On Partial$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Backward Enabled$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Backward Item No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Backward Production BOM No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Backward Routing No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Backward Loss Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Backward Loss Value$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Backward Auto Post$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Backward Max Hops$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Backward Location Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Backward Bin Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO


