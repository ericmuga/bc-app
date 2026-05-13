/*
  Temporary regression users — one per role. Password for all: RegrTest!2026
  Cleanup: tests/cleanup-regression-users.sql
*/
DECLARE @hash NVARCHAR(200) = N'$2a$12$WoVj2rWSGklacIg5n5iih.F2C3D549cpGPvuj1YJCGQKQlBqnIk/u';

MERGE dbo.Users AS t
USING (VALUES
  (N'reg_admin',       N'admin'),
  (N'reg_shopadmin',   N'shop-admin'),
  (N'reg_shop',        N'shop'),
  (N'reg_dispatch',    N'dispatch'),
  (N'reg_security',    N'security'),
  (N'reg_sales',       N'sales'),
  (N'reg_finance',     N'finance'),
  (N'reg_analyst',     N'analyst')
) AS s (Username, Role) ON t.Username = s.Username
WHEN MATCHED THEN UPDATE SET
  PasswordHash = @hash, Role = s.Role, IsActive = 1, AuthProvider = 'local',
  DisplayName  = s.Username
WHEN NOT MATCHED THEN
  INSERT (Username, PasswordHash, DisplayName, Role, AuthProvider, IsActive)
  VALUES (s.Username, @hash,      s.Username, s.Role, 'local',     1);

SELECT Username, Role, IsActive FROM dbo.Users WHERE Username LIKE 'reg_%' ORDER BY Username;
