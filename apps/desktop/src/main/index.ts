import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { startEngine, stopEngine, type EngineHandle } from './engine'

let mainWindow: BrowserWindow | null = null
let engine: EngineHandle | null = null
let engineError: string | null = null

/** Raiz do monorepo. Em dev, app.getAppPath() = apps/desktop. */
function repoRoot(): string {
  return resolve(app.getAppPath(), '..', '..')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'PyKortex',
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // electron-vite injeta a URL do dev server; em prod carrega o build.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html'))
  }
}

// O renderer pergunta onde o engine está (porta dinâmica).
ipcMain.handle('engine:info', () => {
  if (engine) {
    return { ok: true, host: engine.host, port: engine.port }
  }
  return { ok: false, error: engineError ?? 'engine ainda não iniciado' }
})

// Abre o diálogo nativo de seleção de pasta; retorna o caminho ou null.
ipcMain.handle('fs:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
    title: 'Abrir pasta como workspace',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

app.whenReady().then(async () => {
  try {
    engine = await startEngine(repoRoot())
    console.log(`[main] engine pronto em http://${engine.host}:${engine.port}`)
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err)
    console.error('[main] falha ao iniciar engine:', engineError)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Garante que o backend morra junto com o app.
app.on('before-quit', () => {
  stopEngine(engine)
  engine = null
})
