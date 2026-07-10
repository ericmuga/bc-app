;WITH ItemPg AS (
    SELECT 'FCL' AS COMPANY, i.[No_] AS ItemNo, i.[Inventory Posting Group] AS InventoryPG,
           ISNULL(ix.[Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba], 0) AS IsByproduct
    FROM [FCLWHS].[dbo].[FCL1$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] i
    LEFT JOIN [FCLWHS].[dbo].[FCL1$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ix ON ix.[No_] = i.[No_]

    UNION ALL
    SELECT 'CM', i.[No_], i.[Inventory Posting Group],
           ISNULL(ix.[Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba], 0)
    FROM [FCLWHS].[dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] i
    LEFT JOIN [FCLWHS].[dbo].[CM3$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ix ON ix.[No_] = i.[No_]

    UNION ALL
    SELECT 'FLM', i.[No_], i.[Inventory Posting Group],
           ISNULL(ix.[Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba], 0)
    FROM [FCLWHS].[dbo].[FLM1$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] i
    LEFT JOIN [FCLWHS].[dbo].[FLM1$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ix ON ix.[No_] = i.[No_]

    UNION ALL
    SELECT 'RMK', i.[No_], i.[Inventory Posting Group],
           ISNULL(ix.[Is Byproduct$23dc970e-11e8-4d9b-8613-b7582aec86ba], 0)
    FROM [FCLWHS].[dbo].[RMK$Item$437dbf0e-84ff-417a-965d-ed2bb9650972] i
    LEFT JOIN [FCLWHS].[dbo].[RMK$Item$437dbf0e-84ff-417a-965d-ed2bb9650972$ext] ix ON ix.[No_] = i.[No_]
),
PostedInvoiceItems AS (
    SELECT 'FCL' AS COMPANY, l.[No_] AS ItemNo
    FROM [FCLWHS].[dbo].[FCL1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972] l
    WHERE l.[Type] = 2 AND NULLIF(LTRIM(RTRIM(l.[No_])), '') IS NOT NULL

    UNION
    SELECT 'CM', l.[No_]
    FROM [FCLWHS].[dbo].[CM3$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972] l
    WHERE l.[Type] = 2 AND NULLIF(LTRIM(RTRIM(l.[No_])), '') IS NOT NULL

    UNION
    SELECT 'FLM', l.[No_]
    FROM [FCLWHS].[dbo].[FLM1$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972] l
    WHERE l.[Type] = 2 AND NULLIF(LTRIM(RTRIM(l.[No_])), '') IS NOT NULL

    UNION
    SELECT 'RMK', l.[No_]
    FROM [FCLWHS].[dbo].[RMK$Sales Invoice Line$437dbf0e-84ff-417a-965d-ed2bb9650972] l
    WHERE l.[Type] = 2 AND NULLIF(LTRIM(RTRIM(l.[No_])), '') IS NOT NULL
),
Flags AS (
    SELECT
        ip.COMPANY,
        UPPER(LTRIM(RTRIM(ip.InventoryPG))) AS PGCode,
        MAX(CASE WHEN pii.ItemNo IS NOT NULL THEN 1 ELSE 0 END) AS sellable,
        MAX(CASE WHEN ip.IsByproduct = 1 THEN 1 ELSE 0 END) AS byproduct
    FROM ItemPg ip
    LEFT JOIN PostedInvoiceItems pii
      ON pii.COMPANY = ip.COMPANY
     AND pii.ItemNo = ip.ItemNo
    WHERE NULLIF(LTRIM(RTRIM(ip.InventoryPG)), '') IS NOT NULL
    GROUP BY ip.COMPANY, UPPER(LTRIM(RTRIM(ip.InventoryPG)))
)
UPDATE d
SET
    d.[sellable] = ISNULL(f.[sellable], 0),
    d.[byproduct] = CASE
        WHEN UPPER(LTRIM(RTRIM(COALESCE(d.[GlobalPGCode], d.[Code])))) = 'MISCPRK' THEN 1
        ELSE ISNULL(f.[byproduct], 0)
    END
FROM [FCLWHS].[dbo].[dim_ALLINVENTORYPG_MV] d
LEFT JOIN Flags f
  ON f.COMPANY = d.COMPANY
 AND f.PGCode = UPPER(LTRIM(RTRIM(COALESCE(d.[GlobalPGCode], d.[Code]))));
