import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"

// Shared database for all Yamie Price Check phones (Android app, iPhone home-screen app).
// Every call needs the shop key (env SHOP_KEY). Stock, settings and user changes need an admin login (x-user + x-pin).
// Stored in one site-wide Blobs store: meta, stock, rates, settings, users, auth (legacy admin PIN).

const APP_ORIGINS = ["https://appassets.androidplatform.net", "https://yamie-price-check.netlify.app"]
const STOCK_FIELDS = ["key", "barcode", "item", "category", "carat", "gw", "nw", "sw", "dw", "dq", "sa", "serial", "label", "location", "pcs", "sq", "supplier", "mk", "mkType", "huid", "huidNo", "cw", "stoneName", "saDia", "saClr", "labelDate", "size", "model", "nlc", "fva", "fvaMan", "mkMan", "imp", "pname", "design", "scol", "at"]
const RATE_KEYS = ["22k", "18k", "14k", "9k", "platinum", "silver"]

type Meta = { stock: number; rates: number; settings: number; users: number; quotes: number; leads?: number; imgs: number; count: number; history: any[] }

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") || ""
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type,x-shop-key,x-admin-pin,x-user,x-pin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  }
  // Any web address may call (the web version on a computer, a downloaded copy, a custom domain, deploy links):
  // the data is guarded by the shop key and user PINs in headers, never by cookies, so the caller's origin adds nothing
  h["Access-Control-Allow-Origin"] = APP_ORIGINS.includes(o) || o ? o : "*"
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
    if (["gw", "nw", "sw", "cw", "dw", "dq", "sa", "saDia", "saClr", "pcs", "sq", "huid", "nlc", "at"].includes(f)) o[f] = cleanNum(r[f])
    else o[f] = cleanStr(r[f])
  }
  o.key = o.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40)
  return o.key ? o : null
}
// Permissions an admin can give to a role (admin always has all)
const PERMS = ["search", "stFilters", "stRanges", "stSelect", "stExport", "shareItems", "shareAllPh", "sharePdf", "shareUser", "shareFv", "shareCost", "stock", "stockdel", "rates", "mkEdit", "mkDisc", "closeSale", "cancelQuote", "reopen", "delQuote", "images", "imgDel", "imgBulk", "stockList", "share", "addDisc", "round", "reports", "fva", "stockEdit", "stockAdd", "stockBulk", "approve", "leads", "textSize", "imgShow", "ratesShown", "charges", "mkHelper", "itemCodes", "pdRows", "pdHidden", "sync", "roles", "users", "settings"]
const SETTINGS_PERMS = ["imgShow", "ratesShown", "charges", "mkHelper", "itemCodes", "pdRows"]
const DEFAULT_ROLES = [
  { id: "manager", name: "Manager", perms: ["rates", "mkEdit", "mkDisc", "closeSale", "cancelQuote", "reopen", "images", "imgDel", "imgBulk", "stockList", "approve", "leads", "share", "pdHidden", "addDisc", "round", "reports", "fva", "stockEdit", "stockAdd", "stockBulk", "search", "stFilters", "stRanges", "stSelect", "stExport", "shareItems", "shareAllPh", "sharePdf", "shareUser", "shareFv", "shareCost"] },
  { id: "staff", name: "Staff", perms: ["rates", "closeSale", "cancelQuote", "share", "fva", "stockList", "search", "stFilters", "stRanges", "stSelect", "shareItems", "shareAllPh", "sharePdf", "shareUser", "shareFv"] },
]
// A quote as the app keeps it, minus anything large (photos stay on the phone that took them)
function cleanQuote(q: any) {
  if (!q || typeof q !== "object" || typeof q.id !== "string" || !q.id) return null
  const out = JSON.parse(JSON.stringify(q, (k, v) => (k === "photos" || k === "thumbs" ? undefined : v)))
  out.id = cleanStr(out.id, 24)
  const PROV = /^(P-[A-Z0-9]{1,8}-\d{1,6}|[A-Z0-9]{1,3}\/\d{2}\/\d{3,6})$/
  out.no = /^(QT|ON|SW)-\d{1,9}$/.test(out.no || "") || PROV.test(out.no || "") ? out.no : ""
  out.pno = PROV.test(out.pno || "") ? out.pno : ""
  out.byId = cleanStr(out.byId, 40)
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
  const meta: Meta = { stock: 0, rates: 0, settings: 0, users: 0, quotes: 0, imgs: 0, count: 0, history: [], ...((await st.get("meta", { type: "json" })) || {}) }
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
  // v1.7.1: roles that could give making discounts also approve quotes and share leads (once)
  if (!(meta as any).v171) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc")) for (const p of ["approve", "leads"]) if (!r.perms.includes(p)) { r.perms.push(p); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v171 = 1; await saveMeta()
  }
  // WhatsApp sharing became a permission: every existing role keeps it once (admins can then remove it)
  if (!(meta as any).v173) {
    let ch = false
    for (const r of roles) if (Array.isArray(r?.perms) && !r.perms.includes("share")) { r.perms.push("share"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v173 = 1; await saveMeta()
  }
  // Hidden details (NLC, FVA…): roles that give making discounts can see them (once)
  if (!(meta as any).v175) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc") && !r.perms.includes("pdHidden")) { r.perms.push("pdHidden"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v175 = 1; await saveMeta()
  }
  // Additional (flat) discount became a permission: roles that give making discounts keep it (once)
  if (!(meta as any).v178) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc") && !r.perms.includes("addDisc")) { r.perms.push("addDisc"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v178 = 1; await saveMeta()
  }
  // Round final amount down to ₹100 became a permission: roles that give making discounts keep it (once)
  if (!(meta as any).v1763) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc") && !r.perms.includes("round")) { r.perms.push("round"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1763 = 1; await saveMeta()
  }
  // Reports: roles that give making discounts (managers) can see them (once)
  // v1.8.6: search and sharing functions became permissions; existing roles keep what they could do (once)
  if (!(meta as any).v186) {
    let ch = false
    const add = (r: any, p: string) => { if (!r.perms.includes(p)) { r.perms.push(p); ch = true } }
    for (const r of roles) {
      if (!Array.isArray(r?.perms)) continue
      ;["search", "stFilters", "stRanges"].forEach((p) => add(r, p))
      if (r.perms.includes("share")) ["stSelect", "shareItems", "shareAllPh", "sharePdf", "shareUser", "shareFv"].forEach((p) => add(r, p))
      if (r.perms.includes("pdHidden")) add(r, "shareCost")
      if (r.perms.includes("reports")) add(r, "stExport")
    }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v186 = 1; await saveMeta()
  }
  if (!(meta as any).v1766) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc") && !r.perms.includes("reports")) { r.perms.push("reports"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1766 = 1; await saveMeta()
  }
  // Fair Value became a permission: every existing role keeps it once (admins can then remove it)
  if (!(meta as any).v1768) {
    let ch = false
    for (const r of roles) if (Array.isArray(r?.perms) && !r.perms.includes("fva")) { r.perms.push("fva"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1768 = 1; await saveMeta()
  }
  // Stock item edits / new items: roles that give making discounts (managers) can do it (once)
  if (!(meta as any).v1771) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("mkDisc") && !r.perms.includes("stockEdit")) { r.perms.push("stockEdit"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1771 = 1; await saveMeta()
  }
  // Sold register (V1.7.83): fill it once from the sales already closed
  if (!(meta as any).v1783) {
    try {
      const K = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      const reg: any = ((await st.get("sold", { type: "json" })) as any) || {}
      const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
      let n = 0
      for (const q of list) if (q?.status === "closed") for (const it of q.items || []) { const k = K(it?.sku); if (k && !reg[k]) { reg[k] = { at: q.closedAt || q.updated || 0, no: q.no || "", inv: q.invoice || "", by: q.closedBy || "" }; n++ } }
      if (n) { await st.setJSON("sold", reg); (meta as any).sold = Date.now() }
    } catch {}
    ;(meta as any).v1783 = 1; await saveMeta()
  }
  // V1.8.2 photo permissions and the stock list in the app: roles that add photos can also delete / bulk upload; every role keeps the stock list (once)
  if (!(meta as any).v182) {
    let ch = false
    for (const r of roles) {
      if (!Array.isArray(r?.perms)) continue
      if (r.perms.includes("images")) for (const k of ["imgDel", "imgBulk"]) if (!r.perms.includes(k)) { r.perms.push(k); ch = true }
      if (!r.perms.includes("stockList")) { r.perms.push("stockList"); ch = true }
    }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v182 = 1; await saveMeta()
  }
  // Adding new items became its own permission: roles that edit stock items keep it (once)
  if (!(meta as any).v1772) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("stockEdit") && !r.perms.includes("stockAdd")) { r.perms.push("stockAdd"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1772 = 1; await saveMeta()
  }
  // Bulk update became its own permission: roles that edit stock items keep it (once)
  if (!(meta as any).v1775) {
    let ch = false
    for (const r of roles) if (r?.perms?.includes("stockEdit") && !r.perms.includes("stockBulk")) { r.perms.push("stockBulk"); ch = true }
    if (ch && (await st.get("roles"))) { await st.setJSON("roles", roles); meta.users = Date.now() }
    ;(meta as any).v1775 = 1; await saveMeta()
  }
  const roleHas = (role: string, perm: string) => {
    if (role === "admin") return true
    if (perm === "stock" || perm === "theme" || perm === "footer" || perm === "apprSet" || perm === "special" || perm === "promos" || perm === "rules") return false   // stock data and theme: admins only
    const ps: string[] = roles.find((r) => r.id === role)?.perms || []
    return ps.includes(perm) || (ps.includes("settings") && [...SETTINGS_PERMS, "textSize"].includes(perm)) || (perm === "roles" && ps.includes("users"))
  }
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
  // Which permissions the caller has (for settings and users, where each part has its own permission)
  const callerRole = async () => {
    const un = req.headers.get("x-user") || "", p = req.headers.get("x-pin") || ""
    if (un) { const u = await verifyUser(un, p); if (u) return u.role; if (!users.some((x) => x.role === "admin") && un.toLowerCase() === "admin" && (await legacyOk(p))) return "admin"; return "" }
    if (!users.length && (await legacyOk(req.headers.get("x-admin-pin") || ""))) return "admin"
    return ""
  }
  const publicUser = (u: any, withHash: boolean) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active !== false, seeAll: !!u.seeAll, ...(withHash ? { salt: u.salt, hash: u.hash } : {}) })

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
      // Product photos: one small JPEG per label, plus an index of which labels have one
      // V1.8.2 several photos per label: photo 1 is img/K, more are img/K/2, img/K/3 …; "imgn" counts them (labels with 2 or more)
      if (op === "imgidx") return json(req, { v: meta.imgs, idx: (await st.get("imgidx", { type: "json" })) || {}, n: (await st.get("imgn", { type: "json" })) || {} })
      if (op === "img") {
        const sp = new URL(req.url).searchParams
        const k = cleanStr(sp.get("k"), 40).toUpperCase().replace(/[^A-Z0-9]/g, ""), i = Math.max(1, Math.min(IMG_MAX, Number(sp.get("i")) || 1))
        return json(req, { img: k ? (await st.get(imgPath(k, i))) || null : null, i })
      }
      if (op === "quotes") return json(req, { v: meta.quotes, quotes: (await st.get("quotes", { type: "json" })) || [] })
      if (op === "leads") return json(req, { v: meta.leads || 0, leads: (await st.get("leads", { type: "json" })) || [] })
      if (op === "pattrs") return json(req, { v: (meta as any).pattrs || 0, map: ((await st.get("pattrs", { type: "json" })) as any) || {} })
      if (op === "pnames") return json(req, { v: (meta as any).pnames || 0, map: ((await st.get("pnames", { type: "json" })) as any) || {} })
      if (op === "soldlist") {
        // The sold register: labels of completed sales. They never come back into stock or a quote.
        const sold = ((await st.get("sold", { type: "json" })) as any) || {}
        return json(req, { v: (meta as any).sold || 0, sold })
      }
      if (op === "shoplinks") {
        // V1.8.0 label no. (product SKU) -> the product page on the Shopify store; cached for an hour
        const cached: any = await st.get("shoplinks", { type: "json" })
        const want = new URL(req.url).searchParams.get("refresh") === "1" && (!cached || Date.now() - (cached.at || 0) > 60e3)
        if (cached && !want && Date.now() - (cached.at || 0) < 3600e3) return json(req, cached)
        try {
          const { gql } = await shopifyApi()
          const map: Record<string, { u: string; t: string }> = {}
          let after: string | null = null, base = ""
          for (let page = 0; page < 100; page++) {
            const d: any = await gql("query($a:String){ shop { primaryDomain { url } } products(first:100, after:$a, query:\"status:active\") { pageInfo { hasNextPage endCursor } nodes { title handle onlineStoreUrl variants(first:5) { nodes { sku } } } } }", { a: after })
            base = base || String(d?.shop?.primaryDomain?.url || "").replace(/\/$/, "")
            for (const p of d?.products?.nodes || []) {
              const u = p.onlineStoreUrl || (base && p.handle ? base + "/products/" + p.handle : "")
              if (!u) continue
              for (const v of p.variants?.nodes || []) { const k = String(v?.sku || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (k) map[k] = { u: cleanStr(u, 300), t: cleanStr(p.title, 120) } }
            }
            if (!d?.products?.pageInfo?.hasNextPage) break
            after = d.products.pageInfo.endCursor
          }
          const out = { at: Date.now(), ok: true, n: Object.keys(map).length, map }
          await st.setJSON("shoplinks", out)
          return json(req, out)
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 200)
          const out = cached && cached.ok ? { ...cached, stale: true, msg } : { at: Date.now(), ok: false, msg, map: {} }
          if (!(cached && cached.ok)) await st.setJSON("shoplinks", out)
          return json(req, out)
        }
      }
      if (op === "held") {
        // One label, one open quote: which of these labels are already in another open quote (not closed)
        const K = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
        const keys = new Set(String(new URL(req.url).searchParams.get("keys") || "").split(",").map(K).filter(Boolean).slice(0, 50))
        const me = cleanStr(new URL(req.url).searchParams.get("id"), 24)
        const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
        const held: any[] = []
        const soldReg = ((await st.get("sold", { type: "json" })) as any) || {}
        const sold = [...keys].filter((k) => soldReg[k]).map((k) => ({ key: k, ...soldReg[k] }))
        for (const q of list) {
          if (!q || q.id === me || q.status === "closed" || q.status === "cancelled" || q.void) continue
          for (const it of q.items || []) {
            const k = K(it?.sku)
            if (keys.has(k) && !held.some((h) => h.key === k)) held.push({ key: k, id: q.id, no: q.no || "", by: q.by || "", cust: q.cust?.name || "", at: q.updated || 0 })
          }
        }
        return json(req, { held, sold })
      }
      if (op === "inbox") {
        // Small summary for notifications (phones poll this): quotes waiting for approval, approved quotes, leads
        const qs: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
        const ls: any[] = ((await st.get("leads", { type: "json" })) as any[]) || []
        const pending = qs.filter((q) => q?.appr?.state === "pending" && q.status !== "cancelled" && q.status !== "closed").slice(0, 50)
          .map((q) => ({ id: q.id, no: q.no || "", name: cleanStr(q.cust?.name, 40), by: q.appr.reqBy || "", byName: cleanStr(q.appr.reqName, 40), to: cleanStr(q.appr.to, 40), kind: cleanStr(q.appr.kind, 12), at: q.appr.reqAt || q.updated || 0 }))
        const approved = qs.filter((q) => q?.appr?.state === "approved" && q.appr.at > Date.now() - 3 * 864e5).slice(0, 50)
          .map((q) => ({ id: q.id, no: q.no || "", name: cleanStr(q.cust?.name, 40), to: q.appr.reqBy || "", byName: cleanStr(q.appr.by, 40), at: q.appr.at || 0 }))
        const leads = ls.filter((l) => l.state === "new").slice(0, 50).map((l) => ({ id: l.id, to: l.to || "", name: cleanStr(l.name, 40), byName: cleanStr(l.byName, 40), at: l.at || 0, kind: l.kind || "", n: Array.isArray(l.keys) ? l.keys.length : 0 }))
        return json(req, { q: meta.quotes, l: meta.leads || 0, u: meta.users || 0, s: meta.settings || 0, st: meta.stock || 0, sd: (meta as any).sold || 0, pn: (meta as any).pnames || 0, pa: (meta as any).pattrs || 0, pending, approved, leads })
      }
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
      // Day's rates: only a user whose role has "Set day's rates" (V1.8.7; before, anyone with the shop key could)
      if (!(await permOk("rates"))) return json(req, { error: "bad_pin" }, 403)
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
      // A phone that has not seen the approval yet must not undo it (stale "pending" copy)
      if (prev?.appr?.state === "approved" && q.appr?.state === "pending" && (q.appr.reqAt || 0) <= (prev.appr.reqAt || 0))
        return json(req, { v: meta.quotes, quote: prev, conflict: true })
      // Numbers are given here so they never clash:
      //  - a quotation number per staff member when the quote is first saved: first 3 letters of the name / year / number
      //    e.g. RAV/26/274 (Ravi's 274th quote of 2026; the count starts again each year)
      //  - the common series number (QT-000001…) once the sale is closed
      if (prev?.no) q.no = prev.no
      if (prev?.pno) q.pno = prev.pno
      if (!q.no) {
        const us: any[] = ((await st.get("users", { type: "json" })) as any[]) || []
        const u = us.find((x) => x.id === q.byId) || us.find((x) => x.name === q.by)
        const nm = String(u?.name || q.by || u?.username || "USR").toUpperCase().replace(/[^A-Z]/g, "")
        const code = (nm || String(u?.username || "USR").toUpperCase().replace(/[^A-Z0-9]/g, "") || "USR").slice(0, 3)
        const yy = String(new Date(Date.now() + 5.5 * 3600e3).getUTCFullYear()).slice(-2)   // India time
        const sk = "qseq-" + (u?.id || code).replace(/[^\w-]/g, "") + "-" + yy
        const n = (Number(((await st.get(sk, { type: "json" })) as any)?.n) || 0) + 1
        await st.setJSON(sk, { n })
        q.no = q.pno = code + "/" + yy + "/" + String(n).padStart(3, "0")
      }
      // The final number is given when a manager/admin approves the quote, or when the sale is closed.
      // Separate series by sale type: online enquiries ON-000001…, store walk-ins SW-000001… (older QT- numbers stay).
      if ((q.status === "closed" || q.appr?.state === "approved") && !/^(QT|ON|SW)-/.test(q.no)) {
        const online = q.channel === "online", sk = online ? "quoteseq-online" : "quoteseq-store"
        const seq = (Number(((await st.get(sk, { type: "json" })) as any)?.n) || 0) + 1
        await st.setJSON(sk, { n: seq })
        q.pno = q.pno || q.no
        q.no = (online ? "ON-" : "SW-") + String(seq).padStart(6, "0")
      }
      const next = [q, ...list.filter((x) => x.id !== q.id)].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 600)
      await st.setJSON("quotes", next)
      meta.quotes = Date.now(); await saveMeta()
      return json(req, { v: meta.quotes, quote: q })
    }

    if (op === "lead") {
      // WhatsApp leads given to a staff member (open to phones with the shop key, like quotes)
      const l = body?.lead
      if (!l || typeof l.id !== "string" || !l.id) return json(req, { error: "bad_lead" }, 400)
      const lead = {
        id: cleanStr(l.id, 24), name: cleanStr(l.name, 60), phone: cleanStr(l.phone, 20), note: cleanStr(l.note, 1000),
        to: cleanStr(l.to, 40), toName: cleanStr(l.toName, 60), by: cleanStr(l.by, 40), byName: cleanStr(l.byName, 60),
        at: cleanNum(l.at) || Date.now(), state: ["new", "open", "done"].includes(l.state) ? l.state : "new", quoteId: cleanStr(l.quoteId, 24), updated: Date.now(),
        // V1.7.88 items picked in Search and sent to a user
        kind: l.kind === "items" ? "items" : "", keys: Array.isArray(l.keys) ? l.keys.slice(0, 500).map((k: any) => cleanStr(k, 40)).filter(Boolean) : [],
      }
      const list: any[] = ((await st.get("leads", { type: "json" })) as any[]) || []
      const next = [lead, ...list.filter((x) => x.id !== lead.id)].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 500)
      await st.setJSON("leads", next)
      meta.leads = Date.now(); await saveMeta()
      return json(req, { v: meta.leads, lead })
    }

    const OP_PERM: Record<string, string> = { unsell: "stock", release: "approve", img: "images", quotedel: "delQuote", stock: "stock", stockdel: "stockdel", ratelog: "rates", pubrates: "rates", stockrow: "stockEdit", stocksold: "closeSale", pname: "images", pattr: "images" }
    const role = await callerRole()
    if (op === "settings") { if (!role || ![...SETTINGS_PERMS, "theme", "footer", "apprSet", "promos", "rules"].some((p) => roleHas(role, p))) return json(req, { error: "bad_pin" }, 403) }
    else if (op === "users") { if (!role || !(roleHas(role, "users") || roleHas(role, "roles"))) return json(req, { error: "bad_pin" }, 403) }
    else if (op === "pattr") { if (!(await permOk("images")) && !(await permOk("stockEdit")) && !(await permOk("stockAdd")) && !(await permOk("stockBulk"))) return json(req, { error: "bad_pin" }, 403) }
    else if (op === "pname") { if (!(await permOk("images")) && !(await permOk("stockEdit")) && !(await permOk("stockAdd")) && !(await permOk("stockBulk"))) return json(req, { error: "bad_pin" }, 403) }
    else if (op === "stockrow") { if (!(await permOk("stockEdit")) && !(await permOk("stockAdd")) && !(await permOk("stockBulk"))) return json(req, { error: "bad_pin" }, 403) }
    else if (!(await permOk(OP_PERM[op] || "users"))) return json(req, { error: "bad_pin" }, 403)

    if (op === "img") {
      // act: add (next free slot) · set (replace photo i) · del (remove photo i, later ones move up) · main (photo i becomes photo 1) · none = old apps (set photo 1, or remove all)
      const k = cleanStr(body?.key, 40).toUpperCase().replace(/[^A-Z0-9]/g, "")
      const img = typeof body?.img === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.img) && body.img.length < 400000 ? body.img : null
      if (!k) return json(req, { error: "bad_key" }, 400)
      const act = ["add", "set", "del", "main"].includes(body?.act) ? body.act : img ? "set" : "clear"
      if ((act === "del" || act === "clear" || (act === "set" && !!(await st.get(imgPath(k, Number(body?.i) || 1))))) && !(await permOk("imgDel"))) return json(req, { error: "bad_pin" }, 403)
      const idx: any = (await st.get("imgidx", { type: "json" })) || {}, cnt: any = (await st.get("imgn", { type: "json" })) || {}
      let n = idx[k] ? Math.max(1, Number(cnt[k]) || 1) : 0
      const i = Math.max(1, Math.min(n + (act === "add" ? 1 : 0) || 1, Number(body?.i) || 1))
      if (act === "add" || act === "set") {
        if (!img) return json(req, { error: "bad_img" }, 400)
        const slot = act === "add" ? n + 1 : i
        if (slot > IMG_MAX) return json(req, { error: "too_many", max: IMG_MAX }, 400)
        await st.set(imgPath(k, slot), img); n = Math.max(n, slot)
      } else if (act === "del" && n) {
        for (let j = i; j < n; j++) { const nx = await st.get(imgPath(k, j + 1)); if (nx) await st.set(imgPath(k, j), nx) }
        await st.delete(imgPath(k, n)); n--
      } else if (act === "main" && i > 1 && i <= n) {
        const a = await st.get(imgPath(k, 1)), b = await st.get(imgPath(k, i))
        if (a && b) { await st.set(imgPath(k, 1), b); await st.set(imgPath(k, i), a) }
      } else if (act === "clear") {
        for (let j = 1; j <= Math.max(n, 1); j++) await st.delete(imgPath(k, j)); n = 0
      }
      if (n) { idx[k] = Date.now(); if (n > 1) cnt[k] = n; else delete cnt[k] } else { delete idx[k]; delete cnt[k] }
      await st.setJSON("imgidx", idx); await st.setJSON("imgn", cnt)
      meta.imgs = Date.now(); await saveMeta()
      return json(req, { v: meta.imgs, idx, n: cnt, count: n })
    }

    const soldReg = async () => (((await st.get("sold", { type: "json" })) as any) || {}) as Record<string, any>
    if (op === "unsell") {
      // Admin: take a label off the sold register (sale cancelled or returned)
      const K = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      const key = K(body?.key), reg = await soldReg()
      if (!key || !reg[key]) return json(req, { error: "not_sold" }, 404)
      delete reg[key]; await st.setJSON("sold", reg); (meta as any).sold = Date.now(); await saveMeta()
      return json(req, { sv: (meta as any).sold })
    }

    if (op === "release") {
      // A manager / admin takes a label out of another open quote (an abandoned quote holding it)
      const K = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      const key = K(body?.key), from = cleanStr(body?.from, 24)
      const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
      const q = list.find((x) => x.id === from)
      if (!key || !q) return json(req, { error: "not_found" }, 404)
      const before = (q.items || []).length
      q.items = (q.items || []).filter((it: any) => K(it?.sku) !== key)
      if (q.items.length === before) return json(req, { error: "not_held" }, 409)
      q.updated = Date.now()
      q.released = [...(Array.isArray(q.released) ? q.released : []), { key, by: cleanStr(body?.by, 60), at: q.updated }].slice(-20)
      await st.setJSON("quotes", [q, ...list.filter((x) => x.id !== q.id)])
      meta.quotes = Date.now(); await saveMeta()
      return json(req, { v: meta.quotes, quote: q })
    }

    if (op === "quotedel") {
      const id = cleanStr(body?.id, 24)
      const list: any[] = ((await st.get("quotes", { type: "json" })) as any[]) || []
      await st.setJSON("quotes", list.filter((x) => x.id !== id))
      meta.quotes = Date.now(); await saveMeta()
      return json(req, { v: meta.quotes })
    }

    if (op === "stock") {
      const mode = body?.mode === "replace" ? "replace" : "add"
      // sold labels are never loaded again from a stock sheet
      const reg = await soldReg()
      const all0 = (Array.isArray(body?.rows) ? body.rows : []).map(cleanRow).filter(Boolean)
      const rows = all0.filter((r: any) => !reg[r.key]), soldOut = all0.length - rows.length
      if (!rows.length) return json(req, { error: "no_rows" }, 400)
      const map = new Map<string, any>()
      if (mode === "add") for (const r of ((await st.get("stock", { type: "json" })) as any[]) || []) map.set(r.key, r)
      let added = 0, updated = 0
      for (const r of rows) { map.has(r.key) ? updated++ : added++; map.set(r.key, r) }
      const all = [...map.values()]
      await st.setJSON("stock", all)
      meta.stock = Date.now(); meta.count = all.length
      meta.history = [{ at: meta.stock, file: cleanStr(body.file, 80), rows: rows.length, added, updated, skipped: cleanNum(body.skipped) || 0, sold: soldOut, mode }, ...(meta.history || [])].slice(0, 100)
      await saveMeta()
      return json(req, { v: meta.stock, count: all.length, added, updated, sold: soldOut, history: meta.history })
    }

    if (op === "stockrow" && Array.isArray(body?.rows)) {
      // Bulk update: label details changed on many existing items at once (never adds items)
      if (!(await permOk("stockBulk"))) return json(req, { error: "bad_pin", need: "stockBulk" }, 403)
      const rows = body.rows.slice(0, 1000).map(cleanRow).filter(Boolean)
      const cur: any[] = ((await st.get("stock", { type: "json" })) as any[]) || []
      const idx = new Map(cur.map((x, i) => [x.key, i]))
      let updated = 0
      const reg = await soldReg()
      for (const r of rows) { const i = idx.get(r.key); if (i != null && !reg[r.key]) { cur[i] = r; updated++ } }
      if (!updated) return json(req, { error: "no_rows" }, 400)
      await st.setJSON("stock", cur)
      meta.stock = Date.now(); meta.count = cur.length
      meta.history = [{ at: meta.stock, file: "Bulk update · " + cleanStr(body?.what, 60) + (body?.by ? " · " + cleanStr(body.by, 40) : ""), rows: updated, added: 0, updated, skipped: rows.length - updated, mode: "edit" }, ...(meta.history || [])].slice(0, 100)
      await saveMeta()
      return json(req, { v: meta.stock, count: cur.length, updated, history: meta.history })
    }

    if (op === "pattr") {
      // V1.8.4 per-item design (jewellery type) and up to 5 stone colours, kept apart from the stock sheet
      const map: any = ((await st.get("pattrs", { type: "json" })) as any) || {}
      let n = 0
      for (const [k0, v] of Object.entries(body?.map && typeof body.map === "object" ? body.map : {}).slice(0, 5000)) {
        const k = cleanStr(k0, 40).toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!k) continue
        const o: any = v && typeof v === "object" ? v : {}
        const jt = cleanStr(o.jt, 60).replace(/\s+/g, " ").trim()
        const sc = Array.isArray(o.sc) ? [...new Set(o.sc.map((x: any) => cleanStr(x, 30).trim()).filter(Boolean))].slice(0, 5) : []
        if (jt || sc.length) map[k] = { ...(jt ? { jt } : {}), ...(sc.length ? { sc } : {}) }; else delete map[k]
        n++
      }
      await st.setJSON("pattrs", map)
      ;(meta as any).pattrs = Date.now(); await saveMeta()
      return json(req, { v: (meta as any).pattrs, n, map })
    }
    if (op === "pname") {
      // V1.8.3 product names (e.g. "Pink Solo Ring"), kept apart from the stock sheet so a new upload never wipes them
      const map: any = ((await st.get("pnames", { type: "json" })) as any) || {}
      const src: Record<string, any> = body?.map && typeof body.map === "object" ? body.map : { [String(body?.key || "")]: body?.name }
      let n = 0
      for (const [k0, v] of Object.entries(src).slice(0, 5000)) {
        const k = cleanStr(k0, 40).toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!k) continue
        const name = cleanStr(v, 80).replace(/\s+/g, " ").trim()
        if (name) map[k] = name; else delete map[k]
        n++
      }
      await st.setJSON("pnames", map)
      ;(meta as any).pnames = Date.now(); await saveMeta()
      return json(req, { v: (meta as any).pnames, n, map })
    }
    if (op === "stockrow") {
      // A manager corrects one item or adds a new one; every phone gets it at its next check
      const r = cleanRow(body?.row)
      { const reg = await soldReg(); if (r && reg[r.key]) return json(req, { error: "sold", sold: { key: r.key, ...reg[r.key] } }, 409) }
      if (!r) return json(req, { error: "bad_row" }, 400)
      const cur: any[] = ((await st.get("stock", { type: "json" })) as any[]) || []
      const i = cur.findIndex((x) => x.key === r.key)
      const isNew = i < 0
      if (!(await permOk(isNew ? "stockAdd" : "stockEdit"))) return json(req, { error: "bad_pin", need: isNew ? "stockAdd" : "stockEdit" }, 403)
      if (isNew) cur.push(r); else cur[i] = r
      await st.setJSON("stock", cur)
      meta.stock = Date.now(); meta.count = cur.length
      meta.history = [{ at: meta.stock, file: (isNew ? "New item " : "Edited ") + r.barcode + (body?.by ? " · " + cleanStr(body.by, 40) : ""), rows: 1, added: isNew ? 1 : 0, updated: isNew ? 0 : 1, skipped: 0, mode: "edit" }, ...(meta.history || [])].slice(0, 100)
      await saveMeta()
      return json(req, { v: meta.stock, count: cur.length, row: r, isNew, history: meta.history })
    }

    if (op === "stocksold") {
      // Tags of a completed sale leave the stock list (whoever closes the sale)
      const keys = new Set((Array.isArray(body?.keys) ? body.keys : []).slice(0, 200).map((k: any) => String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean))
      if (!keys.size) return json(req, { error: "no_keys" }, 400)
      // every label of the sale goes on the sold register (even one missing from the stock list)
      const reg = await soldReg(), now = Date.now()
      for (const k of keys) if (!reg[k]) reg[k] = { at: now, no: cleanStr(body?.no, 30), inv: cleanStr(body?.inv, 40), by: cleanStr(body?.by, 40) }
      await st.setJSON("sold", reg); (meta as any).sold = now
      const cur: any[] = ((await st.get("stock", { type: "json" })) as any[]) || []
      const left = cur.filter((r) => !keys.has(r.key)), removed = cur.length - left.length
      if (removed) {
        await st.setJSON("stock", left)
        meta.stock = Date.now(); meta.count = left.length
        meta.history = [{ at: meta.stock, file: cleanStr(body?.note, 80) || "Sold", rows: removed, added: 0, updated: 0, removed, skipped: 0, mode: "sold" }, ...(meta.history || [])].slice(0, 100)
      }
      await saveMeta()
      return json(req, { v: meta.stock, count: left.length, removed, sv: (meta as any).sold, history: meta.history })
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

    if (op === "pubrates") {
      // Publish the day's rates: the Grand Jewellers kiosk and the Yamie Shopify store (rate metafields)
      const rin = body?.rates || {}, pick = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null }
      const rates: Record<string, number> = {}
      for (const [k, src] of [["r22", "22k"], ["r18", "18k"], ["r14", "14k"], ["r9", "9k"], ["platinum", "platinum"], ["silver", "silver"]]) { const v = pick(rin[src]); if (v) rates[k] = v }
      if (!rates.r22) return json(req, { error: "no_rates" }, 400)
      const out: any = {}
      if (body?.kiosk) {
        const pin = process.env.KIOSK_RATES_PIN, url = process.env.KIOSK_URL || "https://grandjewellers.com"
        if (!pin) out.kiosk = { ok: false, msg: "Not set up: add KIOSK_RATES_PIN in Netlify" }
        else try {
          const r = await fetch(url + "/api/kiosk-rates", { method: "POST", headers: { "content-type": "application/json", "x-admin-pin": pin }, body: JSON.stringify({ pin, ...rates }) })
          out.kiosk = r.ok ? { ok: true, msg: "Kiosk updated" } : { ok: false, msg: r.status === 401 ? "Kiosk PIN is wrong" : "Kiosk said " + r.status }
        } catch (e) { out.kiosk = { ok: false, msg: "Kiosk not reachable" } }
      }
      if (body?.shopify) {
        const dom = (process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        try {
          if (!dom) throw new Error("Not set up: add SHOPIFY_STORE_DOMAIN in Netlify")
          const { gql } = await shopifyApi()
          const shopId = (await gql("{ shop { id } }"))?.shop?.id
          const keys: Record<string, string> = { r22: "gold_rate_22k", r18: "gold_rate_18k", r14: "gold_rate_14k", r9: "gold_rate_9k", platinum: "gold_rate_platinum", silver: "gold_rate_silver" }
          const metafields = Object.entries(rates).map(([k, v]) => ({ ownerId: shopId, namespace: "custom", key: keys[k], type: "single_line_text_field", value: String(v) }))
          const d = await gql("mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }", { m: metafields })
          const ue = d?.metafieldsSet?.userErrors || []
          out.shopify = ue.length ? { ok: false, msg: ue[0].message } : { ok: true, msg: "Shopify rates updated" }
        } catch (e: any) { out.shopify = { ok: false, msg: String(e?.message || e) } }
      }
      return json(req, out)
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
        showImg: s?.showImg !== false,
        ui: ["iosBrand", "iosTrue", "android"].includes(s?.ui) ? s.ui : "iosBrand",
        accent: ["brand", "blue", "maroon", "gold", "emerald", "navy", "rose"].includes(s?.accent) ? s.accent : "brand",
        tabHide: Object.fromEntries(Object.entries(s?.tabHide && typeof s.tabHide === "object" ? s.tabHide : {}).slice(0, 20).filter(([k]) => /^[\w-]{1,40}$/.test(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter((x: any) => ["tabScan", "tabFind", "tabQuote", "tabRates", "tabSet"].includes(x))])),
        apprOn: s?.apprOn !== false,
        // Special promotions (admin): applied to every quote while running
        // Pricing rules (admin): making / wastage / labour, fair value and diamond rate by purity, weight, type, supplier, NLC…
        priceRules: (Array.isArray(s?.priceRules) ? s.priceRules : []).slice(0, 80).map((r: any) => ({
          id: cleanStr(r?.id, 24), name: cleanStr(r?.name, 60), on: r?.on !== false, mode: r?.mode === "fill" ? "fill" : "over",
          pur: (Array.isArray(r?.pur) ? r.pur : []).filter((x: any) => ["24k", "22k", "18k", "14k", "9k", "platinum", "silver"].includes(x)),
          wMin: cleanNum(r?.wMin), wMax: cleanNum(r?.wMax), nlcMin: cleanNum(r?.nlcMin), nlcMax: cleanNum(r?.nlcMax),
          cats: (Array.isArray(r?.cats) ? r.cats : []).filter((x: any) => typeof x === "string" && /^[A-Z]{2,4}$/.test(x)).slice(0, 40),
          names: (Array.isArray(r?.names) ? r.names : []).map((x: any) => cleanStr(x, 80).toLowerCase()).filter(Boolean).slice(0, 60),
          subs: (Array.isArray(r?.subs) ? r.subs : []).map((x: any) => cleanStr(x, 80).toLowerCase()).filter(Boolean).slice(0, 60),
          imp: ["", "yes", "no"].includes(r?.imp) ? r.imp : "",
          mkt: ["", "pct", "pergram", "fixed", "none"].includes(r?.mkt) ? r.mkt : "", sup: cleanStr(r?.sup, 40), pre: cleanStr(r?.pre, 12),
          dia: ["", "yes", "no"].includes(r?.dia) ? r.dia : "",
          mkType: ["", "pct", "pergram", "fixed"].includes(r?.mkType) ? r.mkType : "", mkVal: cleanNum(r?.mkVal),
          fvaType: ["", "pct", "fixed"].includes(r?.fvaType) ? r.fvaType : "", fvaVal: cleanNum(r?.fvaVal), diaRate: cleanNum(r?.diaRate),
        })).filter((r: any) => r.id && r.name),
        promos: (Array.isArray(s?.promos) ? s.promos : []).slice(0, 20).map((x: any) => ({
          id: cleanStr(x?.id, 24), name: cleanStr(x?.name, 60), msg: cleanStr(x?.msg, 300), on: x?.on !== false,
          from: /^\d{4}-\d{2}-\d{2}$/.test(x?.from || "") ? x.from : "", to: /^\d{4}-\d{2}-\d{2}$/.test(x?.to || "") ? x.to : "",
          basis: ["all", "value", "weight", "diamond"].includes(x?.basis) ? x.basis : "all", min: Math.max(0, cleanNum(x?.min) || 0),
          kind: ["mkPct", "diaPct", "goldPg", "flat", "valPct"].includes(x?.kind) ? x.kind : "mkPct", val: Math.max(0, cleanNum(x?.val) || 0),
          sale: ["any", "store", "online"].includes(x?.sale) ? x.sale : "any",
        })).filter((x: any) => x.id && x.name),
        // Making conventions per item type and purity (making, fair value, note) and the label check after a scan
        mkConv: (Array.isArray(s?.mkConv) ? s.mkConv : []).slice(0, 150).map((x: any) => ({
          code: /^[A-Z]{2,4}$/.test(x?.code || "") ? x.code : "", pur: ["", "24k", "22k", "18k", "14k", "9k", "platinum", "silver"].includes(x?.pur) ? x.pur : "",
          mk: cleanStr(x?.mk, 20), fva: cleanStr(x?.fva, 20), note: cleanStr(x?.note, 120),
        })).filter((x: any) => x.mk || x.fva || x.note),
        chkOn: s?.chkOn !== false,
        pdHide: (Array.isArray(s?.pdHide) ? s.pdHide : []).filter((x: any) => typeof x === "string" && /^[a-zA-Z]{1,16}$/.test(x)).slice(0, 30),
        showRates: Array.isArray(s?.showRates) ? s.showRates.filter((x: any) => ["22k", "18k", "14k", "9k", "platinum", "silver"].includes(x)) : null,
      }
      // Keep the parts this user may not change
      const prev: any = (await st.get("settings", { type: "json" })) || {}
      const keep = (perm: string, keys: string[]) => { if (!roleHas(role, perm)) keys.forEach((k) => { if (k in prev) (out as any)[k] = prev[k] }) }
      keep("charges", ["gst", "huid"]); keep("mkHelper", ["mkTable", "mkConv", "chkOn"]); keep("itemCodes", ["cats"]); keep("ratesShown", ["showRates"]); keep("imgShow", ["showImg", "mkEdit"]); keep("theme", ["ui", "accent"]); keep("pdRows", ["pdHide"]); keep("footer", ["tabHide"]); keep("apprSet", ["apprOn"]); keep("promos", ["promos"]); keep("rules", ["priceRules"])
      await st.setJSON("settings", out)
      meta.settings = Date.now(); await saveMeta()
      return json(req, { v: meta.settings })
    }

    if (op === "users") {
      let nextRoles = roles
      if (Array.isArray(body?.roles) && roleHas(role, "roles")) {
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
          // "See all quotes" is set by an admin only
          seeAll: role === "admin" ? !!u?.seeAll : !!prev?.seeAll,
          // keep the stored PIN if this phone did not send one (admin hashes are not sent to staff phones)
          salt: /^[0-9a-f]{32}$/.test(u?.salt || "") ? u.salt : prev?.salt,
          hash: /^[0-9a-f]{64}$/.test(u?.hash || "") ? u.hash : prev?.hash,
        }
      }).filter((u: any) => u.id && u.username && u.salt && u.hash)
      const names = new Set(list.map((u: any) => u.username))
      if (names.size !== list.length) return json(req, { error: "duplicate_username" }, 400)
      if (!list.some((u: any) => u.role === "admin" && u.active)) return json(req, { error: "need_admin" }, 400)
      if (roleHas(role, "users")) await st.setJSON("users", list)
      if (Array.isArray(body?.roles) && roleHas(role, "roles")) await st.setJSON("roles", nextRoles)
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

