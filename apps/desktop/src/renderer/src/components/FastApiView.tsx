import { useCallback, useRef, useState } from 'react'
import type { ApiRequestOpts, ApiResponse, FastApiPayload, FastApiRoute } from '../engine/protocol'
import {
  loadCollections,
  newId,
  saveCollections,
  type SavedRequest
} from '../engine/collections'

type OnRequest = (opts: ApiRequestOpts) => Promise<ApiResponse>
type OnSave = (name: string, opts: ApiRequestOpts) => void

interface HistoryEntry {
  id: number
  opts: ApiRequestOpts
  response: ApiResponse
  when: number
}

/** Explorador de app FastAPI: rotas + request/response do app vivo. */
export function FastApiView({
  app,
  onRequest
}: {
  app: FastApiPayload
  onRequest: OnRequest
}): JSX.Element {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const idRef = useRef(0)
  const [collections, setCollections] = useState<SavedRequest[]>(() => loadCollections())

  // todo envio passa por aqui para ser registrado no histórico
  const send = useCallback(
    async (opts: ApiRequestOpts): Promise<ApiResponse> => {
      const response = await onRequest(opts)
      setHistory((h) =>
        [{ id: ++idRef.current, opts, response, when: Date.now() }, ...h].slice(0, 20)
      )
      return response
    },
    [onRequest]
  )

  const saveRequest = useCallback<OnSave>(
    (name, opts) => {
      const { handle: _drop, ...request } = opts
      setCollections((c) => {
        const next = [
          { id: newId(), name, appTitle: app.title, savedAt: Date.now(), request },
          ...c
        ]
        saveCollections(next)
        return next
      })
    },
    [app.title]
  )

  const removeCollection = useCallback((id: string) => {
    setCollections((c) => {
      const next = c.filter((x) => x.id !== id)
      saveCollections(next)
      return next
    })
  }, [])

  // só as coleções deste app (por título), para não misturar entre apps
  const mine = collections.filter((c) => c.appTitle === app.title)

  return (
    <div className="fa">
      <div className="fa__head">
        <span className="fa__title">{app.title}</span>
        {app.version && <span className="fa__ver">v{app.version}</span>}
        <span className="fa__count">
          {app.count} rota{app.count === 1 ? '' : 's'}
        </span>
      </div>
      <div className="fa__routes">
        {app.routes.map((r, i) => (
          <RouteRow key={i} route={r} handle={app.handle} send={send} onSave={saveRequest} />
        ))}
      </div>
      {mine.length > 0 && (
        <Collections
          items={mine}
          onReplay={(s) => void send({ ...s.request, handle: app.handle })}
          onRemove={removeCollection}
        />
      )}
      {history.length > 0 && <History entries={history} send={send} />}
    </div>
  )
}

