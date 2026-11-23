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

## V1.3 (22-11-2026)
- Items page: category chips → popular products, purity, colour, approx. gross & net weight with a karat-wise pop-up, size/length, item details (ring: shank width/depth, setting & shank style; earrings: type & screw/back — picture cards), stones (diamond / lab-grown / precious priced per carat, synthetic per piece or gram; precious-stone list with picture cards editable in Settings; shape picture cards), design ours/customised, design number linked to Price Check with its photos, upload images.
- Price Check link: server reads the Yamie Price Check database (`/api/pc/find`, `/api/pc/photos`). Needs Netlify env **PC_SHOP_KEY** (Yamie Price Check shop key); optional `PC_URL`.
- Rounding: estimates and final price each round up to next ₹1/10/50/100/500 (Settings; final default ₹100).
- WhatsApp: APK sends the card straight to the customer's chat; web uses the phone's share sheet, or on a computer copies the card and opens the chat.
- Permission "See vendor phone numbers" (managers yes, staff no) — the server removes vendor phones for others.
- Work order card: item, quantity, purity, colour, size, design no., target gross/net, details, stones (type, shape, size, ct, pcs, quality, colour), extra vendor photos. No prices.
- Receive in store: vendor, date, vendor invoice no., per item purity / gross / net, photos.
- Final price: discount (above the sales limit is approved with the final price), customer OK recorded before a manager approves (server-enforced).

## Not done yet
- Gold rates come from the Grand Jewellers kiosk feed (grandjewellers.com/api/kiosk-rates) automatically every 10 min, or by the button in More → Gold rates; rates typed in by hand win for that day.
- Repair Desk / Price Check data: linked by buttons only; they keep their own logins and databases.
- ERP: invoice number and amount are typed in.
- Offline: cached data can be viewed, but saving needs the internet (Repair Desk queues edits; Order Desk does not yet).
- The server trusts the price totals the app calculates (it checks the rules, numbers and permissions, not the arithmetic).

## V1.4 — Update 2 (22-11-2026)
- Category, Item type, Setting style, Shank style, Finish style, Stone and Stone shape are picture dropdowns: tap to open a pop-up of large cards; ⤢ opens the real photo full screen.
- More → Picture lists: edit every list (item types per category), add real photos, reorder, remove, reset. Saved in settings.lists.
- More → Making charge helper: default rules by vendor, category, purity and net-weight range (most specific wins). Price step fills making automatically until staff change it; the helper button lists matching rules. Saved via POST /api/mkrules (rates or settings permission).
- Picture cards (estimate, work order, final, ready) show the first product photo large, the rest as thumbnails.

## V1.5 (22-11-2026)
- New app logo (launcher icon, web icon, lock screen).
- Making charge on customer cards/print: settings.mkShow 'type' | 'amount' | 'hide' (Pricing & policy); per order o.mkShow (Price step, final price sheet, estimate "Making on card").
- Savings: discount × (1 + GST) shown as "You save" on estimate / final cards, print and WhatsApp text, "Customer saves" on screens.
- Review requests (o.reviews): staff ask a desk (settings.reviewDesks, reviewTopics) about pricing / design; desk members (none = admins) get a reminder, can edit items and answer; requester sees the answer. Permission `review`.
- Reminders: settings.rem {key: {on, n}} — More → Reminders (src/js/11-review.js REMS).
- Admin tools on each order: edit items/price in any status, change/reset status with reason, delete (type DELETE).
- Design search list: GET /api/pc/list?q=&cat=&off= (grouped by design, category chips, 30 per page) and /api/pc/thumb?k= (cached in pc/thumb/).
- Stone "Setting" chips removed (setting style lives in ring details).

## V1.6 (22-11-2026)
- Price Check → Order Desk: POST /api/pc-order (header x-shop-key = PC_SHOP_KEY, no login) builds an enquiry from stock labels: category, product name, design no., model, purity, weights, size, diamonds, colour and up to 4 photos; o.fromPc {by, at, seen}; reminder 'fromPc'; list filter "From Price Check"; "Take it up" on the order.
- Link https://yamie-order-desk.netlify.app/new?o=<id> opens that enquiry (web; APK via verified app link — web/.well-known/assetlinks.json with the signing SHA-256).
- Design search filters: purity, stones (diamond / colour / plain), weight range, photos only, sort (pc/list pur, st, wmin, wmax, ph, sort).
- Model number taken from the Price Check stock list.

## V1.7 (22-11-2026)
- Item form: 1. Design first. Our design → design number + Search Price Check (opens automatically when chosen). Customised → Model reference (it.model), customer's reference images (it.refs, Gallery / WhatsApp or Camera), customisation text, "Ask the Design desk for help" (saves, then review sheet preset to the design desk + Design style). Customised needs a model reference or a reference image.
- it.refs shown on the Items tab and added to estimate / work order cards; "Model reference" label for customised items.
- /api/pc-order: per-item design 'custom' with cat, name, modelRef, purity, wt, size, custom, refs (data URLs, ≤4) ; help + helpNote → review to the design desk; index pcidx/<id>.
- GET /api/pc-orders (x-shop-key): Price Check orders with status, totals, promise, help state — for the Orders section in Price Check.

## V1.8 (23-11-2026)
- New cards (src/js/12-cardsv2.js): cardEstimate (maroon), cardWork (purple, no prices), cardReady (light, with final price breakdown, savings, delivery). shareCard accepts {ref, draw}.
- settings.verifyPay (default on): off = payments count at once (server stamps ok.auto).
- Making on cards: mkShow 'type' | 'amount' | 'typeonly' | 'hide' (two ticks in Pricing & policy).
- Making after discount: it.mkD (VA %) / it.mkPgD (₹/g); priceLine gives mkFull, mkSave; savings = (mkSave + discount) × (1 + GST). Discount limit counts mkSave.
- HUID: it.huid pieces × settings.huidRate (₹80).
- Delivery: settings.shipRates [{name, rate}]; final price sheet ships → fin.shipInfo {by, rate, addr}, o.ship; added before GST.
- Final price → manager approves → "Order ready: send card with final price". Customer-OK step and final price card removed (server no longer needs finals[].cust).
- Phones on cards: shopPhone (estimate), shopPhone2 + shopLandline (ready), woPhone (work order).

