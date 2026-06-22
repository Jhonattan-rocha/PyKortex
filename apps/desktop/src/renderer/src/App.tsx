import { useCallback, useEffect, useRef, useState } from 'react'
import { useEngine } from './engine/useEngine'
import { ConsoleView } from './components/ConsoleView'
import { FileTree, type FileTreeHandle } from './components/FileTree'
import { VariableExplorer } from './components/VariableExplorer'
import { StatusBar } from './components/StatusBar'
import { CodeEditor } from './editor/Editor'
import { parseCells } from './editor/cells'
import { readFile, setWorkspace, writeFile } from './engine/fsClient'
import { loadState, saveState } from './engine/persistence'

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
  path: string | null // null = buffer scratch (sem arquivo até "Salvar como")
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

// --- helpers de caminho (Windows usa '\', normalizamos para '/') ---
const norm = (s: string): string => s.replace(/\\/g, '/').replace(/\/+$/, '')
function toWorkspaceRelative(abs: string, root: string): string | null {
  const a = norm(abs)
  const r = norm(root)
  if (a.toLowerCase() === r.toLowerCase()) return null
  if (a.toLowerCase().startsWith(r.toLowerCase() + '/')) return a.slice(r.length + 1)
  return null // fora do workspace
}
const parentDir = (abs: string): string => {
  const a = norm(abs)
  const i = a.lastIndexOf('/')
  return i === -1 ? a : a.slice(0, i)
}

