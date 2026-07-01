import { useState } from 'react'
import type { ConnState } from '../engine/useEngine'
import type { KernelState, KernelStats } from '../engine/protocol'
import type { PkTask } from '../engine/tasks'
import { useT } from '../engine/i18n'

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
  const t = useT()
  const connected = conn === 'open'
  const busy = kernel === 'busy'
  const label = !connected ? t(`sb.${conn}`) : busy ? t('sb.busy') : t('sb.idle')
  const [tasksOpen, setTasksOpen] = useState(false)

  return (
    <footer className="statusbar">
      <span className={`sb-state sb-state--${busy ? 'busy' : conn}`}>
        <span className="sb-dot" />
        {label}
      </span>

      {stats?.alive && (
        <>
          <span className="sb-metric">
            {t('sb.ram')} <strong>{stats.memory_mb?.toFixed(0)} MB</strong>
          </span>
          <span className="sb-metric">
            {t('sb.cpu')} <strong>{stats.cpu_percent?.toFixed(0)}%</strong>
          </span>
          {stats.threads != null && (
            <span className="sb-metric">{t('sb.threads', { n: stats.threads })}</span>
          )}
        </>
      )}

      <span className="sb-metric">
        In <strong>[{execCount}]</strong>
      </span>
      <span className="sb-metric">
        {t(varCount === 1 ? 'sb.vars' : 'sb.varsPlural', { n: varCount })}
      </span>

      <div className="sb-actions">
        {tasks.length > 0 && (
          <div className="sb-tasks">
            <button onClick={() => setTasksOpen((v) => !v)} title={t('sb.tasksTitle')}>
              {t('sb.tasks')}
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
          title={t('sb.terminalTitle')}
        >
          {t('sb.terminal')}
        </button>
        <button onClick={onInterrupt} disabled={!connected || !busy} title={t('sb.interruptTitle')}>
          {t('sb.interrupt')}
        </button>
        <button onClick={onRestart} disabled={!connected} title={t('sb.restartTitle')}>
          {t('sb.restart')}
        </button>
      </div>
    </footer>
  )
}
