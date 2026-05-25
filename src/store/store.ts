import { useSyncExternalStore } from 'react'
import {
  DEFAULT_POINTS, DEFAULT_TIEBREAKS, defaultTiebreaks, Format, Participant, PointsConfig, RankCriterion,
  Tournament, TournamentSettings,
} from '../types'
import { uid } from '../engine/util'
import { buildInitialMatches, maybeAdvanceSwiss, maybeStartPlayoff, stage1Complete } from '../engine/build'
import { recompute } from '../engine/score'
import { backendEnabled, apiLogin, apiPut, apiDelete, apiGet, apiList } from '../backend'

const LS_KEY = 'bracketforge.v1'

export type Role = 'organizer' | 'viewer'

interface State {
  tournaments: Tournament[]
  mode: 'dark' | 'light'
  role: Role
  authed: boolean // organizer is logged in
  token: string | null // server write token (persisted so saves survive a page reload)
}

const ORG_USER = 'Kyusihatakeros2026'
const ORG_PASS = 'Zenki123**'

const VALID_CRITERIA = new Set<RankCriterion>([
  'match_wins', 'score', 'score_diff', 'points', 'buchholz', 'head_to_head', 'tb',
])

function load(): State {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const state = JSON.parse(raw) as State
      // migrate ranking criteria + new fields from older saved data
      for (const t of state.tournaments ?? []) {
        const order = (t.settings?.tiebreakOrder ?? []).filter((c) => VALID_CRITERIA.has(c as RankCriterion))
        t.settings.tiebreakOrder = order.length ? (order as RankCriterion[]) : [...DEFAULT_TIEBREAKS]
        if (!t.log) t.log = []
      }
      if (state.authed === undefined) state.authed = false
      if (state.token === undefined) state.token = null
      // role follows auth: a saved organizer stays logged in across reloads
      state.role = state.authed ? 'organizer' : 'viewer'
      return state
    }
  } catch {}
  return { tournaments: [], mode: 'dark', role: 'viewer', authed: false, token: null }
}

let state: State = load()
// restore the write token so the organizer's saves keep reaching the server after a reload
let syncToken: string | null = state.token
// stuck session from an older build (marked logged-in but with no server token) → force a real
// re-login so the organizer gets a token and their saves actually sync.
if (backendEnabled() && state.authed && !state.token) {
  state.authed = false
  state.role = 'viewer'
}
const listeners = new Set<() => void>()

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch {}
}

function emit() {
  persist()
  listeners.forEach((l) => l())
}

