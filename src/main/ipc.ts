import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { AddFolderResult, ScanProgress, SourceFolder } from '../shared/types'
import * as db from './db'
import { scanFolder } from './scanner'

/**
 * Registra tudo que o renderer pode pedir ao main. Esta é a superfície de ataque
 * do app: cada handler aqui é uma porta que o código da interface pode abrir.
 * Por isso os argumentos vindos do renderer são sempre validados antes do uso.
 */
export function registerIpcHandlers(): void {
  // --- renderer -> main, com resposta (invoke/handle) ---

  ipcMain.handle(IPC.listFolders, (): SourceFolder[] => db.listSourceFolders())

  ipcMain.handle(IPC.addFolder, async (event): Promise<AddFolderResult> => {
    // `event.sender` é o webContents de quem chamou; dá pra descobrir a janela e
    // pendurar o diálogo nela (modal), em vez de soltar uma janela flutuante.
    const window = BrowserWindow.fromWebContents(event.sender)

    // O seletor de arquivos vive no main de propósito: é a fronteira onde o
    // usuário — e não o código da interface — escolhe o que o app pode ler.
    const selection = await (window
      ? dialog.showOpenDialog(window, DIALOG_OPTIONS)
      : dialog.showOpenDialog(DIALOG_OPTIONS))

    const chosenPath = selection.filePaths[0]
    if (selection.canceled || !chosenPath) return { status: 'cancelled' }

    const conflict = db.findConflictingFolder(chosenPath)
    if (conflict) {
      return conflict.path === chosenPath
        ? { status: 'duplicate', existingPath: conflict.path }
        : { status: 'nested', existingPath: conflict.path }
    }

    const folderId = db.insertSourceFolder(chosenPath)

    try {
      const files = await scanFolder(chosenPath, (filesFound, currentDir) => {
        // --- main -> renderer, sem resposta (send/on) ---
        // Um scan pode levar minutos; sem isso a UI ficaria parada num spinner
        // mudo. `invoke` não serve aqui: ele responde uma vez, no fim.
        const progress: ScanProgress = { folderPath: chosenPath, filesFound, currentDir }
        // O usuário pode fechar a janela no meio do scan.
        if (!event.sender.isDestroyed()) event.sender.send(IPC.scanProgress, progress)
      })

      db.insertMediaFiles(folderId, files)

      const folder = db.getSourceFolder(folderId)
      if (!folder) throw new Error('Pasta não encontrada após o cadastro')
      return { status: 'added', folder }
    } catch (error) {
      // Sem isso a pasta ficaria cadastrada e vazia depois de um scan que falhou.
      db.deleteSourceFolder(folderId)
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.removeFolder, (_event, id: unknown): boolean => {
    // O renderer é código web: trate o que vem dele como entrada não confiável.
    // Sem esta checagem, um `id` inesperado viraria erro dentro do driver SQLite.
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error(`id inválido: ${String(id)}`)
    }
    return db.deleteSourceFolder(id)
  })
}

const DIALOG_OPTIONS: Electron.OpenDialogOptions = {
  title: 'Escolha a pasta de origem',
  buttonLabel: 'Usar esta pasta',
  properties: ['openDirectory', 'createDirectory'],
}
