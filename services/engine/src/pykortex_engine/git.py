"""Integração git via CLI (sem dependências nativas).

Roda o `git` no diretório do workspace e devolve dados estruturados. Tudo é
best-effort: se o git não existir ou a pasta não for um repo, retornamos um
estado coerente em vez de levantar erro.
"""

from __future__ import annotations

import subprocess
from typing import Any


def _run(root: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        # core.quotepath=false: caminhos não-ASCII saem em UTF-8 sem aspas/escape
        ["git", "-c", "core.quotepath=false", *args],
        cwd=root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
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
