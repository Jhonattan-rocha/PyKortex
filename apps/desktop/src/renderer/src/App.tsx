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

# %% um gráfico simples (texto por enquanto)
for i in range(1, 6):
    print("#" * i)
`

export function App(): JSX.Element {
  const { conn, kernel, executions, errorText, execute, interrupt, restart, clear } = useEngine()

  const [code, setCode] = useState(SAMPLE)
  const [savedCode, setSavedCode] = useState(SAMPLE)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [openFilePath, setOpenFilePath] = useState<string | null>(null)
  const [fsError, setFsError] = useState<string | null>(null)

  const connected = conn === 'open'
  const busy = kernel === 'busy'
  const dirty = openFilePath !== null && code !== savedCode

  const run = useCallback(
    (src: string) => {
      if (connected) execute(src)
    },
    [connected, execute]
  )

  const openFolder = useCallback(async () => {
    setFsError(null)
    try {
      const path = await window.pykortex.openFolder()
      if (!path) return
      const root = await setWorkspace(path)
      setWorkspaceRoot(root)
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const openFile = useCallback(async (rel: string) => {
    setFsError(null)
    try {
      const content = await readFile(rel)
      setCode(content)
      setSavedCode(content)
      setOpenFilePath(rel)
    } catch (e) {
      setFsError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // ref pra o save mais recente (usado pelo listener global de Ctrl+S)
  const saveRef = useRef<(src: string) => void>(() => {})
  const save = useCallback(
    async (src: string) => {
      if (!openFilePath) return // buffer scratch ainda não é um arquivo
      setFsError(null)
      try {
        await writeFile(openFilePath, src)
        setSavedCode(src)
      } catch (e) {
        setFsError(e instanceof Error ? e.message : String(e))
      }
    },
    [openFilePath]
  )
  saveRef.current = save

  // Ctrl/Cmd+S fora do foco do editor: evita o diálogo do navegador e salva.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current(code)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [code])

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
          {workspaceRoot && <div className="ws-root" title={workspaceRoot}>{workspaceRoot}</div>}
          <FileTree root={workspaceRoot} activePath={openFilePath} onOpen={openFile} />
        </aside>

        <section className="pane pane--editor">
          <div className="pane__head">
            <span className="filetab">
              {openFilePath ?? 'scratch'}
              {dirty && <span className="dirty">●</span>}
            </span>
            <div className="actions">
              <button onClick={() => run(code)} disabled={!connected || busy}>
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
            <CodeEditor value={code} onChange={setCode} onRun={run} onSave={save} />
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
