USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]    Script Date: 4/5/2026 8:32:03 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba](
	[timestamp] [timestamp] NOT NULL,
	[Code] [nvarchar](50) NOT NULL,
	[Description] [nvarchar](30) NOT NULL,
	[Pay Bill] [nvarchar](100) NOT NULL,
	[Country_Region Code] [nvarchar](30) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
	[Type] [int] NOT NULL,
 CONSTRAINT [CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$Key1] PRIMARY KEY CLUSTERED 
(
	[Code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  DEFAULT (N'') FOR [Description]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  DEFAULT (N'') FOR [Pay Bill]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  DEFAULT (N'') FOR [Country_Region Code]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  CONSTRAINT [MDF$CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO

ALTER TABLE [dbo].[CM3$District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] ADD  DEFAULT ((0)) FOR [Type]
GO


