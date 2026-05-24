// Storage adapter, cache-first: tournaments live in memory and are served from there, so
// high-frequency viewer polls never hit the database. The database (Upstash Redis in
// production, else a local JSON file) is touched only on writes + once at startup.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL_ = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const HASH = 'khth:tournaments'
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json')

export const usingRedis = () => !!(URL_ && TOKEN)

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  return (await r.json()).result
}

let cache = {} // id -> tournament (the in-memory source of truth for reads)
let ready = false
let fileTimer = null

async function ensureLoaded() {
  if (ready) return
  try {
    if (usingRedis()) {
      const arr = (await redis(['HVALS', HASH])) || []
      for (const s of arr) { const t = JSON.parse(s); cache[t.id] = t }
    } else {
      try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')).tournaments || {} } catch { cache = {} }
    }
  } finally { ready = true }
}

function persistFile() {
  clearTimeout(fileTimer)
  fileTimer = setTimeout(() => fs.writeFileSync(FILE, JSON.stringify({ tournaments: cache })), 150)
}

// reads — served from memory (no DB hit)
export async function getT(id) { await ensureLoaded(); return cache[id] || null }
export async function listT() { await ensureLoaded(); return Object.values(cache) }

// writes — update memory immediately, then persist (awaited so the write is durable)
export async function putT(t) {
  await ensureLoaded()
  cache[t.id] = t
  if (usingRedis()) await redis(['HSET', HASH, t.id, JSON.stringify(t)])
  else persistFile()
}
export async function delT(id) {
  await ensureLoaded()
  delete cache[id]
  if (usingRedis()) await redis(['HDEL', HASH, id])
  else persistFile()
}
