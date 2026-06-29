"""Sessão de debug via o protocolo de debug do Jupyter (debugpy no ipykernel).

Usa um SEGUNDO kernel client no mesmo kernel, dedicado ao debug: o DAP roda no
canal de controle (debug_request/debug_reply) e os eventos (stopped/output) vêm
no iopub (broadcast). Assim o `/ws/execute` principal não é afetado.

Fluxo DAP: initialize -> attach -> configurationDone -> setBreakpoints ->
`%run arquivo` -> evento `stopped` -> stackTrace/scopes/variables ->
continue/next/stepIn/stepOut -> disconnect.
"""

from __future__ import annotations

import asyncio
from queue import Empty
from typing import Any, AsyncIterator

from pykortex_engine.files import get_workspace

_IOPUB_TIMEOUT = 1.0
_CONTROL_TIMEOUT = 15.0


class DebugSession:
    def __init__(self, session: Any) -> None:
        self._session = session
        self._client: Any = None
        self._seq = 0
        self._run_id: str | None = None
        self._dap_lock = asyncio.Lock()
        self._started = False

    async def start(self) -> None:
        """Cria o client de debug e faz o handshake DAP."""
        km = self._session._km
        if km is None:
            await self._session.start()
            km = self._session._km
        self._client = km.client()
        self._client.start_channels()
        await self._client.wait_for_ready(timeout=30)
        await self._dap(
            "initialize",
            {
                "clientID": "pykortex",
                "clientName": "PyKortex",
                "adapterID": "",
                "pathFormat": "path",
                "linesStartAt1": True,
                "columnsStartAt1": True,
                "supportsVariableType": True,
                "supportsVariablePaging": True,
                "supportsRunInTerminalRequest": True,
                "locale": "pt",
            },
        )
        await self._dap("attach", {})
        await self._dap("configurationDone", {})
        self._started = True

    async def _dap(self, command: str, arguments: dict | None = None) -> dict:
        """Envia um debug_request e aguarda o debug_reply correspondente (serializado)."""
        async with self._dap_lock:
            self._seq += 1
            seq = self._seq
            content: dict[str, Any] = {"type": "request", "command": command, "seq": seq}
            if arguments is not None:
                content["arguments"] = arguments
            self._client.control_channel.send(
                self._client.session.msg("debug_request", content)
            )
            for _ in range(200):
                try:
                    reply = await self._client.get_control_msg(timeout=_CONTROL_TIMEOUT)
                except (Empty, asyncio.TimeoutError):
                    break
                body = reply["content"]
                if body.get("request_seq") == seq:
                    return body
            return {"success": False, "command": command, "body": {}}

    # --- caminho/relativização -------------------------------------------------

    def _abs(self, rel: str) -> str:
        """Resolve um caminho relativo do workspace para absoluto (forward-slash)."""
        return get_workspace().resolve(rel).as_posix()

    def _rel(self, abs_path: str) -> str | None:
        """Converte um caminho absoluto de volta p/ relativo ao workspace, ou None."""
        ws = get_workspace().root
        if ws is None or not abs_path:
            return None
        try:
            from pathlib import Path

            return Path(abs_path).resolve().relative_to(ws).as_posix()
        except (ValueError, OSError):
            return None

    # --- comandos --------------------------------------------------------------

    async def set_breakpoints(self, rel_path: str, lines: list[int]) -> list[dict]:
        r = await self._dap(
            "setBreakpoints",
            {
                "source": {"path": self._abs(rel_path)},
                "breakpoints": [{"line": int(n)} for n in lines],
                "sourceModified": False,
            },
        )
        return r.get("body", {}).get("breakpoints", [])

    def run(self, rel_path: str) -> str:
        """Roda o arquivo no kernel via %run (dispara o debug)."""
        self._run_id = self._client.execute(f'%run "{self._abs(rel_path)}"')
        return self._run_id

    async def _frame(self, frame_id: int) -> list[dict]:
        """Scopes do frame + variáveis de cada scope (1 nível)."""
        scopes = (await self._dap("scopes", {"frameId": frame_id})).get("body", {}).get(
            "scopes", []
        )
        out: list[dict] = []
        for sc in scopes:
            ref = sc.get("variablesReference", 0)
            variables = await self.variables(ref) if ref else []
            out.append(
                {
                    "name": sc.get("name"),
                    "variablesReference": ref,
                    "expensive": sc.get("expensive", False),
                    "variables": variables,
                }
            )
        return out

    async def variables(self, ref: int) -> list[dict]:
        vs = (await self._dap("variables", {"variablesReference": ref})).get(
            "body", {}
        ).get("variables", [])
        return [
            {
                "name": v.get("name"),
                "value": (v.get("value") or "")[:600],
                "type": v.get("type", ""),
                "variablesReference": v.get("variablesReference", 0),
            }
            for v in vs
        ]

    async def frame(self, frame_id: int) -> list[dict]:
        return await self._frame(frame_id)

    async def _stopped_payload(self, thread_id: int, reason: str) -> dict:
        frames_raw = (await self._dap("stackTrace", {"threadId": thread_id})).get(
            "body", {}
        ).get("stackFrames", [])
        frames = [
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "line": f.get("line"),
                "path": self._rel((f.get("source") or {}).get("path", "")),
                "absPath": (f.get("source") or {}).get("path"),
            }
            for f in frames_raw
        ]
        top = frames[0] if frames else {}
        scopes = await self._frame(top["id"]) if top.get("id") is not None else []
        return {
            "type": "stopped",
            "threadId": thread_id,
            "reason": reason,
            "line": top.get("line"),
            "path": top.get("path"),
            "frames": frames,
            "scopes": scopes,
        }

    async def cont(self, thread_id: int) -> None:
        await self._dap("continue", {"threadId": thread_id})

    async def step_over(self, thread_id: int) -> None:
        await self._dap("next", {"threadId": thread_id})

    async def step_in(self, thread_id: int) -> None:
        await self._dap("stepIn", {"threadId": thread_id})

    async def step_out(self, thread_id: int) -> None:
        await self._dap("stepOut", {"threadId": thread_id})

    async def events(self) -> AsyncIterator[dict]:
        """Stream de eventos de debug + saída do programa (do iopub do debug client)."""
        while True:
            try:
                msg = await self._client.get_iopub_msg(timeout=_IOPUB_TIMEOUT)
            except (Empty, asyncio.TimeoutError):
                continue
            mt = msg["header"]["msg_type"]
            parent = msg.get("parent_header", {}).get("msg_id")

            if mt == "debug_event":
                ev = msg["content"]
                name = ev.get("event")
                if name == "stopped":
                    body = ev.get("body", {})
                    tid = body.get("threadId") or 1
                    yield await self._stopped_payload(tid, body.get("reason", ""))
                elif name == "continued":
                    yield {"type": "continued"}
                continue

            if parent and parent == self._run_id:
                if mt == "stream":
                    yield {"type": "output", "text": msg["content"].get("text", "")}
                elif mt == "error":
                    yield {
                        "type": "output",
                        "text": "\n".join(msg["content"].get("traceback", [])),
                    }
                elif mt == "status" and msg["content"].get("execution_state") == "idle":
                    yield {"type": "terminated"}

    async def disconnect(self) -> None:
        try:
            if self._started:
                await self._dap("disconnect", {"terminateDebuggee": False})
        except Exception:  # noqa: BLE001
            pass
        finally:
            try:
                if self._client is not None:
                    self._client.stop_channels()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
            self._started = False
