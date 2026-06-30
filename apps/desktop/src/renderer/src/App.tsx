import { useCallback, useEffect, useRef, useState } from 'react'
import { useEngine } from './engine/useEngine'
import { ConsoleView } from './components/ConsoleView'
import { FileTree, type FileTreeHandle } from './components/FileTree'
import { VariableExplorer } from './components/VariableExplorer'
import { GitPanel } from './components/GitPanel'
import { PanelsView } from './components/PanelsView'
import { SearchPanel } from './components/SearchPanel'
import { DebugPanel } from './components/DebugPanel'
import { useDebug, type DebugStop } from './engine/useDebug'
import { Splitter } from './components/Splitter'
import { clamp, loadPaneLayout, savePaneLayout } from './engine/paneLayout'
import { StatusBar } from './components/StatusBar'
import { TerminalPanel } from './components/TerminalPanel'
import { CommandPalette } from './components/CommandPalette'
import { DiffView, languageFromPath, type DiffData } from './components/DiffView'
import { CodeEditor } from './editor/Editor'
import { parseCells } from './editor/cells'
import { readFile, setWorkspace, writeFile } from './engine/fsClient'
import { gitShow } from './engine/gitClient'
import { loadState, saveState } from './engine/persistence'
import { addRecent, loadRecents, removeRecent } from './engine/recents'
import { loadTasks, type PkTask } from './engine/tasks'

const SAMPLE = `# %% imports
import sys
print("PyKortex Fase 1 — kernel:", sys.version.split()[0])

# %% soma
total = sum(range(1, 101))
total
`

const SCRATCH_ID = 'scratch'

// Activity bar lateral: ícones empilhados na vertical (escala melhor que abas).
const SIDEBAR_VIEWS = [
  { id: 'files', label: 'Arquivos', icon: '📁' },
  { id: 'search', label: 'Buscar', icon: '🔍' },
  { id: 'git', label: 'Git', icon: '⎇' },
  { id: 'debug', label: 'Debug', icon: '🐞' },
  { id: 'panels', label: 'Painéis', icon: '🧩' }
] as const

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

