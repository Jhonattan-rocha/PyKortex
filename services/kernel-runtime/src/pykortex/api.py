"""API pública do PyKortex dentro do kernel."""

from __future__ import annotations

from dataclasses import dataclass, field
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


def command(name: str, inputs: Any = None) -> Callable[[CommandFn], CommandFn]:
    """Registra um comando invocável pela paleta/menu.

    ``inputs`` (opcional) descreve valores que a IDE coleta ANTES de rodar e
    entrega em ``ctx.arg(nome)``. Pode ser uma lista estática ou uma função
    ``callable(ctx) -> lista`` (resolvida no kernel, p/ opções dinâmicas)::

        @pk.command("Mostrar coluna",
                    inputs=lambda ctx: [{"name": "col", "type": "pick",
                                         "label": "Qual coluna?",
                                         "options": list(ctx.get_var("df").columns)}])
        def _(ctx):
            pk.show(ctx.get_var("df")[[ctx.arg("col")]])

    Cada input: ``{"name", "label"?, "type": "text"|"pick", "options"?, "default"?}``.
    """

    def deco(fn: CommandFn) -> CommandFn:
        REGISTRY.add_command(name, fn, inputs)
        return fn

    return deco


def panel(name: str) -> Callable[[CommandFn], CommandFn]:
    """Registra um painel lateral. A função recebe um Context e retorna HTML.

        @pk.panel("Conexões")
        def _(ctx):
            return "<h3>Minhas conexões</h3>..."

    Botões com ``data-pk-command="Nome do comando"`` no HTML rodam aquele comando.
    """

    def deco(fn: CommandFn) -> CommandFn:
        REGISTRY.add_panel(name, fn)
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

    args: dict[str, Any] = field(default_factory=dict)

    def arg(self, name: str, default: Any = None) -> Any:
        """Valor de input coletado pela IDE antes de rodar o comando."""
        return self.args.get(name, default)

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
