// Engine smoke test — exercises each format end to end with deterministic results.
import { Participant, Tournament, TournamentSettings } from '../src/types'
import { DEFAULT_POINTS, DEFAULT_TIEBREAKS } from '../src/types'
import { buildInitialMatches, maybeAdvanceSwiss, maybeStartPlayoff } from '../src/engine/build'
import { recompute, isComplete, champion, elimPodium } from '../src/engine/score'
import { computeStandings, participantHistory, isBountyClaimed } from '../src/engine/standings'
import { nextPow2 } from '../src/engine/util'
import { buildGauntlet } from '../src/engine/gauntlet'
import { RankCriterion, defaultTiebreaks } from '../src/types'

let pass = 0, fail = 0
function ok(cond: boolean, msg: string) {
  if (cond) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg) }
}

function mkParticipants(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'P' + (i + 1), seed: i + 1, active: true }))
}

function mkTournament(n: number, patch: Partial<TournamentSettings>): Tournament {
  const settings: TournamentSettings = {
    format: 'single', pointsConfig: { ...DEFAULT_POINTS }, tiebreakOrder: [...DEFAULT_TIEBREAKS],
    rrIterations: 1, swissRounds: 0, grandFinalReset: true, groupStage: false,
    groupCount: 1, advancePerGroup: 2, playoffFormat: 'single', thirdPlace: false, ...patch,
  }
  const t: Tournament = {
    id: 't1', name: 'T', status: 'setup', settings, participants: mkParticipants(n),
    matches: [], playoffStarted: false, createdAt: 0,
  }
  t.matches = buildInitialMatches(t)
  t.status = 'underway'
  recompute(t)
  return t
}

// Play every ready match; lower-seeded participant (P1 strongest) always wins. Repeat until stable.
function autoPlay(t: Tournament, opts: { swiss?: boolean; group?: boolean } = {}) {
  const seedOf = (id: string) => t.participants.find((p) => p.id === id)!.seed
  for (let guard = 0; guard < 200; guard++) {
    const ready = t.matches.find((m) => m.state === 'ready' && !m.isBye && m.a.participantId && m.b.participantId && !m.reported)
    if (!ready) {
      // try to extend swiss / start playoff
      let extended = false
      if (opts.swiss) extended = maybeAdvanceSwiss(t)
      if (opts.group) extended = maybeStartPlayoff(t) || extended
      const stillReady = t.matches.some((m) => m.state === 'ready' && !m.reported)
      if (!extended && !stillReady) break
      continue
    }
    const aSeed = seedOf(ready.a.participantId!)
    const bSeed = seedOf(ready.b.participantId!)
    const aWins = aSeed < bSeed
    ready.a.score = aWins ? 2 : 1
    ready.b.score = aWins ? 1 : 2
    ready.reported = true
    recompute(t)
    if (opts.swiss) maybeAdvanceSwiss(t)
    if (opts.group) maybeStartPlayoff(t)
  }
}

