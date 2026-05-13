DELETE FROM dbo.Users WHERE Username LIKE 'reg_%';
SELECT COUNT(*) AS RemainingRegUsers FROM dbo.Users WHERE Username LIKE 'reg_%';
