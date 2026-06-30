import { useEffect, useRef } from 'react'
import type { Execution } from '../engine/useEngine'
import {
  DATAFRAME_MIME,
  FASTAPI_MIME,
  SQLALCHEMY_MIME,
  type ApiRequestOpts,
  type ApiResponse,
  type DataFramePayload,
  type DfPage,
  type DfView,
  type FastApiPayload,
  type OutputMessage,
  type SqlAlchemyPayload,
  type SqlQueryResult,
  type TraceResult
} from '../engine/protocol'
import { DataFrameView } from './DataFrameView'
import { FastApiView } from './FastApiView'
import { SqlAlchemyView } from './SqlAlchemyView'

type FetchPage = (handle: string, start: number, end: number, view?: DfView) => Promise<DfPage>
type OnRequest = (opts: ApiRequestOpts) => Promise<ApiResponse>
type OnTrace = (opts: ApiRequestOpts) => Promise<TraceResult>
type OnQuery = (handle: string, sql: string) => Promise<SqlQueryResult>

/** Console persistente: cada execução vira um bloco In[n] + suas saídas. */
export function ConsoleView({
  executions,
  fetchPage,
  onRequest,
  onTrace,
  onQuery
}: {
  executions: Execution[]
  fetchPage: FetchPage
  onRequest: OnRequest
  onTrace: OnTrace
  onQuery: OnQuery
}): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null)

  // auto-scroll para o fim quando muda o número de execuções ou suas saídas
  const tick = executions.reduce((n, e) => n + e.outputs.length, executions.length)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [tick])

  if (executions.length === 0) {
    return <div className="console console--empty">Console vazio. Rode uma célula.</div>
  }

  return (
    <div className="console">
      {executions.map((ex) => (
        <ExecutionBlock
          key={ex.id}
          ex={ex}
          fetchPage={fetchPage}
          onRequest={onRequest}
          onTrace={onTrace}
          onQuery={onQuery}
        />
      ))}
      <div ref={endRef} />
    </div>
  )
}

function ExecutionBlock({
  ex,
  fetchPage,
  onRequest,
  onTrace,
  onQuery
}: {
  ex: Execution
  fetchPage: FetchPage
  onRequest: OnRequest
  onTrace: OnTrace
  onQuery: OnQuery
}): JSX.Element {
  const label = ex.executionCount != null ? `In [${ex.executionCount}]` : 'In [*]'
  return (
    <div className={`exec exec--${ex.status}`}>
      <div className="exec__head">
        <span className="exec__prompt">{label}</span>
        <span className={`exec__status exec__status--${ex.status}`}>
          {ex.status === 'running' ? '…' : ex.status === 'ok' ? '✓' : ex.status === 'error' ? '✗' : '⦸'}
        </span>
      </div>
      <pre className="exec__code">{ex.code.trim()}</pre>
      <div className="exec__out">
        {ex.outputs.map((o, i) => (
          <OutputItem
            key={i}
            msg={o}
            fetchPage={fetchPage}
            onRequest={onRequest}
            onTrace={onTrace}
            onQuery={onQuery}
          />
        ))}
      </div>
    </div>
  )
}

interface RenderCtx {
  fetchPage: FetchPage
  onRequest: OnRequest
  onTrace: OnTrace
  onQuery: OnQuery
}
type RichRenderer = (data: Record<string, unknown>, ctx: RenderCtx) => JSX.Element | null

/**
 * Renderers de saída rica em ordem de prioridade (espelha o registro de
 * `@pk.viewer(Tipo)` do lado Python). Adicionar um viewer novo = uma entrada
 * aqui; o primeiro que reconhecer o MIME vence. Cai para `text/plain` se nenhum.
 */
const RICH_RENDERERS: RichRenderer[] = [
  (data, ctx) => {
    const df = data[DATAFRAME_MIME] as DataFramePayload | undefined
    return df?.kind === 'dataframe' ? <DataFrameView df={df} fetchPage={ctx.fetchPage} /> : null
  },
  (data, ctx) => {
    const fa = data[FASTAPI_MIME] as FastApiPayload | undefined
    return fa?.kind === 'fastapi' ? (
      <FastApiView app={fa} onRequest={ctx.onRequest} onTrace={ctx.onTrace} />
    ) : null
  },
  (data, ctx) => {
    const sa = data[SQLALCHEMY_MIME] as SqlAlchemyPayload | undefined
    return sa?.kind === 'sqlalchemy' ? (
      <SqlAlchemyView schema={sa} onQuery={ctx.onQuery} fetchPage={ctx.fetchPage} />
    ) : null
  },
  // imagens (matplotlib etc.): png/jpeg vêm em base64
  (data) => {
    const png = data['image/png']
    const jpeg = data['image/jpeg']
    if (typeof png !== 'string' && typeof jpeg !== 'string') return null
    const mime = typeof png === 'string' ? 'image/png' : 'image/jpeg'
    const b64 = typeof png === 'string' ? png : (jpeg as string)
    return <img className="out out--img" src={`data:${mime};base64,${b64}`} alt="figura" />
  },
  (data) => {
    const svg = data['image/svg+xml']
    return typeof svg === 'string' ? (
      <div className="out out--img" dangerouslySetInnerHTML={{ __html: svg }} />
    ) : null
  },
  (data) => {
    // kernel local de confiança nesta fase; sanitização entra depois
    const html = data['text/html']
    return typeof html === 'string' ? (
      <div className="out out--html" dangerouslySetInnerHTML={{ __html: html }} />
    ) : null
  }
]

function renderRich(data: Record<string, unknown>, ctx: RenderCtx): JSX.Element {
  for (const render of RICH_RENDERERS) {
    const el = render(data, ctx)
    if (el) return el
  }
  return <pre className="out out--result">{String(data['text/plain'] ?? '')}</pre>
}

function OutputItem({
  msg,
  fetchPage,
  onRequest,
  onTrace,
  onQuery
}: {
  msg: OutputMessage
  fetchPage: FetchPage
  onRequest: OnRequest
  onTrace: OnTrace
  onQuery: OnQuery
}): JSX.Element | null {
  switch (msg.type) {
    case 'stream':
      return <pre className={`out out--stream out--${msg.name}`}>{msg.text}</pre>
    case 'execute_result':
    case 'display_data':
      return renderRich(msg.data as Record<string, unknown>, {
        fetchPage,
        onRequest,
        onTrace,
        onQuery
      })
    case 'error':
      return (
        <pre className="out out--error">
          {`${msg.ename}: ${msg.evalue}\n`}
          {stripAnsi(msg.traceback.join('\n'))}
        </pre>
      )
    default:
      return null
  }
}

// Tracebacks do IPython vêm com códigos ANSI de cor.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
