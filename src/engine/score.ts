import { Format, Match, Tournament } from '../types'

const ELIM_BRACKETS = new Set(['winners', 'losers', 'grand_final', 'main', 'playoff'])

export function tiesAllowed(format: Format): boolean {
  return format === 'round_robin' || format === 'swiss'
}

const PRIORITY: Record<string, number> = {
  winners: 0, main: 0, group: 0, playoff: 3, losers: 1, grand_final: 2,
}

function key(id: string, slot: 'a' | 'b') {
  return id + ':' + slot
}

// Deterministically recompute the whole tournament from the set of reported results.
// Safe to call after every edit — re-derives propagation, byes, states and winners.
export function recompute(t: Tournament): void {
  const matches = t.matches
  const byId = new Map(matches.map((m) => [m.id, m]))
  const allowTie = tiesAllowed(t.settings.format)

  // which slots are fed by another match's winner/loser link
  const fed = new Set<string>()
  for (const m of matches) {
    if (m.winnerToMatchId && m.winnerToSlot) fed.add(key(m.winnerToMatchId, m.winnerToSlot))
    if (m.loserToMatchId && m.loserToSlot) fed.add(key(m.loserToMatchId, m.loserToSlot))
  }

  // snapshot + clear fed slots (they'll be re-filled by propagation)
  const prev = new Map<string, string | null>()
  for (const m of matches) {
    if (fed.has(key(m.id, 'a'))) { prev.set(key(m.id, 'a'), m.a.participantId); m.a.participantId = null }
    if (fed.has(key(m.id, 'b'))) { prev.set(key(m.id, 'b'), m.b.participantId); m.b.participantId = null }
  }

  const ordered = [...matches].sort(
    (x, y) => (PRIORITY[x.bracket] - PRIORITY[y.bracket]) || x.round - y.round || x.order - y.order,
  )

  for (const m of ordered) {
    decide(m, byId, fed, allowTie, t)
  }

  // if an upstream change altered who plays a downstream match, drop its stale result
  for (const m of matches) {
    for (const slot of ['a', 'b'] as const) {
      const k = key(m.id, slot)
      if (fed.has(k) && prev.get(k) !== m[slot].participantId) {
        if (m.reported) { m.reported = false; m.a.score = 0; m.b.score = 0 }
        m.winnerId = null; m.loserId = null
      }
    }
  }

  // recompute completion / status
  t.status = isComplete(t) ? 'complete' : t.matches.some((m) => m.state === 'done') ? 'underway' : t.status
  if (t.status === 'complete' && !t.completedAt) t.completedAt = Date.now()
  if (t.status !== 'complete') t.completedAt = undefined
}

function decide(m: Match, byId: Map<string, Match>, fed: Set<string>, allowTie: boolean, t: Tournament) {
  const aId = m.a.participantId
  const bId = m.b.participantId
  const aFed = fed.has(key(m.id, 'a'))
  const bFed = fed.has(key(m.id, 'b'))

  const reset = (st: Match['state']) => {
    m.state = st; m.winnerId = null; m.loserId = null; m.isBye = false
  }

  if (!aId && !bId) { reset('pending'); return }

  // exactly one present
  if (!aId || !bId) {
    const otherFed = aId ? bFed : aFed
    if (otherFed) { reset('pending'); return } // still waiting for upstream
    // structural bye
    m.isBye = true; m.state = 'done'; m.winnerId = (aId || bId)!; m.loserId = null
    propagate(m, byId)
    return
  }

  // both present
  m.isBye = false
  if (m.reported) {
    if (m.forfeit === 'double') {
      // both forfeit: no winner advances (only valid where ties are allowed / non-elim)
      m.state = 'done'; m.winnerId = null; m.loserId = null
    } else if (m.forfeit === 'a' || m.forfeit === 'b') {
      m.state = 'done'
      m.winnerId = m.forfeit === 'a' ? bId : aId
      m.loserId = m.forfeit === 'a' ? aId : bId
      propagate(m, byId)
      handleGrandFinal(m, byId)
    } else if (m.a.score === m.b.score) {
      if (allowTie) { m.state = 'done'; m.winnerId = null; m.loserId = null }
      else { m.state = 'ready'; m.winnerId = null; m.loserId = null } // elim needs a winner
    } else {
      m.state = 'done'
      m.winnerId = m.a.score > m.b.score ? aId : bId
      m.loserId = m.winnerId === aId ? bId : aId
      propagate(m, byId)
      handleGrandFinal(m, byId)
    }
  } else {
    reset('ready')
  }
}

function propagate(m: Match, byId: Map<string, Match>) {
  if (m.winnerToMatchId && m.winnerId) {
    const t = byId.get(m.winnerToMatchId)
    if (t) t[m.winnerToSlot!].participantId = m.winnerId
  }
  if (m.loserToMatchId && m.loserId) {
    const t = byId.get(m.loserToMatchId)
    if (t) t[m.loserToSlot!].participantId = m.loserId
  }
}

// Double-elim: if the losers-bracket champion wins GF1, fire the bracket reset.
function handleGrandFinal(m: Match, byId: Map<string, Match>) {
  if (m.bracket !== 'grand_final' || !m.resetMatchId) return
  const reset = byId.get(m.resetMatchId)
  if (!reset) return
  const lbChamp = m.b.participantId // LB champion always feeds slot b
  if (m.winnerId === lbChamp) {
    reset.a.participantId = m.a.participantId
    reset.b.participantId = m.b.participantId
    if (reset.state === 'pending') reset.state = 'ready'
  } else {
    reset.a.participantId = null
    reset.b.participantId = null
    reset.state = 'pending'
    reset.reported = false
    reset.winnerId = null
    reset.loserId = null
  }
}

