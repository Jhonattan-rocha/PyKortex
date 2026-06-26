import { useEffect, useRef, useState } from 'react'
import type { PkCommand, PkCommandInput } from '../engine/protocol'

/** Paleta de comandos (Ctrl+Shift+P): lista, coleta inputs e roda @pk.command. */
export function CommandPalette({
  listCommands,
  commandInputs,
  onRun,
  onClose
}: {
  listCommands: () => Promise<PkCommand[]>
  commandInputs: (name: string) => Promise<PkCommandInput[]>
  onRun: (name: string, args: Record<string, unknown>) => void
  onClose: () => void
}): JSX.Element {
  const [commands, setCommands] = useState<PkCommand[]>([])
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  // null = modo lista; preenchido = modo form (coletando inputs do comando)
  const [form, setForm] = useState<{ name: string; inputs: PkCommandInput[] } | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    void listCommands().then(setCommands)
  }, [listCommands])

  const filtered = commands.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
  const clamped = Math.min(active, Math.max(0, filtered.length - 1))

  // escolhe um comando: se tiver inputs, abre o form; senão roda direto
  const pick = async (name: string): Promise<void> => {
    const inputs = await commandInputs(name)
    if (inputs.length === 0) {
      onRun(name, {})
      onClose()
      return
    }
    const initial: Record<string, string> = {}
    for (const inp of inputs) {
      initial[inp.name] = inp.default ?? (inp.type === 'pick' ? (inp.options?.[0] ?? '') : '')
    }
    setValues(initial)
    setForm({ name, inputs })
  }

  const submitForm = (): void => {
    if (!form) return
    onRun(form.name, values)
    onClose()
  }

  if (form) {
    return (
      <div className="palette-backdrop" onClick={onClose}>
        <div className="palette" onClick={(e) => e.stopPropagation()}>
          <div className="palette__formtitle">{form.name}</div>
          <div className="palette__form">
            {form.inputs.map((inp, i) => (
              <label key={inp.name} className="palette__field">
                <span>{inp.label ?? inp.name}</span>
                {inp.type === 'pick' ? (
                  <select
                    autoFocus={i === 0}
                    value={values[inp.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                  >
                    {(inp.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoFocus={i === 0}
                    value={values[inp.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitForm()
                      else if (e.key === 'Escape') onClose()
                    }}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="palette__actions">
            <button onClick={() => setForm(null)}>Voltar</button>
            <button className="palette__primary" onClick={submitForm}>
              Rodar
            </button>
          </div>
        </div>
      </div>
    )
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
              if (c) void pick(c.name)
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
                onClick={() => void pick(c.name)}
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