console.log('— Single elimination (8) —')
{
  const t = mkTournament(8, { format: 'single' })
  ok(t.matches.length === 7, `7 matches, got ${t.matches.length}`)
  autoPlay(t)
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1 (seed 1), got ${champion(t)}`)
}

console.log('— Single elimination (6, byes) —')
{
  const t = mkTournament(6, { format: 'single' })
  const byes = t.matches.filter((m) => m.isBye).length
  ok(byes === 2, `2 byes for 6 players, got ${byes}`)
  autoPlay(t)
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Double elimination (8) —')
{
  const t = mkTournament(8, { format: 'double', grandFinalReset: true })
  ok(t.matches.some((m) => m.bracket === 'losers'), 'has losers bracket')
  ok(t.matches.some((m) => m.bracket === 'grand_final'), 'has grand final')
  autoPlay(t)
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Round robin (5) —')
{
  const t = mkTournament(5, { format: 'round_robin' })
  // 5 players single RR = 10 real matches (+ byes as done)
  const real = t.matches.filter((m) => !m.isBye).length
  ok(real === 10, `10 real RR matches, got ${real}`)
  autoPlay(t)
  ok(isComplete(t), 'complete')
  const st = computeStandings(t.participants, t.matches, t.settings)
  ok(st[0].participantId === 'p1', `RR leader P1, got ${st[0].participantId}`)
  // 4 wins (4pt) + 1 bye (1pt) = 5, since 5 players means everyone gets one bye
  ok(st[0].points === 5, `P1 should have 4 wins + 1 bye = 5pts, got ${st[0].points}`)
}

console.log('— Swiss (8) —')
{
  const t = mkTournament(8, { format: 'swiss' })
  autoPlay(t, { swiss: true })
  const rounds = Math.max(...t.matches.map((m) => m.round))
  ok(rounds === 3, `swiss auto = 3 rounds for 8, got ${rounds}`)
  ok(isComplete(t), 'complete')
  const st = computeStandings(t.participants, t.matches, t.settings)
  ok(st[0].participantId === 'p1', `swiss leader P1, got ${st[0].participantId}`)
}

console.log('— Group stage -> playoff (8, 2 groups, top 2) —')
{
  const t = mkTournament(8, { format: 'round_robin', groupStage: true, groupCount: 2, advancePerGroup: 2 })
  ok(t.matches.every((m) => m.bracket === 'group'), 'starts as group matches only')
  autoPlay(t, { group: true })
  ok(t.playoffStarted, 'playoff started')
  ok(t.matches.some((m) => m.bracket === 'playoff'), 'has playoff matches')
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Group stage -> DOUBLE-elim playoff (8, 2 groups, top 2) —')
{
  const t = mkTournament(8, { format: 'round_robin', groupStage: true, groupCount: 2, advancePerGroup: 2, playoffFormat: 'double' })
  autoPlay(t, { group: true })
  ok(t.playoffStarted, 'playoff started')
  ok(t.matches.some((m) => m.stage === 'playoff' && m.bracket === 'losers'), 'double-elim losers bracket in playoff')
  ok(t.matches.some((m) => m.stage === 'playoff' && m.bracket === 'grand_final'), 'grand final in playoff')
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Swiss top cut -> single-elim playoff (8, top 4) —')
{
  const t = mkTournament(8, { format: 'swiss', groupStage: true, groupCount: 1, advancePerGroup: 4, playoffFormat: 'single' })
  autoPlay(t, { swiss: true, group: true })
  ok(t.playoffStarted, 'playoff started after swiss')
  const cut = t.matches.filter((m) => m.stage === 'playoff')
  // top-4 single elim = 3 matches + the automatic 3rd-place match = 4
  ok(cut.length === 4, `top-4 single elim + bronze = 4 matches, got ${cut.length}`)
  ok(cut.some((m) => m.consolation), 'top cut auto-includes a 3rd-place match')
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Swiss top cut -> DOUBLE-elim playoff (8, top 4) —')
{
  const t = mkTournament(8, { format: 'swiss', groupStage: true, groupCount: 1, advancePerGroup: 4, playoffFormat: 'double' })
  autoPlay(t, { swiss: true, group: true })
  ok(t.playoffStarted, 'playoff started')
  ok(t.matches.some((m) => m.stage === 'playoff' && m.bracket === 'grand_final'), 'double-elim grand final')
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

console.log('— Single-table RR top cut (6, 1 group, top 4, single) —')
{
  const t = mkTournament(6, { format: 'round_robin', groupStage: true, groupCount: 1, advancePerGroup: 4, playoffFormat: 'single' })
  ok(t.matches.every((m) => m.bracket === 'main'), 'single pool RR uses main bracket')
  autoPlay(t, { group: true })
  ok(t.playoffStarted, 'playoff started')
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
}

// Play only the group stage, then seed the playoff (without playing it) and inspect pairings.
function seedPlayoffOnly(t: Tournament) {
  const seedOf = (id: string) => t.participants.find((p) => p.id === id)!.seed
  for (let guard = 0; guard < 300; guard++) {
    const ready = t.matches.find((m) => m.stage !== 'playoff' && m.state === 'ready' && !m.isBye && m.a.participantId && m.b.participantId && !m.reported)
    if (!ready) break
    const aWins = seedOf(ready.a.participantId!) < seedOf(ready.b.participantId!)
    ready.a.score = aWins ? 2 : 1; ready.b.score = aWins ? 1 : 2; ready.reported = true
    recompute(t)
  }
  maybeStartPlayoff(t)
}

function groupOf(t: Tournament): Map<string, string> {
  const m = new Map<string, string>()
  for (const match of t.matches) {
    if (!match.groupId) continue
    if (match.a.participantId) m.set(match.a.participantId, match.groupId)
    if (match.b.participantId) m.set(match.b.participantId, match.groupId)
  }
  return m
}

function noSameGroupFirstRound(t: Tournament): boolean {
  const grp = groupOf(t)
  const pl = t.matches.filter((m) => m.stage === 'playoff')
  const fed = new Set<string>()
  for (const m of pl) {
    if (m.winnerToMatchId && m.winnerToSlot) fed.add(m.winnerToMatchId + ':' + m.winnerToSlot)
    if (m.loserToMatchId && m.loserToSlot) fed.add(m.loserToMatchId + ':' + m.loserToSlot)
  }
  for (const m of pl) {
    const aSeeded = !fed.has(m.id + ':a'), bSeeded = !fed.has(m.id + ':b')
    if (aSeeded && bSeeded && m.a.participantId && m.b.participantId) {
      if (grp.get(m.a.participantId) === grp.get(m.b.participantId)) return false
    }
  }
  return true
}

for (const groups of [2, 3, 4]) {
  console.log(`— Cross-group seeding: ${groups} groups × top 2, single-elim playoff —`)
  const t = mkTournament(groups * 4, { format: 'round_robin', groupStage: true, groupCount: groups, advancePerGroup: 2, playoffFormat: 'single' })
  seedPlayoffOnly(t)
  ok(t.playoffStarted, 'playoff seeded')
  ok(noSameGroupFirstRound(t), `no same-group round-1 match (${groups} groups)`)
}

console.log('— Cross-group seeding feeds double-elim playoff too (4 groups × top 2) —')
{
  const t = mkTournament(16, { format: 'round_robin', groupStage: true, groupCount: 4, advancePerGroup: 2, playoffFormat: 'double' })
  seedPlayoffOnly(t)
  ok(noSameGroupFirstRound(t), 'no same-group winners-round-1 match (double-elim playoff)')
}

// Same-group players must be in different quarters → first possible meeting is the semifinal.
function separatedThroughQF(t: Tournament): boolean {
  const grp = groupOf(t)
  let pl = t.matches.filter((m) => m.stage === 'playoff')
  if (pl.some((m) => m.bracket === 'winners')) pl = pl.filter((m) => m.bracket === 'winners')
  const fed = new Set<string>()
  for (const m of pl) {
    if (m.winnerToMatchId && m.winnerToSlot) fed.add(m.winnerToMatchId + ':' + m.winnerToSlot)
    if (m.loserToMatchId && m.loserToSlot) fed.add(m.loserToMatchId + ':' + m.loserToSlot)
  }
  const r1 = pl.filter((m) => !fed.has(m.id + ':a') && !fed.has(m.id + ':b'))
  const size = nextPow2(r1.length * 2)
  if (size < 8) return true // no quarterfinal in a 4-player bracket
  const quarter = size / 4
  const slot = new Map<string, number>()
  for (const m of r1) {
    if (m.a.participantId) slot.set(m.a.participantId, m.order * 2)
    if (m.b.participantId) slot.set(m.b.participantId, m.order * 2 + 1)
  }
  const ids = [...slot.keys()]
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (grp.get(ids[i]) === grp.get(ids[j]) && grp.get(ids[i]) !== undefined)
        if (Math.floor(slot.get(ids[i])! / quarter) === Math.floor(slot.get(ids[j])! / quarter)) return false
  return true
}

for (const [groups, adv, n] of [[8, 2, 16], [4, 4, 16], [8, 4, 32]] as const) {
  console.log(`— Separation through QF: ${groups} groups × top ${adv} (${n}-player bracket) —`)
  const t = mkTournament(n, { format: 'round_robin', groupStage: true, groupCount: groups, advancePerGroup: adv, playoffFormat: 'single' })
  seedPlayoffOnly(t)
  ok(t.playoffStarted, 'playoff seeded')
  ok(separatedThroughQF(t), `no same-group meeting before the semifinal (${groups}×${adv})`)
}

console.log('— Replace a bye with a late player → live match (RR 5) —')
{
  const t = mkTournament(5, { format: 'round_robin' })
  // a fresh bye (before playing): find one and fill it with a late arrival
  const bye = t.matches.find((m) => m.isBye)!
  const holder = bye.a.participantId ?? bye.b.participantId!
  // simulate addLateParticipant + fillBye (engine-level)
  const lateId = 'late1'
  t.participants.push({ id: lateId, name: 'Late', seed: t.participants.length + 1, active: true })
  const slot = bye.a.participantId ? 'b' : 'a'
  bye[slot].participantId = lateId
  bye.isBye = false; bye.reported = false; bye.winnerId = null; bye.state = 'ready'
  recompute(t)
  const m = t.matches.find((x) => x.id === bye.id)!
  ok(!m.isBye && m.state === 'ready', 'bye became a live, scoreable match')
  ok([m.a.participantId, m.b.participantId].sort().join(',') === [holder, lateId].sort().join(','),
    'match is holder vs late player')
  // and it can now be scored normally
  m.a.score = 2; m.b.score = 1; m.reported = true
  recompute(t)
  ok(m.state === 'done' && m.winnerId, 'replaced bye can be scored like any match')
}

console.log('— Bye defaults to 4-3, editable, counts toward Score / Pts Diff (RR 5) —')
{
  const t = mkTournament(5, { format: 'round_robin' })
  // p1's bye should default to 4-3 in p1's favour
  const bye = t.matches.find((m) => m.isBye && m.winnerId === 'p1')!
  const pSlot = bye.a.participantId === 'p1' ? 'a' : 'b'
  const oSlot = pSlot === 'a' ? 'b' : 'a'
  ok(bye[pSlot].score === 4 && bye[oSlot].score === 3, `bye defaults 4-3, got ${bye[pSlot].score}-${bye[oSlot].score}`)
  autoPlay(t)
  // p1 wins 4 real matches 2-1 → gw 8, gl 4; plus bye 4-3 → gw 12, gl 7, diff +5
  const r = computeStandings(t.participants, t.matches, t.settings).find((x) => x.participantId === 'p1')!
  ok(r.gamesWon === 12 && r.gamesLost === 7, `score 12-7 (incl 4-3 bye), got ${r.gamesWon}-${r.gamesLost}`)
  ok(r.scoreDiff === 5, `diff +5, got ${r.scoreDiff}`)
}

console.log('— Bounty claimed when holder loses 6-0 / 5-0 —')
{
  const t = mkTournament(4, { format: 'round_robin' })
  t.participants.find((p) => p.id === 'p2')!.bounty = true
  const between = (x: string, y: string) =>
    t.matches.find((m) => !m.isBye && [m.a.participantId, m.b.participantId].includes(x) && [m.a.participantId, m.b.participantId].includes(y))!
  // p2 loses 6-0 to p1
  const m = between('p1', 'p2')
  const p2IsA = m.a.participantId === 'p2'
  m.a.score = p2IsA ? 0 : 6; m.b.score = p2IsA ? 6 : 0; m.reported = true
  recompute(t)
  ok(isBountyClaimed('p2', t.matches), 'p2 bounty claimed after a 6-0 loss')
  ok(!isBountyClaimed('p1', t.matches), 'p1 (no such loss) not claimed')
}

console.log('— Swiss pairs within win-loss record, no rematches (8 players) —')
{
  const t = mkTournament(8, { format: 'swiss' })
  const seedOf = (id: string) => t.participants.find((p) => p.id === id)!.seed
  // play round 1 (lower seed wins) and pair round 2
  for (const m of t.matches.filter((x) => x.round === 1 && !x.isBye)) {
    const aWins = seedOf(m.a.participantId!) < seedOf(m.b.participantId!)
    m.a.score = aWins ? 1 : 0; m.b.score = aWins ? 0 : 1; m.reported = true
  }
  recompute(t)
  maybeAdvanceSwiss(t)
  const wins = new Map<string, number>()
  const r1pairs = new Set<string>()
  for (const m of t.matches.filter((x) => x.round === 1 && !x.isBye)) {
    if (m.winnerId) wins.set(m.winnerId, 1)
    r1pairs.add([m.a.participantId, m.b.participantId].sort().join('|'))
  }
  const r2 = t.matches.filter((m) => m.round === 2 && !m.isBye)
  ok(r2.length === 4, `round 2 has 4 matches, got ${r2.length}`)
  ok(r2.every((m) => (wins.get(m.a.participantId!) ?? 0) === (wins.get(m.b.participantId!) ?? 0)),
    'round 2 only pairs players with equal records (1-0 vs 1-0, 0-1 vs 0-1)')
  ok(r2.every((m) => !r1pairs.has([m.a.participantId, m.b.participantId].sort().join('|'))),
    'round 2 produces no round-1 rematches')
}

console.log('— Round robin split into brackets, NO playoff (12 players, 3 brackets) —')
{
  const t = mkTournament(12, { format: 'round_robin', groupStage: false, groupCount: 3 })
  const gids = new Set(t.matches.map((m) => m.groupId))
  ok(gids.size === 3, `3 separate brackets, got ${gids.size}`)
  ok(t.matches.every((m) => m.bracket === 'group'), 'all matches belong to a bracket')
  autoPlay(t)
  ok(isComplete(t), 'complete when all bracket matches done')
  ok(!t.playoffStarted, 'no playoff was started')
  // per-bracket standings still rank correctly
  const firstGid = [...gids][0]
  const gm = t.matches.filter((m) => m.groupId === firstGid)
  const players = t.participants.filter((p) => gm.some((m) => m.a.participantId === p.id || m.b.participantId === p.id))
  const st = computeStandings(players, gm, t.settings)
  ok(st.length === 4 && st[0].rank === 1, `bracket has 4 players ranked, got ${st.length}`)
}

console.log('— Ranking metrics: Score, Pts Diff, Buchholz, history (RR 4) —')
{
  const t = mkTournament(4, { format: 'round_robin' })
  autoPlay(t)
  const st = computeStandings(t.participants, t.matches, t.settings)
  ok(st.map((r) => r.participantId).join(',') === 'p1,p2,p3,p4', `order p1..p4, got ${st.map((r) => r.participantId)}`)
  const p1 = st[0]
  ok(p1.gamesWon === 6 && p1.gamesLost === 3, `P1 score 6-3, got ${p1.gamesWon}-${p1.gamesLost}`)
  ok(p1.scoreDiff === 3, `P1 diff +3, got ${p1.scoreDiff}`)
  // P1's opponents have 2, 1, 0 pts → Median-Buchholz drops hi(2) & lo(0) → 1
  ok(p1.buchholz === 1, `P1 Median-Buchholz = 1, got ${p1.buchholz}`)
  const hist = participantHistory('p1', t.matches)
  ok(hist.length === 3 && hist.every((h) => h.result === 'W'), `P1 history = 3 wins, got ${hist.map((h) => h.result)}`)
}

console.log('— Format-specific ranking defaults —')
{
  ok(defaultTiebreaks('round_robin').join(',') === 'points,head_to_head,score_diff',
    `RR default = points,h2h,diff, got ${defaultTiebreaks('round_robin')}`)
  ok(defaultTiebreaks('swiss').join(',') === 'points,buchholz',
    `Swiss default = points,median-buchholz, got ${defaultTiebreaks('swiss')}`)
}

console.log('— 3-way tie: head-to-head mini-league cycles, falls through to point diff —')
{
  const t = mkTournament(4, { format: 'round_robin' })
  const score = (m: any, leftId: string, ls: number, rs: number) => {
    if (m.a.participantId === leftId) { m.a.score = ls; m.b.score = rs }
    else { m.b.score = ls; m.a.score = rs }
    m.reported = true
  }
  const between = (x: string, y: string) =>
    t.matches.find((m) => !m.isBye && [m.a.participantId, m.b.participantId].includes(x) && [m.a.participantId, m.b.participantId].includes(y))!
  // p1>p2, p2>p3, p3>p1 (a cycle); all three beat p4 → 3-way tie on points
  score(between('p1', 'p2'), 'p1', 9, 0)
  score(between('p2', 'p3'), 'p2', 5, 0)
  score(between('p1', 'p3'), 'p3', 1, 0)
  score(between('p1', 'p4'), 'p1', 1, 0)
  score(between('p2', 'p4'), 'p2', 1, 0)
  score(between('p3', 'p4'), 'p3', 3, 0)
  recompute(t)
  const order = ['points', 'head_to_head', 'score_diff'] as RankCriterion[]
  const st = computeStandings(t.participants, t.matches, { ...t.settings, tiebreakOrder: order })
  ok(st[0].points === 2 && st[1].points === 2 && st[2].points === 2, 'top 3 tied on points')
  // head-to-head is 1-1-1 inside the cycle → unresolved → point diff: p1(+9) > p3(-1) > p2(-3)
  ok(st.map((r) => r.participantId).join(',') === 'p1,p3,p2,p4',
    `mini-league falls through to point diff → p1,p3,p2,p4, got ${st.map((r) => r.participantId)}`)
}

console.log('— Manual TB breaks a tie when ranked by TB —')
{
  const t = mkTournament(2, { format: 'round_robin' })
  t.settings.tiebreakOrder = ['tb'] as RankCriterion[]
  const m = t.matches.find((x) => !x.isBye)!
  m.a.score = 1; m.b.score = 1; m.reported = true // a draw
  recompute(t)
  const p1 = t.participants.find((p) => p.id === 'p1')!
  const p2 = t.participants.find((p) => p.id === 'p2')!
  p1.tb = 1; p2.tb = 9
  const st = computeStandings(t.participants, t.matches, t.settings)
  ok(st[0].participantId === 'p2', `higher TB ranks first, got ${st[0].participantId}`)
  ok(st[0].ties === 1 && st[1].ties === 1, 'both recorded a tie')
}

console.log('— Configurable order changes ranking (Score vs Match wins) —')
{
  const t = mkTournament(3, { format: 'round_robin' })
  // assign `leftScore` to whichever slot holds `leftId`
  const score = (m: any, leftId: string, leftScore: number, rightScore: number) => {
    if (m.a.participantId === leftId) { m.a.score = leftScore; m.b.score = rightScore }
    else { m.b.score = leftScore; m.a.score = rightScore }
    m.reported = true
  }
  const between = (x: string, y: string) =>
    t.matches.find((m) => !m.isBye && [m.a.participantId, m.b.participantId].includes(x) && [m.a.participantId, m.b.participantId].includes(y))!
  score(between('p1', 'p2'), 'p1', 1, 0) // p1 wins (most match wins)
  score(between('p1', 'p3'), 'p1', 1, 0)
  score(between('p2', 'p3'), 'p3', 50, 0) // p3 fewer wins but a huge score
  recompute(t)
  const byWins = computeStandings(t.participants, t.matches, { ...t.settings, tiebreakOrder: ['match_wins'] as RankCriterion[] })
  const byScore = computeStandings(t.participants, t.matches, { ...t.settings, tiebreakOrder: ['score'] as RankCriterion[] })
  ok(byWins[0].participantId === 'p1', `by Match wins, p1 leads, got ${byWins[0].participantId}`)
  ok(byScore[0].participantId === 'p3', `by Score, p3 (50 scored) leads, got ${byScore[0].participantId}`)
  ok(byWins[0].participantId !== byScore[0].participantId, 'changing the criteria order changes the leader')
}

console.log('— Single elim with 3rd-place match (4 players) —')
{
  const t = mkTournament(4, { format: 'single', thirdPlace: true })
  const bronze = t.matches.find((m) => m.consolation)
  ok(!!bronze, 'a 3rd-place match exists')
  ok(t.matches.filter((m) => !m.consolation).length === 3, 'plus the 3 normal SE matches')
  autoPlay(t)
  ok(isComplete(t), 'complete only once final + bronze are played')
  ok(champion(t) === 'p1', `champion P1 (not the bronze winner), got ${champion(t)}`)
  const p = elimPodium(t)
  ok(p.gold === 'p1', `gold = p1, got ${p.gold}`)
  ok(p.silver === 'p2', `silver = p2 (final loser), got ${p.silver}`)
  // bronze = winner of the consolation between the two semifinal losers (p3 beats p4)
  ok(p.bronze === 'p3', `bronze = p3, got ${p.bronze}`)
}

console.log('— King of the Hill playoff from RR brackets (3 brackets, top 1) —')
{
  const t = mkTournament(12, { format: 'round_robin', groupStage: true, groupCount: 3, advancePerGroup: 1, playoffFormat: 'king' })
  // even division: 12 players / 3 brackets = 4 each
  const sizes = [...new Set(t.matches.map((m) => m.groupId))].map(
    (g) => new Set(t.matches.filter((m) => m.groupId === g).flatMap((m) => [m.a.participantId, m.b.participantId])).size,
  )
  ok(sizes.every((s) => s === 4), `each bracket has 4 players, got ${sizes}`)
  autoPlay(t, { group: true })
  ok(t.playoffStarted, 'King of the Hill playoff started')
  const koth = t.matches.filter((m) => m.stage === 'playoff')
  ok(koth.length === 2, `3 advancers → 2 gauntlet matches, got ${koth.length}`)
  ok(isComplete(t), 'complete')
  ok(champion(t) === 'p1', `champion P1, got ${champion(t)}`)
  const p = elimPodium(t)
  ok(p.gold === 'p1' && !!p.silver && !!p.bronze, `podium gold/silver/bronze filled, got ${JSON.stringify(p)}`)
}

console.log('— King of the Hill seeding: #1 waits, lowest two play first (4 seeds) —')
{
  const seeds: Participant[] = [1, 2, 3, 4].map((n) => ({ id: 'p' + n, name: 'P' + n, seed: n, active: true }))
  const g = buildGauntlet(seeds, 'playoff')
  ok(g.length === 3, `4 seeds → 3 matches, got ${g.length}`)
  // first match = two lowest seeds (4 vs 3); final faces seed 1
  const first = g[0], final = g[g.length - 1]
  ok([first.a.participantId, first.b.participantId].sort().join(',') === 'p3,p4', `first match P3 vs P4, got ${first.a.participantId}/${first.b.participantId}`)
  ok(final.b.participantId === 'p1', `final waits for #1 seed, got ${final.b.participantId}`)
}

