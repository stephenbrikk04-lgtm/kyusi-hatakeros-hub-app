import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import {
  useTournament, startTournament, reportScore, clearScore, resetToSetup,
  deleteTournament, renameTournament, updatePointsConfig, setTiebreakOrder,
  setByeScore, clearByeScore, addLateParticipant, fillBye, useRole, setTournamentDate,
  addPlayerToBracket, endStage1, startTopCut, endTournament, setMatchLive,
} from '../store/store'
import { FORMAT_LABELS, Match, Tournament } from '../types'
import { champion, elimPodium } from '../engine/score'
import { computeStandings, claimedBounties } from '../engine/standings'
import { groupIds, stage1Complete } from '../engine/build'
import Bracket from '../components/Bracket'
import Standings from '../components/Standings'
import SeedList from '../components/SeedList'
import ScoreModal from '../components/ScoreModal'
import PointsEditor from '../components/PointsEditor'
import RankOrderEditor from '../components/RankOrderEditor'
import { fmtDate } from './Dashboard'
import { backendEnabled } from '../backend'
import { IconBack, IconShare, IconTrophy, IconClock, IconEye, IconMedal, IconCheck, IconExpand } from '../components/Icons'

// Fullscreen toggle — only used here, in tournament mode (per design).
function useFullscreen(): [boolean, () => void] {
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.()
  }
  return [fs, toggle]
}

