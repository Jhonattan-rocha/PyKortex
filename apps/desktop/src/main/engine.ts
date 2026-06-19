/**
 * Ciclo de vida do backend Python (engine).
 *
 * Em dev, usa o interpretador da venv em services/engine/.venv.
 * Em produção (fases futuras) isso apontará para um Python embarcado.
 *
 * Responsabilidades:
 *  - escolher uma porta livre
 *  - spawnar `python -m pykortex_engine`
 *  - esperar o /health responder antes de liberar a UI
 *  - encerrar a árvore de processos no shutdown (evita kernels órfãos no Windows)
 */
import { spawn, type ChildProcess, execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface EngineHandle {
  port: number
  host: string
  process: ChildProcess
}

const HOST = '127.0.0.1'

/** Encontra uma porta TCP livre pedindo ao SO uma porta efêmera. */
function findFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rej)
    srv.listen(0, HOST, () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const { port } = addr
        srv.close(() => res(port))
      } else {
        srv.close(() => rej(new Error('não foi possível obter porta livre')))
      }
    })
  })
}

/** Resolve diretório do engine e o python da venv (com overrides por env). */
function resolveEnginePaths(repoRoot: string): { engineDir: string; python: string } {
  const engineDir = process.env.PYKORTEX_ENGINE_DIR ?? resolve(repoRoot, 'services', 'engine')
  const venvPython =
    process.platform === 'win32'
      ? resolve(engineDir, '.venv', 'Scripts', 'python.exe')
      : resolve(engineDir, '.venv', 'bin', 'python')
  const python = process.env.PYKORTEX_ENGINE_PYTHON ?? venvPython
  return { engineDir, python }
}

async function waitForHealth(port: number, timeoutMs = 20000): Promise<void> {
  const url = `http://${HOST}:${port}/health`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`engine não respondeu em /health após ${timeoutMs}ms`)
}

/**
 * Sobe o engine e resolve quando estiver saudável.
 * @param repoRoot raiz do monorepo (para localizar a venv em dev)
 */
export async function startEngine(repoRoot: string): Promise<EngineHandle> {
  const { engineDir, python } = resolveEnginePaths(repoRoot)

  if (!existsSync(python)) {
    throw new Error(
      `Python da venv não encontrado em "${python}". Rode o setup em services/engine ` +
        `(python -m venv .venv && pip install -e .) ou defina PYKORTEX_ENGINE_PYTHON.`
    )
  }

  const port = await findFreePort()

  const child = spawn(python, ['-m', 'pykortex_engine'], {
    cwd: engineDir,
    env: { ...process.env, PYKORTEX_HOST: HOST, PYKORTEX_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout?.on('data', (d) => process.stdout.write(`[engine] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`[engine] ${d}`))

  const exited = new Promise<never>((_, rej) => {
    child.once('exit', (code) =>
      rej(new Error(`engine encerrou prematuramente (code ${code})`))
    )
  })

  // corre health-check contra a possibilidade do processo morrer cedo
  await Promise.race([waitForHealth(port), exited])

  return { port, host: HOST, process: child }
}

/** Encerra a árvore de processos do engine (kernels inclusos). */
export function stopEngine(handle: EngineHandle | null): void {
  if (!handle) return
  const pid = handle.process.pid
  if (pid === undefined) return

  if (process.platform === 'win32') {
    // taskkill /T mata a árvore inteira; necessário pois os kernels são filhos.
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      handle.process.kill('SIGTERM')
    }
  }
}
