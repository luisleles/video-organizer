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

export interface DestinationFolder {
  id: number
  path: string
  name: string
  createdAt: string
  /** null enquanto nunca tiver recebido um arquivo */
  lastUsedAt: string | null
}

/**
 * Falhas de mover arquivo são casos previstos, não exceções: o disco pode estar
 * cheio, a pasta pode ser somente-leitura, o arquivo pode ter sido apagado por
 * fora do app. Cada um tem uma mensagem própria na interface.
 */
export type OrganizeResult =
  | { status: 'moved'; newPath: string; newFilename: string; wasRenamed: boolean }
  | { status: 'source-missing' }
  | { status: 'permission-denied' }
  | { status: 'disk-full' }
  | { status: 'error'; message: string }

export type UndoResult =
  | { status: 'restored'; restoredPath: string }
  | { status: 'nothing-to-undo' }
  | { status: 'source-missing' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string }

export type CreateDestinationResult =
  | { status: 'created'; folder: DestinationFolder }
  | { status: 'already-known'; folder: DestinationFolder }
  | { status: 'invalid-name'; message: string }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string }

/** Números da biblioteca inteira, para a barra de progresso e o estado vazio. */
export interface LibraryStats {
  total: number
  organized: number
  organizedVideos: number
  organizedImages: number
  /** Quantas pastas de destino já receberam pelo menos um arquivo */
  foldersUsed: number
}

export interface RescanResult {
  foldersScanned: number
  /** Só o que ainda não estava no catálogo */
  newFiles: number
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
