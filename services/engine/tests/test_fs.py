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


def test_fs_create_rename_delete() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        client = TestClient(app)
        client.post("/fs/workspace", json={"root": str(root)})

        # cria pasta e arquivo
        assert client.post("/fs/create", json={"path": "pkg", "type": "dir"}).status_code == 200
        assert (root / "pkg").is_dir()
        assert (
            client.post("/fs/create", json={"path": "pkg/mod.py", "type": "file"}).status_code
            == 200
        )
        assert (root / "pkg" / "mod.py").is_file()

        # criar de novo -> 400 (já existe)
        assert client.post("/fs/create", json={"path": "pkg", "type": "dir"}).status_code == 400

        # renomeia/move
        assert (
            client.post("/fs/rename", json={"path": "pkg/mod.py", "to": "pkg/main.py"}).status_code
            == 200
        )
        assert not (root / "pkg" / "mod.py").exists()
        assert (root / "pkg" / "main.py").is_file()

        # apaga pasta recursivamente
        assert client.post("/fs/delete", json={"path": "pkg"}).status_code == 200
        assert not (root / "pkg").exists()

        # não pode apagar o root
        assert client.post("/fs/delete", json={"path": ""}).status_code == 400

        # confinamento em create
        assert (
            client.post("/fs/create", json={"path": "../x.txt", "type": "file"}).status_code == 400
        )


if __name__ == "__main__":
    test_fs_roundtrip()
    test_fs_create_rename_delete()
    print("FS_OK")
