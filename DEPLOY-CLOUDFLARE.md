# Deploy to Cloudflare (free, always-on, no cold starts)

Cloudflare **Pages** serves the app, **Pages Functions** run the API, and **D1** (SQLite) stores
the data. All on Cloudflare's free tier: always-on, no spin-down, and D1's free tier (5M reads/day)
easily covers the live polling.

Everything is in the repo already: `functions/api/[[path]].ts` (the API) and `wrangler.toml`.

---

## Step 1 — Create the D1 database
1. Cloudflare dashboard → **Workers & Pages** → **D1 SQL Database** → **Create**.
2. Name it **`khth-db`** → Create. (No tables needed — the app creates them automatically.)

## Step 2 — Create the Pages project (from GitHub)
1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize GitHub and pick the repo **`kyusi-hatakeros-hub-app`**.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm install && npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (add these — they apply to build + functions):
   | Name | Value |
   |---|---|
   | `VITE_SELF_HOSTED` | `true` |
   | `ORG_USER` | `Kyusihatakeros2026` |
   | `ORG_PASS` | a strong password |
   | `AUTH_SECRET` | any long random string (used to sign login tokens) |
5. **Save and Deploy.**

## Step 3 — Bind the database, then redeploy
1. Open the new Pages project → **Settings** → **Functions** (or **Bindings**) → **D1 database bindings** → **Add binding**.
   - **Variable name:** `DB`
   - **D1 database:** `khth-db`
2. Go to **Deployments** → **Retry deployment** (so the new binding takes effect).

## Step 4 — Use it
- Your site is at **`https://kyusi-hatakeros-hub.pages.dev`** (or your project name).
- Open it → **Organizer login** (`ORG_USER` / `ORG_PASS`) → run tournaments.
- Participants open the same URL (or a **Share live link**) on any device — always-on, updates in ~4s.

---

## Notes
- **No cold starts.** Cloudflare Workers are always warm.
- **Real login.** The API verifies a signed (HMAC) token server-side; viewers can't write.
- **Data persists** in D1 across deploys.
- **Updates:** push to the repo's `main` branch → Cloudflare auto-rebuilds and deploys.
- **Custom domain:** Pages project → Custom Domains.

## Optional: deploy via CLI instead of the dashboard
```bash
npx wrangler login                       # opens browser to authorize your Cloudflare account
npx wrangler d1 create khth-db           # copy the database_id into wrangler.toml
npm run build                            # VITE_SELF_HOSTED=true npm run build
npx wrangler pages deploy dist           # deploys app + functions
```
Set the env vars/bindings in the dashboard either way.
