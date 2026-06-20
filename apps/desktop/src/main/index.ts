import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { startEngine, stopEngine, type EngineHandle } from './engine'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const windowStateFile = (): string => join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    return JSON.parse(readFileSync(windowStateFile(), 'utf-8')) as WindowState
  } catch {
    return { width: 1200, height: 800 }
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds()
    const state: WindowState = { ...bounds, isMaximized: win.isMaximized() }
    writeFileSync(windowStateFile(), JSON.stringify(state))
  } catch {
    /* best-effort */
  }
}

let mainWindow: BrowserWindow | null = null
let engine: EngineHandle | null = null
let engineError: string | null = null

/** Raiz do monorepo. Em dev, app.getAppPath() = apps/desktop. */
function repoRoot(): string {
  return resolve(app.getAppPath(), '..', '..')
}

function createWindow(): void {
  const ws = loadWindowState()
  mainWindow = new BrowserWindow({
    width: ws.width,
    height: ws.height,
    x: ws.x,
    y: ws.y,
    show: false,
    title: 'PyKortex',
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (ws.isMaximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', () => mainWindow && saveWindowState(mainWindow))

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

// Diálogo de abrir arquivo; retorna o caminho absoluto ou null.
ipcMain.handle('fs:openFileDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
    title: 'Abrir arquivo',
    properties: ['openFile'],
    filters: [
      { name: 'Python', extensions: ['py'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Diálogo "Salvar como"; retorna o caminho absoluto escolhido ou null.
ipcMain.handle('fs:saveDialog', async (_e, defaultDir?: string, suggestedName?: string) => {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
    title: 'Salvar como',
    defaultPath: join(defaultDir ?? app.getPath('documents'), suggestedName ?? 'untitled.py'),
    filters: [
      { name: 'Python', extensions: ['py'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  })
  return result.canceled ? null : (result.filePath ?? null)
})

/** Envia uma ação do menu nativo para o renderer. */
function sendMenu(action: string, payload?: unknown): void {
  mainWindow?.webContents.send('menu', { action, payload })
}

/** Monta o menu da aplicação (File com as ações do editor + roles padrão). */
function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Novo arquivo', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('newFile') },
        {
          label: 'Nova pasta',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenu('newFolder')
        },
        { type: 'separator' },
        { label: 'Abrir pasta…', accelerator: 'CmdOrCtrl+K', click: () => sendMenu('openFolder') },
        { label: 'Abrir arquivo…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('openFile') },
        { type: 'separator' },
        { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        {
          label: 'Salvar como…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenu('saveAs')
        },
        {
          label: 'Auto save',
          type: 'checkbox',
          checked: false,
          click: (item) => sendMenu('toggleAutoSave', item.checked)
        },
        { type: 'separator' },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: () => sendMenu('closeTab') },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  try {
    engine = await startEngine(repoRoot())
    console.log(`[main] engine pronto em http://${engine.host}:${engine.port}`)
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err)
    console.error('[main] falha ao iniciar engine:', engineError)
  }

  createWindow()
  buildMenu()

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
