"""Viewer de app FastAPI — introspecta o objeto VIVO (rotas + OpenAPI).

Mostra o que nem o PyCharm faz: o fluxo request/response real do app, direto do
objeto no kernel, sem precisar de print() ou do inspecionar do navegador.

Importado condicionalmente por runtime.activate (só se fastapi estiver instalado).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRoute

from pykortex.api import viewer
from pykortex.mime import FASTAPI_MIME

# Rotas que o FastAPI cria sozinho para docs — escondidas para focar na API.
_SKIP_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


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
