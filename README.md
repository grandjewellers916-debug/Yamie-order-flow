# Yamie Price Check

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
