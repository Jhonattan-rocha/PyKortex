import { useEffect, useRef, useState } from 'react'
import { searchWorkspace, type SearchFileResult } from '../engine/fsClient'

/** Busca global de texto no workspace. Resultados agrupados por arquivo, clicáveis. */
export function SearchPanel({
  onOpen
}: {
  onOpen: (path: string, line: number, col: number) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [results, setResults] = useState<SearchFileResult[]>([])
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = async (): Promise<void> => {
    if (!query.trim()) {
      setResults([])
      setRan(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await searchWorkspace(query, { case: caseSensitive, regex })
      setResults(r.results)
      setTruncated(r.truncated)
      setCollapsed(new Set())
      setRan(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  const toggle = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const total = results.reduce((n, f) => n + f.matches.length, 0)

  return (
    <div className="search">
      <div className="search__bar">
        <input
          ref={inputRef}
          className="search__input"
          placeholder="Buscar no projeto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
        />
        <div className="search__opts">
          <button
            className={`search__opt${caseSensitive ? ' search__opt--on' : ''}`}
            title="Diferenciar maiúsculas/minúsculas"
            onClick={() => setCaseSensitive((v) => !v)}
          >
            Aa
          </button>
          <button
            className={`search__opt${regex ? ' search__opt--on' : ''}`}
            title="Expressão regular"
            onClick={() => setRegex((v) => !v)}
          >
            .*
          </button>
          <button className="search__go" onClick={() => void run()} disabled={busy}>
            {busy ? '…' : 'Buscar'}
          </button>
        </div>
      </div>

      {error && <div className="search__error">{error}</div>}

      {ran && !error && (
        <div className="search__summary">
          {total === 0
            ? 'Nenhum resultado'
            : `${total} ocorrência(s) em ${results.length} arquivo(s)${truncated ? ' (limitado)' : ''}`}
        </div>
      )}

      <div className="search__results">
        {results.map((file) => {
          const isCollapsed = collapsed.has(file.path)
          return (
            <div key={file.path} className="search__file">
              <div className="search__filehdr" onClick={() => toggle(file.path)}>
                <span className="search__caret">{isCollapsed ? '▸' : '▾'}</span>
                <span className="search__filepath" title={file.path}>
                  {file.path}
                </span>
                <span className="search__count">{file.matches.length}</span>
              </div>
              {!isCollapsed &&
                file.matches.map((m, i) => (
                  <div
                    key={`${m.line}:${m.col}:${i}`}
                    className="search__match"
                    onClick={() => onOpen(file.path, m.line, m.col)}
                  >
                    <span className="search__line">{m.line}</span>
                    <span className="search__text">{m.text.trim()}</span>
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
