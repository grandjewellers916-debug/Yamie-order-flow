# Yamie Order Desk

Orders & estimates for Yamie Fine Jewellery, built the same way as Repair Desk: one web app (`web/index.html`) for phones and computers, a shared database on Netlify, and an Android APK that wraps the same app.

Enquiry → estimate (EST-2026-0001, picture card on WhatsApp, print/PDF) → customer approval → advance (min 20%, verified by a manager; paying the metal value locks the gold rate) → order confirmed (YOR-2026-0001, delivery 20 working days) → vendor work order card (no prices) → ETD, follow-ups, customer updates → received with actual weights → QC checklist (or rework) → final price (locked or today's rate, variance check, manager approval) → "order ready" card → ERP invoice no., balance verified, handover → closed. Reminders, reports, CSV export, staff logins with PIN, role permissions, backup & restore.

## Where things are
- `web/index.html` — the whole app, **built** from `src/` with `npm run build` (`node build.mjs`, esbuild to ES2017). Edit `src/`, never `web/index.html` by hand.
  - `src/style.css`, `src/body.html`, `src/logos.js` (Yamie logos, same as Repair Desk), `src/js/01-core.js` … `09-boot.js`.
  - `web/ybk.js` — backup engine shared with Price Check, Repair Desk and Yamie SOP.
- `netlify/functions/api.mts` — shared database API at `/api/*` (Netlify Blobs store `yamie-order`, strong consistency). `netlify/lib/backup.mts` — backup & restore.
- `android/` — WebView wrapper, package `com.yamie.orderdesk`, label "Order Desk", signed with `android/app/yamie-order.keystore` (password `yamieorder`, alias `yamie`). Same bridge as Repair Desk: WhatsApp picture cards, calls, printing, Downloads, reminder notifications.
- `.github/workflows/android.yml` — every push to `order-desk` builds the APK → Release `order-desk-vN` (`Yamie-Order-Desk-v1.0.N.apk`).
- `test/` — local server (real API on an in-memory store), API rule tests, browser walkthrough.

## Netlify
New site **yamie-order-desk** (the APK calls `https://yamie-order-desk.netlify.app`; change `API_DEFAULT` in `src/js/01-core.js` if the name differs). Link it to this repo, branch `order-desk`, publish `web`, functions `netlify/functions`. Optional env vars: `ADMIN_PIN` (first admin PIN, else 1986), `APP_SECRET`. First login as Admin forces your own name + PIN.

## What the server enforces (not just the screens)
- Each status change needs the role permission for that step (table `FLOW`); anything else is admin-only and logged.
- EST and YOR numbers are issued by the server, once, never duplicated (create-only `seq/` keys).
- Confirm only with customer approval of the latest estimate **and verified** advance ≥ 20%; rate lock only when the verified advance covers the metal value. Promise date = 20 working days (weekly off + holidays from Settings).
- New payments are saved unverified unless the user has "Verify payments"; changing/removing a recorded payment is admin-only; duplicate receipt numbers are refused.
- Vendor cost is hidden from users without "See vendor cost" and kept when they save.
- Ready needs QC approved + final price approved; a final price outside ±tolerance needs the customer's agreement; closing needs invoice + no balance + all payments verified + handover (or a manager/admin exception with a reason).
- Saves carry `baseRev`; a stale save gets 409 "changed on another device".

## Test locally
```
npm install
npm run build
PORT=8788 node test/server.mjs          # in one terminal
node test/api-flow.mjs                    # 46 rule checks
python3 test/ui_flow.py                   # full walkthrough, screenshots in /tmp/shots (server on 8789)
```
The page talks to `localStorage.yod_api` when set (tests set it to the local server).

## Not done yet
- Gold rates come from the Grand Jewellers kiosk feed (grandjewellers.com/api/kiosk-rates) automatically every 10 min, or by the button in More → Gold rates; rates typed in by hand win for that day.
- Repair Desk / Price Check data: linked by buttons only; they keep their own logins and databases.
- ERP: invoice number and amount are typed in.
- Offline: cached data can be viewed, but saving needs the internet (Repair Desk queues edits; Order Desk does not yet).
- The server trusts the price totals the app calculates (it checks the rules, numbers and permissions, not the arithmetic).
