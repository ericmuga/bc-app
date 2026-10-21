// Preserve an explicitly supplied UPN; only bare names need the default domain.
export function adIdentity(username, domain) {
  const value = typeof username === 'string' ? username.trim() : '';
  const sam = value.replace(/^.*\\/, '').replace(/@.*$/, '');
  if (!sam || /[\x00-\x20]/.test(value)) throw new Error('Enter a valid domain username.');
  return {sam, upn: value.includes('@') ? value : `${sam}@${String(domain).trim()}`};
}

export function escapeLdapFilter(value) {
  return value.replace(/[\\*()\x00]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}
