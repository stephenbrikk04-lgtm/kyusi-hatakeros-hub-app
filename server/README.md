# Kyusi Hatakeros Tournament Hub — backend

Small Node/Express API that stores each tournament's live state so participants can view it
across devices. Writes require an organizer token (server-side login); reads are public.

## Run locally
```bash
# 1) backend (port 8787)
cd server
npm install
npm start            # → http://localhost:8787

# 2) frontend (in another terminal) — dev mode points at the local backend via .env.development
cd ..
npm run dev          # → http://localhost:5173
```

### Try the cross-device flow on one machine
1. Open http://localhost:5173 → **Organizer login** (`Kyusihatakeros2026` / `Zenki123**`).
2. Create a tournament, start it, score a match.
3. In a **second window / incognito**, open `http://localhost:5173/#/live/<tournamentId>`
   (use the "Share live link" button to copy it). It updates within ~4s as the organizer edits.

Both windows talk to the same backend, so they behave like two different devices.

## API
- `POST /api/login` `{user,pass}` → `{token}` (401 on bad creds)
- `GET  /api/tournaments` → list of summaries
- `GET  /api/tournaments/:id` → full tournament (public; `?since=<ts>` → 304 if unchanged)
- `PUT  /api/tournaments/:id` (Bearer token) → upsert
- `DELETE /api/tournaments/:id` (Bearer token)

## Config (env)
- `PORT` (default 8787)
- `ORG_USER`, `ORG_PASS` — organizer credentials (set these in production)
- `DATA_FILE` — path to the JSON store (default `server/data.json`)

## Notes / production
- Storage is a single JSON file — fine for one organizer + many viewers. For heavier use,
  swap the load/save in `index.mjs` for Firestore/Postgres.
- The frontend enables the backend only when built with `VITE_API_URL` set:
  `VITE_API_URL=https://your-api.example.com npm run build`. Without it, the app is local-only.
- Real-time is via the live page polling every ~4s (robust, no websockets needed).
