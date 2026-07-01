"""Rotas REST de interpretadores Python. Prefixo /python."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter

from pykortex_engine import pythons
from pykortex_engine.files import get_workspace
from pykortex_engine.kernels import get_session

router = APIRouter(prefix="/python", tags=["python"])


@router.get("/list")
async def list_pythons() -> dict:
    root = get_workspace().root
    items = await asyncio.to_thread(pythons.detect_pythons, str(root) if root else None)
    return {"pythons": items}


@router.get("/config")
async def get_config() -> dict:
    return get_session().config()
