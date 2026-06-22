import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { SqlAlchemyPayload } from '../engine/protocol'
import { loadLayout, saveLayout, type Layout } from '../engine/erdLayout'

interface Edge {
  key: string
  d: string
}

const COLW = 250
const GAP = 24
const PAD = 12

/** Visualização do schema SQLAlchemy: ERD com tabelas arrastáveis e linhas FK→PK. */
export function SqlAlchemyView({ schema }: { schema: SqlAlchemyPayload }): JSX.Element {
  const signature = schema.tables.map((t) => t.name).sort().join('|')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const boxEls = useRef<Map<string, HTMLElement>>(new Map())
  const colEls = useRef<Map<string, HTMLElement>>(new Map())

  const [positions, setPositions] = useState<Layout>({})
  const positionsRef = useRef<Layout>(positions)
  positionsRef.current = positions
  const [laidOut, setLaidOut] = useState(false)
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ w: 600, h: 260 })
  const [dragName, setDragName] = useState<string | null>(null)

  // --- auto-layout (empacotamento por colunas) usando alturas medidas ---
  const autoLayout = useCallback(
    (useSaved: boolean) => {
      const saved = useSaved ? loadLayout(signature) : {}
      const avail = (scrollRef.current?.clientWidth ?? 700) - PAD
      const ncols = Math.max(1, Math.floor(avail / (COLW + GAP)))
      const colH = new Array(ncols).fill(PAD)
      const next: Layout = {}
      for (const t of schema.tables) {
        if (saved[t.name]) {
          next[t.name] = saved[t.name]
          continue
        }
        let ci = 0
        for (let k = 1; k < ncols; k++) if (colH[k] < colH[ci]) ci = k
        next[t.name] = { x: PAD + ci * (COLW + GAP), y: colH[ci] }
        colH[ci] += (boxEls.current.get(t.name)?.offsetHeight ?? 150) + GAP
      }
      setPositions(next)
      saveLayout(signature, next)
      setLaidOut(true)
    },
    [schema, signature]
  )

  useLayoutEffect(() => autoLayout(true), [autoLayout])

  // --- medição das linhas + tamanho do canvas ---
  const measure = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const c = canvas.getBoundingClientRect()
    const midY = (el: HTMLElement): number => {
      const r = el.getBoundingClientRect()
      return (r.top + r.bottom) / 2 - c.top
    }
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return { left: r.left - c.left, right: r.right - c.left, cx: (r.left + r.right) / 2 - c.left }
    }

    const next: Edge[] = []
    schema.relationships.forEach((r, i) => {
      const sb = boxEls.current.get(r.from_table)
      const tb = boxEls.current.get(r.to_table)
      const sc = colEls.current.get(`${r.from_table}.${r.from_col}`)
      const tc = colEls.current.get(`${r.to_table}.${r.to_col}`)
      if (!sb || !tb || !sc || !tc) return
      const SB = box(sb)
      const TB = box(tb)
      const y1 = midY(sc)
      const y2 = midY(tc)
      if (r.from_table === r.to_table) {
        const x = SB.right
        next.push({ key: `${i}`, d: `M ${x} ${y1} C ${x + 54} ${y1}, ${x + 54} ${y2}, ${x} ${y2}` })
        return
      }
      const exitRight = TB.cx >= SB.cx
      const x1 = exitRight ? SB.right : SB.left
      const x2 = exitRight ? TB.left : TB.right
      const dx = exitRight ? 40 : -40
      next.push({ key: `${i}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` })
    })
    setEdges(next)

    let maxR = 0
    let maxB = 0
    boxEls.current.forEach((el) => {
      maxR = Math.max(maxR, el.offsetLeft + el.offsetWidth)
      maxB = Math.max(maxB, el.offsetTop + el.offsetHeight)
    })
    if (maxR && maxB) {
      const w = maxR + 24
      const h = maxB + 24
      setSize((s) => (s.w !== w || s.h !== h ? { w, h } : s))
    }
  }, [schema])

  // re-mede quando as posições mudam (drag/auto-layout)
  useLayoutEffect(() => measure(), [positions, measure])

  // re-mede em frame seguinte, ao carregar fontes e no resize da janela
  useLayoutEffect(() => {
    let raf = 0
    const schedule = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts
    fonts?.ready?.then(schedule).catch(() => {})
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
    }
  }, [measure])

  // --- drag das boxes pelo cabeçalho ---
  const dragRef = useRef<{ table: string; sx: number; sy: number; ox: number; oy: number } | null>(
    null
  )
  const onMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const x = Math.max(0, d.ox + (e.clientX - d.sx))
    const y = Math.max(0, d.oy + (e.clientY - d.sy))
    setPositions((p) => ({ ...p, [d.table]: { x, y } }))
  }, [])
  const onUp = useCallback(() => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    dragRef.current = null
    setDragName(null)
    saveLayout(signature, positionsRef.current)
  }, [onMove, signature])
  const onHeaderDown = (table: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const p = positions[table] ?? { x: 0, y: 0 }
    dragRef.current = { table, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y }
    setDragName(table)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
        <button className="sa__reset" title="Reorganizar automaticamente" onClick={() => autoLayout(false)}>
          ↺ auto
        </button>
      </div>

      <div className="sa__scroll" ref={scrollRef}>
        <div
          className="sa__canvas"
          ref={canvasRef}
          style={{ width: size.w, height: size.h, visibility: laidOut ? 'visible' : 'hidden' }}
        >
          <svg className="sa__edges" width={size.w} height={size.h}>
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
              <path key={e.key} d={e.d} className="sa-edge" markerEnd="url(#sa-arrow)" />
            ))}
          </svg>

          {schema.tables.map((t) => {
            const p = positions[t.name]
            return (
              <div
                key={t.name}
                ref={setBox(t.name)}
                className={`sa-table${dragName === t.name ? ' sa-table--drag' : ''}`}
                style={{ left: p?.x ?? 0, top: p?.y ?? 0 }}
              >
                <div className="sa-table__name" onMouseDown={onHeaderDown(t.name)}>
                  {t.name}
                </div>
                <div className="sa-table__cols">
                  {t.columns.map((col) => (
                    <div
                      key={col.name}
                      className="sa-col"
                      title={col.type}
                      ref={setCol(`${t.name}.${col.name}`)}
                    >
                      <span className="sa-col__key">{col.pk ? '🔑' : col.fk ? '🔗' : ''}</span>
                      <span className={`sa-col__name${col.pk ? ' sa-col__name--pk' : ''}`}>
                        {col.name}
                      </span>
                      <span className="sa-col__type">{col.type}</span>
                      <span className="sa-col__flags">
                        {col.unique && <span className="sa-flag sa-flag--u">U</span>}
                        {!col.nullable && <span className="sa-flag sa-flag--nn">NN</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
