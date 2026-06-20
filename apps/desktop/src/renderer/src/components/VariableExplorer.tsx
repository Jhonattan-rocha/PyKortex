import type { VariableInfo } from '../engine/protocol'

const KIND_LABEL: Record<VariableInfo['kind'], string> = {
  DataFrame: 'DF',
  Series: 'Sr',
  ndarray: 'np',
  collection: '[ ]',
  scalar: '#',
  str: 'ab',
  other: '·'
}

/** Painel de variáveis vivas do kernel. Clicar exibe a variável no console. */
export function VariableExplorer({
  variables,
  onRefresh,
  onShow,
  onClear
}: {
  variables: VariableInfo[]
  onRefresh: () => void
  onShow: (name: string) => void
  onClear: () => void
}): JSX.Element {
  return (
    <div className="vars">
      <div className="pane__head">
        <span>Variáveis{variables.length > 0 ? ` (${variables.length})` : ''}</span>
        <div className="actions">
          <button
            onClick={() => {
              if (
                variables.length > 0 &&
                window.confirm('Limpar todas as variáveis do kernel? (imports e funções são mantidos)')
              ) {
                onClear()
              }
            }}
            disabled={variables.length === 0}
            title="Limpar variáveis (libera memória; mantém o kernel)"
          >
            🧹
          </button>
          <button onClick={onRefresh} title="Atualizar variáveis">
            ⟳
          </button>
        </div>
      </div>
      <div className="vars__list">
        {variables.length === 0 ? (
          <div className="vars__empty">Nenhuma variável no kernel.</div>
        ) : (
          variables.map((v) => (
            <div
              key={v.name}
              className="var-row"
              onClick={() => onShow(v.name)}
              title={`${v.type}\n${v.summary}\n(clique para exibir)`}
            >
              <span className={`var-kind var-kind--${v.kind}`}>{KIND_LABEL[v.kind]}</span>
              <span className="var-name">{v.name}</span>
              <span className="var-summary">{v.summary}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
