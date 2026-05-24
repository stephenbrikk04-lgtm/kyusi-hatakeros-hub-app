// ============================================================
// Kyusi Hatakeros Tournament Hub — core domain types
// ============================================================

export type Format = 'single' | 'double' | 'round_robin' | 'swiss'

export const FORMAT_LABELS: Record<Format, string> = {
  single: 'Single Elimination',
  double: 'Double Elimination',
  round_robin: 'Round Robin',
  swiss: 'Swiss',
}

export type StaffRole = 'judge' | 'organizer'

export interface Participant {
  id: string
  name: string
  seed: number // 1-based; lower = stronger
  active: boolean // false if withdrawn
  tb?: number // manual tiebreaker (TB) the organizer can assign
  staff?: StaffRole // judge / organizer — shown with a label, no paid indicator
  paid?: boolean // registration fee paid (players only)
  bounty?: boolean // has a bounty on them (claimed if they lose 6-0 or 5-0)
}

// A match links two participant slots. A slot may be empty (TBD) or a bye.
export interface MatchSlot {
  participantId: string | null
  // For elimination brackets, slots are often filled by results of prior matches.
  fromMatchId?: string // winner/loser of this match flows in
  fromOutcome?: 'winner' | 'loser'
  score: number // games/points won in this match
}

export type MatchState = 'pending' | 'ready' | 'live' | 'done'

// Which bracket a match belongs to (double elim) or stage (groups/playoffs)
export type Bracket = 'winners' | 'losers' | 'grand_final' | 'main' | 'group' | 'playoff'

export interface Match {
  id: string
  round: number // 1-based round number within its bracket
  order: number // position within the round (for layout + seeding)
  bracket: Bracket
  stage?: 'playoff' // marks final-stage (top cut / playoff) matches across any bracket
  groupId?: string // round robin group / swiss has single group
  a: MatchSlot
  b: MatchSlot
  state: MatchState
  winnerId: string | null
  loserId: string | null
  isBye: boolean
  // for double elim routing of the loser
  loserToMatchId?: string
  loserToSlot?: 'a' | 'b'
  winnerToMatchId?: string
  winnerToSlot?: 'a' | 'b'
  label?: string // e.g. "Grand Final", "Bracket Reset"
  reported?: boolean // user has entered a result
  resetMatchId?: string // double-elim grand final -> bracket reset match
  consolation?: boolean // 3rd-place (bronze) match, fed by the semifinal losers
  forfeit?: 'a' | 'b' | 'double' // who forfeited (a/b lost by forfeit; double = both forfeit)
  live?: boolean // organizer marked this match as currently being played
}

// Challonge-style points configuration (round robin / swiss / group standings)
export interface PointsConfig {
  matchWin: number
  matchTie: number
  matchLoss: number
  gameWin: number
  gameTie: number
}

// Configurable ranking criteria (Challonge-style). The organizer reorders/toggles these to
// decide how the group-stage / Swiss standings are sorted.
export type RankCriterion =
  | 'match_wins' // Match W-L-T record (by wins)
  | 'score' // total games/points scored (for)
  | 'score_diff' // points differential (for − against)
  | 'points' // points awarded by the points system (Pts)
  | 'buchholz' // strength of schedule = sum of opponents' points
  | 'head_to_head' // results among the tied participants
  | 'tb' // manual tiebreaker the organizer assigns per participant

export const RANK_LABELS: Record<RankCriterion, { short: string; long: string }> = {
  match_wins: { short: 'W-L-T', long: 'Match W-L-T' },
  score: { short: 'Score', long: 'Score (for)' },
  score_diff: { short: 'Diff', long: 'Point differential' },
  points: { short: 'Pts', long: 'Points (Win 1 / Draw 0.5 / Loss 0)' },
  buchholz: { short: 'M-Buch', long: 'Median-Buchholz (opponent strength)' },
  head_to_head: { short: 'H2H', long: 'Head-to-head' },
  tb: { short: 'TB', long: 'Tiebreaker (manual)' },
}

export interface TournamentSettings {
  format: Format
  pointsConfig: PointsConfig
  tiebreakOrder: RankCriterion[]
  // round robin: how many times everyone plays everyone
  rrIterations: number
  // swiss: number of rounds (0 = auto = ceil(log2(n)))
  swissRounds: number
  // double elim: play a bracket-reset grand final if losers-bracket finalist wins
  grandFinalReset: boolean
  // group stage -> playoff
  groupStage: boolean
  groupCount: number
  advancePerGroup: number // how many from each group move to the playoff
  playoffFormat: 'single' | 'double' | 'king' // 'king' = King of the Hill gauntlet
  thirdPlace: boolean // single elim: add a 3rd-place (bronze) match for the semifinal losers
}

export type TournamentStatus = 'setup' | 'underway' | 'complete'

export interface LogEntry {
  id: string
  ts: number
  text: string
}

export interface Tournament {
  id: string
  name: string
  game?: string // e.g. "Valorant", "Chess"
  organizer?: string // organizer / host name
  description?: string
  date?: string // ISO date (YYYY-MM-DD) the tournament takes place
  status: TournamentStatus
  settings: TournamentSettings
  participants: Participant[]
  matches: Match[]
  log: LogEntry[] // activity log (score changes, etc.)
  stage1Ended?: boolean // organizer clicked "End of Swiss Rounds / Round Robin"
  tournamentEnded?: boolean // organizer clicked "End of Tournament" after the champion was decided
  // group->playoff: when the group stage finishes, playoff matches get appended
  playoffStarted: boolean
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface StandingRow {
  participantId: string
  rank: number
  played: number
  wins: number
  ties: number
  losses: number
  points: number // Pts (points system)
  gamesWon: number // Score for
  gamesLost: number // Score against
  scoreDiff: number // Pts Diff
  buchholz: number // sum of opponents' points
  tb: number // manual tiebreaker
  advancing?: boolean // group stage: in the qualifying zone
}

export const DEFAULT_POINTS: PointsConfig = {
  matchWin: 1,
  matchTie: 0.5,
  matchLoss: 0,
  gameWin: 0,
  gameTie: 0,
}

// Default ranking priority per format (organizer can reorder/toggle in Settings):
//  • Round robin — highest total points, then head-to-head, then point differential.
//  • Swiss — total points, then Median-Buchholz (opponent strength).
export function defaultTiebreaks(format: Format): RankCriterion[] {
  if (format === 'swiss') return ['points', 'buchholz']
  if (format === 'round_robin') return ['points', 'head_to_head', 'score_diff']
  return ['points', 'match_wins', 'score_diff']
}

// General fallback used when migrating older saved data.
export const DEFAULT_TIEBREAKS: RankCriterion[] = ['points', 'head_to_head', 'score_diff', 'match_wins', 'buchholz', 'tb']
