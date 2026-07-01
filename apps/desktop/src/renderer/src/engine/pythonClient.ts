/** Cliente REST de interpretadores Python (/python). */

import { baseUrl } from './fsClient'

export interface PythonInterpreter {
  path: string
  source: string
  version: string
  ipykernel: boolean
}
export interface PythonConfig {
  interpreter: string | null
  env: Record<string, string>
}

export async function listPythons(): Promise<PythonInterpreter[]> {
  const base = await baseUrl()
  const res = await fetch(`${base}/python/list`)
  if (!res.ok) throw new Error('falha ao listar interpretadores')
  return ((await res.json()) as { pythons: PythonInterpreter[] }).pythons
}

export async function getPythonConfig(): Promise<PythonConfig> {
  const base = await baseUrl()
  const res = await fetch(`${base}/python/config`)
  if (!res.ok) throw new Error('falha ao ler a configuração')
  return (await res.json()) as PythonConfig
}