export default function TournamentView({ id, viewerOnly = false }: { id: string; viewerOnly?: boolean }) {
  const t = useTournament(id)
  const organizer = !viewerOnly && useRole() === 'organizer'
  const [picked, setPicked] = useState<Match | null>(null)
  const [tab, setTab] = useState('')

  if (!t) {
    return (
      <div className="empty">
        <h2>Tournament not found</h2>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>Back to dashboard</button>
      </div>
    )
  }

  const isElim = t.settings.format === 'single' || t.settings.format === 'double'
  const isDouble = t.settings.format === 'double'
  const usesPoints = t.settings.format === 'round_robin' || t.settings.format === 'swiss' || t.settings.groupStage
  // round robin split into multiple brackets (A, B, C…) — shown in its own "Brackets" tab
  const multiGroup = t.settings.format === 'round_robin' && t.settings.groupCount > 1
  const playoffDouble = t.settings.playoffFormat === 'double'
  const stage1 = t.matches.filter((m) => m.stage !== 'playoff')

  // tabs by format + role (viewers don't get Participants / Settings)
  let tabs: string[]
  if (isElim) {
    tabs = ['Bracket']
  } else {
    tabs = [multiGroup ? 'Brackets' : 'Standings']
    if (!multiGroup) tabs.push('Rounds') // single-pool round-by-round schedule
    if (t.settings.groupStage) tabs.push('Top Cut')
  }
  tabs.push('Log')
  if (organizer) tabs.push('Participants', 'Settings')

  const active = tabs.includes(tab) ? tab : tabs[0]

  const isRanking = t.settings.format === 'round_robin' || t.settings.format === 'swiss'
  const s1done = isRanking ? stage1Complete(t) : false
  const ended = !!t.stage1Ended
  // reveal the final ranking (Swiss King / King of the Hill + medals) once the stage is ended
  const reveal = !isRanking || ended || t.playoffStarted

  const nameOf = (pid: string | null) => (pid ? t.participants.find((p) => p.id === pid)?.name ?? null : null)
  const podium = (() => {
    if (t.settings.format === 'single' || t.settings.format === 'double') {
      if (t.status !== 'complete') return null
      const p = elimPodium(t); return { gold: nameOf(p.gold), silver: nameOf(p.silver), bronze: nameOf(p.bronze) }
    }
    if (t.playoffStarted) {
      if (t.status !== 'complete') return null
      const p = elimPodium(t); return { gold: nameOf(p.gold), silver: nameOf(p.silver), bronze: nameOf(p.bronze) }
    }
    if (ended) {
      const st = computeStandings(t.participants.filter((x) => x.active), t.matches, t.settings)
      return { gold: nameOf(st[0]?.participantId ?? null), silver: nameOf(st[1]?.participantId ?? null), bronze: nameOf(st[2]?.participantId ?? null) }
    }
    return null
  })()

  const done = t.matches.filter((m) => m.state === 'done').length
  const total = t.matches.length
  const editable = organizer && t.status !== 'setup'
  const byeEditable = isRanking
  const dateLabel = fmtDate(t.date)
  const stageName = t.settings.format === 'swiss' ? 'Swiss Rounds' : 'Round Robin'
  const leaderLabel = reveal
    ? (t.settings.format === 'swiss' ? 'Swiss King' : t.settings.format === 'round_robin' ? 'King of the Hill' : undefined)
    : undefined
  // pure ranking tournament (no playoff) → show medals on the standings once ended
  const standingsPodium = ended && !t.playoffStarted && !t.settings.groupStage
  // stage-1 finished → show "Advanced" badges in the standings
  const advanceCount = t.settings.groupStage ? t.settings.advancePerGroup : 0
  const stageDone = t.settings.groupStage && stage1Complete(t)

  const submit = (a: number, b: number) => {
    if (!picked) return
    if (picked.isBye) setByeScore(t.id, picked.id, a, b)
    else reportScore(t.id, picked.id, a, b)
    setPicked(null)
  }
  const clear = () => {
    if (!picked) return
    if (picked.isBye) clearByeScore(t.id, picked.id)
    else clearScore(t.id, picked.id)
    setPicked(null)
  }
  const onPlay = (m: Match) => setMatchLive(t.id, m.id, !m.live)
  const claimed = claimedBounties(t.participants, t.matches)
  const [fs, toggleFs] = useFullscreen()

  return (
    <>
      <div className="crumb"><a onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Tournaments</a> / {t.name}</div>
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => navigate('/')} style={{ marginBottom: 10 }}>
            <IconBack size={14} /> All tournaments
          </button>
          <h1>{t.name}</h1>
          <div className="tags">
            <span className="tag accent">{FORMAT_LABELS[t.settings.format]}</span>
            {t.game && <span className="tag">{t.game}</span>}
            {t.status === 'setup' && <span className="tag">Setup</span>}
            {t.status === 'underway' && <span className="tag live">On going</span>}
            {t.status === 'complete' && <span className="tag win">Complete</span>}
            {dateLabel && <span className="tag"><IconClock size={12} /> {dateLabel}</span>}
            <span className="tag">{t.participants.length} participants</span>
            {t.settings.groupStage && <span className="tag accent">Top cut: {t.settings.advancePerGroup}{multiGroup ? '/bracket' : ''}</span>}
            {!organizer && <span className="tag"><IconEye size={12} /> View only</span>}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn sm ghost" onClick={toggleFs} title={fs ? 'Exit full screen' : 'Full screen'}>
            <IconExpand size={15} /> <span className="hide-sm">{fs ? 'Exit' : 'Full screen'}</span>
          </button>
          {organizer && t.status === 'setup' ? (
            <button className="btn primary" disabled={t.participants.filter((p) => p.active).length < 2}
              onClick={() => startTournament(t.id)}>Start tournament</button>
          ) : (
            <button className="btn sm" onClick={() => share(t)}><IconShare size={14} /> <span className="hide-sm">Share live link</span></button>
          )}
        </div>
      </div>

      {podium && podium.gold && (
        <div className="podium-banner">
          <div className="podium-place gold"><IconTrophy size={16} /><span className="pl-rank">Champion</span><b>{podium.gold}</b></div>
          {podium.silver && <div className="podium-place silver"><IconMedal size={16} /><span className="pl-rank">2nd</span><b>{podium.silver}</b></div>}
          {podium.bronze && <div className="podium-place bronze"><IconMedal size={16} /><span className="pl-rank">3rd</span><b>{podium.bronze}</b></div>}
        </div>
      )}

      {/* manual stage-end / start-top-cut controls */}
      {isRanking && s1done && !ended && (
        <div className="banner">
          <span>All {stageName.toLowerCase()} matches are complete.</span>
          {organizer
            ? <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => endStage1(t.id)}>End of {stageName}</button>
            : <span style={{ marginLeft: 'auto' }} className="dim">Waiting for the organizer to end the {stageName.toLowerCase()}.</span>}
        </div>
      )}
      {ended && t.settings.groupStage && !t.playoffStarted && (
        <div className="banner win">
          <span>{stageName} ended — final standings locked.</span>
          {organizer
            ? <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => startTopCut(t.id)}>Start the Top Cut</button>
            : <span style={{ marginLeft: 'auto' }} className="dim">Waiting for the organizer to start the top cut.</span>}
        </div>
      )}
      {t.status === 'complete' && podium?.gold && !t.tournamentEnded && (
        <div className="banner win">
          <span>{podium.gold} is the champion! 🏆</span>
          {organizer && <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => endTournament(t.id)}>End of Tournament</button>}
        </div>
      )}
      {t.tournamentEnded && (
        <div className="banner"><IconCheck size={16} /> Tournament ended — results are final.</div>
      )}

      {t.status === 'setup' ? (
        organizer ? <SetupView t={t} /> : (
          <div className="empty"><div className="ico"><IconClock size={38} /></div>
            <h2>Not started yet</h2><p>This tournament hasn’t begun. Check back once the organizer starts it.</p></div>
        )
      ) : (
        <>
          <div className="stats">
            <div className="stat"><div className="k">Participants</div><div className="v">{t.participants.length}</div></div>
            <div className="stat"><div className="k">Matches played</div><div className="v">{done} <small>/ {total}</small></div></div>
            <div className="stat"><div className="k">Completion</div><div className="v">{total ? Math.round((done / total) * 100) : 0}%</div></div>
            <div className="stat"><div className="k">Status</div><div className="v" style={{ fontSize: 18 }}>{t.status === 'complete' ? 'Complete' : 'On going'}</div></div>
          </div>

          <div className="tabs">
            {tabs.map((tb) => (
              <button key={tb} className={`tab ${active === tb ? 'on' : ''}`} onClick={() => setTab(tb)}>{tb}</button>
            ))}
          </div>

          {active === 'Bracket' && (
            <Bracket matches={t.matches.filter((m) => m.bracket !== 'playoff')} participants={t.participants}
              onPick={setPicked} editable={editable} isDouble={isDouble} claimed={claimed} onPlay={onPlay} />
          )}

          {active === 'Standings' && (
            <>
              <Standings participants={t.participants.filter((p) => p.active)} matches={stage1}
                settings={t.settings} title="Standings" tournamentId={organizer ? t.id : undefined}
                advanceCount={advanceCount} stageComplete={stageDone}
                leaderLabel={leaderLabel} podium={standingsPodium} claimed={claimed}
                onPickMatch={editable ? setPicked : undefined} />
              {editable && t.settings.format === 'round_robin' && !t.playoffStarted &&
                <AddToBracket tid={t.id} groupId={null} label="the round robin" />}
            </>
          )}

          {active === 'Rounds' && (
            <Bracket matches={stage1} participants={t.participants} onPick={setPicked} editable={editable}
              isDouble={false} byeEditable={byeEditable} claimed={claimed} onPlay={onPlay} />
          )}

          {active === 'Brackets' && <GroupsView t={t} onPick={setPicked} editable={editable} claimed={claimed} onPlay={onPlay} />}

          {active === 'Top Cut' && (
            t.playoffStarted ? (
              <Bracket matches={t.matches.filter((m) => m.stage === 'playoff')} participants={t.participants}
                onPick={setPicked} editable={editable} isDouble={playoffDouble} byeEditable={byeEditable} claimed={claimed} onPlay={onPlay} />
            ) : (
              <div className="empty"><div className="ico"><IconTrophy size={38} /></div>
                <h2>Top Cut not started</h2>
                <p>End the {stageName.toLowerCase()}, then start the top cut — the top {t.settings.advancePerGroup}{multiGroup ? ' per bracket' : ''} advance.</p></div>
            )
          )}

          {active === 'Participants' && <SeedList t={t} />}
          {active === 'Log' && <LogView t={t} />}
          {active === 'Settings' && <SettingsTab t={t} usesPoints={usesPoints} />}
        </>
      )}

      {picked && (
        <ScoreModal match={picked} participants={t.participants}
          allowTie={t.settings.format === 'round_robin' || t.settings.format === 'swiss'}
          onSubmit={submit} onClear={clear} onClose={() => setPicked(null)}
          byeCandidates={picked.isBye ? byeCandidatesFor(t, picked) : []}
          onFill={picked.isBye ? (pid) => { fillBye(t.id, picked.id, pid); setPicked(null) } : undefined}
          onAddAndFill={picked.isBye ? (name) => {
            const pid = addLateParticipant(t.id, name)
            fillBye(t.id, picked.id, pid)
            setPicked(null)
          } : undefined} />
      )}
    </>
  )
}

