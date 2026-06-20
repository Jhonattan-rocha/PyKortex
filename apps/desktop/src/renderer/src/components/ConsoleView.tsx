import { useEffect, useRef } from 'react'
import type { Execution } from '../engine/useEngine'
import {
  DATAFRAME_MIME,
  type DataFramePayload,
  type DfRow,
  type OutputMessage
} from '../engine/protocol'
import { DataFrameView } from './DataFrameView'

type FetchPage = (handle: string, start: number, end: number) => Promise<DfRow[]>

/** Console persistente: cada execução vira um bloco In[n] + suas saídas. */
export function ConsoleView({
  executions,
  fetchPage
}: {
  executions: Execution[]
  fetchPage: FetchPage
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
        <ExecutionBlock key={ex.id} ex={ex} fetchPage={fetchPage} />
      ))}
      <div ref={endRef} />
    </div>
  )
}

function ExecutionBlock({ ex, fetchPage }: { ex: Execution; fetchPage: FetchPage }): JSX.Element {
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
          <OutputItem key={i} msg={o} fetchPage={fetchPage} />
        ))}
      </div>
    </div>
  )
}

function OutputItem({ msg, fetchPage }: { msg: OutputMessage; fetchPage: FetchPage }): JSX.Element | null {
  switch (msg.type) {
    case 'stream':
      return <pre className={`out out--stream out--${msg.name}`}>{msg.text}</pre>
    case 'execute_result':
    case 'display_data': {
      const data = msg.data as Record<string, unknown>
      // MIME rico do PyKortex tem prioridade sobre html/texto.
      const df = data[DATAFRAME_MIME] as DataFramePayload | undefined
      if (df && df.kind === 'dataframe') {
        return <DataFrameView df={df} fetchPage={fetchPage} />
      }
      // imagens (matplotlib etc.): png/jpeg vêm em base64; svg vem como texto
      const png = data['image/png']
      const jpeg = data['image/jpeg']
      if (typeof png === 'string' || typeof jpeg === 'string') {
        const mime = typeof png === 'string' ? 'image/png' : 'image/jpeg'
        const b64 = (typeof png === 'string' ? png : jpeg) as string
        return <img className="out out--img" src={`data:${mime};base64,${b64}`} alt="figura" />
      }
      const svg = data['image/svg+xml']
      if (typeof svg === 'string') {
        return <div className="out out--img" dangerouslySetInnerHTML={{ __html: svg }} />
      }
      const html = data['text/html']
      if (typeof html === 'string') {
        // kernel local de confiança nesta fase; sanitização entra depois
        return <div className="out out--html" dangerouslySetInnerHTML={{ __html: html }} />
      }
      return <pre className="out out--result">{String(data['text/plain'] ?? '')}</pre>
    }
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
