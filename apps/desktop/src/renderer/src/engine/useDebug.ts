import { useCallback, useRef, useState } from 'react'

export interface DebugVariable {
  name: string
  value: string
  type: string
  variablesReference: number
}
export interface DebugScope {
  name: string
  variablesReference: number
  variables: DebugVariable[]
}
export interface DebugFrame {
  id: number
  name: string
  line: number
  path: string | null
  absPath: string | null
}
export interface DebugStop {
  threadId: number
  reason: string
  line: number | null
  path: string | null
  frames: DebugFrame[]
  scopes: DebugScope[]
}

export type DebugStatus = 'idle' | 'running' | 'paused'

export interface UseDebug {
  status: DebugStatus
  pausedAt: DebugStop | null
  scopes: DebugScope[]
  selectedFrame: number | null
  output: string
  start: (path: string, breakpoints: Record<string, number[]>) => Promise<void>
  cont: () => void
  stepOver: () => void
  stepIn: () => void
  stepOut: () => void
  selectFrame: (frameId: number) => void
  stopDebug: () => void
  /** chamado quando a sessão para num breakpoint (pra abrir o arquivo/linha) */
  onStopped?: (stop: DebugStop) => void
}

export function useDebug(onStopped?: (stop: DebugStop) => void): UseDebug {
  const [status, setStatus] = useState<DebugStatus>('idle')
  const [pausedAt, setPausedAt] = useState<DebugStop | null>(null)
  const [scopes, setScopes] = useState<DebugScope[]>([])
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null)
  const [output, setOutput] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const runRef = useRef<{ path: string; breakpoints: Record<string, number[]> } | null>(null)
  const onStoppedRef = useRef(onStopped)
  onStoppedRef.current = onStopped

  const send = (m: object): void => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
  }

  const start = useCallback(async (path: string, breakpoints: Record<string, number[]>) => {
    wsRef.current?.close()
    setOutput('')
    setPausedAt(null)
    setScopes([])
    const info = await window.pykortex.getEngineInfo()
    if (!info.ok) return
    runRef.current = { path, breakpoints }
    const ws = new WebSocket(`ws://${info.host}:${info.port}/ws/debug`)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as Record<string, unknown> & { type: string }
      switch (msg.type) {
        case 'ready':
          send({ type: 'run', ...runRef.current })
          setStatus('running')
          break
        case 'running':
          setStatus('running')
          break
        case 'stopped': {
          const stop = msg as unknown as DebugStop
          setStatus('paused')
          setPausedAt(stop)
          setScopes(stop.scopes ?? [])
          setSelectedFrame(stop.frames?.[0]?.id ?? null)
          onStoppedRef.current?.(stop)
          break
        }
        case 'continued':
          setStatus('running')
          setPausedAt(null)
          break
        case 'frame_reply':
          setScopes((msg.scopes as DebugScope[]) ?? [])
          break
        case 'output':
          setOutput((o) => o + String(msg.text ?? ''))
          break
        case 'terminated':
          setStatus('idle')
          setPausedAt(null)
          ws.close()
          break
        case 'error':
          setOutput((o) => o + `\n[erro] ${String(msg.message ?? '')}\n`)
          break
      }
    }
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null
        setStatus('idle')
        setPausedAt(null)
      }
    }
  }, [])

  const threadId = pausedAt?.threadId ?? 1
  const cont = useCallback(() => send({ type: 'continue', threadId }), [threadId])
  const stepOver = useCallback(() => send({ type: 'stepOver', threadId }), [threadId])
  const stepIn = useCallback(() => send({ type: 'stepIn', threadId }), [threadId])
  const stepOut = useCallback(() => send({ type: 'stepOut', threadId }), [threadId])
  const selectFrame = useCallback((frameId: number) => {
    setSelectedFrame(frameId)
    send({ type: 'frame', frameId })
  }, [])
  const stopDebug = useCallback(() => {
    send({ type: 'stop' })
    wsRef.current?.close()
    wsRef.current = null
    setStatus('idle')
    setPausedAt(null)
  }, [])

  return {
    status,
    pausedAt,
    scopes,
    selectedFrame,
    output,
    start,
    cont,
    stepOver,
    stepIn,
    stepOut,
    selectFrame,
    stopDebug
  }
}
