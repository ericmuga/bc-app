USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:23:59 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[Document Type] [int] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[PDA Order$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[PartA$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[PartB$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Packing List No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Executed By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](35) NOT NULL,
	[Execution Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Execution Time$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Ended By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](35) NOT NULL,
	[Buyer ID_Card No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[PackingListACopies$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[PackingListBCopies$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Order Receiver$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Export$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[ParkingListAFlag$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[ParkingListBFlag$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Pay Bill$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[QRCode$23dc970e-11e8-4d9b-8613-b7582aec86ba] [image] NULL,
	[CUNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[CUInvoiceNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[SignedAt$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[SignTime$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[TCO$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Print Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Cancelled By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[WMS Order No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Sales Order BOT$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Sales Order Portal$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[WMS Invoice No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[QR Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Sector$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Load to Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[WHT VAT$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Shipment Confirmed Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Shipment Confirmed By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[ShiptoName$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Cust_ Ref No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d] [tinyint] NOT NULL,
	[Shpfy Order Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [bigint] NOT NULL,
	[Shpfy Order No_$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [nvarchar](50) NOT NULL,
	[Shpfy Refund Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [bigint] NOT NULL,
	[CUSerialNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Select$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[DeliveryBool$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[pinOfBuyer$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Tax Applied Document No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Customer Contact No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[buyerName$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Posted to eTims$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[QRCodeurl$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[rcptSign$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[qrData$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[pdfPath$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[EtimsNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Job No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Job Task No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[PDA Executed$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
 CONSTRAINT [FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[Document Type] ASC,
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PDA Order$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PartA$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PartB$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Packing List No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Executed By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Execution Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Execution Time$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Ended By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Buyer ID_Card No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PackingListACopies$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PackingListBCopies$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Order Receiver$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Export$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [ParkingListAFlag$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [ParkingListBFlag$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Pay Bill$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CUNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CUInvoiceNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [SignedAt$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [SignTime$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [TCO$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Print Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Cancelled By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [WMS Order No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Sales Order BOT$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Sales Order Portal$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [WMS Invoice No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [QR Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Sector$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Load to Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [WHT VAT$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Shipment Confirmed Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Shipment Confirmed By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [ShiptoName$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Cust_ Ref No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Shpfy Order Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Shpfy Order No_$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Shpfy Refund Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CUSerialNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Select$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [DeliveryBool$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [pinOfBuyer$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Tax Applied Document No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Customer Contact No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [buyerName$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Posted to eTims$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [QRCodeurl$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [rcptSign$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [qrData$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [pdfPath$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [EtimsNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Job No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Job Task No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [PDA Executed$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO


