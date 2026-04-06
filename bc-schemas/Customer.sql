USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972]    Script Date: 4/5/2026 8:29:52 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Name] [nvarchar](100) NOT NULL,
	[Search Name] [nvarchar](100) NOT NULL,
	[Name 2] [nvarchar](50) NOT NULL,
	[Address] [nvarchar](100) NOT NULL,
	[Address 2] [nvarchar](50) NOT NULL,
	[City] [nvarchar](30) NOT NULL,
	[Contact] [nvarchar](100) NOT NULL,
	[Phone No_] [nvarchar](30) NOT NULL,
	[Telex No_] [nvarchar](20) NOT NULL,
	[Document Sending Profile] [nvarchar](20) NOT NULL,
	[Ship-to Code] [nvarchar](10) NOT NULL,
	[Our Account No_] [nvarchar](20) NOT NULL,
	[Territory Code] [nvarchar](10) NOT NULL,
	[Global Dimension 1 Code] [nvarchar](20) NOT NULL,
	[Global Dimension 2 Code] [nvarchar](20) NOT NULL,
	[Chain Name] [nvarchar](10) NOT NULL,
	[Budgeted Amount] [decimal](38, 20) NOT NULL,
	[Credit Limit (LCY)] [decimal](38, 20) NOT NULL,
	[Customer Posting Group] [nvarchar](20) NOT NULL,
	[Currency Code] [nvarchar](10) NOT NULL,
	[Customer Price Group] [nvarchar](10) NOT NULL,
	[Language Code] [nvarchar](10) NOT NULL,
	[Registration Number] [nvarchar](50) NOT NULL,
	[Statistics Group] [int] NOT NULL,
	[Payment Terms Code] [nvarchar](10) NOT NULL,
	[Fin_ Charge Terms Code] [nvarchar](10) NOT NULL,
	[Salesperson Code] [nvarchar](20) NOT NULL,
	[Shipment Method Code] [nvarchar](10) NOT NULL,
	[Shipping Agent Code] [nvarchar](10) NOT NULL,
	[Place of Export] [nvarchar](20) NOT NULL,
	[Invoice Disc_ Code] [nvarchar](20) NOT NULL,
	[Customer Disc_ Group] [nvarchar](20) NOT NULL,
	[Country_Region Code] [nvarchar](10) NOT NULL,
	[Collection Method] [nvarchar](20) NOT NULL,
	[Amount] [decimal](38, 20) NOT NULL,
	[Blocked] [int] NOT NULL,
	[Invoice Copies] [int] NOT NULL,
	[Last Statement No_] [int] NOT NULL,
	[Print Statements] [tinyint] NOT NULL,
	[Bill-to Customer No_] [nvarchar](20) NOT NULL,
	[Priority] [int] NOT NULL,
	[Payment Method Code] [nvarchar](10) NOT NULL,
	[Format Region] [nvarchar](80) NOT NULL,
	[Last Modified Date Time] [datetime] NOT NULL,
	[Last Date Modified] [datetime] NOT NULL,
	[Application Method] [int] NOT NULL,
	[Prices Including VAT] [tinyint] NOT NULL,
	[Location Code] [nvarchar](10) NOT NULL,
	[Fax No_] [nvarchar](30) NOT NULL,
	[Telex Answer Back] [nvarchar](20) NOT NULL,
	[VAT Registration No_] [nvarchar](20) NOT NULL,
	[Combine Shipments] [tinyint] NOT NULL,
	[Gen_ Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[Picture] [image] NULL,
	[GLN] [nvarchar](13) NOT NULL,
	[Post Code] [nvarchar](20) NOT NULL,
	[County] [nvarchar](30) NOT NULL,
	[EORI Number] [nvarchar](40) NOT NULL,
	[Use GLN in Electronic Document] [tinyint] NOT NULL,
	[E-Mail] [nvarchar](80) NOT NULL,
	[Home Page] [nvarchar](80) NOT NULL,
	[Reminder Terms Code] [nvarchar](10) NOT NULL,
	[No_ Series] [nvarchar](20) NOT NULL,
	[Tax Area Code] [nvarchar](20) NOT NULL,
	[Tax Liable] [tinyint] NOT NULL,
	[VAT Bus_ Posting Group] [nvarchar](20) NOT NULL,
	[Reserve] [int] NOT NULL,
	[Block Payment Tolerance] [tinyint] NOT NULL,
	[IC Partner Code] [nvarchar](20) NOT NULL,
	[Prepayment _] [decimal](38, 20) NOT NULL,
	[Partner Type] [int] NOT NULL,
	[Intrastat Partner Type] [int] NOT NULL,
	[Exclude from Pmt_ Practices] [tinyint] NOT NULL,
	[Image] [uniqueidentifier] NOT NULL,
	[Privacy Blocked] [tinyint] NOT NULL,
	[Disable Search by Name] [tinyint] NOT NULL,
	[Allow Multiple Posting Groups] [tinyint] NOT NULL,
	[Preferred Bank Account Code] [nvarchar](20) NOT NULL,
	[Coupled to CRM] [tinyint] NOT NULL,
	[Cash Flow Payment Terms Code] [nvarchar](10) NOT NULL,
	[Primary Contact No_] [nvarchar](20) NOT NULL,
	[Contact Type] [int] NOT NULL,
	[Mobile Phone No_] [nvarchar](30) NOT NULL,
	[Responsibility Center] [nvarchar](10) NOT NULL,
	[Shipping Advice] [int] NOT NULL,
	[Shipping Time] [varchar](32) NOT NULL,
	[Shipping Agent Service Code] [nvarchar](10) NOT NULL,
	[Service Zone Code] [nvarchar](10) NOT NULL,
	[Price Calculation Method] [int] NOT NULL,
	[Allow Line Disc_] [tinyint] NOT NULL,
	[Base Calendar Code] [nvarchar](10) NOT NULL,
	[Copy Sell-to Addr_ to Qte From] [int] NOT NULL,
	[Validate EU Vat Reg_ No_] [tinyint] NOT NULL,
	[Id] [uniqueidentifier] NOT NULL,
	[Currency Id] [uniqueidentifier] NOT NULL,
	[Payment Terms Id] [uniqueidentifier] NOT NULL,
	[Shipment Method Id] [uniqueidentifier] NOT NULL,
	[Payment Method Id] [uniqueidentifier] NOT NULL,
	[Tax Area ID] [uniqueidentifier] NOT NULL,
	[Contact ID] [uniqueidentifier] NOT NULL,
	[Contact Graph Id] [nvarchar](250) NOT NULL,
	[$systemId] [uniqueidentifier] NOT NULL,
	[$systemCreatedAt] [datetime] NOT NULL,
	[$systemCreatedBy] [uniqueidentifier] NOT NULL,
	[$systemModifiedAt] [datetime] NOT NULL,
	[$systemModifiedBy] [uniqueidentifier] NOT NULL,
 CONSTRAINT [CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId] UNIQUE NONCLUSTERED 
(
	[$systemId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Name]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Search Name]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Name 2]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Address]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Address 2]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [City]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Contact]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Phone No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Telex No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Document Sending Profile]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Ship-to Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Our Account No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Territory Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 1 Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Global Dimension 2 Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Chain Name]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Budgeted Amount]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Credit Limit (LCY)]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Posting Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Currency Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Price Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Language Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Registration Number]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Statistics Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Terms Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Fin_ Charge Terms Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Salesperson Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipment Method Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Place of Export]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Invoice Disc_ Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Customer Disc_ Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Country_Region Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Collection Method]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Amount]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Blocked]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Invoice Copies]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Last Statement No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Print Statements]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Bill-to Customer No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Priority]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Payment Method Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Format Region]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Modified Date Time]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('1753.01.01') FOR [Last Date Modified]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Application Method]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Prices Including VAT]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Location Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Fax No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Telex Answer Back]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Registration No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Combine Shipments]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Gen_ Bus_ Posting Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [GLN]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Post Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [County]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [EORI Number]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Use GLN in Electronic Document]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [E-Mail]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Home Page]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Reminder Terms Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [No_ Series]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Tax Area Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Tax Liable]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [VAT Bus_ Posting Group]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Reserve]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Block Payment Tolerance]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [IC Partner Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0.0)) FOR [Prepayment _]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Partner Type]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Intrastat Partner Type]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Exclude from Pmt_ Practices]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Image]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Privacy Blocked]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Disable Search by Name]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Multiple Posting Groups]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Preferred Bank Account Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Coupled to CRM]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Cash Flow Payment Terms Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Primary Contact No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Contact Type]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Mobile Phone No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Responsibility Center]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Shipping Advice]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('') FOR [Shipping Time]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Shipping Agent Service Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Service Zone Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Price Calculation Method]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Allow Line Disc_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Base Calendar Code]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Copy Sell-to Addr_ to Qte From]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ((0)) FOR [Validate EU Vat Reg_ No_]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Currency Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Payment Terms Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Shipment Method Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Payment Method Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Tax Area ID]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Contact ID]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  DEFAULT (N'') FOR [Contact Graph Id]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemId]  DEFAULT (newsequentialid()) FOR [$systemId]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedAt]  DEFAULT ('1753.01.01') FOR [$systemCreatedAt]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemCreatedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemCreatedBy]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedAt]  DEFAULT ('1753.01.01') FOR [$systemModifiedAt]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972] ADD  CONSTRAINT [MDF$CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$$systemModifiedBy]  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [$systemModifiedBy]
GO


