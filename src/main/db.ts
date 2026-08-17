import { app } from 'electron'
import Database from 'better-sqlite3'
import path from 'node:path'
import type { MediaFile, MediaType, SourceFolder } from '../shared/types'
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
  folder_source_id INTEGER NOT NULL REFERENCES source_folders(id) ON DELETE CASCADE,
  -- SQLite não tem BOOLEAN: 0 = false, 1 = true.
  organized        INTEGER NOT NULL DEFAULT 0 CHECK (organized IN (0, 1)),
  discovered_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_folder    ON media_files (folder_source_id);
CREATE INDEX IF NOT EXISTS idx_media_organized ON media_files (organized);
`

export function initDatabase(): string {
  const file = path.join(app.getPath('userData'), 'library.db')
  db = new Database(file)
  // WAL: leitura e escrita não se bloqueiam — importa porque o scan insere
  // milhares de linhas enquanto a UI consulta as contagens.
  db.pragma('journal_mode = WAL')
  // Precisa ser ligado em toda conexão; sem isso o ON DELETE CASCADE é ignorado.
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
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

/** Fila do feed: o que ainda não foi organizado, na ordem em que foi descoberto. */
export function listUnorganizedMedia(): MediaFile[] {
  return conn()
    .prepare(
      `SELECT id, path, filename, type, discovered_at AS discoveredAt
         FROM media_files
        WHERE organized = 0
        ORDER BY discovered_at, id`,
    )
    .all() as MediaFile[]
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
