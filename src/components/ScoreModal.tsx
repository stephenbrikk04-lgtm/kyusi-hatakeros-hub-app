import { useEffect, useState } from 'react'
import { Match, Participant } from '../types'

export default function ScoreModal({
  match, participants, allowTie, onSubmit, onClear, onClose,
  byeCandidates = [], onFill, onAddAndFill,
}: {
  match: Match
  participants: Participant[]
  allowTie: boolean
  onSubmit: (a: number, b: number) => void
  onClear: () => void
  onClose: () => void
  byeCandidates?: Participant[]
  onFill?: (pid: string) => void
  onAddAndFill?: (name: string) => void
}) {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const isBye = match.isBye
  // names; the empty side of a bye is labelled "BYE"
  const nameA = match.a.participantId ? byId.get(match.a.participantId)?.name ?? 'A' : 'BYE'
  const nameB = match.b.participantId ? byId.get(match.b.participantId)?.name ?? 'B' : 'BYE'
  const presentName = match.a.participantId ? nameA : nameB
  const [a, setA] = useState(match.reported || isBye ? match.a.score : 0)
  const [b, setB] = useState(match.reported || isBye ? match.b.score : 0)
  const [pickPid, setPickPid] = useState('')
  const [lateName, setLateName] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const invalid = !isBye && !allowTie && a === b

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isBye ? 'Bye score' : 'Report score'}</h3>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{match.label}{isBye ? ' · bye (auto-win)' : ''}</div>
        </div>
        <div className="modal-body">
          <div className="score-inputs">
            <div className="score-box">
              <div className="nm">{nameA}</div>
              <input type="number" min={0} value={a} autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setA(Math.max(0, Number(e.target.value)))} />
            </div>
            <span className="vs">vs</span>
            <div className="score-box">
              <div className="nm">{nameB}</div>
              <input type="number" min={0} value={b}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setB(Math.max(0, Number(e.target.value)))} />
            </div>
          </div>
          {isBye && <div className="hint" style={{ textAlign: 'center' }}>Bye counts as a win for {presentName}; both scores feed Score &amp; Pts Diff.</div>}
          {invalid && (
            <div className="hint" style={{ textAlign: 'center', color: 'var(--danger)' }}>
              This format needs a winner — scores can’t be equal.
            </div>
          )}

          {isBye && (onFill || onAddAndFill) && (
            <>
              <div className="divider" />
              <div className="label">Replace bye with a player</div>
              <div className="hint" style={{ marginTop: -2, marginBottom: 10 }}>
                For a late arrival — turns this into a live match vs {presentName}.
              </div>
              {onFill && byeCandidates.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <select className="select" value={pickPid} onChange={(e) => setPickPid(e.target.value)}>
                    <option value="">Existing participant…</option>
                    {byeCandidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button className="btn" disabled={!pickPid} onClick={() => onFill!(pickPid)}>Assign</button>
                </div>
              )}
              {onAddAndFill && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" placeholder="Add new player…" value={lateName}
                    onChange={(e) => setLateName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && lateName.trim()) onAddAndFill!(lateName.trim()) }} />
                  <button className="btn primary" disabled={!lateName.trim()} onClick={() => onAddAndFill!(lateName.trim())}>
                    Add &amp; assign
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          {match.reported && !isBye && <button className="btn danger" onClick={onClear} style={{ marginRight: 'auto' }}>Clear</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={invalid} onClick={() => onSubmit(a, b)}>Save result</button>
        </div>
      </div>
    </div>
  )
}
