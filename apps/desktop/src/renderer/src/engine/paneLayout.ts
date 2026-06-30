/** Dimensões redimensionáveis das panes — persistidas em localStorage. */

export interface PaneLayout {
  sidebarW: number // largura do sidebar (px)
  outputW: number // largura do console/output (px)
  varsH: number // altura do explorador de variáveis no sidebar (px)
  terminalH: number // altura do terminal (px)
}

const KEY = 'pykortex.paneLayout.v1'
const DEFAULTS: PaneLayout = { sidebarW: 240, outputW: 480, varsH: 240, terminalH: 260 }

export function loadPaneLayout(): PaneLayout {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PaneLayout>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePaneLayout(layout: PaneLayout): void {
  localStorage.setItem(KEY, JSON.stringify(layout))
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))
