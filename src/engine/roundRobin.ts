import { Match, Participant } from '../types'
import { uid } from './util'

function emptySlot(id: string | null = null) {
  return { participantId: id, score: 0 }
}

// Circle-method round robin schedule for a list of participant ids.
// Returns rounds, each an array of [aId, bId] pairs (null = bye).
function rrSchedule(ids: (string | null)[]): [string | null, string | null][][] {
  const arr = [...ids]
  if (arr.length % 2 === 1) arr.push(null) // bye marker
  const n = arr.length
  const rounds: [string | null, string | null][][] = []
  const fixed = arr[0]
  let rest = arr.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const row = [fixed, ...rest]
    const pairs: [string | null, string | null][] = []
    for (let i = 0; i < n / 2; i++) {
      pairs.push([row[i], row[n - 1 - i]])
    }
    rounds.push(pairs)
    // rotate (keep first fixed)
    rest = [rest[rest.length - 1], ...rest.slice(0, rest.length - 1)]
  }
  return rounds
}

export function buildRoundRobin(
  participants: Participant[],
  iterations = 1,
  bracketTag: 'main' | 'group' = 'main',
  groupId?: string,
): Match[] {
  const ids = [...participants].sort((a, b) => a.seed - b.seed).map((p) => p.id)
  if (ids.length < 2) return []
  const matches: Match[] = []
  let roundOffset = 0
  for (let iter = 0; iter < Math.max(1, iterations); iter++) {
    const schedule = rrSchedule(ids)
    schedule.forEach((pairs, ri) => {
      pairs.forEach((pair, oi) => {
        let [aId, bId] = pair
        // alternate home/away on even iterations for fairness
        if (iter % 2 === 1) [aId, bId] = [bId, aId]
        const isBye = aId === null || bId === null
        // a bye defaults to 4-3 in the player's favour (player 4, bye 3)
        const aScore = isBye ? (aId ? 4 : 3) : 0
        const bScore = isBye ? (bId ? 4 : 3) : 0
        matches.push({
          id: uid('m_'),
          round: roundOffset + ri + 1,
          order: oi,
          bracket: bracketTag,
          groupId,
          a: { participantId: aId, score: aScore },
          b: { participantId: bId, score: bScore },
          state: isBye ? 'done' : 'ready',
          winnerId: isBye ? aId ?? bId : null,
          loserId: null,
          isBye,
          reported: isBye ? true : undefined,
          label: `Round ${roundOffset + ri + 1}`,
        })
      })
    })
    roundOffset += schedule.length
  }
  return matches
}

// Split participants into `groupCount` groups, snake-seeded for balance.
export function splitGroups(participants: Participant[], groupCount: number): Participant[][] {
  const sorted = [...participants].sort((a, b) => a.seed - b.seed)
  const groups: Participant[][] = Array.from({ length: groupCount }, () => [])
  let dir = 1
  let g = 0
  for (const p of sorted) {
    groups[g].push(p)
    if (dir === 1) {
      if (g === groupCount - 1) dir = -1
      else g++
    } else {
      if (g === 0) dir = 1
      else g--
    }
  }
  return groups
}

export function buildGroupStage(
  participants: Participant[],
  groupCount: number,
  iterations: number,
): { matches: Match[]; groupIds: string[] } {
  const groups = splitGroups(participants, groupCount)
  const matches: Match[] = []
  const groupIds: string[] = []
  groups.forEach((g, i) => {
    const gid = `group_${i + 1}`
    groupIds.push(gid)
    matches.push(...buildRoundRobin(g, iterations, 'group', gid))
  })
  return { matches, groupIds }
}
