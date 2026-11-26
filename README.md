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

## V2.9 (26-11-2026)
- Cards (estimate, work order, order ready) for orders with several items: all item photos in a grid at the top, each tagged with its item number (at least the first photo of every item, up to 12). Single-item orders keep the large photo + thumbnails.
- Web-only change: V2.8 apps update through Reload app.

## V2.8 (25-11-2026)
- Reload app / live updates: the APK checks the server version when it opens, every 30 minutes and when brought back to the front. If the website has a newer version, the app downloads the new page in the background and shows a violet bar "Version X is ready — Reload app". More → "Check for updates · Reload app" does it on demand. The website version just reloads.
- The downloaded page is kept in the app's storage; installing a newer APK later replaces it automatically.
- `APK_MIN` in api.mts: raise it only when the Android (Kotlin) part changes — older apps then show "New app — Download", which opens the latest APK from GitHub Releases.
- Install V2.8 once by hand (older apps cannot update themselves; they show the Download bar).

## V2.7 (25-11-2026)
- VA / making % is calculated on the gold value only (weight × gold rate × qty), never on stone or diamond value — same as Price Check. The "metal + stone" option is removed from Pricing & policy. Per-gram, flat and combo making were already on weight.
- Estimates already sent keep their saved amounts; a recalculation (e.g. final price) uses the new basis.

## V2.6 (23-11-2026)
- Grand orders: Edit and Delete are admin only. An admin can edit an order even after goods came in; lines already received keep their received qty / weight and cannot be removed.
- Bullion & payment card on each Grand order (permission "09. Bullion issue, receipt doc. no., balance & payment"):
  - Issue bullion: date, bullion weight, purity, alloy weight, total (auto = bullion + alloy, can be changed), optional internal doc. no., issued by; admin can remove an issue.
  - Receipt doc. no.: optional field when receiving from the vendor, editable later per receipt.
  - Received weight: filled from the receipts (QC-failed items left out), can be overwritten.
  - Totals: issued vs received; current balance (g and / or ₹); mode of payment — RTGS / Bullion invoice / Balance pending; reference (UTR / invoice no.); note.
  - All of it prints on the order report.

## V2.5 (23-11-2026)
- Phone numbers: international numbers (+972…, +971…, 00…) can be typed or picked from the phone's contacts; Indian numbers still save as +91 and 10 digits.
- Grand module permissions (Settings → Permissions, grouped under "Grand module"): open/view; 01 order creation; 02 order sending; 03 order receipt; 04 QC; 05 labelling; 06 laser marking; 07 packing with printed packing list; 08 mark as sent to Grand; edit Grand lists / re-open. Each step's button shows only for roles that have it, and the server checks it too.
- Mark as sent to Grand asks for the name of the carrier (list in Grand lists → Carriers, plus past carriers), the carrier person's name / phone, and a finger signature. The signature and carrier are on the receipt and the printed packing list.

## V2.4 (23-11-2026)
- Grand orders work flow (open an order → Receipt & work):
  - **Receive from vendor**: item by item against the order — qty and actual weight received, discrepancy vs expected weight (red above 2%), or mark **Not received**. Checked by (receiving staff).
  - Fully received → "Received · in work"; otherwise "Incomplete · items pending" and the order stays open for the next delivery.
  - Each delivery becomes a receipt that moves: **QC** (pass / fail per item; failed items go back to pending) → **Laser marking** → **Labelling** → **Box with printed report** → **Sent to Grand**, each with the staff name and time.
  - When every item is received and every receipt is sent to Grand, the order closes. "Close with items short" closes it with a reason if the vendor never sends the rest.
  - **Print report**: order items (ordered / received / pending), each receipt with weights, differences, QC, and the staff who did each step, with sign boxes — keep it in the box.
- Grand lists: staff lists for receiving, QC, laser marking, labelling and boxing / sending (first name = main person, picked by default).
- Orders received cannot be edited or cancelled any more; the list has filters for Incomplete, In work and Closed.

## V2.3 (23-11-2026)
- Grand order form: model is a drop-down sorted A–Z (the selected vendor's designs first); photos are in a folded "Browse models with photos".
- Grand lists: models folded per item and sorted A–Z; "Copy models from…" another item (e.g. chain designs into Anklet, Waist Chain); tap vendors under a model to assign that design to them.
- When item, model, weight and quantity are filled, the app asks "More <item · model> in another weight, length or quantity?" — Yes adds a short row (weight, length, qty, emergency, note) under the same design. The card groups those rows under one item / model.

## V2.2 (23-11-2026)
- Grand module (Orders tab → Grand orders). Needs the "Grand module" permission (admin has it; give it to other roles in Permissions). "Edit Grand module lists" controls More → Grand lists.
- New Grand order: order type (regular stock / customised with reference photos), vendor, order sent by (staff list), purity (standard ★, locked for the whole document or per item), item (list), model with photo (list per item, or type one), weight per piece, length / size (standard list per item + custom text, e.g. "8 pidi"), quantity, line weight and order total weight, emergency marking with delivery date per item, photo of the item (camera / gallery), notes.
- Order card: violet gradient, small Grand logo, items in a table (Item, Model, Weight, Length / size, Qty, Total), item photos shown or hidden with one tick. Send to the vendor on WhatsApp, then "Copy to" each Grand order staff number. Status: sent / received / cancelled; history log. Numbers GJO-0001…

## V2.1 (23-11-2026)
- More → Validity & rounding (admin / Settings permission):
  - Estimate valid for N days (0 = today only), counted as calendar or working days (skips weekly off and holidays).
  - Expired estimate approved: block, only a manager / admin, or allow with a history note.
  - Final price valid for N days after approval (0 = no date): shown on the order screen, the order-ready card and its WhatsApp text; reminder when the balance is unpaid near / after the date.
  - Admins can change the valid-till date of one estimate or final price on the order screen (logged in history; others cannot).
  - Rounding: step (none, ₹10–₹1000) and direction (up, nearest, down) separately for estimates and the final price; minimum advance rounded up to a step.

## V2.0 (23-11-2026)
- Design search (Price Check database) has more filters: item type, metal colour, stone / stone colour, size, supplier (staff with vendor or cost access only), location / counter, net weight range, diamond carat range, budget range (approximate price at today's Order Desk rates), and "only with photos / model number / HUID".
- Drop-downs list only the values that exist in Price Check stock, with counts.
- Each design card shows the approximate price today. New sort options: price low/high, biggest diamond, most in stock.

## V1.9 (23-11-2026)
- Version on the top bar (#verTag: "App v1.9.N" in the APK from YamieNative.version(), "Web v1.9" on the web) and on the lock screen; server version from /api/ping and /api/state (`ver`, SERVER_VERSION). #verWarn shows when the server is older than the app.
- Phone contacts: YamieNative.pickContact() (ACTION_PICK on Phone, result via window.onContactPicked) and saveContact(name, phone, note) (contacts Insert screen). Web: Contact Picker API on Android Chrome; saving downloads a .vcf. Used in New enquiry (Pick from phone contacts), order header (Save to contacts) and Vendors (📇 pick, ＋ save).

