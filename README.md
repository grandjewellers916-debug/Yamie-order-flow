# Price Check (Yamie · Grand Jewellers)

Photograph a jewellery price tag, read weight, purity, diamond weight and making from it on the phone, and price it at today's gold rate.

## What's here

| Folder | What it is |
|---|---|
| `web/` | The app's screens (one HTML page + tag parser). Also works as an installable web app. |
| `android/` | Android app. Wraps `web/`, reads tags with Google ML Kit (on the phone, free, works offline), fetches rates directly. |
| `netlify/functions/rates.mts` | `/api/rates` for the web version (proxies the Grand Jewellers kiosk rates). |
| `.github/workflows/android.yml` | Builds the APK on every push to the `price-check` branch and posts it under Releases. |

## Pricing

Same flow as the Yamie pricing workbooks:

- Metal = net weight × rate for the purity
- Stone = tag stone value, or diamond ct × diamond rate (default ₹1,00,000/ct)
- Making = % of (metal + stone), or ₹/g × net weight, or flat
- GST 3%, then rounded up to ₹50

Making discount, GST, rounding, diamond rate and "making on metal only" are under **Pricing settings**.

## Rates

Live from `https://grandjewellers.com/api/kiosk-rates` (22K, 18K, 14K, 9K, platinum, silver), refreshed every 5 minutes. Any rate can be tapped and overridden for one check. If the phone is offline, the last saved rate is used and shown as "Saved".

## Getting the APK

1. Push this folder to the `price-check` branch of a GitHub repo.
2. GitHub builds it (about 5 minutes). Open the repo's **Releases** and download `yamie-price-check.apk` on the phone.
3. Tap it to install. Android will ask to allow installs from Chrome/Files the first time.

Every build is signed with `android/app/yamie-sideload.keystore`, so new versions install over old ones. Keep that file; if it's lost, the app has to be uninstalled once before installing a new build.

## Web version on Netlify

Netlify project `yamie-price-check` is created. Link it to this repo and branch (Project configuration → Build & deploy → Link repository, branch `price-check`); `netlify.toml` sets everything else. On the phone, open the site in Chrome → menu → **Install app**.

## Stock list

**Stock → Add / update from Excel** imports a stock sheet (.xlsx, .xls or .csv). The app finds the header row by the `BarCode` column and reads: BarCode, Item, Category, Carret, Gross Wt, Net Wt, Stone Wt, Diamond Wt, Diamond Qty, StoneAmount, Serial, Label, Location, Pcs, Stone Qty, Supplier.

- Add / update: new barcodes are added, existing ones are replaced by the new row.
- Replace all stock: clears the phone's list first (use for a full stock file).
- Stored on the phone (IndexedDB). Each phone imports its own copy.

Typing a barcode, or scanning a tag (the printed barcode is read too), fills item, purity, GWT, NWT, stone weight (Diamond Wt if present), and stone price (StoneAmount). Making is picked by hand from the Label; the **making guide** (Charges settings) shows usual options per purity.

## Billing flow (v11)

1. Select the **Item**: its barcode prefix fills in (Stud STD, Ring FRG, Necklace NLC, Pendant PND, Bangle BGL, Bracelet BRC, Nosepin NSP, Diamond DIA, CVD LDJ, Findings FIN, Chain CHN, Jewelry set RST, Platinum MMP).
2. Type the barcode **number**: the full barcode is looked up in the stock list and the tag fills in. Or tap **Scan** to read the barcode with the camera.
3. Open **Making helper** and pick the row. Customer prices use **MBD**; **MAD** is shown to staff only (lowest allowed) and never appears in shared bills.

**Stock data** card: *Import stock Excel* replaces the list with a full stock file; *Add new stock* adds or updates items from later sheets.

## iPhone (home-screen app)

The web version runs on iPhone as a home-screen app (no App Store needed).

1. Netlify → project **yamie-price-check** → Project configuration → Build & deploy → **Link repository** → GitHub → `Yamie-order-flow`, branch **price-check**. `netlify.toml` sets the rest. Every push redeploys.
2. On the iPhone open **https://yamie-price-check.netlify.app** in **Safari** → Share → **Add to Home Screen**.
3. Open it from the home screen. Allow the camera the first time **Scan** is used.

Barcode scanning uses a live camera scanner (bundled, works offline). Stock data, rates and bills are stored on each iPhone, like the Android app.

## Shared database (all phones)

Netlify function `/api/sync` stores one shared copy (Netlify Blobs) of: stock list, day's rates + history, making helper + charges, and the admin PIN.

- Netlify env vars: `SHOP_KEY` (shop key every phone enters once) and `ADMIN_PIN` (starting PIN). Both secret, Functions scope.
- On each phone: Admin settings → Shared database → enter the shop key → Connect. The first phone with data starts the shared copy; later phones download it.
- Phones keep a local copy and work offline. They sync once each morning (first open from 6 AM) and right after a stock import or sold-tag removal on that phone. **Sync now** pulls the latest any time. Day's rates, settings and users are sent the moment they're saved; rates saved offline are sent when back online.
- Stock imports, making helper/charges edits and PIN changes need the admin PIN; day's rates need only the shop key.
- Saved bills stay on each phone.

## Login and users

