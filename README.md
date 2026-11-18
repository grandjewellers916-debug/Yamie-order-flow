# Yamie Stock Check

Daily stock verification for Yamie: guided Yes/No counting (counter → tray → next counter), buffer trays, boxes (count + weight), consolidated view, Yamie ERP Pc/Lbl match at closing. v1.1

- `web/index.html` — the whole app (phone + computer layouts)
- `web/core.mjs` — shared stock logic (browser + server)
- `netlify/functions/api.mts` — `/api/*`, shared database in Netlify Blobs (store `yamie-stock`)
- `netlify/lib/seed.mjs` — first-run data from the 17-Nov-2026 count sheets

Netlify project: `yamie-stock-check` (publish `web`). First login: admin / PIN 1986 (or `ADMIN_PIN` env var). Change it after first login.
