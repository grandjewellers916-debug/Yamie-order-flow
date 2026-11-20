// v1.20 — daily expiry reminders for business & vehicle documents.
// Run by the scheduled function (doc-reminders, 09:00 IST) and, as a fallback, on the first app load of the day.
// Each reminder becomes an alert (shown in Alerts / bell and in the Home reminders card). Deduplicated per document, expiry and day.
import { docDaysLeft, docReminderDue, istDate } from '../../web/core.mjs';

export async function runDocReminders(s, { force = false } = {}) {
  const today = istDate();
  if (!force && (await s.get('meta/remDay')) === today) return { skipped: true };
  await s.set('meta/remDay', today);
  const { blobs } = await s.list({ prefix: 'doc/' });
  let sent = 0;
  for (const b of blobs) {
    const d = await s.get(b.key, { type: 'json' });
    if (!d || !docReminderDue(d, today)) continue;
    const key = `rem/${d.id}/${d.expiry}/${today}`;
    if (await s.get(key)) continue;
    const n = docDaysLeft(d, today);
    const what = `${d.title}${d.vehicle && !String(d.title).includes(d.vehicle) ? ` (${d.vehicle})` : ''}`;
    const title = n < 0 ? `Expired · ${what}` : n === 0 ? `Expires today · ${what}` : `Renew in ${n} day${n === 1 ? '' : 's'} · ${what}`;
    const body = `${d.type}${d.number ? ` ${d.number}` : ''} — valid till ${d.expiry}${n < 0 ? ` (expired ${-n} day${n === -1 ? '' : 's'} ago)` : ''}. Renew and update it in Business documents.`;
    const at = Date.now(); const rec = { id: `${at}-${Math.random().toString(16).slice(2, 12)}`, date: today, at, type: 'doc', title, body, docId: d.id, by: 'system' };
    await s.setJSON(`al/${today}/${rec.id}`, rec); await s.set(key, String(at)); sent++;
  }
  return { sent };
}
