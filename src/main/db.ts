import { app } from 'electron'
import Database from 'better-sqlite3'
import path from 'node:path'
import type {
  DestinationFolder,
  LibraryStats,
  MediaFile,
  MediaType,
  SourceFolder,
} from '../shared/types'
type MediaFileRow = Omit<MediaFile, 'favorited'> & { favorited: number }
import type { ScannedFile } from './scanner'

// O banco fica em userData (~/.config/video-organizer no Linux), não junto do
// código: o app empacotado instala numa pasta somente-leitura.
let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS source_folders (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  path     TEXT NOT NULL UNIQUE,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_files (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  path             TEXT NOT NULL UNIQUE,
  filename         TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('video', 'image')),
  -- Opcional: arquivos descobertos dentro das pastas de destino não vieram
  -- de nenhuma pasta de origem.
  folder_source_id INTEGER REFERENCES source_folders(id) ON DELETE CASCADE,
  -- SQLite não tem BOOLEAN: 0 = false, 1 = true.
  organized        INTEGER NOT NULL DEFAULT 0 CHECK (organized IN (0, 1)),
  discovered_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_folder    ON media_files (folder_source_id);
CREATE INDEX IF NOT EXISTS idx_media_organized ON media_files (organized);

CREATE TABLE IF NOT EXISTS destination_folders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  path         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

-- Chave/valor simples para preferências (por ora só a raiz de organização).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/**
 * Colunas acrescentadas depois que a tabela já existia no disco. `CREATE TABLE
 * IF NOT EXISTS` não altera tabela existente, então bancos criados antes desta
 * versão ficariam sem elas e o app quebraria ao organizar.
 */
const MIGRATIONS: Array<{ table: string; column: string; definition: string }> = [
  // Onde o arquivo estava antes de ser organizado — é o que torna o undo possível.
  { table: 'media_files', column: 'original_path', definition: 'TEXT' },
  { table: 'media_files', column: 'organized_at', definition: 'TEXT' },
  {
    table: 'media_files',
    column: 'destination_folder_id',
    definition: 'INTEGER REFERENCES destination_folders(id)',
  },
  // Favoritar é independente de organizar: um booleano simples no próprio
  // arquivo, sem tabela separada, porque não carrega metadado nenhum além
  // disso (nem data, nem ordem — só "é ou não é").
  { table: 'media_files', column: 'favorited', definition: 'INTEGER NOT NULL DEFAULT 0' },
]

function runMigrations(database: Database.Database): void {
  for (const { table, column, definition } of MIGRATIONS) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!columns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }
  allowMediaWithoutSourceFolder(database)
}

/**
 * Torna `folder_source_id` opcional.
 *
 * Até aqui todo arquivo do catálogo vinha de uma pasta de origem escaneada. Os
 * arquivos que já estavam dentro das pastas de destino antes de o app existir
 * não vieram de lugar nenhum — e a coluna NOT NULL impedia registrá-los, o que
 * por sua vez os deixava invisíveis, já que o protocolo media:// só serve o que
 * está catalogado.
 *
 * SQLite não sabe remover um NOT NULL com ALTER TABLE, então é preciso recriar
 * a tabela e copiar os dados. Roda dentro de uma transação e com as chaves
 * estrangeiras desligadas (senão o DROP da tabela antiga derrubaria as linhas
 * referenciadas em cascata no meio do caminho).
 */
