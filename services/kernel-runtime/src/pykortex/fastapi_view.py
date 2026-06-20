"""Viewer de app FastAPI — introspecta o objeto VIVO (rotas + OpenAPI).

Mostra o que nem o PyCharm faz: o fluxo request/response real do app, direto do
objeto no kernel, sem precisar de print() ou do inspecionar do navegador.

Importado condicionalmente por runtime.activate (só se fastapi estiver instalado).
"""

from __future__ import annotations

import json
import time
from collections import OrderedDict
from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRoute

from pykortex.api import viewer
from pykortex.mime import FASTAPI_MIME

# Rotas que o FastAPI cria sozinho para docs — escondidas para focar na API.
_SKIP_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}

# Apps registrados por handle (para o cliente embutido de request).
_APPS: "OrderedDict[str, FastAPI]" = OrderedDict()
_CLIENTS: dict[str, Any] = {}
_app_counter = 0


def _register_app(app: FastAPI) -> str:
    global _app_counter
    _app_counter += 1
    handle = f"app{_app_counter}"
    _APPS[handle] = app
    _APPS.move_to_end(handle)
    while len(_APPS) > 8:
        old, _ = _APPS.popitem(last=False)
        _CLIENTS.pop(old, None)
    return handle


def request_json(handle: str, args_json: str) -> str:
    """Dispara um request contra o app vivo (TestClient, in-process) e retorna JSON.

    args_json: {"method","path","query","headers","body","has_body"}.
    """
    app = _APPS.get(handle)
    if app is None:
        return json.dumps({"error": "app expirado — re-exiba o app"})
    try:
        args = json.loads(args_json)
    except Exception:  # noqa: BLE001
        args = {}

    method = (args.get("method") or "GET").upper()
    path = args.get("path") or "/"
    query = {k: v for k, v in (args.get("query") or {}).items() if v != ""}
    headers = args.get("headers") or {}

    try:
        from fastapi.testclient import TestClient

        client = _CLIENTS.get(handle)
        if client is None:
            client = TestClient(app, raise_server_exceptions=False)
            _CLIENTS[handle] = client

        kwargs: dict[str, Any] = {}
        if query:
            kwargs["params"] = query
        if headers:
            kwargs["headers"] = headers
        if args.get("has_body"):
            kwargs["json"] = args.get("body")

        t0 = time.perf_counter()
        resp = client.request(method, path, **kwargs)
        elapsed = (time.perf_counter() - t0) * 1000

        try:
            body_text = json.dumps(resp.json(), indent=2, ensure_ascii=False, default=str)
            is_json = True
        except Exception:  # noqa: BLE001
            body_text = resp.text
            is_json = False

        return json.dumps(
            {
                "status": resp.status_code,
                "elapsed_ms": round(elapsed, 1),
                "headers": dict(resp.headers),
                "body": body_text[:200_000],
                "is_json": is_json,
            }
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})


def _schema_name(schema: dict[str, Any]) -> str | None:
    if not isinstance(schema, dict):
        return None
    ref = schema.get("$ref")
    if ref:
        return ref.rsplit("/", 1)[-1]
    if "items" in schema:  # array
        inner = _schema_name(schema["items"])
        return f"{inner}[]" if inner else "array"
    return schema.get("type")


def build_fastapi_payload(app: FastAPI) -> dict[str, Any]:
    try:
        spec = app.openapi()
    except Exception:  # noqa: BLE001
        spec = {}
    paths = spec.get("paths", {})
    info = spec.get("info", {})

    routes: list[dict[str, Any]] = []
    for r in app.routes:
        if not isinstance(r, APIRoute) or r.path in _SKIP_PATHS:
            continue
        for method in sorted(m for m in (r.methods or []) if m not in ("HEAD", "OPTIONS")):
            op = paths.get(r.path, {}).get(method.lower(), {})

            params = [
                {
                    "name": p.get("name"),
                    "in": p.get("in"),
                    "required": bool(p.get("required")),
                    "type": (p.get("schema") or {}).get("type", ""),
                }
                for p in op.get("parameters", [])
            ]

            body_schema = None
            body = op.get("requestBody")
            if isinstance(body, dict):
                for content in body.get("content", {}).values():
                    body_schema = _schema_name(content.get("schema", {}))
                    break

            responses = {
                str(code): {
                    "description": resp.get("description", ""),
                    "schema": _schema_name(
                        next(iter(resp.get("content", {}).values()), {}).get("schema", {})
                    ),
                }
                for code, resp in op.get("responses", {}).items()
            }

            routes.append(
                {
                    "method": method,
                    "path": r.path,
                    "name": r.name,
                    "tags": list(r.tags or []),
                    "summary": op.get("summary", ""),
                    "deprecated": bool(op.get("deprecated")),
                    "params": params,
                    "requestBody": body_schema,
                    "responses": responses,
                }
            )

    return {
        "kind": "fastapi",
        "handle": _register_app(app),
        "title": info.get("title", "FastAPI"),
        "version": info.get("version", ""),
        "count": len(routes),
        "routes": routes,
    }


@viewer(FastAPI)
def _view_fastapi(app: FastAPI) -> dict[str, Any]:
    return {
        FASTAPI_MIME: build_fastapi_payload(app),
        "text/plain": f"FastAPI '{getattr(app, 'title', 'app')}' — {len(app.routes)} rotas",
    }
