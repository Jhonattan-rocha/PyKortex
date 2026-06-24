"""Aplicação FastAPI do engine do PyKortex.

Expõe:
  GET  /health           -> readiness check (usado pelo Electron antes de abrir a UI)
  WS   /ws/execute       -> execução de código em streaming via kernel Jupyter
  REST /fs/*             -> operações de filesystem confinadas ao workspace
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pykortex_engine import __version__, analysis, terminal
from pykortex_engine.api.files_router import router as files_router
from pykortex_engine.api.git_router import router as git_router
from pykortex_engine.files import get_workspace
from pykortex_engine.kernels import KernelSession, get_session

logger = logging.getLogger("pykortex.engine")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await get_session().shutdown()


app = FastAPI(title="PyKortex Engine", version=__version__, lifespan=lifespan)

# Em dev o renderer roda em http://localhost:5173 (Vite). Em produção o Electron
# carrega via file:// (origin "null"). Liberamos tudo localmente — o backend só
# escuta em 127.0.0.1.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files_router)
app.include_router(git_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


# --- Handlers do WebSocket -------------------------------------------------
# Cada handler é um async generator que dá `yield` nas mensagens a enviar ao
# cliente. Isso unifica os três formatos num só: streaming (execute), resposta
# única (inspect, df_page...) e nenhuma resposta (interrupt). Adicionar um
# comando novo = uma função + uma entrada em HANDLERS.

Handler = Callable[[KernelSession, dict], AsyncIterator[dict]]


async def _h_execute(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    async for out in session.execute(msg.get("code", "")):
        yield out


async def _h_interrupt(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    await session.interrupt()
    return
    yield  # torna isto um async generator (linha nunca alcançada)


async def _h_inspect(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    yield {"type": "variables", "variables": await session.inspect()}


async def _h_stats(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    yield {"type": "kernel_stats", "stats": session.stats()}


async def _h_complete(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    result = await session.complete(msg.get("code", ""), msg.get("cursor_pos", 0))
    yield {"type": "complete_reply", "reqId": msg.get("reqId"), **result}


async def _h_lint(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    diags = await asyncio.to_thread(analysis.lint, msg.get("code", ""))
    yield {"type": "lint_reply", "reqId": msg.get("reqId"), "diagnostics": diags}


async def _h_hover(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    res = await asyncio.to_thread(
        analysis.hover, msg.get("code", ""), msg.get("line", 1), msg.get("col", 0)
    )
    yield {"type": "hover_reply", "reqId": msg.get("reqId"), **res}


async def _h_signature(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    sigs = await asyncio.to_thread(
        analysis.signatures, msg.get("code", ""), msg.get("line", 1), msg.get("col", 0)
    )
    yield {"type": "signature_reply", "reqId": msg.get("reqId"), "signatures": sigs}


async def _h_goto(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    defs = await asyncio.to_thread(
        analysis.goto, msg.get("code", ""), msg.get("line", 1), msg.get("col", 0)
    )
    yield {"type": "goto_reply", "reqId": msg.get("reqId"), "definitions": defs}


async def _h_clear_vars(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    cleared = await session.clear_vars()
    yield {"type": "variables", "variables": await session.inspect(), "cleared": cleared}


async def _h_restart(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    await session.restart()
    yield {"type": "restarted"}
    yield {"type": "status", "state": "idle"}


async def _h_api_request(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    response = await session.request_app(
        msg.get("handle", ""),
        msg.get("method", "GET"),
        msg.get("path", "/"),
        msg.get("query") or {},
        msg.get("headers") or {},
        msg.get("body"),
        msg.get("hasBody", False),
    )
    yield {"type": "api_response", "reqId": msg.get("reqId"), "response": response}


async def _h_df_page(session: KernelSession, msg: dict) -> AsyncIterator[dict]:
    sort = msg.get("sort") or {}
    result = await session.page(
        msg.get("handle", ""),
        msg.get("start", 0),
        msg.get("end", 0),
        sort.get("col"),
        sort.get("dir"),
        msg.get("filters") or {},
    )
    yield {
        "type": "df_rows",
        "reqId": msg.get("reqId"),
        "rows": result.get("rows", []),
        "start": result.get("start", msg.get("start", 0)),
        "total": result.get("total"),
        "error": result.get("error"),
    }


HANDLERS: dict[str, Handler] = {
    "execute_request": _h_execute,
    "interrupt": _h_interrupt,
    "inspect": _h_inspect,
    "stats": _h_stats,
    "complete": _h_complete,
    "lint": _h_lint,
    "hover": _h_hover,
    "signature": _h_signature,
    "goto": _h_goto,
    "clear_vars": _h_clear_vars,
    "restart": _h_restart,
    "api_request": _h_api_request,
    "df_page": _h_df_page,
}


@app.websocket("/ws/execute")
async def execute_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    session = get_session()

    try:
        await session.start()
        await websocket.send_json({"type": "status", "state": "idle"})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao iniciar o kernel")
        await websocket.send_json({"type": "kernel_error", "message": str(exc)})
        await websocket.close()
        return

    try:
        while True:
            msg = await websocket.receive_json()
            handler = HANDLERS.get(msg.get("type"))
            if handler is None:
                await websocket.send_json(
                    {"type": "kernel_error", "message": f"tipo desconhecido: {msg.get('type')}"}
                )
                continue
            async for out in handler(session, msg):
                await websocket.send_json(out)
    except WebSocketDisconnect:
        logger.info("Cliente desconectou do /ws/execute")
    except Exception:  # noqa: BLE001
        logger.exception("Erro no loop do WebSocket")
        await websocket.close()


@app.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket) -> None:
    """Terminal real (PTY): streama a saída do shell e recebe teclas/resize."""
    await websocket.accept()
    root = get_workspace().root
    cwd = str(root) if root else os.path.expanduser("~")

    try:
        proc = await asyncio.to_thread(terminal.spawn, cwd, 80, 24)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao abrir o terminal")
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    async def reader() -> None:
        while True:
            try:
                data = await asyncio.to_thread(proc.read, 1024)
            except (EOFError, OSError):
                break
            if not data:
                break
            await websocket.send_json({"type": "output", "data": terminal.to_text(data)})

    async def writer() -> None:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "input":
                await asyncio.to_thread(proc.write, msg.get("data", ""))
            elif msg.get("type") == "resize":
                try:
                    proc.setwinsize(int(msg.get("rows", 24)), int(msg.get("cols", 80)))
                except Exception:  # noqa: BLE001
                    pass

    r_task = asyncio.create_task(reader())
    w_task = asyncio.create_task(writer())
    try:
        await asyncio.wait({r_task, w_task}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in (r_task, w_task):
            t.cancel()
        try:
            await websocket.send_json({"type": "exit"})
        except Exception:  # noqa: BLE001
            pass
        try:
            proc.terminate(force=True)
        except Exception:  # noqa: BLE001
            pass