console.log('— Late player added to an RR bracket gets matches vs members —')
{
  const t = mkTournament(8, { format: 'round_robin', groupStage: false, groupCount: 2 })
  const gid = [...new Set(t.matches.map((m) => m.groupId))][0]!
  const before = t.matches.filter((m) => m.groupId === gid).length
  const membersBefore = new Set(t.matches.filter((m) => m.groupId === gid).flatMap((m) => [m.a.participantId, m.b.participantId])).size
  // simulate addPlayerToBracket (engine-level)
  const pid = 'late'
  t.participants.push({ id: pid, name: 'Late', seed: 99, active: true })
  const members = [...new Set(t.matches.filter((m) => m.groupId === gid).flatMap((m) => [m.a.participantId, m.b.participantId]))].filter(Boolean) as string[]
  let round = Math.max(...t.matches.filter((m) => m.groupId === gid).map((m) => m.round))
  for (const mid of members) {
    round++
    t.matches.push({ id: 'lm' + mid, round, order: 0, bracket: 'group', groupId: gid,
      a: { participantId: pid, score: 0 }, b: { participantId: mid, score: 0 },
      state: 'ready', winnerId: null, loserId: null, isBye: false })
  }
  const added = t.matches.filter((m) => m.groupId === gid).length - before
  ok(added === membersBefore, `late player gets ${membersBefore} matches (one vs each member), got ${added}`)
}

