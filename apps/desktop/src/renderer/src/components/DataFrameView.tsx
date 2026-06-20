import { useEffect, useRef, useState } from 'react'
import type { DataFramePayload, DfRow } from '../engine/protocol'

const ROW_H = 24 // altura fixa de linha (px) — base da virtualização
const BLOCK = 100 // tamanho do bloco buscado por vez
const VIEWPORT_H = 360 // altura da área de scroll
const OVERSCAN = 10 // linhas extras renderizadas (absorve o header sticky)
const IDX_W = 64
const COL_W = 140

/**
 * Grade de DataFrame virtualizada: só renderiza a janela visível e busca os
 * blocos de linhas sob demanda (via fetchPage, por handle). Suporta milhões de
 * linhas sem travar.
 */
type Sort = { col: string; dir: 'asc' | 'desc' } | null

export function DataFrameView({
  df,
  fetchPage
}: {
  df: DataFramePayload
  fetchPage: (handle: string, start: number, end: number, sort?: Sort) => Promise<DfRow[]>
}): JSX.Element {
  const [total, ncols] = df.shape
  const [cache, setCache] = useState<Map<number, DfRow>>(() => {
    const m = new Map<number, DfRow>()
    df.rows.forEach((r, i) => m.set(i, r)) // semeia com a janela inicial
    return m
  })
  const loaded = useRef<Set<number>>(new Set([0])) // bloco 0 veio no payload
  const loading = useRef<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [sort, setSort] = useState<Sort>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // ao mudar o sort: limpa caches e volta ao topo (a janela é re-buscada ordenada)
  const firstReset = useRef(true)
  useEffect(() => {
    loading.current = new Set()
    if (sort === null) {
      const m = new Map<number, DfRow>()
      df.rows.forEach((r, i) => m.set(i, r))
      setCache(m)
      loaded.current = new Set([0])
    } else {
      setCache(new Map())
      loaded.current = new Set()
    }
    if (!firstReset.current && scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
    firstReset.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(total, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN)

  useEffect(() => {
    for (let b = Math.floor(first / BLOCK) * BLOCK; b < last; b += BLOCK) {
      if (loaded.current.has(b) || loading.current.has(b)) continue
      loading.current.add(b)
      void fetchPage(df.handle, b, Math.min(b + BLOCK, total), sort).then((rows) => {
        loading.current.delete(b)
        loaded.current.add(b)
        setCache((prev) => {
          const next = new Map(prev)
          rows.forEach((r, i) => next.set(b + i, r))
          return next
        })
      })
    }
  }, [first, last, df.handle, total, fetchPage, sort])

  const cycleSort = (col: string): void =>
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: 'asc' }
      if (cur.dir === 'asc') return { col, dir: 'desc' }
      return null
    })

  const visible: number[] = []
  for (let i = first; i < last; i++) visible.push(i)

  return (
    <div className="df">
      <div className="df__meta">
        <strong>{total.toLocaleString('pt-BR')}</strong> linhas ×{' '}
        <strong>{ncols.toLocaleString('pt-BR')}</strong> colunas
        {total > df.shown && <span className="df__trunc"> · role para carregar</span>}
      </div>
      <div
        ref={scrollRef}
        className="df__scroll"
        style={{ height: VIEWPORT_H }}
        onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
      >
        <table className="df__table" style={{ width: IDX_W + ncols * COL_W, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: IDX_W }} />
            {df.columns.map((_, i) => (
              <col key={i} style={{ width: COL_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="df__idx">{df.index_name ?? ''}</th>
              {df.columns.map((c, i) => {
                const arrow = sort?.col === c.name ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''
                return (
                  <th
                    key={i}
                    className="df__th--sortable"
                    title={`${c.name} · ${c.dtype} (clique para ordenar)`}
                    onClick={() => cycleSort(c.name)}
                  >
                    <div className="df__col">
                      {c.name}
                      <span className="df__arrow">{arrow}</span>
                    </div>
                    <div className="df__dtype">{c.dtype}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden style={{ height: first * ROW_H }}>
              <td colSpan={ncols + 1} className="df__spacer" />
            </tr>
            {visible.map((i) => {
              const row = cache.get(i)
              return (
                <tr key={i}>
                  <td className="df__idx">{row ? fmt(row.index) : i}</td>
                  {row
                    ? row.values.map((v, ci) => (
                        <td key={ci} className={cellClass(v)} title={fmt(v)}>
                          {fmt(v)}
                        </td>
                      ))
                    : df.columns.map((_, ci) => (
                        <td key={ci} className="df__cell df__loading">
                          ⋯
                        </td>
                      ))}
                </tr>
              )
            })}
            <tr aria-hidden style={{ height: (total - last) * ROW_H }}>
              <td colSpan={ncols + 1} className="df__spacer" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'NaN'
  return String(v)
}

function cellClass(v: unknown): string {
  if (v === null || v === undefined) return 'df__cell df__na'
  if (typeof v === 'number') return 'df__cell df__num'
  if (typeof v === 'boolean') return 'df__cell df__bool'
  return 'df__cell'
}
