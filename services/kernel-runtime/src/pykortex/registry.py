"""Registries globais de contribuições (viewers e comandos).

Mantemos as contribuições aqui em vez de tocar no IPython diretamente, para que
importar `pykortex` fora de um kernel não tenha efeitos colaterais. O wiring com
o IPython acontece em `runtime.activate()`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

# Um viewer recebe o objeto e retorna um mimebundle (dict mime -> dado).
ViewerFn = Callable[[Any], dict[str, Any]]
# Um comando recebe um Context (ver api.Context) e executa um efeito.
CommandFn = Callable[..., Any]


@dataclass
class Registry:
    viewers: list[tuple[type, ViewerFn]] = field(default_factory=list)
    commands: dict[str, CommandFn] = field(default_factory=dict)
    # Definido por runtime.activate(): conecta um viewer recém-registrado ao
    # IPython na hora (caso o registro aconteça depois do boot do kernel).
    wire_hook: Callable[[type, ViewerFn], None] | None = None

    def add_viewer(self, typ: type, fn: ViewerFn) -> None:
        self.viewers.append((typ, fn))
        if self.wire_hook is not None:
            self.wire_hook(typ, fn)

    def add_command(self, name: str, fn: CommandFn) -> None:
        self.commands[name] = fn


REGISTRY = Registry()
