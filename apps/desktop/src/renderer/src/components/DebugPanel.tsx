import type { DebugScope, DebugStatus, DebugStop } from '../engine/useDebug'

/** Painel de debug: toolbar de controle + call stack + variáveis (scopes). */
export function DebugPanel({
  status,
  pausedAt,
  scopes,
  selectedFrame,
  output,
  onContinue,
  onStepOver,
  onStepIn,
  onStepOut,
  onStop,
  onSelectFrame
}: {
  status: DebugStatus
  pausedAt: DebugStop | null
  scopes: DebugScope[]
  selectedFrame: number | null
  output: string
  onContinue: () => void
  onStepOver: () => void
  onStepIn: () => void
  onStepOut: () => void
  onStop: () => void
  onSelectFrame: (frameId: number) => void
}): JSX.Element {
  const paused = status === 'paused'

  if (status === 'idle') {
    return (
      <div className="debug">
        <div className="debug__empty">
          Nenhuma sessão. Clique na margem esquerda do editor para pôr breakpoints e use{' '}
          <strong>🐞 Debug</strong> para iniciar.
        </div>
        {output && <pre className="debug__output">{output}</pre>}
      </div>
    )
  }

  return (
    <div className="debug">
      <div className="debug__toolbar">
        <button onClick={onContinue} disabled={!paused} title="Continuar (F5)">
          ▶
        </button>
        <button onClick={onStepOver} disabled={!paused} title="Step Over (F10)">
          ⤼
        </button>
        <button onClick={onStepIn} disabled={!paused} title="Step In (F11)">
          ⤓
        </button>
        <button onClick={onStepOut} disabled={!paused} title="Step Out (Shift+F11)">
          ⤒
        </button>
        <button className="debug__stop" onClick={onStop} title="Parar (Shift+F5)">
          ■
        </button>
        <span className="debug__status">{paused ? 'pausado' : 'rodando…'}</span>
      </div>

      {paused && pausedAt && (
        <>
          <div className="debug__section-title">Pilha de chamadas</div>
          <div className="debug__stack">
            {pausedAt.frames.map((f) => (
              <div
                key={f.id}
                className={`debug__frame${f.id === selectedFrame ? ' debug__frame--active' : ''}`}
                onClick={() => onSelectFrame(f.id)}
                title={f.absPath ?? undefined}
              >
                <span className="debug__frame-name">{f.name}</span>
                <span className="debug__frame-loc">
                  {f.path ?? '<lib>'}:{f.line}
                </span>
              </div>
            ))}
          </div>

          <div className="debug__section-title">Variáveis</div>
          <div className="debug__vars">
            {scopes.map((sc) => (
              <div key={sc.name} className="debug__scope">
                <div className="debug__scope-name">{sc.name}</div>
                {sc.variables.length === 0 ? (
                  <div className="debug__var debug__var--empty">(vazio)</div>
                ) : (
                  sc.variables.map((v) => (
                    <div key={v.name} className="debug__var" title={`${v.type} ${v.value}`}>
                      <span className="debug__var-name">{v.name}</span>
                      <span className="debug__var-value">{v.value}</span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {output && <pre className="debug__output">{output}</pre>}
    </div>
  )
}
