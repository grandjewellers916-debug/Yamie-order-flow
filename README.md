# Yamie Repair Track (Android)

Customer repair desk for Yamie Fine Jewellery: intake with photos and signature, issue to smith, receive back, QC, inform customer (call / WhatsApp), close; users with PIN and permissions; dashboard; reminders; reports.

- `web/index.html` — the whole app (single file, also works in a phone browser).
- `android/` — WebView wrapper. Adds camera/gallery, WhatsApp and dialer, printing, saving backups/reports to Downloads, and phone notifications for reminders (checked every 15 minutes, even when the app is closed).
- Every push to this branch builds the APK on GitHub Actions and publishes it under Releases as `repair-track-vN`.

Data is stored on the phone. Use More → Backup & restore regularly.
