/**
 * Modelo de "células" estilo Spyder/VSCode: o arquivo é dividido por linhas
 * marcadoras `# %%` (com título opcional após). Permite executar o bloco onde
 * o cursor está, sem precisar de um documento de notebook separado.
 */

export interface Cell {
  /** índice da célula (0-based) */
  index: number
  /** título opcional após o marcador (`# %% carregar dados` -> "carregar dados") */
  title: string | null
  /** linha (1-based) onde a célula começa: a linha do marcador, ou 1 na primeira */
  startLine: number
  /** linha (1-based) onde a célula termina (inclusive) */
  endLine: number
  /** código da célula, SEM a linha do marcador */
  code: string
}

const MARKER = /^#\s*%%(.*)$/

/** Divide o texto completo em células pelos marcadores `# %%`. */
export function parseCells(source: string): Cell[] {
  const lines = source.split('\n')
  const cells: Cell[] = []

  let curStart = 1 // 1-based
  let curTitle: string | null = null
  let curBody: string[] = []

  const push = (endLine: number): void => {
    cells.push({
      index: cells.length,
      title: curTitle,
      startLine: curStart,
      endLine,
      code: curBody.join('\n')
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(MARKER)
    if (m) {
      // fecha a célula anterior (se já acumulou algo ou não é o topo do arquivo)
      if (i > 0) push(i) // endLine = linha anterior (1-based: i, pois i é 0-based desta)
      curStart = i + 1
      curTitle = m[1].trim() || null
      curBody = []
    } else {
      curBody.push(line)
    }
  }
  push(lines.length)

  return cells
}

/** Retorna a célula que contém a linha (1-based) do cursor. */
export function cellAtLine(cells: Cell[], line: number): Cell | null {
  for (const c of cells) {
    if (line >= c.startLine && line <= c.endLine) return c
  }
  return cells.length > 0 ? cells[cells.length - 1] : null
}
