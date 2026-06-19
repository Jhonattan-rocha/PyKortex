"""Contratos de mensagem trocadas via WebSocket /execute.

Estes modelos espelham (do lado Python) o que vive em `packages/protocol` no
frontend. Mantenha os dois lados em sincronia. As mensagens de saída são um
subconjunto traduzido do protocolo de mensagens do Jupyter (canal iopub/shell).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

# --- Cliente -> Servidor -------------------------------------------------


class ExecuteRequest(BaseModel):
    type: Literal["execute_request"] = "execute_request"
    code: str


class InterruptRequest(BaseModel):
    type: Literal["interrupt"] = "interrupt"


# --- Servidor -> Cliente -------------------------------------------------
# Enviadas como dicts simples (JSON) para evitar overhead; as classes abaixo
# documentam o formato e servem de referência para os tipos do frontend.


class KernelStatus(BaseModel):
    type: Literal["status"] = "status"
    state: Literal["busy", "idle", "starting"]


class StreamOutput(BaseModel):
    type: Literal["stream"] = "stream"
    name: Literal["stdout", "stderr"]
    text: str


class ExecuteResult(BaseModel):
    type: Literal["execute_result"] = "execute_result"
    execution_count: int | None = None
    data: dict[str, Any]  # mime bundle: text/plain, text/html, image/png, ...


class DisplayData(BaseModel):
    type: Literal["display_data"] = "display_data"
    data: dict[str, Any]


class ErrorOutput(BaseModel):
    type: Literal["error"] = "error"
    ename: str
    evalue: str
    traceback: list[str]


class ExecuteReply(BaseModel):
    type: Literal["execute_reply"] = "execute_reply"
    status: Literal["ok", "error", "aborted"]
    execution_count: int | None = None
