USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba]    Script Date: 4/5/2026 8:27:37 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Document Type] [int] NOT NULL,
	[Posting Date] [datetime] NOT NULL,
	[Shipment Date] [datetime] NOT NULL,
	[Sell-to Customer No_] [nvarchar](20) NOT NULL,
	[Sell-to Customer Name] [nvarchar](100) NOT NULL,
	[Bill-to Customer No_] [nvarchar](20) NOT NULL,
	[Bill-to Customer Name] [nvarchar](100) NOT NULL,
	[Salesperson Code] [nvarchar](20) NOT NULL,
	[Salesperson Default Location] [nvarchar](10) NOT NULL,
	[External Document No_] [nvarchar](35) NOT NULL,
	[Your Reference] [nvarchar](35) NOT NULL,
	[Route Code] [nvarchar](100) NOT NULL,
	[Buyer ID_Card No_] [nvarchar](20) NOT NULL,
	[Shortcut Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Shortcut Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Payment Method Code] [nvarchar](10) NOT NULL,
	[Payment Terms Code] [nvarchar](10) NOT NULL,
	[Executed By] [nvarchar](50) NOT NULL,
	[Execution Date] [datetime] NOT NULL,
	[Execution Time] [datetime] NOT NULL,
	[Order Date] [datetime] NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Sell-to Address] [nvarchar](100) NOT NULL,
	[Sell-to City] [nvarchar](30) NOT NULL,
	[Ship-to Name] [nvarchar](100) NOT NULL,
	[Ship-to Address] [nvarchar](100) NOT NULL,
	[Packing List No_] [nvarchar](20) NOT NULL,
	[Cust_ Ref No_] [nvarchar](100) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$PK] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$PDA Order Header Archive$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


