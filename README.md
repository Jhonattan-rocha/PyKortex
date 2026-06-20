# PyKortex

**A IDE Python onde todo arquivo `.py` está vivo.** Shell desktop em Electron
(React/TypeScript) com editor Monaco e células por comentário (`# %%`) executadas
contra um **kernel Jupyter** persistente, orquestrado por um backend FastAPI.

O diferencial não é "mais uma IDE de dados": como a IDE roda o **mesmo kernel** do
seu código, ela introspecta **objetos vivos** (não análise estática) e entrega
viewers ricos e integrações profundas que IDEs estáticas não fazem — pandas,
FastAPI e SQLAlchemy hoje, extensível em Python.

## Recursos

- **Editor vivo** — Monaco com células `# %%`: `Ctrl+Enter` roda a célula,
  `Shift+Enter` roda e avança, `Ctrl+Shift+Enter` roda tudo.
- **Workspace** — árvore de arquivos com CRUD (criar/renomear/apagar), abas
  multi-arquivo, salvar / salvar como / auto save, menu nativo. Estado da IDE
  (abas, workspace, janela) persiste entre sessões.
- **Console REPL** — histórico estilo `In [n]`, restart de kernel, e **🧹 limpar
  variáveis** (libera memória sem reiniciar o kernel).
- **Variable explorer** — variáveis vivas do kernel (tipo, shape, preview),
  clique para exibir.
- **DataFrame viewer** — grade virtualizada (milhões de linhas), paginação sob
  demanda, **sort** e **filtro** por coluna aplicados no kernel.
- **Plots inline** — figuras matplotlib renderizadas no console.
- **Explorador FastAPI** — rotas + schemas do app vivo, **cliente de
  request/response embutido** (dispara requests no kernel via TestClient, sem
  servidor), headers/auth, histórico replayável e **coleções salvas**.
- **Schema SQLAlchemy** — tabelas/colunas/PK/FK e relações do `MetaData` vivo.
- **Extensível em Python** — os viewers nativos usam a mesma API pública
  (`@pk.viewer(Tipo)`); estender a IDE é escrever Python.

## Arquitetura

```
Electron (main) ──spawn──► FastAPI engine (uvicorn, 127.0.0.1)
   │                          │
   └─ Renderer (React/TSX)    ├─ Kernel Manager (jupyter_client) ─► IPython kernel (ZeroMQ)
        ├─ Monaco editor      │     └─ runtime `pykortex` (viewers ricos, introspecção)
        ├─ Console / viewers   ├─ File services (workspace confinado)
        └─ WebSocket ◄────────►┘  /ws/execute (streaming + req/resp)
```

Viewers ricos viajam como **MIME types customizados** (`application/vnd.pykortex.*`)
pelo canal iopub do Jupyter; consultas fora do fluxo (variáveis, paginação,
requests) usam `user_expressions` (execução silenciosa, sem poluir o console).

## Layout do monorepo

- `apps/desktop` — aplicação Electron (main / preload / renderer React).
- `services/engine` — backend FastAPI + gerência de kernels Jupyter.
- `services/kernel-runtime` — pacote `pykortex` (API in-kernel: viewers, introspecção).

## Pré-requisitos

- Node.js >= 20 (testado em 22)
- Python >= 3.11 (testado em 3.13)

## Setup

```bash
# 1. dependências do frontend (raiz do monorepo)
npm install

# 2. backend Python + runtime in-kernel
cd services/engine
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -e .                    # engine (FastAPI + jupyter_client)
pip install -e ../kernel-runtime    # pacote pykortex (+ pandas, matplotlib)

# 3. rodar tudo (na raiz) — Electron sobe o backend automaticamente
npm run dev
```

> Integrações opcionais ligam sozinhas se a lib estiver no ambiente do kernel:
> **FastAPI** já vem com o engine; para o viewer de **SQLAlchemy**, instale
> `sqlalchemy` na venv.

## Licença

[GPL-3.0-or-later](LICENSE) © contribuidores do PyKortex.
