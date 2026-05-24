import { Match, MatchSlot, Participant } from '../types'
import { nextPow2, seedOrder, uid } from './util'
import { resolveByes } from './singleElim'

function emptySlot(id: string | null = null): MatchSlot {
  return { participantId: id, score: 0 }
}

function mk(round: number, order: number, bracket: Match['bracket'], label: string): Match {
  return {
    id: uid('m_'), round, order, bracket, a: emptySlot(), b: emptySlot(),
    state: 'pending', winnerId: null, loserId: null, isBye: false, label,
  }
}

// Build a double-elimination bracket: winners bracket, losers bracket, grand final
// (+ optional bracket reset). Correct for power-of-two participant counts; smaller
// counts are padded with byes.
export function buildDoubleElim(participants: Participant[], grandFinalReset: boolean): Match[] {
  const players = [...participants].sort((a, b) => a.seed - b.seed)
  const n = players.length
  if (n < 2) return []
  const size = nextPow2(n)
  const k = Math.log2(size) // number of WB rounds
  const order = seedOrder(size)
  const slotP: (string | null)[] = order.map((s) => (s <= n ? players[s - 1].id : null))

  // ---- Winners bracket ----
  const wb: Match[][] = []
  const wr1: Match[] = []
  for (let i = 0; i < size / 2; i++) {
    const m = mk(1, i, 'winners', k === 1 ? 'WB Final' : 'WB Round 1')
    m.a.participantId = slotP[i * 2]
    m.b.participantId = slotP[i * 2 + 1]
    wr1.push(m)
  }
  wb.push(wr1)
  for (let r = 2; r <= k; r++) {
    const count = size / Math.pow(2, r)
    const arr: Match[] = []
    const lbl = r === k ? 'WB Final' : `WB Round ${r}`
    for (let i = 0; i < count; i++) arr.push(mk(r, i, 'winners', lbl))
    wb.push(arr)
  }
  // winner links within WB
  for (let r = 0; r < wb.length - 1; r++) {
    wb[r].forEach((m, i) => {
      m.winnerToMatchId = wb[r + 1][Math.floor(i / 2)].id
      m.winnerToSlot = i % 2 === 0 ? 'a' : 'b'
    })
  }

  // ---- Losers bracket ----
  const lbRounds = k > 1 ? 2 * (k - 1) : 0
  const lb: Match[][] = []
  for (let j = 1; j <= lbRounds; j++) {
    let count: number
    if (j === 1) count = size / 4
    else if (j % 2 === 0) count = size / Math.pow(2, j / 2 + 1)
    else count = lb[j - 2].length / 2
    const arr: Match[] = []
    const lbl = j === lbRounds ? 'LB Final' : `LB Round ${j}`
    for (let i = 0; i < count; i++) arr.push(mk(j, i, 'losers', lbl))
    lb.push(arr)
  }

  // winner links within LB
  for (let j = 0; j < lb.length - 1; j++) {
    const cur = lb[j]
    const isOdd = (j + 1) % 2 === 1
    cur.forEach((m, i) => {
      if (isOdd) {
        // odd -> even : 1:1 into slot a
        m.winnerToMatchId = lb[j + 1][i].id
        m.winnerToSlot = 'a'
      } else {
        // even -> odd : halve
        m.winnerToMatchId = lb[j + 1][Math.floor(i / 2)].id
        m.winnerToSlot = i % 2 === 0 ? 'a' : 'b'
      }
    })
  }

  // loser routing from WB into LB
  if (lbRounds > 0) {
    // WB R1 losers -> LB R1 (both slots)
    wb[0].forEach((m, i) => {
      m.loserToMatchId = lb[0][Math.floor(i / 2)].id
      m.loserToSlot = i % 2 === 0 ? 'a' : 'b'
    })
    // WB round r (r>=2) losers -> LB round 2(r-1), slot b
    for (let r = 2; r <= k; r++) {
      const lbRoundIdx = 2 * (r - 1) - 1 // 0-based
      wb[r - 1].forEach((m, i) => {
        m.loserToMatchId = lb[lbRoundIdx][i].id
        m.loserToSlot = 'b'
      })
    }
  }

  // ---- Grand final ----
  const gf = mk(1, 0, 'grand_final', 'Grand Final')
  // WB champion -> gf.a ; LB champion -> gf.b
  const wbFinal = wb[wb.length - 1][0]
  wbFinal.winnerToMatchId = gf.id
  wbFinal.winnerToSlot = 'a'
  if (lbRounds > 0) {
    const lbFinal = lb[lb.length - 1][0]
    lbFinal.winnerToMatchId = gf.id
    lbFinal.winnerToSlot = 'b'
  } else {
    // size === 2: WB R1 loser is the LB champion by default
    wbFinal.loserToMatchId = gf.id
    wbFinal.loserToSlot = 'b'
  }

  const all = [...wb.flat(), ...lb.flat(), gf]

  if (grandFinalReset) {
    const reset = mk(2, 0, 'grand_final', 'Bracket Reset')
    gf.label = 'Grand Final'
    // reset is wired conditionally at score time (only if LB champ wins GF1)
    gf.resetMatchId = reset.id
    all.push(reset)
  }

  resolveByes(all)
  return all
}
