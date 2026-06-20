import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiRequestOpts,
  ApiResponse,
  DfPage,
  DfView,
  KernelState,
  OutputMessage,
  ServerMessage,
  VariableInfo
} from './protocol'

export type ConnState = 'connecting' | 'open' | 'closed' | 'error'

export interface Execution {
  id: number
  code: string
  status: 'running' | 'ok' | 'error' | 'aborted'
  executionCount: number | null
  outputs: OutputMessage[]
}

export interface UseEngine {
  conn: ConnState
  kernel: KernelState
  executions: Execution[]
  variables: VariableInfo[]
  errorText: string | null
  execute: (code: string) => void
  interrupt: () => void
  restart: () => void
  clear: () => void
  inspect: () => void
  clearVars: () => void
  pageDataFrame: (handle: string, start: number, end: number, view?: DfView) => Promise<DfPage>
  requestApp: (opts: ApiRequestOpts) => Promise<ApiResponse>
}

const OUTPUT_TYPES = new Set(['stream', 'execute_result', 'display_data', 'error'])
const MAX_BACKOFF_MS = 5000

/**
 * Conecta ao /ws/execute, organiza a saída em EXECUÇÕES (estilo REPL) e
 * reconecta automaticamente (backoff exponencial) se a conexão cair.
 */
export function useEngine(): UseEngine {
  const wsRef = useRef<WebSocket | null>(null)
  const idCounter = useRef(0)
  const pending = useRef<number[]>([]) // fila FIFO de ids aguardando reply
  const pageReqs = useRef<Map<number, (page: DfPage) => void>>(new Map())
  const apiReqs = useRef<Map<number, (res: ApiResponse) => void>>(new Map())
  const reqCounter = useRef(0)

  const [conn, setConn] = useState<ConnState>('connecting')
  const [kernel, setKernel] = useState<KernelState>('starting')
  const [executions, setExecutions] = useState<Execution[]>([])
  const [variables, setVariables] = useState<VariableInfo[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)

  const patch = (id: number, fn: (ex: Execution) => Execution): void =>
    setExecutions((prev) => prev.map((ex) => (ex.id === id ? fn(ex) : ex)))

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    function requestInspect(): void {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'inspect' }))
      }
    }

    function scheduleRetry(): void {
      if (cancelled) return
      const delay = Math.min(500 * 2 ** retry, MAX_BACKOFF_MS)
      retry += 1
      timer = setTimeout(connect, delay)
    }

    function abortPending(): void {
      const ids = new Set(pending.current)
      pending.current = []
      if (ids.size === 0) return
      setExecutions((prev) =>
        prev.map((ex) => (ids.has(ex.id) && ex.status === 'running' ? { ...ex, status: 'aborted' } : ex))
      )
    }

    function handleMessage(msg: ServerMessage): void {
      if (msg.type === 'status') {
        setKernel(msg.state)
        return
      }
      if (msg.type === 'restarted') {
        pending.current = []
        setVariables([])
        requestInspect()
        return
      }
      if (msg.type === 'variables') {
        setVariables(msg.variables)
        return
      }
      if (msg.type === 'df_rows') {
        const resolve = pageReqs.current.get(msg.reqId)
        if (resolve) {
          pageReqs.current.delete(msg.reqId)
          resolve({
            rows: msg.error ? [] : (msg.rows ?? []),
            total: msg.total ?? 0
          })
        }
        return
      }
      if (msg.type === 'api_response') {
        const resolve = apiReqs.current.get(msg.reqId)
        if (resolve) {
          apiReqs.current.delete(msg.reqId)
          resolve(msg.response ?? {})
        }
        return
      }
      if (msg.type === 'kernel_error') {
        setErrorText(msg.message)
        return
      }
      const head = pending.current[0]
      if (head === undefined) return

      if (msg.type === 'execute_reply') {
        patch(head, (ex) => ({
          ...ex,
          status: msg.status === 'ok' ? 'ok' : msg.status === 'aborted' ? 'aborted' : 'error',
          executionCount: msg.execution_count ?? ex.executionCount
        }))
        pending.current.shift()
        // quando todas as execuções pendentes terminam, atualiza as variáveis
        if (pending.current.length === 0) requestInspect()
        return
      }
      if (OUTPUT_TYPES.has(msg.type)) {
        const out = msg as OutputMessage
        const count = out.type === 'execute_result' ? out.execution_count : null
        patch(head, (ex) => ({
          ...ex,
          outputs: [...ex.outputs, out],
          executionCount: count ?? ex.executionCount
        }))
      }
    }

    async function connect(): Promise<void> {
      if (cancelled) return
      setConn('connecting')
      const info = await window.pykortex.getEngineInfo()
      if (cancelled) return
      if (!info.ok) {
        setConn('error')
        setErrorText(info.error)
        scheduleRetry()
        return
      }

      ws = new WebSocket(`ws://${info.host}:${info.port}/ws/execute`)
      wsRef.current = ws

      ws.onopen = () => {
        retry = 0
        setConn('open')
        setErrorText(null)
        requestInspect() // estado inicial das variáveis
      }
      ws.onclose = () => {
        if (cancelled) return
        setConn('closed')
        setKernel('starting')
        abortPending()
        scheduleRetry()
      }
      ws.onerror = () => {
        // onclose dispara em seguida e cuida do retry
      }
      ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data) as ServerMessage)
    }

    connect()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
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

  const inspect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'inspect' }))
  }, [])

  const clearVars = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'clear_vars' }))
  }, [])

  const pageDataFrame = useCallback(
    (handle: string, start: number, end: number, view?: DfView): Promise<DfPage> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ rows: [], total: 0 })
      const reqId = ++reqCounter.current
      return new Promise<DfPage>((resolve) => {
        pageReqs.current.set(reqId, resolve)
        ws.send(
          JSON.stringify({
            type: 'df_page',
            reqId,
            handle,
            start,
            end,
            sort: view?.sort ?? null,
            filters: view?.filters ?? {}
          })
        )
        // failsafe: não deixa a promise pendurada se a resposta nunca vier
        setTimeout(() => {
          if (pageReqs.current.delete(reqId)) resolve({ rows: [], total: 0 })
        }, 10000)
      })
    },
    []
  )

  const requestApp = useCallback((opts: ApiRequestOpts): Promise<ApiResponse> => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ error: 'sem conexão com o engine' })
    }
    const reqId = ++reqCounter.current
    return new Promise<ApiResponse>((resolve) => {
      apiReqs.current.set(reqId, resolve)
      ws.send(JSON.stringify({ type: 'api_request', reqId, ...opts }))
      setTimeout(() => {
        if (apiReqs.current.delete(reqId)) resolve({ error: 'timeout' })
      }, 30000)
    })
  }, [])

  return {
    conn,
    kernel,
    executions,
    variables,
    errorText,
    execute,
    interrupt,
    restart,
    clear,
    inspect,
    clearVars,
    pageDataFrame,
    requestApp
  }
}
