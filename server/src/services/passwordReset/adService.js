/**
 * services/passwordReset/adService.js
 *
 * Active Directory operations for the password-reset flow:
 *   • lookupUser(sam)        — fetch profile + flags via service account
 *   • classifyEligibility()  — decide standard / privileged / blocked
 *   • resetPassword(dn, pwd) — unicodePwd modify over LDAPS
 *
 * IMPORTANT: AD will only accept password modifications over LDAPS
 * (encrypted channel). Plain LDAP returns "unwilling to perform" /
 * "constraint violation". Configure AD_LDAPS_URL.
 */
import ldap   from 'ldapjs';
import logger from '../logger.js';
import { db, sql } from '../../db/pool.js';

// ── userAccountControl flags ─────────────────────────────────────────────────
// https://learn.microsoft.com/en-us/troubleshoot/windows-server/active-directory/useraccountcontrol-manipulate-account-properties
const UAC = {
  ACCOUNTDISABLE:        0x0002,
  LOCKOUT:               0x0010,  // legacy — real lockout uses lockoutTime
  DONT_EXPIRE_PASSWORD:  0x10000,
  PASSWORD_NEVER_EXPIRES:0x10000, // alias
  SMARTCARD_REQUIRED:    0x40000,
  TRUSTED_FOR_DELEGATION:0x80000,
};

// ── ldap client helpers ──────────────────────────────────────────────────────

function createClient({ forReset = false } = {}) {
  const url = forReset
    ? (process.env.AD_LDAPS_URL || process.env.AD_URL)
    : (process.env.AD_URL || process.env.AD_LDAPS_URL);
  if (!url) throw new Error('AD URL is not configured');

  const tlsOptions = {};
  if (process.env.AD_TLS_REJECT_UNAUTHORIZED === 'false') {
    tlsOptions.rejectUnauthorized = false;
  }
  return ldap.createClient({
    url,
    reconnect:      false,
    connectTimeout: 8000,
    timeout:        10000,
    tlsOptions,
  });
}

const bindAsync = (client, dn, password) =>
  new Promise((resolve, reject) =>
    client.bind(dn, password, (err) => (err ? reject(err) : resolve()))
  );

const searchAsync = (client, base, options) =>
  new Promise((resolve, reject) => {
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      const entries = [];
      res.on('searchEntry',     (e) => entries.push(e.pojo));
      res.on('searchReference', () => {});
      res.on('error',           (e) => reject(e));
      res.on('end',             () => resolve(entries));
    });
  });

const modifyAsync = (client, dn, change) =>
  new Promise((resolve, reject) =>
    client.modify(dn, change, (err) => (err ? reject(err) : resolve()))
  );

const destroy = (client) => { try { client.destroy(); } catch {} };

