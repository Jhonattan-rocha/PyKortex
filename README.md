# PyKortex

IDE de análise de dados com motor Python. Shell desktop em Electron (React/TypeScript),
editor Monaco, e execução de código via **kernels Jupyter** (protocolo IPython) orquestrados
por um backend FastAPI.

## Arquitetura

```
Electron (main) ──spawn──► FastAPI (uvicorn)
   │                          │
   └─ Renderer (React/TSX)    ├─ Kernel Manager (jupyter_client) ─► IPython kernels (ZeroMQ)
        ├─ Monaco (LSP)       ├─ LSP supervisor (pyright/ruff)
        ├─ Notebook / Console ├─ Data services (df/profiling)
        └─ Data viewers       └─ File services
        WebSocket ◄──────────► /execute (streaming iopub)
```

## Layout do monorepo

- `apps/desktop` — aplicação Electron (main / preload / renderer React).
- `services/engine` — backend FastAPI + gerência de kernels Jupyter.
- `services/kernel-runtime` — pacote `pykortex` (API in-kernel: viewers ricos, comandos).
- `packages/protocol` — contratos de mensagem compartilhados (WS/REST).

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
.venv\Scripts\activate      # Windows
pip install -e .
pip install -e ../kernel-runtime   # pacote pykortex (viewers ricos no kernel)

# 3. rodar tudo (na raiz) — Electron sobe o backend automaticamente
npm run dev
```

## Status

🚧 **Fase 0** — spike ponta-a-ponta: Electron sobe o backend, executa uma célula
num kernel Jupyter e faz streaming do resultado para a UI.
