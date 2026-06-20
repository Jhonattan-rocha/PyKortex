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


def _order_for(handle: str, df: Any, sort_col: str | None, sort_dir: str | None) -> Any:
    """Retorna o array de posições na ordem desejada (ou None = ordem natural).

    Memoiza por handle, recomputando só quando o critério de sort muda.
    """
    if sort_col is None:
        return None
    key = (sort_col, sort_dir)
    cached = _ORDERS.get(handle)
    if cached and cached[0] == key:
        return cached[1]
    try:
        ascending = sort_dir != "desc"
        order = (
            df.reset_index(drop=True)
            .sort_values(by=sort_col, ascending=ascending, kind="stable")
            .index.to_numpy()
        )
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
) -> str:
    """Retorna JSON com as linhas [start:end) do DataFrame (com sort opcional)."""
    df = _CACHE.get(handle)
    if df is None:
        return json.dumps({"error": "expired"})
    try:
        _CACHE.move_to_end(handle)
        start = max(0, int(start))
        end = max(start, int(end))
        order = _order_for(handle, df, sort_col, sort_dir)
        sub = df.iloc[order[start:end]] if order is not None else df.iloc[start:end]
        rows = [
            {"index": _jsonable(idx), "values": [_jsonable(v) for v in values]}
            for idx, values in zip(sub.index, sub.itertuples(index=False, name=None))
        ]
        return json.dumps({"rows": rows, "start": start})
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": str(exc)})
