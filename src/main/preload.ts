import { contextBridge } from 'electron'

// Superfície de API que o renderer enxerga como `window.api`.
// Só o que for exposto aqui existe do lado do React — é a fronteira de segurança.
// Quando formos ler pastas de vídeo, os métodos entram aqui e chamam o main via ipcRenderer.invoke.
const api = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