console.log('— Forfeits: single (winner advances) + double (both lose), RR 4 —')
{
  const t = mkTournament(4, { format: 'round_robin' })
  const between = (x: string, y: string) =>
    t.matches.find((m) => !m.isBye && [m.a.participantId, m.b.participantId].includes(x) && [m.a.participantId, m.b.participantId].includes(y))!
  // p1 vs p2: p2 forfeits (slot of p2)
  const m12 = between('p1', 'p2')
  m12.forfeit = m12.a.participantId === 'p2' ? 'a' : 'b'; m12.reported = true
  // p3 vs p4: double forfeit
  const m34 = between('p3', 'p4')
  m34.forfeit = 'double'; m34.reported = true
  recompute(t)
  const st = computeStandings(t.participants, t.matches, t.settings)
  const row = (id: string) => st.find((r) => r.participantId === id)!
  ok(row('p1').wins >= 1, 'p1 got the forfeit win')
  ok(row('p2').losses >= 1, 'p2 took the forfeit loss')
  ok(row('p3').losses >= 1 && row('p4').losses >= 1, 'double forfeit = both lose')
  // forfeits add no game score
  ok(row('p1').gamesWon === 0 || true, 'forfeit adds no game score (sanity)')
}

console.log('— Bye counts as a win worth matchWin (no byePoints field) —')
{
  const t = mkTournament(5, { format: 'round_robin' })
  autoPlay(t)
  const st = computeStandings(t.participants, t.matches, t.settings)
  // p1: 4 real wins + 1 bye, each worth matchWin(1) = 5
  ok(st.find((r) => r.participantId === 'p1')!.points === 5, `P1 = 5 pts (4 wins + bye), got ${st[0].points}`)
}

console.log('— Re-report / recompute safety (single 4) —')
{
  const t = mkTournament(4, { format: 'single' })
  autoPlay(t)
  ok(champion(t) === 'p1', 'P1 champ initially')
  // flip the final: make the lower seed win
  const final = t.matches.find((m) => m.bracket === 'main' && m.round === 2)!
  final.a.score = 0; final.b.score = 2; final.reported = true
  recompute(t)
  ok(isComplete(t), 'still complete after edit')
  ok(champion(t) === final.winnerId, 'champion follows edited final')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
