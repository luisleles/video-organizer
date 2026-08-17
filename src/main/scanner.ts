import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaType } from '../shared/types'

const EXTENSIONS: Record<string, MediaType> = {
  '.mp4': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.avi': 'video',
  '.webm': 'video',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
}

export interface ScannedFile {
  path: string
  filename: string
  type: MediaType
}

/**
 * Percorre `root` e todas as subpastas atrás de vídeos e imagens.
 *
 * Iterativo com pilha em vez de recursão: uma árvore muito profunda estouraria a
 * call stack. Roda no processo main (o renderer não tem acesso a disco) e cede o
 * event loop a cada readdir, então a janela não congela durante o scan.
 */
export async function scanFolder(
  root: string,
  onProgress: (filesFound: number, currentDir: string) => void,
): Promise<ScannedFile[]> {
  const found: ScannedFile[] = []
  const pending: string[] = [root]
  let lastPing = 0

  while (pending.length > 0) {
    const dir = pending.pop()!

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      // Sem permissão de leitura, ou a pasta sumiu no meio do scan: ignora essa
      // subárvore em vez de abortar o scan inteiro.
      continue
    }

    for (const entry of entries) {
      // Pula ocultos (.git, .cache, lixeiras de sincronização).
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        pending.push(fullPath)
      } else if (entry.isFile()) {
        const type = EXTENSIONS[path.extname(entry.name).toLowerCase()]
        if (type) found.push({ path: fullPath, filename: entry.name, type })
      }
      // Links simbólicos caem fora dos dois casos de propósito: seguir links de
      // pasta pode entrar em ciclo infinito ou contar o mesmo arquivo duas vezes.
    }

    // Progresso limitado a ~6 avisos por segundo: sem isso o IPC vira o gargalo
    // do scan, com mais tempo gasto notificando do que lendo o disco.
    const now = Date.now()
    if (now - lastPing > 150) {
      lastPing = now
      onProgress(found.length, dir)
    }
  }

  return found
}
