import { Tournament } from './types'

// The app talks to a backend API by default (same-origin /api), since it's served by our own
// server / Cloudflare Pages. Set VITE_API_URL to point at a remote API instead, or
// VITE_SELF_HOSTED=false to force pure local-only mode (no backend).
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const SELF = (import.meta.env.VITE_SELF_HOSTED as string | undefined) !== 'false' // default ON
const API = RAW // '' means same-origin relative requests

// Independent backup hub (Render). If the primary is unreachable, the app auto-fails over here.
const BACKUP = 'https://kyusi-hatakeros-hub-backup.onrender.com'

export const backendEnabled = () => !!RAW || SELF

// ---- resilient transport with automatic failover to the backup ----
let activeBase = API          // '' = same-origin (primary) by default
let failedOver = false
const failoverCbs = new Set<() => void>()
export const onFailover = (cb: () => void) => { failoverCbs.add(cb); return () => failoverCbs.delete(cb) }
export const usingBackup = () => failedOver
export const apiBase = () => activeBase

// A 5xx from the Cloudflare edge (522/523/502/503/504…) means the primary is effectively down,
// just like a thrown network error — both should trigger failover. App-level 500/501 do not.
const looksDown = (status: number) => status >= 502

async function rfetch(path: string, init?: RequestInit): Promise<Response> {
  // Already on the backup (or backup unavailable as a target) → just call it.
  if (failedOver || activeBase === BACKUP || (typeof location !== 'undefined' && location.origin === BACKUP)) {
    return fetch(`${activeBase}${path}`, init)
  }
  try {
    const r = await fetch(`${activeBase}${path}`, init)
    if (looksDown(r.status)) throw new Error(`primary ${r.status}`)
    return r
  } catch (primaryErr) {
    // Primary unreachable — try the backup. Only commit the failover if the backup answers.
    try {
      const r = await fetch(`${BACKUP}${path}`, init)
      activeBase = BACKUP
      failedOver = true
      failoverCbs.forEach((cb) => cb())
      return r
    } catch {
      throw primaryErr
    }
  }
}

export async function apiLogin(user: string, pass: string): Promise<string | null> {
  try {
    const r = await rfetch(`/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    })
    if (!r.ok) return null
    return (await r.json()).token as string
  } catch { return null }
}

export async function apiGet(id: string): Promise<Tournament | null> {
  try {
    const r = await rfetch(`/api/tournaments/${id}`)
    if (!r.ok) return null
    return (await r.json()) as Tournament
  } catch { return null }
}

// List every tournament on the server (summaries: id + updatedAt + basic fields).
// Used to populate the dashboard from the cloud so it shows the same set on any device.
export async function apiList(): Promise<{ id: string; updatedAt?: number }[]> {
  try {
    const r = await rfetch(`/api/tournaments`)
    if (!r.ok) return []
    return (await r.json()) as { id: string; updatedAt?: number }[]
  } catch { return [] }
}

// Returns the server's updatedAt on success (so the client can record the synced version),
// or null on failure.
export async function apiPut(id: string, t: Tournament, token: string): Promise<number | null> {
  try {
    const r = await rfetch(`/api/tournaments/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(t),
    })
    if (!r.ok) return null
    return ((await r.json()).updatedAt as number) ?? Date.now()
  } catch { return null }
}

export async function apiDelete(id: string, token: string): Promise<boolean> {
  try {
    const r = await rfetch(`/api/tournaments/${id}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` },
    })
    return r.ok
  } catch { return false }
}
