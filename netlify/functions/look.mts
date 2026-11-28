import type { Config, Context } from "@netlify/functions"
import { getStore } from "@netlify/blobs"

// V1.9.34 short customer link: /c/<id> serves the customer page (c.html) with the shop's brand and a
// WhatsApp / social preview (collection title, shop name and the first photo). Works on the shop's own
// sub-domain too (e.g. look.yamie.in) once it points at this site.
const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
const SHOP: Record<string, { name: string; icon: string }> = {
  yamie: { name: "Yamie Fine Jewellery", icon: "/brand/yamie/app-icon.png" },
  grand: { name: "Grand Jewellers", icon: "/icons/grand-192.png" },
}

export default async (req: Request, context: Context) => {
  const u = new URL(req.url), origin = u.origin
  const id = String(context.params?.id || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32)
  const page = await fetch(new URL("/c.html", origin))
  if (!page.ok) return new Response("Not available", { status: 502 })
  let html = await page.text()
  let c: any = null
  try { c = id ? await getStore({ name: "yamie-price-check", consistency: "strong" }).get("col/" + id, { type: "json" }) : null } catch (e) { c = null }
  const brand = c?.brand === "grand" ? "grand" : c?.brand === "yamie" ? "yamie" : /^grand/i.test(u.hostname) || /grand/i.test(c?.shop || "") ? "grand" : "yamie"
  const shop = c?.shop || SHOP[brand].name
  const live = c && !(c.exp && c.exp < Date.now())
  const title = !c ? "Link not found" : live ? c.title || "Our collection" : "This link has expired"
  const n = live ? (c.items || []).length : 0
  const desc = live ? `${n} design${n === 1 ? "" : "s"} from ${shop}${c.note ? " · " + c.note : ""}` : `Ask ${shop} for a new link.`
  const first = live ? (c.items || []).find((x: any) => x.n > 0) : null
  const image = first ? `${origin}/api/sync?op=colimg&id=${id}&k=${encodeURIComponent(first.k)}&i=1` : origin + SHOP[brand].icon
  const head = `<base href="/"><script>window.BRAND_ID=${JSON.stringify(brand)};window.COL_ID=${JSON.stringify(id)}</script>
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(shop)}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc.slice(0, 200))}"><meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(origin + "/c/" + id)}">
<meta name="twitter:card" content="summary_large_image"><meta name="description" content="${esc(desc.slice(0, 200))}">`
  html = html.replace(/<meta charset="utf-8">/i, (m) => m + "\n" + head)
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } })
}

export const config: Config = { path: "/c/:id", method: ["GET", "HEAD"] }
