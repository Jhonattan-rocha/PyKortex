"""Smoke test do kernel manager (sem camada HTTP).

Executa um trecho de código e verifica que recebemos stream de stdout,
um execute_result e o reply final. Rode com:
    .venv\\Scripts\\python.exe -m tests.test_kernel_smoke
ou via pytest.
"""

from __future__ import annotations

import asyncio

from pykortex_engine.kernels import get_session


async def _run() -> list[dict]:
    session = get_session()
    await session.start()
    code = "print('ola do kernel'); x = 6 * 7; x"
    msgs = [m async for m in session.execute(code)]
    await session.shutdown()
    return msgs


def test_execute_streams_output() -> None:
    msgs = asyncio.run(_run())
    types = [m["type"] for m in msgs]

    assert any(
        m["type"] == "stream" and "ola do kernel" in m["text"] for m in msgs
    ), f"esperado stream stdout, veio: {types}"
    assert any(
        m["type"] == "execute_result" and "42" in str(m["data"].get("text/plain", ""))
        for m in msgs
    ), f"esperado execute_result 42, veio: {types}"
    assert any(
        m["type"] == "execute_reply" and m["status"] == "ok" for m in msgs
    ), f"esperado execute_reply ok, veio: {types}"


if __name__ == "__main__":
    out = asyncio.run(_run())
    for m in out:
        print(m)
    print("\nSMOKE_OK")
