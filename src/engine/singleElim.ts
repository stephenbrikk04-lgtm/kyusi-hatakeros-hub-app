import { Match, Participant } from '../types'
import { nextPow2, seedOrder, uid } from './util'

function emptySlot() {
  return { participantId: null as string | null, score: 0 }
}

const roundName = (round: number, totalRounds: number): string => {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${round}`
}

// Build a single-elimination bracket. Returns matches with winner links wired up.
export function buildSingleElim(
  participants: Participant[],
  bracketTag: 'main' | 'playoff' = 'main',
  thirdPlace = false,
): Match[] {
  const players = [...participants].sort((a, b) => a.seed - b.seed)
  const n = players.length
  if (n < 2) return []
  const size = nextPow2(n)
  const totalRounds = Math.log2(size)
  const order = seedOrder(size) // seed numbers in slot order

  // map slot -> participant (or null for bye)
  const slotParticipant: (string | null)[] = order.map((seedNum) =>
    seedNum <= n ? players[seedNum - 1].id : null,
  )

  const rounds: Match[][] = []

  // Round 1
  const r1: Match[] = []
  for (let i = 0; i < size / 2; i++) {
    const aId = slotParticipant[i * 2]
    const bId = slotParticipant[i * 2 + 1]
    r1.push({
      id: uid('m_'),
      round: 1,
      order: i,
      bracket: bracketTag,
      a: { ...emptySlot(), participantId: aId },
      b: { ...emptySlot(), participantId: bId },
      state: 'pending',
      winnerId: null,
      loserId: null,
      isBye: false,
      label: roundName(1, totalRounds),
    })
  }
  rounds.push(r1)

  // Later rounds (empty slots, linked from previous)
  for (let r = 2; r <= totalRounds; r++) {
    const count = size / Math.pow(2, r)
    const arr: Match[] = []
    for (let i = 0; i < count; i++) {
      arr.push({
        id: uid('m_'),
        round: r,
        order: i,
        bracket: bracketTag,
        a: emptySlot(),
        b: emptySlot(),
        state: 'pending',
        winnerId: null,
        loserId: null,
        isBye: false,
        label: roundName(r, totalRounds),
      })
    }
    rounds.push(arr)
  }

  // Wire winner links
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, i) => {
      const target = rounds[r + 1][Math.floor(i / 2)]
      m.winnerToMatchId = target.id
      m.winnerToSlot = i % 2 === 0 ? 'a' : 'b'
    })
  }

  const all = rounds.flat()

  // optional 3rd-place (bronze) match: the two semifinal losers play for 3rd
  if (thirdPlace && totalRounds >= 2) {
    const semis = rounds[totalRounds - 2] // round before the final has the 2 semifinals
    if (semis.length === 2) {
      const bronze: Match = {
        id: uid('m_'),
        round: totalRounds, // alongside the final, rendered at the bottom
        order: 1,
        bracket: bracketTag,
        a: emptySlot(),
        b: emptySlot(),
        state: 'pending',
        winnerId: null,
        loserId: null,
        isBye: false,
        label: '3rd Place Match',
        consolation: true,
      }
      semis[0].loserToMatchId = bronze.id
      semis[0].loserToSlot = 'a'
      semis[1].loserToMatchId = bronze.id
      semis[1].loserToSlot = 'b'
      all.push(bronze)
    }
  }

  // Resolve byes & set initial states
  resolveByes(all)
  return all
}

const BRACKET_PRIORITY: Record<string, number> = {
  winners: 0, main: 0, group: 0, playoff: 0, losers: 1, grand_final: 2,
}

// Auto-advance bye matches and set 'ready' state on matches with both players present.
export function resolveByes(matches: Match[]) {
  const byId = new Map(matches.map((m) => [m.id, m]))
  // process winners before losers before grand final, then by round, so cascades resolve
  const ordered = [...matches].sort(
    (x, y) =>
      (BRACKET_PRIORITY[x.bracket] - BRACKET_PRIORITY[y.bracket]) || x.round - y.round || x.order - y.order,
  )
  for (const m of ordered) {
    if (m.state === 'done') continue
    const aHas = !!m.a.participantId
    const bHas = !!m.b.participantId
    if (aHas && bHas) {
      m.state = 'ready'
    } else if ((aHas && !bHas) || (!aHas && bHas)) {
      // is this a real bye? only if no upstream match feeds the empty slot
      const emptyIsFed = isSlotFed(m, aHas ? 'b' : 'a', matches)
      if (!emptyIsFed) {
        const winner = aHas ? m.a.participantId! : m.b.participantId!
        m.isBye = true
        m.state = 'done'
        m.winnerId = winner
        m.loserId = null
        // a bye produces no loser, so detach any losers-bracket drop link
        m.loserToMatchId = undefined
        m.loserToSlot = undefined
        propagate(m, byId)
      } else {
        m.state = 'pending'
      }
    } else {
      m.state = 'pending'
    }
  }
}

function isSlotFed(m: Match, slot: 'a' | 'b', matches: Match[]): boolean {
  return matches.some((x) => x.winnerToMatchId === m.id && x.winnerToSlot === slot && !x.isBye) ||
    matches.some((x) => x.loserToMatchId === m.id && x.loserToSlot === slot)
}

export function propagate(m: Match, byId: Map<string, Match>) {
  if (m.winnerToMatchId && m.winnerId) {
    const t = byId.get(m.winnerToMatchId)
    if (t) {
      t[m.winnerToSlot!].participantId = m.winnerId
    }
  }
  if (m.loserToMatchId && m.loserId) {
    const t = byId.get(m.loserToMatchId)
    if (t) {
      t[m.loserToSlot!].participantId = m.loserId
    }
  }
}
