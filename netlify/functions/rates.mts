import type { Config } from "@netlify/functions"

// Today's rates from the Grand Jewellers kiosk feed (the same rates staff set daily).
const SOURCE = "https://grandjewellers.com/api/kiosk-rates"

export default async (req: Request) => {
  try {
    const r = await fetch(SOURCE, { headers: { accept: "application/json" } })
    if (!r.ok) throw new Error(`source ${r.status}`)
    const j = await r.json()
    const pick = (v: unknown) => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    const body = {
      r22: pick(j.r22),
      r18: pick(j.r18),
      r14: pick(j.r14),
      r9: pick(j.r9),
      platinum: pick(j.platinum),
      silver: pick(j.silver),
      updated_at: typeof j.updated_at === "string" ? j.updated_at : null,
      source: "grandjewellers.com",
    }
    return Response.json(body, { headers: { "cache-control": "public, max-age=60" } })
  } catch (e) {
    return Response.json({ error: "Rates are unavailable right now." }, { status: 502, headers: { "cache-control": "no-store" } })
  }
}

export const config: Config = { path: "/api/rates", method: ["GET"] }
