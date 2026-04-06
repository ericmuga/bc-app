USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:38:57 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[Code] [nvarchar](20) NOT NULL,
	[Name] [nvarchar](50) NOT NULL,
	[Commission _] [decimal](38, 20) NOT NULL,
	[Image] [uniqueidentifier] NOT NULL,
	[Privacy Blocked] [tinyint] NOT NULL,
	[Coupled to CRM] [tinyint] NOT NULL,
	[Global Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Global Dimension 2 Code] [nvarchar](20) NOT NULL,
	[E-Mail] [nvarchar](80) NOT NULL,
	[Phone No_] [nvarchar](30) NOT NULL,
	[Job Title] [nvarchar](30) NOT NULL,
	[Search E-Mail] [nvarchar](80) NOT NULL,
	[E-Mail 2] [nvarchar](80) NOT NULL,
	[Blocked] [tinyint] NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[Code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Name]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Commission _]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Image]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Privacy Blocked]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Coupled to CRM]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 1 Code]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 2 Code]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [E-Mail]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Phone No_]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Job Title]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Search E-Mail]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [E-Mail 2]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Blocked]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Salesperson_Purchaser$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


