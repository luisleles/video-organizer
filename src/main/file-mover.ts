import fs from 'node:fs/promises'
import path from 'node:path'

export class FileMoveError extends Error {
  constructor(
    readonly reason: 'source-missing' | 'permission-denied' | 'disk-full' | 'unknown',
    message: string,
  ) {
    super(message)
  }
}

/**
 * Move um arquivo, devolvendo o caminho final (que pode diferir do pedido, se já
 * houvesse um arquivo com o mesmo nome no destino).
 *
 * Nunca sobrescreve: `fs.rename` por padrão apaga o destino existente sem avisar,
 * e aqui isso significaria destruir um vídeo do usuário silenciosamente.
 */
export async function moveFile(sourcePath: string, destinationDir: string): Promise<string> {
  try {
    await fs.access(sourcePath)
  } catch {
    throw new FileMoveError('source-missing', 'O arquivo não está mais no local original')
  }

  try {
    await fs.mkdir(destinationDir, { recursive: true })
    const targetPath = await resolveCollision(destinationDir, path.basename(sourcePath))

    try {
      await fs.rename(sourcePath, targetPath)
    } catch (error) {
      // EXDEV: origem e destino em sistemas de arquivos diferentes (HD externo,
      // partição separada, pendrive). rename() não atravessa dispositivos, então
      // é preciso copiar e depois apagar.
      if (isErrno(error, 'EXDEV')) {
        await copyThenDelete(sourcePath, targetPath)
      } else {
        throw error
      }
    }

    return targetPath
  } catch (error) {
    throw toFileMoveError(error)
  }
}

async function copyThenDelete(sourcePath: string, targetPath: string): Promise<void> {
  // COPYFILE_EXCL: falha se o destino aparecer entre a checagem e a cópia, em vez
  // de sobrescrever.
  await fs.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
  try {
    await fs.unlink(sourcePath)
  } catch (error) {
    // A cópia deu certo mas o original não pôde ser removido: desfaz a cópia para
    // não deixar o arquivo duplicado em dois lugares sem o usuário saber.
    await fs.unlink(targetPath).catch(() => {})
    throw error
  }
}

/** `ferias.mp4` -> `ferias (2).mp4` se já existir algo com esse nome. */
async function resolveCollision(directory: string, filename: string): Promise<string> {
  const extension = path.extname(filename)
  const base = path.basename(filename, extension)

  let candidate = path.join(directory, filename)
  let counter = 2
  while (await exists(candidate)) {
    candidate = path.join(directory, `${base} (${counter})${extension}`)
    counter++
  }
  return candidate
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === code
}

function toFileMoveError(error: unknown): FileMoveError {
  if (error instanceof FileMoveError) return error

  const code = (error as { code?: string }).code
  switch (code) {
    case 'ENOENT':
      return new FileMoveError('source-missing', 'O arquivo não está mais no local original')
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return new FileMoveError('permission-denied', 'Sem permissão de escrita nesta pasta')
    case 'ENOSPC':
      return new FileMoveError('disk-full', 'Não há espaço livre no disco de destino')
    default:
      return new FileMoveError('unknown', error instanceof Error ? error.message : String(error))
  }
}
