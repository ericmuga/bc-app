const cache = new Map();

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function namespacedKey(namespace, key) {
  return `${namespace}:${stableSerialize(key)}`;
}

export async function getOrSet(namespace, key, producer, { ttlMs = 300000, refresh = false } = {}) {
  const now = Date.now();
  const cacheKey = namespacedKey(namespace, key);
  const existing = cache.get(cacheKey);
  if (!refresh && existing && existing.expiresAt > now) {
    return { value: existing.value, cached: true };
  }
  const value = await producer();
  cache.set(cacheKey, { value, expiresAt: now + ttlMs });
  return { value, cached: false };
}

export function clearNamespace(namespace) {
  const prefix = `${namespace}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearAll() {
  cache.clear();
}
