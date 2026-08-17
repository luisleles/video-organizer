import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { AddFolderResult, ScanProgress, SourceFolder } from '../shared/types'

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