// --- Workspace Trust: pastas autorizadas a auto-executar extensões ---
const TRUST_KEY = 'pykortex.trustedWorkspaces.v1'
const EXTENSIONS_PATH = '.pykortex/extensions.py'
function loadTrusted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function trustWorkspace(root: string): void {
  const s = loadTrusted()
  s.add(root)
  localStorage.setItem(TRUST_KEY, JSON.stringify([...s]))
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
    kernelEpoch
  } = useEngine()

  const execCount = executions.reduce((m, e) => Math.max(m, e.executionCount ?? 0), 0)

  const [tabs, setTabs] = useState<Tab[]>([newScratch()])
  const [activeId, setActiveId] = useState<string>(SCRATCH_ID)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [fsError, setFsError] = useState<string | null>(null)
  const [autoSave, setAutoSave] = useState(false)
  const [sidebarView, setSidebarView] = useState<
    'files' | 'git' | 'panels' | 'search' | 'debug'
  >('files')
  const [diffView, setDiffView] = useState<DiffData | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const extLoaded = useRef<Set<string>>(new Set())
  const extDismissed = useRef<Set<string>>(new Set())
  const [recents, setRecents] = useState<string[]>(() => loadRecents())
  const [tasks, setTasks] = useState<PkTask[]>([])
  const [terminalCommand, setTerminalCommand] = useState<{ text: string; nonce: number }>()
  const terminalCmdNonce = useRef(0)
  // breakpoints por caminho de arquivo (relativo ao workspace)
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>({})
  // layout redimensionável das panes (persistido)
  const [layout, setLayout] = useState(() => loadPaneLayout())
  useEffect(() => {
    const id = setTimeout(() => savePaneLayout(layout), 300)
    return () => clearTimeout(id)
  }, [layout])

  const fileTreeRef = useRef<FileTreeHandle>(null)
  const revealNonce = useRef(0)
  const [reveal, setReveal] = useState<{ line: number; col: number; nonce: number } | undefined>()

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

  // abre um workspace por caminho (projetos recentes)
  const openWorkspacePath = useCallback(async (path: string) => {
    setFsError(null)
    try {
      setWorkspaceRoot(await setWorkspace(path))
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
      setRecents(removeRecent(path)) // pasta sumiu → tira dos recentes
    }
  }, [])

  // roda uma tarefa do projeto: abre o terminal e injeta o comando no PTY
  const runTask = useCallback((command: string) => {
    setTerminalOpen(true)
    setTerminalCommand({ text: command, nonce: ++terminalCmdNonce.current })
  }, [])

  // registra o workspace nos recentes sempre que ele muda
  useEffect(() => {
    if (workspaceRoot) setRecents(addRecent(workspaceRoot))
  }, [workspaceRoot])

  // carrega as tarefas (.pykortex/tasks.json) do workspace atual
  useEffect(() => {
    if (!workspaceRoot) {
      setTasks([])
      return
    }
    void loadTasks().then(setTasks)
  }, [workspaceRoot])

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

  // git: mostra o diff do arquivo (HEAD vs working) no DiffEditor
  const showDiff = useCallback(async (path: string) => {
    const [original, modified] = await Promise.all([
      gitShow(path)
        .then((r) => r.content)
        .catch(() => ''),
      readFile(path).catch(() => '')
    ])
    setDiffView({ title: path, original, modified, language: languageFromPath(path) })
  }, [])

  // extensões: carrega .pykortex/extensions.py se a pasta for confiável
  const maybeLoadExtensions = useCallback(
    async (root: string) => {
      if (extDismissed.current.has(root)) return // usuário já recusou nesta sessão
      let code: string
      try {
        code = await readFile(EXTENSIONS_PATH)
      } catch {
        return // sem extensões nesta pasta
      }
      if (!loadTrusted().has(root)) {
        const ok = window.confirm(
          `Esta pasta tem extensões PyKortex (${EXTENSIONS_PATH}).\n\n` +
            'Elas executam Python com ACESSO TOTAL ao seu kernel — como rodar um script.\n\n' +
            'Confiar nesta pasta e carregar as extensões?'
        )
        if (!ok) {
          extDismissed.current.add(root)
          return
        }
        trustWorkspace(root)
      }
      execute(code) // registra os @pk.command / @pk.viewer / @pk.panel
    },
    [execute]
  )

  // git: diff de um arquivo num commit específico (pai vs commit)
  const showCommitDiff = useCallback(async (hash: string, path: string) => {
    const [original, modified] = await Promise.all([
      gitShow(path, `${hash}^`)
        .then((r) => r.content)
        .catch(() => ''),
      gitShow(path, hash)
        .then((r) => r.content)
        .catch(() => '')
    ])
    setDiffView({
      title: `${path} @ ${hash.slice(0, 7)}`,
      original,
      modified,
      language: languageFromPath(path)
    })
  }, [])

  // go-to-definition cross-file: abre o arquivo (se no workspace) e posiciona
  const onOpenDefinition = useCallback(
    async (absPath: string, line: number, col: number) => {
      if (!workspaceRoot) {
        setFsError('Abra a pasta do projeto para navegar até a definição.')
        return
      }
      const rel = toWorkspaceRelative(absPath, workspaceRoot)
      if (!rel) {
        setFsError(`Definição em biblioteca externa: ${absPath}:${line}`)
        return
      }
      await openFile(rel)
      setReveal({ line, col, nonce: ++revealNonce.current })
    },
    [workspaceRoot, openFile]
  )

  // abre um arquivo (caminho RELATIVO) numa linha — usado pela busca global
  const openAtLine = useCallback(
    async (rel: string, line: number, col: number) => {
      await openFile(rel)
      setReveal({ line, col, nonce: ++revealNonce.current })
    },
    [openFile]
  )

  // --- debug (debugpy via /ws/debug) ---
  const onDebugStopped = useCallback(
    (stop: DebugStop) => {
      if (stop.path) {
        void openFile(stop.path)
        setReveal({ line: stop.line ?? 1, col: 0, nonce: ++revealNonce.current })
      }
      setSidebarView('debug')
    },
    [openFile]
  )
  const {
    status: debugStatus,
    pausedAt,
    scopes: debugScopes,
    selectedFrame,
    output: debugOutput,
    start: startDebug,
    cont: debugContinue,
    stepOver,
    stepIn,
    stepOut,
    selectFrame,
    stopDebug
  } = useDebug(onDebugStopped)

  const toggleBreakpoint = useCallback((path: string, line: number) => {
    setBreakpoints((prev) => {
      const lines = prev[path] ?? []
      const next = lines.includes(line)
        ? lines.filter((l) => l !== line)
        : [...lines, line].sort((a, b) => a - b)
      const updated = { ...prev, [path]: next }
      if (next.length === 0) delete updated[path]
      return updated
    })
  }, [])

  const startDebugging = useCallback(async () => {
    const t = tabs.find((x) => x.id === activeId)
    if (!t?.path) {
      setFsError('Salve o arquivo para depurar (o Debug roda o arquivo do disco).')
      return
    }
    try {
      await writeFile(t.path, t.code) // garante o disco atualizado
      setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, saved: t.code } : x)))
      setSidebarView('debug')
      await startDebug(t.path, breakpoints)
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [tabs, activeId, breakpoints, startDebug])

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

  // controles de debug acessíveis ao keydown (sem recriar o listener)
  const debugKeysRef = useRef({
    status: debugStatus,
    cont: debugContinue,
    stepOver,
    stepIn,
    stepOut,
    stop: stopDebug,
    start: startDebugging
  })
  debugKeysRef.current = {
    status: debugStatus,
    cont: debugContinue,
    stepOver,
    stepIn,
    stepOut,
    stop: stopDebug,
    start: startDebugging
  }

  // Ctrl+` terminal · Ctrl+Shift+P paleta · Ctrl+Shift+F busca · F5/F10/F11 debug
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const d = debugKeysRef.current
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        setTerminalOpen((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSidebarView('search')
      } else if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault()
        if (d.status !== 'idle') d.stop()
      } else if (e.key === 'F5') {
        e.preventDefault()
        if (d.status === 'paused') d.cont()
        else if (d.status === 'idle') void d.start()
      } else if (e.key === 'F10') {
        if (d.status === 'paused') {
          e.preventDefault()
          d.stepOver()
        }
      } else if (e.key === 'F11') {
        if (d.status === 'paused') {
          e.preventDefault()
          if (e.shiftKey) d.stepOut()
          else d.stepIn()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // carrega as extensões da pasta — 1x por (workspace, epoch do kernel), pra
  // recarregar também após restart (o namespace zera)
  useEffect(() => {
    if (conn !== 'open' || !workspaceRoot) return
    const key = `${workspaceRoot}#${kernelEpoch}`
    if (extLoaded.current.has(key)) return
    extLoaded.current.add(key)
    void maybeLoadExtensions(workspaceRoot)
  }, [conn, workspaceRoot, kernelEpoch, maybeLoadExtensions])

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

      <main
        className="main main--resizable"
        style={{
          gridTemplateColumns: `48px ${layout.sidebarW}px 6px minmax(0, 1fr) 6px ${layout.outputW}px`
        }}
      >
        <nav className="activitybar">
          {SIDEBAR_VIEWS.map((v) => (
            <button
              key={v.id}
              className={`activity${sidebarView === v.id ? ' activity--active' : ''}`}
              title={v.label}
              onClick={() => setSidebarView(v.id)}
            >
              <span className="activity__icon">{v.icon}</span>
              {v.id === 'debug' && debugStatus === 'paused' && <span className="activity__dot" />}
            </button>
          ))}
        </nav>

        <aside className="pane pane--sidebar">
          <div className="sidebar-section sidebar-section--files">
            <div className="pane__head">
              <span className="sidebar-title">
                {SIDEBAR_VIEWS.find((v) => v.id === sidebarView)?.label}
              </span>
              {sidebarView === 'files' && (
                <div className="actions">
                  <button onClick={openFolder}>Abrir pasta…</button>
                </div>
              )}
            </div>
            {sidebarView === 'files' ? (
              <>
                {workspaceRoot && (
                  <div className="ws-root" title={workspaceRoot}>
                    {workspaceRoot}
                  </div>
                )}
                {!workspaceRoot && recents.length > 0 && (
                  <div className="recents">
                    <div className="recents__title">Projetos recentes</div>
                    {recents.map((p) => (
                      <div key={p} className="recents__item">
                        <button
                          className="recents__open"
                          title={p}
                          onClick={() => void openWorkspacePath(p)}
                        >
                          <span className="recents__name">{basename(p)}</span>
                          <span className="recents__path">{p}</span>
                        </button>
                        <button
                          className="recents__remove"
                          title="Remover dos recentes"
                          onClick={() => setRecents(removeRecent(p))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <FileTree
                  ref={fileTreeRef}
                  root={workspaceRoot}
                  activePath={active?.path ?? null}
                  onOpen={openFile}
                  onPathChanged={onPathChanged}
                />
              </>
            ) : sidebarView === 'git' ? (
              <GitPanel root={workspaceRoot} onOpen={showDiff} onShowCommitDiff={showCommitDiff} />
            ) : sidebarView === 'search' ? (
              <SearchPanel onOpen={openAtLine} />
            ) : sidebarView === 'debug' ? (
              <DebugPanel
                status={debugStatus}
                pausedAt={pausedAt}
                scopes={debugScopes}
                selectedFrame={selectedFrame}
                output={debugOutput}
                onContinue={debugContinue}
                onStepOver={stepOver}
                onStepIn={stepIn}
                onStepOut={stepOut}
                onStop={stopDebug}
                onSelectFrame={selectFrame}
              />
            ) : (
              <PanelsView
                listPanels={listPanels}
                renderPanel={renderPanel}
                onRunCommand={runCommand}
                epoch={kernelEpoch}
              />
            )}
          </div>
          <Splitter
            orientation="h"
            onDrag={(dy) =>
              setLayout((l) => ({ ...l, varsH: clamp(l.varsH - dy, 80, 600) }))
            }
          />
          <div
            className="sidebar-section sidebar-section--vars"
            style={{ height: layout.varsH, flex: 'none' }}
          >
            <VariableExplorer
              variables={variables}
              onRefresh={inspect}
              onShow={run}
              onClear={clearVars}
            />
          </div>
        </aside>

        <Splitter
          orientation="v"
          onDrag={(dx) =>
            setLayout((l) => ({ ...l, sidebarW: clamp(l.sidebarW + dx, 160, 640) }))
          }
        />

        <section className="pane pane--editor">
          {diffView ? (
            <DiffView data={diffView} onClose={() => setDiffView(null)} />
          ) : (
            <>
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
              <button
                onClick={() => void startDebugging()}
                disabled={!connected || !active?.path || debugStatus !== 'idle'}
                title="Depurar este arquivo (breakpoints na margem esquerda)"
              >
                🐞 Debug
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
              onComplete={complete}
              onLint={lint}
              onHover={hover}
              onSignature={signatures}
              onGoto={goto}
              onOpenDefinition={onOpenDefinition}
              reveal={reveal}
              breakpoints={active?.path ? (breakpoints[active.path] ?? []) : []}
              onToggleBreakpoint={(line) => {
                if (active?.path) toggleBreakpoint(active.path, line)
              }}
              debugLine={
                pausedAt && active?.path && pausedAt.path === active.path ? pausedAt.line : null
              }
            />
          </div>
          <div className="hint">
            Ctrl+Enter: célula · Shift+Enter: célula e avança · Ctrl+Shift+Enter: tudo · Ctrl+S:
            salvar · células com <code>{'# %%'}</code>
          </div>
            </>
          )}
        </section>

        <Splitter
          orientation="v"
          onDrag={(dx) =>
            setLayout((l) => ({ ...l, outputW: clamp(l.outputW - dx, 260, 1000) }))
          }
        />

        <section className="pane pane--output">
          <div className="pane__head">
            <span>Console</span>
          </div>
          {errorText && <div className="banner banner--error">{errorText}</div>}
          <ConsoleView
            executions={executions}
            fetchPage={pageDataFrame}
            onRequest={requestApp}
            onTrace={traceApp}
            onQuery={queryEngine}
          />
        </section>
      </main>

      {terminalOpen && (
        <>
          <Splitter
            orientation="h"
            onDrag={(dy) =>
              setLayout((l) => ({ ...l, terminalH: clamp(l.terminalH - dy, 120, 700) }))
            }
          />
          <TerminalPanel
            onClose={() => setTerminalOpen(false)}
            command={terminalCommand}
            height={layout.terminalH}
          />
        </>
      )}

      <StatusBar
        conn={conn}
        kernel={kernel}
        stats={stats}
        execCount={execCount}
        varCount={variables.length}
        terminalOpen={terminalOpen}
        tasks={tasks}
        onRunTask={runTask}
        onToggleTerminal={() => setTerminalOpen((v) => !v)}
        onInterrupt={interrupt}
        onRestart={restart}
      />

      {paletteOpen && (
        <CommandPalette
          listCommands={listCommands}
          commandInputs={commandInputs}
          onRun={runCommand}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  )
}
