import type { SqlAlchemyPayload, SaTable } from '../engine/protocol'

/** Visualização do schema SQLAlchemy: tabelas (colunas/PK/FK) + relações. */
export function SqlAlchemyView({ schema }: { schema: SqlAlchemyPayload }): JSX.Element {
  return (
    <div className="sa">
      <div className="sa__head">
        <span className="sa__title">Schema</span>
        <span className="sa__count">
          {schema.count} tabela{schema.count === 1 ? '' : 's'} · {schema.relationships.length} relaç
          {schema.relationships.length === 1 ? 'ão' : 'ões'}
        </span>
      </div>

      <div className="sa__grid">
        {schema.tables.map((t) => (
          <TableBox key={t.name} table={t} />
        ))}
      </div>

      {schema.relationships.length > 0 && (
        <div className="sa__rels">
          <div className="sa__rels-title">Relações</div>
          {schema.relationships.map((r, i) => (
            <div key={i} className="sa-rel">
              <span className="sa-rel__from">
                {r.from_table}.{r.from_col}
              </span>
              <span className="sa-rel__arrow">→</span>
              <span className="sa-rel__to">
                {r.to_table}.{r.to_col}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TableBox({ table }: { table: SaTable }): JSX.Element {
  return (
    <div className="sa-table">
      <div className="sa-table__name">{table.name}</div>
      <div className="sa-table__cols">
        {table.columns.map((c) => (
          <div key={c.name} className="sa-col" title={c.type}>
            <span className="sa-col__key">{c.pk ? '🔑' : c.fk ? '🔗' : ''}</span>
            <span className={`sa-col__name${c.pk ? ' sa-col__name--pk' : ''}`}>{c.name}</span>
            <span className="sa-col__type">{c.type}</span>
            <span className="sa-col__flags">
              {c.unique && <span className="sa-flag sa-flag--u">U</span>}
              {!c.nullable && <span className="sa-flag sa-flag--nn">NN</span>}
              {c.fk && <span className="sa-flag sa-flag--fk">→ {c.fk}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