// Players eligible to take a bye slot: active and not already playing in that round/bracket.
function byeCandidatesFor(t: Tournament, m: Match) {
  const busy = new Set<string>()
  for (const x of t.matches) {
    if (x.round !== m.round || x.groupId !== m.groupId || x.id === m.id) continue
    if (x.a.participantId) busy.add(x.a.participantId)
    if (x.b.participantId) busy.add(x.b.participantId)
  }
  const here = m.a.participantId ?? m.b.participantId
  return t.participants.filter((p) => p.active && p.id !== here && !busy.has(p.id))
}

function SetupView({ t }: { t: Tournament }) {
  const canStart = t.participants.filter((p) => p.active).length >= 2
  return (
    <div className="split">
      <div className="panel">
        <div className="panel-head"><h3>Ready to start</h3></div>
        <div className="panel-body">
          <p className="muted">Review your participants and seeding on the right. When you start, the hub generates the {FORMAT_LABELS[t.settings.format].toLowerCase()} structure.</p>
          <div className="divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SummaryRow k="Format" v={FORMAT_LABELS[t.settings.format]} />
            {t.settings.format === 'round_robin' && <SummaryRow k="Rounds" v={t.settings.rrIterations === 2 ? 'Double round robin' : 'Single round robin'} />}
            {t.settings.format === 'swiss' && <SummaryRow k="Swiss rounds" v={t.settings.swissRounds === 0 ? 'Auto' : String(t.settings.swissRounds)} />}
            {t.settings.format === 'double' && <SummaryRow k="Grand final reset" v={t.settings.grandFinalReset ? 'On' : 'Off'} />}
            {t.settings.format === 'round_robin' && t.settings.groupCount > 1 && <SummaryRow k="Brackets" v={`${t.settings.groupCount} (A–${String.fromCharCode(64 + t.settings.groupCount)})`} />}
            {t.settings.groupStage && <SummaryRow k="Final stage" v={`top ${t.settings.advancePerGroup}${t.settings.format === 'round_robin' && t.settings.groupCount > 1 ? '/bracket' : ''} → ${t.settings.playoffFormat === 'double' ? 'double' : 'single'} elim`} />}
          </div>
          <div className="divider" />
          <button className="btn primary" style={{ width: '100%' }} disabled={!canStart} onClick={() => startTournament(t.id)}>
            Start tournament
          </button>
          {!canStart && <div className="hint" style={{ textAlign: 'center' }}>Add at least 2 participants to start.</div>}
        </div>
      </div>
      <SeedList t={t} />
    </div>
  )
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">{k}</span><b>{v}</b></div>
}

