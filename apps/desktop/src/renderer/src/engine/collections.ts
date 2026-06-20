/**
 * Coleções de requests FastAPI salvos (estilo Postman), persistidos no
 * localStorage. Não guardamos o `handle` do app (ele expira) — no replay,
 * injetamos o handle do app exibido no momento.
 */
import type { ApiRequestOpts } from './protocol'

const KEY = 'pykortex.apiCollections.v1'

export interface SavedRequest {
  id: string
  name: string
  appTitle: string
  savedAt: number
  request: Omit<ApiRequestOpts, 'handle'>
}

export function loadCollections(): SavedRequest[] {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as SavedRequest[]) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function saveCollections(list: SavedRequest[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* best-effort */
  }
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
