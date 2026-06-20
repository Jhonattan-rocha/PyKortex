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
        _CACHE.popitem(last=False)
    return handle


def page_json(handle: str, start: int, end: int) -> str:
    """Retorna JSON com as linhas [start:end) do DataFrame do handle."""
    df = _CACHE.get(handle)
    if df is None:
        return json.dumps({"error": "expired"})
    try:
        _CACHE.move_to_end(handle)
        start = max(0, int(start))
        end = max(start, int(end))
        sub = df.iloc[start:end]
        rows = [
            {"index": _jsonable(idx), "values": [_jsonable(v) for v in values]}
            for idx, values in zip(sub.index, sub.itertuples(index=False, name=None))
        ]
        return json.dumps({"rows": rows, "start": start})
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": str(exc)})
