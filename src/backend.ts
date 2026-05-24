import { Tournament } from './types'

// Backend is enabled when VITE_API_URL is set (point at a remote API) OR VITE_SELF_HOSTED=true
// (the app is served by our own server, so the API lives at the same origin → relative /api).
// When neither is set the app runs local-only (localStorage) — e.g. the static GitHub Pages build.
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const SELF = (import.meta.env.VITE_SELF_HOSTED as string | undefined) === 'true'
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