function set(updater: (s: State) => State) {
  state = updater(state)
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// ---- hooks ----
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

export function useTournaments() { return useStore((s) => s.tournaments) }
export function useTournament(id: string | null) {
  return useStore((s) => s.tournaments.find((t) => t.id === id) ?? null)
}
export function useMode() { return useStore((s) => s.mode) }
export function useRole() { return useStore((s) => s.role) }
export function useAuthed() { return useStore((s) => s.authed) }

// ---- mode ----
export function toggleMode() {
  set((s) => ({ ...s, mode: s.mode === 'dark' ? 'light' : 'dark' }))
  applyMode()
}
export function applyMode() {
  document.documentElement.setAttribute('data-mode', state.mode)
}

// ---- role / auth ----
// Organizer access is gated by login. Viewer is always allowed.
export function setRole(role: Role) {
  set((s) => ({ ...s, role: role === 'organizer' && !s.authed ? s.role : role }))
}

// When a backend is configured, login is validated server-side and returns a write token.
// Otherwise it falls back to the local credential check.
export async function login(user: string, pass: string): Promise<boolean> {
  if (backendEnabled()) {
    const token = await apiLogin(user, pass)
    if (!token) return false
    syncToken = token
    set((s) => ({ ...s, authed: true, role: 'organizer', token })) // persist the token
    // publish any tournaments created offline so viewers can see them
    state.tournaments.forEach((t) => apiPut(t.id, t, token).then((ts) => { if (ts) markSynced(t.id, ts) }).catch(() => {}))
    return true
  }
  if (user.trim() === ORG_USER && pass === ORG_PASS) {
    set((s) => ({ ...s, authed: true, role: 'organizer' }))
    return true
  }
  return false
}

export function logout() {
  syncToken = null
  set((s) => ({ ...s, authed: false, role: 'viewer', token: null }))
}

// Push a tournament to the backend (organizer only). Fire-and-forget; records the server's
// version stamp on success so cross-device sync can tell which copy is freshest.
function publish(t: Tournament) {
  if (backendEnabled() && syncToken) {
    apiPut(t.id, t, syncToken).then((ts) => { if (ts) markSynced(t.id, ts) }).catch(() => {})
  }
}

// Stamp a tournament with the server's updatedAt without re-publishing it.
function markSynced(id: string, updatedAt: number) {
  set((s) => ({ ...s, tournaments: s.tournaments.map((t) => (t.id === id ? { ...t, updatedAt } : t)) }))
}

// Used by the live (spectator) view: merge a tournament fetched from the backend into
// local state without pushing it back.
export function upsertFromBackend(t: Tournament) {
  set((s) => {
    const i = s.tournaments.findIndex((x) => x.id === t.id)
    const next = i >= 0 ? s.tournaments.map((x) => (x.id === t.id ? t : x)) : [t, ...s.tournaments]
    return { ...s, tournaments: next }
  })
}

// Pull the cloud's tournament list into local state so the dashboard shows the same set on any
// device. Brings in tournaments this device is missing and refreshes any the server has a newer
// copy of. Local-only tournaments (not yet on the server) aren't on the list, so they're left
// untouched — and get pushed up on the next organizer login.
export async function syncFromServer() {
  if (!backendEnabled()) return
  const list = await apiList()
  for (const s of list) {
    const local = state.tournaments.find((t) => t.id === s.id)
    if (local && (local.updatedAt ?? 0) >= (s.updatedAt ?? 0)) continue
    const full = await apiGet(s.id)
    if (full) upsertFromBackend(full)
  }
}

// ---- defaults ----
export function defaultSettings(format: Format = 'single'): TournamentSettings {
  return {
    format,
    pointsConfig: { ...DEFAULT_POINTS },
    tiebreakOrder: defaultTiebreaks(format),
    rrIterations: 1,
    swissRounds: 0,
    grandFinalReset: true,
    groupStage: false,
    groupCount: 1,
    advancePerGroup: 2,
    playoffFormat: 'single',
    thirdPlace: false,
  }
}

// ---- logging ----
function logTo(t: Tournament, text: string) {
  t.log.unshift({ id: uid('l_'), ts: Date.now(), text })
  if (t.log.length > 500) t.log.length = 500
}
function pName(t: Tournament, pid: string | null): string {
  return pid ? t.participants.find((p) => p.id === pid)?.name ?? '—' : '—'
}

// ---- mutations ----
function replace(id: string, fn: (t: Tournament) => void) {
  let changed: Tournament | null = null
  set((s) => ({
    ...s,
    tournaments: s.tournaments.map((t) => {
      if (t.id !== id) return t
      const clone: Tournament = JSON.parse(JSON.stringify(t))
      fn(clone)
      changed = clone
      return clone
    }),
  }))
  if (changed) publish(changed)
}

export function createTournament(input: {
  name: string
  game?: string
  organizer?: string
  description?: string
  date?: string
  settings: TournamentSettings
  participantNames: string[]
}): string {
  const id = uid('t_')
  const participants: Participant[] = input.participantNames
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name, i) => ({ id: uid('p_'), name, seed: i + 1, active: true }))
  const t: Tournament = {
    id,
    name: input.name.trim() || 'Untitled Tournament',
    game: input.game?.trim() || undefined,
    organizer: input.organizer?.trim() || undefined,
    description: input.description?.trim() || undefined,
    date: input.date || undefined,
    status: 'setup',
    settings: input.settings,
    participants,
    matches: [],
    log: [],
    playoffStarted: false,
    createdAt: Date.now(),
  }
  set((s) => ({ ...s, tournaments: [t, ...s.tournaments] }))
  publish(t)
  return id
}

export function setTournamentDate(id: string, date: string) {
  replace(id, (t) => { t.date = date || undefined })
}

export function deleteTournament(id: string) {
  set((s) => ({ ...s, tournaments: s.tournaments.filter((t) => t.id !== id) }))
  if (backendEnabled() && syncToken) apiDelete(id, syncToken).catch(() => {})
}

export function updateSettings(id: string, patch: Partial<TournamentSettings>) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    t.settings = { ...t.settings, ...patch }
  })
}

export function updatePointsConfig(id: string, patch: Partial<PointsConfig>) {
  replace(id, (t) => { t.settings.pointsConfig = { ...t.settings.pointsConfig, ...patch } })
}

export function setTiebreakOrder(id: string, order: RankCriterion[]) {
  replace(id, (t) => { t.settings.tiebreakOrder = order })
}

export function setParticipantStaff(id: string, pid: string, staff: 'judge' | 'organizer' | null) {
  replace(id, (t) => {
    const p = t.participants.find((x) => x.id === pid)
    if (p) { p.staff = staff ?? undefined; if (staff) p.paid = undefined }
  })
}

export function setParticipantPaid(id: string, pid: string, paid: boolean) {
  replace(id, (t) => {
    const p = t.participants.find((x) => x.id === pid)
    if (p) p.paid = paid
  })
}

