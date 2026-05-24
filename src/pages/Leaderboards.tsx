import { navigate } from '../router'
import { useTournaments } from '../store/store'
import { champion } from '../engine/score'
import { computeStandings } from '../engine/standings'
import { FORMAT_LABELS } from '../types'
import { IconChart, IconTrophy } from '../components/Icons'

export default function Leaderboards() {
  const tournaments = useTournaments()

  // aggregate match wins + titles per participant name (across all tournaments)
  const agg = new Map<string, { wins: number; titles: number; played: number }>()
  const bump = (name: string, key: 'wins' | 'titles' | 'played', n = 1) => {
    const r = agg.get(name) ?? { wins: 0, titles: 0, played: 0 }
    r[key] += n
    agg.set(name, r)
  }

  for (const t of tournaments) {
    const byId = new Map(t.participants.map((p) => [p.id, p.name]))
    for (const m of t.matches) {
      if (m.state !== 'done' || m.isBye) continue
      const a = byId.get(m.a.participantId ?? ''), b = byId.get(m.b.participantId ?? '')
      if (a) bump(a, 'played')
      if (b) bump(b, 'played')
      if (m.winnerId) { const w = byId.get(m.winnerId); if (w) bump(w, 'wins') }
    }
    if (t.status === 'complete') {
      const champId = champion(t)
      let champName = champId ? byId.get(champId) : null
      if (!champName && (t.settings.format === 'round_robin' || t.settings.format === 'swiss') && !t.playoffStarted) {
        const top = computeStandings(t.participants.filter((p) => p.active), t.matches, t.settings)[0]
        champName = top ? byId.get(top.participantId) : null
      }
      if (champName) bump(champName, 'titles')
    }
  }

  const ranked = [...agg.entries()]
    .map(([name, r]) => ({ name, ...r }))
    .sort((x, y) => y.titles - x.titles || y.wins - x.wins || y.played - x.played)

  const completed = tournaments.filter((t) => t.status === 'complete')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboards</h1>
          <p className="muted" style={{ marginTop: 6 }}>Titles and match wins aggregated across all your tournaments.</p>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="empty"><div className="ico"><IconChart size={42} /></div><h2>Nothing to rank yet</h2>
          <p>Create and play a tournament to populate the leaderboard.</p>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => navigate('/new')}>New Tournament</button>
        </div>
      ) : (
        <div className="split">
          <div className="panel table-scroll">
            <div className="panel-head"><h3>All-time player ranking</h3></div>
            <table className="table">
              <thead><tr><th style={{ width: 40 }}>#</th><th>Player</th><th className="num">Titles</th><th className="num">Match wins</th><th className="num">Played</th></tr></thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name}>
                    <td><span className={`rank-badge ${i === 0 ? 'top' : ''}`}>{i + 1}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="num"><span className="pts">{r.titles}</span></td>
                    <td className="num record">{r.wins}</td>
                    <td className="num record dim">{r.played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Champions</h3></div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {completed.length === 0 && <div className="dim">No completed tournaments yet.</div>}
              {completed.map((t) => {
                const byId = new Map(t.participants.map((p) => [p.id, p.name]))
                const champId = champion(t)
                let name = champId ? byId.get(champId) : null
                if (!name && (t.settings.format === 'round_robin' || t.settings.format === 'swiss') && !t.playoffStarted) {
                  const top = computeStandings(t.participants.filter((p) => p.active), t.matches, t.settings)[0]
                  name = top ? byId.get(top.participantId) : null
                }
                return (
                  <button key={t.id} className="seed-item" onClick={() => navigate(`/t/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <span style={{ color: 'var(--live)' }}><IconTrophy size={18} /></span>
                    <span className="s-name">{name ?? '—'}<div className="dim" style={{ fontWeight: 500, fontSize: 12 }}>{t.name} · {FORMAT_LABELS[t.settings.format]}</div></span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
