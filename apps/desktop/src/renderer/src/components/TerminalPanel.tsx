import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/** Terminal real (PTY no engine) renderizado com xterm.js, ligado ao /ws/terminal. */
export function TerminalPanel({
  onClose,
  command
}: {
  onClose: () => void
  command?: { text: string; nonce: number }
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  // comando aguardando o WS abrir (ex.: tarefa disparada junto com a abertura)
  const pendingRef = useRef<string | null>(null)

  // injeta um comando no PTY (como se digitado + Enter); enfileira se ainda não conectou
  const sendCommand = (text: string): void => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: `${text}\r` }))
    } else {
      pendingRef.current = text
    }
  }

  // dispara o comando quando muda o nonce (tarefa clicada)
  useEffect(() => {
    if (command?.text) sendCommand(command.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    let ws: WebSocket | null = null
    let disposed = false

    const sendResize = (): void => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    const fitSafe = (): void => {
      try {
        fit.fit()
      } catch {
        /* container sem tamanho ainda */
      }
    }

    void (async () => {
      const info = await window.pykortex.getEngineInfo()
      if (disposed || !info.ok) return
      ws = new WebSocket(`ws://${info.host}:${info.port}/ws/terminal`)
      wsRef.current = ws
      ws.onopen = () => {
        fitSafe()
        sendResize()
        // descarrega um comando que ficou aguardando a conexão
        if (pendingRef.current) {
          ws?.send(JSON.stringify({ type: 'input', data: `${pendingRef.current}\r` }))
          pendingRef.current = null
        }
      }
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as { type: string; data?: string; message?: string }
        if (msg.type === 'output' && msg.data) term.write(msg.data)
        else if (msg.type === 'exit') term.write('\r\n\x1b[90m[processo encerrado — feche e reabra]\x1b[0m\r\n')
        else if (msg.type === 'error') term.write(`\r\n\x1b[31m[erro: ${msg.message}]\x1b[0m\r\n`)
      }
      term.onData((d) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: d }))
      })
    })()

    // ajusta ao tamanho do container
    requestAnimationFrame(fitSafe)
    const ro = new ResizeObserver(() => {
      fitSafe()
      sendResize()
    })
    ro.observe(container)

    return () => {
      disposed = true
      ro.disconnect()
      ws?.close()
      wsRef.current = null
      term.dispose()
    }
  }, [])

  return (
    <div className="terminal-panel">
      <div className="terminal-panel__head">
        <span>Terminal</span>
        <button className="terminal-panel__close" onClick={onClose} title="Fechar terminal">
          ✕
        </button>
      </div>
      <div className="terminal-panel__body" ref={containerRef} />
    </div>
  )
}
