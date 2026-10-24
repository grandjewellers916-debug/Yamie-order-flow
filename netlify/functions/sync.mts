import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"

// Shared database for all Yamie Price Check phones (Android app, iPhone home-screen app).
// Every call needs the shop key (env SHOP_KEY). Stock, settings and PIN changes also need the admin PIN.
// Stored in one site-wide Blobs store: meta, stock, rates, settings, auth.

const APP_ORIGINS = ["https://appassets.androidplatform.net", "https://yamie-price-check.netlify.app"]
const STOCK_FIELDS = ["key", "barcode", "item", "category", "carat", "gw", "nw", "sw", "dw", "dq", "sa", "serial", "label", "location", "pcs", "sq", "supplier", "at"]
const RATE_KEYS = ["22k", "18k", "14k", "9k", "platinum", "silver"]

type Meta = { stock: number; rates: number; settings: number; count: number; history: any[] }

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") || ""
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type,x-shop-key,x-admin-pin",
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
const cleanStr = (v: unknown, n = 120) => (v == null ? "" : String(v).slice(0, n))
const cleanNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
function cleanRow(r: any) {
  if (!r || typeof r.key !== "string" || !r.key) return null
  const o: any = {}
  for (const f of STOCK_FIELDS) {
    if (["gw", "nw", "sw", "dw", "dq", "sa", "pcs", "sq", "at"].includes(f)) o[f] = cleanNum(r[f])
    else o[f] = cleanStr(r[f])
  }
  o.key = o.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40)
  return o.key ? o : null
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
  const meta: Meta = { stock: 0, rates: 0, settings: 0, count: 0, history: [], ...((await st.get("meta", { type: "json" })) || {}) }
  const saveMeta = () => st.setJSON("meta", meta)

  const adminOk = async (pin: string) => {
    if (!pin) return false
    const auth: any = await st.get("auth", { type: "json" })
    if (auth?.hash) return (await sha("yamie-pc:" + pin)) === auth.hash
    return pin === (Netlify.env.get("ADMIN_PIN") || "")
  }

  try {
    if (req.method === "GET") {
      if (op === "meta") return json(req, meta)
      if (op === "stock") return json(req, { v: meta.stock, rows: (await st.get("stock", { type: "json" })) || [], history: meta.history })
      if (op === "rates") return json(req, { v: meta.rates, log: (await st.get("rates", { type: "json" })) || [] })
      if (op === "settings") return json(req, { v: meta.settings, settings: (await st.get("settings", { type: "json" })) || null })
      return json(req, { error: "bad_op" }, 400)
    }
    if (req.method !== "POST") return json(req, { error: "method" }, 405)

    let body: any
    try { body = await req.json() } catch { return json(req, { error: "bad_json" }, 400) }
    const pin = req.headers.get("x-admin-pin") || ""

    if (op === "pin") {
      const ok = await adminOk(pin)
      const auth: any = ok ? await st.get("auth", { type: "json" }) : null
      return json(req, { ok, hash: ok ? auth?.hash || (await sha("yamie-pc:" + pin)) : undefined })
    }

    if (op === "rate") {
      // Day's rates: open to all staff with the shop key
      const rates = cleanRates(body?.entry?.rates)
      if (!rates["22k"] || !rates["18k"] || !rates["14k"] || !rates["9k"]) return json(req, { error: "bad_rates" }, 400)
      const entry = { id: cleanStr(body.entry.id, 20) || Math.random().toString(36).slice(2, 9), at: cleanNum(body.entry.at) || Date.now(), day: cleanStr(body.entry.day, 10), rates }
      const log: any[] = ((await st.get("rates", { type: "json" })) as any[]) || []
      const next = [entry, ...log.filter((e) => e.id !== entry.id)].sort((a, b) => b.at - a.at).slice(0, 500)
      await st.setJSON("rates", next)
      meta.rates = Date.now(); await saveMeta()
      return json(req, { v: meta.rates })
    }

    if (!(await adminOk(pin))) return json(req, { error: "bad_pin" }, 403)

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
          cz: (Array.isArray(s?.mkTable?.cz) ? s.mkTable.cz : []).slice(0, 200).map((x: any) => ({ purity: cleanStr(x?.purity, 12), slab: cleanStr(x?.slab, 40), mbd: cleanStr(x?.mbd, 20), mad: cleanStr(x?.mad, 20), rate: cleanStr(x?.rate, 20) })),
          dia: (Array.isArray(s?.mkTable?.dia) ? s.mkTable.dia : []).slice(0, 200).map((x: any) => ({ purity: cleanStr(x?.purity, 12), slab: cleanStr(x?.slab, 40), mbd: cleanStr(x?.mbd, 20), mad: cleanStr(x?.mad, 20), rate: cleanStr(x?.rate, 20) })),
        },
      }
      await st.setJSON("settings", out)
      meta.settings = Date.now(); await saveMeta()
      return json(req, { v: meta.settings })
    }

    if (op === "setpin") {
      const np = String(body?.newPin || "")
      if (!/^[0-9]{4,8}$/.test(np)) return json(req, { error: "bad_new_pin" }, 400)
      const hash = await sha("yamie-pc:" + np)
      await st.setJSON("auth", { hash, at: Date.now() })
      return json(req, { ok: true, hash })
    }

    return json(req, { error: "bad_op" }, 400)
  } catch (e) {
    console.error("sync error", op, e)
    return json(req, { error: "server" }, 500)
  }
}

export const config: Config = { path: "/api/sync", method: ["GET", "POST", "OPTIONS"] }
