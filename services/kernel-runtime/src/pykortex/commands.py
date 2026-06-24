"""Comandos customizados: listar e executar `@pk.command`s registrados.

São a base da extensibilidade — o usuário define comandos em Python (ex.: num
`.pykortex/extensions.py`) e a IDE os lista/roda via command palette.
"""

from __future__ import annotations

import json

from pykortex.api import Context
from pykortex.registry import REGISTRY


def list_commands_json() -> str:
    try:
        return json.dumps([{"name": name} for name in REGISTRY.commands])
    except Exception:  # noqa: BLE001
        return "[]"


def run_command(name: str) -> None:
    """Executa um comando registrado, passando um Context fresco."""
    fn = REGISTRY.commands.get(name)
    if fn is None:
        print(f"[pykortex] comando não encontrado: {name!r}")
        return
    fn(Context())
