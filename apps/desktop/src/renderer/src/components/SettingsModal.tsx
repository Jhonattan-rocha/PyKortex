import { useEffect, useState } from 'react'
import type { IdeSettings } from '../engine/settings'
import type { ProjectSettings } from '../engine/projectSettings'
import { THEMES } from '../engine/themes'
import {
  getPythonConfig,
  listPythons,
  type PythonConfig,
  type PythonInterpreter
} from '../engine/pythonClient'

type Section = 'geral' | 'python' | 'projeto'

/** Modal de configurações com navegação por seções (cresce na vertical). */
export function SettingsModal({
  settings,
  onChange,
  project,
  onChangeProject,
  hasWorkspace,
  autoSave,
  onToggleAutoSave,
  onApplyPython,
  onClose
}: {
  settings: IdeSettings
  onChange: (s: IdeSettings) => void
  project: ProjectSettings
  onChangeProject: (s: ProjectSettings) => void
  hasWorkspace: boolean
  autoSave: boolean
  onToggleAutoSave: (v: boolean) => void
  onApplyPython: (interpreter: string | null, env: Record<string, string>) => void
  onClose: () => void
}): JSX.Element {
  const [section, setSection] = useState<Section>('geral')
  const set = (patch: Partial<IdeSettings>): void => onChange({ ...settings, ...patch })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <nav className="modal__nav">
          <div className="modal__nav-title">Configurações</div>
          {(['geral', 'python', 'projeto'] as Section[]).map((s) => (
            <button
              key={s}
              className={`modal__nav-item${section === s ? ' modal__nav-item--active' : ''}`}
              onClick={() => setSection(s)}
            >
              {s === 'geral' ? 'Geral' : s === 'python' ? 'Python' : 'Projeto'}
            </button>
          ))}
          <button className="modal__close" onClick={onClose} title="Fechar (Esc)">
            ✕
          </button>
        </nav>

        <div className="modal__body">
          {section === 'geral' && (
            <div className="settings">
              <label className="settings__row">
                <span>Tema</span>
                <select value={settings.theme} onChange={(e) => set({ theme: e.target.value })}>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings__row">
                <span>Cor de destaque</span>
                <input
                  type="color"
                  value={settings.accent}
                  onChange={(e) => set({ accent: e.target.value })}
                />
              </label>
              <label className="settings__row">
                <span>Fonte do editor</span>
                <input
                  type="number"
                  min={9}
                  max={28}
                  value={settings.fontSize}
                  onChange={(e) => set({ fontSize: Number(e.target.value) || 13 })}
                />
              </label>
              <label className="settings__row">
                <span>Largura do tab</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={settings.tabSize}
                  onChange={(e) => set({ tabSize: Number(e.target.value) || 4 })}
                />
              </label>
              <label className="settings__row settings__row--check">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => onToggleAutoSave(e.target.checked)}
                />
                <span>Auto save</span>
              </label>
            </div>
          )}

          {section === 'python' && (
            <PythonSection settings={settings} onChange={onChange} onApply={onApplyPython} />
          )}

          {section === 'projeto' && (
            <div className="settings">
              {!hasWorkspace ? (
                <div className="settings__hint">Abra uma pasta para configurar o projeto.</div>
              ) : (
                <>
                  <label className="settings__row">
                    <span>Nome</span>
                    <input
                      value={project.name ?? ''}
                      placeholder="(opcional)"
                      onChange={(e) => onChangeProject({ ...project, name: e.target.value })}
                    />
                  </label>
                  <label className="settings__row">
                    <span>Tema do projeto</span>
                    <select
                      value={project.theme ?? ''}
                      onChange={(e) =>
                        onChangeProject({ ...project, theme: e.target.value || undefined })
                      }
                    >
                      <option value="">Padrão (IDE)</option>
                      {THEMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings__hint">
                    Salvo em <code>.pykortex/settings.json</code> (versionável com o projeto).
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PythonSection({
  settings,
  onChange,
  onApply
}: {
  settings: IdeSettings
  onChange: (s: IdeSettings) => void
  onApply: (interpreter: string | null, env: Record<string, string>) => void
}): JSX.Element {
  const [pythons, setPythons] = useState<PythonInterpreter[]>([])
  const [active, setActive] = useState<PythonConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(settings.pythonInterpreter)
  const [rows, setRows] = useState<{ k: string; v: string }[]>(
    Object.entries(settings.pythonEnv).map(([k, v]) => ({ k, v }))
  )

  useEffect(() => {
    let ok = true
    void Promise.all([listPythons(), getPythonConfig()])
      .then(([list, cfg]) => {
        if (!ok) return
        setPythons(list)
        setActive(cfg)
      })
      .finally(() => ok && setLoading(false))
    return () => {
      ok = false
    }
  }, [])

  const env = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const { k, v } of rows) if (k.trim()) out[k.trim()] = v
    return out
  }

  const apply = (): void => {
    const e = env()
    onChange({ ...settings, pythonInterpreter: selected, pythonEnv: e })
    onApply(selected || null, e)
  }

  return (
    <div className="settings">
      <div className="settings__h">Interpretador do kernel</div>
      {loading ? (
        <div className="settings__hint">detectando…</div>
      ) : (
        <div className="py-list">
          <label className="py-item">
            <input
              type="radio"
              checked={selected === ''}
              onChange={() => setSelected('')}
              name="py"
            />
            <span className="py-item__main">
              <span className="py-item__path">Padrão do engine</span>
              <span className="py-item__meta">o Python que roda o PyKortex</span>
            </span>
          </label>
          {pythons.map((p) => (
            <label
              key={p.path}
              className={`py-item${!p.ipykernel ? ' py-item--disabled' : ''}`}
              title={!p.ipykernel ? 'sem ipykernel — não pode virar kernel' : p.path}
            >
              <input
                type="radio"
                name="py"
                disabled={!p.ipykernel}
                checked={selected === p.path}
                onChange={() => setSelected(p.path)}
              />
              <span className="py-item__main">
                <span className="py-item__path">{p.path}</span>
                <span className="py-item__meta">
                  Python {p.version} · {p.source}
                  {p.ipykernel ? '' : ' · sem ipykernel'}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="settings__h" style={{ marginTop: 14 }}>
        Variáveis de ambiente do kernel
      </div>
      <div className="py-env">
        {rows.map((r, i) => (
          <div key={i} className="py-env__row">
            <input
              className="py-env__k"
              placeholder="NOME"
              value={r.k}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))
              }
            />
            <input
              className="py-env__v"
              placeholder="valor"
              value={r.v}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))
              }
            />
            <button
              className="py-env__x"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="py-env__add" onClick={() => setRows((rs) => [...rs, { k: '', v: '' }])}>
          + variável
        </button>
      </div>

      <div className="py-apply">
        <button className="py-apply__btn" onClick={apply}>
          Aplicar e reiniciar o kernel
        </button>
        {active && (
          <span className="settings__hint">
            ativo: {active.interpreter ? active.interpreter : 'padrão do engine'}
          </span>
        )}
      </div>
    </div>
  )
}
