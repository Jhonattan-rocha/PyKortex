import { useState } from 'react'
import { useEngine } from './engine/useEngine'
import { OutputView } from './components/OutputView'

const SAMPLE = `import sys
print("PyKortex Fase 0 — kernel:", sys.version.split()[0])
total = sum(range(1, 101))
total`

export function App(): JSX.Element {
  const { conn, kernel, outputs, errorText, execute, interrupt, clear } = useEngine()
  const [code, setCode] = useState(SAMPLE)

  const connected = conn === 'open'
  const busy = kernel === 'busy'

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">PyKortex</span>
        <span className="tag">Fase 0 · spike</span>
        <span className={`dot dot--${conn}`} />
        <span className="status">
          conexão: {conn} · kernel: {kernel}
        </span>
      </header>

      <main className="main">
        <section className="pane pane--editor">
          <div className="pane__head">
            <span>Código</span>
            <div className="actions">
              <button onClick={() => execute(code)} disabled={!connected || busy}>
                ▶ Executar
              </button>
              <button onClick={interrupt} disabled={!connected || !busy}>
                ■ Interromper
              </button>
              <button onClick={clear} disabled={outputs.length === 0}>
                Limpar
              </button>
            </div>
          </div>
          <textarea
            className="editor"
            value={code}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
                e.preventDefault()
                execute(code)
              }
            }}
          />
          <div className="hint">Ctrl/Shift + Enter para executar</div>
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