// Is an elimination bracket (the given matches) finished? `double` switches between
// "the single-elim final is done" and "the grand final / bracket reset is done".
function elimComplete(ms: Match[], double: boolean): boolean {
  if (ms.length === 0) return false
  if (double) {
    const gfs = ms.filter((m) => m.bracket === 'grand_final')
    const reset = gfs.find((m) => m.label === 'Bracket Reset')
    if (reset && reset.a.participantId && reset.b.participantId) return reset.state === 'done'
    const gf1 = gfs.find((m) => m.label === 'Grand Final')
    return !!gf1 && gf1.state === 'done'
  }
  return finalDone(ms)
}

function elimChampion(ms: Match[], double: boolean): string | null {
  if (double) {
    const reset = ms.find((m) => m.bracket === 'grand_final' && m.label === 'Bracket Reset')
    if (reset && reset.state === 'done') return reset.winnerId
    const gf1 = ms.find((m) => m.bracket === 'grand_final' && m.label === 'Grand Final')
    return gf1?.winnerId ?? null
  }
  return lastWinner(ms)
}

export function isComplete(t: Tournament): boolean {
  const ms = t.matches
  if (ms.length === 0) return false
  const playoffDouble = t.settings.playoffFormat === 'double'
  switch (t.settings.format) {
    case 'round_robin':
    case 'swiss': {
      if (t.settings.groupStage && !t.playoffStarted) return false
      if (t.playoffStarted) return elimComplete(ms.filter((m) => m.stage === 'playoff'), playoffDouble)
      return ms.every((m) => m.state === 'done')
    }
    case 'single':
      return elimComplete(ms.filter((m) => m.bracket === 'main'), false)
    case 'double':
      return elimComplete(ms, true)
  }
}

function finalDone(ms: Match[]): boolean {
  if (ms.length === 0) return false
  const maxRound = Math.max(...ms.map((m) => m.round))
  const finals = ms.filter((m) => m.round === maxRound)
  return finals.length > 0 && finals.every((m) => m.state === 'done')
}

export function champion(t: Tournament): string | null {
  if (!isComplete(t)) return null
  const ms = t.matches
  const playoffDouble = t.settings.playoffFormat === 'double'
  switch (t.settings.format) {
    case 'single':
      return lastWinner(ms.filter((m) => m.bracket === 'main'))
    case 'double':
      return elimChampion(ms, true)
    case 'round_robin':
    case 'swiss':
      if (t.playoffStarted) return elimChampion(ms.filter((m) => m.stage === 'playoff'), playoffDouble)
      return null // standings-based; ranked #1 shown elsewhere
  }
}

function lastWinner(ms: Match[]): string | null {
  if (ms.length === 0) return null
  const maxRound = Math.max(...ms.map((m) => m.round))
  // the championship is the non-consolation match in the last round
  const finals = ms.filter((m) => m.round === maxRound && m.state === 'done' && !m.consolation)
  return finals[0]?.winnerId ?? null
}

// The championship match of a single-elim set (max round, not the 3rd-place match).
function finalMatch(ms: Match[]): Match | null {
  if (ms.length === 0) return null
  const maxRound = Math.max(...ms.map((m) => m.round))
  return ms.find((m) => m.round === maxRound && !m.consolation) ?? null
}

export interface Podium {
  gold: string | null // champion
  silver: string | null // runner-up / finalist
  bronze: string | null // 3rd place
}

// Top-3 finishers for the medal display. Elimination → from the final (+ bronze match);
// round robin / swiss without a playoff → top-3 of the standings (handled by caller).
export function elimPodium(t: Tournament): Podium {
  const ms = t.matches
  const playoffDouble = t.settings.playoffFormat === 'double'
  let set: Match[]
  let double: boolean
  if (t.settings.format === 'double') { set = ms; double = true }
  else if (t.playoffStarted) { set = ms.filter((m) => m.stage === 'playoff'); double = playoffDouble }
  else { set = ms.filter((m) => m.bracket === 'main'); double = false }

  if (double) {
    const gold = elimChampion(set, true)
    const gf = set.find((m) => m.bracket === 'grand_final' && (m.label === 'Bracket Reset' ? m.state === 'done' : true) && m.state === 'done')
    const silver = gf ? (gf.winnerId === gf.a.participantId ? gf.b.participantId : gf.a.participantId) : null
    // 3rd = loser of the losers-bracket final
    const lbFinal = set.filter((m) => m.bracket === 'losers').sort((a, b) => b.round - a.round)[0]
    const bronze = lbFinal && lbFinal.state === 'done'
      ? (lbFinal.winnerId === lbFinal.a.participantId ? lbFinal.b.participantId : lbFinal.a.participantId)
      : null
    return { gold, silver, bronze }
  }

  const final = finalMatch(set)
  const gold = final && final.state === 'done' ? final.winnerId : null
  const silver = final && final.state === 'done'
    ? (final.winnerId === final.a.participantId ? final.b.participantId : final.a.participantId)
    : null

  let bronze: string | null = null
  if (t.settings.playoffFormat === 'king' && t.playoffStarted && set.length >= 2) {
    // King of the Hill: 3rd = whoever lost the match feeding the final (penultimate climb)
    const maxRound = Math.max(...set.map((m) => m.round))
    const penult = set.find((m) => m.round === maxRound - 1)
    bronze = penult && penult.state === 'done'
      ? (penult.winnerId === penult.a.participantId ? penult.b.participantId : penult.a.participantId)
      : null
  } else {
    const bronzeMatch = set.find((m) => m.consolation)
    bronze = bronzeMatch && bronzeMatch.state === 'done' ? bronzeMatch.winnerId : null
  }
  return { gold, silver, bronze }
}