function RouteRow({
  route,
  handle,
  send,
  onSave
}: {
  route: FastApiRoute
  handle: string
  send: OnRequest
  onSave: OnSave
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pathVals, setPathVals] = useState<Record<string, string>>({})
  const [queryVals, setQueryVals] = useState<Record<string, string>>({})
  const [headerRows, setHeaderRows] = useState<{ k: string; v: string }[]>([])
  const [bodyText, setBodyText] = useState('{}')
  const [bodyErr, setBodyErr] = useState<string | null>(null)
  const [resp, setResp] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState<string | null>(null)

  const pathParams = route.params.filter((p) => p.in === 'path')
  const queryParams = route.params.filter((p) => p.in === 'query')

  const setHeader = (i: number, patch: Partial<{ k: string; v: string }>): void =>
    setHeaderRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  /** Monta o request a partir do formulário; null se o body for JSON inválido. */
  const buildOpts = (): ApiRequestOpts | null => {
    setBodyErr(null)
    let body: unknown
    const hasBody = Boolean(route.requestBody)
    if (hasBody) {
      try {
        body = bodyText.trim() ? JSON.parse(bodyText) : {}
      } catch (e) {
        setBodyErr(e instanceof Error ? e.message : 'JSON inválido')
        return null
      }
    }
    let path = route.path
    for (const p of pathParams) {
      path = path.replace(`{${p.name}}`, encodeURIComponent(pathVals[p.name] ?? ''))
    }
    const headers: Record<string, string> = {}
    for (const { k, v } of headerRows) if (k.trim()) headers[k.trim()] = v
    return { handle, method: route.method, path, query: queryVals, headers, body, hasBody }
  }

  const doSend = async (): Promise<void> => {
    const opts = buildOpts()
    if (!opts) return
    setLoading(true)
    setResp(await send(opts))
    setLoading(false)
  }

  const commitSave = (): void => {
    const name = (saveName ?? '').trim()
    const opts = buildOpts()
    if (name && opts) onSave(name, opts)
    setSaveName(null)
  }

  return (
    <div className={`fa-route${route.deprecated ? ' fa-route--dep' : ''}`}>
      <div className="fa-route__row" onClick={() => setOpen((v) => !v)}>
        <span className={`fa-method fa-method--${route.method.toLowerCase()}`}>{route.method}</span>
        <span className="fa-path">{route.path}</span>
        {route.summary && <span className="fa-summary">{route.summary}</span>}
        {route.tags.map((t) => (
          <span key={t} className="fa-tag">
            {t}
          </span>
        ))}
        <span className="fa-chevron">{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div className="fa-detail">
          {(pathParams.length > 0 || queryParams.length > 0) && (
            <div className="fa-block">
              <div className="fa-block__title">Parâmetros</div>
              {pathParams.map((p) => (
                <div key={p.name} className="fa-input-row">
                  <span className="fa-param__name">{p.name}</span>
                  <span className="fa-param__in">path</span>
                  <input
                    className="fa-input"
                    placeholder={p.type || 'valor'}
                    value={pathVals[p.name] ?? ''}
                    onChange={(e) => setPathVals((v) => ({ ...v, [p.name]: e.target.value }))}
                  />
                </div>
              ))}
              {queryParams.map((p) => (
                <div key={p.name} className="fa-input-row">
                  <span className="fa-param__name">{p.name}</span>
                  <span className="fa-param__in">query{p.required ? '*' : ''}</span>
                  <input
                    className="fa-input"
                    placeholder={p.type || 'valor'}
                    value={queryVals[p.name] ?? ''}
                    onChange={(e) => setQueryVals((v) => ({ ...v, [p.name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="fa-block">
            <div className="fa-block__title">Headers</div>
            {headerRows.map((row, i) => (
              <div key={i} className="fa-input-row">
                <input
                  className="fa-input fa-input--key"
                  placeholder="chave"
                  value={row.k}
                  onChange={(e) => setHeader(i, { k: e.target.value })}
                />
                <input
                  className="fa-input"
                  placeholder="valor"
                  value={row.v}
                  onChange={(e) => setHeader(i, { v: e.target.value })}
                />
                <button
                  className="fa-x"
                  title="remover"
                  onClick={() => setHeaderRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="fa-add-row">
              <button className="fa-add" onClick={() => setHeaderRows((r) => [...r, { k: '', v: '' }])}>
                + header
              </button>
              <button
                className="fa-add"
                title="auth via Bearer token"
                onClick={() =>
                  setHeaderRows((r) => [...r, { k: 'Authorization', v: 'Bearer ' }])
                }
              >
                + Authorization
              </button>
            </div>
          </div>

          {route.requestBody && (
            <div className="fa-block">
              <div className="fa-block__title">
                Request body <span className="fa-schema">{route.requestBody}</span>
              </div>
              <textarea
                className="fa-body"
                spellCheck={false}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
              {bodyErr && <div className="fa-body-err">JSON inválido: {bodyErr}</div>}
            </div>
          )}

          <div className="fa-actions">
            <button className="fa-send" onClick={() => void doSend()} disabled={loading}>
              {loading ? 'enviando…' : `Enviar ${route.method}`}
            </button>
            {saveName === null ? (
              <button className="fa-add" onClick={() => setSaveName('')}>
                ★ Salvar
              </button>
            ) : (
              <span className="fa-save-row">
                <input
                  className="fa-input"
                  autoFocus
                  placeholder="nome do request"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitSave()
                    else if (e.key === 'Escape') setSaveName(null)
                  }}
                />
                <button className="fa-add" onClick={commitSave}>
                  ok
                </button>
                <button className="fa-x" onClick={() => setSaveName(null)}>
                  ×
                </button>
              </span>
            )}
          </div>

          {resp && <ResponseView resp={resp} />}

          {Object.keys(route.responses).length > 0 && (
            <div className="fa-block fa-block--responses">
              <div className="fa-block__title">Respostas documentadas</div>
              {Object.entries(route.responses).map(([code, r]) => (
                <div key={code} className="fa-resp">
                  <span className={`fa-code fa-code--${code[0]}`}>{code}</span>
                  <span className="fa-resp__desc">{r.description}</span>
                  {r.schema && <span className="fa-schema">{r.schema}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Collections({
  items,
  onReplay,
  onRemove
}: {
  items: SavedRequest[]
  onReplay: (s: SavedRequest) => void
  onRemove: (id: string) => void
}): JSX.Element {
  return (
    <div className="fa-history">
      <div className="fa-block__title">Coleções salvas</div>
      {items.map((s) => (
        <div key={s.id} className="fa-hist">
          <div className="fa-hist__row" onClick={() => onReplay(s)} title="reenviar este request">
            <span className={`fa-method fa-method--${s.request.method.toLowerCase()}`}>
              {s.request.method}
            </span>
            <span className="fa-col-name">{s.name}</span>
            <span className="fa-path">{s.request.path}</span>
            <button
              className="fa-x"
              title="excluir"
              onClick={(ev) => {
                ev.stopPropagation()
                onRemove(s.id)
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function History({
  entries,
  send
}: {
  entries: HistoryEntry[]
  send: OnRequest
}): JSX.Element {
  const [openId, setOpenId] = useState<number | null>(null)
  return (
    <div className="fa-history">
      <div className="fa-block__title">Histórico</div>
      {entries.map((e) => {
        const status = e.response.status
        const cls = status ? `fa-code--${String(status)[0]}` : 'fa-code--err'
        return (
          <div key={e.id} className="fa-hist">
            <div className="fa-hist__row" onClick={() => setOpenId((id) => (id === e.id ? null : e.id))}>
              <span className={`fa-method fa-method--${e.opts.method.toLowerCase()}`}>
                {e.opts.method}
              </span>
              <span className="fa-path">{e.opts.path}</span>
              <span className={`fa-status ${cls}`}>{status ?? '✕'}</span>
              {e.response.elapsed_ms != null && (
                <span className="fa-elapsed">{e.response.elapsed_ms} ms</span>
              )}
              <span className="fa-when">{ago(e.when)}</span>
              <button
                className="fa-replay"
                title="reenviar"
                onClick={(ev) => {
                  ev.stopPropagation()
                  void send(e.opts)
                }}
              >
                ↻
              </button>
            </div>
            {openId === e.id && <ResponseView resp={e.response} />}
          </div>
        )
      })}
    </div>
  )
}

function ResponseView({ resp }: { resp: ApiResponse }): JSX.Element {
  if (resp.error) {
    return <div className="fa-response fa-response--err">⚠ {resp.error}</div>
  }
  const cls = resp.status ? `fa-code--${String(resp.status)[0]}` : ''
  return (
    <div className="fa-response">
      <div className="fa-response__head">
        <span className={`fa-status ${cls}`}>{resp.status}</span>
        <span className="fa-elapsed">{resp.elapsed_ms} ms</span>
      </div>
      <pre className="fa-response__body">{resp.body}</pre>
    </div>
  )
}

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  return `há ${Math.floor(m / 60)}h`
}
