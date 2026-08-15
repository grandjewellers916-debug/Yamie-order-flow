import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { jsonResponse } from "./_lib/http.mts";

export default async (req: Request) => {
  const db = getDatabase();
  const rows = await db.sql`SELECT * FROM orders ORDER BY created_at DESC`;

  const orders = rows.map((r: any) => ({
    id: r.id,
    tempId: r.temp_id,
    isProforma: r.is_proforma,
    type: r.type,
    status: r.status,
    customer: r.customer,
    phone: r.phone,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...r.data,
  }));

  return jsonResponse({ orders });
};

export const config: Config = {
  path: "/api/orders",
};
