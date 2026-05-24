import { useEffect, useState } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'tournament'; id: string }
  | { name: 'live'; id: string }
  | { name: 'leaderboards' }

export function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, '')
  const parts = h.split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new' }
  if (parts[0] === 'leaderboards') return { name: 'leaderboards' }
  if (parts[0] === 'live' && parts[1]) return { name: 'live', id: parts[1] }
  if (parts[0] === 't' && parts[1]) return { name: 'tournament', id: parts[1] }
  return { name: 'dashboard' }
}

export function navigate(path: string) {
  window.location.hash = path
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash())
  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
