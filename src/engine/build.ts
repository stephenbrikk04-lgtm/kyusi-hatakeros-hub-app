import { Match, Participant, Tournament } from '../types'
import { buildSingleElim } from './singleElim'
import { buildDoubleElim } from './doubleElim'
import { buildRoundRobin, buildGroupStage } from './roundRobin'
import { pairNextSwissRound } from './swiss'
import { buildGauntlet } from './gauntlet'
import { computeStandings } from './standings'
import { recompute } from './score'
import { nextPow2, seedOrder } from './util'

export function activeParticipants(t: Tournament): Participant[] {
  return t.participants.filter((p) => p.active)
}

// A round robin is split into multiple brackets (A, B, C…) whenever groupCount > 1 — this is
// independent of whether a playoff/top-cut stage follows.
export function isMultiGroup(t: Tournament): boolean {
  return t.settings.format === 'round_robin' && t.settings.groupCount > 1
}

// Create the starting set of matches for a tournament based on its settings.
export function buildInitialMatches(t: Tournament): Match[] {
  const players = activeParticipants(t)
  const s = t.settings
  switch (s.format) {
    case 'single':
      return buildSingleElim(players, 'main', s.thirdPlace)
    case 'double':
      return buildDoubleElim(players, s.grandFinalReset)
    case 'round_robin':
      if (isMultiGroup(t)) {
        return buildGroupStage(players, s.groupCount, s.rrIterations).matches
      }
      return buildRoundRobin(players, s.rrIterations, 'main')
    case 'swiss':
      return pairNextSwissRound(players, [], s)
  }
}

// Stage-1 matches (everything that isn't part of the final top-cut / playoff bracket).
export function stage1Matches(t: Tournament): Match[] {
  return t.matches.filter((m) => m.stage !== 'playoff')
}

// Group ids present in a group-stage tournament.
export function groupIds(t: Tournament): string[] {
  const set = new Set<string>()
  t.matches.forEach((m) => m.groupId && set.add(m.groupId))
  return [...set].sort()
}

export function groupComplete(t: Tournament): boolean {
  const groupMatches = t.matches.filter((m) => m.bracket === 'group')
  return groupMatches.length > 0 && groupMatches.every((m) => m.state === 'done')
}

// After a swiss round finishes, append the next round (if any remain).
export function maybeAdvanceSwiss(t: Tournament): boolean {
  if (t.settings.format !== 'swiss' || t.playoffStarted) return false
  const next = pairNextSwissRound(activeParticipants(t), stage1Matches(t), t.settings)
  if (next.length === 0) return false
  t.matches.push(...next)
  return true
}

// Has the first stage finished and the bracket can be seeded?
export function stage1Complete(t: Tournament): boolean {
  const s1 = stage1Matches(t)
  if (s1.length === 0 || !s1.every((m) => m.state === 'done')) return false
  // swiss: also make sure no further rounds remain to be paired
  if (t.settings.format === 'swiss') {
    return pairNextSwissRound(activeParticipants(t), s1, t.settings).length === 0
  }
  return true
}

type SeedTag = { p: Participant; g: number; r: number }

// Count same-group collisions inside every block of `B` consecutive slots. Two players in
// the same block of size B can meet no later than the round whose matches are fed by B slots.
function blockConflicts(slots: (SeedTag | null)[], size: number, B: number): number {
  let c = 0
  for (let b = 0; b * B < size; b++) {
    const counts = new Map<number, number>()
    for (let x = b * B; x < (b + 1) * B; x++) {
      const it = slots[x]
      if (it) counts.set(it.g, (counts.get(it.g) ?? 0) + 1)
    }
    for (const v of counts.values()) if (v > 1) c += v - 1
  }
  return c
}

// Greedily swap equal-tier qualifiers (same finishing rank → seed-neutral) across blocks to
// reduce same-group collisions within blocks of size B. Monotonically non-increasing.
function separateBlocks(slots: (SeedTag | null)[], size: number, B: number) {
  if (B < 2) return
  for (let guard = 0; guard < size * size; guard++) {
    const before = blockConflicts(slots, size, B)
    if (before === 0) return
    let improved = false
    for (let x = 0; x < size && !improved; x++) {
      const a = slots[x]
      if (!a) continue
      for (let j = 0; j < size; j++) {
        const b = slots[j]
        if (!b || j === x || b.r !== a.r) continue
        if (Math.floor(j / B) === Math.floor(x / B)) continue // same block — no help
        slots[x] = b; slots[j] = a
        if (blockConflicts(slots, size, B) < before) { improved = true; break }
        slots[x] = a; slots[j] = b // revert
      }
    }
    if (!improved) return
  }
}