export function setParticipantBounty(id: string, pid: string, bounty: boolean) {
  replace(id, (t) => {
    const p = t.participants.find((x) => x.id === pid)
    if (p) p.bounty = bounty
  })
}

// Mark a match as currently being played (or stop).
export function setMatchLive(id: string, matchId: string, live: boolean) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (m && m.state !== 'done') m.live = live
  })
}

export function setParticipantTB(id: string, pid: string, tb: number) {
  replace(id, (t) => {
    const p = t.participants.find((x) => x.id === pid)
    if (p) p.tb = tb
  })
}

export function addParticipant(id: string, name: string) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    const seed = t.participants.length + 1
    t.participants.push({ id: uid('p_'), name: name.trim() || `Player ${seed}`, seed, active: true })
  })
}

// Renaming is safe at any time — matches reference participants by id, not name.
export function renameParticipant(id: string, pid: string, name: string) {
  replace(id, (t) => {
    const p = t.participants.find((x) => x.id === pid)
    if (p) p.name = name.trim() || p.name
  })
}

// Add a participant after the tournament has started (e.g. a late arrival). Returns the new id
// so the caller can immediately slot them into a bye. Does not touch existing matches.
export function addLateParticipant(id: string, name: string): string {
  const pid = uid('p_')
  replace(id, (t) => {
    const seed = t.participants.length + 1
    const nm = name.trim() || `Player ${seed}`
    t.participants.push({ id: pid, name: nm, seed, active: true })
    logTo(t, `Late participant added: ${nm}`)
  })
  return pid
}

// Add a late player to a specific round-robin bracket (or the single pool) mid-tournament,
// generating their matches against everyone already in that bracket.
export function addPlayerToBracket(id: string, groupId: string | null, name: string) {
  replace(id, (t) => {
    if (t.settings.format !== 'round_robin' || t.status === 'setup' || t.playoffStarted) return
    const pid = uid('p_')
    const seed = t.participants.length + 1
    const nm = name.trim() || `Player ${seed}`
    t.participants.push({ id: pid, name: nm, seed, active: true })

    const inGroup = (m: { groupId?: string; bracket: string }) =>
      groupId ? m.groupId === groupId : m.bracket === 'main'
    const memberIds = new Set<string>()
    let round = 0
    for (const m of t.matches) {
      if (!inGroup(m)) continue
      round = Math.max(round, m.round)
      if (m.a.participantId) memberIds.add(m.a.participantId)
      if (m.b.participantId) memberIds.add(m.b.participantId)
    }
    memberIds.delete(pid)
    for (const mid of memberIds) {
      round += 1
      t.matches.push({
        id: uid('m_'), round, order: 0,
        bracket: groupId ? 'group' : 'main', groupId: groupId ?? undefined,
        a: { participantId: pid, score: 0 }, b: { participantId: mid, score: 0 },
        state: 'ready', winnerId: null, loserId: null, isBye: false, label: `Round ${round}`,
      })
    }
    recompute(t)
    logTo(t, `Late player added${groupId ? ' to a bracket' : ''}: ${nm} — ${memberIds.size} new matches`)
  })
}

// Replace a bye with a player: fills the empty slot, turning the bye into a live match
// (both sides now scoreable). Round robin / swiss only.
export function fillBye(id: string, matchId: string, pid: string) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m || !m.isBye) return
    const slot = m.a.participantId ? 'b' : 'a'
    m[slot].participantId = pid
    m[slot].score = 0
    if (m.a.participantId === pid && m.b.participantId === pid) return // guard double-fill
    m.isBye = false
    m.reported = false
    m.winnerId = null
    m.loserId = null
    m.state = 'ready'
    recompute(t)
    logTo(t, `Bye replaced: ${pName(t, m.a.participantId)} vs ${pName(t, m.b.participantId)}`)
  })
}

export function removeParticipant(id: string, pid: string) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    t.participants = t.participants.filter((p) => p.id !== pid)
    t.participants.forEach((p, i) => (p.seed = i + 1))
  })
}

export function reorderParticipant(id: string, pid: string, dir: -1 | 1) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    const arr = [...t.participants].sort((a, b) => a.seed - b.seed)
    const idx = arr.findIndex((p) => p.id === pid)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= arr.length) return
    ;[arr[idx].seed, arr[swap].seed] = [arr[swap].seed, arr[idx].seed]
    t.participants = arr
  })
}

export function shuffleSeeds(id: string) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    const order = t.participants.map((_, i) => i + 1)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    t.participants.forEach((p, i) => (p.seed = order[i]))
  })
}

export function renameTournament(id: string, name: string) {
  replace(id, (t) => { t.name = name })
}

