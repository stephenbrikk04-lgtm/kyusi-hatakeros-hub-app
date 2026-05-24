import { useState } from 'react'
import { Tournament } from '../types'
import {
  addParticipant, removeParticipant, reorderParticipant, shuffleSeeds, renameParticipant,
  setParticipantStaff, setParticipantPaid, setParticipantBounty,
} from '../store/store'
import { isBountyClaimed } from '../engine/standings'
import { IconUp, IconDown, IconTrash, IconShuffle, IconPlus } from './Icons'

export default function SeedList({ t }: { t: Tournament }) {
  const [name, setName] = useState('')
  const editable = t.status === 'setup'
  const sorted = [...t.participants].sort((a, b) => a.seed - b.seed)

  const add = () => {
    if (!name.trim()) return
    addParticipant(t.id, name)
    setName('')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Participants <span className="dim" style={{ fontWeight: 500 }}>· {sorted.length}</span></h3>
        {editable && (
          <button className="btn sm" onClick={() => shuffleSeeds(t.id)}><IconShuffle size={13} /> Shuffle names</button>
        )}
      </div>
      <div className="panel-body">
        {editable && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input className="input" value={name} placeholder="Add participant…"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn primary" onClick={add}><IconPlus size={15} /></button>
          </div>
        )}
        <div className="seed-list">
          {sorted.map((p) => (
            <div className="seed-item p-item" key={p.id}>
              <div className="p-top">
                <span className="s-num">{p.seed}</span>
                <input className="s-name-input" defaultValue={p.name} key={p.id + p.name}
                  title="Click to rename (allowed anytime)"
                  onBlur={(e) => renameParticipant(t.id, p.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                {editable && (
                  <div className="s-actions">
                    <button className="icon-btn" onClick={() => reorderParticipant(t.id, p.id, -1)} title="Move up"><IconUp size={15} /></button>
                    <button className="icon-btn" onClick={() => reorderParticipant(t.id, p.id, 1)} title="Move down"><IconDown size={15} /></button>
                    <button className="icon-btn danger" onClick={() => removeParticipant(t.id, p.id)} title="Remove"><IconTrash size={15} /></button>
                  </div>
                )}
              </div>
              <div className="p-meta">
                <select className="p-role" value={p.staff ?? 'player'}
                  onChange={(e) => setParticipantStaff(t.id, p.id, e.target.value === 'player' ? null : e.target.value as 'judge' | 'organizer')}>
                  <option value="player">Player</option>
                  <option value="judge">Judge</option>
                  <option value="organizer">Organizer</option>
                </select>
                {!p.staff ? (
                  <label className="check p-paid">
                    <input type="checkbox" checked={!!p.paid} onChange={(e) => setParticipantPaid(t.id, p.id, e.target.checked)} />
                    <span>{p.paid ? 'Paid' : 'Unpaid'}</span>
                  </label>
                ) : (
                  <span className="tag accent" style={{ fontSize: 11 }}>{p.staff === 'judge' ? 'Judge' : 'Organizer'}</span>
                )}
                <label className="check p-paid">
                  <input type="checkbox" checked={!!p.bounty} onChange={(e) => setParticipantBounty(t.id, p.id, e.target.checked)} />
                  <span>Bounty</span>
                </label>
                {p.bounty && (
                  <span className={`p-badge ${isBountyClaimed(p.id, t.matches) ? 'bounty-claimed' : 'bounty'}`}>
                    {isBountyClaimed(p.id, t.matches) ? 'Bounty Claimed' : 'Bounty'}
                  </span>
                )}
              </div>
            </div>
          ))}
          {sorted.length === 0 && <div className="dim" style={{ padding: 12 }}>No participants yet.</div>}
        </div>
        {!editable && <div className="hint" style={{ marginTop: 14 }}>Seeding is locked once a tournament starts — but you can still rename, set roles and paid status.</div>}
      </div>
    </div>
  )
}
