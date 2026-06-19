import { useCallback, useEffect, useRef, useState } from 'react'
import type { KernelState, ServerMessage } from './protocol'

export type ConnState = 'connecting' | 'open' | 'closed' | 'error'

export interface UseEngine {
  conn: ConnState
  kernel: KernelState
  outputs: ServerMessage[]
  errorText: string | null
  execute: (code: string) => void
  interrupt: () => void
  clear: () => void
}

/**
 * Conecta ao WebSocket /ws/execute do engine e acumula as mensagens recebidas.
 * Descobre host/porta via a ponte do preload (window.pykortex).
 */
export function useEngine(): UseEngine {
  const wsRef = useRef<WebSocket | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')
  const [kernel, setKernel] = useState<KernelState>('starting')
  const [outputs, setOutputs] = useState<ServerMessage[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)

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
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage
        if (msg.type === 'status') {
          setKernel(msg.state)
          return
        }
        if (msg.type === 'kernel_error') {
          setErrorText(msg.message)
        }
        setOutputs((prev) => [...prev, msg])
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
    ws.send(JSON.stringify({ type: 'execute_request', code }))
  }, [])

  const interrupt = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'interrupt' }))
  }, [])

  const clear = useCallback(() => setOutputs([]), [])

  return { conn, kernel, outputs, errorText, execute, interrupt, clear }
}
