"""Construção dos payloads de display (JSON-safe)."""

from __future__ import annotations

import math
from typing import Any


def _jsonable(v: Any) -> Any:
    """Converte um valor de célula para algo serializável em JSON estrito.

    Trata NaN/Inf (viram None), tipos numpy/pandas (via .item()) e cai para
    str() quando não há representação melhor.
    """
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        # numpy.float64 é subclasse de float; NaN/Inf não são JSON válido
        return v if math.isfinite(v) else None
    if isinstance(v, str):
        return v
    try:
        import pandas as pd

        if pd.isna(v):
            return None
    except Exception:  # noqa: BLE001 - pd.isna pode recusar tipos exóticos
        pass
    item = getattr(v, "item", None)
    if callable(item):
        try:
            return _jsonable(item())
        except Exception:  # noqa: BLE001
            pass
    return str(v)


def build_dataframe_payload(df: Any, max_rows: int = 100) -> dict[str, Any]:
    """Monta o payload do MIME de DataFrame: janela de linhas + schema + shape."""
    nrows, ncols = int(df.shape[0]), int(df.shape[1])
    head = df.head(max_rows)

    columns = [{"name": str(c), "dtype": str(df[c].dtype)} for c in df.columns]

    rows: list[dict[str, Any]] = []
    for idx, values in zip(head.index, head.itertuples(index=False, name=None)):
        rows.append({"index": _jsonable(idx), "values": [_jsonable(v) for v in values]})

    return {
        "kind": "dataframe",
        "shape": [nrows, ncols],
        "columns": columns,
        "index_name": None if df.index.name is None else str(df.index.name),
        "rows": rows,
        "truncated": nrows > max_rows,
        "shown": len(rows),
    }