export function startTournament(id: string) {
  replace(id, (t) => {
    if (t.status !== 'setup') return
    if (t.participants.filter((p) => p.active).length < 2) return
    t.matches = buildInitialMatches(t)
    t.status = 'underway'
    t.startedAt = Date.now()
    recompute(t)
    logTo(t, `Tournament started — ${t.participants.filter((p) => p.active).length} participants`)
  })
}

export function reportScore(id: string, matchId: string, scoreA: number, scoreB: number) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m || m.isBye) return
    m.a.score = Math.max(0, Math.floor(scoreA || 0))
    m.b.score = Math.max(0, Math.floor(scoreB || 0))
    m.forfeit = undefined
    m.reported = true
    m.live = false
    recompute(t)
    logTo(t, `${m.label}: ${pName(t, m.a.participantId)} ${m.a.score}–${m.b.score} ${pName(t, m.b.participantId)}`)
    // swiss: open the next round once this one is complete
    while (maybeAdvanceSwiss(t)) { /* generate subsequent rounds as far as possible */ break }
    // NOTE: the playoff/top-cut is started manually by the organizer (Start the Top Cut button)
  })
}

// Record a forfeit: 'a'/'b' = that side lost by forfeit; 'double' = both forfeit (RR/Swiss only).
export function reportForfeit(id: string, matchId: string, who: 'a' | 'b' | 'double') {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m || m.isBye) return
    const tiesOk = t.settings.format === 'round_robin' || t.settings.format === 'swiss'
    if (who === 'double' && !tiesOk) return // no winner to advance in an elimination bracket
    m.forfeit = who
    m.a.score = 0
    m.b.score = 0
    m.reported = true
    m.live = false
    recompute(t)
    const a = pName(t, m.a.participantId), b = pName(t, m.b.participantId)
    logTo(t, who === 'double' ? `Double forfeit: ${a} vs ${b}`
      : `Forfeit: ${who === 'a' ? a : b} forfeited to ${who === 'a' ? b : a}`)
    while (maybeAdvanceSwiss(t)) { break }
  })
}

// Organizer closes the tournament after the champion is decided.
export function endTournament(id: string) {
  replace(id, (t) => {
    if (t.status !== 'complete') return
    t.tournamentEnded = true
    logTo(t, 'Tournament ended')
  })
}

// Organizer ends the round-robin / swiss phase — reveals final standings (Swiss King /
// King of the Hill labels + medals) and, if there's a top cut, unlocks "Start the Top Cut".
export function endStage1(id: string) {
  replace(id, (t) => {
    if (!stage1Complete(t)) return
    t.stage1Ended = true
    logTo(t, `${t.settings.format === 'swiss' ? 'Swiss rounds' : 'Round robin'} ended — final standings locked in`)
  })
}

export function startTopCut(id: string) {
  replace(id, (t) => {
    if (!t.settings.groupStage || t.playoffStarted) return
    if (maybeStartPlayoff(t)) logTo(t, 'Top cut started')
  })
}

// Set both scores of a bye (the player's side + the BYE side). Counts toward Score & Pts Diff.
export function setByeScore(id: string, matchId: string, scoreA: number, scoreB: number) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m || !m.isBye) return
    m.a.score = Math.max(0, Math.floor(scoreA || 0))
    m.b.score = Math.max(0, Math.floor(scoreB || 0))
    m.reported = true
    recompute(t)
    const who = m.a.participantId ? m.a.participantId : m.b.participantId
    logTo(t, `Bye score set: ${pName(t, who)} ${m.a.score}–${m.b.score}`)
  })
}

export function clearByeScore(id: string, matchId: string) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m || !m.isBye) return
    m.a.score = 0
    m.b.score = 0
    m.reported = false
    recompute(t)
    logTo(t, `Bye score cleared: ${pName(t, m.a.participantId ?? m.b.participantId)}`)
  })
}

export function clearScore(id: string, matchId: string) {
  replace(id, (t) => {
    const m = t.matches.find((x) => x.id === matchId)
    if (!m) return
    logTo(t, `Result cleared: ${pName(t, m.a.participantId)} vs ${pName(t, m.b.participantId)}`)
    m.reported = false
    m.forfeit = undefined
    m.a.score = 0
    m.b.score = 0
    // if clearing a swiss/group result, drop rounds/playoff that depended on it
    if (t.settings.format === 'swiss') {
      const r = m.round
      t.matches = t.matches.filter((x) => x.round <= r)
    }
    if (t.playoffStarted && m.stage !== 'playoff') {
      t.matches = t.matches.filter((x) => x.stage !== 'playoff')
      t.playoffStarted = false
    }
    recompute(t)
  })
}

export function resetToSetup(id: string) {
  replace(id, (t) => {
    t.matches = []
    t.status = 'setup'
    t.playoffStarted = false
    t.startedAt = undefined
    t.completedAt = undefined
  })
}

// initialise theme on load
applyMode()
