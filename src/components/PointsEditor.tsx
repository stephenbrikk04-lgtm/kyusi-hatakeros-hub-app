import { PointsConfig } from '../types'

const FIELDS: { key: keyof PointsConfig; label: string; hint?: string }[] = [
  { key: 'matchWin', label: 'Points per match win' },
  { key: 'matchTie', label: 'Points per match tie' },
  { key: 'matchLoss', label: 'Points per match loss' },
  { key: 'gameWin', label: 'Points per game won', hint: 'Added per game/set won within a match' },
]

export default function PointsEditor({
  points, onChange, disabled,
}: {
  points: PointsConfig
  onChange: (patch: Partial<PointsConfig>) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {FIELDS.map((f) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
            {f.hint && <div className="hint" style={{ marginTop: 2 }}>{f.hint}</div>}
          </div>
          <input
            className="input" type="number" step="0.5" disabled={disabled}
            style={{ width: 90, textAlign: 'center', fontWeight: 700 }}
            value={points[f.key]}
            onChange={(e) => onChange({ [f.key]: Number(e.target.value) } as Partial<PointsConfig>)}
          />
        </div>
      ))}
    </div>
  )
}
