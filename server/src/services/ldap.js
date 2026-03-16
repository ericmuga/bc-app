/**
 * services/ldap.js
 *
 * Active Directory authentication — direct UPN bind strategy.
 *
 * Strategy (simple and proven):
 *   1. Build the user's UPN:  username@AD_DOMAIN
 *   2. Attempt a direct LDAP bind with that UPN + password.
 *      AD itself validates the credentials and enforces lockout policy.
 *   3. On success, do a second bind as the service account to fetch
 *      displayName, email and group membership for the JWT payload.
 *
 * Required env vars:
 *   AD_URL          ldap://100.100.4.89:389
 *   AD_DOMAIN       farmerschoice.co.ke
 *
 * Optional:
 *   AD_SERVICE_DN   CN=svc-bc,OU=bc2022,DC=farmerschoice,DC=co,DC=ke
 *   AD_SERVICE_PASS <password>   (needed to fetch displayName / groups)
 *   AD_BASE_DN      DC=farmerschoice,DC=co,DC=ke
 *   AD_ADMIN_GROUP  CN=BC-Admins,OU=Groups,DC=farmerschoice,DC=co,DC=ke
 *   AD_TLS_REJECT_UNAUTHORIZED  false  (dev only, self-signed certs)
 */

import ldap   from 'ldapjs';
import logger from './logger.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function createClient() {
  const tlsOptions = {};
  if (process.env.AD_TLS_REJECT_UNAUTHORIZED === 'false') {
    tlsOptions.rejectUnauthorized = false;
  }
  return ldap.createClient({
    url:            process.env.AD_URL,
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
      res.on('searchEntry',    (e) => entries.push(e.pojo));
      res.on('searchReference', () => {});          // ignore referrals
      res.on('error',          (e) => reject(e));
      res.on('end',            () => resolve(entries));
    });
  });

const destroy = (client) => { try { client.destroy(); } catch {} };

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Authenticate against Active Directory using a direct UPN bind.
 *
 * @param   {string} username  sAMAccountName or full UPN
 * @param   {string} password
 * @returns {{ samAccountName, displayName, email, isAdmin }}
 * @throws  Error with a safe user-facing message
 */
export async function authenticateAD(username, password) {
  if (!process.env.AD_URL || !process.env.AD_DOMAIN) {
    throw new Error('Active Directory is not configured on this server.');
  }

  // Normalise to bare sAMAccountName then build full UPN
  const sam = username
    .replace(/^.*\\/, '')     // strip DOMAIN\
    .replace(/@.*$/, '');     // strip @domain

  const upn = `${sam}@${process.env.AD_DOMAIN}`;

  // ── Step 1: bind directly as the user (proves password is correct) ───────
  const userClient = createClient();
  try {
    await bindAsync(userClient, upn, password);
    logger.info('AD user bind OK', { upn });
  } catch (err) {
    destroy(userClient);
    if (err.code === 49) throw new Error('Invalid credentials.');
    logger.error('AD user bind failed', { upn, code: err.code, error: err.message });
    throw new Error('Active Directory authentication failed. Contact your administrator.');
  } finally {
    destroy(userClient);
  }

  // ── Step 2: fetch profile + groups via service account (optional) ─────────
  // If no service account is configured we return minimal info.
  // The user is still authenticated — we just won't have displayName/groups.
  let displayName = sam;
  let email       = null;
  let isAdmin     = false;

  const hasServiceAccount =
    process.env.AD_SERVICE_DN &&
    process.env.AD_SERVICE_PASS &&
    process.env.AD_BASE_DN;

  if (hasServiceAccount) {
    const svcClient = createClient();
    try {
      await bindAsync(svcClient, process.env.AD_SERVICE_DN, process.env.AD_SERVICE_PASS);

      const entries = await searchAsync(svcClient, process.env.AD_BASE_DN, {
        scope:      'sub',
        filter:     `(sAMAccountName=${sam})`,
        attributes: ['displayName', 'mail', 'memberOf'],
        sizeLimit:  1,
      });

      if (entries.length) {
        const attrs = entries[0].attributes;
        displayName = attrs.find(a => a.type === 'displayName')?.values[0] ?? sam;
        email       = attrs.find(a => a.type === 'mail')?.values[0]        ?? null;

        const memberOf   = attrs.find(a => a.type === 'memberOf')?.values ?? [];
        const adminGroup = (process.env.AD_ADMIN_GROUP ?? '').toLowerCase();
        isAdmin = adminGroup
          ? memberOf.some(g => g.toLowerCase() === adminGroup)
          : false;
      }
    } catch (err) {
      // Non-fatal — user is authenticated, we just fall back to sam as displayName
      logger.warn('AD profile fetch failed (non-fatal)', { sam, error: err.message });
    } finally {
      destroy(svcClient);
    }
  }

  logger.info('AD auth success', { sam, displayName, isAdmin });

  return { samAccountName: sam, displayName, email, isAdmin };
}