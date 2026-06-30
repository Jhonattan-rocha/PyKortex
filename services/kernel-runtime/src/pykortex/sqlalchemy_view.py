"""Viewer de schema SQLAlchemy — introspecta o MetaData VIVO (tabelas + relações).

Dois modos:
- `Base.metadata` / `MetaData`: ERD a partir dos modelos definidos no kernel
  (sem conexão com banco).
- `Engine` (de `create_engine(...)`): REFLETE o schema REAL do banco conectado e
  permite RODAR queries ali mesmo, com o resultado como DataFrame paginável — o
  banco vivo dentro da IDE, algo que nenhuma IDE estática faz.

Importado condicionalmente por runtime.activate (só se sqlalchemy instalado).
"""

from __future__ import annotations

import json
from collections import OrderedDict
from time import perf_counter
from typing import Any

from sqlalchemy import MetaData
from sqlalchemy.engine import Engine

from pykortex.api import viewer
from pykortex.mime import SQLALCHEMY_MIME
from pykortex.view import build_dataframe_payload

# Engines registrados por handle, para o cliente de query embutido.
_ENGINES: "OrderedDict[str, Engine]" = OrderedDict()
_engine_counter = 0
# Máximo de linhas materializadas por query (paginação acontece depois disso).
_QUERY_ROWS_CAP = 5000


def _register_engine(engine: Engine) -> str:
    global _engine_counter
    _engine_counter += 1
    handle = f"eng{_engine_counter}"
    _ENGINES[handle] = engine
    _ENGINES.move_to_end(handle)
    while len(_ENGINES) > 8:
        _ENGINES.popitem(last=False)
    return handle


def query_engine_json(handle: str, args_json: str) -> str:
    """Roda SQL contra o Engine vivo e retorna JSON.

    SELECT -> DataFrame paginável (mesmo viewer de DataFrame). DML -> nº de linhas
    afetadas. args_json: {"sql"}.
    """
    engine = _ENGINES.get(handle)
    if engine is None:
        return json.dumps({"error": "engine expirado — re-exiba o Engine"})
    try:
        sql = (json.loads(args_json) or {}).get("sql", "").strip()
    except Exception:  # noqa: BLE001
        sql = ""
    if not sql:
        return json.dumps({"error": "query vazia"})

    try:
        import pandas as pd
        from sqlalchemy import text

        t0 = perf_counter()
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            if result.returns_rows:
                rows = result.fetchmany(_QUERY_ROWS_CAP + 1)
                truncated = len(rows) > _QUERY_ROWS_CAP
                df = pd.DataFrame(rows[:_QUERY_ROWS_CAP], columns=list(result.keys()))
                elapsed = (perf_counter() - t0) * 1000
                return json.dumps(
                    {
                        "result": build_dataframe_payload(df),
                        "rowcount": int(len(df)),
                        "truncated": truncated,
                        "elapsed_ms": round(elapsed, 1),
                    }
                )
            conn.commit()  # DML: persiste (é o banco/engine do próprio usuário)
            elapsed = (perf_counter() - t0) * 1000
            return json.dumps(
                {
                    "message": f"{result.rowcount} linha(s) afetada(s)",
                    "elapsed_ms": round(elapsed, 1),
                }
            )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})


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


@viewer(Engine)
def _view_engine(engine: Engine) -> dict[str, Any]:
    """Reflete o schema REAL do banco conectado e habilita queries."""
    handle = _register_engine(engine)
    try:
        md = MetaData()
        md.reflect(bind=engine)
        payload = build_metadata_payload(md)
    except Exception as exc:  # noqa: BLE001 - conexão/reflexão pode falhar
        payload = {
            "kind": "sqlalchemy",
            "count": 0,
            "tables": [],
            "relationships": [],
            "error": f"{type(exc).__name__}: {exc}",
        }
    payload["handle"] = handle
    payload["live"] = True
    try:
        payload["dialect"] = engine.dialect.name
        payload["url"] = engine.url.render_as_string(hide_password=True)
    except Exception:  # noqa: BLE001
        pass
    return {
        SQLALCHEMY_MIME: payload,
        "text/plain": f"Engine {payload.get('dialect', '?')} — {payload['count']} tabela(s)",
    }
