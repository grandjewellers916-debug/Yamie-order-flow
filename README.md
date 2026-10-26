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
