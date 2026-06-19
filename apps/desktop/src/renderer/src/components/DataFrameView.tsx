import type { DataFramePayload } from '../engine/protocol'

/** Renderiza o payload de DataFrame numa grade rica (cabeçalho + tipos + índice). */
export function DataFrameView({ df }: { df: DataFramePayload }): JSX.Element {
  const [nrows, ncols] = df.shape
  return (
    <div className="df">
      <div className="df__meta">
        <strong>{nrows.toLocaleString('pt-BR')}</strong> linhas ×{' '}
        <strong>{ncols.toLocaleString('pt-BR')}</strong> colunas
        {df.truncated && (
          <span className="df__trunc"> · mostrando as primeiras {df.shown}</span>
        )}
      </div>
      <div className="df__scroll">
        <table className="df__table">
          <thead>
            <tr>
              <th className="df__idx">{df.index_name ?? ''}</th>
              {df.columns.map((c, i) => (
                <th key={i} title={c.dtype}>
                  <div className="df__col">{c.name}</div>
                  <div className="df__dtype">{c.dtype}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {df.rows.map((row, ri) => (
              <tr key={ri}>
                <td className="df__idx">{fmt(row.index)}</td>
                {row.values.map((v, ci) => (
                  <td key={ci} className={cellClass(v)}>
                    {fmt(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'NaN'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  return String(v)
}

function cellClass(v: unknown): string {
  if (v === null || v === undefined) return 'df__cell df__na'
  if (typeof v === 'number') return 'df__cell df__num'
  if (typeof v === 'boolean') return 'df__cell df__bool'
  return 'df__cell'
}
