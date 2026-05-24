# Kyusi Hatakeros Tournament Hub

A web-based tournament & competition manager — brackets, leagues, and leaderboards.
Modern minimalist UI (Style A / Linear), dark + light mode, everything saved locally
in your browser (no account, no server).

## Features
- **Formats:** Single elimination, double elimination (with grand-final bracket reset),
  round robin (single/double), and Swiss.
- **Group stage → playoffs:** split into groups, set how many advance per group, and the
  knockout bracket builds automatically when the groups finish.
- **Challonge points system:** configurable points per match win / tie / loss, per game won,
  and per bye, with tiebreakers (points → match wins → head-to-head → game diff → points scored).
- **Live brackets** with click-to-score, byes handled automatically, seeding + shuffle.
- **Standings** that recalculate instantly, and a cross-tournament **leaderboard** (titles + wins).
- Dark / light theme toggle.

## Run it
```bash
cd ~/projects/bracketforge
npm install        # already done
npm run dev        # http://localhost:5173
```

Build for hosting (static — drop `dist/` on any static host):
```bash
npm run build && npm run preview
```

## Tests
Engine smoke test (all formats end-to-end):
```bash
npx esbuild test/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/bf_smoke.mjs && node /tmp/bf_smoke.mjs
```

## Layout
- `src/engine/` — format generators (`singleElim`, `doubleElim`, `roundRobin`, `swiss`),
  `standings` (points + tiebreaks), `score` (result propagation/recompute), `build` (orchestration).
- `src/store/` — localStorage-backed state.
- `src/components/`, `src/pages/` — UI.
- `mockups/` — the 3 original design previews.