// Shopify Admin API for the store in SHOPIFY_STORE_DOMAIN (token, or client id + secret). Secrets stay in Netlify.
async function shopifyApi() {
  const dom = (process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  if (!dom) throw new Error("Not set up: add SHOPIFY_STORE_DOMAIN in Netlify")
  let token = process.env.SHOPIFY_ADMIN_TOKEN || ""
  if (!token) {
    const id = process.env.SHOPIFY_CLIENT_ID, sec = process.env.SHOPIFY_CLIENT_SECRET
    if (!id || !sec) throw new Error("Not set up: add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Netlify")
    const tr = await fetch(`https://${dom}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: id, client_secret: sec, grant_type: "client_credentials" }) })
    const tj: any = await tr.json().catch(() => ({}))
    if (!tr.ok || !tj.access_token) throw new Error("Shopify login failed (" + tr.status + ")")
    token = tj.access_token
  }
  const gql = async (query: string, variables?: any) => {
    const r = await fetch(`https://${dom}/admin/api/2025-01/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ query, variables }) })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || j.errors) throw new Error("Shopify error " + r.status + (j?.errors ? ": " + JSON.stringify(j.errors).slice(0, 160) : ""))
    return j.data
  }
  return { gql, dom }
}
const IMG_MAX = 6
const imgPath = (k: string, i: number) => (i <= 1 ? "img/" + k : "img/" + k + "/" + i)