function getResetServiceCreds() {
  return {
    dn:  process.env.AD_RESET_SERVICE_DN  || process.env.AD_SERVICE_DN,
    pwd: process.env.AD_RESET_SERVICE_PASS|| process.env.AD_SERVICE_PASS,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function normalizeSam(username) {
  return String(username || '')
    .trim()
    .replace(/^.*\\/, '')
    .replace(/@.*$/, '')
    .toLowerCase();
}

function attr(entry, name) {
  const a = entry.attributes?.find((x) => x.type.toLowerCase() === name.toLowerCase());
  return a?.values ?? [];
}
function attrFirst(entry, name) {
  return attr(entry, name)[0] ?? null;
}

function parseInt0(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// ── allowlist / blocklist lookups ────────────────────────────────────────────

async function isInAllowlist(username) {
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('Username', sql.NVarChar(100), username);
  const { recordset } = await req.query(`
    SELECT TOP 1 1 AS x FROM [dbo].[PasswordResetAllowlist]
    WHERE LOWER(Username) = LOWER(@Username) AND IsActive = 1
  `);
  return Boolean(recordset.length);
}

async function isInBlocklist(username) {
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('Username', sql.NVarChar(100), username);
  const { recordset } = await req.query(`
    SELECT TOP 1 Reason FROM [dbo].[PasswordResetBlocklist]
    WHERE LOWER(Username) = LOWER(@Username) AND IsActive = 1
  `);
  return recordset[0]?.Reason ?? null;
}

// ── public: lookup ───────────────────────────────────────────────────────────

/**
 * Look up the user in AD via the service account. Returns null if not found.
 *
 * @returns {null | {
 *   sam, dn, displayName, mail, mobile, telephone,
 *   memberOfDns: string[], memberOfCnsLower: string[],
 *   userAccountControl: number, lockoutTime: number,
 *   hasSpn: boolean, ouPath: string
 * }}
 */
export async function lookupUser(samInput) {
  const sam = normalizeSam(samInput);
  if (!sam) return null;
  if (!process.env.AD_BASE_DN) throw new Error('AD_BASE_DN is not configured');

  const { dn: svcDn, pwd: svcPwd } = getResetServiceCreds();
  if (!svcDn || !svcPwd) throw new Error('AD service credentials are not configured');

  const client = createClient({ forReset: false });
  try {
    await bindAsync(client, svcDn, svcPwd);
    // Escape LDAP special chars in the filter value
    const safe = sam.replace(/[\\*\(\)\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
    const entries = await searchAsync(client, process.env.AD_BASE_DN, {
      scope:  'sub',
      filter: `(&(objectClass=user)(sAMAccountName=${safe}))`,
      attributes: [
        'distinguishedName', 'sAMAccountName', 'displayName', 'mail',
        'mobile', 'telephoneNumber', 'memberOf',
        'userAccountControl', 'lockoutTime', 'servicePrincipalName',
      ],
      sizeLimit: 1,
    });
    if (!entries.length) return null;

    const e = entries[0];
    const dn = attrFirst(e, 'distinguishedName') ?? e.objectName ?? null;
    const memberOfDns = attr(e, 'memberOf');
    const memberOfCnsLower = memberOfDns
      .map((d) => /^CN=([^,]+)/i.exec(d)?.[1])
      .filter(Boolean)
      .map((s) => s.toLowerCase());

    return {
      sam,
      dn,
      displayName:        attrFirst(e, 'displayName') ?? sam,
      mail:               attrFirst(e, 'mail'),
      mobile:             attrFirst(e, 'mobile'),
      telephone:          attrFirst(e, 'telephoneNumber'),
      memberOfDns,
      memberOfCnsLower,
      userAccountControl: parseInt0(attrFirst(e, 'userAccountControl')),
      lockoutTime:        parseInt0(attrFirst(e, 'lockoutTime')),
      hasSpn:             attr(e, 'servicePrincipalName').length > 0,
      ouPath:             dn ? dn.split(',').slice(1).join(',') : '',
    };
  } finally {
    destroy(client);
  }
}

// ── public: classifyEligibility ──────────────────────────────────────────────

const TIER = Object.freeze({ STANDARD: 'standard', PRIVILEGED: 'privileged' });

/**
 * Decide whether the user may reset their password and at what tier.
 *
 * @returns {{
 *   eligible: boolean,
 *   tier?: 'standard'|'privileged',
 *   reason?: string,
 *   reasonCode?: string,   // matches an EVENTS key for audit
 *   destinations?: { email?: string, sms?: string, emailMasked?: string, smsMasked?: string }
 * }}
 */
export async function classifyEligibility(user, opts = {}) {
  if (!user) return { eligible: false, reason: 'Account not found', reasonCode: 'ACCOUNT_NOT_FOUND' };

  // 0. Explicit deny — non-negotiable
  const blockReason = await isInBlocklist(user.sam);
  if (blockReason) {
    return { eligible: false, reason: blockReason, reasonCode: 'EXPLICIT_BLOCKLIST' };
  }

  // 1. Disabled
  if ((user.userAccountControl & UAC.ACCOUNTDISABLE) !== 0) {
    return { eligible: false, reason: 'Account disabled', reasonCode: 'ACCOUNT_DISABLED' };
  }

  // 2. Locked (lockoutTime > 0 means currently locked in most AD configs)
  if (user.lockoutTime && user.lockoutTime > 0) {
    return { eligible: false, reason: 'Account locked', reasonCode: 'ACCOUNT_LOCKED' };
  }

  // 3. Service-account heuristics — ANY of these blocks unconditionally
  //    (a) Username prefix
  const prefixes = parseCsv(process.env.AD_BLOCKED_USERNAME_PREFIXES);
  if (prefixes.some((p) => user.sam.startsWith(p.toLowerCase()))) {
    return { eligible: false, reason: 'Service-account naming pattern', reasonCode: 'SERVICE_BLOCKED' };
  }
  //    (b) servicePrincipalName attribute present
  if (user.hasSpn) {
    return { eligible: false, reason: 'Account has servicePrincipalName', reasonCode: 'SERVICE_BLOCKED' };
  }
  //    (c) DONT_EXPIRE_PASSWORD flag — typical for service accounts
  if ((user.userAccountControl & UAC.DONT_EXPIRE_PASSWORD) !== 0) {
    return { eligible: false, reason: 'Password set to never expire', reasonCode: 'SERVICE_BLOCKED' };
  }
  //    (d) OU keyword match
  const ouKeywords = parseCsv(process.env.AD_BLOCKED_OU_KEYWORDS).map((s) => s.toLowerCase());
  const dnLower = String(user.dn || '').toLowerCase();
  if (ouKeywords.some((k) => dnLower.includes(`ou=${k}`) || dnLower.includes(k))) {
    return { eligible: false, reason: 'Account in service-accounts OU', reasonCode: 'SERVICE_BLOCKED' };
  }

  // 4. Allowed OU scope — must live under one of AD_RESET_ALLOWED_OUS
  const allowedOus = parseCsv(process.env.AD_RESET_ALLOWED_OUS).map((s) => s.toLowerCase());
  if (allowedOus.length && !allowedOus.some((ou) => dnLower.endsWith(ou.toLowerCase()) || dnLower.includes(ou.toLowerCase()))) {
    return { eligible: false, reason: 'Account outside allowed OU', reasonCode: 'OUT_OF_SCOPE_OU' };
  }

  // 5. Privileged groups — block UNLESS user is in the allowlist
  const privilegedGroups = parseCsv(process.env.AD_PRIVILEGED_GROUPS).map((g) => g.toLowerCase());
  const isPrivileged = privilegedGroups.some((g) => user.memberOfCnsLower.includes(g));

  if (isPrivileged) {
    const allowed = await isInAllowlist(user.sam);
    if (!allowed) {
      return { eligible: false, reason: 'Privileged account not in allowlist', reasonCode: 'PRIVILEGED_BLOCKED' };
    }
    // Privileged + allowlisted → privileged tier. Dual-channel required.
    const dest = buildDestinations(user);
    if (!dest.email || !dest.sms) {
      return {
        eligible: false,
        reason: 'Privileged accounts require both email and mobile on file',
        reasonCode: 'PRIV_MISSING_DUAL_CHANNEL',
        destinations: dest,
      };
    }
    return { eligible: true, tier: TIER.PRIVILEGED, destinations: dest };
  }

  // 6. Standard tier — needs at least one delivery channel
  const dest = buildDestinations(user);
  if (!dest.email && !dest.sms) {
    return { eligible: false, reason: 'No external email or mobile on file', reasonCode: 'NO_DELIVERY_METHOD' };
  }
  return { eligible: true, tier: TIER.STANDARD, destinations: dest };
}

function buildDestinations(user) {
  const email = user.mail || null;
  const sms   = user.mobile || user.telephone || null;
  return {
    email,
    sms,
    emailMasked: maskEmail(email),
    smsMasked:   maskPhone(sms),
  };
}

function parseCsv(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── public: resetPassword ────────────────────────────────────────────────────

/**
 * Reset the password via LDAPS using the unicodePwd modify-replace operation.
 * The new password must be encoded as UTF-16LE bytes wrapped in double quotes.
 *
 * Throws on failure. Caller MUST have already verified eligibility.
 *
 * @param {string} userDn
 * @param {string} newPassword
 */
export async function resetPassword(userDn, newPassword) {
  if (!userDn) throw new Error('userDn is required');
  if (!newPassword || typeof newPassword !== 'string') throw new Error('newPassword is required');

  const ldapsUrl = process.env.AD_LDAPS_URL;
  if (!ldapsUrl || !/^ldaps:\/\//i.test(ldapsUrl)) {
    throw new Error('AD_LDAPS_URL must be set to an ldaps:// URL — AD refuses unicodePwd changes over plain LDAP.');
  }

  const { dn: svcDn, pwd: svcPwd } = getResetServiceCreds();
  if (!svcDn || !svcPwd) throw new Error('Reset service credentials are not configured');

  // Encode password: UTF-16LE bytes of "newPassword" (literally surrounded by ")
  const quoted = `"${newPassword}"`;
  const pwdBuffer = Buffer.from(quoted, 'utf16le');

  const client = createClient({ forReset: true });
  try {
    await bindAsync(client, svcDn, svcPwd);

    const change = new ldap.Change({
      operation: 'replace',
      modification: new ldap.Attribute({
        type: 'unicodePwd',
        // ldapjs Attribute accepts Buffer values for binary attributes
        values: [pwdBuffer],
      }),
    });

    await modifyAsync(client, userDn, change);
    logger.info('AD password reset OK', { userDn });
  } catch (err) {
    logger.error('AD password reset failed', { userDn, code: err.code, name: err.name, message: err.message });
    // Map known errors to safe-ish detail; caller decides what to expose
    const e = new Error(err.message || 'AD password reset failed');
    e.code = err.code;
    e.adName = err.name;
    throw e;
  } finally {
    destroy(client);
  }
}

export { normalizeSam, maskEmail, maskPhone, TIER };
