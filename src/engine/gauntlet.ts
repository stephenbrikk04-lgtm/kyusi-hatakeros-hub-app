import { Match, Participant } from '../types'
import { uid } from './util'

function emptySlot(id: string | null = null) {
  return { participantId: id, score: 0 }
}

// King of the Hill / gauntlet: the two lowest seeds play, the winner climbs to face the next
// higher seed, and so on, until the climber challenges the #1 seed in the final ("the hill").
// e.g. 3 seeds → (2 vs 3), winner vs 1.
export function buildGauntlet(participants: Participant[], bracketTag: 'playoff' | 'main' = 'playoff'): Match[] {
  const s = [...participants].sort((a, b) => a.seed - b.seed) // s[0] = best (rank 1)
  const n = s.length
  if (n < 2) return []

  const matches: Match[] = []
  for (let k = 0; k < n - 1; k++) {
    const last = k === n - 2
    matches.push({
      id: uid('m_'),
      round: k + 1,
      order: 0,
      bracket: bracketTag,
      a: emptySlot(k === 0 ? s[n - 2].id : null), // climber (lower seed first, then prev winner)
      b: emptySlot(s[n - 2 - k].id), // the next-higher seed waiting on the hill
      state: 'pending',
      winnerId: null,
      loserId: null,
      isBye: false,
      label: last ? 'King of the Hill — Final' : `Climb ${k + 1}`,
    })
  }
  // first match's slot b is the lowest seed
  matches[0].b = emptySlot(s[n - 1].id)

  // winner of each match climbs into the next match's slot a
  for (let k = 0; k < matches.length - 1; k++) {
    matches[k].winnerToMatchId = matches[k + 1].id
    matches[k].winnerToSlot = 'a'
  }
  return matches
}
