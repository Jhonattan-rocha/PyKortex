/**
 * Persistência do estado da IDE (workspace + abas) no localStorage.
 *
 * Guardamos apenas metadados das abas (caminho); o conteúdo de arquivos é
 * relido do disco na restauração. O buffer "scratch" (sem arquivo) tem o
 * conteúdo persistido, pra não se perder entre sessões.
 */

const KEY = 'pykortex.workspaceState.v1'

export interface PersistedState {
  workspaceRoot: string | null
  /** abas abertas: path null = scratch */
  tabs: { id: string; path: string | null }[]
  scratchCode: string
  activeId: string
  autoSave: boolean
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedState
    if (!Array.isArray(data.tabs)) return null
    return data
  } catch {
    return null
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota/serialização: persistência é best-effort */
  }
}
