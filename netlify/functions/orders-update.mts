import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { jsonResponse } from "./_lib/http.mts";

export default async (req: Request) => {
  if (req.method !== "PATCH") return jsonResponse({ error: "Method not allowed" }, 405);

  const db = getDatabase();
  const body = await req.json().catch(() => ({}));
  const { id, action } = body;
  if (!id || !action) return jsonResponse({ error: "id and action are required" }, 400);

  const rows = await db.sql`SELECT * FROM orders WHERE id = ${id}`;
  const order = rows[0];
  if (!order) return jsonResponse({ error: "Order not found" }, 404);
  const data = order.data || {};
  const today = new Date().toISOString().slice(0, 10);

  if (action === "setStatus") {
    const status = String(body.status || "");
    data.timeline = [...(data.timeline || []), { date: today, text: `Status changed to: ${status}` }];
    await db.sql`UPDATE orders SET status = ${status}, data = ${JSON.stringify(data)}, updated_at = NOW() WHERE id = ${id}`;
    return jsonResponse({ ok: true, status });
  }

  if (action === "confirm") {
    if (!order.is_proforma) return jsonResponse({ error: "Order is already confirmed" }, 400);
    const [{ n }] = await db.sql`SELECT nextval('yfj_seq') AS n`;
    const newId = `YFJ-${String(n).padStart(4, "0")}`;
    if (body.internalOrderNo) data.internalOrderNo = `YCO-${String(body.internalOrderNo).trim()}`;
    data.timeline = [
      ...(data.timeline || []),
      { date: today, text: `Order confirmed by customer — order number ${newId} assigned (was proforma ${id})` },
    ];
    await db.sql`
      UPDATE orders
      SET id = ${newId}, is_proforma = FALSE, status = 'booked', temp_id = ${id}, data = ${JSON.stringify(data)}, updated_at = NOW()
      WHERE id = ${id}
    `;
    return jsonResponse({ ok: true, id: newId, status: "booked" });
  }

  if (action === "addNote") {
    const text = String(body.text || "").trim();
    if (!text) return jsonResponse({ error: "Note text is required" }, 400);
    data.timeline = [...(data.timeline || []), { date: today, text }];
    await db.sql`UPDATE orders SET data = ${JSON.stringify(data)}, updated_at = NOW() WHERE id = ${id}`;
    return jsonResponse({ ok: true });
  }

  if (action === "toggleHold") {
    const hold = !!body.hold;
    data.hold = hold;
    data.timeline = [...(data.timeline || []), { date: today, text: hold ? "Marked on hold" : "Resumed from hold" }];
    await db.sql`UPDATE orders SET data = ${JSON.stringify(data)}, updated_at = NOW() WHERE id = ${id}`;
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Unknown action" }, 400);
};

export const config: Config = {
  path: "/api/orders-update",
};
