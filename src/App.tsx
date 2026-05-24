import { useEffect, useState } from 'react'
import { useRoute, navigate } from './router'
import { useMode, useTournaments, toggleMode, useRole, useAuthed, logout } from './store/store'
import {
  IconGrid, IconTrophy, IconChart, IconPlus, IconMoon, IconSun, IconExpand, IconShield, IconEye,
} from './components/Icons'
import Dashboard from './pages/Dashboard'
import CreateTournament from './pages/CreateTournament'
import TournamentView from './pages/TournamentView'
import Leaderboards from './pages/Leaderboards'
import Logo from './components/Logo'
import LoginModal from './components/LoginModal'
import { backendEnabled, apiGet } from './backend'
import { upsertFromBackend } from './store/store'

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

export default function App() {
  const route = useRoute()
  const mode = useMode()
  const role = useRole()
  const authed = useAuthed()
  const tournaments = useTournaments()
  const [fs, toggleFs] = useFullscreen()
  const [showLogin, setShowLogin] = useState(false)
  const organizer = role === 'organizer'

  // a shared live link opens a spectator (view-only) page with no chrome
  if (route.name === 'live') return <LiveView id={route.id} />

  const active = route.name

  return (
    <div className="shell">
      <aside className="side">
        <button className="brand" onClick={() => navigate('/')}>
          <Logo />
          <div className="brand-text">
            <b>Kyusi Hatakeros</b>
            <span>Tournament Hub</span>
          </div>
        </button>

        <button className={`nav ${active === 'dashboard' ? 'on' : ''}`} onClick={() => navigate('/')}>
          <IconGrid /> Dashboard
        </button>
        <button className={`nav ${active === 'tournament' ? 'on' : ''}`} onClick={() => navigate('/')}>
          <IconTrophy /> Tournaments <span className="count">{tournaments.length}</span>
        </button>
        {tournaments.some((t) => t.settings.format === 'round_robin' || t.settings.format === 'swiss') && (
          <button className={`nav ${active === 'leaderboards' ? 'on' : ''}`} onClick={() => navigate('/leaderboards')}>
            <IconChart /> Leaderboards
          </button>
        )}

        {organizer && (
          <>
            <div className="nav-group">Organize</div>
            <button className="nav" onClick={() => navigate('/new')}>
              <IconPlus /> New Tournament
            </button>
          </>
        )}

        <div className="side-foot">
          {authed ? (
            <>
              <div className="auth-chip"><IconShield size={14} /> Organizer</div>
              <button className="mode-btn" onClick={logout}><IconEye /> Log out</button>
            </>
          ) : (
            <button className="mode-btn" onClick={() => setShowLogin(true)}><IconShield /> Organizer login</button>
          )}
          <button className="mode-btn" onClick={toggleFs}>
            <IconExpand /> {fs ? 'Exit full screen' : 'Full screen'}
          </button>
          <button className="mode-btn" onClick={toggleMode}>
            {mode === 'dark' ? <IconMoon /> : <IconSun />}
            {mode === 'dark' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="container">
          {route.name === 'dashboard' && <Dashboard />}
          {route.name === 'new' && (organizer ? <CreateTournament /> : <ViewerBlock onLogin={() => setShowLogin(true)} />)}
          {route.name === 'leaderboards' && <Leaderboards />}
          {route.name === 'tournament' && <TournamentView id={route.id} />}
        </div>
      </main>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

// Spectator page opened from a shared live link — polls the backend (when configured) so it
// updates in near-real-time across devices; read-only.
function LiveView({ id }: { id: string }) {
  useEffect(() => {
    if (!backendEnabled()) return
    let stop = false
    const poll = async () => { const t = await apiGet(id); if (t && !stop) upsertFromBackend(t) }
    poll()
    const iv = setInterval(poll, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [id])
  return (
    <div className="shell live-shell">
      <main className="main">
        <div className="container">
          <div className="live-bar">
            <Logo size={26} />
            <b>Kyusi Hatakeros Tournament Hub</b>
            <span className="tag live" style={{ marginLeft: 'auto' }}>Live · spectator</span>
          </div>
          <TournamentView id={id} viewerOnly />
        </div>
      </main>
    </div>
  )
}

function ViewerBlock({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="empty">
      <div className="ico"><IconEye size={40} /></div>
      <h2>Viewer mode</h2>
      <p>Sign in as organizer to create or edit tournaments.</p>
      <button className="btn primary" style={{ marginTop: 16 }} onClick={onLogin}>Organizer login</button>
    </div>
  )
}
