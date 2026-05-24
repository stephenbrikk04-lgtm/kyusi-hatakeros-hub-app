// Kyusi Hatakeros Tournament Hub — backend API (+ serves the built app)
// Stores each tournament's live state so participants can view it across devices.
// Writes require an organizer token (server-side login); reads are public (view-only).
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getT, putT, delT, listT, usingRedis } from './store.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8787
const ORG_USER = process.env.ORG_USER || 'Kyusihatakeros2026'
const ORG_PASS = process.env.ORG_PASS || 'Zenki123**'

// ---- auth: login issues a bearer token; writes must present it ----
const tokens = new Set()
function requireAuth(req, res, next) {
  const h = req.headers.authorization || ''
  const t = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!t || !tokens.has(t)) return res.status(401).json({ error: 'organizer login required' })
  next()
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, store: usingRedis() ? 'redis' : 'file' }))

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {}
  if (String(user).trim() === ORG_USER && pass === ORG_PASS) {
    const token = crypto.randomUUID()
    tokens.add(token)
    return res.json({ token })
  }
  res.status(401).json({ error: 'invalid credentials' })
})

app.get('/api/tournaments', async (_req, res) => {
  const all = await listT()
  res.json(all.map((t) => ({
    id: t.id, name: t.name, game: t.game, organizer: t.organizer,
    status: t.status, format: t.settings?.format, participants: t.participants?.length ?? 0,
    updatedAt: t.updatedAt, createdAt: t.createdAt,
  })))
})

app.get('/api/tournaments/:id', async (req, res) => {
  const t = await getT(req.params.id)
  if (!t) return res.status(404).json({ error: 'not found' })
  const since = Number(req.query.since || 0)
  if (since && t.updatedAt && t.updatedAt <= since) return res.status(304).end()
  res.json(t)
})

app.put('/api/tournaments/:id', requireAuth, async (req, res) => {
  const t = { ...(req.body || {}), id: req.params.id, updatedAt: Date.now() }
  await putT(t)
  res.json({ ok: true, updatedAt: t.updatedAt })
})

app.delete('/api/tournaments/:id', requireAuth, async (req, res) => {
  await delT(req.params.id)
  res.json({ ok: true })
})

// ---- serve the built frontend from the same origin ----
const candidates = [process.env.STATIC_DIR, path.join(__dirname, 'public'), path.join(__dirname, '..', 'dist')]
const STATIC_DIR = candidates.find((d) => d && fs.existsSync(d))
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR))
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')))
}

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Kyusi Hatakeros Hub on :${PORT} — store=${usingRedis() ? 'redis' : 'file'}${STATIC_DIR ? ', serving app' : ''}`),
)
