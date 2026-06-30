"""Viewer de app FastAPI — introspecta o objeto VIVO (rotas + OpenAPI).

Mostra o que nem o PyCharm faz: o fluxo request/response real do app, direto do
objeto no kernel, sem precisar de print() ou do inspecionar do navegador.

Importado condicionalmente por runtime.activate (só se fastapi estiver instalado).
"""

from __future__ import annotations

import inspect
import json
import time
from collections import OrderedDict
from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRoute

from pykortex.api import viewer
from pykortex.mime import FASTAPI_MIME


def _is_async(fn: Any) -> bool:
    if inspect.iscoroutinefunction(fn):
        return True
    return inspect.iscoroutinefunction(getattr(fn, "__call__", None))

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


def _match_route(app: FastAPI, method: str, path: str) -> APIRoute | None:
    """Encontra a APIRoute que casa com (method, path) — p/ instrumentar a árvore dela."""
    from starlette.routing import Match

    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "path_params": {},
        "headers": [],
        "query_string": b"",
        "root_path": "",
    }
    for r in app.router.routes:
        if isinstance(r, APIRoute):
            try:
                m, _ = r.matches(scope)
            except Exception:  # noqa: BLE001
                continue
            if m == Match.FULL:
                return r
    return None


def _wrap_call(original: Any, node_id: int, timings: dict[int, float]) -> Any:
    """Envolve um callable de dependência para cronometrar (preserva async/sync)."""
    if _is_async(original):
        async def awrap(*a: Any, __o: Any = original, __i: int = node_id, **k: Any) -> Any:
            t0 = time.perf_counter()
            try:
                return await __o(*a, **k)
            finally:
                timings[__i] = round((time.perf_counter() - t0) * 1000, 2)

        return awrap

    def swrap(*a: Any, __o: Any = original, __i: int = node_id, **k: Any) -> Any:
        t0 = time.perf_counter()
        try:
            return __o(*a, **k)
        finally:
            timings[__i] = round((time.perf_counter() - t0) * 1000, 2)

    return swrap


def _instrument(dependant: Any, saved: list, timings: dict[int, float], counter: list[int]) -> dict:
    """Constrói a árvore de dependências e instrumenta cada .call no caminho."""
    node_id = counter[0]
    counter[0] += 1
    original = dependant.call
    name = getattr(original, "__name__", repr(original)) if original is not None else "?"
    if original is not None:
        saved.append((dependant, original))
        dependant.call = _wrap_call(original, node_id, timings)
    children = [_instrument(sub, saved, timings, counter) for sub in dependant.dependencies]
    return {"id": node_id, "name": name, "children": children}


def _attach_timings(node: dict, timings: dict[int, float]) -> None:
    node["ms"] = timings.get(node["id"])
    for child in node["children"]:
        _attach_timings(child, timings)


def trace_request_json(handle: str, args_json: str) -> str:
    """Dispara um request E rastreia o caminho real: middlewares + árvore de
    dependências com tempo de cada uma (instrumentação temporária do app vivo).
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

    route = _match_route(app, method, path)
    saved: list = []
    timings: dict[int, float] = {}
    tree = _instrument(route.dependant, saved, timings, [0]) if route is not None else None

    try:
        middlewares = [getattr(m.cls, "__name__", str(m.cls)) for m in app.user_middleware]
    except Exception:  # noqa: BLE001
        middlewares = []

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
        total = (time.perf_counter() - t0) * 1000
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})
    finally:
        for dep, orig in saved:  # restaura SEMPRE
            dep.call = orig

    if tree is not None:
        _attach_timings(tree, timings)

    try:
        body_text = json.dumps(resp.json(), indent=2, ensure_ascii=False, default=str)
        is_json = True
    except Exception:  # noqa: BLE001
        body_text = resp.text
        is_json = False

    return json.dumps(
        {
            "matched": None
            if route is None
            else {
                "method": method,
                "path": route.path,
                "name": route.name,
                "endpoint": getattr(route.endpoint, "__name__", "?"),
            },
            "middlewares": middlewares,
            "tree": tree,
            "response": {
                "status": resp.status_code,
                "elapsed_ms": round(total, 1),
                "body": body_text[:100_000],
                "is_json": is_json,
            },
            "total_ms": round(total, 1),
        }
    )


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
