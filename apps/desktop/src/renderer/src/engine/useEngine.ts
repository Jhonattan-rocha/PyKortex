import { useCallback, useEffect, useRef, useState } from 'react'
import type { KernelState, OutputMessage, ServerMessage } from './protocol'

export type ConnState = 'connecting' | 'open' | 'closed' | 'error'

export interface Execution {
  /** id local incremental (ordem de envio) */
  id: number
  /** código submetido (célula ou arquivo) */
  code: string
  status: 'running' | 'ok' | 'error' | 'aborted'
  /** contador do kernel (In [n]); null enquanto não chega o reply */
  executionCount: number | null
  /** saídas do bloco (stream/result/display/error) */
  outputs: OutputMessage[]
}

export interface UseEngine {
  conn: ConnState
  kernel: KernelState
  executions: Execution[]
  errorText: string | null
  execute: (code: string) => void
  interrupt: () => void
  restart: () => void
  clear: () => void
}

const OUTPUT_TYPES = new Set(['stream', 'execute_result', 'display_data', 'error'])

/**
 * Conecta ao /ws/execute e organiza a saída em EXECUÇÕES (estilo REPL).
 *
 * Atribuição FIFO: o backend processa um execute_request por vez e em ordem,
 * então mantemos uma fila de ids pendentes e roteamos toda saída para a cabeça
 * da fila, avançando quando chega o execute_reply correspondente.
 */
export function useEngine(): UseEngine {
  const wsRef = useRef<WebSocket | null>(null)
  const idCounter = useRef(0)
  const pending = useRef<number[]>([]) // fila FIFO de ids aguardando reply

  const [conn, setConn] = useState<ConnState>('connecting')
  const [kernel, setKernel] = useState<KernelState>('starting')
  const [executions, setExecutions] = useState<Execution[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)

  const patch = (id: number, fn: (ex: Execution) => Execution): void =>
    setExecutions((prev) => prev.map((ex) => (ex.id === id ? fn(ex) : ex)))

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null

    async function connect(): Promise<void> {
      const info = await window.pykortex.getEngineInfo()
      if (cancelled) return
      if (!info.ok) {
        setConn('error')
        setErrorText(info.error)
        return
      }

      ws = new WebSocket(`ws://${info.host}:${info.port}/ws/execute`)
      wsRef.current = ws

      ws.onopen = () => setConn('open')
      ws.onclose = () => setConn('closed')
      ws.onerror = () => {
        setConn('error')
        setErrorText('falha na conexão WebSocket com o engine')
      }
      ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data) as ServerMessage)
    }

    function handleMessage(msg: ServerMessage): void {
      if (msg.type === 'status') {
        setKernel(msg.state)
        return
      }
      if (msg.type === 'restarted') {
        pending.current = []
        return
      }
      if (msg.type === 'kernel_error') {
        setErrorText(msg.message)
        return
      }

      const head = pending.current[0]
      if (head === undefined) return // saída sem execução associada

      if (msg.type === 'execute_reply') {
        patch(head, (ex) => ({
          ...ex,
          status: msg.status === 'ok' ? 'ok' : msg.status === 'aborted' ? 'aborted' : 'error',
          executionCount: msg.execution_count ?? ex.executionCount
        }))
        pending.current.shift()
        return
      }

      if (OUTPUT_TYPES.has(msg.type)) {
        const out = msg as OutputMessage
        const count =
          out.type === 'execute_result' ? out.execution_count : null
        patch(head, (ex) => ({
          ...ex,
          outputs: [...ex.outputs, out],
          executionCount: count ?? ex.executionCount
        }))
      }
    }

    connect()
    return () => {
      cancelled = true
      ws?.close()
    }
  }, [])

  const execute = useCallback((code: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const id = ++idCounter.current
    setExecutions((prev) => [
      ...prev,
      { id, code, status: 'running', executionCount: null, outputs: [] }
    ])
    pending.current.push(id)
    ws.send(JSON.stringify({ type: 'execute_request', code }))
  }, [])

  const interrupt = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'interrupt' }))
  }, [])

  const restart = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'restart' }))
    pending.current = []
    setExecutions([])
  }, [])

  const clear = useCallback(() => setExecutions([]), [])

  return { conn, kernel, executions, errorText, execute, interrupt, restart, clear }
}
