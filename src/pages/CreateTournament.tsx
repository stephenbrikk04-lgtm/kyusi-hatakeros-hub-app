import { useState } from 'react'
import { navigate } from '../router'
import { createTournament, defaultSettings, startTournament } from '../store/store'
import { defaultTiebreaks, Format, FORMAT_LABELS, PointsConfig } from '../types'
import { IconBack } from '../components/Icons'
import PointsEditor from '../components/PointsEditor'
import RankOrderEditor from '../components/RankOrderEditor'

const FORMAT_DESC: Record<Format, string> = {
  single: 'Knockout bracket. Lose once and you are out.',
  double: 'Winners + losers bracket. You must lose twice to be eliminated.',
  round_robin: 'Everyone plays everyone. Ranked by the points system.',
  swiss: 'Players paired by record each round. No elimination.',
}

export default function CreateTournament() {
  const [name, setName] = useState('')
  const [game, setGame] = useState('Beyblade X')
  const [organizer, setOrganizer] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [settings, setSettings] = useState(defaultSettings('single'))
  const [namesText, setNamesText] = useState('')

  const set = (patch: Partial<typeof settings>) => setSettings((s) => ({ ...s, ...patch }))
  const setPoints = (patch: Partial<PointsConfig>) =>
    setSettings((s) => ({ ...s, pointsConfig: { ...s.pointsConfig, ...patch } }))

  const names = namesText.split('\n').map((n) => n.trim()).filter(Boolean)
  const showPoints = settings.format === 'round_robin' || settings.format === 'swiss' || settings.groupStage
  const canCreate = name.trim().length > 0 && names.length >= 2

  const create = (start: boolean) => {
    const id = createTournament({ name, game, organizer, date, description, settings, participantNames: names })
    if (start) startTournament(id)
    navigate(`/t/${id}`)
  }

  return (
    <>
      <div className="crumb">
        <a onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Tournaments</a> / New
      </div>
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => navigate('/')} style={{ marginBottom: 10 }}>
            <IconBack size={14} /> Back
          </button>
          <h1>Create tournament</h1>
        </div>
      </div>

      <div className="split">
        {/* left column */}
        <div>
          <div className="panel">
            <div className="panel-head"><h3>Details</h3></div>
            <div className="panel-body">
              <div className="field">
                <label className="label">Tournament name</label>
                <input className="input" value={name} placeholder="Summer Smash 2026"
                  onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Game / sport <span className="dim">(optional)</span></label>
                  <input className="input" value={game} placeholder="Valorant, Chess, Tennis…"
                    onChange={(e) => setGame(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Date <span className="dim">(optional)</span></label>
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
                <label className="label">Organizer <span className="dim">(optional)</span></label>
                <input className="input" value={organizer} placeholder="Host / organizer name"
                  onChange={(e) => setOrganizer(e.target.value)} />
              </div>
              <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
                <label className="label">Description <span className="dim">(optional)</span></label>
                <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 20 }}>
            <div className="panel-head"><h3>Format</h3></div>
            <div className="panel-body">
              <div className="fmt-grid">
                {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                  <button key={f} className={`fmt ${settings.format === f ? 'on' : ''}`}
                    onClick={() => set({ format: f, tiebreakOrder: defaultTiebreaks(f) })}>
                    <b>{FORMAT_LABELS[f]}</b>
                    <span>{FORMAT_DESC[f]}</span>
                  </button>
                ))}
              </div>

              {/* format-specific options */}
              <div className="divider" />
              {settings.format === 'single' && (
                <label className="check">
                  <input type="checkbox" checked={settings.thirdPlace}
                    onChange={(e) => set({ thirdPlace: e.target.checked })} />
                  <span>3rd-place match <span className="dim">— the two semifinal losers play for bronze</span></span>
                </label>
              )}
              {settings.format === 'double' && (
                <label className="check">
                  <input type="checkbox" checked={settings.grandFinalReset}
                    onChange={(e) => set({ grandFinalReset: e.target.checked })} />
                  <span>Grand final bracket reset <span className="dim">— losers-bracket winner must win twice</span></span>
                </label>
              )}
              {settings.format === 'round_robin' && (
                <>
                  <div className="field">
                    <label className="label">Match each pair</label>
                    <div className="seg">
                      {[1, 2].map((n) => (
                        <button key={n} className={settings.rrIterations === n ? 'on' : ''} onClick={() => set({ rrIterations: n })}>
                          {n === 1 ? 'Single round robin' : 'Double round robin'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="label">Split into brackets</label>
                    <input className="input" type="number" min={1} value={settings.groupCount}
                      onChange={(e) => set({ groupCount: Math.max(1, Number(e.target.value)) })} style={{ maxWidth: 160 }} />
                    <div className="hint">1 = single table. 2+ creates Bracket A, B, C… each a separate round robin with its own standings.</div>
                  </div>
                </>
              )}
              {settings.format === 'swiss' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Number of rounds</label>
                  <input className="input" type="number" min={0} value={settings.swissRounds}
                    onChange={(e) => set({ swissRounds: Math.max(0, Number(e.target.value)) })} style={{ maxWidth: 160 }} />
                  <div className="hint">Set 0 to auto-calculate (≈ log₂ of participant count).</div>
                </div>
              )}

              {/* group stage -> playoff */}
              {(settings.format === 'round_robin' || settings.format === 'swiss') && (
                <>
                  <div className="divider" />
                  <label className="check">
                    <input type="checkbox" checked={settings.groupStage}
                      onChange={(e) => set({ groupStage: e.target.checked })} />
                    <span><b>Add a final stage (top cut / playoffs)</b> — top finishers advance to a knockout bracket</span>
                  </label>
                  {settings.groupStage && (
                    <>
                      <div className="row" style={{ marginTop: 14 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label className="label">
                            {settings.format === 'round_robin' && settings.groupCount > 1 ? 'Advance per bracket' : 'Players in top cut'}
                          </label>
                          <input className="input" type="number" min={1} value={settings.advancePerGroup}
                            onChange={(e) => set({ advancePerGroup: Math.max(1, Number(e.target.value)) })} />
                          {settings.format === 'round_robin' && settings.groupCount > 1 &&
                            <div className="hint">Top {settings.advancePerGroup} from each of {settings.groupCount} brackets advance.</div>}
                        </div>
                      </div>
                      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
                        <label className="label">Playoff bracket format</label>
                        <div className="seg">
                          <button className={settings.playoffFormat === 'single' ? 'on' : ''}
                            onClick={() => set({ playoffFormat: 'single' })}>Single elim</button>
                          <button className={settings.playoffFormat === 'double' ? 'on' : ''}
                            onClick={() => set({ playoffFormat: 'double' })}>Double elim</button>
                          <button className={settings.playoffFormat === 'king' ? 'on' : ''}
                            onClick={() => set({ playoffFormat: 'king' })}>King of the Hill</button>
                        </div>
                        {settings.playoffFormat === 'king' && (
                          <div className="hint">Seeds climb: the lowest two play, the winner faces the next-higher seed, up to the #1 seed in the final.</div>
                        )}
                        {settings.playoffFormat === 'double' && (
                          <label className="check" style={{ marginTop: 12 }}>
                            <input type="checkbox" checked={settings.grandFinalReset}
                              onChange={(e) => set({ grandFinalReset: e.target.checked })} />
                            <span>Grand final bracket reset</span>
                          </label>
                        )}
                        {settings.playoffFormat === 'single' && (
                          <div className="hint" style={{ marginTop: 10 }}>A 3rd-place match is included automatically in the top cut.</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {showPoints && (
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="panel-head">
                <h3>Points system</h3>
                <span className="dim" style={{ fontSize: 12 }}>Challonge defaults</span>
              </div>
              <div className="panel-body">
                <PointsEditor points={settings.pointsConfig} onChange={setPoints} />
              </div>
            </div>
          )}

          {showPoints && (
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="panel-head">
                <h3>Ranking criteria</h3>
                <span className="dim" style={{ fontSize: 12 }}>Drag-free reorder</span>
              </div>
              <div className="panel-body">
                <RankOrderEditor order={settings.tiebreakOrder} onChange={(next) => set({ tiebreakOrder: next })} />
              </div>
            </div>
          )}
        </div>

        {/* right column — participants */}
        <div className="panel" style={{ position: 'sticky', top: 20 }}>
          <div className="panel-head">
            <h3>Participants</h3>
            <span className="tag accent">{names.length}</span>
          </div>
          <div className="panel-body">
            <label className="label">One name per line</label>
            <textarea className="textarea" style={{ minHeight: 230 }} value={namesText}
              placeholder={'Nova Esports\nShadow Unit\nApex Squad\nTitan Core'}
              onChange={(e) => setNamesText(e.target.value)} />
            <div className="hint">Seeding follows this order (top = seed 1). You can re-seed and shuffle later.</div>

            <div className="divider" />
            <button className="btn primary" style={{ width: '100%' }} disabled={!canCreate} onClick={() => create(false)}>
              Create tournament
            </button>
            <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={!canCreate} onClick={() => create(true)}>
              Create &amp; start now
            </button>
            {!canCreate && <div className="hint" style={{ textAlign: 'center' }}>Add a name and at least 2 participants.</div>}
          </div>
        </div>
      </div>
    </>
  )
}
