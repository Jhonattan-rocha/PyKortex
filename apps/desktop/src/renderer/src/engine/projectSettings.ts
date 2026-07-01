/** Configurações por projeto — gravadas em .pykortex/settings.json (versionável). */

import { readFile, writeFile } from './fsClient'

export interface ProjectSettings {
  name?: string
  theme?: string // override do tema da IDE para este projeto
}

const PATH = '.pykortex/settings.json'

export async function loadProjectSettings(): Promise<ProjectSettings> {
  try {
    const data = JSON.parse(await readFile(PATH)) as ProjectSettings
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export async function saveProjectSettings(s: ProjectSettings): Promise<void> {
  await writeFile(PATH, JSON.stringify(s, null, 2))
}
