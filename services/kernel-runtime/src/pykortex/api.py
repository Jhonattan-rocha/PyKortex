"""API pública do PyKortex dentro do kernel."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from pykortex.registry import REGISTRY, CommandFn, ViewerFn


def viewer(typ: type) -> Callable[[ViewerFn], ViewerFn]:
    """Registra um viewer rico para um tipo.

    A função decorada recebe o objeto e retorna um mimebundle
    (``{mime: dado}``), tipicamente incluindo um MIME do PyKortex e um
    ``text/plain`` de fallback.

        @pk.viewer(pd.DataFrame)
        def _(df):
            return {DATAFRAME_MIME: build(df), "text/plain": repr(df)}
    """

    def deco(fn: ViewerFn) -> ViewerFn:
        REGISTRY.add_viewer(typ, fn)
        return fn

    return deco


def command(name: str) -> Callable[[CommandFn], CommandFn]:
    """Registra um comando invocável pela IDE (paleta/menu).

    Wiring com a UI vem numa fase seguinte; por ora fica no registry.
    """

    def deco(fn: CommandFn) -> CommandFn:
        REGISTRY.add_command(name, fn)
        return fn

    return deco


def show(obj: Any) -> None:
    """Exibe um objeto pela cadeia de display do IPython (usa os viewers)."""
    try:
        from IPython.display import display

        display(obj)
    except Exception:  # noqa: BLE001 - fora de um kernel
        print(repr(obj))


@dataclass
class Context:
    """Contexto passado a comandos: ponte para o namespace do kernel."""

    def get_var(self, name: str) -> Any:
        ip = _ipython()
        return ip.user_ns.get(name) if ip else None

    def set_var(self, name: str, value: Any) -> None:
        ip = _ipython()
        if ip:
            ip.user_ns[name] = value

    def notify(self, message: str) -> None:
        print(message)


def _ipython() -> Any:
    try:
        from IPython import get_ipython

        return get_ipython()
    except Exception:  # noqa: BLE001
        return None
