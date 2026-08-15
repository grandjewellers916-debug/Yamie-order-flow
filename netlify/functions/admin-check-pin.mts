import type { Config } from "@netlify/functions";
import { jsonResponse } from "./_lib/http.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const pin = String(body.pin || "");
  const expected = process.env.ADMIN_PIN;
  if (!expected) return jsonResponse({ error: "Admin PIN is not configured on the server" }, 500);
  if (pin !== expected) return jsonResponse({ error: "Incorrect PIN" }, 401);
  return jsonResponse({ ok: true });
};

export const config: Config = {
  path: "/api/admin-check-pin",
};
