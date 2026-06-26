"""Serviços de filesystem confinados a um workspace root.

Todas as operações usam caminhos RELATIVOS ao root (``""`` = o próprio root).
Qualquer tentativa de escapar do root (``..``, caminho absoluto fora) é rejeitada.
Isso mantém o engine seguro mesmo que a UI mande um caminho inesperado.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

# Diretórios ruidosos que não interessam na árvore de arquivos.
IGNORED = {".git", "__pycache__", ".venv", "node_modules", ".idea", ".vscode", ".ruff_cache"}
# Extensões claramente binárias — puladas na busca por conteúdo.
BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
    ".pdf", ".zip", ".gz", ".tar", ".7z", ".rar", ".jar", ".whl",
    ".pyc", ".pyo", ".so", ".dll", ".dylib", ".exe", ".bin", ".o", ".a",
    ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".mov", ".avi",
    ".sqlite", ".db", ".parquet", ".feather", ".npy", ".npz", ".pkl",
}
# Limites de segurança/performance da busca.
SEARCH_MAX_FILE_BYTES = 2_000_000
SEARCH_MAX_RESULTS = 1000


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

    def search(
        self,
        query: str,
        case_sensitive: bool = False,
        is_regex: bool = False,
        max_results: int = SEARCH_MAX_RESULTS,
    ) -> dict:
        """Busca texto em todos os arquivos do workspace.

        Retorna ``{"results": [{"path", "matches": [{"line", "col", "text"}]}],
        "truncated": bool}``. Puro-Python (multiplataforma, sem depender de
        ripgrep). Pula diretórios IGNORED, binários e arquivos grandes.
        """
        root = self._require_root()
        if not query:
            return {"results": [], "truncated": False}

        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            pattern = re.compile(query if is_regex else re.escape(query), flags)
        except re.error as exc:
            raise WorkspaceError(f"regex inválido: {exc}") from exc

        results: list[dict] = []
        total = 0
        truncated = False

        for path in self._walk_files(root):
            if path.suffix.lower() in BINARY_EXT:
                continue
            try:
                if path.stat().st_size > SEARCH_MAX_FILE_BYTES:
                    continue
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue  # ilegível ou binário disfarçado

            matches: list[dict] = []
            for lineno, line in enumerate(text.splitlines(), start=1):
                m = pattern.search(line)
                if m is None:
                    continue
                matches.append({"line": lineno, "col": m.start() + 1, "text": line[:400]})
                total += 1
                if total >= max_results:
                    truncated = True
                    break
            if matches:
                results.append({"path": path.relative_to(root).as_posix(), "matches": matches})
            if truncated:
                break

        return {"results": results, "truncated": truncated}

    def _walk_files(self, root: Path):
        """Itera arquivos do workspace pulando diretórios IGNORED (multiplataforma)."""
        stack = [root]
        while stack:
            current = stack.pop()
            try:
                children = list(current.iterdir())
            except OSError:
                continue
            for child in children:
                if child.name in IGNORED:
                    continue
                if child.is_dir():
                    stack.append(child)
                elif child.is_file():
                    yield child

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