function allowMediaWithoutSourceFolder(database: Database.Database): void {
  const colunas = database.prepare('PRAGMA table_info(media_files)').all() as {
    name: string
    notnull: number
  }[]
  const origem = colunas.find((coluna) => coluna.name === 'folder_source_id')
  if (!origem || origem.notnull === 0) return

  database.pragma('foreign_keys = OFF')
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE media_files_novo (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          path                  TEXT NOT NULL UNIQUE,
          filename              TEXT NOT NULL,
          type                  TEXT NOT NULL CHECK (type IN ('video', 'image')),
          folder_source_id      INTEGER REFERENCES source_folders(id) ON DELETE CASCADE,
          organized             INTEGER NOT NULL DEFAULT 0 CHECK (organized IN (0, 1)),
          discovered_at         TEXT NOT NULL,
          original_path         TEXT,
          organized_at          TEXT,
          destination_folder_id INTEGER REFERENCES destination_folders(id),
          favorited             INTEGER NOT NULL DEFAULT 0
        );

        INSERT INTO media_files_novo
          (id, path, filename, type, folder_source_id, organized, discovered_at,
           original_path, organized_at, destination_folder_id, favorited)
        SELECT id, path, filename, type, folder_source_id, organized, discovered_at,
               original_path, organized_at, destination_folder_id, favorited
          FROM media_files;

        DROP TABLE media_files;
        ALTER TABLE media_files_novo RENAME TO media_files;

        CREATE INDEX IF NOT EXISTS idx_media_folder      ON media_files (folder_source_id);
        CREATE INDEX IF NOT EXISTS idx_media_organized   ON media_files (organized);
        CREATE INDEX IF NOT EXISTS idx_media_destination ON media_files (destination_folder_id);
      `)
    })()
  } finally {
    database.pragma('foreign_keys = ON')
  }
}

export function initDatabase(): string {
  const file = path.join(app.getPath('userData'), 'library.db')
  db = new Database(file)
  // WAL: leitura e escrita não se bloqueiam — importa porque o scan insere
  // milhares de linhas enquanto a UI consulta as contagens.
  db.pragma('journal_mode = WAL')
  // Precisa ser ligado em toda conexão; sem isso o ON DELETE CASCADE é ignorado.
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  runMigrations(db)
  return file
}

function conn(): Database.Database {
  if (!db) throw new Error('Banco de dados não inicializado')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

export function listSourceFolders(): SourceFolder[] {
  return conn()
    .prepare(
      `SELECT f.id,
              f.path,
              f.added_at AS addedAt,
              COALESCE(SUM(m.type = 'video'), 0) AS videoCount,
              COALESCE(SUM(m.type = 'image'), 0) AS imageCount,
              COUNT(m.id)                        AS totalCount
         FROM source_folders f
         LEFT JOIN media_files m ON m.folder_source_id = f.id
        GROUP BY f.id
        ORDER BY f.id DESC`,
    )
    .all() as SourceFolder[]
}

export function getSourceFolder(id: number): SourceFolder | undefined {
  return listSourceFolders().find((folder) => folder.id === id)
}

/**
 * Procura uma pasta já cadastrada que conflite com `candidate` — a mesma pasta,
 * uma pasta acima ou uma pasta abaixo dela. Cadastrar pastas aninhadas faria o
 * mesmo arquivo aparecer em duas origens, e a coluna path é UNIQUE: a segunda
 * inserção seria silenciosamente descartada e a contagem sairia errada.
 */
export function findConflictingFolder(candidate: string): SourceFolder | undefined {
  const withSep = candidate.endsWith(path.sep) ? candidate : candidate + path.sep
  return listSourceFolders().find((folder) => {
    const existingWithSep = folder.path.endsWith(path.sep) ? folder.path : folder.path + path.sep
    return (
      folder.path === candidate ||
      candidate.startsWith(existingWithSep) ||
      folder.path.startsWith(withSep)
    )
  })
}

export function insertSourceFolder(folderPath: string): number {
  const result = conn()
    .prepare('INSERT INTO source_folders (path, added_at) VALUES (?, ?)')
    .run(folderPath, new Date().toISOString())
  return Number(result.lastInsertRowid)
}

export function deleteSourceFolder(id: number): boolean {
  // media_files some junto via ON DELETE CASCADE. Nada é apagado do disco.
  return conn().prepare('DELETE FROM source_folders WHERE id = ?').run(id).changes > 0
}

export function insertMediaFiles(folderId: number, files: ScannedFile[]): number {
  const insert = conn().prepare(
    `INSERT OR IGNORE INTO media_files (path, filename, type, folder_source_id, discovered_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  // Uma transação só: com autocommit, cada INSERT viraria um fsync e um scan de
  // 10 mil arquivos levaria minutos em vez de menos de um segundo.
  const insertAll = conn().transaction((batch: ScannedFile[], discoveredAt: string) => {
    let inserted = 0
    for (const file of batch) {
      inserted += insert.run(file.path, file.filename, file.type, folderId, discoveredAt).changes
    }
    return inserted
  })
  return insertAll(files, new Date().toISOString())
}

/**
 * SQLite não tem tipo boolean: a coluna `favorited` vem como 0/1. Converter
 * aqui, num só lugar, evita que `0`/`1` "funcionem por acaso" em comparações
 * estritas (`=== true`) mais adiante no código.
 */
function toMediaFile(row: MediaFileRow): MediaFile {
  return { ...row, favorited: Boolean(row.favorited) }
}

/** Fila do feed: o que ainda não foi organizado, na ordem em que foi descoberto. */
export function listUnorganizedMedia(): MediaFile[] {
  return (
    conn()
      .prepare(
        `SELECT id, path, filename, type, discovered_at AS discoveredAt, favorited
         FROM media_files
        WHERE organized = 0
        ORDER BY discovered_at, id`,
      )
      .all() as MediaFileRow[]
  ).map(toMediaFile)
}

/** Todos os arquivos favoritados, independente de estarem organizados ou não. */
export function listFavorites(): MediaFile[] {
  return (
    conn()
      .prepare(
        `SELECT id, path, filename, type, discovered_at AS discoveredAt, favorited
         FROM media_files
        WHERE favorited = 1
        ORDER BY discovered_at, id`,
      )
      .all() as MediaFileRow[]
  ).map(toMediaFile)
}

/** Inverte o favorito do arquivo e devolve o novo estado. */
export function toggleFavorite(id: number): boolean {
  const row = conn().prepare('SELECT favorited FROM media_files WHERE id = ?').get(id) as
    | { favorited: number }
    | undefined
  if (!row) throw new Error('Arquivo não está mais no catálogo')

  const next = row.favorited ? 0 : 1
  conn().prepare('UPDATE media_files SET favorited = ? WHERE id = ?').run(next, id)
  return next === 1
}

/**
 * Registra arquivos encontrados dentro das pastas de destino.
 *
 * Entram já como `organized = 1` e sem pasta de origem: eles nunca passaram
 * pela fila do app — já estavam lá quando as pastas foram cadastradas, ou
 * foram colocados por fora. Catalogar é o que os torna visíveis, porque o
 * protocolo media:// só serve caminho que está nesta tabela.
 *
 * INSERT OR IGNORE + UNIQUE(path): o que o app já moveu para lá continua com o
 * registro original, com o histórico de undo intacto.
 */
export function insertDestinationMedia(
  files: ScannedFile[],
  destinationFolderId: number | null,
): number {
  const insert = conn().prepare(
    `INSERT OR IGNORE INTO media_files
       (path, filename, type, folder_source_id, organized, discovered_at, destination_folder_id)
     VALUES (?, ?, ?, NULL, 1, ?, ?)`,
  )
  const inserirTodos = conn().transaction((lote: ScannedFile[], quando: string) => {
    let inseridos = 0
    for (const file of lote) {
      inseridos += insert.run(file.path, file.filename, file.type, quando, destinationFolderId)
        .changes
    }
    return inseridos
  })
  return inserirTodos(files, new Date().toISOString())
}

/**
 * A pasta de cada arquivo sai do próprio caminho: `path` menos `filename` menos
 * a barra. É exato, e evita uma coluna a mais que teria de ser mantida em
 * sincronia a cada movimentação.
 */
const DIRETORIO_SQL = "substr(path, 1, length(path) - length(filename) - 1)"

/** Pastas que de fato contêm mídia organizada, com quantos itens cada uma tem. */
export function listOrganizedFolders(): { dir: string; total: number }[] {
  return conn()
    .prepare(
      `SELECT ${DIRETORIO_SQL} AS dir, COUNT(*) AS total
         FROM media_files
        WHERE organized = 1
        GROUP BY dir
        ORDER BY dir`,
    )
    .all() as { dir: string; total: number }[]
}

/**
 * Ids de tudo que já foi organizado, embaralhado pelo próprio SQLite.
 *
 * Devolve só os ids, não as linhas inteiras: com uma biblioteca grande, este é
 * o único ponto que precisa varrer a tabela toda, e um array de inteiros é
 * barato de montar e de trafegar pelo IPC. Os detalhes vêm depois, por lote,
 * conforme o feed rola.
 *
 * ORDER BY RANDOM() sorteia sobre TODAS as linhas com organized = 1, sem
 * agrupar por pasta de destino — é isso que faz a revisão misturar itens de
 * pastas diferentes em vez de percorrer uma pasta de cada vez.
 */
export function listOrganizedMediaIds(dir?: string): number[] {
  // `dir` limita a uma pasta específica; sem ele, sorteia sobre todas.
  const filtro = dir ? `AND ${DIRETORIO_SQL} = ?` : ''
  const consulta = conn().prepare(
    `SELECT id FROM media_files WHERE organized = 1 ${filtro} ORDER BY RANDOM()`,
  )
  const linhas = (dir ? consulta.all(dir) : consulta.all()) as { id: number }[]
  return linhas.map((row) => row.id)
}

/**
 * Detalhes de um lote de ids, preservando a ordem em que foram pedidos.
 *
 * O SQL devolve as linhas em ordem arbitrária, então a ordem é restaurada aqui
 * — sem isso o embaralhamento seria desfeito a cada página carregada.
 */
export function getMediaByIds(ids: number[]): MediaFile[] {
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(', ')
  const rows = conn()
    .prepare(
      `SELECT id, path, filename, type, discovered_at AS discoveredAt, favorited
         FROM media_files
        WHERE id IN (${placeholders})`,
    )
    .all(...ids) as MediaFileRow[]

  const porId = new Map(rows.map((row) => [row.id, toMediaFile(row)]))
  return ids.map((id) => porId.get(id)).filter((item): item is MediaFile => item !== undefined)
}

/**
 * Usado pelo protocolo media:// como allowlist. Roda a cada requisição do
 * <video> (incluindo cada Range), então precisa ser barato: `path` é UNIQUE,
 * logo indexado, e a consulta é in-process — custa microssegundos.
 */
export function isCatalogued(filePath: string): boolean {
  return (
    conn().prepare('SELECT 1 FROM media_files WHERE path = ? LIMIT 1').get(filePath) !== undefined
  )
}

export function countMediaByType(folderId: number, type: MediaType): number {
  const row = conn()
    .prepare('SELECT COUNT(*) AS total FROM media_files WHERE folder_source_id = ? AND type = ?')
    .get(folderId, type) as { total: number }
  return row.total
}

const MEDIA_COLUMNS = `id, path, filename, type, discovered_at AS discoveredAt, favorited`

export function getMediaFile(id: number): MediaFile | undefined {
  const row = conn().prepare(`SELECT ${MEDIA_COLUMNS} FROM media_files WHERE id = ?`).get(id) as
    | MediaFileRow
    | undefined
  return row && toMediaFile(row)
}

/** Só para o undo: precisa saber de onde o arquivo veio. */
export function getOrganizedMedia(
  id: number,
): (MediaFile & { originalPath: string | null }) | undefined {
  const row = conn()
    .prepare(
      `SELECT ${MEDIA_COLUMNS}, original_path AS originalPath
         FROM media_files WHERE id = ? AND organized = 1`,
    )
    .get(id) as (MediaFileRow & { originalPath: string | null }) | undefined
  return row && { ...toMediaFile(row), originalPath: row.originalPath }
}

export function markOrganized(
  id: number,
  newPath: string,
  destinationId: number,
  originalPath: string,
): void {
  conn()
    .prepare(
      `UPDATE media_files
          SET path = ?, filename = ?, organized = 1,
              original_path = ?, organized_at = ?, destination_folder_id = ?
        WHERE id = ?`,
    )
    .run(newPath, path.basename(newPath), originalPath, new Date().toISOString(), destinationId, id)
}

export function markUnorganized(id: number, restoredPath: string): void {
  conn()
    .prepare(
      `UPDATE media_files
          SET path = ?, filename = ?, organized = 0,
              original_path = NULL, organized_at = NULL, destination_folder_id = NULL
        WHERE id = ?`,
    )
    .run(restoredPath, path.basename(restoredPath), id)
}

// --- pastas de destino ---

const DESTINATION_COLUMNS = `id, path, name, created_at AS createdAt, last_used_at AS lastUsedAt`

/** Mais recentemente usadas primeiro; as nunca usadas caem para a data de criação. */
export function listDestinationFolders(): DestinationFolder[] {
  return conn()
    .prepare(
      `SELECT ${DESTINATION_COLUMNS}
         FROM destination_folders
        ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC`,
    )
    .all() as DestinationFolder[]
}

/**
 * Só as pastas de destino que não estão dentro de outra pasta do mesmo grupo —
 * são as raízes da árvore no painel lateral. Uma pasta aninhada aparece sozinha
 * quando a árvore lê as subpastas reais da sua ancestral (listSubfolders), então
 * repeti-la aqui como raiz duplicaria o nó.
 *
 * Função pura, separada de `listRootDestinationFolders`, para que o main possa
 * calcular as raízes depois de filtrar por disponibilidade no disco (pastas em
 * HD externo desconectado) sem duplicar a lógica de aninhamento.
 */
export function rootsOf(folders: DestinationFolder[]): DestinationFolder[] {
  const isInsideAnother = (folder: DestinationFolder) =>
    folders.some((other) => {
      if (other.id === folder.id) return false
      const otherWithSep = other.path.endsWith(path.sep) ? other.path : other.path + path.sep
      return folder.path.startsWith(otherWithSep)
    })
  return folders.filter((folder) => !isInsideAnother(folder))
}

export function listRootDestinationFolders(): DestinationFolder[] {
  return rootsOf(listDestinationFolders())
}

export function getDestinationFolder(id: number): DestinationFolder | undefined {
  return conn()
    .prepare(`SELECT ${DESTINATION_COLUMNS} FROM destination_folders WHERE id = ?`)
    .get(id) as DestinationFolder | undefined
}

export function findDestinationByPath(folderPath: string): DestinationFolder | undefined {
  return conn()
    .prepare(`SELECT ${DESTINATION_COLUMNS} FROM destination_folders WHERE path = ?`)
    .get(folderPath) as DestinationFolder | undefined
}

export function insertDestinationFolder(folderPath: string, name: string): DestinationFolder {
  const id = Number(
    conn()
      .prepare('INSERT INTO destination_folders (path, name, created_at) VALUES (?, ?, ?)')
      .run(folderPath, name, new Date().toISOString()).lastInsertRowid,
  )
  return getDestinationFolder(id)!
}

export function touchDestinationFolder(id: number): void {
  conn()
    .prepare('UPDATE destination_folders SET last_used_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

/**
 * Tudo numa consulta só: a barra de progresso é relida depois de cada arquivo
 * organizado, e cinco consultas separadas para isso seria desperdício.
 */
export function getLibraryStats(): LibraryStats {
  return conn()
    .prepare(
      `SELECT COUNT(*)                                              AS total,
              COALESCE(SUM(organized), 0)                           AS organized,
              COALESCE(SUM(organized = 1 AND type = 'video'), 0)    AS organizedVideos,
              COALESCE(SUM(organized = 1 AND type = 'image'), 0)    AS organizedImages,
              (SELECT COUNT(DISTINCT destination_folder_id)
                 FROM media_files
                WHERE destination_folder_id IS NOT NULL)            AS foldersUsed
         FROM media_files`,
    )
    .get() as LibraryStats
}

// --- preferências ---

export function getSetting(key: string): string | undefined {
  const row = conn().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  conn()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value)
}
