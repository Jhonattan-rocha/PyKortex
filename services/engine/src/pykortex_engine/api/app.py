"""Aplicação FastAPI do engine do PyKortex.

Expõe:
  GET  /health           -> readiness check (usado pelo Electron antes de abrir a UI)
  WS   /ws/execute       -> execução de código em streaming via kernel Jupyter
  REST /fs/*             -> operações de filesystem confinadas ao workspace
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from pykortex_engine import __version__
from pykortex_engine.api.files_router import router as files_router
from pykortex_engine.kernels import get_session

logger = logging.getLogger("pykortex.engine")

app = FastAPI(title="PyKortex Engine", version=__version__)

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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


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
            msg_type = msg.get("type")

            if msg_type == "execute_request":
                code = msg.get("code", "")
                async for out in session.execute(code):
                    await websocket.send_json(out)
            elif msg_type == "interrupt":
                await session.interrupt()
            elif msg_type == "inspect":
                variables = await session.inspect()
                await websocket.send_json({"type": "variables", "variables": variables})
            elif msg_type == "df_page":
                result = await session.page(
                    msg.get("handle", ""), msg.get("start", 0), msg.get("end", 0)
                )
                await websocket.send_json(
                    {
                        "type": "df_rows",
                        "reqId": msg.get("reqId"),
                        "rows": result.get("rows", []),
                        "start": result.get("start", msg.get("start", 0)),
                        "error": result.get("error"),
                    }
                )
            elif msg_type == "restart":
                await session.restart()
                await websocket.send_json({"type": "restarted"})
                await websocket.send_json({"type": "status", "state": "idle"})
            else:
                await websocket.send_json(
                    {"type": "kernel_error", "message": f"tipo desconhecido: {msg_type}"}
                )
    except WebSocketDisconnect:
        logger.info("Cliente desconectou do /ws/execute")
    except Exception:  # noqa: BLE001
        logger.exception("Erro no loop do WebSocket")
        await websocket.close()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await get_session().shutdown()
