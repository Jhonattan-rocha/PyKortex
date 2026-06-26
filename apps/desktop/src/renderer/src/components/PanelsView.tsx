import { useCallback, useEffect, useState } from 'react'
import type { PkPanel } from '../engine/protocol'

/**
 * Painéis customizados (@pk.panel): lista e renderiza o HTML retornado pelo
 * Python. Botões com data-pk-command="X" rodam o comando X e recarregam.
 */
export function PanelsView({
  listPanels,
  renderPanel,
  onRunCommand,
  epoch
}: {
  listPanels: () => Promise<PkPanel[]>
  renderPanel: (name: string) => Promise<{ html: string }>
  onRunCommand: (name: string) => void
  epoch: number
}): JSX.Element {
  const [panels, setPanels] = useState<PkPanel[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [html, setHtml] = useState('')

  const refreshList = useCallback(() => {
    void listPanels().then(setPanels)
  }, [listPanels])

  // recarrega a lista ao montar e quando o kernel reinicia (epoch muda)
  useEffect(() => {
    refreshList()
  }, [refreshList, epoch])

  const open = useCallback(
    async (name: string) => {
      setSelected(name)
      setHtml(await renderPanel(name).then((r) => r.html))
    },
    [renderPanel]
  )

  const handleClick = (e: React.MouseEvent): void => {
    const el = (e.target as HTMLElement).closest('[data-pk-command]')
    if (!el) return
    e.preventDefault()
    const cmd = el.getAttribute('data-pk-command')
    if (cmd) {
      onRunCommand(cmd)
      if (selected) void open(selected) // re-renderiza após o efeito do comando
    }
  }

  return (
    <div className="panels">
      <div className="panels__list">
        {panels.length === 0 ? (
          <div className="panels__empty">
            Nenhum painel. Defina com <code>@pk.panel</code>.
          </div>
        ) : (
          panels.map((p) => (
            <button
              key={p.name}
              className={`panels__tab${selected === p.name ? ' panels__tab--active' : ''}`}
              onClick={() => void open(p.name)}
            >
              {p.name}
            </button>
          ))
        )}
        <button className="panels__refresh" title="Atualizar lista" onClick={refreshList}>
          ⟳
        </button>
      </div>

      {selected && (
        <div className="panels__view">
          <div className="panels__bar">
            <span>{selected}</span>
            <button onClick={() => void open(selected)} title="Recarregar painel">
              ⟳
            </button>
          </div>
          <div
            className="panels__html"
            onClick={handleClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  )
}