function GroupsView({ t, onPick, editable, claimed, onPlay }: {
  t: Tournament; onPick: (m: Match) => void; editable: boolean; claimed: Set<string>; onPlay: (m: Match) => void
}) {
  const gids = groupIds(t)
  const stageDone = stage1Complete(t)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {gids.map((gid, i) => {
        const gMatches = t.matches.filter((m) => m.groupId === gid)
        const players = t.participants.filter((p) =>
          gMatches.some((m) => m.a.participantId === p.id || m.b.participantId === p.id))
        return (
          <div key={gid}>
            <Standings participants={players} matches={gMatches} settings={t.settings}
              advanceCount={t.settings.groupStage ? t.settings.advancePerGroup : 0} stageComplete={stageDone}
              title={`Bracket ${String.fromCharCode(65 + i)}`} tournamentId={editable ? t.id : undefined} claimed={claimed}
              onPickMatch={editable ? onPick : undefined} />
            <div style={{ marginTop: 14 }}>
              <Bracket matches={gMatches} participants={t.participants} onPick={onPick} editable={editable}
                isDouble={false} byeEditable claimed={claimed} onPlay={onPlay} />
            </div>
            {editable && !t.playoffStarted && <AddToBracket tid={t.id} groupId={gid} label={`Bracket ${String.fromCharCode(65 + i)}`} />}
          </div>
        )
      })}
    </div>
  )
}

