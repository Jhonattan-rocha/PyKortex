"""Wiring das contribuições do PyKortex com o IPython do kernel."""

from __future__ import annotations

from typing import Any

from pykortex.registry import REGISTRY, ViewerFn


def _get_ipython() -> Any:
    try:
        from IPython import get_ipython

        return get_ipython()
    except Exception:  # noqa: BLE001
        return None


def _make_mimebundle_callable(fn: ViewerFn):
    """Adapta um viewer (obj -> bundle) à assinatura do mimebundle_formatter."""

    def _cb(obj: Any, include: Any = None, exclude: Any = None) -> dict[str, Any]:
        try:
            return fn(obj) or {}
        except Exception:  # noqa: BLE001 - viewer não deve derrubar o display
            return {}

    return _cb


def activate(ip: Any = None) -> bool:
    """Conecta os viewers registrados ao display do IPython.

    Idempotente e seguro fora de um kernel (retorna False). Chamado pelo engine
    automaticamente no boot do kernel.
    """
    ip = ip or _get_ipython()
    if ip is None:
        return False

    # Importa os viewers nativos (eles se auto-registram no REGISTRY).
    # Cada um é opcional: depende da lib correspondente estar instalada.
    for module in ("pykortex.dataframe", "pykortex.fastapi_view"):
        try:
            __import__(module)
        except Exception:  # noqa: BLE001 - lib ausente / erro de import
            pass

    mimebundle = ip.display_formatter.mimebundle_formatter

    def wire(typ: type, fn: ViewerFn) -> None:
        mimebundle.for_type(typ, _make_mimebundle_callable(fn))

    for typ, fn in REGISTRY.viewers:
        wire(typ, fn)

    # Viewers registrados depois (ex.: extensões do usuário) também conectam.
    REGISTRY.wire_hook = wire
    return True
