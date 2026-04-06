USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba]    Script Date: 4/5/2026 8:27:52 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba](
	[timestamp] [timestamp] NOT NULL,
	[Document No_] [nvarchar](20) NOT NULL,
	[Line No_] [int] NOT NULL,
	[Type] [int] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Description] [nvarchar](100) NOT NULL,
	[Quantity] [decimal](38, 20) NOT NULL,
	[Quantity (Base)] [decimal](38, 20) NOT NULL,
	[Order Quantity] [decimal](38, 20) NOT NULL,
	[Unit of Measure Code] [nvarchar](10) NOT NULL,
	[Unit Price] [decimal](38, 20) NOT NULL,
	[Line Discount _] [decimal](38, 20) NOT NULL,
	[Line Discount Amount] [decimal](38, 20) NOT NULL,
	[Amount] [decimal](38, 20) NOT NULL,
	[Amount Including VAT] [decimal](38, 20) NOT NULL,
	[VAT _] [decimal](38, 20) NOT NULL,
	[Shortcut Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Shortcut Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Source Location Code] [nvarchar](10) NOT NULL,
	[Destination Location Code] [nvarchar](10) NOT NULL,
	[Shipment Date] [datetime] NOT NULL,
	[Posting Group] [nvarchar](20) NOT NULL,
	[Salesperson Code] [nvarchar](20) NOT NULL,
	[Sell-to Customer No_] [nvarchar](20) NOT NULL,
	[Unit of Measure (Base)] [nvarchar](10) NOT NULL,
	[Qty_ per Unit of Measure] [decimal](38, 20) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$PK] PRIMARY KEY CLUSTERED 
(
	[Document No_] ASC,
	[Line No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Line Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


