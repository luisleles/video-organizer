import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AddFolderResult,
  CreateDestinationResult,
  DestinationFolder,
  LibraryStats,
  MediaFile,
  OrganizeResult,
  RescanResult,
  ScanProgress,
  SourceFolder,
  TreeFolder,
  UndoResult,
} from '../shared/types'

/**
 * O que o React enxerga como `window.api`.
 *
 * O renderer roda com contextIsolation e sem Node: ele não tem `require`, não
 * tem `fs`, e não tem `ipcRenderer`. Só existe para ele o que for listado aqui.
 * Isso é proposital — se uma dependência de frontend for comprometida, ela fica
 * limitada a estas funções em vez de ter acesso livre ao sistema de arquivos.
 *
 * Repare que nenhuma função aceita um caminho como argumento: quem escolhe a
 * pasta é o usuário, pelo diálogo nativo, do lado do main.
 */
const api = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  /** Pergunta e espera a resposta (Promise). */
  listFolders: (): Promise<SourceFolder[]> => ipcRenderer.invoke(IPC.listFolders),

  /** Abre o seletor nativo, cadastra e escaneia. Resolve quando o scan termina. */
  addFolder: (): Promise<AddFolderResult> => ipcRenderer.invoke(IPC.addFolder),

  /** Descadastra a pasta. Não apaga nada do disco. */
  removeFolder: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.removeFolder, id),

  /** Fila do feed: arquivos com organized = 0, na ordem de descoberta. */
  listUnorganizedMedia: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC.listUnorganizedMedia),

  /** Todos os arquivos favoritados, independente de organizado. */
  listFavorites: (): Promise<MediaFile[]> => ipcRenderer.invoke(IPC.listFavorites),

  /** Inverte o favorito do arquivo; devolve o novo estado. */
  toggleFavorite: (mediaId: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.toggleFavorite, mediaId),

  /** Pastas de destino, mais recentemente usadas primeiro. */
  listDestinations: (): Promise<DestinationFolder[]> => ipcRenderer.invoke(IPC.listDestinations),

  /** Só as raízes da árvore: pastas de destino que não estão dentro de outra. */
  listRootDestinations: (): Promise<DestinationFolder[]> =>
    ipcRenderer.invoke(IPC.listRootDestinations),

  /** Subpastas reais de um caminho, lidas ao vivo do disco (não do banco). */
  listSubfolders: (path: string): Promise<TreeFolder[]> =>
    ipcRenderer.invoke(IPC.listSubfolders, path),

  /** Raiz sugerida para novas pastas (a última escolhida, ou ~/Vídeos). */
  organizationRoot: (): Promise<string> => ipcRenderer.invoke(IPC.organizationRoot),

  /** Abre o seletor nativo para definir a raiz padrão de organização. */
  chooseOrganizationRoot: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.chooseOrganizationRoot),

  /** Contagens da biblioteca inteira (progresso e estatísticas). */
  libraryStats: (): Promise<LibraryStats> => ipcRenderer.invoke(IPC.libraryStats),

  /** Revarre as pastas de origem atrás de arquivos novos, sem duplicar. */
  rescanFolders: (): Promise<RescanResult> => ipcRenderer.invoke(IPC.rescanFolders),

  /** Abre o seletor nativo para escolher onde a nova pasta será criada. */
  chooseDestinationParent: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.chooseDestinationParent),

  /** Cria a pasta no disco e cadastra. `parentPath` vazio usa a raiz sugerida. */
  createDestination: (name: string, parentPath: string): Promise<CreateDestinationResult> =>
    ipcRenderer.invoke(IPC.createDestination, name, parentPath),

  /** Move o arquivo para a pasta escolhida (por caminho) e marca como organizado. */
  organizeMedia: (mediaId: number, destinationPath: string): Promise<OrganizeResult> =>
    ipcRenderer.invoke(IPC.organizeMedia, mediaId, destinationPath),

  /** Move o arquivo de volta para onde estava e desmarca. */
  undoOrganize: (mediaId: number): Promise<UndoResult> =>
    ipcRenderer.invoke(IPC.undoOrganize, mediaId),

  /**
   * Escuta o progresso do scan (main -> renderer). Devolve uma função de
   * cancelamento: sem removê-lo, cada re-render do React empilharia mais um
   * listener no mesmo canal e os avisos chegariam duplicados.
   */
  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
    // O primeiro parâmetro é o evento do Electron; o React não precisa dele, e
    // repassá-lo vazaria objetos internos para dentro da interface.
    const listener = (_event: IpcRendererEvent, progress: ScanProgress) => callback(progress)
    ipcRenderer.on(IPC.scanProgress, listener)
    return () => ipcRenderer.off(IPC.scanProgress, listener)
  },
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
