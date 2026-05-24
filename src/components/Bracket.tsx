import { useLayoutEffect, useRef, useState } from 'react'
import { Match, Participant } from '../types'

type NameMap = Map<string, Participant>

function slotName(id: string | null, names: NameMap, fed: boolean): { text: string; tbd: boolean } {
  if (id) return { text: names.get(id)?.name ?? 'Unknown', tbd: false }
  return { text: fed ? 'TBD' : 'Bye', tbd: true }
}

function MatchCard({
  m, names, fedA, fedB, onPick, editable, byeEditable, claimed, onPlay,
}: {
  m: Match; names: NameMap; fedA: boolean; fedB: boolean
  onPick: (m: Match) => void; editable: boolean; byeEditable: boolean
  claimed: Set<string>; onPlay?: (m: Match) => void
}) {
  const a = slotName(m.a.participantId, names, fedA)
  const b = slotName(m.b.participantId, names, fedB)
  const aWin = m.state === 'done' && m.winnerId && m.winnerId === m.a.participantId
  const bWin = m.state === 'done' && m.winnerId && m.winnerId === m.b.participantId
  const aLose = m.state === 'done' && m.winnerId && m.winnerId !== m.a.participantId && !!m.a.participantId
  const bLose = m.state === 'done' && m.winnerId && m.winnerId !== m.b.participantId && !!m.b.participantId
  const tie = m.state === 'done' && !m.winnerId && !m.isBye && !!m.a.participantId && !!m.b.participantId

  const hasOne = !!m.a.participantId || !!m.b.participantId
  // byes are scorable in any format (organizer only); byeEditable kept for back-compat
  const canScore = editable && (m.isBye ? hasOne : !!m.a.participantId && !!m.b.participantId)
  void byeEditable
  const live = !!m.live && m.state !== 'done'
  const canPlay = !!onPlay && editable && !m.isBye && m.state !== 'done' && !!m.a.participantId && !!m.b.participantId
  const cls = ['match', m.isBye ? 'bye' : '', m.state === 'done' ? 'done' : '', live ? 'live' : '',
    canScore ? 'clickable' : ''].filter(Boolean).join(' ')

  return (
    <div className={cls} data-mid={m.id} onClick={() => canScore && onPick(m)}
      title={canScore ? (m.isBye ? 'Click to set bye score' : 'Click to enter score') : ''}>
      <div className={`slot ${aWin ? 'win' : ''} ${aLose ? 'lose' : ''}`}>
        <span className="seed">{m.a.participantId ? seedOf(m.a.participantId, names) : ''}</span>
        <span className={`pname ${a.tbd ? 'tbd' : ''}`}>{a.text}</span>
        {!a.tbd && <PartTag id={m.a.participantId} names={names} claimed={claimed} />}
        <span className="score">{m.state === 'done' || m.reported ? m.a.score : '–'}</span>
      </div>
      <div className={`slot ${bWin ? 'win' : ''} ${bLose ? 'lose' : ''}`}>
        <span className="seed">{m.b.participantId ? seedOf(m.b.participantId, names) : ''}</span>
        <span className={`pname ${b.tbd ? 'tbd' : ''}`}>{b.text}</span>
        {!b.tbd && <PartTag id={m.b.participantId} names={names} claimed={claimed} />}
        <span className="score">{m.state === 'done' || m.reported ? m.b.score : '–'}</span>
      </div>
      {canPlay && (
        <button className={`play-btn ${live ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onPlay!(m) }}>
          {live ? '● Live — stop' : '▶ Play'}
        </button>
      )}
      {!canPlay && (m.isBye || tie || m.consolation || (m.label && m.bracket === 'grand_final')) && (
        <div className="match-foot">{m.isBye ? 'Bye' : tie ? 'Tie' : m.label}</div>
      )}
    </div>
  )
}

function seedOf(id: string, names: NameMap): number | string {
  return names.get(id)?.seed ?? ''
}

// staff label (judge/organizer) or a paid/unpaid dot, plus a bounty badge, beside the name
function PartTag({ id, names, claimed }: { id: string | null; names: NameMap; claimed: Set<string> }) {
  if (!id) return null
  const p = names.get(id)
  if (!p) return null
  return (
    <>
      {p.staff
        ? <span className={`p-badge ${p.staff}`}>{p.staff === 'judge' ? 'Judge' : 'Org'}</span>
        : <span className={`p-dot ${p.paid ? 'paid' : 'unpaid'}`} title={p.paid ? 'Paid' : 'Unpaid'} />}
      {p.bounty && (
        <span className={`p-badge ${claimed.has(id) ? 'bounty-claimed' : 'bounty'}`}>
          {claimed.has(id) ? 'Bounty Claimed' : 'Bounty'}
        </span>
      )}
    </>
  )
}

function Columns({
  matches, names, onPick, editable, byeEditable, claimed, onPlay,
}: {
  matches: Match[]; names: NameMap; onPick: (m: Match) => void; editable: boolean; byeEditable: boolean
  claimed: Set<string>; onPlay?: (m: Match) => void
}) {
  const bracketRef = useRef<HTMLDivElement>(null)
  const [conn, setConn] = useState<{ w: number; h: number; paths: string[] }>({ w: 0, h: 0, paths: [] })

  // draw connector lines from each match to its next-round target (winner link)
  useLayoutEffect(() => {
    const bracket = bracketRef.current
    if (!bracket) return
    const compute = () => {
      const bRect = bracket.getBoundingClientRect()
      const el = (id: string) => bracket.querySelector<HTMLElement>(`[data-mid="${id}"]`)
      const paths: string[] = []
      for (const m of matches) {
        if (!m.winnerToMatchId) continue
        const from = el(m.id), to = el(m.winnerToMatchId)
        if (!from || !to) continue // target is in another section (e.g. WB final → grand final)
        const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect()
        const x1 = fr.right - bRect.left, y1 = fr.top - bRect.top + fr.height / 2
        const x2 = tr.left - bRect.left, y2 = tr.top - bRect.top + tr.height / 2
        const mx = x1 + (x2 - x1) / 2
        paths.push(`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`)
      }
      setConn({ w: bracket.scrollWidth, h: bracket.scrollHeight, paths })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(bracket)
    window.addEventListener('resize', compute)
    return () => { ro.disconnect(); window.removeEventListener('resize', compute) }
  }, [matches])

  if (matches.length === 0) return null
  const fed = new Set<string>()
  for (const m of matches) {
    if (m.winnerToMatchId && m.winnerToSlot) fed.add(m.winnerToMatchId + ':' + m.winnerToSlot)
    if (m.loserToMatchId && m.loserToSlot) fed.add(m.loserToMatchId + ':' + m.loserToSlot)
  }
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  // sequential match index shown beside each match (Challonge-style)
  let n = 0
  const matchNo = new Map<string, number>()
  for (const r of rounds) {
    for (const m of matches.filter((x) => x.round === r).sort((a, b) => a.order - b.order)) matchNo.set(m.id, ++n)
  }
  return (
    <div className="bracket-wrap">
      <div className="bracket" ref={bracketRef}>
        {conn.paths.length > 0 && (
          <svg className="bracket-connectors" width={conn.w} height={conn.h} aria-hidden>
            {conn.paths.map((d, i) => <path key={i} d={d} />)}
          </svg>
        )}
        {rounds.map((r) => {
          const col = matches.filter((m) => m.round === r).sort((a, b) => a.order - b.order)
          return (
            <div className="round-col" key={r}>
              <div className="round-title">{col[0]?.label ?? `Round ${r}`}</div>
              {col.map((m) => (
                <div className="match-wrap" key={m.id}>
                  <span className="match-no">{matchNo.get(m.id)}</span>
                  <MatchCard m={m} names={names}
                    fedA={fed.has(m.id + ':a')} fedB={fed.has(m.id + ':b')}
                    onPick={onPick} editable={editable} byeEditable={byeEditable} claimed={claimed} onPlay={onPlay} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Bracket({
  matches, participants, onPick, editable, isDouble, byeEditable = false, claimed = EMPTY, onPlay,
}: {
  matches: Match[]; participants: Participant[]
  onPick: (m: Match) => void; editable: boolean; isDouble: boolean; byeEditable?: boolean
  claimed?: Set<string>; onPlay?: (m: Match) => void
}) {
  const names: NameMap = new Map(participants.map((p) => [p.id, p]))
  const cp = { claimed, onPlay }

  if (isDouble) {
    const wb = matches.filter((m) => m.bracket === 'winners')
    const lb = matches.filter((m) => m.bracket === 'losers')
    const gf = matches.filter((m) => m.bracket === 'grand_final')
    return (
      <>
        <div className="bracket-section-title">Winners Bracket</div>
        <Columns matches={wb} names={names} onPick={onPick} editable={editable} byeEditable={byeEditable} {...cp} />
        {lb.length > 0 && (
          <>
            <div className="bracket-section-title">Losers Bracket</div>
            <Columns matches={lb} names={names} onPick={onPick} editable={editable} byeEditable={byeEditable} {...cp} />
          </>
        )}
        <div className="bracket-section-title">Grand Final</div>
        <Columns matches={gf} names={names} onPick={onPick} editable={editable} byeEditable={byeEditable} {...cp} />
      </>
    )
  }

  return <Columns matches={matches} names={names} onPick={onPick} editable={editable} byeEditable={byeEditable} {...cp} />
}

const EMPTY: Set<string> = new Set()