// Cross-group bracket seeding: place qualifiers so group-mates land in different quarters of
// the bracket — they can't meet until the semifinals (separated through the quarterfinals),
// which also keeps round one cross-paired (A1 vs B2, never A1 vs A2). `ranked[g]` is group g's
// qualifiers in finishing order. Returns participants with seeds set so the elim builder
// reproduces this exact layout (works for single- and double-elim playoffs alike).
export function crossGroupSeeding(ranked: Participant[][]): Participant[] {
  const tagged: SeedTag[] = []
  const maxDepth = Math.max(...ranked.map((x) => x.length), 0)
  // quality order: all group winners first, then all runners-up, etc.
  for (let r = 0; r < maxDepth; r++)
    for (let g = 0; g < ranked.length; g++)
      if (ranked[g][r]) tagged.push({ p: ranked[g][r], g, r })

  const n = tagged.length
  if (n < 2) return tagged.map((t, i) => ({ ...t.p, seed: i + 1 }))

  const size = nextPow2(n)
  const order = seedOrder(size) // order[slot] = quality seed (1-based) sitting in that slot
  const slots: (SeedTag | null)[] = order.map((seedNum) => (seedNum <= n ? tagged[seedNum - 1] : null))

  // Quarter block = size / 4: keeping group-mates in different quarters means their first
  // possible meeting is the semifinal. Then a round-one pass as a safety net for the rare
  // case where full quarter separation is infeasible (a group with > 4 qualifiers).
  separateBlocks(slots, size, Math.max(2, Math.floor(size / 4)))
  separateBlocks(slots, size, 2)

  const out: Participant[] = []
  slots.forEach((s, slot) => { if (s) out.push({ ...s.p, seed: order[slot] }) })
  return out
}

// Seeded list of participants advancing to the final stage. Multi-group round robin uses
// cross-group seeding; a single pool (swiss or one-group RR) takes the top N overall.
function collectAdvancers(t: Tournament): Participant[] {
  const find = (id: string) => t.participants.find((p) => p.id === id)!
  if (isMultiGroup(t)) {
    const ranked: Participant[][] = groupIds(t).map((gid) => {
      const gMatches = t.matches.filter((m) => m.groupId === gid)
      const players = activeParticipants(t).filter((p) =>
        gMatches.some((m) => m.a.participantId === p.id || m.b.participantId === p.id),
      )
      return computeStandings(players, gMatches, t.settings, t.settings.advancePerGroup)
        .filter((r) => r.advancing)
        .map((r) => find(r.participantId))
    })
    return crossGroupSeeding(ranked)
  }
  // single pool: top `advancePerGroup` of the overall standings
  const standings = computeStandings(activeParticipants(t), stage1Matches(t), t.settings, t.settings.advancePerGroup)
  return standings.filter((r) => r.advancing).map((r, i) => ({ ...find(r.participantId), seed: i + 1 }))
}

// Advancers seeded purely by rank/quality (no bracket-separation reshuffle) — for the
// King of the Hill gauntlet, where seed 1 waits at the top. Multi-group: bracket winners
// (ranked among themselves) first, then runners-up, etc.
function collectAdvancersRanked(t: Tournament): Participant[] {
  const find = (id: string) => t.participants.find((p) => p.id === id)!
  if (isMultiGroup(t)) {
    const ranked = groupIds(t).map((gid) => {
      const gMatches = t.matches.filter((m) => m.groupId === gid)
      const players = activeParticipants(t).filter((p) =>
        gMatches.some((m) => m.a.participantId === p.id || m.b.participantId === p.id),
      )
      return computeStandings(players, gMatches, t.settings, t.settings.advancePerGroup).filter((r) => r.advancing)
    })
    const maxDepth = Math.max(...ranked.map((g) => g.length), 0)
    const out: Participant[] = []
    let seed = 1
    // interleave by finishing position, but within a position order by points (best first)
    for (let pos = 0; pos < maxDepth; pos++) {
      const tier = ranked.map((g) => g[pos]).filter(Boolean).sort((a, b) => b.points - a.points)
      for (const r of tier) out.push({ ...find(r.participantId), seed: seed++ })
    }
    return out
  }
  const standings = computeStandings(activeParticipants(t), stage1Matches(t), t.settings, t.settings.advancePerGroup)
  return standings.filter((r) => r.advancing).map((r, i) => ({ ...find(r.participantId), seed: i + 1 }))
}

// When the first stage is finished, build the final-stage bracket (single / double elim or
// King of the Hill gauntlet, per settings.playoffFormat) from the advancing participants.
export function maybeStartPlayoff(t: Tournament): boolean {
  if (!t.settings.groupStage || t.playoffStarted) return false
  if (!stage1Complete(t)) return false

  const fmt = t.settings.playoffFormat
  const advancers = fmt === 'king' ? collectAdvancersRanked(t) : collectAdvancers(t)
  if (advancers.length < 2) return false

  const playoff =
    fmt === 'double' ? buildDoubleElim(advancers, t.settings.grandFinalReset)
    : fmt === 'king' ? buildGauntlet(advancers, 'playoff')
    : buildSingleElim(advancers, 'playoff', true) // top cut always includes a 3rd-place match
  playoff.forEach((m) => (m.stage = 'playoff'))

  t.matches.push(...playoff)
  t.playoffStarted = true
  recompute(t)
  return true
}

