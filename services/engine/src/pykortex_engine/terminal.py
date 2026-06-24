"""Terminal real (PTY) hospedado no engine — sem node-pty/Electron-rebuild.

Windows usa pywinpty (wrapper do ConPTY, instalado via wheel); Unix usa o
módulo stdlib via ptyprocess. A interface (spawn/read/write/setwinsize/
terminate) é a mesma nos dois.
"""

from __future__ import annotations

import os
import sys
from typing import Any


def spawn(cwd: str, cols: int = 80, rows: int = 24) -> Any:
    """Abre um shell num PTY no diretório `cwd`."""
    if sys.platform == "win32":
        from winpty import PtyProcess

        shell = os.environ.get("PYKORTEX_SHELL") or "powershell.exe"
        return PtyProcess.spawn(shell, cwd=cwd, dimensions=(rows, cols))

    from ptyprocess import PtyProcess

    shell = os.environ.get("PYKORTEX_SHELL") or os.environ.get("SHELL") or "/bin/bash"
    return PtyProcess.spawn([shell], cwd=cwd, dimensions=(rows, cols))


def to_text(data: Any) -> str:
    """Bytes (Unix) ou str (Windows) -> str, tolerante a UTF-8 parcial."""
    if isinstance(data, bytes):
        return data.decode("utf-8", "replace")
    return data
