"""Gerência do ciclo de vida e execução de kernels Jupyter.

Para a Fase 0 mantemos uma única sessão de kernel por processo do engine.
Fases seguintes vão generalizar para múltiplos kernels (um por documento/projeto).
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
import sys
from queue import Empty
from typing import Any, AsyncIterator

from jupyter_client.manager import AsyncKernelManager

# Tempo máximo de espera por uma mensagem do kernel (segundos). Execuções longas
# emitem mensagens de status periodicamente, então este timeout vale por-mensagem,
# não pela execução inteira.
KERNEL_MSG_TIMEOUT = float(os.environ.get("PYKORTEX_KERNEL_MSG_TIMEOUT", "1.0"))
KERNEL_NAME = os.environ.get("PYKORTEX_KERNEL_NAME", "pykortex")


def _ensure_kernelspec() -> str:
    """Garante um kernelspec instalado dentro da venv atual e retorna seu nome.

    Evita depender de `jupyter kernelspec install` manual. Se o ipykernel não
    estiver disponível por algum motivo, cai para o spec padrão 'python3'.
    """
    try:
        from ipykernel.kernelspec import install as install_kernel_spec

        install_kernel_spec(
            user=False,
            prefix=sys.prefix,
            kernel_name=KERNEL_NAME,
            display_name="PyKortex (Python 3)",
        )
        return KERNEL_NAME
    except Exception:  # noqa: BLE001 - fallback resiliente para o spike
        return "python3"


def _parse_json_str(text_plain: str) -> Any:
    """user_expressions retorna repr(str) em text/plain; desembrulha + json.loads.

    Ex.: ``"'{...}'"`` -> literal Python (string) -> objeto JSON.
    """
    if not text_plain:
        return None
    try:
        inner = ast.literal_eval(text_plain)  # repr de string -> string
        return json.loads(inner)
    except Exception:  # noqa: BLE001
        return None


def _translate_iopub(msg: dict[str, Any]) -> dict[str, Any] | None:
    """Traduz uma mensagem do canal iopub para o protocolo do PyKortex.

    Retorna None para mensagens que não precisam chegar ao frontend.
    """
    msg_type = msg["header"]["msg_type"]
    content = msg["content"]

    if msg_type == "stream":
        return {"type": "stream", "name": content["name"], "text": content["text"]}
    if msg_type == "execute_result":
        return {
            "type": "execute_result",
            "execution_count": content.get("execution_count"),
            "data": content.get("data", {}),
        }
    if msg_type == "display_data":
        return {"type": "display_data", "data": content.get("data", {})}
    if msg_type == "error":
        return {
            "type": "error",
            "ename": content.get("ename", ""),
            "evalue": content.get("evalue", ""),
            "traceback": content.get("traceback", []),
        }
    if msg_type == "status":
        return {"type": "status", "state": content.get("execution_state", "idle")}
    # execute_input e demais: ignorados na Fase 0
    return None


class KernelSession:
    """Encapsula um AsyncKernelManager + client e expõe execução em streaming."""

    def __init__(self) -> None:
        self._km: AsyncKernelManager | None = None
        self._client: Any = None
        self._start_lock = asyncio.Lock()
        self._proc: Any = None  # psutil.Process raiz do kernel (medição externa)
        self._procs: dict[int, Any] = {}  # cache pid->Process p/ deltas de CPU

    @property
    def is_alive(self) -> bool:
        return self._km is not None

    async def start(self) -> None:
        async with self._start_lock:
            if self._km is not None:
                return
            kernel_name = _ensure_kernelspec()
            km = AsyncKernelManager(kernel_name=kernel_name)
            await km.start_kernel()
            client = km.client()
            client.start_channels()
            await client.wait_for_ready(timeout=60)
            self._km = km
            self._client = client
            self._attach_proc()
            await self._activate_runtime()

    def _attach_proc(self) -> None:
        """Cria um psutil.Process do kernel para medir mem/CPU de fora.

        Medir externamente (pelo PID) funciona mesmo com o kernel ocupado —
        diferente de uma query out-of-band, que esperaria o kernel ficar idle.
        """
        self._proc = None
        self._procs = {}
        try:
            import psutil

            km = self._km
            prov = getattr(km, "provisioner", None)
            pid = getattr(prov, "pid", None) or getattr(
                getattr(prov, "process", None), "pid", None
            )
            if pid is None:
                pid = getattr(getattr(km, "kernel", None), "pid", None)
            if pid:
                self._proc = psutil.Process(pid)
        except Exception:  # noqa: BLE001 - métricas são best-effort
            self._proc = None

    def _tree(self) -> list[Any]:
        """Processos do kernel: a raiz + filhos (no Windows o kernel real é filho)."""
        if self._proc is None:
            return []
        try:
            return [self._proc, *self._proc.children(recursive=True)]
        except Exception:  # noqa: BLE001
            return []

    def stats(self) -> dict[str, Any]:
        """Métricas agregadas do processo do kernel (síncrono, medição externa)."""
        tree = self._tree()
        if not tree:
            return {"alive": False}
        try:
            current: dict[int, Any] = {}
            for p in tree:
                cached = self._procs.get(p.pid)
                if cached is None:
                    cached = p
                    cached.cpu_percent(None)  # baseline na 1ª vez
                current[p.pid] = cached
            self._procs = current

            mem = sum(p.memory_info().rss for p in current.values()) / (1024 * 1024)
            cpu = sum(p.cpu_percent(None) for p in current.values())
            threads = sum(p.num_threads() for p in current.values())
            return {
                "alive": True,
                "memory_mb": round(mem, 1),
                "cpu_percent": round(cpu, 1),
                "threads": threads,
            }
        except Exception:  # noqa: BLE001 - processo morto/sem acesso
            return {"alive": False}

    async def _activate_runtime(self) -> None:
        """Ativa o runtime in-kernel (viewers ricos do PyKortex), best-effort."""
        code = (
            "try:\n"
            "    import pykortex as __pk; __pk._activate()\n"
            "except Exception:\n"
            "    pass\n"
        )
        try:
            await self._run_silent(code)
        except Exception:  # noqa: BLE001 - ausência do runtime não é fatal
            pass

    async def _run_silent(self, code: str) -> None:
        """Executa código sem histórico/saída e aguarda o reply do shell."""
        client = self._client
        msg_id = client.execute(
            code, silent=True, store_history=False, allow_stdin=False
        )
        for _ in range(50):
            try:
                reply = await client.get_shell_msg(timeout=KERNEL_MSG_TIMEOUT)
            except (Empty, asyncio.TimeoutError):
                continue
            if reply.get("parent_header", {}).get("msg_id") == msg_id:
                return

    async def execute(self, code: str) -> AsyncIterator[dict[str, Any]]:
        """Executa `code` e produz mensagens traduzidas conforme chegam.

        Encerra quando o kernel volta ao estado 'idle' para esta requisição.
        """
        if self._km is None:
            await self.start()
        client = self._client

        msg_id = client.execute(code)

        # Stream das mensagens do canal iopub pertencentes a esta execução.
        while True:
            try:
                msg = await client.get_iopub_msg(timeout=KERNEL_MSG_TIMEOUT)
            except Empty:
                continue
            except asyncio.TimeoutError:
                continue

            if msg.get("parent_header", {}).get("msg_id") != msg_id:
                continue

            translated = _translate_iopub(msg)
            if translated is not None:
                yield translated

            if (
                msg["header"]["msg_type"] == "status"
                and msg["content"].get("execution_state") == "idle"
            ):
                break

        # Reply do canal shell: status final + execution_count.
        try:
            reply = await client.get_shell_msg(timeout=KERNEL_MSG_TIMEOUT)
            content = reply["content"]
            yield {
                "type": "execute_reply",
                "status": content.get("status", "ok"),
                "execution_count": content.get("execution_count"),
            }
        except (Empty, asyncio.TimeoutError):
            pass

    async def _eval_expr(self, expr: str) -> Any:
        """Avalia uma expressão out-of-band (silent + user_expressions).

        Não cria In[n] nem saída no console; o resultado (string JSON) volta no
        execute_reply. Retorna o objeto JSON parseado, ou None em falha.
        """
        if self._km is None:
            return None
        client = self._client
        msg_id = client.execute(
            "",
            silent=True,
            store_history=False,
            allow_stdin=False,
            user_expressions={"v": expr},
        )
        for _ in range(50):
            try:
                reply = await client.get_shell_msg(timeout=KERNEL_MSG_TIMEOUT)
            except (Empty, asyncio.TimeoutError):
                continue
            if reply.get("parent_header", {}).get("msg_id") != msg_id:
                continue
            result = reply["content"].get("user_expressions", {}).get("v", {})
            if result.get("status") != "ok":
                return None
            return _parse_json_str(result.get("data", {}).get("text/plain", ""))
        return None

    async def inspect(self) -> list[dict[str, Any]]:
        """Lista as variáveis do namespace (out-of-band)."""
        data = await self._eval_expr('__import__("pykortex")._inspect_json()')
        return data if isinstance(data, list) else []

    async def page(
        self,
        handle: str,
        start: int,
        end: int,
        sort_col: str | None = None,
        sort_dir: str | None = None,
        filters: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Recorta linhas [start:end) de um DataFrame cacheado (out-of-band)."""
        # filtros só com chaves/valores str; repr produz literal seguro p/ eval
        safe_filters = {
            str(k): str(v) for k, v in (filters or {}).items() if isinstance(v, str) and v
        }
        expr = (
            f'__import__("pykortex")._page_json('
            f"{handle!r}, {int(start)}, {int(end)}, {sort_col!r}, {sort_dir!r}, {safe_filters!r})"
        )
        data = await self._eval_expr(expr)
        return data if isinstance(data, dict) else {"error": "eval failed", "rows": [], "total": 0}

    async def clear_vars(self) -> int:
        """Limpa as variáveis de dado do namespace sem reiniciar o kernel."""
        data = await self._eval_expr('__import__("pykortex")._clear_namespace_json()')
        return data.get("cleared", 0) if isinstance(data, dict) else 0

    async def list_commands(self) -> list[dict[str, Any]]:
        """Lista os comandos `@pk.command` registrados (out-of-band)."""
        data = await self._eval_expr('__import__("pykortex")._list_commands_json()')
        return data if isinstance(data, list) else []

    async def command_inputs(self, name: str) -> list[dict[str, Any]]:
        """Resolve os inputs de um comando (out-of-band, antes de rodá-lo)."""
        expr = f'__import__("pykortex")._command_inputs_json({name!r})'
        data = await self._eval_expr(expr)
        return data if isinstance(data, list) else []

    async def list_panels(self) -> list[dict[str, Any]]:
        """Lista os painéis `@pk.panel` registrados (out-of-band)."""
        data = await self._eval_expr('__import__("pykortex")._list_panels_json()')
        return data if isinstance(data, list) else []

    async def render_panel(self, name: str) -> dict[str, Any]:
        """Renderiza um painel para HTML (out-of-band)."""
        expr = f'__import__("pykortex")._render_panel_json({name!r})'
        data = await self._eval_expr(expr)
        return data if isinstance(data, dict) else {"html": ""}

    async def complete(self, code: str, cursor_pos: int) -> dict[str, Any]:
        """Completar via o kernel (jedi + namespace vivo), na posição do cursor."""
        empty = {"matches": [], "cursor_start": cursor_pos, "cursor_end": cursor_pos, "types": []}
        if self._km is None:
            return empty
        client = self._client
        msg_id = client.complete(code, cursor_pos)
        for _ in range(50):
            try:
                reply = await client.get_shell_msg(timeout=KERNEL_MSG_TIMEOUT)
            except (Empty, asyncio.TimeoutError):
                continue
            if reply.get("parent_header", {}).get("msg_id") != msg_id:
                continue
            c = reply["content"]
            meta = c.get("metadata", {}).get("_jupyter_types_experimental", [])
            types = [m.get("type", "") for m in meta] if isinstance(meta, list) else []
            return {
                "matches": c.get("matches", []),
                "cursor_start": c.get("cursor_start", cursor_pos),
                "cursor_end": c.get("cursor_end", cursor_pos),
                "types": types,
            }
        return empty

    async def request_app(
        self,
        handle: str,
        method: str,
        path: str,
        query: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: Any = None,
        has_body: bool = False,
    ) -> dict[str, Any]:
        """Dispara um request contra um app FastAPI cacheado (in-process)."""
        args = json.dumps(
            {
                "method": method,
                "path": path,
                "query": query or {},
                "headers": headers or {},
                "body": body,
                "has_body": bool(has_body),
            }
        )
        expr = f'__import__("pykortex")._request_json({handle!r}, {args!r})'
        data = await self._eval_expr(expr)
        return data if isinstance(data, dict) else {"error": "eval failed"}

    async def trace_app(
        self,
        handle: str,
        method: str,
        path: str,
        query: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: Any = None,
        has_body: bool = False,
    ) -> dict[str, Any]:
        """Dispara um request E rastreia o caminho (middlewares + dependências)."""
        args = json.dumps(
            {
                "method": method,
                "path": path,
                "query": query or {},
                "headers": headers or {},
                "body": body,
                "has_body": bool(has_body),
            }
        )
        expr = f'__import__("pykortex")._trace_request_json({handle!r}, {args!r})'
        data = await self._eval_expr(expr)
        return data if isinstance(data, dict) else {"error": "eval failed"}

    async def query_engine(self, handle: str, sql: str) -> dict[str, Any]:
        """Roda SQL contra um Engine SQLAlchemy vivo cacheado por handle."""
        args = json.dumps({"sql": sql})
        expr = f'__import__("pykortex")._query_engine_json({handle!r}, {args!r})'
        data = await self._eval_expr(expr)
        return data if isinstance(data, dict) else {"error": "eval failed"}

    async def interrupt(self) -> None:
        if self._km is not None:
            await self._km.interrupt_kernel()

    async def restart(self) -> None:
        """Reinicia o kernel (zera o namespace e o contador de execução).

        As channels do client persistem (mesma conexão), então só re-esperamos
        o kernel ficar pronto.
        """
        if self._km is None:
            await self.start()
            return
        await self._km.restart_kernel(now=True)
        await self._client.wait_for_ready(timeout=60)
        self._attach_proc()
        await self._activate_runtime()

    async def shutdown(self) -> None:
        if self._client is not None:
            self._client.stop_channels()
            self._client = None
        if self._km is not None:
            await self._km.shutdown_kernel(now=True)
            self._km = None


_session: KernelSession | None = None


def get_session() -> KernelSession:
    """Retorna a sessão de kernel singleton do processo."""
    global _session
    if _session is None:
        _session = KernelSession()
    return _session
