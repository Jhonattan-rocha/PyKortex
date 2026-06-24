import { useEffect, useRef, useState } from 'react'
import type { PkCommand } from '../engine/protocol'

/** Paleta de comandos (Ctrl+Shift+P): lista e roda os @pk.command registrados. */
export function CommandPalette({
  listCommands,
  onRun,
  onClose
}: {
  listCommands: () => Promise<PkCommand[]>
  onRun: (name: string) => void
  onClose: () => void
}): JSX.Element {
  const [commands, setCommands] = useState<PkCommand[]>([])
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    void listCommands().then(setCommands)
  }, [listCommands])

  const filtered = commands.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
  const clamped = Math.min(active, Math.max(0, filtered.length - 1))

  const run = (name: string): void => {
    onRun(name)
    onClose()
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Comando…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const c = filtered[clamped]
              if (c) run(c.name)
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
        />
        <div className="palette__list">
          {filtered.length === 0 ? (
            <div className="palette__empty">
              Nenhum comando. Defina com <code>@pk.command</code> em{' '}
              <code>.pykortex/extensions.py</code>.
            </div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.name}
                className={`palette__item${i === clamped ? ' palette__item--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c.name)}
              >
                {c.name}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
