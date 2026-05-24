import { Tournament } from './types'

// The app talks to a backend API by default (same-origin /api), since it's served by our own
// server / Cloudflare Pages. Set VITE_API_URL to point at a remote API instead, or
// VITE_SELF_HOSTED=false to force pure local-only mode (no backend).
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const SELF = (import.meta.env.VITE_SELF_HOSTED as string | undefined) !== 'false' // default ON
const API = RAW // '' means same-origin relative requests

export const backendEnabled = () => !!RAW || SELF
export const apiBase = () => API

export async function apiLogin(user: string, pass: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    })
    if (!r.ok) return null
    return (await r.json()).token as string
  } catch { return null }
}

export async function apiGet(id: string): Promise<Tournament | null> {
  try {
    const r = await fetch(`${API}/api/tournaments/${id}`)
    if (!r.ok) return null
    return (await r.json()) as Tournament
  } catch { return null }
}

export async function apiPut(id: string, t: Tournament, token: string): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/tournaments/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(t),
    })
    return r.ok
  } catch { return false }
}

export async function apiDelete(id: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/tournaments/${id}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}` },
    })
    return r.ok
  } catch { return false }
}
