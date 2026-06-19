"""Cliente manual que valida /health e o WebSocket /ws/execute do engine rodando.

Uso (com o servidor já no ar em 127.0.0.1:8765):
    .venv\\Scripts\\python.exe tests/ws_client_check.py
"""

from __future__ import annotations

import asyncio
import json
import urllib.request

from websockets.asyncio.client import connect

BASE = "127.0.0.1:8765"


def check_health() -> None:
    with urllib.request.urlopen(f"http://{BASE}/health", timeout=5) as r:
        body = json.loads(r.read())
    assert body["status"] == "ok", body
    print("HEALTH_OK", body)


async def check_execute() -> None:
    async with connect(f"ws://{BASE}/ws/execute") as ws:
        # primeira mensagem: status idle (kernel pronto)
        first = json.loads(await ws.recv())
        print("conn:", first)

        await ws.send(json.dumps({"type": "execute_request", "code": "print('hi'); 2+2"}))

        got_result = False
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            print("recv:", msg)
            if msg["type"] == "execute_result" and "4" in str(msg["data"].get("text/plain")):
                got_result = True
            if msg["type"] == "execute_reply":
                break
        assert got_result, "nao recebeu execute_result esperado"
        print("EXECUTE_OK")


if __name__ == "__main__":
    check_health()
    asyncio.run(check_execute())
    print("\nALL_OK")