function ResultsLog({ t, onPick, editable }: { t: Tournament; onPick: (m: Match) => void; editable: boolean }) {
  const order = useMemo(() => {
    const prio: Record<string, number> = { winners: 0, main: 0, group: 0, playoff: 3, losers: 1, grand_final: 2 }
    return [...t.matches].sort((a, b) => (prio[a.bracket] - prio[b.bracket]) || a.round - b.round || a.order - b.order)
  }, [t.matches])
  const byId = new Map(t.participants.map((p) => [p.id, p]))
  const nm = (id: string | null, bye: boolean) => (id ? byId.get(id)?.name ?? '—' : bye ? 'Bye' : 'TBD')
  const byeEditable = t.settings.format === 'round_robin' || t.settings.format === 'swiss'

  return (
    <div className="panel">
      <div className="panel-head"><h3>Results</h3><span className="dim" style={{ fontSize: 12 }}>Click a ready match to enter a score</span></div>
      <table className="table">
        <thead><tr><th>Match</th><th>Pairing</th><th className="num">Score</th><th className="num">Status</th></tr></thead>
        <tbody>
          {order.map((m) => {
            const hasOne = !!m.a.participantId || !!m.b.participantId
            const canScore = editable && (m.isBye ? byeEditable && hasOne : !!m.a.participantId && !!m.b.participantId)
            const aWin = m.winnerId === m.a.participantId && m.state === 'done'
            const bWin = m.winnerId === m.b.participantId && m.state === 'done'
            return (
              <tr key={m.id} style={{ cursor: canScore ? 'pointer' : 'default' }} onClick={() => canScore && onPick(m)}>
                <td className="dim">{m.label}</td>
                <td>
                  <span style={{ fontWeight: aWin ? 700 : 500, color: aWin ? 'var(--win)' : undefined }}>{nm(m.a.participantId, m.isBye)}</span>
                  <span className="dim"> vs </span>
                  <span style={{ fontWeight: bWin ? 700 : 500, color: bWin ? 'var(--win)' : undefined }}>{nm(m.b.participantId, false)}</span>
                </td>
                <td className="num record">{m.state === 'done' || m.reported ? `${m.a.score} – ${m.b.score}` : '—'}</td>
                <td className="num">
                  {m.isBye ? <span className="tag">Bye</span>
                    : m.state === 'done' ? <span className="tag win">Done</span>
                    : m.state === 'ready' ? <span className="tag accent">Ready</span>
                    : <span className="tag">Pending</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AddToBracket({ tid, groupId, label }: { tid: string; groupId: string | null; label: string }) {
  const [name, setName] = useState('')
  const add = () => { if (name.trim()) { addPlayerToBracket(tid, groupId, name); setName('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 360 }}>
      <input className="input" placeholder={`Add late player to ${label}…`} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button className="btn primary" disabled={!name.trim()} onClick={add}>Add</button>
    </div>
  )
}

function LogView({ t }: { t: Tournament }) {
  return (
    <div className="panel">
      <div className="panel-head"><h3>Activity log</h3><span className="dim" style={{ fontSize: 12 }}>{t.log.length} entries</span></div>
      <div className="panel-body">
        {t.log.length === 0 ? (
          <div className="dim">No activity yet. Score changes will appear here.</div>
        ) : (
          <div className="log-list">
            {t.log.map((e) => (
              <div className="log-item" key={e.id}>
                <span className="log-time">{new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="log-text">{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SettingsTab({ t, usesPoints }: { t: Tournament; usesPoints: boolean }) {
  return (
    <div className={usesPoints ? 'split-even' : ''} style={{ maxWidth: 820 }}>
      <div className="panel">
        <div className="panel-head"><h3>Tournament</h3></div>
        <div className="panel-body">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" defaultValue={t.name} onBlur={(e) => renameTournament(t.id, e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Date</label>
            <input className="input" type="date" defaultValue={t.date ?? ''} style={{ maxWidth: 220 }}
              onChange={(e) => setTournamentDate(t.id, e.target.value)} />
          </div>
          <div className="divider" />
          <button className="btn" onClick={() => { if (confirm('Reset to setup? All match results will be cleared.')) resetToSetup(t.id) }}>
            Reset to setup
          </button>
          <button className="btn danger" style={{ marginLeft: 10 }}
            onClick={() => { if (confirm('Delete this tournament permanently?')) { deleteTournament(t.id); navigate('/') } }}>
            Delete tournament
          </button>
        </div>
      </div>
      {usesPoints && (
        <div className="panel">
          <div className="panel-head"><h3>Ranking criteria</h3></div>
          <div className="panel-body">
            <RankOrderEditor order={t.settings.tiebreakOrder} onChange={(next) => setTiebreakOrder(t.id, next)} />
          </div>
        </div>
      )}
      {usesPoints && (
        <div className="panel">
          <div className="panel-head"><h3>Points system</h3></div>
          <div className="panel-body">
            <PointsEditor points={t.settings.pointsConfig} onChange={(patch) => updatePointsConfig(t.id, patch)} />
            <div className="hint" style={{ marginTop: 14 }}>Standings recalculate instantly when you change these.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function share(t: Tournament) {
  const url = `${location.origin}${location.pathname}#/live/${t.id}`
  const note = backendEnabled()
    ? '\n\nShare with participants — they can watch the live tournament on any device.'
    : '\n\n⚠️ Local-only mode: this link only works in the same browser. (Backend not enabled in this build.)'
  navigator.clipboard?.writeText(url).then(
    () => alert('Live link copied:\n\n' + url + note),
    () => prompt('Copy the live link:', url),
  )
}
