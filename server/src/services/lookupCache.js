// Bounded, short-lived cache with concurrent requests sharing one query.
export function createLookupCache({ ttlMs = 300000, maxEntries = 256, now = Date.now } = {}) {
  const entries = new Map();
  return async function cached(key, load) {
    const existing = entries.get(key);
    if (existing && existing.expires > now()) {
      entries.delete(key); entries.set(key, existing);
      return existing.value;
    }
    entries.delete(key);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    const entry = { expires: now() + ttlMs };
    entry.value = Promise.resolve().then(load).then(value => {
      entry.expires = now() + ttlMs;
      return value;
    }).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    return entry.value;
  };
}
