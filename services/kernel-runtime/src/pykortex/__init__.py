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

from pykortex.api import command, show, viewer
from pykortex.introspect import clear_namespace_json as _clear_namespace_json
from pykortex.introspect import inspect_json as _inspect_json
from pykortex.mime import DATAFRAME_MIME
from pykortex.paging import page_json as _page_json
from pykortex.runtime import activate as _activate

__all__ = [
    "viewer",
    "command",
    "show",
    "DATAFRAME_MIME",
    "_activate",
    "_inspect_json",
    "_page_json",
    "_clear_namespace_json",
]
__version__ = "0.0.0"
