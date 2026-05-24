import { Match, Participant, TournamentSettings } from '../types'
import { computeStandings } from './standings'
import { shuffle, uid } from './util'

export function swissRoundsNeeded(n: number, configured: number): number {
  if (configured && configured > 0) return configured
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))))
}

function emptySlot(id: string | null = null) {
  return { participantId: id, score: 0 }
}

function priorOpponents(matches: Match[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set())
    map.get(a)!.add(b)
  }
  for (const m of matches) {
    if (m.isBye) continue
    if (m.a.participantId && m.b.participantId) {
      add(m.a.participantId, m.b.participantId)
      add(m.b.participantId, m.a.participantId)
    }
  }
  return map
}

function hadBye(matches: Match[]): Set<string> {
  const s = new Set<string>()
  for (const m of matches) if (m.isBye && m.winnerId) s.add(m.winnerId)
  return s
}

// Pair the next swiss round. Returns [] if the tournament has reached its round cap
// or the current round isn't fully decided yet.
export function pairNextSwissRound(
  participants: Participant[],
  matches: Match[],
  settings: TournamentSettings,
): Match[] {
  const active = participants.filter((p) => p.active)
  const maxRounds = swissRoundsNeeded(active.length, settings.swissRounds)
  const playedRounds = matches.reduce((mx, m) => Math.max(mx, m.round), 0)

  // current round must be fully done before pairing the next
  if (playedRounds > 0) {
    const cur = matches.filter((m) => m.round === playedRounds)
    if (cur.some((m) => m.state !== 'done')) return []
    if (playedRounds >= maxRounds) return []
  }

  const nextRound = playedRounds + 1

  // Pairing order: round 1 is fully random. Later rounds group players by their win-loss
  // record (score group) and shuffle *within* each group — so matchups are random but only
  // ever against players on the same record (odd groups float one player down to the next).
  let ordered: string[]
  if (playedRounds === 0) {
    ordered = shuffle(active).map((p) => p.id)
  } else {
    const standings = computeStandings(active, matches, settings)
    const byRecord = new Map<string, string[]>()
    const keyOrder: string[] = []
    for (const s of standings) {
      const key = `${s.wins}-${s.losses}-${s.ties}` // the win-loss(-tie) tier
      if (!byRecord.has(key)) { byRecord.set(key, []); keyOrder.push(key) }
      byRecord.get(key)!.push(s.participantId)
    }
    // standings already rank tiers best→worst; shuffle the members inside each tier
    ordered = keyOrder.flatMap((k) => shuffle(byRecord.get(k)!))
  }

  const opps = priorOpponents(matches)
  const byes = hadBye(matches)
  const pool = [...ordered]
  const result: Match[] = []
  let order = 0

  // assign a bye to the lowest player without a previous bye if odd
  if (pool.length % 2 === 1) {
    let byeIdx = pool.length - 1
    while (byeIdx >= 0 && byes.has(pool[byeIdx])) byeIdx--
    if (byeIdx < 0) byeIdx = pool.length - 1
    const byeId = pool.splice(byeIdx, 1)[0]
    result.push({
      id: uid('m_'), round: nextRound, order: order++, bracket: 'main',
      a: { participantId: byeId, score: 4 }, b: { participantId: null, score: 3 }, // bye defaults to 4-3
      state: 'done', winnerId: byeId, loserId: null, isBye: true, reported: true, label: `Round ${nextRound}`,
    })
  }

  // greedy pairing avoiding rematches
  const used = new Set<string>()
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]
    if (used.has(a)) continue
    used.add(a)
    let partner: string | null = null
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j]
      if (used.has(b)) continue
      if (!(opps.get(a)?.has(b))) { partner = b; break }
    }
    // fallback: allow a rematch if no fresh partner exists
    if (!partner) {
      for (let j = i + 1; j < pool.length; j++) {
        if (!used.has(pool[j])) { partner = pool[j]; break }
      }
    }
    if (partner) {
      used.add(partner)
      result.push({
        id: uid('m_'), round: nextRound, order: order++, bracket: 'main',
        a: emptySlot(a), b: emptySlot(partner),
        state: 'ready', winnerId: null, loserId: null, isBye: false, label: `Round ${nextRound}`,
      })
    }
  }
  return result
}
