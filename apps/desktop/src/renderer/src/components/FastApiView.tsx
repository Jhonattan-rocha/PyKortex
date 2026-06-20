import { useState } from 'react'
import type { FastApiPayload, FastApiRoute } from '../engine/protocol'

/** Explorador de app FastAPI: rotas + request/response do app vivo. */
export function FastApiView({ app }: { app: FastApiPayload }): JSX.Element {
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
          <RouteRow key={i} route={r} />
        ))}
      </div>
    </div>
  )
}

function RouteRow({ route }: { route: FastApiRoute }): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasDetails =
    route.params.length > 0 || route.requestBody || Object.keys(route.responses).length > 0

  return (
    <div className={`fa-route${route.deprecated ? ' fa-route--dep' : ''}`}>
      <div className="fa-route__row" onClick={() => hasDetails && setOpen((v) => !v)}>
        <span className={`fa-method fa-method--${route.method.toLowerCase()}`}>{route.method}</span>
        <span className="fa-path">{route.path}</span>
        {route.summary && <span className="fa-summary">{route.summary}</span>}
        {route.tags.map((t) => (
          <span key={t} className="fa-tag">
            {t}
          </span>
        ))}
        {hasDetails && <span className="fa-chevron">{open ? '▾' : '▸'}</span>}
      </div>

      {open && (
        <div className="fa-detail">
          {route.params.length > 0 && (
            <div className="fa-block">
              <div className="fa-block__title">Parâmetros</div>
              {route.params.map((p, i) => (
                <div key={i} className="fa-param">
                  <span className="fa-param__name">{p.name}</span>
                  <span className="fa-param__in">{p.in}</span>
                  {p.type && <span className="fa-param__type">{p.type}</span>}
                  {p.required && <span className="fa-req">obrigatório</span>}
                </div>
              ))}
            </div>
          )}
          {route.requestBody && (
            <div className="fa-block">
              <div className="fa-block__title">Request body</div>
              <span className="fa-schema">{route.requestBody}</span>
            </div>
          )}
          {Object.keys(route.responses).length > 0 && (
            <div className="fa-block">
              <div className="fa-block__title">Respostas</div>
              {Object.entries(route.responses).map(([code, resp]) => (
                <div key={code} className="fa-resp">
                  <span className={`fa-code fa-code--${code[0]}`}>{code}</span>
                  <span className="fa-resp__desc">{resp.description}</span>
                  {resp.schema && <span className="fa-schema">{resp.schema}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
