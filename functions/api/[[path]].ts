// Cloudflare Pages Function — the API for the Tournament Hub, backed by D1 (SQLite).
// Routes (all under /api): login, list, get, put, delete. Reads are public; writes need a
// valid organizer token (stateless HMAC, so no session storage needed).

interface Env {
  DB: D1Database
  ORG_USER?: string
  ORG_PASS?: string
  AUTH_SECRET?: string
}

const enc = (s: string) => new TextEncoder().encode(s)
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc(payload)))
}
const secretOf = (env: Env) => env.AUTH_SECRET || env.ORG_PASS || 'dev-secret'

async function issueToken(env: Env): Promise<string> {
  const body = b64url(enc(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 })))
  return `${body}.${await hmac(body, secretOf(env))}`
}
async function verifyToken(token: string, env: Env): Promise<boolean> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return false
  if ((await hmac(body, secretOf(env))) !== sig) return false
  try {
    const { exp } = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof exp === 'number' && exp > Date.now()
  } catch { return false }
}
async function authed(req: Request, env: Env): Promise<boolean> {
  const h = req.headers.get('authorization') || ''
  const t = h.startsWith('Bearer ') ? h.slice(7) : ''
  return !!t && verifyToken(t, env)
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })

async function ensureSchema(env: Env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY, data TEXT, updatedAt INTEGER)').run()
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean) // e.g. ['tournaments','id']
  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, { headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    } })
  }

  await ensureSchema(env)

  // POST /api/login
  if (parts[0] === 'login' && method === 'POST') {
    const { user, pass } = await request.json().catch(() => ({}))
    const okUser = (env.ORG_USER || 'Kyusihatakeros2026')
    const okPass = (env.ORG_PASS || 'Zenki123**')
    if (String(user).trim() === okUser && pass === okPass) return json({ token: await issueToken(env) })
    return json({ error: 'invalid credentials' }, 401)
  }

  if (parts[0] === 'health') return json({ ok: true, store: 'd1' })

  if (parts[0] === 'tournaments') {
    const id = parts[1]
    // list
    if (!id && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT data FROM tournaments').all<{ data: string }>()
      const list = (results || []).map((r) => {
        const t = JSON.parse(r.data)
        return { id: t.id, name: t.name, game: t.game, organizer: t.organizer, status: t.status,
          format: t.settings?.format, participants: t.participants?.length ?? 0, updatedAt: t.updatedAt, createdAt: t.createdAt }
      })
      return json(list)
    }
    // get one
    if (id && method === 'GET') {
      const row = await env.DB.prepare('SELECT data, updatedAt FROM tournaments WHERE id = ?').bind(id).first<{ data: string; updatedAt: number }>()
      if (!row) return json({ error: 'not found' }, 404)
      const since = Number(url.searchParams.get('since') || 0)
      if (since && row.updatedAt && row.updatedAt <= since) return new Response(null, { status: 304 })
      return json(JSON.parse(row.data))
    }
    // upsert (auth)
    if (id && method === 'PUT') {
      if (!(await authed(request, env))) return json({ error: 'organizer login required' }, 401)
      const body = await request.json().catch(() => ({}))
      const t = { ...(body as object), id, updatedAt: Date.now() }
      await env.DB.prepare('INSERT INTO tournaments (id, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt')
        .bind(id, JSON.stringify(t), t.updatedAt).run()
      return json({ ok: true, updatedAt: t.updatedAt })
    }
    // delete (auth)
    if (id && method === 'DELETE') {
      if (!(await authed(request, env))) return json({ error: 'organizer login required' }, 401)
      await env.DB.prepare('DELETE FROM tournaments WHERE id = ?').bind(id).run()
      return json({ ok: true })
    }
  }

  return json({ error: 'not found' }, 404)
}
