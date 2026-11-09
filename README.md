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
