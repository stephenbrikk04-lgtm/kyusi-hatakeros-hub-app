import { useState } from 'react'
import { login } from '../store/store'
import { IconShield } from './Icons'

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(false)

  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    const ok = await login(user, pass)
    setBusy(false)
    if (ok) onClose()
    else setErr(true)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><IconShield size={16} /> Organizer login</h3>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>Sign in to create and manage tournaments.</div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Username</label>
            <input className="input" value={user} autoFocus autoCapitalize="off"
              onChange={(e) => { setUser(e.target.value); setErr(false) }}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={pass}
              onChange={(e) => { setPass(e.target.value); setErr(false) }}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          {err && <div className="hint" style={{ color: 'var(--danger)', marginTop: 10 }}>Incorrect username or password.</div>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  )
}
