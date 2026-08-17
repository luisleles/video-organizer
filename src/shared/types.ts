// Tipos que atravessam a fronteira do IPC. Ficam em src/shared para que o main
// e o React usem exatamente a mesma definição — se um lado mudar o formato, o
// outro para de compilar, em vez de quebrar só em runtime.

export type MediaType = 'video' | 'image'

export interface SourceFolder {
  id: number
  path: string
  /** ISO 8601, gerado na inserção */
  addedAt: string
  videoCount: number
  imageCount: number
  totalCount: number
}

export interface MediaFile {
  id: number
  /** caminho absoluto no disco */
  path: string
  filename: string
  type: MediaType
  /** ISO 8601 */
  discoveredAt: string
}

export interface ScanProgress {
  folderPath: string
  filesFound: number
  /** subpasta sendo lida no momento, para dar sinal de vida na UI */
  currentDir: string
}

/**
 * Resultado de "adicionar pasta". É um union em vez de exceção porque cancelar o
 * seletor e escolher uma pasta repetida são fluxos normais, não erros — e o
 * renderer precisa distinguir cada caso para mostrar a mensagem certa.
 */
export type AddFolderResult =
  | { status: 'added'; folder: SourceFolder }
  | { status: 'cancelled' }
  | { status: 'duplicate'; existingPath: string }
  | { status: 'nested'; existingPath: string }
  | { status: 'error'; message: string }
