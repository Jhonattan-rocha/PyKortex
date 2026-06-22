import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { SqlAlchemyPayload, SaTable } from '../engine/protocol'

interface Edge {
  key: string
  d: string
  ex: number // ponto final (seta), x
  ey: number // ponto final (seta), y
}

/** Visualização do schema SQLAlchemy: ERD com tabelas e linhas FK→PK. */
export function SqlAlchemyView({ schema }: { schema: SqlAlchemyPayload }): JSX.Element {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const boxEls = useRef<Map<string, HTMLElement>>(new Map())
  const colEls = useRef<Map<string, HTMLElement>>(new Map())
  const [edges, setEdges] = useState<Edge[]>([])

  const measure = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getBoundingClientRect()
    const rel = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return {
        left: r.left - c.left + canvas.scrollLeft,
        right: r.right - c.left + canvas.scrollLeft,
        cx: (r.left + r.right) / 2 - c.left + canvas.scrollLeft,
        cy: (r.top + r.bottom) / 2 - c.top + canvas.scrollTop
      }
    }

    const next: Edge[] = []
    schema.relationships.forEach((r, i) => {
      const sb = boxEls.current.get(r.from_table)
      const tb = boxEls.current.get(r.to_table)
      const sc = colEls.current.get(`${r.from_table}.${r.from_col}`)
      const tc = colEls.current.get(`${r.to_table}.${r.to_col}`)
      if (!sb || !tb || !sc || !tc) return

      const SB = rel(sb)
      const TB = rel(tb)
      const y1 = rel(sc).cy
      const y2 = rel(tc).cy

      if (r.from_table === r.to_table) {
        // FK para a própria tabela: alça à direita
        const x = SB.right
        next.push({
          key: `${i}`,
          d: `M ${x} ${y1} C ${x + 54} ${y1}, ${x + 54} ${y2}, ${x} ${y2}`,
          ex: x,
          ey: y2
        })
        return
      }

      const exitRight = TB.cx >= SB.cx
      const x1 = exitRight ? SB.right : SB.left
      const x2 = exitRight ? TB.left : TB.right
      const dx = exitRight ? 40 : -40
      next.push({
        key: `${i}`,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        ex: x2,
        ey: y2
      })
    })
    setEdges(next)
  }, [schema])

  // mede após o layout e re-mede quando o canvas muda de tamanho (wrap)
  useLayoutEffect(() => {
    measure()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [measure])

  const setBox = (name: string) => (el: HTMLElement | null) => {
    if (el) boxEls.current.set(name, el)
    else boxEls.current.delete(name)
  }
  const setCol = (key: string) => (el: HTMLElement | null) => {
    if (el) colEls.current.set(key, el)
    else colEls.current.delete(key)
  }

  return (
    <div className="sa">
      <div className="sa__head">
        <span className="sa__title">Schema</span>
        <span className="sa__count">
          {schema.count} tabela{schema.count === 1 ? '' : 's'} · {schema.relationships.length} relaç
          {schema.relationships.length === 1 ? 'ão' : 'ões'}
        </span>
      </div>

      <div className="sa__canvas" ref={canvasRef}>
        <svg className="sa__edges">
          <defs>
            <marker
              id="sa-arrow"
              viewBox="0 0 8 8"
              refX="6"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
            </marker>
          </defs>
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              className="sa-edge"
              markerEnd="url(#sa-arrow)"
            />
          ))}
        </svg>

        {schema.tables.map((t) => (
          <TableBox key={t.name} table={t} setBox={setBox} setCol={setCol} />
        ))}
      </div>
    </div>
  )
}

function TableBox({
  table,
  setBox,
  setCol
}: {
  table: SaTable
  setBox: (name: string) => (el: HTMLElement | null) => void
  setCol: (key: string) => (el: HTMLElement | null) => void
}): JSX.Element {
  return (
    <div className="sa-table" ref={setBox(table.name)}>
      <div className="sa-table__name">{table.name}</div>
      <div className="sa-table__cols">
        {table.columns.map((c) => (
          <div key={c.name} className="sa-col" title={c.type} ref={setCol(`${table.name}.${c.name}`)}>
            <span className="sa-col__key">{c.pk ? '🔑' : c.fk ? '🔗' : ''}</span>
            <span className={`sa-col__name${c.pk ? ' sa-col__name--pk' : ''}`}>{c.name}</span>
            <span className="sa-col__type">{c.type}</span>
            <span className="sa-col__flags">
              {c.unique && <span className="sa-flag sa-flag--u">U</span>}
              {!c.nullable && <span className="sa-flag sa-flag--nn">NN</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
