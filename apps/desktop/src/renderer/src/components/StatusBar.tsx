import type { ConnState } from '../engine/useEngine'
import type { KernelState, KernelStats } from '../engine/protocol'

/** Barra de status / task manager: estado do kernel + recursos + ações. */
export function StatusBar({
  conn,
  kernel,
  stats,
  execCount,
  varCount,
  terminalOpen,
  onToggleTerminal,
  onInterrupt,
  onRestart
}: {
  conn: ConnState
  kernel: KernelState
  stats: KernelStats | null
  execCount: number
  varCount: number
  terminalOpen: boolean
  onToggleTerminal: () => void
  onInterrupt: () => void
  onRestart: () => void
}): JSX.Element {
  const connected = conn === 'open'
  const busy = kernel === 'busy'
  const label = !connected ? conn : busy ? 'ocupado' : 'ocioso'

  return (
    <footer className="statusbar">
      <span className={`sb-state sb-state--${busy ? 'busy' : conn}`}>
        <span className="sb-dot" />
        {label}
      </span>

      {stats?.alive && (
        <>
          <span className="sb-metric" title="memória do processo do kernel">
            RAM <strong>{stats.memory_mb?.toFixed(0)} MB</strong>
          </span>
          <span className="sb-metric" title="CPU do kernel (pode passar de 100% com vários núcleos)">
            CPU <strong>{stats.cpu_percent?.toFixed(0)}%</strong>
          </span>
          {stats.threads != null && (
            <span className="sb-metric" title="threads">
              {stats.threads} thr
            </span>
          )}
        </>
      )}

      <span className="sb-metric">
        In <strong>[{execCount}]</strong>
      </span>
      <span className="sb-metric">
        {varCount} var{varCount === 1 ? '' : 's'}
      </span>

      <div className="sb-actions">
        <button
          className={terminalOpen ? 'sb-term sb-term--on' : 'sb-term'}
          onClick={onToggleTerminal}
          title="Terminal (Ctrl+`)"
        >
          ⌨ Terminal
        </button>
        <button onClick={onInterrupt} disabled={!connected || !busy} title="Interromper execução">
          ■ Interromper
        </button>
        <button onClick={onRestart} disabled={!connected} title="Reiniciar kernel">
          ⟳ Restart
        </button>
      </div>
    </footer>
  )
}
