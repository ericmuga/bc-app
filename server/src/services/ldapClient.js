import ldap from 'ldapjs';
import logger from './logger.js';

export function createManagedLdapClient(options) {
  const client = ldap.createClient(options);
  // ldapjs emits client-level errors independently of bind/search callbacks.
  // Keep this listener for the entire lifetime, including late teardown events.
  client.on('error', error => {
    logger.warn('LDAP connection error', { code: error.code, error: error.message });
    // Also release queued operations when a connection fails before binding.
    if (!client.destroyed) {
      try { client.destroy(); } catch {}
    }
  });
  return client;
}
