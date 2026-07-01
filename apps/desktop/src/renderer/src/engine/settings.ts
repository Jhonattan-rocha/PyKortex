/** Configurações gerais da IDE — persistidas em localStorage. */

export interface IdeSettings {
  theme: string // id de um tema (ver themes.ts)
  accent: string // cor de destaque (#rrggbb)
  fontSize: number // tamanho da fonte do editor
  tabSize: number // largura do tab no editor
  language: 'pt' | 'en' // idioma da interface
  pythonInterpreter: string // caminho do python do kernel ('' = padrão do engine)
  pythonEnv: Record<string, string> // variáveis de ambiente do kernel
}

const KEY = 'pykortex.settings.v1'
const DEFAULTS: IdeSettings = {
  theme: 'dark',
  accent: '#0e9f6e',
  fontSize: 13,
  tabSize: 4,
  language: 'pt',
  pythonInterpreter: '',
  pythonEnv: {}
}

export function loadSettings(): IdeSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<IdeSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: IdeSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
