"""Serviços de filesystem confinados a um workspace root.

Todas as operações usam caminhos RELATIVOS ao root (``""`` = o próprio root).
Qualquer tentativa de escapar do root (``..``, caminho absoluto fora) é rejeitada.
Isso mantém o engine seguro mesmo que a UI mande um caminho inesperado.
"""

from __future__ import annotations

import shutil
from pathlib import Path

# Diretórios ruidosos que não interessam na árvore de arquivos.
IGNORED = {".git", "__pycache__", ".venv", "node_modules", ".idea", ".vscode", ".ruff_cache"}


class WorkspaceError(Exception):
    """Erro de operação de workspace (root não definido, fora do root, etc.)."""


class WorkspaceManager:
    def __init__(self) -> None:
        self._root: Path | None = None

    @property
    def root(self) -> Path | None:
        return self._root

    def set_root(self, root: str) -> Path:
        p = Path(root).expanduser().resolve()
        if not p.is_dir():
            raise WorkspaceError(f"não é um diretório: {p}")
        self._root = p
        return p

    def _require_root(self) -> Path:
        if self._root is None:
            raise WorkspaceError("workspace não definido (abra uma pasta primeiro)")
        return self._root

    def resolve(self, rel: str) -> Path:
        """Resolve um caminho relativo ao root, garantindo confinamento."""
        root = self._require_root()
        # normaliza separadores e remove barra inicial
        rel = (rel or "").replace("\\", "/").lstrip("/")
        target = (root / rel).resolve()
        if target != root and root not in target.parents:
            raise WorkspaceError(f"caminho fora do workspace: {rel}")
        return target

    def list_dir(self, rel: str = "") -> list[dict]:
        target = self.resolve(rel)
        if not target.is_dir():
            raise WorkspaceError(f"não é um diretório: {rel}")
        root = self._require_root()

        entries: list[dict] = []
        for child in target.iterdir():
            if child.name in IGNORED:
                continue
            entries.append(
                {
                    "name": child.name,
                    "path": child.relative_to(root).as_posix(),
                    "type": "dir" if child.is_dir() else "file",
                }
            )
        # diretórios primeiro, depois por nome (case-insensitive)
        entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
        return entries

    def read_file(self, rel: str) -> dict:
        target = self.resolve(rel)
        if not target.is_file():
            raise WorkspaceError(f"não é um arquivo: {rel}")
        content = target.read_text(encoding="utf-8")
        return {"path": rel, "content": content}

    def write_file(self, rel: str, content: str) -> dict:
        target = self.resolve(rel)
        if target.is_dir():
            raise WorkspaceError(f"é um diretório: {rel}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="")
        return {"path": rel, "bytes": len(content.encode("utf-8"))}

    def create(self, rel: str, kind: str) -> dict:
        """Cria um arquivo vazio ou um diretório. Erro se já existir."""
        if not rel.strip():
            raise WorkspaceError("nome vazio")
        target = self.resolve(rel)
        if target.exists():
            raise WorkspaceError(f"já existe: {rel}")
        if kind == "dir":
            target.mkdir(parents=True, exist_ok=False)
        elif kind == "file":
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("", encoding="utf-8")
        else:
            raise WorkspaceError(f"tipo inválido: {kind}")
        return {"path": rel, "type": kind}

    def rename(self, rel: str, to: str) -> dict:
        """Renomeia/move dentro do workspace."""
        src = self.resolve(rel)
        dst = self.resolve(to)
        if src == self._require_root():
            raise WorkspaceError("não é possível renomear o root")
        if not src.exists():
            raise WorkspaceError(f"não existe: {rel}")
        if dst.exists():
            raise WorkspaceError(f"destino já existe: {to}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        return {"path": to}

    def delete(self, rel: str) -> dict:
        """Apaga um arquivo ou diretório (recursivo)."""
        target = self.resolve(rel)
        if target == self._require_root():
            raise WorkspaceError("não é possível apagar o root")
        if not target.exists():
            raise WorkspaceError(f"não existe: {rel}")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"path": rel}


_workspace: WorkspaceManager | None = None


def get_workspace() -> WorkspaceManager:
    global _workspace
    if _workspace is None:
        _workspace = WorkspaceManager()
    return _workspace
