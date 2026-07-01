import { useEffect, useState } from 'react'
import type { IdeSettings } from '../engine/settings'
import type { ProjectSettings } from '../engine/projectSettings'
import { THEMES } from '../engine/themes'
import { LANGS, useT } from '../engine/i18n'
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
  const t = useT()
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
          <div className="modal__nav-title">{t('settings.title')}</div>
          {(['geral', 'python', 'projeto'] as Section[]).map((s) => (
            <button
              key={s}
              className={`modal__nav-item${section === s ? ' modal__nav-item--active' : ''}`}
              onClick={() => setSection(s)}
            >
              {s === 'geral'
                ? t('settings.general')
                : s === 'python'
                  ? t('settings.python')
                  : t('settings.project')}
            </button>
          ))}
          <button className="modal__close" onClick={onClose} title={t('settings.close')}>
            ✕
          </button>
        </nav>

        <div className="modal__body">
          {section === 'geral' && (
            <div className="settings">
              <label className="settings__row">
                <span>{t('settings.language')}</span>
                <select
                  value={settings.language}
                  onChange={(e) => set({ language: e.target.value as IdeSettings['language'] })}
                >
                  {LANGS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings__row">
                <span>{t('settings.theme')}</span>
                <select value={settings.theme} onChange={(e) => set({ theme: e.target.value })}>
                  {THEMES.map((th) => (
                    <option key={th.id} value={th.id}>
                      {th.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings__row">
                <span>{t('settings.accent')}</span>
                <input
                  type="color"
                  value={settings.accent}
                  onChange={(e) => set({ accent: e.target.value })}
                />
              </label>
              <label className="settings__row">
                <span>{t('settings.fontSize')}</span>
                <input
                  type="number"
                  min={9}
                  max={28}
                  value={settings.fontSize}
                  onChange={(e) => set({ fontSize: Number(e.target.value) || 13 })}
                />
              </label>
              <label className="settings__row">
                <span>{t('settings.tabSize')}</span>
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
                <span>{t('settings.autosave')}</span>
              </label>
            </div>
          )}

          {section === 'python' && (
            <PythonSection settings={settings} onChange={onChange} onApply={onApplyPython} />
          )}

          {section === 'projeto' && (
            <div className="settings">
              {!hasWorkspace ? (
                <div className="settings__hint">{t('settings.projectNeedsFolder')}</div>
              ) : (
                <>
                  <label className="settings__row">
                    <span>{t('settings.projectName')}</span>
                    <input
                      value={project.name ?? ''}
                      placeholder={t('settings.projectNameHint')}
                      onChange={(e) => onChangeProject({ ...project, name: e.target.value })}
                    />
                  </label>
                  <label className="settings__row">
                    <span>{t('settings.projectTheme')}</span>
                    <select
                      value={project.theme ?? ''}
                      onChange={(e) =>
                        onChangeProject({ ...project, theme: e.target.value || undefined })
                      }
                    >
                      <option value="">{t('settings.themeDefault')}</option>
                      {THEMES.map((th) => (
                        <option key={th.id} value={th.id}>
                          {th.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings__hint">
                    {t('settings.projectSavedIn', { file: '.pykortex/settings.json' })}
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
  const t = useT()
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
      <div className="settings__h">{t('settings.py.interpreter')}</div>
      {loading ? (
        <div className="settings__hint">{t('settings.py.detecting')}</div>
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
              <span className="py-item__path">{t('settings.py.default')}</span>
              <span className="py-item__meta">{t('settings.py.defaultMeta')}</span>
            </span>
          </label>
          {pythons.map((p) => (
            <label
              key={p.path}
              className={`py-item${!p.ipykernel ? ' py-item--disabled' : ''}`}
              title={!p.ipykernel ? t('settings.py.noIpykernel') : p.path}
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
        {t('settings.py.env')}
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
          {t('settings.py.addVar')}
        </button>
      </div>

      <div className="py-apply">
        <button className="py-apply__btn" onClick={apply}>
          {t('settings.py.apply')}
        </button>
        {active && (
          <span className="settings__hint">
            {t('settings.py.active', {
              name: active.interpreter ? active.interpreter : t('settings.py.default')
            })}
          </span>
        )}
      </div>
    </div>
  )
}
