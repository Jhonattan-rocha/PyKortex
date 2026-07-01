import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiRequestOpts,
  ApiResponse,
  CompleteResult,
  Diagnostic,
  DfPage,
  DfView,
  GotoDef,
  HoverResult,
  KernelState,
  KernelStats,
  OutputMessage,
  PkCommand,
  PkCommandInput,
  PkPanel,
  ServerMessage,
  SignatureInfo,
  SqlQueryResult,
  TraceResult,
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
  stats: KernelStats | null
  errorText: string | null
  execute: (code: string) => void
  interrupt: () => void
  restart: () => void
  clear: () => void
  inspect: () => void
  clearVars: () => void
  pageDataFrame: (handle: string, start: number, end: number, view?: DfView) => Promise<DfPage>
  requestApp: (opts: ApiRequestOpts) => Promise<ApiResponse>
  traceApp: (opts: ApiRequestOpts) => Promise<TraceResult>
  queryEngine: (handle: string, sql: string) => Promise<SqlQueryResult>
  complete: (code: string, cursorPos: number) => Promise<CompleteResult>
  lint: (code: string) => Promise<Diagnostic[]>
  hover: (code: string, line: number, col: number) => Promise<HoverResult>
  signatures: (code: string, line: number, col: number) => Promise<SignatureInfo[]>
  goto: (code: string, line: number, col: number) => Promise<GotoDef[]>
  listCommands: () => Promise<PkCommand[]>
  commandInputs: (name: string) => Promise<PkCommandInput[]>
  runCommand: (name: string, args?: Record<string, unknown>) => void
  listPanels: () => Promise<PkPanel[]>
  renderPanel: (name: string) => Promise<{ html: string }>
  reconfigurePython: (interpreter: string | null, env: Record<string, string>) => void
  kernelEpoch: number
}

const EMPTY_COMPLETE: CompleteResult = { matches: [], cursor_start: 0, cursor_end: 0, types: [] }

const OUTPUT_TYPES = new Set(['stream', 'execute_result', 'display_data', 'error'])
const MAX_BACKOFF_MS = 5000

/**
 * Conecta ao /ws/execute, organiza a saída em EXECUÇÕES (estilo REPL) e
 * reconecta automaticamente (backoff exponencial) se a conexão cair.
 */
