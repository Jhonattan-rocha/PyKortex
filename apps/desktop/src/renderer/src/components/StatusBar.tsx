import { useState } from 'react'
import type { ConnState } from '../engine/useEngine'
import type { KernelState, KernelStats } from '../engine/protocol'
import type { PkTask } from '../engine/tasks'

/** Barra de status / task manager: estado do kernel + recursos + ações. */
export function StatusBar({
  conn,
  kernel,
  stats,
  execCount,
  varCount,
  terminalOpen,
  tasks,
  onRunTask,
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
  tasks: PkTask[]
  onRunTask: (command: string) => void
  onToggleTerminal: () => void
  onInterrupt: () => void
  onRestart: () => void
}): JSX.Element {
  const connected = conn === 'open'
  const busy = kernel === 'busy'
  const label = !connected ? conn : busy ? 'ocupado' : 'ocioso'
  const [tasksOpen, setTasksOpen] = useState(false)

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
        {tasks.length > 0 && (
          <div className="sb-tasks">
            <button onClick={() => setTasksOpen((v) => !v)} title="Tarefas do projeto">
              ▷ Tarefas
            </button>
            {tasksOpen && (
              <>
                <div className="sb-backdrop" onClick={() => setTasksOpen(false)} />
                <div className="sb-tasks__menu">
                  {tasks.map((t) => (
                    <button
                      key={t.name}
                      className="sb-tasks__item"
                      title={t.command}
                      onClick={() => {
                        onRunTask(t.command)
                        setTasksOpen(false)
                      }}
                    >
                      <span className="sb-tasks__name">{t.name}</span>
                      <span className="sb-tasks__cmd">{t.command}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
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
