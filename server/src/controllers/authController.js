/**
 * controllers/authController.js
 *
 * Two login strategies, one JWT output:
 *   POST /api/auth/login      – local bcrypt (Users table)
 *   POST /api/auth/login-ad   – Active Directory bind via LDAP
 *
 * Both return { token, user } so the Vue client needs no special casing.
 *
 * AD login auto-provisions the user in [dbo].[Users] on first sign-in
 * (AuthProvider='AD'). Role = 'admin' if they are in AD_ADMIN_GROUP,
 * otherwise 'user'. Role can be overridden by an admin afterwards.
 */
import jwt          from 'jsonwebtoken';
import bcrypt       from 'bcryptjs';
import { db, sql }  from '../db/pool.js';
import { authenticateAD } from '../services/ldap.js';
import logger       from '../services/logger.js';
import { ROLES } from '../services/access.js';

// ── shared helpers ─────────────────────────────────────────────────────────

function issueToken(user) {
  return jwt.sign(
    { userId: user.UserId, userName: user.DisplayName, role: user.Role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function userShape(user) {
  return { userId: user.UserId, userName: user.DisplayName, role: user.Role, email: user.Email ?? null, receiveScheduledReports: Boolean(user.ReceiveScheduledReports) };
}

// ── POST /api/auth/login  (local bcrypt) ───────────────────────────────────

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const pool = await db.getPool();
    const req1 = pool.request();
    req1.input('Username', sql.NVarChar(100), username);
    const result = await req1.query(`
      SELECT UserId, Username, PasswordHash, DisplayName, Email, Role, IsActive, AuthProvider, ReceiveScheduledReports
      FROM   [dbo].[Users]
      WHERE  Username = @Username AND IsActive = 1
    `);

    if (!result.recordset.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.recordset[0];

    if (user.AuthProvider === 'AD') {
      return res.status(400).json({
        error: 'This account uses Active Directory. Please use the AD login.',
      });
    }

    if (!(await bcrypt.compare(password, user.PasswordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    logger.info('Local login', { username, userId: user.UserId });
    return res.json({ token: issueToken(user), user: userShape(user) });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'Login failed' });
  }
}

// ── POST /api/auth/login-ad  (Active Directory) ────────────────────────────

export async function loginAD(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  // 1. Authenticate against AD
  let adUser;
  try {
    adUser = await authenticateAD(username, password);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // 2. Upsert into [dbo].[Users]
  //    New user  → insert with role from AD group membership
  //    Existing  → update DisplayName/Email only; preserve Role
  try {
    const pool = await db.getPool();
    const req1 = pool.request();
    req1.input('Username',    sql.NVarChar(100), adUser.samAccountName);
    req1.input('DisplayName', sql.NVarChar(200), adUser.displayName);
    req1.input('Email',       sql.NVarChar(200), adUser.email ?? null);
    req1.input('DefaultRole', sql.NVarChar(20),  adUser.isAdmin ? 'admin' : 'user');

    await req1.query(`
      MERGE [dbo].[Users] AS t
      USING (SELECT @Username AS Username) AS s ON t.Username = s.Username
      WHEN NOT MATCHED THEN
        INSERT (Username, PasswordHash, DisplayName, Email, Role, AuthProvider)
        VALUES (@Username, '', @DisplayName, @Email, @DefaultRole, 'AD')
      WHEN MATCHED THEN
        UPDATE SET DisplayName=@DisplayName, Email=@Email,
                   AuthProvider='AD', IsActive=1;
    `);

    // Fetch back to get real UserId + current Role
    const req2 = pool.request();
    req2.input('Username', sql.NVarChar(100), adUser.samAccountName);
    const { recordset } = await req2.query(`
      SELECT UserId, DisplayName, Email, Role, ReceiveScheduledReports
      FROM   [dbo].[Users]
      WHERE  Username = @Username AND IsActive = 1
    `);

    if (!recordset.length) {
      return res.status(500).json({ error: 'User provisioning failed' });
    }

    const user = recordset[0];
    logger.info('AD login', { username: adUser.samAccountName, role: user.Role, userId: user.UserId });
    return res.json({ token: issueToken(user), user: userShape(user) });

  } catch (err) {
    logger.error('AD login DB error', { error: err.message });
    return res.status(500).json({ error: 'Login failed after AD authentication' });
  }
}

// ── POST /api/auth/validate-ad  (service-to-service, API-key protected) ──────
//
// Validates AD credentials and returns the user's AD profile.
// Does NOT touch the Users table or issue a JWT — the calling app
// handles its own session.
//
// Request body:  { username, password }
// Success 200:   { samAccountName, displayName, email, isAdmin }
// Failure 401:   { error: "..." }

export async function validateAD(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const adUser = await authenticateAD(username, password);
    return res.json({
      samAccountName: adUser.samAccountName,
      displayName:    adUser.displayName,
      email:          adUser.email ?? null,
      isAdmin:        adUser.isAdmin,
    });
  } catch (err) {
    const status = err.message.toLowerCase().includes('invalid credentials') ? 401 : 502;
    return res.status(status).json({ error: err.message });
  }
}

// ── POST /api/auth/create-user  (admin only) ───────────────────────────────

export async function createUser(req, res) {
  const { username, password, displayName, role = 'user' } = req.body;
  if (!username || !displayName) {
    return res.status(400).json({ error: 'username and displayName are required' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  const VALID_ROLES = [ROLES.ADMIN, ROLES.SALES, ROLES.DISPATCH, ROLES.SECURITY, ROLES.ANALYST];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  try {
    const hash    = password ? await bcrypt.hash(password, 12) : '';
    const pool    = await db.getPool();
    const request = pool.request();
    request.input('Username',     sql.NVarChar(100), username);
    request.input('PasswordHash', sql.NVarChar(200), hash);
    request.input('DisplayName',  sql.NVarChar(200), displayName);
    request.input('Role',         sql.NVarChar(20),  role);
    request.input('AuthProvider', sql.NVarChar(20),  password ? 'local' : 'AD');

    await request.query(`
      MERGE [dbo].[Users] AS t
      USING (SELECT @Username AS Username) AS s ON t.Username = s.Username
      WHEN MATCHED THEN
        UPDATE SET DisplayName=@DisplayName, Role=@Role, AuthProvider=@AuthProvider,
          PasswordHash = CASE WHEN @PasswordHash <> '' THEN @PasswordHash ELSE PasswordHash END,
          IsActive=1
      WHEN NOT MATCHED THEN
        INSERT (Username, PasswordHash, DisplayName, Role, AuthProvider)
        VALUES (@Username, @PasswordHash, @DisplayName, @Role, @AuthProvider);
    `);

    return res.status(201).json({ message: 'User saved', username });
  } catch (err) {
    logger.error('createUser error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
