import { useCallback, useState } from 'react'
import { useEngine } from './engine/useEngine'
import { OutputView } from './components/OutputView'
import { CodeEditor } from './editor/Editor'

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
  const { conn, kernel, outputs, errorText, execute, interrupt, clear } = useEngine()
  const [code, setCode] = useState(SAMPLE)

  const connected = conn === 'open'
  const busy = kernel === 'busy'

  // estável: usado nos comandos de teclado do Monaco (via ref interna)
  const run = useCallback(
    (src: string) => {
      if (connected) execute(src)
    },
    [connected, execute]
  )

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

      <main className="main">
        <section className="pane pane--editor">
          <div className="pane__head">
            <span>Editor</span>
            <div className="actions">
              <button onClick={() => run(code)} disabled={!connected || busy}>
                ▶ Rodar tudo
              </button>
              <button onClick={interrupt} disabled={!connected || !busy}>
                ■ Interromper
              </button>
              <button onClick={clear} disabled={outputs.length === 0}>
                Limpar saída
              </button>
            </div>
          </div>
          <div className="editor-host">
            <CodeEditor value={code} onChange={setCode} onRun={run} />
          </div>
          <div className="hint">
            Ctrl+Enter: rodar célula · Shift+Enter: rodar e avançar · Ctrl+Shift+Enter: tudo ·
            separe células com <code>{'# %%'}</code>
          </div>
        </section>

        <section className="pane pane--output">
          <div className="pane__head">
            <span>Saída</span>
          </div>
          {errorText && <div className="banner banner--error">{errorText}</div>}
          <OutputView outputs={outputs} />
        </section>
      </main>
    </div>
  )
}