export function useEngine(): UseEngine {
  const wsRef = useRef<WebSocket | null>(null)
  const idCounter = useRef(0)
  const pending = useRef<number[]>([]) // fila FIFO de ids de execução aguardando reply
  // resolvers de request/response (df_page, api_request...) por reqId, qualquer tipo
  const requests = useRef<Map<number, (value: unknown) => void>>(new Map())
  const reqCounter = useRef(0)

  const [conn, setConn] = useState<ConnState>('connecting')
  const [kernel, setKernel] = useState<KernelState>('starting')
  const [executions, setExecutions] = useState<Execution[]>([])
  const [variables, setVariables] = useState<VariableInfo[]>([])
  const [stats, setStats] = useState<KernelStats | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  // muda a cada (re)conexão e restart — usado para recarregar extensões
  const [kernelEpoch, setKernelEpoch] = useState(0)

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

    function resolveRequest(reqId: number, value: unknown): void {
      const resolve = requests.current.get(reqId)
      if (resolve) {
        requests.current.delete(reqId)
        resolve(value)
      }
    }

    function handleMessage(msg: ServerMessage): void {
      if (msg.type === 'status') {
        setKernel(msg.state)
        return
      }
      if (msg.type === 'restarted') {
        pending.current = []
        setVariables([])
        setKernelEpoch((e) => e + 1)
        requestInspect()
        return
      }
      if (msg.type === 'variables') {
        setVariables(msg.variables)
        return
      }
      if (msg.type === 'kernel_stats') {
        setStats(msg.stats)
        return
      }
      if (msg.type === 'df_rows') {
        resolveRequest(msg.reqId, {
          rows: msg.error ? [] : (msg.rows ?? []),
          total: msg.total ?? 0
        })
        return
      }
      if (msg.type === 'api_response') {
        resolveRequest(msg.reqId, msg.response ?? {})
        return
      }
      if (msg.type === 'sql_result') {
        resolveRequest(msg.reqId, msg.result ?? {})
        return
      }
      if (msg.type === 'api_trace_reply') {
        resolveRequest(msg.reqId, msg.trace ?? {})
        return
      }
      if (msg.type === 'complete_reply') {
        resolveRequest(msg.reqId, {
          matches: msg.matches ?? [],
          cursor_start: msg.cursor_start,
          cursor_end: msg.cursor_end,
          types: msg.types ?? []
        })
        return
      }
      if (msg.type === 'lint_reply') {
        resolveRequest(msg.reqId, msg.diagnostics ?? [])
        return
      }
      if (msg.type === 'hover_reply') {
        resolveRequest(msg.reqId, {
          name: msg.name,
          kind: msg.kind,
          docstring: msg.docstring
        })
        return
      }
      if (msg.type === 'signature_reply') {
        resolveRequest(msg.reqId, msg.signatures ?? [])
        return
      }
      if (msg.type === 'goto_reply') {
        resolveRequest(msg.reqId, msg.definitions ?? [])
        return
      }
      if (msg.type === 'commands_reply') {
        resolveRequest(msg.reqId, msg.commands ?? [])
        return
      }
      if (msg.type === 'command_inputs_reply') {
        resolveRequest(msg.reqId, msg.inputs ?? [])
        return
      }
      if (msg.type === 'panels_reply') {
        resolveRequest(msg.reqId, msg.panels ?? [])
        return
      }
      if (msg.type === 'panel_reply') {
        resolveRequest(msg.reqId, { html: msg.html ?? '' })
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
        setKernelEpoch((e) => e + 1)
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

  // polling das métricas do kernel (a cada 1.5s, enquanto conectado)
  useEffect(() => {
    if (conn !== 'open') return
    const poll = (): void => wsRef.current?.send(JSON.stringify({ type: 'stats' }))
    poll()
    const id = setInterval(poll, 1500)
    return () => clearInterval(id)
  }, [conn])

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

  const reconfigurePython = useCallback(
    (interpreter: string | null, env: Record<string, string>) => {
      wsRef.current?.send(JSON.stringify({ type: 'reconfigure_python', interpreter, env }))
      pending.current = []
      setExecutions([])
    },
    []
  )

  const clear = useCallback(() => setExecutions([]), [])

  const inspect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'inspect' }))
  }, [])

  const clearVars = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'clear_vars' }))
  }, [])

  /**
   * Envia uma mensagem de request/response correlacionada por reqId e resolve
   * com a resposta (ou com `unavailable`/`onTimeout` se a conexão cair ou
   * estourar o prazo). O mapeamento da resposta acontece no handleMessage.
   */
  const sendRequest = useCallback(
    <T>(
      message: Record<string, unknown>,
      opts: { unavailable: T; onTimeout: T; timeoutMs: number }
    ): Promise<T> => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(opts.unavailable)
      const reqId = ++reqCounter.current
      return new Promise<T>((resolve) => {
        requests.current.set(reqId, resolve as (value: unknown) => void)
        ws.send(JSON.stringify({ ...message, reqId }))
        setTimeout(() => {
          if (requests.current.delete(reqId)) resolve(opts.onTimeout)
        }, opts.timeoutMs)
      })
    },
    []
  )

  const pageDataFrame = useCallback(
    (handle: string, start: number, end: number, view?: DfView): Promise<DfPage> =>
      sendRequest<DfPage>(
        {
          type: 'df_page',
          handle,
          start,
          end,
          sort: view?.sort ?? null,
          filters: view?.filters ?? {}
        },
        { unavailable: { rows: [], total: 0 }, onTimeout: { rows: [], total: 0 }, timeoutMs: 10000 }
      ),
    [sendRequest]
  )

  const requestApp = useCallback(
    (opts: ApiRequestOpts): Promise<ApiResponse> =>
      sendRequest<ApiResponse>(
        { type: 'api_request', ...opts },
        {
          unavailable: { error: 'sem conexão com o engine' },
          onTimeout: { error: 'timeout' },
          timeoutMs: 30000
        }
      ),
    [sendRequest]
  )

  const traceApp = useCallback(
    (opts: ApiRequestOpts): Promise<TraceResult> =>
      sendRequest<TraceResult>(
        { type: 'api_trace', ...opts },
        {
          unavailable: { error: 'sem conexão com o engine' },
          onTimeout: { error: 'timeout' },
          timeoutMs: 30000
        }
      ),
    [sendRequest]
  )

  const queryEngine = useCallback(
    (handle: string, sql: string): Promise<SqlQueryResult> =>
      sendRequest<SqlQueryResult>(
        { type: 'sql_query', handle, sql },
        {
          unavailable: { error: 'sem conexão com o engine' },
          onTimeout: { error: 'timeout (query longa demais?)' },
          timeoutMs: 60000
        }
      ),
    [sendRequest]
  )

  const complete = useCallback(
    (code: string, cursorPos: number): Promise<CompleteResult> =>
      sendRequest<CompleteResult>(
        { type: 'complete', code, cursor_pos: cursorPos },
        { unavailable: EMPTY_COMPLETE, onTimeout: EMPTY_COMPLETE, timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const lint = useCallback(
    (code: string): Promise<Diagnostic[]> =>
      sendRequest<Diagnostic[]>(
        { type: 'lint', code },
        { unavailable: [], onTimeout: [], timeoutMs: 4000 }
      ),
    [sendRequest]
  )

  const hover = useCallback(
    (code: string, line: number, col: number): Promise<HoverResult> =>
      sendRequest<HoverResult>(
        { type: 'hover', code, line, col },
        { unavailable: {}, onTimeout: {}, timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const signatures = useCallback(
    (code: string, line: number, col: number): Promise<SignatureInfo[]> =>
      sendRequest<SignatureInfo[]>(
        { type: 'signature', code, line, col },
        { unavailable: [], onTimeout: [], timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const goto = useCallback(
    (code: string, line: number, col: number): Promise<GotoDef[]> =>
      sendRequest<GotoDef[]>(
        { type: 'goto', code, line, col },
        { unavailable: [], onTimeout: [], timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const listCommands = useCallback(
    (): Promise<PkCommand[]> =>
      sendRequest<PkCommand[]>(
        { type: 'list_commands' },
        { unavailable: [], onTimeout: [], timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const commandInputs = useCallback(
    (name: string): Promise<PkCommandInput[]> =>
      sendRequest<PkCommandInput[]>(
        { type: 'command_inputs', name },
        { unavailable: [], onTimeout: [], timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const runCommand = useCallback(
    (name: string, args: Record<string, unknown> = {}) =>
      execute(
        `__import__("pykortex")._run_command(${JSON.stringify(name)}, ${JSON.stringify(
          JSON.stringify(args)
        )})`
      ),
    [execute]
  )

  const listPanels = useCallback(
    (): Promise<PkPanel[]> =>
      sendRequest<PkPanel[]>(
        { type: 'list_panels' },
        { unavailable: [], onTimeout: [], timeoutMs: 3000 }
      ),
    [sendRequest]
  )

  const renderPanel = useCallback(
    (name: string): Promise<{ html: string }> =>
      sendRequest<{ html: string }>(
        { type: 'render_panel', name },
        { unavailable: { html: '' }, onTimeout: { html: '' }, timeoutMs: 5000 }
      ),
    [sendRequest]
  )

  return {
    conn,
    kernel,
    executions,
    variables,
    stats,
    errorText,
    execute,
    interrupt,
    restart,
    clear,
    inspect,
    clearVars,
    pageDataFrame,
    requestApp,
    traceApp,
    queryEngine,
    complete,
    lint,
    hover,
    signatures,
    goto,
    listCommands,
    commandInputs,
    runCommand,
    listPanels,
    renderPanel,
    reconfigurePython,
    kernelEpoch
  }
}
