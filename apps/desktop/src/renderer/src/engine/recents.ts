/** Projetos recentes — persistidos em localStorage (lista de paths absolutos). */

const KEY = 'pykortex.recentProjects.v1'
const MAX = 8

export function loadRecents(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(arr) ? (arr.filter((p) => typeof p === 'string') as string[]) : []
  } catch {
    return []
  }
}

/** Põe `path` no topo (dedupe), limita a MAX e persiste. Retorna a nova lista. */
export function addRecent(path: string): string[] {
  const list = [path, ...loadRecents().filter((p) => p !== path)].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(list))
  return list
}

export function removeRecent(path: string): string[] {
  const list = loadRecents().filter((p) => p !== path)
  localStorage.setItem(KEY, JSON.stringify(list))
  return list
}
