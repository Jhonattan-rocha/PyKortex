"""Rotas REST de git (operam no workspace atual). Prefixo /git."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from pykortex_engine import git
from pykortex_engine.files import get_workspace

router = APIRouter(prefix="/git", tags=["git"])


class PathsBody(BaseModel):
    paths: list[str]


class CommitBody(BaseModel):
    message: str


def _root() -> str | None:
    root = get_workspace().root
    return str(root) if root else None


@router.get("/status")
async def git_status() -> dict:
    root = _root()
    if root is None:
        return {"repo": False, "files": [], "branch": "", "ahead": 0, "behind": 0}
    return git.status(root)


@router.get("/diff")
async def git_diff(path: str, staged: bool = False) -> dict:
    root = _root()
    if root is None:
        return {"path": path, "staged": staged, "diff": ""}
    return git.diff(root, path, staged)


@router.get("/show")
async def git_show(path: str, rev: str = "HEAD") -> dict:
    root = _root()
    if root is None:
        return {"path": path, "rev": rev, "content": ""}
    return git.show(root, path, rev)


@router.post("/init")
async def git_init() -> dict:
    root = _root()
    if root is None:
        return {"ok": False, "message": "workspace não definido"}
    return git.init(root)


@router.post("/stage")
async def git_stage(body: PathsBody) -> dict:
    root = _root()
    return git.stage(root, body.paths) if root else {"ok": False, "message": "sem workspace"}


@router.post("/unstage")
async def git_unstage(body: PathsBody) -> dict:
    root = _root()
    return git.unstage(root, body.paths) if root else {"ok": False, "message": "sem workspace"}


@router.post("/discard")
async def git_discard(body: PathsBody) -> dict:
    root = _root()
    return git.discard(root, body.paths) if root else {"ok": False, "message": "sem workspace"}


@router.post("/commit")
async def git_commit(body: CommitBody) -> dict:
    root = _root()
    return git.commit(root, body.message) if root else {"ok": False, "message": "sem workspace"}
