// In-memory stand-in for @netlify/blobs (tests only).
import crypto from 'node:crypto';
const stores = globalThis.__stores || (globalThis.__stores = new Map());
export function getStore({ name }) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  const toBuf = (v) => (typeof v === 'string' ? Buffer.from(v) : Buffer.from(v));
  const out = (e, type) => {
    if (!e) return null;
    if (type === 'json') return JSON.parse(e.data.toString());
    if (type === 'arrayBuffer') return e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.length);
    return e.data.toString();
  };
  return {
    async get(k, o = {}) { return out(m.get(k), o.type); },
    async getWithMetadata(k, o = {}) { const e = m.get(k); if (!e) return null; return { data: out(e, o.type), etag: e.etag, metadata: e.meta }; },
    async set(k, v, o = {}) {
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      m.set(k, { data: toBuf(v), etag: crypto.randomUUID(), meta: o.metadata || {} });
      return { modified: true };
    },
    async setJSON(k, v, o = {}) { return this.set(k, JSON.stringify(v), o); },
    async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).sort().map((key) => ({ key })) }; },
  };
}
