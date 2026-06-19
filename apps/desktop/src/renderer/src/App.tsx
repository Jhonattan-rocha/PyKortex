import { useCallback, useEffect, useRef, useState } from 'react'
import { useEngine } from './engine/useEngine'
import { ConsoleView } from './components/ConsoleView'
import { FileTree } from './components/FileTree'
import { CodeEditor } from './editor/Editor'
import { readFile, setWorkspace, writeFile } from './engine/fsClient'

const SAMPLE = `# %% imports
import sys
print("PyKortex Fase 1 — kernel:", sys.version.split()[0])

# %% soma
total = sum(range(1, 101))
total
`

const SCRATCH_ID = 'scratch'

interface Tab {
  id: string
  title: string
  path: string | null // null = buffer scratch (não salvável em arquivo)
  code: string
  saved: string
}

const basename = (p: string): string => p.split('/').pop() ?? p
const newScratch = (): Tab => ({
  id: SCRATCH_ID,
  title: 'scratch',
  path: null,
  code: SAMPLE,
  saved: SAMPLE
})

export function App(): JSX.Element {
  const { conn, kernel, executions, errorText, execute, interrupt, restart, clear } = useEngine()

  const [tabs, setTabs] = useState<Tab[]>([newScratch()])
  const [activeId, setActiveId] = useState<string>(SCRATCH_ID)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [fsError, setFsError] = useState<string | null>(null)

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const connected = conn === 'open'
  const busy = kernel === 'busy'
  const isDirty = (t: Tab): boolean => t.path !== null && t.code !== t.saved

  const run = useCallback(
    (src: string) => {
      if (connected) execute(src)
    },
    [connected, execute]
  )

  const updateActiveCode = useCallback(
    (code: string) => {
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, code } : t)))
    },
    [activeId]
  )

  const openFolder = useCallback(async () => {
    setFsError(null)
    try {
      const path = await window.pykortex.openFolder()
      if (!path) return
      setWorkspaceRoot(await setWorkspace(path))
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const openFile = useCallback(async (rel: string) => {
    setFsError(null)
    if (tabs.some((t) => t.id === rel)) {
      setActiveId(rel)
      return
    }
    try {
      const content = await readFile(rel)
      setTabs((prev) => [
        ...prev,
        { id: rel, title: basename(rel), path: rel, code: content, saved: content }
      ])
      setActiveId(rel)
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs])

  const save = useCallback(
    async (src: string) => {
      const t = tabs.find((x) => x.id === activeId)
      if (!t || !t.path) return
      setFsError(null)
      try {
        await writeFile(t.path, src)
        setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, code: src, saved: src } : x)))
      } catch (e) {
        setFsError(e instanceof Error ? e.message : String(e))
      }
    },
    [tabs, activeId]
  )

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const t = prev.find((x) => x.id === id)
        if (t && isDirty(t) && !window.confirm(`Descartar alterações não salvas em "${t.title}"?`)) {
          return prev
        }
        const next = prev.filter((x) => x.id !== id)
        const result = next.length > 0 ? next : [newScratch()]
        if (activeId === id) setActiveId(result[result.length - 1].id)
        return result
      })
    },
    [activeId]
  )

  // árvore renomeou/apagou: ajusta abas afetadas
  const onPathChanged = useCallback(
    (oldPath: string, newPath: string | null) => {
      const affected = (p: string | null): boolean =>
        p === oldPath || (p != null && p.startsWith(oldPath + '/'))

      setTabs((prev) => {
        let next: Tab[]
        if (newPath === null) {
          next = prev.filter((t) => !affected(t.path))
          if (next.length === 0) next = [newScratch()]
        } else {
          next = prev.map((t) => {
            if (!affected(t.path)) return t
            const np = t.path === oldPath ? newPath : newPath + t.path!.slice(oldPath.length)
            return { ...t, id: np, path: np, title: basename(np) }
          })
        }
        setActiveId((cur) => {
          if (next.some((t) => t.id === cur)) return cur
          // a aba ativa sumiu/renomeou: escolhe equivalente ou a última
          const t = prev.find((x) => x.id === cur)
          if (t && newPath !== null && affected(t.path)) {
            return t.path === oldPath ? newPath : newPath + t.path!.slice(oldPath.length)
          }
          return next[next.length - 1].id
        })
        return next
      })
    },
    []
  )

  // Ctrl/Cmd+S fora do foco do editor
  const saveRef = useRef<() => void>(() => {})
  saveRef.current = () => void save(active?.code ?? '')
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">PyKortex</span>
        <span className="tag">Fase 1 · editor</span>
        <span className={`dot dot--${conn}`} />
        <span className="status">
          conexão: {conn} · kernel: {kernel}
        </span>
      </header>

      <main className="main main--3col">
        <aside className="pane pane--sidebar">
          <div className="pane__head">
            <span>Explorer</span>
            <div className="actions">
              <button onClick={openFolder}>Abrir pasta…</button>
            </div>
          </div>
          {workspaceRoot && (
            <div className="ws-root" title={workspaceRoot}>
              {workspaceRoot}
            </div>
          )}
          <FileTree
            root={workspaceRoot}
            activePath={active?.path ?? null}
            onOpen={openFile}
            onPathChanged={onPathChanged}
          />
        </aside>

        <section className="pane pane--editor">
          <div className="tabbar">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`tab${t.id === activeId ? ' tab--active' : ''}`}
                onClick={() => setActiveId(t.id)}
                title={t.path ?? t.title}
              >
                <span className="tab__title">{t.title}</span>
                <span className="tab__close" onClick={(e) => (e.stopPropagation(), closeTab(t.id))}>
                  {isDirty(t) ? '●' : '×'}
                </span>
              </div>
            ))}
          </div>

          <div className="pane__subhead">
            <span className="filetab">{active?.path ?? 'scratch (não salvo em arquivo)'}</span>
            <div className="actions">
              <button onClick={() => run(active?.code ?? '')} disabled={!connected || busy}>
                ▶ Rodar tudo
              </button>
              <button onClick={interrupt} disabled={!connected || !busy}>
                ■ Interromper
              </button>
              <button onClick={restart} disabled={!connected} title="Reiniciar kernel">
                ⟳ Restart
              </button>
              <button onClick={clear} disabled={executions.length === 0}>
                Limpar
              </button>
            </div>
          </div>

          {fsError && <div className="banner banner--error">{fsError}</div>}
          <div className="editor-host">
            <CodeEditor
              path={active?.id}
              value={active?.code ?? ''}
              onChange={updateActiveCode}
              onRun={run}
              onSave={save}
            />
          </div>
          <div className="hint">
            Ctrl+Enter: célula · Shift+Enter: célula e avança · Ctrl+Shift+Enter: tudo · Ctrl+S:
            salvar · células com <code>{'# %%'}</code>
          </div>
        </section>

        <section className="pane pane--output">
          <div className="pane__head">
            <span>Console</span>
          </div>
          {errorText && <div className="banner banner--error">{errorText}</div>}
          <ConsoleView executions={executions} />
        </section>
      </main>
    </div>
  )
}
