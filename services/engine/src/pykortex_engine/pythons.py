"""Detecção de interpretadores Python e kernelspec custom (multiplataforma).

Descobre Pythons disponíveis (engine, venvs do workspace, PATH, py launcher) e
checa se cada um tem `ipykernel` (requisito para ser kernel). `build_custom_spec`
monta um kernelspec temporário apontando para um Python específico.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

# Probe leve: versão + se ipykernel está instalado naquele interpretador.
_PROBE = (
    "import sys, json, importlib.util\n"
    "print(json.dumps({"
    "'version': '.'.join(map(str, sys.version_info[:3])), "
    "'ipykernel': importlib.util.find_spec('ipykernel') is not None}))"
)


def _probe(path: str) -> dict[str, Any] | None:
    try:
        out = subprocess.run(
            [path, "-c", _PROBE], capture_output=True, text=True, timeout=10
        )
        if out.returncode == 0 and out.stdout.strip():
            data = json.loads(out.stdout.strip().splitlines()[-1])
            return {
                "version": str(data.get("version", "?")),
                "ipykernel": bool(data.get("ipykernel")),
            }
    except Exception:  # noqa: BLE001 - interpretador inválido/inacessível
        return None
    return None


def _venv_python(venv: Path) -> Path | None:
    cand = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    return cand if cand.exists() else None


def detect_pythons(workspace_root: str | None = None) -> list[dict[str, Any]]:
    """Lista interpretadores Python encontrados (sem duplicar por caminho real)."""
    found: dict[str, dict[str, Any]] = {}

    def add(path: str | None, source: str) -> None:
        if not path:
            return
        try:
            real = os.path.realpath(path)
        except Exception:  # noqa: BLE001
            return
        if real in found:
            return
        info = _probe(path)
        if info is None:
            return
        found[real] = {"path": real, "source": source, **info}

    add(sys.executable, "engine")  # o Python do engine (sempre tem ipykernel)

    if workspace_root:
        for name in (".venv", "venv", "env", ".env"):
            vp = _venv_python(Path(workspace_root) / name)
            if vp is not None:
                add(str(vp), name)

    for name in ("python3", "python", "py"):
        add(shutil.which(name), "PATH")

    return list(found.values())


def build_custom_spec(python_path: str) -> tuple[str, str]:
    """Cria um kernelspec temporário para `python_path`.

    Retorna (kernel_name, spec_root) — o spec_root deve ser removido no shutdown.
    """
    root = tempfile.mkdtemp(prefix="pk-spec-")
    name = "pykortex-custom"
    specdir = os.path.join(root, name)
    os.makedirs(specdir, exist_ok=True)
    spec = {
        "argv": [python_path, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
        "display_name": "PyKortex (custom)",
        "language": "python",
    }
    with open(os.path.join(specdir, "kernel.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f)
    return name, root


def cleanup_spec(spec_root: str | None) -> None:
    if spec_root:
        shutil.rmtree(spec_root, ignore_errors=True)
