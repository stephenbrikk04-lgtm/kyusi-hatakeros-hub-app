import { Match, Participant, PointsConfig, RankCriterion, StandingRow, TournamentSettings } from '../types'

interface Agg {
  participantId: string
  played: number
  wins: number
  ties: number
  losses: number
  gamesWon: number
  gamesLost: number
  points: number
  opponents: string[]
}

function blank(id: string): Agg {
  return { participantId: id, played: 0, wins: 0, ties: 0, losses: 0, gamesWon: 0, gamesLost: 0, points: 0, opponents: [] }
}

// Decide a match outcome from scores or forfeit (ties allowed in round robin / swiss).
export function outcome(m: Match): { winnerId: string | null; tie: boolean } {
  if (m.isBye) return { winnerId: m.winnerId, tie: false }
  if (m.state !== 'done') return { winnerId: null, tie: false }
  if (m.forfeit === 'double') return { winnerId: null, tie: false } // both lose (not a tie)
  if (m.forfeit === 'a') return { winnerId: m.b.participantId, tie: false }
  if (m.forfeit === 'b') return { winnerId: m.a.participantId, tie: false }
  if (!m.a.participantId || !m.b.participantId) return { winnerId: m.winnerId, tie: false }
  if (m.a.score === m.b.score) return { winnerId: null, tie: true }
  return { winnerId: m.a.score > m.b.score ? m.a.participantId : m.b.participantId, tie: false }
}

function applyMatch(agg: Map<string, Agg>, m: Match, pc: PointsConfig) {
  if (m.state !== 'done') return
  if (m.isBye) {
    const w = m.winnerId
    if (w && agg.has(w)) {
      const r = agg.get(w)!
      const forScore = m.a.participantId === w ? m.a.score : m.b.score // default 4
      const againstScore = m.a.participantId === w ? m.b.score : m.a.score // default 3
      r.played += 1
      r.wins += 1
      r.gamesWon += forScore // bye score (default 4) counts toward Score / Pts Diff
      r.gamesLost += againstScore // bye opponent score (default 3)
      r.points += pc.matchWin + pc.gameWin * forScore // a bye counts as a win
    }
    return
  }
  const aId = m.a.participantId
  const bId = m.b.participantId
  if (!aId || !bId) return

  // forfeits: no game scores count; the no-show takes a loss
  if (m.forfeit === 'double') {
    for (const id of [aId, bId]) {
      const r = agg.get(id)
      if (r) { r.played += 1; r.losses += 1; r.points += pc.matchLoss; r.opponents.push(id === aId ? bId : aId) }
    }
    return
  }
  if (m.forfeit === 'a' || m.forfeit === 'b') {
    const winId = m.forfeit === 'a' ? bId : aId
    const loseId = m.forfeit === 'a' ? aId : bId
    const wr = agg.get(winId), lr = agg.get(loseId)
    if (wr) { wr.played += 1; wr.wins += 1; wr.points += pc.matchWin; wr.opponents.push(loseId) }
    if (lr) { lr.played += 1; lr.losses += 1; lr.points += pc.matchLoss; lr.opponents.push(winId) }
    return
  }

  const { winnerId, tie } = outcome(m)
  const ra = agg.get(aId)
  const rb = agg.get(bId)
  if (ra) {
    ra.played += 1
    ra.gamesWon += m.a.score
    ra.gamesLost += m.b.score
    ra.points += pc.gameWin * m.a.score
    ra.opponents.push(bId)
  }
  if (rb) {
    rb.played += 1
    rb.gamesWon += m.b.score
    rb.gamesLost += m.a.score
    rb.points += pc.gameWin * m.b.score
    rb.opponents.push(aId)
  }
  if (tie) {
    ra && ((ra.ties += 1), (ra.points += pc.matchTie))
    rb && ((rb.ties += 1), (rb.points += pc.matchTie))
  } else {
    const wr = winnerId === aId ? ra : rb
    const lr = winnerId === aId ? rb : ra
    wr && ((wr.wins += 1), (wr.points += pc.matchWin))
    lr && ((lr.losses += 1), (lr.points += pc.matchLoss))
  }
}

// Head-to-head points among a tied subset only.
function h2hPoints(ids: Set<string>, matches: Match[], pc: PointsConfig): Map<string, number> {
  const sub = new Map<string, number>()
  ids.forEach((id) => sub.set(id, 0))
  for (const m of matches) {
    if (m.state !== 'done' || m.isBye) continue
    const a = m.a.participantId
    const b = m.b.participantId
    if (!a || !b || !ids.has(a) || !ids.has(b)) continue
    const { winnerId, tie } = outcome(m)
    if (tie) {
      sub.set(a, sub.get(a)! + pc.matchTie)
      sub.set(b, sub.get(b)! + pc.matchTie)
    } else if (winnerId) {
      sub.set(winnerId, sub.get(winnerId)! + pc.matchWin)
    }
  }
  return sub
}

