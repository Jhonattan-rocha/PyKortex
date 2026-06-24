"""Integração git via CLI (sem dependências nativas).

Roda o `git` no diretório do workspace e devolve dados estruturados. Tudo é
best-effort: se o git não existir ou a pasta não for um repo, retornamos um
estado coerente em vez de levantar erro.
"""

from __future__ import annotations

import os
import subprocess
from typing import Any


def _run(root: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    # GIT_TERMINAL_PROMPT=0: nunca pede senha interativamente (não trava); a
    # autenticação fica a cargo do credential helper / SSH agent da máquina.
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    return subprocess.run(
        # core.quotepath=false: caminhos não-ASCII saem em UTF-8 sem aspas/escape
        ["git", "-c", "core.quotepath=false", *args],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


def is_repo(root: str) -> bool:
    try:
        r = _run(root, ["rev-parse", "--is-inside-work-tree"])
        return r.returncode == 0 and r.stdout.strip() == "true"
    except FileNotFoundError:
        return False


def _parse_branch_line(line: str) -> dict[str, Any]:
    # "## main...origin/main [ahead 1, behind 2]" | "## main" | "## HEAD (no branch)"
    info: dict[str, Any] = {"branch": "", "ahead": 0, "behind": 0, "upstream": None}
    body = line[3:].strip()
    if body.startswith("HEAD (no branch)"):
        info["branch"] = "(detached)"
        return info
    if body.startswith("No commits yet on "):
        info["branch"] = body[len("No commits yet on ") :]
        return info
    track = ""
    if " [" in body:
        body, track = body.split(" [", 1)
        track = track.rstrip("]")
    if "..." in body:
        branch, upstream = body.split("...", 1)
        info["branch"] = branch
        info["upstream"] = upstream
    else:
        info["branch"] = body
    for part in track.split(", "):
        if part.startswith("ahead "):
            info["ahead"] = int(part[6:])
        elif part.startswith("behind "):
            info["behind"] = int(part[7:])
    return info


def status(root: str) -> dict[str, Any]:
    if not is_repo(root):
        return {"repo": False, "files": [], "branch": "", "ahead": 0, "behind": 0}
    # -uall: lista arquivos não rastreados individualmente (não colapsa pastas)
    r = _run(root, ["status", "--porcelain", "-b", "-uall"])
    branch_info = {"branch": "", "ahead": 0, "behind": 0, "upstream": None}
    files: list[dict[str, Any]] = []
    for line in r.stdout.splitlines():
        if line.startswith("## "):
            branch_info = _parse_branch_line(line)
            continue
        if len(line) < 4:
            continue
        x, y = line[0], line[1]
        path = line[3:]
        # renomeado: "R  old -> new"
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        files.append(
            {
                "path": path,
                "x": x,  # índice (staged)
                "y": y,  # worktree
                "staged": x not in (" ", "?"),
                "untracked": x == "?" and y == "?",
            }
        )
    return {"repo": True, "files": files, **branch_info}


def init(root: str) -> dict[str, Any]:
    r = _run(root, ["init"])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}


def stage(root: str, paths: list[str]) -> dict[str, Any]:
    r = _run(root, ["add", "--", *paths])
    return {"ok": r.returncode == 0, "message": r.stderr.strip()}


def unstage(root: str, paths: list[str]) -> dict[str, Any]:
    r = _run(root, ["restore", "--staged", "--", *paths])
    return {"ok": r.returncode == 0, "message": r.stderr.strip()}


def discard(root: str, paths: list[str]) -> dict[str, Any]:
    # desfaz mudanças no worktree (não mexe em arquivos não rastreados)
    r = _run(root, ["checkout", "--", *paths])
    return {"ok": r.returncode == 0, "message": r.stderr.strip()}


def commit(root: str, message: str) -> dict[str, Any]:
    r = _run(root, ["commit", "-m", message])
    out = (r.stdout or r.stderr).strip()
    return {"ok": r.returncode == 0, "message": out}


def diff(root: str, path: str, staged: bool) -> dict[str, Any]:
    args = ["diff", "--no-color"]
    if staged:
        args.append("--cached")
    args += ["--", path]
    r = _run(root, args)
    return {"path": path, "staged": staged, "diff": r.stdout}


def show(root: str, path: str, rev: str = "HEAD") -> dict[str, Any]:
    """Conteúdo de um arquivo numa revisão (git show rev:path); '' se não existir."""
    r = _run(root, ["show", f"{rev}:{path}"])
    return {"path": path, "rev": rev, "content": r.stdout if r.returncode == 0 else ""}


def log(root: str, limit: int = 50) -> dict[str, Any]:
    """Histórico de commits (hash, autor, data relativa, assunto)."""
    if not is_repo(root):
        return {"commits": []}
    # \x1f separa campos; uma linha por commit (%s é só a 1ª linha do assunto)
    fmt = "%H%x1f%h%x1f%an%x1f%ar%x1f%s"
    r = _run(root, ["log", f"-n{int(limit)}", f"--pretty=format:{fmt}"])
    if r.returncode != 0:
        return {"commits": []}
    commits: list[dict[str, Any]] = []
    for line in r.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) == 5:
            commits.append(
                {
                    "hash": parts[0],
                    "short": parts[1],
                    "author": parts[2],
                    "date": parts[3],
                    "subject": parts[4],
                }
            )
    return {"commits": commits}


