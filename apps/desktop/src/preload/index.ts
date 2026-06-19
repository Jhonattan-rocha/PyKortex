import { contextBridge, ipcRenderer } from 'electron'

/** API segura exposta ao renderer (contextIsolation). */
const api = {
  /** Retorna host/porta do engine, ou um erro se não subiu. */
  getEngineInfo: (): Promise<
    { ok: true; host: string; port: number } | { ok: false; error: string }
  > => ipcRenderer.invoke('engine:info'),

  /** Abre o diálogo nativo de pasta; resolve com o caminho ou null. */
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('fs:openFolder'),

  /** Abre o diálogo de arquivo; resolve com o caminho absoluto ou null. */
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('fs:openFileDialog'),

  /** Diálogo "Salvar como"; resolve com o caminho absoluto ou null. */
  saveDialog: (defaultDir?: string, suggestedName?: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:saveDialog', defaultDir, suggestedName),

  /** Assina ações do menu nativo. Retorna função de cleanup. */
  onMenu: (cb: (msg: { action: string; payload?: unknown }) => void): (() => void) => {
    const listener = (_e: unknown, msg: { action: string; payload?: unknown }): void => cb(msg)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  }
}

contextBridge.exposeInMainWorld('pykortex', api)

export type PyKortexApi = typeof api
