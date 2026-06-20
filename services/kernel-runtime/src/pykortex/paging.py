"""Cache de DataFrames exibidos, para paginação sob demanda.

Cada DataFrame renderizado recebe um ``handle`` (id). O frontend pede janelas de
linhas por esse handle; aqui resolvemos o handle de volta para o objeto e
recortamos as linhas. Mantemos um LRU pequeno com referências fortes para que
DataFrames de expressão (não ligados a nome) continuem pagináveis por um tempo.
"""

from __future__ import annotations

import json
from collections import OrderedDict
from typing import Any

from pykortex.view import _jsonable

_CACHE: "OrderedDict[str, Any]" = OrderedDict()
# Ordem de exibição memorizada por handle: {handle: (key, ndarray_de_posicoes)}.
_ORDERS: dict[str, tuple[Any, Any]] = {}
_CAP = 16
_counter = 0


def register(df: Any) -> str:
    """Registra um DataFrame e retorna seu handle (evicta o mais antigo se cheio)."""
    global _counter
    _counter += 1
    handle = f"df{_counter}"
    _CACHE[handle] = df
    _CACHE.move_to_end(handle)
    while len(_CACHE) > _CAP:
        old, _ = _CACHE.popitem(last=False)
        _ORDERS.pop(old, None)
    return handle


def _view_order(
    handle: str,
    df: Any,
    filters: dict[str, str] | None,
    sort_col: str | None,
    sort_dir: str | None,
) -> Any:
    """Posições do df na ordem da "view" (filtros + sort); None = natural completo.

    Memoiza por handle, recomputando só quando filtros ou sort mudam.
    """
    active = {k: v for k, v in (filters or {}).items() if v}
    key = (tuple(sorted(active.items())), sort_col, sort_dir)
    cached = _ORDERS.get(handle)
    if cached and cached[0] == key:
        return cached[1]

    if not active and sort_col is None:
        _ORDERS[handle] = (key, None)
        return None

    try:
        import pandas as pd

        base = df.reset_index(drop=True)  # índice posicional 0..n-1
        work = base
        if active:
            mask = pd.Series(True, index=base.index)
            for col, text in active.items():
                if col in base.columns:
                    mask &= base[col].astype(str).str.contains(
                        str(text), case=False, na=False, regex=False
                    )
            work = base[mask]
        if sort_col is not None and sort_col in work.columns:
            work = work.sort_values(
                by=sort_col, ascending=sort_dir != "desc", kind="stable"
            )
        order = work.index.to_numpy()
        _ORDERS[handle] = (key, order)
        return order
    except Exception:  # noqa: BLE001 - coluna inexistente / não ordenável
        return None


def page_json(
    handle: str,
    start: int,
    end: int,
    sort_col: str | None = None,
    sort_dir: str | None = None,
    filters: dict[str, str] | None = None,
) -> str:
    """Retorna JSON {rows, start, total} aplicando filtros + sort (view)."""
    df = _CACHE.get(handle)
    if df is None:
        return json.dumps({"error": "expired", "total": 0, "rows": []})
    try:
        _CACHE.move_to_end(handle)
        start = max(0, int(start))
        end = max(start, int(end))
        order = _view_order(handle, df, filters, sort_col, sort_dir)
        total = int(len(df)) if order is None else int(len(order))
        sub = df.iloc[order[start:end]] if order is not None else df.iloc[start:end]
        rows = [
            {"index": _jsonable(idx), "values": [_jsonable(v) for v in values]}
            for idx, values in zip(sub.index, sub.itertuples(index=False, name=None))
        ]
        return json.dumps({"rows": rows, "start": start, "total": total})
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": str(exc), "total": 0, "rows": []})
