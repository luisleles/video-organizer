import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { closeDatabase, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'

// Em dev (`npm run dev`) o app não está empacotado: carregamos a URL do Vite.
// Empacotado, carregamos o HTML gerado por `npm run build`.
const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    // Evita o "flash branco": só mostra quando o conteúdo estiver pronto.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Isolamento ligado: o renderer não enxerga Node diretamente.
      // Tudo que precisar do SO passa pelo preload via IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos abrem no navegador do sistema, não dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

void app.whenReady().then(() => {
  // Ordem importa: o banco precisa existir antes dos handlers, e os handlers
  // antes da janela — o React chama listFolders() no primeiro render.
  console.log('[db]', initDatabase())
  registerIpcHandlers()
  createWindow()

  // Convenção do macOS; inofensivo no Linux.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Fecha o banco limpo: garante o checkpoint do WAL em vez de deixar o -wal
// pendurado para a próxima abertura recuperar.
app.on('before-quit', closeDatabase)
