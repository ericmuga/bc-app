USE [FCL]
GO

/****** Object:  Table [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba]    Script Date: 4/5/2026 8:40:16 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba](
	[timestamp] [timestamp] NOT NULL,
	[Entry No_] [int] NOT NULL,
	[Code] [nvarchar](20) NOT NULL,
	[Parent Metric] [nvarchar](20) NOT NULL,
	[Type] [int] NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$Key1] PRIMARY KEY CLUSTERED 
(
	[Entry No_] ASC,
	[Code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$Customer Metrics$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


