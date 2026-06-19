/**
 * Smoke headless da integração que o main process do Electron faz:
 *   porta livre -> spawn do engine (venv) -> espera /health -> WS execute -> kill da árvore.
 * Não abre GUI. Espelha src/main/engine.ts. Rode: node scripts/smoke-engine.mjs
 */
import { spawn, execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// WebSocket é global no Node >= 22.

const HOST = '127.0.0.1'
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..', '..')
const engineDir = resolve(repoRoot, 'services', 'engine')
const python = resolve(engineDir, '.venv', 'Scripts', 'python.exe')

function findFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.on('error', rej)
    srv.listen(0, HOST, () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
  })
}

async function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://${HOST}:${port}/health`)
      if (r.ok) return await r.json()
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('health timeout')
}

function killTree(pid) {
  return new Promise((res) => execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => res()))
}

async function runExecute(port) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://${HOST}:${port}/ws/execute`)
    const got = []
    const timer = setTimeout(() => rej(new Error('ws timeout')), 30000)
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: 'execute_request', code: "print('via main'); 21*2" }))
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      got.push(msg)
      if (msg.type === 'execute_reply') {
        clearTimeout(timer)
        ws.close()
        res(got)
      }
    }
    ws.onerror = () => rej(new Error('ws error'))
  })
}

async function main() {
  if (!existsSync(python)) throw new Error(`venv python ausente: ${python}`)
  const port = await findFreePort()
  console.log('porta livre:', port)

  const child = spawn(python, ['-m', 'pykortex_engine'], {
    cwd: engineDir,
    env: { ...process.env, PYKORTEX_HOST: HOST, PYKORTEX_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit']
  })

  try {
    const health = await waitForHealth(port)
    console.log('health:', JSON.stringify(health))

    const msgs = await runExecute(port)
    const hasStream = msgs.some((m) => m.type === 'stream' && m.text.includes('via main'))
    const hasResult = msgs.some(
      (m) => m.type === 'execute_result' && String(m.data['text/plain']).includes('42')
    )
    const ok = msgs.some((m) => m.type === 'execute_reply' && m.status === 'ok')
    console.log('stream:', hasStream, '| result42:', hasResult, '| reply ok:', ok)

    if (!(hasStream && hasResult && ok)) {
      console.error('FALHOU — mensagens:', JSON.stringify(msgs, null, 2))
      process.exitCode = 1
    } else {
      console.log('\nSPIKE_OK — integração main↔engine↔kernel validada')
    }
  } finally {
    if (child.pid) await killTree(child.pid)
  }
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exitCode = 1
})
