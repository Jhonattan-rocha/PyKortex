"""Recursos de "LSP" estáticos via jedi + pyflakes (sem o protocolo LSP).

Diagnósticos, hover, assinatura e ir-para-definição rodam sobre o texto do
arquivo — o mesmo motor (jedi/pyflakes) que o pylsp usa por baixo. Posições
seguem a convenção do jedi: linha 1-based, coluna 0-based.
"""

from __future__ import annotations

import ast
from typing import Any


def lint(code: str) -> list[dict[str, Any]]:
    """Diagnósticos (pyflakes) — nomes indefinidos, imports não usados, sintaxe."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [
            {
                "line": exc.lineno or 1,
                "col": max(0, (exc.offset or 1) - 1),
                "message": exc.msg or "erro de sintaxe",
                "severity": "error",
            }
        ]

    diags: list[dict[str, Any]] = []
    try:
        from pyflakes import checker, messages

        error_types = tuple(
            t
            for t in (
                getattr(messages, "UndefinedName", None),
                getattr(messages, "UndefinedLocal", None),
                getattr(messages, "UndefinedExport", None),
            )
            if t is not None
        )
        for m in checker.Checker(tree).messages:
            diags.append(
                {
                    "line": m.lineno,
                    "col": getattr(m, "col", 0),
                    "message": m.message % m.message_args,
                    "severity": "error" if isinstance(m, error_types) else "warning",
                }
            )
    except Exception:  # noqa: BLE001 - lint é best-effort
        pass
    return diags


def hover(code: str, line: int, col: int) -> dict[str, Any]:
    """Documentação/assinatura do símbolo na posição (jedi help)."""
    try:
        import jedi

        names = jedi.Script(code=code).help(line, col)
        if names:
            n = names[0]
            # "kind" (não "type") para não colidir com o discriminador da mensagem WS
            return {"name": n.name, "kind": n.type, "docstring": n.docstring()}
    except Exception:  # noqa: BLE001
        pass
    return {}


def signatures(code: str, line: int, col: int) -> list[dict[str, Any]]:
    """Assinaturas da chamada na posição (jedi get_signatures)."""
    try:
        import jedi

        out: list[dict[str, Any]] = []
        for s in jedi.Script(code=code).get_signatures(line, col):
            out.append(
                {
                    "label": s.to_string(),
                    "params": [p.to_string() for p in s.params],
                    "active": s.index if s.index is not None else 0,
                }
            )
        return out
    except Exception:  # noqa: BLE001
        return []


def goto(code: str, line: int, col: int) -> list[dict[str, Any]]:
    """Definição do símbolo na posição (jedi goto). path=None => mesmo arquivo."""
    try:
        import jedi

        out: list[dict[str, Any]] = []
        for d in jedi.Script(code=code).goto(line, col, follow_imports=True):
            p = d.module_path
            out.append({"path": str(p) if p else None, "line": d.line or 1, "col": d.column or 0})
        return out
    except Exception:  # noqa: BLE001
        return []
