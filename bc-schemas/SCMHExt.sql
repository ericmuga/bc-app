USE [FCL]
GO

/****** Object:  Table [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:22:52 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Pay Bill$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[QRCode$23dc970e-11e8-4d9b-8613-b7582aec86ba] [image] NULL,
	[CUNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[CUInvoiceNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[SignedAt$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[SignTime$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d] [tinyint] NOT NULL,
	[Shpfy Refund Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb] [bigint] NOT NULL,
	[pinOfBuyer$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Tax Applied Document No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[Customer Contact No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[buyerName$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Posted to eTims$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[QRCodeurl$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[rcptSign$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[pdfPath$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[qrData$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](250) NOT NULL,
	[EtimsNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Job No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Job Task No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
 CONSTRAINT [FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Pay Bill$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CUNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [CUInvoiceNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [SignedAt$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [SignTime$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Applicable For Serv_ Decl_$e2ae191d-8829-44c3-a373-3749a2742d4d]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Shpfy Refund Id$ec255f57-31d0-4ca2-b751-f2fa7c745abb]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [pinOfBuyer$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Tax Applied Document No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Customer Contact No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [buyerName$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Posted to eTims$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [QRCodeurl$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [rcptSign$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [pdfPath$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [qrData$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [EtimsNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Job No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[FCL1$Sales Cr_Memo Header$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Job Task No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO


