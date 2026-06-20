import { useState } from 'react'
import type { ApiRequestOpts, ApiResponse, FastApiPayload, FastApiRoute } from '../engine/protocol'

type OnRequest = (opts: ApiRequestOpts) => Promise<ApiResponse>

/** Explorador de app FastAPI: rotas + request/response do app vivo. */
export function FastApiView({
  app,
  onRequest
}: {
  app: FastApiPayload
  onRequest: OnRequest
}): JSX.Element {
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
          <RouteRow key={i} route={r} handle={app.handle} onRequest={onRequest} />
        ))}
      </div>
    </div>
  )
}

function RouteRow({
  route,
  handle,
  onRequest
}: {
  route: FastApiRoute
  handle: string
  onRequest: OnRequest
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pathVals, setPathVals] = useState<Record<string, string>>({})
  const [queryVals, setQueryVals] = useState<Record<string, string>>({})
  const [bodyText, setBodyText] = useState('{}')
  const [bodyErr, setBodyErr] = useState<string | null>(null)
  const [resp, setResp] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const pathParams = route.params.filter((p) => p.in === 'path')
  const queryParams = route.params.filter((p) => p.in === 'query')

  const send = async (): Promise<void> => {
    setBodyErr(null)
    let body: unknown = undefined
    const hasBody = Boolean(route.requestBody)
    if (hasBody) {
      try {
        body = bodyText.trim() ? JSON.parse(bodyText) : {}
      } catch (e) {
        setBodyErr(e instanceof Error ? e.message : 'JSON inválido')
        return
      }
    }
    // substitui {param} no path
    let path = route.path
    for (const p of pathParams) {
      path = path.replace(`{${p.name}}`, encodeURIComponent(pathVals[p.name] ?? ''))
    }
    setLoading(true)
    const r = await onRequest({ handle, method: route.method, path, query: queryVals, body, hasBody })
    setResp(r)
    setLoading(false)
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

          <button className="fa-send" onClick={() => void send()} disabled={loading}>
            {loading ? 'enviando…' : `Enviar ${route.method}`}
          </button>

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
