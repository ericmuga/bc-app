USE [FCL]
GO

/****** Object:  Table [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext]    Script Date: 4/5/2026 8:30:09 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext](
	[timestamp] [timestamp] NOT NULL,
	[No_] [nvarchar](20) NOT NULL,
	[Exempted By UserID$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](25) NOT NULL,
	[Gurdian Name$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Gurdian Relationship$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Gurdian Contacts$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Sub County$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Home Location$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Place of Birth$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Any form of Disability$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Disability Description$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Sponsorship$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Company Name$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Company Physical Address$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](80) NOT NULL,
	[Company Contact Person$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Position (Title)$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Company Email$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](60) NOT NULL,
	[Mean Grade Acquired$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](5) NOT NULL,
	[Mode of Study$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Hostel Black Listed$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Hostel Allocated$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Hostel No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](15) NOT NULL,
	[Room Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](15) NOT NULL,
	[Space Booked$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](15) NOT NULL,
	[Current Student Stage$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Current Student Semester$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Current Semester$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Add__Ded_ Rate per Kg_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Add__Ded_ Rate$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Gender$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Date Of Birth$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Age$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Marital Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Blood Group$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Height$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Religion$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Citizenship$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Payments By$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Student Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[ID No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Date Registered$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Membership No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Customer Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Birth Cert$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[UNISA No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Opening Balance$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Old Student Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Name 3$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Library Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[KNEC No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Passport No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[New Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[New Receipt Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Receipt No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Student Balance$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Confirmed Ok$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[User ID$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Library Membership$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[libsecurity$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Can Use Library$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Lib Membership$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Staff No_$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Caution Money Refunded$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Caution Money Refund Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Allow Modify$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[PhoneNo2$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Programme Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Stage Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[SemesterFilter$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Intake Period$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Intake$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[New Student$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Current Student$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Application No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Leave Form$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Leave To$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Allow Class$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Allow Exam$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Student Cohort$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Dropped Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Applicant Charges$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[No_ Of Semester Registrations$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Current Admission No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Student Stage$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Programme$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Blank Admission Nos$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Password$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Confirmation Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](100) NOT NULL,
	[Unit Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Aging Audit$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[In Aging$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Graduation Period$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Units Cleared$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Lock Supp Registration$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Exempted Units$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Cleared Programme$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Award$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[SmartRead$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Smart Card No$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Programe Option$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Block Oline Access$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[PIN of customer$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[County Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Helb Number$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](30) NOT NULL,
	[Student Picture$23dc970e-11e8-4d9b-8613-b7582aec86ba] [uniqueidentifier] NOT NULL,
	[Linked Vendor Account$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Credit Type$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Credit Days$23dc970e-11e8-4d9b-8613-b7582aec86ba] [varchar](32) NOT NULL,
	[Has Customers$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Shipping Destination$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Cust_ Statistics Group$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](50) NOT NULL,
	[Customer Disc_ _$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Packaging Weight Per Kg$23dc970e-11e8-4d9b-8613-b7582aec86ba] [decimal](38, 20) NOT NULL,
	[Account No_ for Costs$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Groupage code$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](10) NOT NULL,
	[Email Sent$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Sync$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Sector$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[Web Portal$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[ExemptionNo$23dc970e-11e8-4d9b-8613-b7582aec86ba] [nvarchar](20) NOT NULL,
	[WHT VAT$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Blockage Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Customer Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Customer Status Date$23dc970e-11e8-4d9b-8613-b7582aec86ba] [datetime] NOT NULL,
	[Approval Status$23dc970e-11e8-4d9b-8613-b7582aec86ba] [int] NOT NULL,
	[Cash Customer$23dc970e-11e8-4d9b-8613-b7582aec86ba] [tinyint] NOT NULL,
	[Default Trans_ Type$70912191-3c4c-49fc-a1de-bc6ea1ac9da6] [nvarchar](10) NOT NULL,
	[Default Trans_ Type - Return$70912191-3c4c-49fc-a1de-bc6ea1ac9da6] [nvarchar](10) NOT NULL,
	[Def_ Transport Method$70912191-3c4c-49fc-a1de-bc6ea1ac9da6] [nvarchar](10) NOT NULL,
 CONSTRAINT [CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext$Key1] PRIMARY KEY CLUSTERED 
(
	[No_] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 90, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Exempted By UserID$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Gurdian Name$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Gurdian Relationship$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Gurdian Contacts$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Sub County$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Home Location$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Place of Birth$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Any form of Disability$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Disability Description$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Sponsorship$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Company Name$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Company Physical Address$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Company Contact Person$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Position (Title)$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Company Email$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Mean Grade Acquired$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Mode of Study$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Hostel Black Listed$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Hostel Allocated$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Hostel No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Room Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Space Booked$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Current Student Stage$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Current Student Semester$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Current Semester$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Add__Ded_ Rate per Kg_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Add__Ded_ Rate$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Gender$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Date Of Birth$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Age$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Marital Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Blood Group$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Weight$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Height$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Religion$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Citizenship$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Payments By$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Student Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [ID No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Date Registered$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Membership No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Customer Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Birth Cert$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [UNISA No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Opening Balance$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Old Student Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Name 3$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Library Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [KNEC No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Passport No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [New Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [New Receipt Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Receipt No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Student Balance$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Confirmed Ok$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [User ID$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Library Membership$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [libsecurity$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Can Use Library$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Lib Membership$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Staff No_$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Caution Money Refunded$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Caution Money Refund Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Allow Modify$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [PhoneNo2$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Programme Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Stage Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [SemesterFilter$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Intake Period$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Intake$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [New Student$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Current Student$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Application No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Leave Form$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Leave To$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Allow Class$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Allow Exam$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Student Cohort$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Dropped Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Applicant Charges$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [No_ Of Semester Registrations$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Current Admission No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Student Stage$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Programme$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Blank Admission Nos$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Password$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Confirmation Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Unit Filter$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Aging Audit$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [In Aging$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Graduation Period$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Units Cleared$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Lock Supp Registration$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Exempted Units$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Cleared Programme$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Award$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [SmartRead$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Smart Card No$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Programe Option$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Block Oline Access$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [PIN of customer$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [County Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Helb Number$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('00000000-0000-0000-0000-000000000000') FOR [Student Picture$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Linked Vendor Account$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Credit Type$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('') FOR [Credit Days$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Has Customers$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Shipping Destination$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [District Group Code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Cust_ Statistics Group$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Customer Disc_ _$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0.0)) FOR [Packaging Weight Per Kg$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Account No_ for Costs$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Groupage code$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Email Sent$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Sync$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Sector$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Web Portal$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [ExemptionNo$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [WHT VAT$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Blockage Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Customer Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ('1753.01.01') FOR [Customer Status Date$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Approval Status$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT ((0)) FOR [Cash Customer$23dc970e-11e8-4d9b-8613-b7582aec86ba]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Default Trans_ Type$70912191-3c4c-49fc-a1de-bc6ea1ac9da6]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Default Trans_ Type - Return$70912191-3c4c-49fc-a1de-bc6ea1ac9da6]
GO

ALTER TABLE [dbo].[CM3$Customer$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ADD  DEFAULT (N'') FOR [Def_ Transport Method$70912191-3c4c-49fc-a1de-bc6ea1ac9da6]
GO


