# Yamie Repair Desk (Android)

Customer repair desk for Yamie Fine Jewellery: intake with photos and signature, issue to smith, receive back, QC, inform customer (call / WhatsApp), close; users with PIN and permissions; dashboard; reminders; reports.

- `web/index.html` — the whole app (single file, also works in a phone browser).
- `android/` — WebView wrapper. Adds camera/gallery, WhatsApp and dialer, printing, saving backups/reports to Downloads, and phone notifications for reminders (checked every 15 minutes, even when the app is closed).
- Every push to this branch builds the APK on GitHub Actions and publishes it under Releases as `repair-track-vN`.

Data is kept in the shared database (Netlify Blobs store `yamie-repair`). Use More → Settings & backup → Backup & restore regularly.

## V1.8 — Backup & restore (21 Nov 2026)
- More → Settings & backup → **Backup & restore** (admin). **Make backup** saves one `.zip` with every record of the shared database: all repairs, **every photo** (as `.jpg` files under `shared/img/`), voucher numbers, users and PINs (hashed), smiths, services, permissions and settings. Android: saved to Downloads + share sheet; web: download.
- **Restore…** shows the date, who made it and how many repairs/photos, then **Replace everything** (the database becomes exactly the backup) or **Add & update only**, type RESTORE. Every phone reloads everything afterwards (`meta/resetAt`). Old `.json` backups (V1.0–1.7) can still be restored (adds missing repairs).
- Not backed up: the change log (`chg/`), PIN lock-outs and `meta/secret` (stays as it is on this site).
- API: `POST /api/bk/list|get|put|del|done` (admin; `netlify/lib/backup.mts`), records moved 2.5 MB at a time. Zip built in the app by `web/ybk.js` (shared with Price Check and Yamie SOP). Android: `fileBegin/fileAppend/fileEnd` save big files in pieces.
