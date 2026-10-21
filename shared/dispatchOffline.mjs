// Dedicated durable storage: no TTL and no eviction of unsynchronised work.
export function offlineStore(owner, storage = globalThis.localStorage) {
  const key = `dispatch-offline-assembly-v1:${owner}`;
  return {
    read() { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; },
    write(packet) {
      const raw = JSON.stringify(packet);
      if (raw.length > 1500000) throw new Error('Offline bundle is too large. Select fewer orders (maximum 3 MB).');
      storage.setItem(key, raw); // Quota/blocked-storage errors must reach the operator.
    },
    clear() { storage.removeItem(key); }
  };
}
