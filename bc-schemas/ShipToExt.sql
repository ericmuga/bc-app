USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:31:24 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[Customer No_] [nvarchar](20) NOT NULL,
	[Code] [nvarchar](10) NOT NULL,
	[Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
 CONSTRAINT [CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[Customer No_] ASC,
	[Code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Route Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO


