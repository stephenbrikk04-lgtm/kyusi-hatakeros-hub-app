import { useEffect, useState } from 'react'
import { useRoute, navigate } from './router'
import { useMode, useTournaments, toggleMode, useRole, useAuthed, logout, upsertFromBackend, syncFromServer, useFailedOver } from './store/store'
import {
  IconGrid, IconTrophy, IconChart, IconPlus, IconMoon, IconSun, IconShield, IconEye, IconMenu, IconClose,
} from './components/Icons'
import Dashboard from './pages/Dashboard'
import CreateTournament from './pages/CreateTournament'
import TournamentView from './pages/TournamentView'
import Leaderboards from './pages/Leaderboards'
import Logo from './components/Logo'
import LoginModal from './components/LoginModal'
import { backendEnabled, apiGet } from './backend'

export default function App() {
  const route = useRoute()
  const mode = useMode()
  const role = useRole()
  const authed = useAuthed()
  const failedOver = useFailedOver()
  const tournaments = useTournaments()
  const [showLogin, setShowLogin] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const organizer = role === 'organizer'
  const hasRanking = tournaments.some((t) => t.settings.format === 'round_robin' || t.settings.format === 'swiss')

  useEffect(() => { setDrawer(false) }, [route]) // close the mobile drawer on navigation

  // Keep the dashboard in sync with the cloud so every device shows the same tournaments.
  useEffect(() => {
    syncFromServer()
    const iv = setInterval(syncFromServer, 12000)
    return () => clearInterval(iv)
  }, [])

  // a shared live link opens a spectator (view-only) page with no chrome
  if (route.name === 'live') return <LiveView id={route.id} />

  const active = route.name
  const go = (path: string) => { navigate(path); setDrawer(false) }
  const ModeIcon = mode === 'dark' ? IconSun : IconMoon

  const nav = (
    <>
      <button className="brand" onClick={() => go('/')}>
        <Logo />
        <div className="brand-text"><b>Kyusi Hatakeros</b><span>Tournament Hub</span></div>
      </button>

      <nav className="nav-list">
        <button className={`nav ${active === 'dashboard' || active === 'tournament' ? 'on' : ''}`} onClick={() => go('/')}>
          <IconTrophy /> <span>Tournaments</span> <span className="count">{tournaments.length}</span>
        </button>
        {hasRanking && (
          <button className={`nav ${active === 'leaderboards' ? 'on' : ''}`} onClick={() => go('/leaderboards')}>
            <IconChart /> <span>Leaderboards</span>
          </button>
        )}
        {organizer && (
          <>
            <div className="nav-group">Organize</div>
            <button className={`nav ${active === 'new' ? 'on' : ''}`} onClick={() => go('/new')}>
              <IconPlus /> <span>New Tournament</span>
            </button>
          </>
        )}
      </nav>

      <div className="side-foot">
        {authed ? (
          <>
            <div className="auth-chip"><IconShield size={14} /> Organizer</div>
            <button className="foot-btn" onClick={() => { logout(); setDrawer(false) }}><IconEye /> Log out</button>
          </>
        ) : (
          <button className="foot-btn" onClick={() => { setShowLogin(true); setDrawer(false) }}><IconShield /> Organizer login</button>
        )}
        <button className="foot-btn" onClick={toggleMode}>
          <ModeIcon /> {mode === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="credit">Created By: T2. Fugazi</div>
      </div>
    </>
  )

  return (
    <div className="shell">
      {/* mobile top bar */}
      <header className="topbar">
        <button className="icon-btn lg" onClick={() => setDrawer(true)} aria-label="Menu"><IconMenu /></button>
        <button className="topbar-brand" onClick={() => go('/')}>
          <Logo size={30} /><b>Kyusi Hatakeros</b>
        </button>
        <button className="icon-btn lg" onClick={toggleMode} aria-label="Toggle theme"><ModeIcon /></button>
      </header>

      <aside className={`side ${drawer ? 'open' : ''}`}>
        <button className="drawer-close icon-btn lg" onClick={() => setDrawer(false)} aria-label="Close"><IconClose /></button>
        {nav}
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <div className="container">
          {failedOver && (
            <div className="banner" style={{ marginBottom: 16 }}>
              <span>⚠ Main server unreachable — running on the <b>backup</b>. Your data is safe and will sync back automatically.{!authed && ' Organizers: log in again to keep editing.'}</span>
              {!authed && <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => setShowLogin(true)}>Log in</button>}
            </div>
          )}
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

// Spectator page opened from a shared live link — polls the backend so it updates across devices.
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
    <div className="live-shell">
      <div className="container">
        <div className="live-bar">
          <Logo size={28} />
          <b>Kyusi Hatakeros Tournament Hub</b>
          <span className="tag live" style={{ marginLeft: 'auto' }}>Live</span>
          <button className="icon-btn" onClick={toggleMode} aria-label="Toggle theme"><ThemeGlyph /></button>
        </div>
        <TournamentView id={id} viewerOnly />
      </div>
    </div>
  )
}

function ThemeGlyph() {
  const mode = useMode()
  return mode === 'dark' ? <IconSun /> : <IconMoon />
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
