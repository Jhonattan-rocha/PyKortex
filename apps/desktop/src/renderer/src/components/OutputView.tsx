import type { ServerMessage } from '../engine/protocol'

/** Renderiza a lista de mensagens do kernel. Fase 0: texto/erros/resultados. */
export function OutputView({ outputs }: { outputs: ServerMessage[] }): JSX.Element {
  if (outputs.length === 0) {
    return <div className="output output--empty">Sem saída ainda. Execute algo.</div>
  }

  return (
    <div className="output">
      {outputs.map((msg, i) => (
        <OutputItem key={i} msg={msg} />
      ))}
    </div>
  )
}

function OutputItem({ msg }: { msg: ServerMessage }): JSX.Element | null {
  switch (msg.type) {
    case 'stream':
      return (
        <pre className={`out out--stream out--${msg.name}`}>{msg.text}</pre>
      )
    case 'execute_result':
    case 'display_data': {
      const data = msg.data as Record<string, unknown>
      const html = data['text/html']
      if (typeof html === 'string') {
        // Fase 0: confiamos no kernel local. Sanitização entra na Fase 2.
        return <div className="out out--html" dangerouslySetInnerHTML={{ __html: html }} />
      }
      const text = data['text/plain']
      return <pre className="out out--result">{String(text ?? '')}</pre>
    }
    case 'error':
      return (
        <pre className="out out--error">
          {`${msg.ename}: ${msg.evalue}\n`}
          {stripAnsi(msg.traceback.join('\n'))}
        </pre>
      )
    case 'execute_reply':
      return (
        <div className={`out out--reply out--reply-${msg.status}`}>
          {msg.status === 'ok'
            ? `✓ concluído${msg.execution_count != null ? ` [${msg.execution_count}]` : ''}`
            : `✗ ${msg.status}`}
        </div>
      )
    default:
      return null
  }
}

// Tracebacks do IPython vêm com códigos ANSI de cor. Removidos por ora.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
