import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"

// Shared database for all Yamie Price Check phones (Android app, iPhone home-screen app).
// Every call needs the shop key (env SHOP_KEY). Stock, settings and user changes need an admin login (x-user + x-pin).
// Stored in one site-wide Blobs store: meta, stock, rates, settings, users, auth (legacy admin PIN).

const APP_ORIGINS = ["https://appassets.androidplatform.net", "https://yamie-price-check.netlify.app"]
const STOCK_FIELDS = ["key", "barcode", "item", "category", "carat", "gw", "nw", "sw", "dw", "dq", "sa", "serial", "label", "location", "pcs", "sq", "supplier", "mk", "mkType", "huid", "stoneName", "at"]
const RATE_KEYS = ["22k", "18k", "14k", "9k", "platinum", "silver"]

type Meta = { stock: number; rates: number; settings: number; users: number; quotes: number; count: number; history: any[] }

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") || ""
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type,x-shop-key,x-admin-pin,x-user,x-pin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  }
  if (APP_ORIGINS.includes(o) || /^https:\/\/[a-z0-9-]+--yamie-price-check\.netlify\.app$/.test(o)) h["Access-Control-Allow-Origin"] = o
  return h
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json" } })

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")
}
async function pbkdf(pin: string, saltHex: string) {
  const salt = new Uint8Array((saltHex.match(/../g) || []).map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 60000, hash: "SHA-256" }, key, 256)
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, "0")).join("")
}
// Item codes: { "BGL": "Bangle", ... } — 2–5 letter prefixes, short names; null keeps the app's starting list
function cleanCats(c: any): Record<string, string> | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(c).slice(0, 100)) {
    const key = String(k).toUpperCase()
    if (/^[A-Z]{2,5}$/.test(key) && typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 40)
  }
  return Object.keys(out).length ? out : null
}
const cleanStr = (v: unknown, n = 120) => (v == null ? "" : String(v).slice(0, n))
const cleanNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
function cleanRow(r: any) {
  if (!r || typeof r.key !== "string" || !r.key) return null
  const o: any = {}
  for (const f of STOCK_FIELDS) {
    if (["gw", "nw", "sw", "dw", "dq", "sa", "pcs", "sq", "huid", "at"].includes(f)) o[f] = cleanNum(r[f])
    else o[f] = cleanStr(r[f])
  }
  o.key = o.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40)
  return o.key ? o : null
}
// Permissions an admin can give to a role (admin always has all)
const PERMS = ["stock", "stockdel", "rates", "mkEdit", "mkDisc", "closeSale", "cancelQuote", "reopen", "delQuote", "settings", "users", "sync"]
const DEFAULT_ROLES = [
  { id: "manager", name: "Manager", perms: ["rates", "mkEdit", "mkDisc", "closeSale", "cancelQuote", "reopen"] },
  { id: "staff", name: "Staff", perms: ["rates", "closeSale", "cancelQuote"] },
]
// A quote as the app keeps it, minus anything large (photos stay on the phone that took them)
function cleanQuote(q: any) {
  if (!q || typeof q !== "object" || typeof q.id !== "string" || !q.id) return null
  const out = JSON.parse(JSON.stringify(q, (k, v) => (k === "photos" || k === "thumbs" ? undefined : v)))
  out.id = cleanStr(out.id, 24)
  out.no = /^QT-\d{1,9}$/.test(out.no || "") ? out.no : ""
  out.updated = cleanNum(out.updated) || Date.now()
  if (JSON.stringify(out).length > 120000) return null
  return out
}
function cleanRates(r: any) {
  const o: Record<string, number> = {}
  for (const k of RATE_KEYS) {
    const v = Number(r?.[k])
    if (Number.isFinite(v) && v > 0 && v < 1e7) o[k] = v
  }
  return o
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) })
  const shopKey = Netlify.env.get("SHOP_KEY")
  if (!shopKey) return json(req, { error: "not_configured" }, 503)
  if (req.headers.get("x-shop-key") !== shopKey) return json(req, { error: "bad_key" }, 401)

  const op = new URL(req.url).searchParams.get("op") || ""
  const st = getStore({ name: "yamie-price-check", consistency: "strong" })
  const meta: Meta = { stock: 0, rates: 0, settings: 0, users: 0, quotes: 0, count: 0, history: [], ...((await st.get("meta", { type: "json" })) || {}) }
  const saveMeta = () => st.setJSON("meta", meta)

  const users: any[] = ((await st.get("users", { type: "json" })) as any[]) || []
  const legacyOk = async (pin: string) => {
    if (!pin) return false
    const auth: any = await st.get("auth", { type: "json" })
    if (auth?.hash) return (await sha("yamie-pc:" + pin)) === auth.hash
    return pin === (Netlify.env.get("ADMIN_PIN") || "")
  }
  const verifyUser = async (username: string, pin: string) => {
    const un = String(username || "").trim().toLowerCase()
    const u = users.find((x) => x.username === un && x.active !== false)
    if (!u || !u.salt || !u.hash || !pin) return null
    return (await pbkdf(pin, u.salt)) === u.hash ? u : null
  }
  // Roles: admin has every permission; other roles carry a list set by an admin (Admin settings → Roles)
  const roles: any[] = ((await st.get("roles", { type: "json" })) as any[]) || DEFAULT_ROLES
  const roleHas = (role: string, perm: string) => role === "admin" || !!roles.find((r) => r.id === role)?.perms?.includes(perm)
  // Permission check: a logged-in user whose role has the permission, or (before any users exist) the legacy admin PIN
  const permOk = async (perm: string) => {
    const un = req.headers.get("x-user") || "", p = req.headers.get("x-pin") || ""
    if (un) {
      const u = await verifyUser(un, p)
      if (u) return roleHas(u.role, perm)
      if (!users.some((x) => x.role === "admin") && un.toLowerCase() === "admin") return legacyOk(p)
      return false
    }
    if (!users.length) return legacyOk(req.headers.get("x-admin-pin") || "")
    return false
  }
  const adminOk = () => permOk("users")
  const publicUser = (u: any, withHash: boolean) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active !== false, ...(withHash ? { salt: u.salt, hash: u.hash } : {}) })

  try {
    if (req.method === "GET") {
      if (op === "meta") return json(req, meta)
      if (op === "stock") return json(req, { v: meta.stock, rows: (await st.get("stock", { type: "json" })) || [], history: meta.history })
      if (op === "rates") return json(req, { v: meta.rates, log: (await st.get("rates", { type: "json" })) || [] })
      if (op === "settings") return json(req, { v: meta.settings, settings: (await st.get("settings", { type: "json" })) || null })
      if (op === "users") {
        // Staff PIN hashes go to every phone for offline login; admin hashes only to admins
        const isAdm = await adminOk()
        return json(req, { v: meta.users, users: users.map((u) => publicUser(u, isAdm || u.role !== "admin")), roles })
      }
      if (op === "quotes") return json(req, { v: meta.quotes, quotes: (await st.get("quotes", { type: "json" })) || [] })
      return json(req, { error: "bad_op" }, 400)
    }
    if (req.method !== "POST") return json(req, { error: "method" }, 405)

    let body: any
    try { body = await req.json() } catch { return json(req, { error: "bad_json" }, 400) }
    if (op === "login") {
      const u = await verifyUser(body?.username, String(body?.pin || ""))
      if (u) return json(req, { ok: true, user: publicUser(u, true) })
      const noAdmins = !users.some((x) => x.role === "admin")
      if (noAdmins && String(body?.username || "").trim().toLowerCase() === "admin" && (await legacyOk(String(body?.pin || "")))) return json(req, { ok: true, legacy: true })
      return json(req, { ok: false })
    }

    if (op === "rate") {
      // Day's rates: open to all staff with the shop key
      const rates = cleanRates(body?.entry?.rates)
      if (!rates["22k"] || !rates["18k"] || !rates["14k"] || !rates["9k"]) return json(req, { error: "bad_rates" }, 400)
      const entry = { id: cleanStr(body.entry.id, 20) || Math.random().toString(36).slice(2, 9), at: cleanNum(body.entry.at) || Date.now(), day: cleanStr(body.entry.day, 10), by: cleanStr(body.entry.by, 40), rates }
      const log: any[] = ((await st.get("rates", { type: "json" })) as any[]) || []
      const next = [entry, ...log.filter((e) => e.id !== entry.id)].sort((a, b) => b.at - a.at).slice(0, 500)
      await st.setJSON("rates", next)
      meta.rates = Date.now(); await saveMeta()
      return json(req, { v: meta.rates })
    }

    if (op === "quote") {
      // Quotes: shared by all phones with the shop key. Numbers (QT-000001…) are given here so they never clash.
      const q = cleanQuote(body?.quote)
      if (!q) return json(req, { error: "bad_quote" }, 400)
      const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
      const prev = list.find((x) => x.id === q.id)
      if (prev && (prev.updated || 0) > (q.updated || 0)) return json(req, { v: meta.quotes, quote: prev, conflict: true })
      if (prev?.no) q.no = prev.no
      if (!q.no) {
        const seq = (Number(((await st.get("quoteseq", { type: "json" })) as any)?.n) || 0) + 1
        await st.setJSON("quoteseq", { n: seq })
        q.no = "QT-" + String(seq).padStart(6, "0")
      }
      const next = [q, ...list.filter((x) => x.id !== q.id)].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 600)
      await st.setJSON("quotes", next)
      meta.quotes = Date.now(); await saveMeta()
      return json(req, { v: meta.quotes, quote: q })
    }

    const OP_PERM: Record<string, string> = { quotedel: "delQuote", stock: "stock", stockdel: "stockdel", ratelog: "rates", settings: "settings", users: "users" }
    if (!(await permOk(OP_PERM[op] || "users"))) return json(req, { error: "bad_pin" }, 403)

    if (op === "quotedel") {
      const id = cleanStr(body?.id, 24)
      const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
      await st.setJSON("quotes", list.filter((x) => x.id !== id))
      meta.quotes = Date.now(); await saveMeta()
      return json(req, { v: meta.quotes })
    }

    if (op === "stock") {
      const mode = body?.mode === "replace" ? "replace" : "add"
      const rows = (Array.isArray(body?.rows) ? body.rows : []).map(cleanRow).filter(Boolean)
      if (!rows.length) return json(req, { error: "no_rows" }, 400)
      const map = new Map<string, any>()
      if (mode === "add") for (const r of ((await st.get("stock", { type: "json" })) as any[]) || []) map.set(r.key, r)
      let added = 0, updated = 0
      for (const r of rows) { map.has(r.key) ? updated++ : added++; map.set(r.key, r) }
      const all = [...map.values()]
      await st.setJSON("stock", all)
      meta.stock = Date.now(); meta.count = all.length
      meta.history = [{ at: meta.stock, file: cleanStr(body.file, 80), rows: rows.length, added, updated, skipped: cleanNum(body.skipped) || 0, mode }, ...(meta.history || [])].slice(0, 100)
      await saveMeta()
      return json(req, { v: meta.stock, count: all.length, added, updated, history: meta.history })
    }

    if (op === "stockdel") {
      // Remove sold tags (admin)
      const keys = new Set((Array.isArray(body?.keys) ? body.keys : []).slice(0, 20000).map((k: any) => String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean))
      if (!keys.size) return json(req, { error: "no_keys" }, 400)
      const cur: any[] = ((await st.get("stock", { type: "json" })) as any[]) || []
      const left = cur.filter((r) => !keys.has(r.key))
      const removed = cur.length - left.length
      await st.setJSON("stock", left)
      meta.stock = Date.now(); meta.count = left.length
      meta.history = [{ at: meta.stock, file: cleanStr(body.note, 80) || "Sold tags removed", rows: removed, added: 0, updated: 0, removed, skipped: 0, mode: "sold" }, ...(meta.history || [])].slice(0, 100)
      await saveMeta()
      return json(req, { v: meta.stock, count: left.length, removed, history: meta.history })
    }

    if (op === "ratelog") {
      // One-time seeding of rate history from a phone (admin)
      const log = (Array.isArray(body?.log) ? body.log : []).map((e: any) => ({ id: cleanStr(e?.id, 20), at: cleanNum(e?.at) || 0, day: cleanStr(e?.day, 10), rates: cleanRates(e?.rates) })).filter((e: any) => e.id && e.at && e.rates["22k"])
      const cur: any[] = ((await st.get("rates", { type: "json" })) as any[]) || []
      const byId = new Map(cur.map((e) => [e.id, e]))
      for (const e of log) byId.set(e.id, e)
      const next = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, 500)
      await st.setJSON("rates", next)
      meta.rates = Date.now(); await saveMeta()
      return json(req, { v: meta.rates })
    }

    if (op === "settings") {
      const s = body?.settings || {}
      const out = {
        gst: Number.isFinite(Number(s.gst)) ? Number(s.gst) : 3,
        huid: Number.isFinite(Number(s.huid)) ? Number(s.huid) : 80,
        mkTable: {
          cz: (Array.isArray(s?.mkTable?.cz) ? s.mkTable.cz : []).slice(0, 200).map((x: any) => ({ purity: cleanStr(x?.purity, 12), slab: cleanStr(x?.slab, 40), mbd: cleanStr(x?.mbd, 20), mad: cleanStr(x?.mad, 20), rate: cleanStr(x?.rate, 20), cat: cleanStr(x?.cat, 40) })),
          dia: (Array.isArray(s?.mkTable?.dia) ? s.mkTable.dia : []).slice(0, 200).map((x: any) => ({ purity: cleanStr(x?.purity, 12), slab: cleanStr(x?.slab, 40), mbd: cleanStr(x?.mbd, 20), mad: cleanStr(x?.mad, 20), rate: cleanStr(x?.rate, 20), cat: cleanStr(x?.cat, 40) })),
        },
        cats: cleanCats(s?.cats),
        mkEdit: s?.mkEdit === "all" ? "all" : "admin",
        showRates: Array.isArray(s?.showRates) ? s.showRates.filter((x: any) => ["22k", "18k", "14k", "9k", "platinum", "silver"].includes(x)) : null,
      }
      await st.setJSON("settings", out)
      meta.settings = Date.now(); await saveMeta()
      return json(req, { v: meta.settings })
    }

    if (op === "users") {
      let nextRoles = roles
      if (Array.isArray(body?.roles)) {
        const seen = new Set<string>()
        nextRoles = body.roles.slice(0, 30).map((r: any) => ({
          id: cleanStr(r?.id, 24).toLowerCase().replace(/[^a-z0-9_-]/g, ""),
          name: cleanStr(r?.name, 30),
          perms: (Array.isArray(r?.perms) ? r.perms : []).filter((x: any) => PERMS.includes(x)),
        })).filter((r: any) => r.id && r.id !== "admin" && r.name && !seen.has(r.id) && seen.add(r.id))
      }
      const roleIds = new Set(["admin", ...nextRoles.map((r: any) => r.id)])
      const list = (Array.isArray(body?.users) ? body.users : []).slice(0, 200).map((u: any) => {
        const prev = users.find((x) => x.id === u?.id)
        return {
          id: cleanStr(u?.id, 24),
          name: cleanStr(u?.name, 40),
          username: cleanStr(u?.username, 30).trim().toLowerCase().replace(/[^a-z0-9._-]/g, ""),
          role: roleIds.has(u?.role) ? u.role : roleIds.has("staff") ? "staff" : [...roleIds][1] || "admin",
          active: u?.active !== false,
          // keep the stored PIN if this phone did not send one (admin hashes are not sent to staff phones)
          salt: /^[0-9a-f]{32}$/.test(u?.salt || "") ? u.salt : prev?.salt,
          hash: /^[0-9a-f]{64}$/.test(u?.hash || "") ? u.hash : prev?.hash,
        }
      }).filter((u: any) => u.id && u.username && u.salt && u.hash)
      const names = new Set(list.map((u: any) => u.username))
      if (names.size !== list.length) return json(req, { error: "duplicate_username" }, 400)
      if (!list.some((u: any) => u.role === "admin" && u.active)) return json(req, { error: "need_admin" }, 400)
      await st.setJSON("users", list)
      if (Array.isArray(body?.roles)) await st.setJSON("roles", nextRoles)
      meta.users = Date.now(); await saveMeta()
      return json(req, { v: meta.users })
    }

    return json(req, { error: "bad_op" }, 400)
  } catch (e) {
    console.error("sync error", op, e)
    return json(req, { error: "server" }, 500)
  }
}

export const config: Config = { path: "/api/sync", method: ["GET", "POST", "OPTIONS"] }
