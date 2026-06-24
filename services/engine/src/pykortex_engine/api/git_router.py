"""Rotas REST de git (operam no workspace atual). Prefixo /git."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from pykortex_engine import git
from pykortex_engine.files import get_workspace

router = APIRouter(prefix="/git", tags=["git"])


class PathsBody(BaseModel):
    paths: list[str]


class CommitBody(BaseModel):
    message: str


class ResetBody(BaseModel):
    rev: str
    mode: str = "mixed"


class RemoteBody(BaseModel):
    name: str = "origin"
    url: str


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


@router.get("/log")
async def git_log(limit: int = 50) -> dict:
    root = _root()
    return git.log(root, limit) if root else {"commits": []}


@router.post("/reset")
async def git_reset(body: ResetBody) -> dict:
    root = _root()
    return git.reset(root, body.rev, body.mode) if root else {"ok": False, "message": "sem workspace"}


@router.get("/commit-files")
async def git_commit_files(hash: str) -> dict:
    root = _root()
    return git.commit_files(root, hash) if root else {"files": []}


@router.get("/remotes")
async def git_remotes() -> dict:
    root = _root()
    return git.remotes(root) if root else {"remotes": []}


@router.post("/remote")
async def git_add_remote(body: RemoteBody) -> dict:
    root = _root()
    return git.add_remote(root, body.name, body.url) if root else {"ok": False, "message": "sem workspace"}


@router.post("/push")
async def git_push(set_upstream: bool = False, branch: str = "") -> dict:
    root = _root()
    if root is None:
        return {"ok": False, "message": "sem workspace"}
    return await asyncio.to_thread(git.push, root, set_upstream, branch)


@router.post("/pull")
async def git_pull() -> dict:
    root = _root()
    if root is None:
        return {"ok": False, "message": "sem workspace"}
    return await asyncio.to_thread(git.pull, root)


@router.post("/fetch")
async def git_fetch() -> dict:
    root = _root()
    if root is None:
        return {"ok": False, "message": "sem workspace"}
    return await asyncio.to_thread(git.fetch, root)
