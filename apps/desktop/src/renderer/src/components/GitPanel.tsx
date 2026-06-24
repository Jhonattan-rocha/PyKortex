import { useCallback, useEffect, useState } from 'react'
import {
  gitCommit,
  gitDiscard,
  gitInit,
  gitLog,
  gitReset,
  gitStage,
  gitStatus,
  gitUnstage,
  type GitCommit,
  type GitFile,
  type GitStatus
} from '../engine/gitClient'

const basename = (p: string): string => p.split('/').pop() ?? p
const dirname = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

/** Painel de Source Control (git): branch, mudanças staged/unstaged/untracked. */
export function GitPanel({
  root,
  onOpen
}: {
  root: string | null
  onOpen: (path: string) => void
}): JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'changes' | 'history'>('changes')
  const [commits, setCommits] = useState<GitCommit[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [st, lg] = await Promise.all([gitStatus(), gitLog()])
      setStatus(st)
      setCommits(lg.commits)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, root])

  const act = async (fn: () => Promise<{ ok: boolean; message: string }>): Promise<void> => {
    setError(null)
    try {
      const r = await fn()
      if (!r.ok && r.message) setError(r.message)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!root) {
    return <div className="git git--empty">Abra uma pasta para ver o git.</div>
  }
  if (status && !status.repo) {
    return (
      <div className="git git--empty">
        <div>Esta pasta não é um repositório git.</div>
        <button className="git-init" onClick={() => void act(gitInit)}>
          Inicializar repositório
        </button>
      </div>
    )
  }
  if (!status) return <div className="git git--empty">carregando…</div>

  const staged = status.files.filter((f) => f.staged)
  const changes = status.files.filter((f) => !f.untracked && f.y !== ' ')
  const untracked = status.files.filter((f) => f.untracked)
  const canCommit = staged.length > 0 && message.trim().length > 0

  return (
    <div className="git">
      <div className="git-branch">
        <span className="git-branch__name">⎇ {status.branch || '—'}</span>
        {status.ahead > 0 && <span className="git-track">↑{status.ahead}</span>}
        {status.behind > 0 && <span className="git-track">↓{status.behind}</span>}
        <button className="git-refresh" title="Atualizar" onClick={() => void load()}>
          ⟳
        </button>
      </div>

      <div className="git-tabs">
        <button
          className={`git-tab${view === 'changes' ? ' git-tab--active' : ''}`}
          onClick={() => setView('changes')}
        >
          Mudanças
        </button>
        <button
          className={`git-tab${view === 'history' ? ' git-tab--active' : ''}`}
          onClick={() => setView('history')}
        >
          Histórico
        </button>
      </div>

      {error && <div className="git-error">{error}</div>}

      {view === 'history' ? (
        <GitHistory commits={commits} onReset={(rev, mode) => void act(() => gitReset(rev, mode))} />
      ) : (
        <>
      <div className="git-commit">
        <textarea
          className="git-msg"
          placeholder="Mensagem do commit"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canCommit) {
              void act(() => gitCommit(message)).then(() => setMessage(''))
            }
          }}
        />
        <button
          className="git-commit-btn"
          disabled={!canCommit}
          onClick={() => void act(() => gitCommit(message)).then(() => setMessage(''))}
        >
          ✓ Commit ({staged.length})
        </button>
      </div>

      <div className="git-lists">
        {staged.length > 0 && (
          <Group
            title="Staged"
            files={staged}
            letterOf={(f) => f.x}
            onAllAction={() => void act(() => gitUnstage(staged.map((f) => f.path)))}
            allLabel="−"
            allTitle="Unstage tudo"
            actions={(f) => [
              { label: '−', title: 'Unstage', run: () => void act(() => gitUnstage([f.path])) }
            ]}
            onOpen={onOpen}
          />
        )}
        {changes.length > 0 && (
          <Group
            title="Mudanças"
            files={changes}
            letterOf={(f) => f.y}
            onAllAction={() => void act(() => gitStage(changes.map((f) => f.path)))}
            allLabel="+"
            allTitle="Stage tudo"
            actions={(f) => [
              {
                label: '↺',
                title: 'Descartar mudanças',
                run: () => {
                  if (window.confirm(`Descartar mudanças em "${f.path}"?`)) {
                    void act(() => gitDiscard([f.path]))
                  }
                }
              },
              { label: '+', title: 'Stage', run: () => void act(() => gitStage([f.path])) }
            ]}
            onOpen={onOpen}
          />
        )}
        {untracked.length > 0 && (
          <Group
            title="Não rastreados"
            files={untracked}
            letterOf={() => 'U'}
            onAllAction={() => void act(() => gitStage(untracked.map((f) => f.path)))}
            allLabel="+"
            allTitle="Stage tudo"
            actions={(f) => [
              { label: '+', title: 'Stage', run: () => void act(() => gitStage([f.path])) }
            ]}
            onOpen={onOpen}
          />
        )}
        {status.files.length === 0 && (
          <div className="git--clean">✓ Nada para commitar, árvore limpa.</div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

function GitHistory({
  commits,
  onReset
}: {
  commits: GitCommit[]
  onReset: (rev: string, mode: 'soft' | 'mixed' | 'hard') => void
}): JSX.Element {
  const [openHash, setOpenHash] = useState<string | null>(null)

  if (commits.length === 0) {
    return <div className="git--empty">Nenhum commit ainda.</div>
  }

  const doReset = (c: GitCommit, mode: 'soft' | 'mixed' | 'hard'): void => {
    const labels = {
      soft: 'soft — move o HEAD, mantém suas mudanças staged',
      mixed: 'mixed — move o HEAD, mantém mudanças (unstaged)',
      hard: 'HARD — DESCARTA todas as mudanças não commitadas (irreversível)'
    }
    const msg =
      `Reset ${labels[mode]}\n\npara o commit ${c.short} "${c.subject}"?` +
      (mode === 'hard' ? '\n\n⚠️ Você vai PERDER mudanças não commitadas.' : '')
    if (window.confirm(msg)) {
      onReset(c.hash, mode)
      setOpenHash(null)
    }
  }

  return (
    <div className="git-history">
      {commits.map((c) => (
        <div key={c.hash} className="git-commit-row">
          <div className="git-commit-row__main" onClick={() => setOpenHash((h) => (h === c.hash ? null : c.hash))}>
            <span className="git-commit-row__hash">{c.short}</span>
            <span className="git-commit-row__subject">{c.subject}</span>
          </div>
          <div className="git-commit-row__meta">
            {c.author} · {c.date}
          </div>
          {openHash === c.hash && (
            <div className="git-reset-bar">
              <span className="git-reset-bar__label">reset:</span>
              <button onClick={() => doReset(c, 'soft')}>soft</button>
              <button onClick={() => doReset(c, 'mixed')}>mixed</button>
              <button className="git-reset-bar__hard" onClick={() => doReset(c, 'hard')}>
                hard
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface RowAction {
  label: string
  title: string
  run: () => void
}

function Group({
  title,
  files,
  letterOf,
  actions,
  onAllAction,
  allLabel,
  allTitle,
  onOpen
}: {
  title: string
  files: GitFile[]
  letterOf: (f: GitFile) => string
  actions: (f: GitFile) => RowAction[]
  onAllAction: () => void
  allLabel: string
  allTitle: string
  onOpen: (path: string) => void
}): JSX.Element {
  return (
    <div className="git-group">
      <div className="git-group__head">
        <span>
          {title} <span className="git-group__count">{files.length}</span>
        </span>
        <button className="git-row__act" title={allTitle} onClick={onAllAction}>
          {allLabel}
        </button>
      </div>
      {files.map((f) => (
        <div key={f.path} className="git-row" title={f.path}>
          <span className={`git-st git-st--${letterOf(f).trim() || 'U'}`}>{letterOf(f).trim() || 'U'}</span>
          <span className="git-row__name" onClick={() => onOpen(f.path)}>
            {basename(f.path)}
          </span>
          <span className="git-row__dir">{dirname(f.path)}</span>
          <span className="git-row__actions">
            {actions(f).map((a) => (
              <button key={a.label} className="git-row__act" title={a.title} onClick={a.run}>
                {a.label}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
