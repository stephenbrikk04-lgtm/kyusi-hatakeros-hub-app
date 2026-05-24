# Deploying Kyusi Hatakeros Tournament Hub (free)

This deploys **one** free web service that serves both the app and the API, with a free
persistent database. Organizers log in to edit; participants open the same URL (or a
per-tournament live link) on any device and watch live.

**Stack:** Render (free web service) + Upstash (free Redis). Both are your own accounts —
nothing on company infrastructure.

---

## Step 1 — Free database (Upstash Redis)
1. Sign up at **https://upstash.com** (free).
2. **Create Database** → **Redis** → pick a region near you → Create.
3. On the database page, find the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Keep these two for Step 2.

## Step 2 — Free host (Render)
1. Sign up at **https://render.com** (free) and connect your **GitHub** account
   (`stephenbrikk04-lgtm`), authorizing access to this repo.
2. Click **New + → Blueprint**.
3. Select the repo **kyusi-hatakeros-hub-app**. Render reads `render.yaml` automatically.
4. It will prompt for these environment variables — fill them in:

   | Key | Value |
   |-----|-------|
   | `ORG_USER` | `Kyusihatakeros2026` (or your choice) |
   | `ORG_PASS` | a strong password (this is the REAL login — see note) |
   | `UPSTASH_REDIS_REST_URL` | from Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | from Upstash |

5. Click **Apply / Create**. In ~2–3 minutes you get a public URL like
   `https://kyusi-hatakeros-hub.onrender.com`.

## Step 3 — Share
- That URL **is** the live app. Send it to organizers and participants.
- Organizers: open the URL → **Organizer login** → create/run tournaments.
- Participants: open the same URL, or click an organizer's **Share live link** for a
  read-only live view of one tournament. Updates appear within ~4 seconds.

---

## Notes
- **Real login.** In the hosted version the *server* validates `ORG_PASS` (the browser never
  sees it), so only people with the password can edit; viewers genuinely cannot. Set a strong
  `ORG_PASS`.
- **Persistence.** Tournament data is stored in Upstash and survives restarts/redeploys.
- **Cold start.** Render's free tier sleeps after ~15 min idle, so the first visit after a quiet
  period takes ~30–50s to wake. Fine for events; upgrade to a paid instance later for always-on.
- **Updates.** Push to the `main` branch → Render auto-redeploys.
- **Custom domain / password change.** Both are done in the Render dashboard (Settings → Environment / Custom Domains).

## Run locally instead (no hosting)
```bash
# backend + app on one port
cd server && npm install && cd ..
npm install && VITE_SELF_HOSTED=true npm run build && rm -rf server/public && cp -r dist server/public
node server/index.mjs          # → http://localhost:8787
```
Set `ORG_USER` / `ORG_PASS` (and optionally `UPSTASH_*`) as env vars to override defaults.
Without `UPSTASH_*` it stores data in `server/data.json`.
