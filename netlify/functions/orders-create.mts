import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { jsonResponse } from "./_lib/http.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const db = getDatabase();
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || "custom");
  const isRepair = type === "repair";
  const customer = String(body.customer || "").trim();
  const phone = String(body.phone || "").trim();

  const { customer: _c, phone: _p, type: _t, ...rest } = body;

  const seqRow = isRepair
    ? await db.sql`SELECT nextval('rn_seq') AS n`
    : await db.sql`SELECT nextval('pf_seq') AS n`;
  const n = String(seqRow[0].n).padStart(4, "0");
  const id = isRepair ? `RN-${n}` : `PF-${n}`;

  const data = {
    ...rest,
    tempId: isRepair ? "" : id,
    timeline: [
      {
        date: new Date().toISOString().slice(0, 10),
        text: isRepair ? "Repair received" : "Proforma created — awaiting customer confirmation",
      },
    ],
  };

  const status = isRepair ? "received" : "proforma";
  const isProforma = !isRepair;

  await db.sql`
    INSERT INTO orders (id, temp_id, is_proforma, type, status, customer, phone, data)
    VALUES (${id}, ${data.tempId}, ${isProforma}, ${type}, ${status}, ${customer}, ${phone}, ${JSON.stringify(data)})
  `;

  return jsonResponse({ id, status, isProforma });
};

export const config: Config = {
  path: "/api/orders-create",
};
