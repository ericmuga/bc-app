USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:31:07 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[Customer No_] [nvarchar](20) NOT NULL,
	[Code] [nvarchar](10) NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Name 2] [nvarchar](50) NOT NULL,
	[Address] [nvarchar](100) NOT NULL,
	[Address 2] [nvarchar](50) NOT NULL,
	[City] [nvarchar](30) NOT NULL,
	[Contact] [nvarchar](100) NOT NULL,
	[Phone No_] [nvarchar](30) NOT NULL,
	[Telex No_] [nvarchar](30) NOT NULL,
	[Salesperson Code] [nvarchar](20) NOT NULL,
	[Shipment Method Code] [nvarchar](10) NOT NULL,
	[Shipping Agent Code] [nvarchar](10) NOT NULL,
	[Place of Export] [nvarchar](20) NOT NULL,
	[Country_Region Code] [nvarchar](10) NOT NULL,
	[Last Date Modified] [datetime] NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Fax No_] [nvarchar](30) NOT NULL,
	[Telex Answer Back] [nvarchar](20) NOT NULL,
	[GLN] [nvarchar](13) NOT NULL,
	[Post Code] [nvarchar](20) NOT NULL,
	[County] [nvarchar](30) NOT NULL,
	[E-Mail] [nvarchar](80) NOT NULL,
	[Home Page] [nvarchar](80) NOT NULL,
	[Tax Area Code] [nvarchar](20) NOT NULL,
	[Tax Liable] [tinyint] NOT NULL,
	[Shipping Agent Service Code] [nvarchar](10) NOT NULL,
	[Service Zone Code] [nvarchar](10) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[Customer No_] ASC,
	[Code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Name]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Name 2]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Address]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Address 2]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [City]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Contact]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Phone No_]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Telex No_]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Salesperson Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipment Method Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Place of Export]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Country_Region Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Date Modified]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Fax No_]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Telex Answer Back]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [GLN]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Post Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [County]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [E-Mail]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Home Page]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Area Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Tax Liable]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Service Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Service Zone Code]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Ship-to Address$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


