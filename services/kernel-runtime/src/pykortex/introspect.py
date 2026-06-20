"""Introspecção do namespace do kernel para o variable explorer.

Retorna metadados leves (nome, tipo, resumo) de cada variável "de dado" do
usuário, filtrando módulos, funções, classes e nomes internos do IPython.
"""

from __future__ import annotations

import json
import types
from typing import Any


def _ipython() -> Any:
    try:
        from IPython import get_ipython

        return get_ipython()
    except Exception:  # noqa: BLE001
        return None


def _short(val: Any, n: int = 80) -> str:
    try:
        r = repr(val)
    except Exception:  # noqa: BLE001
        return ""
    return r[:n] + ("…" if len(r) > n else "")


def describe(name: str, val: Any) -> dict[str, Any]:
    """Descreve uma variável: tipo, 'kind' (pra UI) e um resumo curto."""
    t = type(val).__name__
    kind = "other"
    summary = ""
    try:
        if t == "DataFrame" and hasattr(val, "shape"):
            kind = "DataFrame"
            summary = f"{val.shape[0]} × {val.shape[1]}"
        elif t == "Series":
            kind = "Series"
            summary = f"{len(val)} · {val.dtype}"
        elif t == "ndarray":
            kind = "ndarray"
            summary = f"{tuple(val.shape)} {val.dtype}"
        elif isinstance(val, (list, tuple, set, frozenset, dict)):
            kind = "collection"
            summary = f"{t}, len {len(val)}"
        elif isinstance(val, bool):
            kind = "scalar"
            summary = repr(val)
        elif isinstance(val, (int, float)):
            kind = "scalar"
            summary = repr(val)
        elif isinstance(val, str):
            kind = "str"
            summary = _short(val)
        else:
            summary = _short(val)
    except Exception:  # noqa: BLE001
        pass
    return {"name": name, "type": t, "kind": kind, "summary": summary}


def inspect_namespace() -> list[dict[str, Any]]:
    ip = _ipython()
    if ip is None:
        return []
    hidden = getattr(ip, "user_ns_hidden", {})
    skip_types = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)

    out: list[dict[str, Any]] = []
    for name, val in list(ip.user_ns.items()):
        if name.startswith("_") or name in hidden:
            continue
        if isinstance(val, skip_types):
            continue
        out.append(describe(name, val))

    out.sort(key=lambda d: d["name"].lower())
    return out


def inspect_json() -> str:
    """JSON da lista de variáveis (usado pelo engine via user_expressions)."""
    try:
        return json.dumps(inspect_namespace())
    except Exception:  # noqa: BLE001
        return "[]"


def clear_namespace() -> int:
    """Remove as variáveis de dado do namespace (mantém imports/funções).

    Também esvazia o cache de paginação (libera refs a DataFrames) e força o GC.
    Retorna quantas variáveis foram removidas.
    """
    ip = _ipython()
    if ip is None:
        return 0
    names = [d["name"] for d in inspect_namespace()]
    for n in names:
        ip.user_ns.pop(n, None)
    try:
        from pykortex import paging

        paging._CACHE.clear()
        paging._ORDERS.clear()
    except Exception:  # noqa: BLE001
        pass
    import gc

    gc.collect()
    return len(names)


def clear_namespace_json() -> str:
    try:
        return json.dumps({"cleared": clear_namespace()})
    except Exception:  # noqa: BLE001
        return '{"cleared": 0}'
