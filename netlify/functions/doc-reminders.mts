// Scheduled daily at 03:30 UTC = 09:00 IST: document expiry reminders (see netlify/lib/reminders.mjs)
import { getStore } from '@netlify/blobs';
import { runDocReminders } from '../lib/reminders.mjs';
export default async () => {
  const r = await runDocReminders(getStore({ name: 'yamie-stock', consistency: 'strong' }), { force: true });
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};
export const config = { schedule: '30 3 * * *' };