def reset(root: str, rev: str, mode: str = "mixed") -> dict[str, Any]:
    """git reset --<mode> <rev>. mode: soft (mantém staged) / mixed / hard (descarta)."""
    if mode not in ("soft", "mixed", "hard"):
        mode = "mixed"
    r = _run(root, ["reset", f"--{mode}", rev])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}


def commit_files(root: str, commit_hash: str) -> dict[str, Any]:
    """Arquivos alterados num commit (status + caminho)."""
    r = _run(root, ["show", "--no-color", "--name-status", "--format=", commit_hash])
    files: list[dict[str, str]] = []
    for line in r.stdout.splitlines():
        if "\t" not in line:
            continue
        parts = line.split("\t")
        files.append({"status": parts[0][0], "path": parts[-1]})
    return {"files": files}


def remotes(root: str) -> dict[str, Any]:
    r = _run(root, ["remote", "-v"])
    seen: dict[str, str] = {}
    for line in r.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] not in seen:
            seen[parts[0]] = parts[1]
    return {"remotes": [{"name": n, "url": u} for n, u in seen.items()]}


def add_remote(root: str, name: str, url: str) -> dict[str, Any]:
    r = _run(root, ["remote", "add", name, url])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}


def push(root: str, set_upstream: bool = False, branch: str = "") -> dict[str, Any]:
    args = ["push"]
    if set_upstream and branch:
        args += ["-u", "origin", branch]
    r = _run(root, args)
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip() or "push ok"}


def pull(root: str) -> dict[str, Any]:
    r = _run(root, ["pull"])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}


def fetch(root: str) -> dict[str, Any]:
    r = _run(root, ["fetch"])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip() or "fetch ok"}


def branches(root: str) -> dict[str, Any]:
    if not is_repo(root):
        return {"branches": [], "current": ""}
    r = _run(root, ["branch", "--no-color"])
    names: list[str] = []
    current = ""
    for line in r.stdout.splitlines():
        if not line.strip():
            continue
        is_current = line.startswith("* ")
        name = line[2:].strip()
        if name.startswith("("):  # "(HEAD detached at ...)" — ignora
            continue
        names.append(name)
        if is_current:
            current = name
    return {"branches": names, "current": current}


def checkout(root: str, branch: str) -> dict[str, Any]:
    r = _run(root, ["checkout", branch])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}


def create_branch(root: str, name: str) -> dict[str, Any]:
    """Cria e já troca para a branch (checkout -b)."""
    r = _run(root, ["checkout", "-b", name])
    return {"ok": r.returncode == 0, "message": (r.stdout or r.stderr).strip()}
