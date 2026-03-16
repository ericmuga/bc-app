/**
 * services/ldap.js
 *
 * Active Directory authentication via LDAP bind.
 *
 * Strategy:
 *  1. Bind to AD with a dedicated service account (read-only, just for searches).
 *  2. Search for the user by sAMAccountName (or UPN) to confirm they exist
 *     and to retrieve their display name, email, and group memberships.
 *  3. Re-bind using the user's own credentials to prove their password is correct.
 *     If LDAP bind succeeds → password is valid. AD itself enforces lockout policy.
 *  4. Return a normalised user object; the caller decides what role to assign.
 *
 * Required env vars (all in server/.env):
 *   AD_URL           ldap://dc.yourdomain.com  or  ldaps://dc.yourdomain.com:636
 *   AD_BASE_DN       DC=yourdomain,DC=com
 *   AD_DOMAIN        yourdomain.com            (appended to form UPN: user@yourdomain.com)
 *   AD_SERVICE_DN    CN=svc-bc,OU=Service Accounts,DC=yourdomain,DC=com
 *   AD_SERVICE_PASS  <service account password>
 *
 * Optional:
 *   AD_ADMIN_GROUP   CN=BC-Admins,OU=Groups,DC=yourdomain,DC=com
 *                    If set, members of this group are assigned role='admin'.
 *                    All other AD users get role='user'.
 *   AD_TLS_REJECT_UNAUTHORIZED  false   (set to false only for self-signed certs in dev)
 */

import ldap   from 'ldapjs';
import logger from './logger.js';

/** Build a connected, unauthenticated ldapjs client from env config */
function createClient() {
  const tlsOptions = {};
  if (process.env.AD_TLS_REJECT_UNAUTHORIZED === 'false') {
    tlsOptions.rejectUnauthorized = false;
  }

  return ldap.createClient({
    url:            process.env.AD_URL,
    connectTimeout: 8000,
    timeout:        10000,
    tlsOptions,
  });
}

/** Promisify a client.bind() call */
function bindAsync(client, dn, password) {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Promisify a client.search() → collect all entries */
function searchAsync(client, base, options) {
  return new Promise((resolve, reject) => {
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      const entries = [];
      res.on('searchEntry', (entry) => entries.push(entry.pojo));
      res.on('error',       (e)     => reject(e));
      res.on('end',         ()      => resolve(entries));
    });
  });
}

/** Safely destroy a client regardless of state */
function destroyClient(client) {
  try { client.destroy(); } catch {}
}

/**
 * Authenticate a user against Active Directory.
 *
 * @param {string} username  sAMAccountName (without domain) or full UPN
 * @param {string} password
 * @returns {{ samAccountName, displayName, email, memberOf, isAdmin }}
 * @throws  Error with a safe user-facing message on failure
 */
export async function authenticateAD(username, password) {
  if (!process.env.AD_URL || !process.env.AD_BASE_DN) {
    throw new Error('Active Directory is not configured on this server.');
  }

  // Normalise: strip domain suffix if user typed "domain\user" or "user@domain"
  const samAccountName = username
    .replace(/^.*\\/, '')          // strip DOMAIN\
    .replace(/@.*$/, '');          // strip @domain.com

  const upn = samAccountName.includes('@')
    ? samAccountName
    : `${samAccountName}@${process.env.AD_DOMAIN}`;

  // ── Step 1: service-account bind to search for the user ─────────────────
  const serviceClient = createClient();
  try {
    await bindAsync(
      serviceClient,
      process.env.AD_SERVICE_DN,
      process.env.AD_SERVICE_PASS
    );
  } catch (err) {
    destroyClient(serviceClient);
    logger.error('AD service bind failed', { error: err.message });
    throw new Error('Cannot reach Active Directory. Contact your administrator.');
  }

  let userDN;
  let displayName;
  let email;
  let memberOf = [];

  try {
    const entries = await searchAsync(serviceClient, process.env.AD_BASE_DN, {
      scope:  'sub',
      filter: `(|(sAMAccountName=${samAccountName})(userPrincipalName=${upn}))`,
      attributes: ['dn', 'displayName', 'mail', 'sAMAccountName', 'memberOf'],
      sizeLimit: 1,
    });

    if (!entries.length) {
      throw new Error('User not found in Active Directory.');
    }

    const entry = entries[0];
    userDN      = entry.objectName;
    displayName = entry.attributes.find(a => a.type === 'displayName')?.values[0]
               ?? samAccountName;
    email       = entry.attributes.find(a => a.type === 'mail')?.values[0]
               ?? null;

    // memberOf is multi-value — collect all group DNs
    memberOf = entry.attributes
      .find(a => a.type === 'memberOf')
      ?.values ?? [];

  } catch (err) {
    destroyClient(serviceClient);
    if (err.message.includes('not found')) throw err;
    logger.error('AD user search failed', { error: err.message });
    throw new Error('Active Directory search failed. Contact your administrator.');
  } finally {
    destroyClient(serviceClient);
  }

  // ── Step 2: bind as the user to verify their password ───────────────────
  const userClient = createClient();
  try {
    await bindAsync(userClient, userDN, password);
  } catch (err) {
    destroyClient(userClient);
    // 49 = invalidCredentials (wrong password / account locked)
    if (err.code === 49) {
      throw new Error('Invalid credentials.');
    }
    logger.error('AD user bind failed', { dn: userDN, code: err.code, error: err.message });
    throw new Error('Active Directory authentication failed.');
  } finally {
    destroyClient(userClient);
  }

  // ── Step 3: determine role from group membership ─────────────────────────
  const adminGroup = process.env.AD_ADMIN_GROUP ?? '';
  const isAdmin    = adminGroup
    ? memberOf.some(g => g.toLowerCase() === adminGroup.toLowerCase())
    : false;

  logger.info('AD auth success', { samAccountName, displayName, isAdmin });

  return {
    samAccountName,
    displayName,
    email,
    memberOf,
    isAdmin,
  };
}
