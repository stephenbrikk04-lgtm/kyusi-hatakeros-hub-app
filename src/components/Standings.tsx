import { Fragment, useState } from 'react'
import { Match, Participant, RANK_LABELS, RankCriterion, StandingRow, TournamentSettings } from '../types'
import { computeStandings, participantHistory, HistoryRow } from '../engine/standings'
import { setParticipantTB } from '../store/store'
import { IconCheck, IconCrown, IconMedal } from './Icons'

// Every criterion that has a column. Order shown = the organizer's ranking order first (enabled),
// then any disabled criteria. Head-to-head is a comparator, so it has no column.
const COLUMN_CRITERIA: RankCriterion[] = ['match_wins', 'score', 'score_diff', 'points', 'buchholz', 'tb']

export default function Standings({
  participants, matches, settings, advanceCount = 0, title, tournamentId, stageComplete = false,
  leaderLabel, podium = false, claimed, onPickMatch,
}: {
  participants: Participant[]
  matches: Match[]
  settings: TournamentSettings
  advanceCount?: number
  title?: string
  tournamentId?: string
  stageComplete?: boolean
  leaderLabel?: string // crown label for rank 1 (e.g. "Swiss King")
  podium?: boolean // ranking stage complete → gold/silver/bronze on top 3
  claimed?: Set<string> // participant ids whose bounty has been claimed
  onPickMatch?: (m: Match) => void // organizer: click a result/bye in the form to edit it
}) {
  const rows = computeStandings(participants, matches, settings, advanceCount)
  const byId = new Map(participants.map((p) => [p.id, p]))
  const [open, setOpen] = useState<string | null>(null)

  // columns reflect the organizer's ranking order: enabled criteria (in priority order) first
  const enabled = settings.tiebreakOrder.filter((c) => COLUMN_CRITERIA.includes(c))
  const disabled = COLUMN_CRITERIA.filter((c) => !enabled.includes(c))
  const cols = [...enabled, ...disabled]
  const priorityOf = (c: RankCriterion) => settings.tiebreakOrder.indexOf(c)
  const totalCols = 3 + cols.length // #, Participant, Form + criteria
  const medalCls = (rank: number) => (rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze')

  const advancingCount = rows.filter((r) => r.advancing).length

  const cell = (r: StandingRow, c: RankCriterion) => {
    switch (c) {
      case 'match_wins': return <span className="record">{r.wins}-{r.losses}-{r.ties}</span>
      case 'score': return <span className="record">{r.gamesWon}</span>
      case 'score_diff': return <span className="record">{r.scoreDiff > 0 ? '+' : ''}{r.scoreDiff}</span>
      case 'points': return <span className="pts">{r.points}</span>
      case 'buchholz': return <span className="record dim">{r.buchholz}</span>
      case 'tb':
        return tournamentId ? (
          <input className="tb-input" type="number" step="0.5" value={r.tb}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setParticipantTB(tournamentId, r.participantId, Number(e.target.value))} />
        ) : <span className="record dim">{r.tb}</span>
    }
  }

  return (
    <div className="panel">
      {title && (
        <div className="panel-head">
          <h3>{title}</h3>
          {advanceCount > 0 && (
            <span className="tag win">
              {stageComplete ? `${advancingCount} advanced` : `Top ${advanceCount} advance`}
            </span>
          )}
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Participant</th>
            <th>Form</th>
            {cols.map((c) => {
              const pr = priorityOf(c)
              return (
                <th key={c} className={`num ${pr < 0 ? 'col-off' : ''}`}
                  title={pr >= 0 ? `${RANK_LABELS[c].long} — sort priority ${pr + 1}` : `${RANK_LABELS[c].long} (not used for sorting)`}>
                  {RANK_LABELS[c].short}{pr >= 0 && <sup className="sort-pri">{pr + 1}</sup>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = open === r.participantId
            const advanced = stageComplete && r.advancing
            return (
              <Fragment key={r.participantId}>
                <tr className={r.advancing ? 'advancing' : ''}
                  style={{ cursor: 'pointer' }} onClick={() => setOpen(expanded ? null : r.participantId)}
                  title="Click for match history">
                  <td><span className={`rank-badge ${r.rank === 1 ? 'top' : ''}`}>{r.rank}</span></td>
                  <td style={{ fontWeight: 600 }}>
                    <span className="expand-caret">{expanded ? '▾' : '▸'}</span> {byId.get(r.participantId)?.name ?? '—'}
                    {byId.get(r.participantId)?.staff && (
                      <span className={`p-badge ${byId.get(r.participantId)!.staff}`} style={{ marginLeft: 7 }}>
                        {byId.get(r.participantId)!.staff === 'judge' ? 'Judge' : 'Org'}
                      </span>
                    )}
                    {byId.get(r.participantId)?.bounty && (
                      <span className={`p-badge ${claimed?.has(r.participantId) ? 'bounty-claimed' : 'bounty'}`} style={{ marginLeft: 7 }}>
                        {claimed?.has(r.participantId) ? 'Bounty Claimed' : 'Bounty'}
                      </span>
                    )}
                    {podium && r.rank <= 3 && (
                      <span className={`medal ${medalCls(r.rank)}`} title={r.rank === 1 ? 'Champion' : r.rank === 2 ? '2nd place' : '3rd place'}>
                        <IconMedal size={13} />
                      </span>
                    )}
                    {leaderLabel && r.rank === 1 && (
                      <span className="king-badge"><IconCrown size={12} /> {leaderLabel}</span>
                    )}
                    {advanced && <span className="adv-badge"><IconCheck size={11} /> Top cut</span>}
                  </td>
                  <td><FormStrip rows={participantHistory(r.participantId, matches)} matches={matches} onPick={onPickMatch} /></td>
                  {cols.map((c) => <td key={c} className="num">{cell(r, c)}</td>)}
                </tr>
                {expanded && (
                  <tr className="history-row">
                    <td colSpan={totalCols}>
                      <HistoryBlock pid={r.participantId} matches={matches} byId={byId} onPick={onPickMatch} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <div className="rank-note">Ranked by: {settings.tiebreakOrder.map((c) => RANK_LABELS[c].short).join(' › ')}</div>
    </div>
  )
}

const badgeCls = (r: string) => (r === 'W' ? 'h-win' : r === 'L' ? 'h-loss' : r === 'T' ? 'h-tie' : 'h-bye')

// Compact per-round result sequence, e.g. W W L W L (pips clickable to edit when allowed)
function FormStrip({ rows, matches, onPick }: { rows: HistoryRow[]; matches: Match[]; onPick?: (m: Match) => void }) {
  if (rows.length === 0) return <span className="dim" style={{ fontSize: 12 }}>—</span>
  const click = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const m = matches.find((x) => x.id === id)
    if (m) onPick!(m)
  }
  return (
    <span className="form-strip">
      {rows.map((h) => (
        <span key={h.matchId} className={`form-pip ${badgeCls(h.result)} ${onPick ? 'clickable' : ''}`}
          title={`R${h.round}: ${h.result}${onPick ? ' — click to edit' : ''}`}
          onClick={onPick ? click(h.matchId) : undefined}>
          {h.result === 'BYE' ? 'B' : h.result}
        </span>
      ))}
    </span>
  )
}

function HistoryBlock({ pid, matches, byId, onPick }: {
  pid: string; matches: Match[]; byId: Map<string, Participant>; onPick?: (m: Match) => void
}) {
  const history = participantHistory(pid, matches)
  if (history.length === 0) return <div className="dim" style={{ padding: '4px 2px' }}>No matches played yet.</div>
  return (
    <div className="history">
      {history.map((h) => {
        const m = matches.find((x) => x.id === h.matchId)
        return (
          <div className={`history-item ${onPick ? 'clickable' : ''}`} key={h.matchId}
            title={onPick ? 'Click to edit' : ''}
            onClick={onPick && m ? (e) => { e.stopPropagation(); onPick(m) } : undefined}>
            <span className={`h-badge ${badgeCls(h.result)}`}>{h.result === 'BYE' ? 'B' : h.result}</span>
            <span className="h-opp">{h.opponentId ? byId.get(h.opponentId)?.name ?? '—' : 'Bye'}</span>
            {h.result !== 'BYE' && <span className="h-score">{h.forScore}–{h.againstScore}</span>}
            <span className="h-round dim">R{h.round}</span>
          </div>
        )
      })}
    </div>
  )
}