// Compute ranked standings for the given matches (e.g. one group or the full RR / Swiss field).
export function computeStandings(
  participants: Participant[],
  matches: Match[],
  settings: TournamentSettings,
  advanceCount = 0,
): StandingRow[] {
  const pc = settings.pointsConfig
  const agg = new Map<string, Agg>()
  participants.forEach((p) => agg.set(p.id, blank(p.id)))
  matches.forEach((m) => applyMatch(agg, m, pc))

  const tbOf = new Map(participants.map((p) => [p.id, p.tb ?? 0]))
  // Median-Buchholz = opponent strength: sum of each opponent's total points, dropping the
  // single highest and single lowest opponent (when there are more than two opponents).
  const buchholz = new Map<string, number>()
  for (const r of agg.values()) {
    const scores = r.opponents.map((o) => agg.get(o)?.points ?? 0).sort((a, b) => a - b)
    const trimmed = scores.length > 2 ? scores.slice(1, -1) : scores
    buchholz.set(r.participantId, trimmed.reduce((s, v) => s + v, 0))
  }

  const order = settings.tiebreakOrder.length ? settings.tiebreakOrder : (['match_wins'] as RankCriterion[])

  const metric = (a: Agg, c: RankCriterion): number => {
    switch (c) {
      case 'match_wins': return a.wins
      case 'score': return a.gamesWon
      case 'score_diff': return a.gamesWon - a.gamesLost
      case 'points': return a.points
      case 'buchholz': return buchholz.get(a.participantId) ?? 0
      case 'tb': return tbOf.get(a.participantId) ?? 0
      case 'head_to_head': return 0 // handled separately
    }
  }

  // Challonge-style hierarchical ranking: at each criterion, group players by that value, then
  // break ties *within* a group using the next criterion. Head-to-head is evaluated as a
  // mini-league among the tied group only (each player's record vs the others still tied) —
  // never pairwise — so a 3-way cycle correctly falls through to the next criterion.
  const valueAt = (id: string, c: RankCriterion, group: string[]): number =>
    c === 'head_to_head'
      ? h2hPoints(new Set(group), matches, pc).get(id) ?? 0
      : metric(agg.get(id)!, c)

  const rankGroup = (ids: string[], ci: number): string[] => {
    if (ids.length <= 1 || ci >= order.length) return ids
    const c = order[ci]
    const buckets = new Map<number, string[]>()
    const keyOrder: number[] = []
    for (const id of ids) {
      const key = Math.round(valueAt(id, c, ids) * 100) / 100
      if (!buckets.has(key)) { buckets.set(key, []); keyOrder.push(key) }
      buckets.get(key)!.push(id)
    }
    keyOrder.sort((a, b) => b - a) // higher value ranks better
    return keyOrder.flatMap((k) => rankGroup(buckets.get(k)!, ci + 1))
  }

  const orderedIds = rankGroup([...agg.keys()], 0)
  const rows = orderedIds.map((id) => agg.get(id)!)

  const round2 = (n: number) => Math.round(n * 100) / 100
  return rows.map((r, i) => ({
    participantId: r.participantId,
    rank: i + 1,
    played: r.played,
    wins: r.wins,
    ties: r.ties,
    losses: r.losses,
    points: round2(r.points),
    gamesWon: r.gamesWon,
    gamesLost: r.gamesLost,
    scoreDiff: r.gamesWon - r.gamesLost,
    buchholz: round2(buchholz.get(r.participantId) ?? 0),
    tb: tbOf.get(r.participantId) ?? 0,
    advancing: advanceCount > 0 ? i < advanceCount : undefined,
  }))
}

// A bounty is "claimed" once the bounty-holder loses a match 6-0 or 5-0 (they scored 0).
export function isBountyClaimed(pid: string, matches: Match[]): boolean {
  for (const m of matches) {
    if (m.state !== 'done' || m.isBye || m.forfeit) continue
    const isA = m.a.participantId === pid
    const isB = m.b.participantId === pid
    if (!isA && !isB) continue
    const mine = isA ? m.a.score : m.b.score
    const theirs = isA ? m.b.score : m.a.score
    if (mine === 0 && (theirs === 5 || theirs === 6)) return true
  }
  return false
}

// Set of participant ids whose bounty has been claimed (for badge display).
export function claimedBounties(participants: Participant[], matches: Match[]): Set<string> {
  const s = new Set<string>()
  for (const p of participants) if (p.bounty && isBountyClaimed(p.id, matches)) s.add(p.id)
  return s
}

export interface HistoryRow {
  matchId: string
  round: number
  opponentId: string | null // null = bye
  result: 'W' | 'L' | 'T' | 'BYE'
  forScore: number
  againstScore: number
}

// A single participant's completed matches, oldest first — for the match-history view.
export function participantHistory(pid: string, matches: Match[]): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (const m of matches) {
    if (m.state !== 'done') continue
    const isA = m.a.participantId === pid
    const isB = m.b.participantId === pid
    if (!isA && !isB) continue
    if (m.isBye) {
      rows.push({ matchId: m.id, round: m.round, opponentId: null, result: 'BYE', forScore: 0, againstScore: 0 })
      continue
    }
    const forScore = isA ? m.a.score : m.b.score
    const againstScore = isA ? m.b.score : m.a.score
    const opponentId = isA ? m.b.participantId : m.a.participantId
    const { winnerId, tie } = outcome(m)
    const result: HistoryRow['result'] = tie ? 'T' : winnerId === pid ? 'W' : 'L'
    rows.push({ matchId: m.id, round: m.round, opponentId, result, forScore, againstScore })
  }
  return rows.sort((a, b) => a.round - b.round)
}