Everyone logs in with their own name and PIN (4–8 digits). Roles: **Admin** (stock uploads, Admin settings, users) and **Staff** (billing, day's rates).

- First use: log in as `admin` with the starting PIN (`ADMIN_PIN`, 1986), then add users under Admin settings → Users.
- Admins create, edit (name, username, role, PIN, active) and delete users. At least one active admin is always kept.
- On a staff login, admin-only actions ask an admin to log in; that approval lasts 15 minutes.
- With the shared database connected, users are the same on every phone; switched-off or deleted users are logged out at the next sync.
- Saved bills and day's rates record who made them.

## Two shops from one codebase

The same app runs for **Yamie** and **Grand Jewellers**. `web/brand.js` holds each shop's name, colours, item codes and starting making table.

| | Yamie | Grand Jewellers |
|---|---|---|
| Android APK | `yamie-price-check.apk` (com.yamie.pricecheck) | `grand-price-check.apk` (com.grandjewellers.pricecheck) |
| Web / iPhone | yamie-price-check.netlify.app | grand-price-check.netlify.app |
| Shared database | its own Netlify site, own `SHOP_KEY` / `ADMIN_PIN` | its own Netlify site, own `SHOP_KEY` / `ADMIN_PIN` |
| Making helper | starts with the Yamie table | starts empty; admin fills it in |

- Android: product flavors `yamie` and `grand`; each ships `assets/brand-id.js`. GitHub builds and releases both APKs.
- Web: the brand is picked from the host name (`grand…` → Grand). Any other host can force it once with `?brand=grand`.
- Stock, users, rates and settings are never shared between the two shops.
- **Admin settings → Item codes** lets an admin edit barcode prefixes (one `CODE = Name` per line). They sync to all phones of that shop.
- Adding a third shop: add an entry to `BRANDS` in `web/brand.js`, a flavor in `android/app/build.gradle` with its `brand-id.js` and icons, and a Netlify site whose name starts with the brand id.

## Handheld barcode scanner

Any Bluetooth or USB barcode scanner in keyboard (HID) mode works. Pair it with the phone like a keyboard and leave its suffix as Enter (the factory setting).

- Scan with no box selected: the app reads the code, finds the item and opens the making helper, the same as the camera.
- Scan into the barcode box or the sold-tags box: that box gets the code.
- Slow key presses are ignored, so ordinary typing never triggers a lookup.

## v1.4 — price card, quotes, WhatsApp (7 Nov 2026)

**Home.** Scan or type a barcode. When the stock sheet has the making and HUID, the price shows straight away (Total Price, + GST, Grand Total) with **Save to Quote** and **Clear**. No making in the sheet → a making-rate pop-up (Fixed / Per gram / % of Net Wt, presets, or the making helper). No HUID in the sheet → the HUID question.

**Stock sheet columns (new).**
- Making: `Making` / `MC` / `VA` with values like `14%`, `2500 PG`, `1500 fixed`. A plain number up to 100 is %, above 100 is a fixed amount unless a `Making Type` column says *Per gram* / *Fixed* / *%*. Separate `Making %`, `Making PG`, `Making Fixed` columns also work.
- HUID: `HUID` / `HUID Count` — a number, or the HUID codes themselves (counted).

**Quote page.** Customer name and phone, quote number (QT-000001…, given by the shared database), items table with edit/delete, URD (old gold), sales returns, advances (cash/UPI/card/bank) and a flat discount, all taken off the total. **Edit** (manager or admin) sets the making after discount for each item; prices update. **Generate Quote** fixes today's rates on the quote, numbers it and offers WhatsApp. **Close sale** records the final invoice number from the ERP and In-store / Online.
- Quotes are shared with all phones through the shop key; pulled when the Quote page opens, on Refresh and with the morning sync.
- Photos (camera or gallery) stay on the phone that took them and are sent with the WhatsApp message.
- Roles: Staff, **Manager** (making after discount, reopen a closed sale), Admin.

**Settings** (bottom tab) holds Stock data and Admin settings.

## v1.5 (7 Nov 2026)

- **Database sheet** (new format): LabelNo, Purity, GrossWt, NetWt, DaiWt, DaiPcs, Clrstn Wt, Clrstn Pcs, Wastage %, Labour Charges, Labour Rate, Category, Supplier, ItemName, HUIDCount, Label Code. Making is taken automatically: **Labour Charges** → fixed making; else **Labour Rate** → ₹ per gram of net wt; else **Wastage %** → % making (before discount). HUIDCount sets the HUID. Items can be found by LabelNo or Label Code. The sheet has no stone value, so diamond items ask for the stone price (SA) on the price card.
- **Search stock** (home): label no., label code, item or supplier; shows if it is in stock; tap to price it.
- **New Quote** button on home, with the current quote and balance.
- **Cancel quote · enquiry only** for quotes not sold; listed under Quotes → Enquiry; a manager can reopen.
- **Update making** on the price card. Admin settings → *Making on the price card*: Admins only / All staff.
- **Text size on this phone** (Admin settings): Smallest / Small / Normal / Large. Phones 380 px wide or less start at Small.

## v1.6 (7 Nov 2026)

- **Database sheet** columns: Label No, Item Name, Item type, Purity (K), Gross Wt (g), Stone Wt (g), Net Wt (g), Clr-SA, Dia-SA, Wstg %, Labour charges, Making Rate, HUID no, Stone Name (s).
  - Making: **Labour charges** → fixed; else **Making Rate** → ₹ per gram of net wt; else **Wstg %** → % making.
  - Stone price (SA) = Clr-SA + Dia-SA. HUID no = a count, or the HUID codes (counted). Stone names and item type show on the price card.
- **Search** is its own tab (label no., item name, item type, stone).
- **+** on the Scan Barcode card starts a new quote (the current-quote strip is gone).
- **Roles and permissions** (Admin settings): Admin has everything; Manager and Staff come preset; add roles, tick permissions (stock import, delete sold tags, day's rates, update making, making after discount, close sale, cancel quote, reopen, delete quotes, admin settings, users and roles, connect phones). Users pick a role. The shared database checks the same permissions.

## v1.6.38 (7 Nov 2026)

- Price card: **Item type** is the title (item name not shown); **Diamond Value** and **Colour Stone** shown separately (Dia-SA, Clr-SA).
- **Product photos**: add from the Search tab (camera or gallery); shared with all phones; shown on the price card. Admin settings → *Product image*: Show / Hide. Permission: *Add product photos*.
- **Search** shows every detail: item type, item name, purity, weights, diamond and colour stone values, stone names, making, HUID, label code, supplier.
- **Quote → Discount**: item prices stay at the label making; the manager enters making after discount per item, the difference is the discount, plus an optional flat discount. Summary: Total Amount → Discount → Total after discount → URD / SR / advance → Balance.
- User name at the top; tap it to log out.

## v1.6.39 (7 Nov 2026)

- **Alerts** on the price card (with a short vibration): stone weight but no stone charges (tap Enter to add the stone value); no making charges (tap Enter); making typed by hand instead of from the stock data.
- **Image switch** on the price card (picture button): hides or shows product images on this phone; Admin settings → Product image sets the shop default.
- **Quote image for WhatsApp**: the Yamie logo, quote no., date, customer, today's rates, each item with its photo (optional), weights, stone values and price (with discount), totals and balance. Preview first, then *Send on WhatsApp* (customer photos are sent with it). *Send as text* is still there.

## v1.6.40 (7 Nov 2026)

Quote page:
- **Sale type**: In-store / Online enquiry. Online shows **Delivery charges** (added to the taxable value, so GST applies).
- **Making charges on the quote**: Show / Hide (affects the quote image and text).
- Summary: Items value → Making discount → Delivery → **Taxable value** → **Total GST** → **Discount** (flat + round-off) → **Total discount** → **Final amount** → URD / SR / Advance → Balance.
- **Round the final amount down to ₹100** (on by default); the difference is added to the discount.

## v1.6.42 (7 Nov 2026)

Settings is split into one card per function, and each is a permission you can give to a role (Roles & permissions):
Stock data · Remove sold tags · Text size · Product image show/hide · Rates shown · Charges (GST, HUID) · Making helpers · Item codes · Shared database & shop key · Roles & permissions · Users.
A card is locked for users without that permission; opening it asks for a user who has it. The shared database checks the same permissions and keeps any part of the settings the user is not allowed to change. Roles that had the old single "Admin settings" permission keep all the settings functions.

## v1.6.43 (8 Nov 2026)

- **Stock data** is admin only (no longer a role permission).
- **Home → sale type**: Online enquiry · Store walk-in · Price check only (no Save to Quote; nothing is saved). New quotes follow the choice.
- **Quote page order**: Customer details → Quotation (items, making show/hide) → Discount → Sale type → URD / SR / Advance → Summary (with round-off option).
- **Delivery partners** (online enquiries): India Post ₹400 (up to ₹35,000, warns above), Bright Asset Transit ₹600, BVC ₹600, Sequel ₹600, Yamie Delivery (enter charges), Store pick-up (free). Delivery is shown by partner in the summary, quote text and quote image.
- **Login**: tap your name and enter the PIN (no username box). A new phone on the shared database loads the user list.

## UI styles & themes (8 Nov 2026 — requested as V 1.6.43)

- **Diamond weight and count** on the price card, search results and quote image (stock sheet columns Dia Wt / Diamond Wt and Dia Pcs / Diamond Count / No of Diamonds).
- **Making rate**: the price card shows the making rate and its amount (e.g. `14% · ₹4,714`).
- **App style** (Settings → Theme, admin only): 01 True iOS (light bars, system font), 02 iOS colour (brand-colour bars, the original look), 03 Android style (Material bars, Roboto). On Android the status and navigation bars follow the style.
- **Accent colour** (admin only): Brand, Blue, Maroon, Gold, Emerald, Navy, Rose. Style and colour sync to every phone through the shared database.
- **Online enquiries**: no URD or Sales return sections; Advance only.
- **WhatsApp quote**: the shop's full address, contact, website and GSTIN at the foot of the quote image and quote text (Yamie).

## V 1.6.5 (8 Nov 2026)

- **WhatsApp quote**: firm name, then the address in 2 lines (address · contact, website, GSTIN). Set per brand in `brand.js` (`addr2`).
- **Product details**: a **+** button on the item tile when there is no photo (camera or gallery; needs "Add product photos").
- **Product details order**: Purity · Gr. Wt · St. Wt · Nt. Wt · VA % (when making is %) · VA (when making is per gram or fixed) · Making Rate (₹) · Diamond Wt · Diamond Price · Colour Stone Wt · Colour Stone Price · HUID Count · HUID No. · Stones · Pcs · Supplier. Rows with no value are skipped; rows after the first five run full width under the photo.
- **Settings → Product details · items shown**: tick the items to show (new permission "Product details items"; synced to all phones).
- **Stock sheet**: colour stone weight columns (Clr Stn Wt / Colour Stone Wt) and HUID codes in the HUID column are kept.
- **Quote → Discount**: each item shows its making rate and amount; after the manager's making, the new making amount.
- **Logo** in the app bar on the True iOS and Android styles too.

## V 1.7.0 (8 Nov 2026)

- **New database sheet** (Label No · Item Name · Item Type · Purity (K) · Gross Wt (g) · Stone Wt (g) · Net Wt (g) · Clr-SA · Dia – SA · Diamond Qty · Diamond Wt · Wstg % · Fixed Charge · Making Rate · HUID No · Stone Name(s) · Location · Labelling Date) reads directly.
- **Making**: Making Rate is per gram of net weight; items under 1 g pay the Making Rate itself (same as the sheet's Fixed Charge). Without a Making Rate, Fixed Charge is used; otherwise Wstg %.
- **Location and Labelling Date** show on Product Details (can be hidden) and in Search.
- Looking up another item no longer carries the previous item's stone weight or stone value over.
- **Settings → Footer · tabs for staff** (admin only): choose which bottom tabs (Scan, Search, Quote, Gold Rates, Settings) each role sees. Home is always shown; admins see all.

## V 1.7.1 (8 Nov 2026)

- **Quote approval**: users without "Approve quotes · set discount" send the quote for approval (Quote → Approval). Managers and admins are notified, open it, set the discount and tap **Approve & send to …**; the staff member is notified and can then share it (WhatsApp image, text or copy are locked until approved; changing the quote after approval needs a new approval).
- **Notifications**: bell on the header (count of items waiting). The app checks every 30 seconds while open; the Android app also checks every 15 minutes in the background and shows a phone notification. Tapping it opens the quote or lead.
- **WhatsApp leads**: managers/admins (permission "Share WhatsApp leads") give a lead to a staff member (name, number, enquiry), from the bell or by sharing a WhatsApp message to the app (Android share → Price Check). The staff member is notified; tapping the lead starts an online quote with the customer filled in and the enquiry shown.
- **Close sale** asks for the **Acme invoice number**.
- Existing roles that could give making discounts get both new permissions once.

## V 1.7.2 (8 Nov 2026)

- **Document control**: each user sees only their own quotes. Admins see all; an admin can allow any user to see all quotes (Settings → Users → user → "Can see all quotes"). Managers also see quotes sent to them for approval.
- **Numbering**: a quote gets a provisional number per user when first saved (`P-RAVI-0001`, `P-RAVI-0002` …). When the sale is closed it gets the next number in the common series (`QT-000001` …); the provisional number is kept with it. Quotes numbered before this version keep their numbers.
- User and role changes made by an admin reach phones within a minute (no longer only at the morning sync).

## V 1.7.3 (8 Nov 2026)

- **Staff quote page** is compact: an approval bar at the top (Draft → Sent → Approved), no discount, close-sale or photo/share sections until the quote is approved (close sale only with permission). While waiting, the quote is locked; "Withdraw to edit" unlocks it.
- **Save & send for approval**: saves the quote (provisional number) and sends it to a chosen manager/admin, or to any of them.
- **On approval** the quote gets its QT number from the common series; the staff phone updates by itself (checks every 8 seconds while waiting) with the discount and new number, and sharing unlocks.
- **Settings → Quote approval** (admin only): On / Off. With it off, staff share quotes directly and the QT number is given when the sale is closed.

## Notifications fix (8 Nov 2026)

- Approval and lead alerts now also show as a phone notification (with sound) while the app is open, not only as an in-app message.
- In the background the Android app checks about every minute (was every 15 minutes; Android may space checks out while the phone sleeps), plus the 15-minute safety check.
- The first background check no longer swallows a request that arrived before it; the app tells the background checker what was already seen.
- Web version: Android Chrome and desktop browsers can show system notifications (allowed on first tap of the bell).

## Approval button (8 Nov 2026)

- The approval bar at the top of the Quote page is gone. When approval applies, the **Approval** button takes the place of **Scan Product** in the quote toolbar (Send for approval → Sent → Approved; managers see Approve).
- Tapping it opens a pop-up: staff pick who approves (any manager/admin, or one person) and tap **Save & send for approval**; managers see **Approve & send to …**.
- The state also shows next to the quote number (Waiting / Approved / Changed).

## WhatsApp share permission (8 Nov 2026)

- New permission **Share quotes on WhatsApp** (Settings → Roles & permissions). It covers the quote image, Send as text and Copy quote text. Without it, the app asks for a user who has it (manager PIN) before sharing.
- Every existing role keeps sharing once (no change on day one); untick it for a role to require it.

## V 1.7.4 (9 Nov 2026)

- **Pick the item** (M / Add manually) is a picture card grid with a search box (item code or name). Pictures are in `web/brand/items/` (Grand's codes match by name).
- **Loose Findings (EXT)**: items without a label. Choose purity, weight (quick 0.1–2 g or type it, ± 0.05 g) and making (VA %, ₹ per g or ₹ fixed, with quick values); the price at today's rate shows live, and **Add to quote** adds it.
- **Settings → Export stock database** (admin only): Excel (.xlsx) or PDF of the whole stock list with product photos. On Android it is saved to Downloads and the share sheet opens.

## V 1.7.5 (9 Nov 2026)

- **Quote search** (Quote → Quotes): party name or phone, quote number (final or provisional), user (for those who see all quotes) and date.
- **Separate final number series** by sale type, given on approval or when the sale is closed: Online enquiry `ON-000001…`, Store walk-in `SW-000001…` (older `QT-` numbers stay).
- **Product card by sale type**: Just price check — nothing is saved, a **Close** button clears the card; Online enquiry — **Save to Quote**; Store walk-in — **Save to Quote** and **Edit details**.

## V 1.7.6 (9 Nov 2026)

- **Product details**: "Making Rate" is now **Making Charges**; new rows **Diamond Pcs** and **Size** (stock column Size / Ring Size / Length).
- **Hidden details** (tap "Show hidden details"; permission "See hidden details (NLC, FVA…)", managers have it): NLC, FVA, HUID, Model, Stone Names, Supplier (stock columns NLC, FVA, HUID No, Model / Design No, Stone Name(s), Supplier).
- **Discount checker** on the product card (Home): enter the discounted making (or −10…−50%), see the price before and after (incl. GST) and save the item to the quote. Managers/admins save it with the discount; others save it as "asked", shown to the manager in the Discount section.
- **Quote → Discount**: helper buttons (−10/−20/−30/−50% making on every item, Reset), **Fit budget** (finds the making discount that brings the final price to the customer's budget), first and final price per item, and **Remove item** for items the customer did not choose.

## V 1.7.7 (9 Nov 2026) — Fair value (FVA) price

- Each scanned item is priced from the label making (rate / % / labour). Below it, the **Fair value price** at the FVA column is shown with the difference as **Discount · You save ₹…** (product card and every quote line).
- FVA column: `9%` (or 0.09) → percentage like VA; a number → ₹ per gram × net weight.
- Nosepins: fair value making ₹450 per piece. Diamond nosepins under 1.00 g: the FVA number is a fixed amount.
- Discount checker has an **FVA** chip; Quote → Discount helper has **Fair value (FVA)** to apply it to every item.

## V 1.7.8 (9 Nov 2026)

- **FVA is a percentage or a fixed amount** (a number in the FVA column = fixed ₹). Nosepins ₹450 per piece; diamond nosepins under 1.00 g use the fixed FVA.
- Product card: **Fair value price in a purple box**; the savings are folded away and shown in large figures only when "Show savings" is tapped (for when the customer asks).
- **Grand Total and Fair value price rounded to the nearest ₹100.**
- Discount checker removed. Quote page: Fair value and Savings in bold purple on every line; the discount helper (−% buttons, budget fit) removed.
- **Additional (flat) discount** is a permission ("Additional discount (flat)"), managers and admins only by default.
- **Edit details / Hide editing** toggles the tag editing panel.
- **Wstg %** is always a percentage: 12, "12%" and Excel's 0.12 (a cell formatted as %) all mean 12%. Stock already loaded with 0.12 is read as 12%.

## V 1.7.62 (9 Nov 2026)

- **Home**: the fair value section is folded behind a **Discounted price** button (tap only if the customer asks). Opening it means the item is saved to the quote at its fair value; **Hide** takes it back to the label price.
- **Quote page order**: Customer details · buttons · Quoted items · URD / Sales return / Advance · Sale type · Summary. The Discount button is removed; the manager's discount card (making after discount, additional discount) is below the summary for managers and admins only.
- Each quote line: Fair value and Savings in bold purple with **Apply / Applied ✓**.
- **Summary**: Total Gross Wt · Total Net Wt · Total Stone Charges · Total Making Charges (Hide/Show) · Total Value at Making Label · Less Total Savings (Discount) · Delivery charges (online) · Taxable Value · GST · Final Amount.

## V 1.7.63 (9 Nov 2026)

- **Round the final amount down to ₹100** is a permission ("Round final amount down to ₹100"); users without it don't see the option (managers keep it).
- Quote lines: Fair value and Savings in bold on a dark purple box (gold outline when applied).
- **Top of the Quote page**: Total Label Value · Savings · Net Payable in one box.
- Summary in colour: Savings on a green band in bold, Final Amount highlighted.
- Fix: a manager's PIN given for one thing (e.g. sharing or hidden details) no longer unlocks everything the manager can do for 15 minutes — only that permission. Staff no longer see or edit the discount section after such an approval.

## V 1.7.65 (9 Nov 2026)

- **Top box** (Total Label Value · Savings · Net Payable) stays on screen while scrolling the Quote page.
- **Special Price** (was Discount), below the Summary, folded by default. Setting it is an **admin** function; managers see it and **Forward to admin for special price** (the admin is notified, sets it and approves; the manager is notified).
- **WhatsApp quote image** redesigned around the savings: a "Your special price" banner (label value struck through, the price to pay, a gold "You save ₹… · …% off" badge), each item with its label price struck through, the special price and a green SAVE pill (all incl. GST), savings lines on green bands, and "You save ₹… on this purchase" under the balance.

## V 1.7.66 (9 Nov 2026)

- **Special promotions** (Settings → Special promotions, admin only): name, benefit (% off making · % off diamond value · ₹ off gold rate per gram · % off the quote · ₹ off the quote), applies to (every quote · quote value from ₹ · gold net weight from g · diamond value from ₹), sale type, dates, message, running on/off. The best running offer that applies is taken off before GST on every user's quotes; it shows in the Summary, the top box and the WhatsApp image. Users get a pop-up of running offers when they open the app (once a day) and an offer bar on Home.
- WhatsApp image: the quote number is sized so it never overlaps the logo.
- Close sale: the **Yamie ERP** invoice number can be entered then or added later on the closed quote (saved to the shared database).
- **Reports** (Settings → Reports; permission "Reports", managers and admins): quoted, generated, approved, total sales from completed quotes, savings and offers given, open / enquiry only, conversion; by user, by sale type, sold by item, completed sales with invoice numbers. Period and sale type filters; **Export Excel** (Summary, By user, By sale type, By item, Sales, Quotes).
- Settings changed by an admin (promotions etc.) reach phones within about a minute.
- **Quotation number** (given when a quote is first saved): first 3 letters of the staff member's name / year / their number — e.g. `RAV/26/274`. Each person's count starts again every year. Older P- numbers stay; the final ON-/SW- numbers are unchanged.
- **Fair Value** (was "Discounted price") on the Home product card: dark purple button with gold text. It is a permission ("Fair Value price", Roles & permissions); every existing role keeps it once. Without it the button and the fair value lines on quotes are hidden.

## V 1.7.75 (11 Nov 2026)

- **Bulk update · Scan labels:** scan tags straight into the list. The phone scanner reopens for the next tag until you go back; in the browser the camera keeps scanning until Done; a handheld scanner adds tags while the form is open. Repeats are skipped, tags not in stock are flagged.
- **Bulk update stock items** is its own permission (`stockBulk`); roles that could edit stock items get it once.
- Roles & permissions: the stock database permissions (delete sold tags, edit items, add items, bulk update) are grouped in a **Stock database** box on each role.

## V 1.7.74 (11 Nov 2026)

- **FVA set by a manager wins:** an FVA saved through Edit in database, Bulk update or a pricing rule (`fvaMan`) is used as it is, also for nosepins (instead of ₹450 per piece). FVA from the sheet keeps the nosepin defaults.
- **Bulk update** (Search tab, permission Edit stock items): pick items by label numbers and/or everything matching a word (type, supplier, location, model…), fill only the details to change (making, FVA, type, purity, location, supplier, stones, size, model, NLC, labelling date), confirm. Saved to the shared database (`stockrow` with `rows`), with a line in the stock history.
- **RNG · Remaining new gold** (Quote, each item): an item altered before sale (Reduce length, Change stone, Others). Enter the weight removed (gold or stone; for a stone change also new stone weight and price). Gross / net / stone weights and the price update, fair value is recalculated, the change shows on the item and in the WhatsApp text. Undo RNG restores the original weights.

## V 1.7.73 (11 Nov 2026)

- Item form: **Making Rate is always ₹ per gram of net wt**, also under 1 g (the sheet import keeps its under-1 g fixed rule). Typing in Wstg %, Fixed Charge or Making Rate clears the other two, so the value typed is the one saved.
- Item form warns when a pricing rule overrides the making or FVA of that item.
- Fix: the HUID number is kept on save (it was cleared).

## V 1.7.72 (11 Nov 2026)

- Fix: **Edit in database** and **+ New item** failed with "not allowed" after the app was reopened (the app keeps the login but not the PIN). They now ask for the PIN once, like other server changes. **Close sale** does the same, so sold tags are removed for every phone.
- Fix: the HUID number typed in the item form is saved as the HUID number (it was going into the HUID count and was dropped).
- Two permissions under Roles & permissions: **Edit stock items** (making, FVA, label details) and **Add new items to stock**. Roles that could edit get both once.
- Netlify: `KIOSK_RATES_PIN` is skipped by the secret scan (a short PIN blocked the Yamie build).

## V 1.7.71 (11 Nov 2026)

- **Edit in database** (product card, new permission `stockEdit`, given to managers): correct the making (Wstg %, fixed charge or making rate), FVA or any label detail of a scanned item. It is saved to the shared database (`stockrow` op) and every phone picks it up within about 30 seconds through the inbox poll (`st` stock version).
- **+ New item** (Search tab header): add a new tagged item with all the label details. It is saved to the shared database for all staff.
- **Close sale removes the sold tags** from the stock database on every phone (`stocksold` op), with a note in the stock history.

## V 1.7.70 (10 Nov 2026)

- **Publish & share the day's rates** (after Save rates, or Gold Rates → Publish & share): update the **Grand Jewellers kiosk** (grandjewellers.com), the **Yamie Shopify** rate metafields (gold_rate_22k/18k/14k/9k/platinum/silver) and send a **WhatsApp rate message**. Netlify env vars on the price-check site (set by the owner): `KIOSK_RATES_PIN` (same as the kiosk's RATES_PIN; optional `KIOSK_URL`), `SHOPIFY_STORE_DOMAIN` with `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (or `SHOPIFY_ADMIN_TOKEN`).
- **Pricing rules (making conventions)** — Settings, admin only: rules by karat, net weight range, product type, making type in the database, diamond / plain gold, supplier, label prefix, NLC range. Each sets making (wastage %, labour ₹/g or ₹ fixed), fair value (FVA % or fixed) and diamond price (₹ per carat), and either overrides the database or only fills empty values. First matching rule wins (order with ↑); a Test box shows what a label would get; the product card shows the rule used.
- Pop-ups scroll when they are taller than the screen.


## V 1.8 — web version on a computer (9 Nov 2026)

Same `web/index.html`, same shared database. Applies on a computer (Chrome / Edge, window ≥ 1280 px with a mouse); phones and tablets (touch) keep their layouts.

- **Scanner first**: on Home the label box always has the focus. A USB / keyboard-wedge scanner (Enter at the end) or typing + Enter prices the item; the box is selected for the next scan.
- **Keyboard shortcuts** (also the keyboard button in the header, or `?`): F2 label box · F3 Search · F4 Save to Quote · Esc clear the product · F6 New quote · F7 Quote · F8 Generate quote · F9 / Ctrl+P print · F10 Reports.
- **Quote page**: items table with every column (St. wt, Stone ₹, Making; St. wt hidden below 1440 px), Summary and Generate Quote beside it.
- **Search**: the whole stock list as a sortable table (click a column; click a row or Enter prices the item; 200 rows at a time).
- **Reports** in the side bar (permission "Reports"): KPI tiles, charts (sales by day, by user, by item, quotes by user, by sale type), tables and Export Excel.
- **Print**: A4 quotation with print preview (header **Print**, F9, or Quote image → Print A4); **Save as PDF** makes a PDF directly. Product photos optional.
- **Sharing**: Send on WhatsApp opens **WhatsApp Web** with the caption and copies the quote image (paste with Ctrl+V); also Copy image / Download image.
- **Settings → This computer · log-out & alerts**: log out after 5 / 15 / 30 / 60 min without use (per computer); turn on and test desktop notifications.
- **Own host name**: a host starting with `pricecheck.` (e.g. `pricecheck.yamie.in`) calls `/api/sync` and `/api/rates` on the same site. Brand is still picked by host (`grand…` → Grand).
- Fix: the sticky Label value / Savings / Net Payable box no longer covers pop-ups.

## V 1.7.76 — Quote Summary like the ERP sheet, ERP quotation check (11 Nov 2026)

- **Items table (computer, ≥ 1280 px):** photo, SKU / item · net wt, Purity, Gold Rate (₹/g, from 1440 px), Gold Value, Stone Charge, Making (before disc.), Gross Amount, Discount, Taxable Value, GST % / ₹, Final Amount. Phones and tablets keep their table.
- **Quote Summary strip (computer):** Gold Rate (Today) box; tiles for Gold Value, Stone Charge, Making (before disc.), Gross Amount, Less Discount, (Delivery), Taxable Value, GST, Final Amount. The items table and summary run full width; the side panel moves below.
- **ERP quotation (all screens):** enter the ERP (Yamie ERP / Acme) quotation number and its final amount. Discount = ERP final amount − app final amount, shown incl. GST and **excl. GST** (÷ 1 + GST %), the figure to enter as the discount in the ERP. A lower ERP amount is flagged. Saved on the quote as `erp {no, amt}`, shared with all phones; quote search finds the ERP quotation number; a closed sale shows it.

## V 1.7.77 — nearest ₹10, HUID and weights on the computer quote (11 Nov 2026)

- **Final amount and fair value round to the nearest ₹10** (was down to ₹100). The round-off (up or down) is adjusted in the discount before GST: taxable value and GST are recalculated, so Gross − Discount = Taxable and Taxable + GST = Final exactly. Shown as "Round-off discount · before GST" in the summary, quote text, quote image and A4. Setting/permission renamed "Round final amount to the nearest ₹10".
- **Computer items table:** new **Gr. / Nt. Wt** column (gross over net) and **HUID** column (₹, pieces × rate).
- **Quote Summary strip:** chips for gross wt, net wt, item count and HUID count; new **HUID Charges** tile; **Less Discount** includes the round-off. Below 1440 px the Gold Rate box sits in a row above the tiles.

## V 1.7.78 — every item to the nearest ₹50, making after discount (11 Nov 2026)

- **Each item's final amount (incl. GST) rounds to the nearest ₹50.** The round-off is added to that item's discount before GST (value before GST = rounded final ÷ 1.03). The quote's final amount is the sum of the items, also a multiple of ₹50; offers, delivery and a flat discount are covered by a last ₹50 round-off on the total. Fair value and grand total on the product card show the same ₹50 figure. Untick "Round each item and the final amount to the nearest ₹50" on the quote to switch it off.
- **Computer items table:** new **Making (After Disc.)** column (making − item discount, with the % off). The Discount column shows the item's round-off ("incl. ₹7.59 round-off", or "+₹15 after round-off" when rounded up).
- Shown figures are derived from the rounded values, so every row and the summary tiles add up exactly: Gross − Discount = Taxable, Taxable + GST = Final, Making before − Discount = Making after.

## V 1.7.79 — label check, making guide, web page design (11 Nov 2026)

- **Label check after a scan** (all devices): when a label is found in the stock, a pop-up lists the details to match with the tag: 01 item, 02 purity, 03 gross & net weight, 04 making on the label, 05 fair value making, 06 stone value (if a stone), 07 diamond value (if diamonds), 08 HUID. Each is ticked; **All checked** unlocks when every line is ticked (**Tick all** for speed). Making or FVA that differs from the convention is flagged in orange. **Fix in database** opens Edit in database (Edit stock items permission); **Skip** carries on. The result is kept on the item (`cur.chk`). Admins switch it off in Settings → Making conventions.
- **Making conventions** (Settings, permission Making helpers): usual making and FVA for each item type and purity, with a note (`settings.mkConv`, synced to all staff). Values like `28%`, `1500 PG`, `800`.
- **Making guide** button on Home (tag-and-percent icon): the conventions for every item type, the scanned item first, with a search box.
- **Web page design on a computer** (≥ 1280 px with a mouse): maroon top header with the logo, item-type tabs (top types by stock count, the rest under More) that open Search filtered to that type, a stock search box (an exact label prices it straight away), alerts and the user; page titles with a subtitle; Home shows today's rates as a rate board and the item as a pricing sheet (photo, Item Details, Description / Rate / Amount table, Grand Total bar); Settings as a grid of cards that open on their own page.
- **Stock search on a computer:** filters for item type, purity, stone (any / diamond / colour / none), supplier, location, labelled and photo, with Clear all; item count, sort, list or photo-grid view, pages of 25 / 50 / 100 / 200, photo column, Labelled ✓, **Price it** and **⋯** (Edit in database).
- Server: `settings` keeps `mkConv` and `chkOn` (permission Making helpers).

## V 1.7.80 — Special FVA on the quote (admin) (11 Nov 2026)

- **Special FVA** button on each quote item's fair value line, for admins only (permission Special price). Set the FVA as **% of gold value** or **₹ for the piece**, with a note (customer / reason). The pop-up shows the label making, the usual FVA, the label price and a live preview: making at the special FVA, the special price, what the customer saves and the usual fair value. A special FVA that is not below the label making is refused (no saving).
- **Apply special price** stores it on that quote item only (`t.fvaX {raw, note, by, at}`) and applies it as the item's fair value making; the stock data is not changed. The item shows a gold **Special price** tag with the special FVA; **Remove special FVA** goes back to the usual fair value. Staff see the special price but cannot change it.
- Fix: the RNG and Special FVA toggles now show the selected option.

## V 1.7.81 — computer: compact Home like the mock-up, prices in Search, choose columns and report items (11 Nov 2026)

- **Home on a computer** (mock-up layout): left — today's rates as four tiles (the item's purity in gold), a scan band (*Scan barcode* | or | label box, with the Making guide), and **Item Details** (photo and the product details list, chosen in Settings → Product details); right — **Value Calculation** (Description / Calculation / Amount: gold rate, gold value, stone, making before discount, HUID, gross amount, **Less Discount**, taxable value, GST) and the **Fair Value (Final Amount)** bar (Grand Total when there is no discount). Less Discount takes a ₹ amount on making (permission Discount on making; stored as the item's quoted making) or the **Fair value** chip (permission Fair value). Bottom bar: sale type, **Reset**, **Add to Quote** (saves and opens the Quote) and **Save & Next** (saves and puts the cursor back in the label box); Close in price-check-only mode. Tablet and phone Home are unchanged.
- **Less clutter on a computer:** no item-type tabs in the header; a slimmer header, page title row and side menu (Home is called *Price Check*); tighter cards.
- **Search on a computer:** today's **Label price** (incl. GST) and **Fair value** for every item (and Savings, optional); **Columns** chooses and orders the columns (saved per computer); **Export Excel** exports the list as shown (permission Export).
- **Reports:** **Customise** chooses which tiles, charts and tables are shown (saved per device).
- **Sort (V 1.7.81b):** Search → *Sort by* lists every column: label no., item type and name, purity, gross / stone / net weight, diamond ct and pcs, stone ₹, making (₹ at today's rate), FVA (% then ₹), label price, fair value, savings, HUID, HUID no., stones, location, supplier, model, size, NLC and labelled date (NLC / supplier / FVA only with Hidden product details; fair value and savings only with Fair value). The **A→Z / 0→9** button flips the direction; prices and weights start high to low. Empty values always go last. Column headers still sort on click. The sort is kept on that computer.

## V 1.7.82 — one label in one quote; approval button (11 Nov 2026)

- **One label, one open quote** (all versions): before an item goes into a quote the app asks the server (`held`) whether that label is already in another open quote (not closed, any user). If so it is not added; a pop-up shows that quote's number, customer, who made it and when, and the item card shows a red line as soon as the label is scanned. The label is free again once it is removed from that quote, the quote is deleted or the sale is closed. The same label twice in one quote is blocked too. **Release it & add here** (managers / admins, permission Approve quotes) takes the label out of the other quote (`release`, logged on that quote as `released`) and adds it here; that phone gets the updated quote. Offline the check is skipped.
- A quote whose last item is removed is now saved to the server too, so its labels are released.
- **Approval button** beside Generate Quote (web and app): staff see **Send for approval** → *Waiting for approval…* → **Approved ✓ SW-000123**; managers and admins see **Approve & send back to Ravi** on a quote waiting for them. Approving gives the quote its number (SW- / ON- series) and sends it back to the staff member (notification and the quote updates on their phone).
- Computer Home: **Add to Quote** opens the Quote only after the item was really added.

## V 1.7.83 — sold labels can never be used again (12 Nov 2026)

- **Sold register** on the server (`sold`: label → date, quote no., invoice, closed by). Closing a sale puts **every** label of that sale on it (also items typed by hand or missing from that phone's stock), then removes them from stock. If the phone is offline, the labels wait on the phone (`soldQ`) and are sent at the next sync.
- A sold label is blocked everywhere: scanning or typing it shows **"FRG382 is sold"** (date, quote number, invoice, who closed it) and it is not priced; it cannot be added to a quote (checked on the phone and with the server); a stock sheet upload leaves sold labels out (the import says how many); **+ New item** with a sold label is refused. Every phone keeps a copy of the register (`soldlist`, refreshed through the inbox `sd` version).
- The register starts with the labels of sales already closed (one-time fill from closed quotes, `v1783`).
- **Settings → Remove sold tags → Sold labels register:** count, search and the latest labels. **Restore** (admin, tap twice) takes a label off the register when a sale is cancelled or the piece returned (`unsell`); add it back to stock afterwards.
- Fix: a cancelled quote (enquiry only) no longer keeps its labels in use.

## V 1.7.86 — pricing rule step by step; making collected under the fair value (12 Nov 2026)

- **Pricing rule form in steps:** 1 **Purity** → 2 **Item name** (Ring, Bangle, Chain… — only those in stock for the chosen purity, with counts) → 3 **Product type** (the item names in the stock sheet for those choices, with counts and a search box; new rule field `names`) → 4 **Weight** (quick ranges Under 1 g, 1–2, 2–5, 5–10, 10–20, 20 g + or from / below) → 5 **Conditions** (making type in database, diamond, supplier, label prefix, NLC). A live line shows how many stock items match. A blank rule name is filled from the choices (e.g. *22K · Bangle · Kids Bangle · 5–10 g*).
- **Making charges collected** under the fair value on Home: the making actually charged at the fair value price (FVA making plus the ₹50 round-off), excl. GST, with the label making for comparison. On a computer it is a row in the Value Calculation (*Making Collected*) and on the Fair Value bar.

## V 1.7.87
- **Imported** – new property on every stock item (Yes / blank). Read from an "Imported" column in the stock upload; set from Edit database or Bulk update (Keep / Yes / No). Shown in product details, as a Search column and filter, and usable in pricing rules.
- **Pricing rule form** – drop-down lists, each listing only what is in stock for the choices above it (with counts): 1 Purity → 2 Item name (G-Bangle, G-Earring…) → 3 Product sub type (the sheet's "Item type" column: Kids Bangle (9K), Findings…) → 4 Making conventions: weight range, supplier, item type, imported, diamond. Making type / label prefix / NLC are under "More conditions". Rules saved with several values keep them ("Several…").
- Corrected naming: Item name = stock "Item name" column; Product sub type = stock "Item type" column.
- **Web Home, fair value** – Grand Total stays at the label price; a separate purple Fair Value box underneath shows the fair value price, FVA %, gold rate, making collected (vs label making) and customer savings.
- **Search** – new filters: Item Type (sheet item type), Item Name, Imported; the label-code filter is now "Label Code".

## V 1.7.88
- **Search filters reordered** – Item Name, Item Type, Purity, Label Code, then the rest. Table columns default to Photo, Item name, Item type, Purity, Label no. (applied once to each computer's saved columns).
- **Range search** – Weight (gross or net), Label price, Fair value, Making ₹ and Diamond ct, each with from / to. Press Enter or leave the box to apply; "Clear all" resets them.
- **Select items and share** – tick boxes in the table, grid and phone cards (tick the header box for the page, or "Select all N found", up to 500). The bar at the bottom opens **Share…**, which asks what to include (photo, label no., item name/type, purity, weights, stone, making, label price, fair value, FVA, HUID no., size, location; supplier and NLC only with Hidden product details) and then:
  - **WhatsApp** – one picture per item (up to 20, only the item's own uploaded photo) and a message listing every item. Phone app: straight into WhatsApp; computer: pictures copied as one sheet to paste into WhatsApp Web. Needs the WhatsApp share permission.
  - **PDF** – A4 table with photos and the chosen details.
  - **Send to user** – another app user gets a notification "Items shared with you"; tapping it opens Search showing only those items, with the sender's note.

## V 1.8.0
- **Version number** – fixed name 1.8.0, shown in the web top bar (next to "Price Check & Quote"), the phone header and the menu (with the build number / web commit). Android versionName is 1.8.0.
- **Shopify link** – the server (op `shoplinks`) reads the active products on the Shopify store in SHOPIFY_STORE_DOMAIN and matches each variant SKU to a label no. (cached 1 hour, the app re-checks every 15 min). A green "Shopify link" shows under the item image on Home, under the photo in Search (table, grid and phone cards), and can be included when sharing items. Draft products are not linked. Uses the same Netlify Shopify settings as the gold-rate sync; the Shopify app needs the read_products permission. Sites without Shopify settings (Grand) show no links.

## V 1.8.1
- **New item / Edit database form** – Label No, Item Name, Item Type, Purity first, then the other database fields.
  - Item Name, Item Type, Supplier and Location are drop-down lists of the values already in the database (with counts), plus "+ New …" to type a new one.
  - Item Type lists the types used with the chosen Item Name first, then all other types.
  - Purity is set from the item type when its name carries it, e.g. "Kids Bangle (9K)" → 9 (unless changed by hand).
  - On a new label, the label code (e.g. BGL) fills in the most common item name and item type for that code.

## V 1.8.2
- **Several photos per item (up to 6)** – tap the item photo (Home, or "+") to open the photo manager: view large, add (camera / gallery / several files), replace, delete (tap twice), make main. Photo 1 is the main photo used in Search and quotes. Server: `img/K`, `img/K/2…`, count in `imgn`; op `img` takes `act` add / set / del / main.
- **Permissions** (Roles → "Product photos" box): Add product photos · Delete / replace product photos (new) · Bulk upload photos (new). New "Stock list in Search (phone app)". Existing roles that add photos get delete and bulk once; every role keeps the stock list once (admin can remove).
- **Search → Photos**: bulk upload photos named by label no. (FRG382.jpg, FRG382-2.jpg …) in lots of 10, add or replace; **Save all photos here** keeps every photo on this phone / computer (in lots of 25) so they open fast and offline. Changed photos refresh automatically.
- **WhatsApp quote image** – new tick "Send the item photos too": the database photos of the quote's items (up to 3 per item, 15 in all) go with the quote image.
- **Phone app Search list** – with an empty search box the app shows the full stock list with the same filters, ranges, sort, pages and select-and-share as the web; tap a row for the full details card.
- **Reports in the app** – a Reports button on the phone Home (with the Reports permission) opens the report.
- Phone stock list: the filter and range bar scrolls sideways inside the card (page no longer wider than the screen).

## V 1.8.3
- **Product name** per item (e.g. "Pink Solo Ring"). Stored apart from the stock sheet (op `pname` / `pnames`, inbox `pn`), so a new stock upload never wipes it; a "Product name" sheet column also works. Set it in New item / Edit database, in the photo manager ("Save name", or typed before adding photos — saved with the photos), or from bulk photo file names: `FRG382 Pink Solo Ring.jpg`, `FRG382-2 Pink Solo Ring.jpg`. Permission: Add product photos, or the stock edit/add permissions.
- Shown as the title on Home, in the phone list and cards, in Search (new "Product name" column and filter Named / No name yet), and in shares (WhatsApp, PDF).
- **Name search** – Search finds items by product name; while typing a name the form shows "✓ Available" or "Already used by FRG382".
- **Paste photos** – in the photo manager: Ctrl+V, the Paste button, or long-press the paste box on a phone. On the computer Home, Ctrl+V with an item open adds the copied photo to that item.

## V 1.8.4
- **Web: hover to see the whole photo** – resting the mouse on an item photo (Search table/grid, Home, photo manager) pops out the complete image with the product name and label no.
- **Stone colour** – up to 5 per item (White, Pink, Red, Green, Blue, Yellow, Purple, Orange, Black, Champagne, Multicolour), shown as colour chips. New Search filter "Stone Colour" and column.
- **Design (jewellery type)** – a list of popular designs grouped by Rings / Earrings / Necklaces / Bracelets & bangles / Others (Solitaire Ring, Bypass Ring, Tennis Bracelet, Chain and Pendant Necklace, Lariat Necklace, Cuff Bangle…), plus "+ New design…" for your own. New Search filter "Design" and column.
- Both are set in New item / Edit database and in the photo manager ("Save details"), kept apart from the stock sheet (op `pattr` / `pattrs`, inbox `pa`) so uploads never wipe them; sheet columns "Design" and "Stone colour" also work. Shown in product details and in shares.
- **Single item to WhatsApp** – "Share on WhatsApp" under the photo on Home, and a WhatsApp button on each Search row: one picture with the chosen details.

## V 1.8.5
- **WhatsApp pictures fixed** – sharing items always sends a picture card per item (earlier, with "Photo" unticked, only the text went). Order of attempts: phone app → straight into WhatsApp with the pictures; browsers that can share files (Android Chrome, Windows/Mac Chrome & Edge) → the share sheet with the pictures; otherwise a panel shows the pictures to drag / copy (Ctrl+V) into WhatsApp Web or download, plus "Open WhatsApp" with the message. The quote image uses the same path.
- **Multiple pictures** – "Also send all photos of each item" sends every photo after its card (up to 30 pictures). Android: with several pictures WhatsApp asks which chat (a number still opens the chat directly for a single picture).
- **Picture card** – logo band, the item photo, product name, item name and label no., the ticked details, Label price / Fair value boxes, and a footer with phone, website and address. A live preview in the Share window follows the ticks. "Message only" sends just the text.

## V 1.8.6
- **Permissions, grouped** – the role editor shows functions in folding groups with "All / None" and a count: Prices & making · Quotes · Search · WhatsApp & sharing · Stock database · Product photos & details · Reports · Settings.
- New permissions – Search: Search page, Search filters, Range search, Select items, Export Search to Excel (was admin-only "Export"). WhatsApp & sharing: Share items on WhatsApp (picture cards), Send all photos of an item, Items as PDF, Send items to another user, Share fair value & savings, Share making / NLC / supplier. Existing roles keep what they could do (one-time migration v186: everyone gets search, filters and ranges; roles that could share get the sharing ones; roles with hidden details get "making, NLC & supplier"; roles with Reports get the Excel export).
- **Picture card only** – a third choice beside "Picture card + message" and "Message only".
- **Savings as the hero** – with "Savings" ticked the card shows a big "YOU SAVE ₹…" box with the % off, the struck-out label price and "You pay".
- **All photos on the card** – the main photo plus up to 4 more as thumbnails.
- Cards are built while the Share window is open, so the share sheet / WhatsApp opens on the first click.

## V 1.8.7
- **Phone search, compact** (phone app and phone browsers, with "Stock list in Search"):
  - One compact list for everything — typing filters the same list (no more long detail cards); the title, buttons and help text are gone, the search box stays at the top.
  - Toolbar: **Filters** (count badge) opens a sheet with all filters and ranges and a "Show N items" button; **Sort** opens a list (tap again to reverse); **Select** turns on tick boxes (or long-press an item); **⋯** holds New item, Bulk update, Photos and Excel export.
  - Active filters show as chips with × under the toolbar, plus "Clear all".
  - Tap an item: a sheet with its photos (swipe), label price / fair value / savings, the main details, and Price it · WhatsApp · Photos · Edit. Typing a full label no. + Enter opens it.
  - "Show 30 more" instead of page numbers.
- Computer layout unchanged.

## V 1.8.8
- **Day's rates locked to the permission** – the server now accepts new day's rates (op `rate`) only with the name and PIN of a user whose role has "Set day's rates"; before, any device with the shop key could save them (a phone with out-of-date roles, or an older app). Online, the rates are saved only after the database accepts them; a refused save shows "Not saved: no permission" and changes nothing. Rates saved offline wait on the phone until a permitted user is logged in. Users without the permission get the Approval screen listing only users who have it.

## V 1.8.9
- **Rate band locked** for users without "Set day's rates": tapping today's rates on Home does nothing (no hand cursor, not a button), the "Gold Rates" tab and the menu's "Day's rates" are hidden, and "Tap to change" hints are gone. If the day's rates are not set, they see "Day's rates not set yet. Ask a manager." Other prompts that would open the rate sheet (e.g. a missing rate) show that message instead. A manager's approval (15 min) unlocks it.

## V 1.8.10
- **Bulk update / Edit database now beat pricing rules** – a pricing rule set to "overrides database" used to replace the making (and FVA) on every scan, so a bulk-updated making never showed in the price. Making typed in Bulk update or Edit database is now marked as hand-set (`mkMan`, like `fvaMan` for FVA) and pricing rules leave it alone; FVA set by hand is likewise kept. The bulk form says how many picked items match a rule, and has "Pricing rules → Follow the pricing rules again" to undo hand-set values. Product details show which parts a rule set ("· sets making, fair value"). A new stock-sheet upload replaces the rows, so items follow the rules again after an upload.

## V 1.8.11
- Items bulk-updated or edited **before** V1.8.10 now also keep their own making: an item that carries an edit time (only Bulk update / Edit database / New item set one; stock-sheet rows don't) counts as hand-set unless "Follow the pricing rules again" was chosen (`mkMan` "0"). Edit database now always records '1' (making typed / changed) or '0' (left as it was → rules apply). So Home now prices with the same making the Search table shows.

## V 1.8.12
- **Supplier list** – Settings → Suppliers (permission "Edit the supplier list", in Stock database; roles that can edit stock get it once). Lists every supplier entered: the saved list (`settings.suppliers`: name, full name / company, phone, note) plus any supplier found on stock items (faded until added; "Add the N suppliers found on stock items"). Find box, + Add supplier, ✕ removes from the list (items keep their supplier), the item count opens those items in Search. Renaming a supplier offers to change it on its stock items too (Bulk update permission).
- Used as the drop-down in New item / Edit database (with "+ New supplier…"), Bulk update (Keep / list / + New supplier…) and pricing rules; drop-downs show "code · full name · item count".

## V 1.8.13
- **Making conventions (Making helper) with more details** – each convention can now also name an **Item name**, an **Item type** (the sheet's item type, e.g. Kids Bangle (9K)) and a **Supplier**, besides label code and purity; all are drop-downs from stock and the supplier list ("Any …" = not used). For a scanned item the convention whose filled details all match, with the most details, is used (so "Bangle · VND01" beats "Bangle"). The Making guide shows these details under the purity and finds them by name, type or supplier. Up to 400 conventions.

## V 1.8.14
- **Quote page in steps** – the Quote tab shows only the current quote, one step at a time: 1 Customer · 2 Sale type · 3 Items · 4 URD & buy-back · 5 Sales return · 6 Advance · 7 Summary · 8 Close sale · 9 WhatsApp. A step bar on top (step name, quote no., customer, balance; tap a step to jump, ✓ when done) and Back / Next buttons at the bottom; swipe left / right on phones. URD and Sales return are skipped for online enquiries. Toolbar URD / SR jump to those steps.
- **All quotations** – a new tab (bottom bar / side bar) with the list, filters and search; tapping a quote makes it the current quote and opens it.
- **Permissions** (new group "Quote page"): All quotations tab, and each step (Customer, Sale type, Items, URD & buy-back, Sales return, Advance, Summary, Close sale, WhatsApp share). Every role gets them once (migration v1814); untick to hide a step.
- **Refund in the ERP final amount** – the amount may be negative (− button or type a minus); it is shown as "Refund to the customer" and compared with the app balance after URD, returns and advance.
- **Diamond / stone buy-back** – in the URD step, "+ Diamond / stone buy-back": stone (Diamond, Solitaire, Ruby, Emerald, Sapphire, other) · carat × rate ₹/ct, taken off the balance like URD; listed in the summary, quote image, text and PDF.

## V 1.8.15
- **Quote page redesign (Create Quote)** – opening Quote lands on an overview: Scan · Search · Add Item · Edit Quote tiles, a compact Quoted Items list (photo, SKU / item, purity, weights, amount, ⋮ menu per item), Charges & Adjustments (total, discount, URD, sales return, advance, sale type – each ✎ opens its step), a Balance Amount bar, Generate Quote, Print and WhatsApp. The V1.8.14 steps stay as the detail pages behind the pencils.
- **Web version only for chosen logins** – new permission "Use the web version" (group Access). Logins without it cannot use the browser version (computer or phone browser); the Android app is open to every login. Admin always can. Roles that manage users, stock or reports get it once (migration v1815); staff do not.
- **Print quote (network printer)** – permission "Print quote". On a computer the A4 quote goes to the browser's print window (any installed / network printer). In the Android app it goes to Android printing, which lists Wi-Fi / network printers the phone sees (Mopria, HP, Epson, Canon… print services) and Save as PDF.
- **Status card for WhatsApp Status** – permission "WhatsApp status card". Pick a product from the quote item ⋮ menu, the Search item sheet, the share window (one item) or the price card on Home. Makes a 1080 × 1920 picture: logo, today's date, product photo (and up to 3 photos as thumbnails), SKU, product name, purity, gross / stone / net weight, Label price (struck), Savings with % off, and the Offer price (quote price or Fair Value price with its FVA). "WhatsApp Status" opens WhatsApp with the picture – choose My status; "Save picture" keeps it.

## V 1.8.16
- **Fair value and savings on the picture cards** – fixed: the fair value (FVA) price was remembered from before the login / before the roles arrived, so cards could miss the fair value and savings until the gold rate changed. The price is now worked out again for the logged-in user, after rule changes and when an item changes.
- Share window: Label price, Fair value and Savings are ticked once for users who may share the fair value. The savings card says "Fair value price" (was "You pay").
- Status card from a quote item: the Offer price is the lower of the quoted price and the Fair value price (with its FVA).

## V 1.8.17
- The fair value needs an FVA on the item (Edit in database, bulk update or a pricing rule). When Fair value / Savings are ticked in the share window but an item has no FVA, a note names the items ("No fair value for FRG0766: no FVA is set…"), so it is clear why the card shows the label price only. The status card says the same.

## V 1.8.18
- **Bulk update: Find items by** purity, supplier, imported (any / imported only / not imported) and a weight range (gross or net wt, from–to g). With the label box and words empty, the finders pick from all stock; with labels or words, only those that also match are picked. The count and the first item codes show as you choose, and Update items still asks to confirm.

## V 1.8.19
- **Bulk update – more finders:** Item type, Item name (follows the type picked), Wastage % from–to, Making (wastage % / fixed charge / making rate / no making set) with ₹ from–to, FVA (set / no FVA / set by hand) with % from–to. Making and FVA are what the price uses, pricing rules included. "No FVA" picks every item that has no fair value, so one FVA can be set for all of them.
