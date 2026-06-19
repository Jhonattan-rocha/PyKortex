"""Testa as rotas /fs com TestClient (sem kernel)."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from pykortex_engine.api.app import app


def test_fs_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "sub").mkdir()
        (root / "a.py").write_text("print('a')", encoding="utf-8")
        (root / "sub" / "b.py").write_text("print('b')", encoding="utf-8")

        client = TestClient(app)

        # define workspace
        r = client.post("/fs/workspace", json={"root": str(root)})
        assert r.status_code == 200, r.text

        # lista root: dir 'sub' antes de 'a.py'
        r = client.get("/fs/list", params={"path": ""})
        names = [e["name"] for e in r.json()["entries"]]
        assert names == ["sub", "a.py"], names

        # lê arquivo
        r = client.get("/fs/read", params={"path": "a.py"})
        assert r.json()["content"] == "print('a')"

        # escreve novo arquivo
        r = client.put("/fs/write", json={"path": "novo.py", "content": "x = 1\n"})
        assert r.status_code == 200, r.text
        assert (root / "novo.py").read_text(encoding="utf-8") == "x = 1\n"

        # confinamento: tentar escapar do root -> 400
        r = client.get("/fs/read", params={"path": "../segredo.txt"})
        assert r.status_code == 400, r.text


if __name__ == "__main__":
    test_fs_roundtrip()
    print("FS_OK")
