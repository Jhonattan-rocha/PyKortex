"""Rotas REST de filesystem (workspace). Prefixo /fs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pykortex_engine.files import get_workspace
from pykortex_engine.files.service import WorkspaceError

router = APIRouter(prefix="/fs", tags=["files"])


class SetWorkspaceBody(BaseModel):
    root: str


class WriteBody(BaseModel):
    path: str
    content: str


class CreateBody(BaseModel):
    path: str
    type: str  # "file" | "dir"


class RenameBody(BaseModel):
    path: str
    to: str


class DeleteBody(BaseModel):
    path: str


def _guard(fn):  # pequeno helper p/ traduzir WorkspaceError -> 400
    try:
        return fn()
    except WorkspaceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspace")
async def set_workspace(body: SetWorkspaceBody) -> dict:
    ws = get_workspace()
    root = _guard(lambda: ws.set_root(body.root))
    return {"root": str(root)}


@router.get("/workspace")
async def get_workspace_info() -> dict:
    root = get_workspace().root
    return {"root": str(root) if root else None}


@router.get("/list")
async def list_dir(path: str = "") -> dict:
    entries = _guard(lambda: get_workspace().list_dir(path))
    return {"path": path, "entries": entries}


@router.get("/read")
async def read_file(path: str) -> dict:
    return _guard(lambda: get_workspace().read_file(path))


@router.put("/write")
async def write_file(body: WriteBody) -> dict:
    return _guard(lambda: get_workspace().write_file(body.path, body.content))


@router.post("/create")
async def create(body: CreateBody) -> dict:
    return _guard(lambda: get_workspace().create(body.path, body.type))


@router.post("/rename")
async def rename(body: RenameBody) -> dict:
    return _guard(lambda: get_workspace().rename(body.path, body.to))


@router.post("/delete")
async def delete(body: DeleteBody) -> dict:
    return _guard(lambda: get_workspace().delete(body.path))
