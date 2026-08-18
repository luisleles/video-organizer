import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  AddFolderResult,
  CreateDestinationResult,
  DestinationFolder,
  LibraryStats,
  OrganizedFolder,
  MediaFile,
  OrganizeResult,
  RescanResult,
  ScanProgress,
  SourceFolder,
  TreeFolder,
  UndoResult,
} from '../shared/types'
import * as db from './db'
import { FileMoveError, moveFile } from './file-mover'
import { scanFolder } from './scanner'

const ORGANIZATION_ROOT_KEY = 'organizationRoot'

/** Limite de ids por chamada de `mediaByIds` — ver o comentário no handler. */
const MAX_IDS_POR_LOTE = 200

/**
 * Registra tudo que o renderer pode pedir ao main. Esta é a superfície de ataque
 * do app: cada handler aqui é uma porta que o código da interface pode abrir.
 * Por isso os argumentos vindos do renderer são sempre validados antes do uso.
 */
export function registerIpcHandlers(): void {
  // --- renderer -> main, com resposta (invoke/handle) ---

  ipcMain.handle(IPC.listFolders, (): SourceFolder[] => db.listSourceFolders())

  ipcMain.handle(IPC.listUnorganizedMedia, (): MediaFile[] => db.listUnorganizedMedia())

  ipcMain.handle(IPC.listFavorites, (): MediaFile[] => db.listFavorites())

  ipcMain.handle(IPC.toggleFavorite, (_event, rawMediaId: unknown): boolean =>
    db.toggleFavorite(requireId(rawMediaId, 'id do arquivo')),
  )

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
    return db.deleteSourceFolder(requireId(id, 'id da pasta'))
  })

  // --- pastas de destino ---

  ipcMain.handle(IPC.organizedMediaIds, (_event, rawDir: unknown): number[] => {
    const dir = typeof rawDir === 'string' && rawDir ? rawDir : undefined
    return db.listOrganizedMediaIds(dir)
  })

  ipcMain.handle(IPC.organizedFolders, (): OrganizedFolder[] => db.listOrganizedFolders())

  /**
   * Varre as pastas de destino atrás de mídia que ainda não está no catálogo —
   * arquivos que já estavam lá antes do app, ou postos ali por fora dele.
   */
  ipcMain.handle(IPC.syncDestinationMedia, async (event): Promise<RescanResult> => {
    const pastas = db.listDestinationFolders()
    // Só as raízes: varrer também as subpastas cadastradas repetiria o mesmo
    // trabalho, já que a varredura é recursiva.
    const raizes = pastas.filter(
      (pasta) => !pastas.some((outra) => pasta.path.startsWith(outra.path + path.sep)),
    )

    let novos = 0
    for (const raiz of raizes) {
      const encontrados = await scanFolder(raiz.path, (filesFound, currentDir) => {
        if (!event.sender.isDestroyed()) {
          const progresso: ScanProgress = { folderPath: raiz.path, filesFound, currentDir }
          event.sender.send(IPC.scanProgress, progresso)
        }
      })

      // Cada arquivo é atribuído à pasta cadastrada mais profunda que o contém,
      // para as contagens por pasta baterem com a árvore de destinos.
      for (const arquivo of encontrados) {
        const dono = pastas
          .filter((pasta) => arquivo.path.startsWith(pasta.path + path.sep))
          .sort((a, b) => b.path.length - a.path.length)[0]
        novos += db.insertDestinationMedia([arquivo], dono?.id ?? raiz.id)
      }
    }

    return { foldersScanned: raizes.length, newFiles: novos }
  })

  ipcMain.handle(IPC.mediaByIds, (_event, rawIds: unknown): MediaFile[] => {
    if (!Array.isArray(rawIds)) throw new Error('lista de ids inválida')
    // Teto no tamanho do lote: cada id vira um placeholder no SQL, e o SQLite
    // tem limite de variáveis por consulta. O feed pede de 24 em 24.
    if (rawIds.length > MAX_IDS_POR_LOTE) {
      throw new Error(`lote grande demais: ${rawIds.length} (máximo ${MAX_IDS_POR_LOTE})`)
    }
    const ids = rawIds.map((id) => requireId(id, 'id do arquivo'))
    return db.getMediaByIds(ids)
  })

  ipcMain.handle(
    IPC.listDestinations,
    async (): Promise<DestinationFolder[]> => filterAvailable(db.listDestinationFolders()),
  )

  ipcMain.handle(IPC.listRootDestinations, async (): Promise<DestinationFolder[]> => {
    const available = await filterAvailable(db.listDestinationFolders())
    return db.rootsOf(available)
  })

  ipcMain.handle(IPC.listSubfolders, async (_event, rawPath: unknown): Promise<TreeFolder[]> => {
    if (typeof rawPath !== 'string' || !path.isAbsolute(rawPath)) return []

    let entries
    try {
      entries = await fs.readdir(rawPath, { withFileTypes: true })
    } catch {
      // A pasta pode ter sido apagada ou renomeada por fora do app entre uma
      // leitura e outra — a árvore só reflete o que existe agora.
      return []
    }

    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry): TreeFolder => {
        const fullPath = path.join(rawPath, entry.name)
        const known = db.findDestinationByPath(fullPath)
        return {
          path: fullPath,
          name: entry.name,
          destinationId: known?.id ?? null,
          lastUsedAt: known?.lastUsedAt ?? null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  })

  ipcMain.handle(IPC.organizationRoot, (): string => organizationRoot())

  ipcMain.handle(IPC.libraryStats, (): LibraryStats => db.getLibraryStats())

  ipcMain.handle(IPC.chooseOrganizationRoot, async (event): Promise<string | null> => {
    const chosen = await pickDirectory(event, {
      title: 'Pasta raiz de organização',
      buttonLabel: 'Usar esta pasta',
    })
    if (chosen) db.setSetting(ORGANIZATION_ROOT_KEY, chosen)
    return chosen
  })

  ipcMain.handle(IPC.rescanFolders, async (event): Promise<RescanResult> => {
    const folders = db.listSourceFolders()
    let newFiles = 0

    for (const folder of folders) {
      const files = await scanFolder(folder.path, (filesFound, currentDir) => {
        if (!event.sender.isDestroyed()) {
          const progress: ScanProgress = { folderPath: folder.path, filesFound, currentDir }
          event.sender.send(IPC.scanProgress, progress)
        }
      })
      // INSERT OR IGNORE + UNIQUE em path: o que já está catalogado é descartado
      // em silêncio, então revarrer não duplica nada. Arquivos já organizados
      // também não voltam, porque o caminho deles no banco agora é o do destino.
      newFiles += db.insertMediaFiles(folder.id, files)
    }

    return { foldersScanned: folders.length, newFiles }
  })

  ipcMain.handle(IPC.chooseDestinationParent, async (event): Promise<string | null> => {
    const chosen = await pickDirectory(event, {
      title: 'Onde criar a nova pasta',
      buttonLabel: 'Criar aqui',
    })
    // A escolha vira a sugestão padrão da próxima vez.
    if (chosen) db.setSetting(ORGANIZATION_ROOT_KEY, chosen)
    return chosen
  })

  ipcMain.handle(
    IPC.createDestination,
    async (_event, rawName: unknown, rawParent: unknown): Promise<CreateDestinationResult> => {
      const name = typeof rawName === 'string' ? rawName.trim() : ''
      const parent = typeof rawParent === 'string' && rawParent ? rawParent : organizationRoot()

      const nameError = validateFolderName(name)
      if (nameError) return { status: 'invalid-name', message: nameError }

      if (!path.isAbsolute(parent)) {
        return { status: 'error', message: 'Caminho de destino inválido' }
      }

      const fullPath = path.join(parent, name)

      const known = db.findDestinationByPath(fullPath)
      if (known) return { status: 'already-known', folder: known }

      try {
        // recursive: true não reclama se a pasta já existir no disco — o usuário
        // pode estar cadastrando uma pasta que ele mesmo criou por fora.
        await fs.mkdir(fullPath, { recursive: true })
        return { status: 'created', folder: db.insertDestinationFolder(fullPath, name) }
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
          return { status: 'permission-denied' }
        }
        return { status: 'error', message: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  // --- organizar / desfazer ---

  ipcMain.handle(
    IPC.organizeMedia,
    async (_event, rawMediaId: unknown, rawDestinationPath: unknown): Promise<OrganizeResult> => {
      const mediaId = requireId(rawMediaId, 'id do arquivo')
      if (typeof rawDestinationPath !== 'string' || !path.isAbsolute(rawDestinationPath)) {
        return { status: 'error', message: 'Pasta de destino inválida' }
      }

      const media = db.getMediaFile(mediaId)
      if (!media) return { status: 'error', message: 'Arquivo não está mais no catálogo' }

      // A pasta clicada na árvore pode ser uma pasta de destino já cadastrada
      // ou uma subpasta real que o usuário nunca "criou" pelo app — cadastra
      // na hora para as duas situações virarem o mesmo caminho a partir daqui.
      const destination =
        db.findDestinationByPath(rawDestinationPath) ??
        db.insertDestinationFolder(rawDestinationPath, path.basename(rawDestinationPath))

      try {
        const newPath = await moveFile(media.path, destination.path)
        const newFilename = path.basename(newPath)

        // Só grava no banco depois que o disco confirmou: se a ordem fosse
        // inversa, uma falha de escrita deixaria o catálogo apontando para um
        // arquivo que nunca saiu do lugar.
        db.markOrganized(mediaId, newPath, destination.id, media.path)
        db.touchDestinationFolder(destination.id)

        return {
          status: 'moved',
          newPath,
          newFilename,
          wasRenamed: newFilename !== media.filename,
        }
      } catch (error) {
        return organizeErrorFor(error)
      }
    },
  )

  ipcMain.handle(IPC.undoOrganize, async (_event, rawMediaId: unknown): Promise<UndoResult> => {
    const mediaId = requireId(rawMediaId, 'id do arquivo')

    const media = db.getOrganizedMedia(mediaId)
    if (!media?.originalPath) return { status: 'nothing-to-undo' }

    try {
      // Volta para a pasta de origem. Se algo já ocupou o nome antigo nesse meio
      // tempo, moveFile resolve com um sufixo em vez de sobrescrever.
      const restoredPath = await moveFile(media.path, path.dirname(media.originalPath))
      db.markUnorganized(mediaId, restoredPath)
      return { status: 'restored', restoredPath }
    } catch (error) {
      const result = organizeErrorFor(error)
      return result.status === 'disk-full'
        ? { status: 'error', message: 'Não há espaço livre no disco de origem' }
        : (result as UndoResult)
    }
  })

  // --- gerenciador de arquivos do sistema ---

  ipcMain.handle(IPC.showItemInFolder, (_event, rawPath: unknown): void => {
    // Só abre o gerenciador de arquivos num item que o próprio catálogo
    // conhece — o mesmo allowlist que o protocolo media:// usa, para não virar
    // uma forma de o renderer apontar o Explorer/Nautilus para caminho arbitrário.
    if (typeof rawPath !== 'string' || !path.isAbsolute(rawPath)) return
    if (!db.isCatalogued(rawPath)) return
    shell.showItemInFolder(rawPath)
  })

  ipcMain.handle(IPC.openPath, async (_event, rawPath: unknown): Promise<void> => {
    // Aqui não dá pra exigir "catalogado": o alvo é uma pasta de destino (ou
    // uma subpasta real ainda não cadastrada), não um arquivo de mídia. Só
    // valida a forma do caminho antes de repassar ao SO.
    if (typeof rawPath !== 'string' || !path.isAbsolute(rawPath)) return
    await shell.openPath(rawPath)
  })
}

/** Raiz sugerida para novas pastas: o que o usuário escolheu por último, ou ~/Vídeos. */
function organizationRoot(): string {
  return db.getSetting(ORGANIZATION_ROOT_KEY) ?? app.getPath('videos')
}

/** Seletor de pasta preso à janela que pediu, começando na raiz de organização. */
async function pickDirectory(
  event: Electron.IpcMainInvokeEvent,
  options: { title: string; buttonLabel: string },
): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions: Electron.OpenDialogOptions = {
    ...options,
    defaultPath: organizationRoot(),
    properties: ['openDirectory', 'createDirectory'],
  }

  const selection = await (window
    ? dialog.showOpenDialog(window, dialogOptions)
    : dialog.showOpenDialog(dialogOptions))

  return selection.canceled ? null : (selection.filePaths[0] ?? null)
}

/**
 * As pastas de destino ficam em HDs externos, que podem estar desconectados a
 * qualquer momento — diferente das pastas de origem, o cadastro no banco não
 * garante que a pasta exista agora. Em vez de guardar um estado "conectado" que
 * precisaria ser atualizado por algum evento do SO, cada listagem checa o disco
 * na hora: sem HD montado, `fs.stat` falha com ENOENT e a pasta simplesmente não
 * entra na resposta. Reconectar o HD já basta — a próxima leitura volta a achar.
 */
async function isPathAvailable(folderPath: string): Promise<boolean> {
  try {
    return (await fs.stat(folderPath)).isDirectory()
  } catch {
    return false
  }
}

async function filterAvailable(folders: DestinationFolder[]): Promise<DestinationFolder[]> {
  const available = await Promise.all(folders.map((folder) => isPathAvailable(folder.path)))
  return folders.filter((_folder, index) => available[index])
}

function requireId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} inválido: ${String(value)}`)
  }
  return value
}

/**
 * O nome vem digitado pelo usuário e vira caminho no disco. Sem esta validação,
 * digitar `../../..` criaria pasta fora da raiz escolhida.
 */
function validateFolderName(name: string): string | null {
  if (!name) return 'Escolha um nome para a pasta'
  if (name === '.' || name === '..') return 'Esse nome não pode ser usado'
  if (name.includes('/') || name.includes('\0')) return 'O nome não pode conter barras'
  if (name.startsWith('.')) return 'Nomes começando com ponto ficam ocultos no Linux'
  if (name.length > 255) return 'O nome é longo demais'
  return null
}

function organizeErrorFor(error: unknown): OrganizeResult {
  if (error instanceof FileMoveError) {
    switch (error.reason) {
      case 'source-missing':
        return { status: 'source-missing' }
      case 'permission-denied':
        return { status: 'permission-denied' }
      case 'disk-full':
        return { status: 'disk-full' }
    }
  }
  return { status: 'error', message: error instanceof Error ? error.message : String(error) }
}

const DIALOG_OPTIONS: Electron.OpenDialogOptions = {
  title: 'Escolha a pasta de origem',
  buttonLabel: 'Usar esta pasta',
  properties: ['openDirectory', 'createDirectory'],
}
