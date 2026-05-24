import { useState } from 'react'
import { navigate } from '../router'
import { useTournaments, useRole, deleteTournament } from '../store/store'
import { FORMAT_LABELS, Tournament, TournamentStatus } from '../types'
import { IconPlus, IconTrophy, IconTrash, IconClock } from '../components/Icons'
import Logo from '../components/Logo'

const statusTag: Record<TournamentStatus, { cls: string; label: string }> = {
  setup: { cls: 'tag', label: 'Setup' },
  underway: { cls: 'tag live', label: 'On going' },
  complete: { cls: 'tag win', label: 'Complete' },
}

export function fmtDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtCreated = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const progressOf = (t: Tournament) => {
  const total = t.matches.length
  const done = t.matches.filter((m) => m.state === 'done').length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

export default function Dashboard() {
  const tournaments = useTournaments()
  const organizer = useRole() === 'organizer'
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('khth.view') as 'grid' | 'list') || 'list')
  const setViewP = (v: 'grid' | 'list') => { setView(v); localStorage.setItem('khth.view', v) }

  const underway = tournaments.filter((t) => t.status === 'underway').length
  const complete = tournaments.filter((t) => t.status === 'complete').length

  return (
    <>
      {/* branded header */}
      <div className="hub-header">
        <Logo size={52} />
        <div>
          <h1>Kyusi Hatakeros Tournament Hub</h1>
          <p className="muted">{organizer ? 'Create and manage tournaments, brackets and leaderboards.' : 'Browse tournaments, brackets and standings.'}</p>
        </div>
        {organizer && (
          <div className="head-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn primary" onClick={() => navigate('/new')}><IconPlus size={15} /> New Tournament</button>
          </div>
        )}
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat"><div className="k">Tournaments</div><div className="v">{tournaments.length}</div></div>
        <div className="stat"><div className="k">Underway</div><div className="v">{underway}</div></div>
        <div className="stat"><div className="k">Completed</div><div className="v">{complete}</div></div>
      </div>

      {tournaments.length === 0 ? (
        <div className="empty">
          <div className="ico"><IconTrophy size={42} /></div>
          <h2>No tournaments yet</h2>
          <p>{organizer ? 'Spin up a bracket, league or round robin in under a minute.' : 'No tournaments have been created yet.'}</p>
          {organizer && (
            <button className="btn primary" style={{ marginTop: 18 }} onClick={() => navigate('/new')}>
              <IconPlus size={15} /> Create your first tournament
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <h2>Your tournaments</h2>
            <div className="seg" style={{ marginLeft: 'auto' }}>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setViewP('list')}>List</button>
              <button className={view === 'grid' ? 'on' : ''} onClick={() => setViewP('grid')}>Grid</button>
            </div>
          </div>
          {view === 'grid' ? (
            <div className="grid-cards">
              {tournaments.map((t) => <TournamentCard key={t.id} t={t} organizer={organizer} />)}
            </div>
          ) : (
            <ListView tournaments={tournaments} organizer={organizer} />
          )}
        </>
      )}
    </>
  )
}

function ListView({ tournaments, organizer }: { tournaments: Tournament[]; organizer: boolean }) {
  return (
    <div className="panel table-scroll">
      <table className="table list-table">
        <thead>
          <tr>
            <th>Tournament</th>
            <th>Game</th>
            <th>Organizer</th>
            <th>Type</th>
            <th className="num">Players</th>
            <th>Created</th>
            <th>Progress</th>
            {organizer && <th></th>}
          </tr>
        </thead>
        <tbody>
          {tournaments.map((t) => {
            const p = progressOf(t)
            const remove = (e: React.MouseEvent) => {
              e.stopPropagation()
              if (confirm(`Delete “${t.name}”? This cannot be undone.`)) deleteTournament(t.id)
            }
            return (
              <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/t/${t.id}`)}>
                <td style={{ fontWeight: 600 }}>
                  {t.name}
                  <div><span className={statusTag[t.status].cls} style={{ marginTop: 4 }}>{statusTag[t.status].label}</span></div>
                </td>
                <td className="muted">{t.game || '—'}</td>
                <td className="muted">{t.organizer || '—'}</td>
                <td className="muted">{FORMAT_LABELS[t.settings.format]}{t.settings.format === 'round_robin' && t.settings.groupCount > 1 ? ` · ${t.settings.groupCount} brackets` : ''}{t.settings.groupStage ? ' → playoff' : ''}</td>
                <td className="num record">{t.participants.length}</td>
                <td className="muted">{fmtCreated(t.createdAt)}</td>
                <td style={{ minWidth: 130 }}>
                  <div className="pbar"><div className="pbar-fill" style={{ width: `${p.pct}%` }} /></div>
                  <span className="dim" style={{ fontSize: 11 }}>{p.total ? `${p.done}/${p.total} · ${p.pct}%` : 'Not started'}</span>
                </td>
                {organizer && (
                  <td><button className="icon-btn danger" onClick={remove} title="Delete tournament"><IconTrash size={15} /></button></td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TournamentCard({ t, organizer }: { t: Tournament; organizer: boolean }) {
  const st = statusTag[t.status]
  const p = progressOf(t)
  const date = fmtDate(t.date)
  const remove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete “${t.name}”? This cannot be undone.`)) deleteTournament(t.id)
  }
  return (
    <div className="tcard" onClick={() => navigate(`/t/${t.id}`)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div className="t-name">{t.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={st.cls}>{st.label}</span>
          {organizer && <button className="icon-btn danger" onClick={remove} title="Delete tournament"><IconTrash size={15} /></button>}
        </div>
      </div>
      <div className="t-meta">
        {FORMAT_LABELS[t.settings.format]}
        {t.game ? ` · ${t.game}` : ''} · {t.participants.length} participants
        {t.organizer ? ` · ${t.organizer}` : ''}
      </div>
      <div className="tags" style={{ marginTop: 14 }}>
        {date && <span className="tag"><IconClock size={12} /> {date}</span>}
        <span className="tag">{p.total > 0 ? `${p.done}/${p.total} · ${p.pct}%` : 'Not started'}</span>
        {t.settings.format === 'round_robin' && t.settings.groupCount > 1 && <span className="tag">{t.settings.groupCount} brackets</span>}
        {t.settings.groupStage && <span className="tag">→ Playoff</span>}
      </div>
    </div>
  )
}
