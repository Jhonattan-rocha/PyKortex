/** Tarefas do projeto — comandos nomeados lidos de .pykortex/tasks.json. */

import { readFile } from './fsClient'

export interface PkTask {
  name: string
  command: string
}

const TASKS_PATH = '.pykortex/tasks.json'

/**
 * Lê as tarefas do workspace atual. Formato:
 *   { "tasks": [ { "name": "Testes", "command": "pytest -q" } ] }
 * Retorna [] se o arquivo não existir ou for inválido.
 */
export async function loadTasks(): Promise<PkTask[]> {
  try {
    const txt = await readFile(TASKS_PATH)
    const data = JSON.parse(txt) as { tasks?: unknown }
    if (!Array.isArray(data.tasks)) return []
    return data.tasks.filter(
      (t): t is PkTask =>
        !!t &&
        typeof (t as PkTask).name === 'string' &&
        typeof (t as PkTask).command === 'string'
    )
  } catch {
    return []
  }
}
