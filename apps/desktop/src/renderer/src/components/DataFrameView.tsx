import { useEffect, useRef, useState } from 'react'
import type { DataFramePayload, DfPage, DfRow, DfSort, DfView } from '../engine/protocol'

const ROW_H = 24 // altura fixa de linha (px) — base da virtualização
const BLOCK = 100 // tamanho do bloco buscado por vez
const VIEWPORT_H = 360 // altura da área de scroll
const OVERSCAN = 10 // linhas extras renderizadas (absorve o header sticky)
const IDX_W = 64
const COL_W = 140

/**
 * Grade de DataFrame virtualizada com sort e filtros aplicados no kernel.
 * Só renderiza a janela visível e busca blocos de linhas sob demanda (por handle).
 */
export function DataFrameView({
  df,
  fetchPage
}: {
  df: DataFramePayload
  fetchPage: (handle: string, start: number, end: number, view?: DfView) => Promise<DfPage>
}): JSX.Element {
  const fullRows = df.shape[0]
  const ncols = df.shape[1]

  const [total, setTotal] = useState(fullRows)
  const [cache, setCache] = useState<Map<number, DfRow>>(() => {
    const m = new Map<number, DfRow>()
    df.rows.forEach((r, i) => m.set(i, r))
    return m
  })
  const loaded = useRef<Set<number>>(new Set([0]))
  const loading = useRef<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [sort, setSort] = useState<DfSort>(null)
  const [filterInputs, setFilterInputs] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const filtersKey = JSON.stringify(filters)

  // debounce dos inputs de filtro -> filtros aplicados
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters(Object.fromEntries(Object.entries(filterInputs).filter(([, v]) => v)))
    }, 300)
    return () => clearTimeout(id)
  }, [filterInputs])

  // ao mudar sort/filtros: limpa caches, total e volta ao topo
  const firstReset = useRef(true)
  useEffect(() => {
    loading.current = new Set()
    const natural = sort === null && Object.keys(filters).length === 0
    if (natural) {
      const m = new Map<number, DfRow>()
      df.rows.forEach((r, i) => m.set(i, r))
      setCache(m)
      loaded.current = new Set([0])
    } else {
      setCache(new Map())
      loaded.current = new Set()
    }
    setTotal(fullRows) // placeholder; a 1ª busca corrige com o total filtrado
    if (!firstReset.current && scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
    firstReset.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, filtersKey])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(total, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN)

  useEffect(() => {
    for (let b = Math.floor(first / BLOCK) * BLOCK; b < last; b += BLOCK) {
      if (loaded.current.has(b) || loading.current.has(b)) continue
      loading.current.add(b)
      void fetchPage(df.handle, b, b + BLOCK, { sort, filters }).then((page) => {
        loading.current.delete(b)
        loaded.current.add(b)
        setTotal(page.total)
        setCache((prev) => {
          const next = new Map(prev)
          page.rows.forEach((r, i) => next.set(b + i, r))
          return next
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, df.handle, fetchPage, sort, filtersKey])

  const cycleSort = (col: string): void =>
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: 'asc' }
      if (cur.dir === 'asc') return { col, dir: 'desc' }
      return null
    })

  const visible: number[] = []
  for (let i = first; i < last; i++) visible.push(i)
  const isFiltered = total !== fullRows && Object.keys(filters).length > 0

  return (
    <div className="df">
      <div className="df__meta">
        <strong>{total.toLocaleString('pt-BR')}</strong> linhas ×{' '}
        <strong>{ncols.toLocaleString('pt-BR')}</strong> colunas
        {isFiltered && <span className="df__trunc"> · filtrado de {fullRows.toLocaleString('pt-BR')}</span>}
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
                  <th key={i}>
                    <div
                      className="df__col df__col--sortable"
                      title={`${c.name} · ${c.dtype} (clique para ordenar)`}
                      onClick={() => cycleSort(c.name)}
                    >
                      {c.name}
                      <span className="df__arrow">{arrow}</span>
                    </div>
                    <div className="df__dtype">{c.dtype}</div>
                    <input
                      className="df__filter"
                      placeholder="filtrar…"
                      value={filterInputs[c.name] ?? ''}
                      onChange={(e) =>
                        setFilterInputs((prev) => ({ ...prev, [c.name]: e.target.value }))
                      }
                    />
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
            {total === 0 && (
              <tr>
                <td colSpan={ncols + 1} className="df__empty">
                  Nenhuma linha corresponde ao filtro.
                </td>
              </tr>
            )}
            <tr aria-hidden style={{ height: Math.max(0, total - last) * ROW_H }}>
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
