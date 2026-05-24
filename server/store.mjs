// Storage adapter: uses Upstash Redis (REST) in production when configured, else a local
// JSON file. Keeps the server host-agnostic and free-tier friendly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const URL_ = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const HASH = 'khth:tournaments'

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

// ---- file fallback ----
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json')
function fileLoad() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { tournaments: {} } }
}
let fileDb = usingRedis() ? { tournaments: {} } : fileLoad()
let timer = null
function fileSave() { clearTimeout(timer); timer = setTimeout(() => fs.writeFileSync(FILE, JSON.stringify(fileDb)), 150) }

export async function getT(id) {
  if (usingRedis()) { const v = await redis(['HGET', HASH, id]); return v ? JSON.parse(v) : null }
  return fileDb.tournaments[id] || null
}
export async function putT(t) {
  if (usingRedis()) { await redis(['HSET', HASH, t.id, JSON.stringify(t)]); return }
  fileDb.tournaments[t.id] = t; fileSave()
}
export async function delT(id) {
  if (usingRedis()) { await redis(['HDEL', HASH, id]); return }
  delete fileDb.tournaments[id]; fileSave()
}
export async function listT() {
  if (usingRedis()) { const arr = (await redis(['HVALS', HASH])) || []; return arr.map((s) => JSON.parse(s)) }
  return Object.values(fileDb.tournaments)
}
