"""PyKortex — runtime in-kernel.

API exposta ao código do usuário (e às extensões) dentro do kernel:

    import pykortex as pk

    @pk.viewer(pd.DataFrame)
    def _(df): ...

    @pk.command("Minha ação")
    def _(ctx): ...

    pk.show(obj)

As contribuições são registradas num registry e conectadas ao IPython quando o
kernel chama ``pykortex._activate()`` (feito automaticamente pelo engine no boot).
"""

from pykortex.api import command, panel, show, viewer
from pykortex.commands import list_commands_json as _list_commands_json
from pykortex.commands import list_panels_json as _list_panels_json
from pykortex.commands import render_panel_json as _render_panel_json
from pykortex.commands import run_command as _run_command
from pykortex.introspect import clear_namespace_json as _clear_namespace_json
from pykortex.introspect import inspect_json as _inspect_json
from pykortex.mime import DATAFRAME_MIME
from pykortex.paging import page_json as _page_json
from pykortex.runtime import activate as _activate

__all__ = [
    "viewer",
    "command",
    "panel",
    "show",
    "DATAFRAME_MIME",
    "_activate",
    "_inspect_json",
    "_page_json",
    "_clear_namespace_json",
    "_request_json",
    "_list_commands_json",
    "_run_command",
    "_list_panels_json",
    "_render_panel_json",
]
__version__ = "0.0.0"


def _request_json(handle: str, args_json: str) -> str:
    """Proxy lazy para fastapi_view.request_json (fastapi pode não estar instalado)."""
    from pykortex.fastapi_view import request_json

    return request_json(handle, args_json)
