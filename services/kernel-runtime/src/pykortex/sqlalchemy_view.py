"""Viewer de schema SQLAlchemy — introspecta o MetaData VIVO (tabelas + relações).

Mostra o ERD a partir dos modelos definidos no kernel, sem precisar de conexão
com o banco. Exiba `Base.metadata` (ou um objeto MetaData) para visualizar.

Importado condicionalmente por runtime.activate (só se sqlalchemy instalado).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import MetaData

from pykortex.api import viewer
from pykortex.mime import SQLALCHEMY_MIME


def build_metadata_payload(metadata: MetaData) -> dict[str, Any]:
    try:
        ordered = list(metadata.sorted_tables)
    except Exception:  # noqa: BLE001 - ciclos de dependência caem para ordem natural
        ordered = list(metadata.tables.values())

    tables: list[dict[str, Any]] = []
    relationships: list[dict[str, str]] = []

    for table in ordered:
        columns: list[dict[str, Any]] = []
        for col in table.columns:
            fk_target = None
            if col.foreign_keys:
                fk_target = next(iter(col.foreign_keys)).target_fullname
            columns.append(
                {
                    "name": col.name,
                    "type": str(col.type),
                    "pk": bool(col.primary_key),
                    "nullable": bool(col.nullable),
                    "unique": bool(col.unique),
                    "fk": fk_target,
                }
            )
        tables.append({"name": table.name, "columns": columns})

        for fk in table.foreign_keys:
            try:
                relationships.append(
                    {
                        "from_table": table.name,
                        "from_col": fk.parent.name,
                        "to_table": fk.column.table.name,
                        "to_col": fk.column.name,
                    }
                )
            except Exception:  # noqa: BLE001
                pass

    return {
        "kind": "sqlalchemy",
        "count": len(tables),
        "tables": tables,
        "relationships": relationships,
    }


@viewer(MetaData)
def _view_metadata(metadata: MetaData) -> dict[str, Any]:
    payload = build_metadata_payload(metadata)
    return {
        SQLALCHEMY_MIME: payload,
        "text/plain": f"MetaData — {payload['count']} tabela(s)",
    }
