import { contextBridge, ipcRenderer } from 'electron'

/** API segura exposta ao renderer (contextIsolation). */
const api = {
  /** Retorna host/porta do engine, ou um erro se não subiu. */
  getEngineInfo: (): Promise<
    { ok: true; host: string; port: number } | { ok: false; error: string }
  > => ipcRenderer.invoke('engine:info')
}

contextBridge.exposeInMainWorld('pykortex', api)

export type PyKortexApi = typeof api
