/**
 * Posições das tabelas no ERD, persistidas por "assinatura" do schema (conjunto
 * de nomes de tabela). Assim o layout que você arrastou volta na próxima vez que
 * o mesmo schema for exibido.
 */
const KEY = 'pykortex.erdLayouts.v1'

export interface Pos {
  x: number
  y: number
}
export type Layout = Record<string, Pos> // tabela -> posição

function loadAll(): Record<string, Layout> {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as Record<string, Layout>) : {}
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function loadLayout(signature: string): Layout {
  return loadAll()[signature] ?? {}
}

export function saveLayout(signature: string, layout: Layout): void {
  try {
    const all = loadAll()
    all[signature] = layout
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* best-effort */
  }
}
