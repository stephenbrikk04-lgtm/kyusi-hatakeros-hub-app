import { useState } from 'react'
import { RANK_LABELS, RankCriterion } from '../types'
import { IconUp, IconDown, IconPlus, IconTrash } from './Icons'

const ALL: RankCriterion[] = ['match_wins', 'score', 'score_diff', 'points', 'buchholz', 'head_to_head', 'tb']

// Controlled editor for the ranking priority: drag-and-drop to reorder (with up/down fallback)
// and enable/disable each criterion.
export default function RankOrderEditor({
  order, onChange,
}: {
  order: RankCriterion[]
  onChange: (next: RankCriterion[]) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const reorder = (from: number, to: number) => {
    if (from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }
  const remove = (c: RankCriterion) => onChange(order.filter((x) => x !== c))
  const add = (c: RankCriterion) => onChange([...order, c])
  const disabled = ALL.filter((c) => !order.includes(c))

  return (
    <div>
      <div className="hint" style={{ marginBottom: 10 }}>
        Drag to reorder (or use the arrows). Standings sort by these, top to bottom.
      </div>
      <div className="seed-list">
        {order.map((c, i) => (
          <div
            key={c}
            className={`seed-item rank-row ${drag === i ? 'dragging' : ''} ${over === i ? 'drag-over' : ''}`}
            draggable
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { e.preventDefault(); if (over !== i) setOver(i) }}
            onDrop={(e) => { e.preventDefault(); if (drag !== null) reorder(drag, i); setDrag(null); setOver(null) }}
            onDragEnd={() => { setDrag(null); setOver(null) }}
          >
            <span className="grip" title="Drag to reorder">⠿</span>
            <span className="s-num">{i + 1}</span>
            <span className="s-name">
              {RANK_LABELS[c].long} <span className="dim" style={{ fontWeight: 500 }}>· {RANK_LABELS[c].short}</span>
            </span>
            <div className="s-actions">
              <button className="icon-btn" onClick={() => move(i, -1)} title="Up"><IconUp size={15} /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} title="Down"><IconDown size={15} /></button>
              <button className="icon-btn danger" onClick={() => remove(c)} title="Disable"><IconTrash size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {disabled.length > 0 && (
        <>
          <div className="hint" style={{ margin: '14px 0 8px' }}>Disabled criteria</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {disabled.map((c) => (
              <button key={c} className="btn sm" onClick={() => add(c)}>
                <IconPlus size={13} /> {RANK_LABELS[c].long}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
