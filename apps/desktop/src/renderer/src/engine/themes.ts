/** Temas da IDE. Cada tema é um conjunto de variáveis CSS (em styles.css via
 *  [data-theme="..."]). Aplicar = setar data-theme + a cor de destaque. */

export interface Theme {
  id: string
  label: string
  monaco: 'vs' | 'vs-dark' // tema correspondente do Monaco/diff
}

export const THEMES: Theme[] = [
  { id: 'dark', label: 'Escuro', monaco: 'vs-dark' },
  { id: 'light', label: 'Claro', monaco: 'vs' },
  { id: 'midnight', label: 'Meia-noite', monaco: 'vs-dark' }
]

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Aplica o tema ao documento: 'dark' usa o :root padrão; demais via data-theme. */
export function applyTheme(themeId: string, accent: string): void {
  const root = document.documentElement
  if (themeId === 'dark') root.removeAttribute('data-theme')
  else root.dataset.theme = themeId
  if (accent) root.style.setProperty('--accent', accent)
}
