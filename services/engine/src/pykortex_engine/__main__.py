"""Ponto de entrada do engine: `python -m pykortex_engine`.

O Electron spawna este módulo. Resolve o event loop do Windows (pyzmq exige
SelectorEventLoop, não o Proactor padrão) e sobe o uvicorn.

Argumentos via env:
    PYKORTEX_HOST (default 127.0.0.1)
    PYKORTEX_PORT (default 8765)
"""

from __future__ import annotations

import asyncio
import os
import sys

# Aplicado no import, antes de qualquer event loop ser criado: pyzmq (usado pelos
# kernels) não suporta o ProactorEventLoop padrão do Windows.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def main() -> None:
    import uvicorn

    host = os.environ.get("PYKORTEX_HOST", "127.0.0.1")
    port = int(os.environ.get("PYKORTEX_PORT", "8765"))

    config = uvicorn.Config(
        "pykortex_engine.api.app:app",
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)

    # Criamos o loop nós mesmos (Selector no Windows) e servimos dentro dele,
    # garantindo que o zmq dos kernels veja um loop compatível.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(server.serve())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
