// Backup & restore of a whole Netlify Blobs store, a piece at a time (shared by the Yamie apps).
// The app's own handler checks the caller is an admin/owner, then passes the call here.
//   list → { keys }                          every record (minus the app's skip list)
//   get  { key, off } → { total, b64, meta } up to CHUNK bytes of one record, from off
//   put  { key, part, parts, b64, meta }     one record; big ones arrive in parts and are joined at the end
//   del  { keys }                            remove records (restore in "replace" mode)
//   done                                     the app's after-restore step (tell phones to reload)
const CHUNK = 2_500_000
const STAGE = "__bk/"
const okKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length < 600 && !k.startsWith("/") && !k.startsWith(STAGE)

export async function backupOp(st: any, op: string, a: any, opts: { skip?: (k: string) => boolean; done?: () => Promise<void> } = {}) {
  const skip = opts.skip || (() => false)
  if (op === "list") {
    const { blobs } = await st.list()
    return { keys: blobs.map((b: any) => b.key).filter((k: string) => okKey(k) && !skip(k)) }
  }
  if (op === "get") {
    if (!okKey(a?.key)) throw new BkError("bad_key")
    const e = await st.getWithMetadata(a.key, { type: "arrayBuffer" })
    if (e === null) return { missing: true }
    const u = new Uint8Array(e.data as ArrayBuffer), off = Math.max(0, Math.floor(Number(a.off) || 0))
    return { total: u.length, b64: Buffer.from(u.subarray(off, off + CHUNK)).toString("base64"), ...(off === 0 ? { meta: e.metadata || null } : {}) }
  }
  if (op === "put") {
    if (!okKey(a?.key) || skip(a.key)) throw new BkError("bad_key")
    const parts = Math.max(1, Math.min(4000, Math.floor(Number(a.parts) || 1))), part = Math.floor(Number(a.part) || 0)
    if (part < 0 || part >= parts) throw new BkError("bad_part")
    const buf = Buffer.from(String(a.b64 || ""), "base64")
    const meta = a.meta && typeof a.meta === "object" && !Array.isArray(a.meta) ? { metadata: a.meta } : undefined
    if (parts === 1) { await st.set(a.key, buf, meta); return { ok: true } }
    await st.set(`${STAGE}${a.key}/${part}`, buf)
    if (part < parts - 1) return { ok: true }
    const bufs: Buffer[] = []
    for (let i = 0; i < parts; i++) {
      const x = await st.get(`${STAGE}${a.key}/${i}`, { type: "arrayBuffer" })
      if (x === null) throw new BkError("missing_part")
      bufs.push(Buffer.from(x as ArrayBuffer))
    }
    await st.set(a.key, Buffer.concat(bufs), meta)
    for (let i = 0; i < parts; i++) await st.delete(`${STAGE}${a.key}/${i}`)
    return { ok: true }
  }
  if (op === "del") {
    const keys: string[] = (Array.isArray(a?.keys) ? a.keys : []).filter((k: unknown) => okKey(k) && !skip(k as string)).slice(0, 100)
    await Promise.all(keys.map((k) => st.delete(k)))
    return { ok: true, n: keys.length }
  }
  if (op === "done") {
    const { blobs } = await st.list({ prefix: STAGE })   // leftovers of an interrupted restore
    await Promise.all(blobs.map((b: any) => st.delete(b.key)))
    if (opts.done) await opts.done()
    return { ok: true }
  }
  throw new BkError("bad_op")
}
export class BkError extends Error { status = 400 }