export function App(): JSX.Element {
  const {
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
    requestApp
  } = useEngine()

  const execCount = executions.reduce((m, e) => Math.max(m, e.executionCount ?? 0), 0)

  const [tabs, setTabs] = useState<Tab[]>([newScratch()])
  const [activeId, setActiveId] = useState<string>(SCRATCH_ID)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [fsError, setFsError] = useState<string | null>(null)
  const [autoSave, setAutoSave] = useState(false)

  const fileTreeRef = useRef<FileTreeHandle>(null)

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

  // "Rodar tudo": cada célula # %% vira uma execução separada (cada uma exibe
  // sua última expressão), em vez do arquivo inteiro como um bloco só.
  const runAll = useCallback(
    (src: string) => {
      if (!connected) return
      for (const cell of parseCells(src)) {
        if (cell.code.trim().length > 0) execute(cell.code)
      }
    },
    [connected, execute]
  )

  const updateActiveCode = useCallback(
    (code: string) => setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, code } : t))),
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

  const openFile = useCallback(
    async (rel: string) => {
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
    },
    [tabs]
  )

  const openFileFromDialog = useCallback(async () => {
    setFsError(null)
    try {
      const abs = await window.pykortex.openFileDialog()
      if (!abs) return
      let rel = workspaceRoot ? toWorkspaceRelative(abs, workspaceRoot) : null
      if (!rel) {
        // arquivo fora do workspace atual: adota a pasta dele como workspace
        const root = await setWorkspace(parentDir(abs))
        setWorkspaceRoot(root)
        rel = basename(norm(abs))
      }
      await openFile(rel)
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [workspaceRoot, openFile])

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

  const saveAs = useCallback(async () => {
    const t = tabs.find((x) => x.id === activeId)
    if (!t) return
    setFsError(null)
    try {
      const suggested = t.title.endsWith('.py') ? t.title : `${t.title}.py`
      const abs = await window.pykortex.saveDialog(workspaceRoot ?? undefined, suggested)
      if (!abs) return

      let root = workspaceRoot
      let rel = root ? toWorkspaceRelative(abs, root) : null
      if (!rel) {
        // salvou fora do workspace: adota a pasta de destino como workspace
        root = await setWorkspace(parentDir(abs))
        setWorkspaceRoot(root)
        rel = basename(norm(abs))
      }
      await writeFile(rel, t.code)
      const relPath = rel
      setTabs((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, id: relPath, path: relPath, title: basename(relPath), saved: t.code }
            : x
        )
      )
      setActiveId(rel)
      fileTreeRef.current?.refresh()
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [tabs, activeId, workspaceRoot])

  const closeTab = useCallback(
    (id: string) => {
      const t = tabs.find((x) => x.id === id)
      if (t && isDirty(t) && !window.confirm(`Descartar alterações não salvas em "${t.title}"?`)) {
        return
      }
      const next = tabs.filter((x) => x.id !== id)
      const result = next.length > 0 ? next : [newScratch()]
      setTabs(result)
      if (activeId === id) setActiveId(result[result.length - 1].id)
    },
    [tabs, activeId]
  )

  // árvore renomeou/apagou: ajusta abas afetadas (puro, sem efeitos no updater)
  const onPathChanged = useCallback(
    (oldPath: string, newPath: string | null) => {
      const affected = (p: string | null): boolean =>
        p === oldPath || (p != null && p.startsWith(oldPath + '/'))
      const remap = (p: string): string =>
        p === oldPath ? newPath! : newPath! + p.slice(oldPath.length)

      let next: Tab[]
      if (newPath === null) {
        next = tabs.filter((t) => !affected(t.path))
        if (next.length === 0) next = [newScratch()]
      } else {
        next = tabs.map((t) => {
          if (!affected(t.path)) return t
          const np = remap(t.path!)
          return { ...t, id: np, path: np, title: basename(np) }
        })
      }

      let nextActive = activeId
      if (!next.some((t) => t.id === nextActive)) {
        const at = tabs.find((t) => t.id === activeId)
        nextActive =
          at && newPath !== null && affected(at.path)
            ? remap(at.path!)
            : next[next.length - 1].id
      }
      setTabs(next)
      setActiveId(nextActive)
    },
    [tabs, activeId]
  )

  // ações do menu nativo (via ref para evitar closures velhos sem re-assinar)
  const actionsRef = useRef<Record<string, (payload?: unknown) => void>>({})
  actionsRef.current = {
    newFile: () =>
      workspaceRoot
        ? fileTreeRef.current?.newFile()
        : setFsError('Abra uma pasta primeiro (Arquivo › Abrir pasta).'),
    newFolder: () =>
      workspaceRoot
        ? fileTreeRef.current?.newFolder()
        : setFsError('Abra uma pasta primeiro (Arquivo › Abrir pasta).'),
    openFolder: () => void openFolder(),
    openFile: () => void openFileFromDialog(),
    save: () => void save(active?.code ?? ''),
    saveAs: () => void saveAs(),
    toggleAutoSave: (p) => setAutoSave(Boolean(p)),
    closeTab: () => active && closeTab(active.id)
  }
  useEffect(() => window.pykortex.onMenu(({ action, payload }) => actionsRef.current[action]?.(payload)), [])

  // auto save: salva a aba ativa (se for arquivo e estiver suja) após 800ms ocioso
  useEffect(() => {
    if (!autoSave || !active || !active.path || active.code === active.saved) return
    const timer = setTimeout(() => void save(active.code), 800)
    return () => clearTimeout(timer)
  }, [autoSave, active, save])

  // --- persistência do estado da IDE ---
  const restored = useRef(false)

  // restaura uma vez no mount (workspace + abas reabertas do disco + scratch)
  useEffect(() => {
    void (async () => {
      const st = loadState()
      if (st) {
        if (st.workspaceRoot) {
          try {
            setWorkspaceRoot(await setWorkspace(st.workspaceRoot))
          } catch {
            /* pasta sumiu: segue sem workspace */
          }
        }
        const tabsOut: Tab[] = []
        for (const t of st.tabs) {
          if (t.path === null) {
            tabsOut.push({
              id: SCRATCH_ID,
              title: 'scratch',
              path: null,
              code: st.scratchCode,
              saved: st.scratchCode
            })
          } else {
            try {
              const content = await readFile(t.path)
              tabsOut.push({
                id: t.path,
                title: basename(t.path),
                path: t.path,
                code: content,
                saved: content
              })
            } catch {
              /* arquivo apagado/movido: ignora */
            }
          }
        }
        if (tabsOut.length === 0) tabsOut.push(newScratch())
        setTabs(tabsOut)
        setActiveId(
          tabsOut.some((t) => t.id === st.activeId) ? st.activeId : tabsOut[tabsOut.length - 1].id
        )
        setAutoSave(st.autoSave)
      }
      restored.current = true
    })()
  }, [])

  // salva (debounced) quando o estado relevante muda — só após restaurar
  useEffect(() => {
    if (!restored.current) return
    const timer = setTimeout(() => {
      saveState({
        workspaceRoot,
        tabs: tabs.map((t) => ({ id: t.id, path: t.path })),
        scratchCode: tabs.find((t) => t.id === SCRATCH_ID)?.code ?? '',
        activeId,
        autoSave
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [tabs, activeId, workspaceRoot, autoSave])

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">PyKortex</span>
        <span className="tag">Fase 1 · editor</span>
        <span className={`dot dot--${conn}`} />
        <span className="status">
          conexão: {conn} · kernel: {kernel}
          {autoSave && ' · auto save'}
        </span>
      </header>

      <main className="main main--3col">
        <aside className="pane pane--sidebar">
          <div className="sidebar-section sidebar-section--files">
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
              ref={fileTreeRef}
              root={workspaceRoot}
              activePath={active?.path ?? null}
              onOpen={openFile}
              onPathChanged={onPathChanged}
            />
          </div>
          <div className="sidebar-section sidebar-section--vars">
            <VariableExplorer
              variables={variables}
              onRefresh={inspect}
              onShow={run}
              onClear={clearVars}
            />
          </div>
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
                <span
                  className="tab__close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                >
                  {isDirty(t) ? '●' : '×'}
                </span>
              </div>
            ))}
          </div>

          <div className="pane__subhead">
            <span className="filetab">{active?.path ?? 'scratch (não salvo em arquivo)'}</span>
            <div className="actions">
              <button onClick={() => runAll(active?.code ?? '')} disabled={!connected || busy}>
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
          <ConsoleView executions={executions} fetchPage={pageDataFrame} onRequest={requestApp} />
        </section>
      </main>

      <StatusBar
        conn={conn}
        kernel={kernel}
        stats={stats}
        execCount={execCount}
        varCount={variables.length}
        onInterrupt={interrupt}
        onRestart={restart}
      />
    </div>
  )
}
