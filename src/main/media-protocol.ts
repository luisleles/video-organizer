import { protocol } from 'electron'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { MEDIA_SCHEME, pathFromMediaUrl } from '../shared/media-url'
import * as db from './db'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * Precisa rodar ANTES de app.whenReady(): os privilégios de um esquema são lidos
 * na inicialização do Chromium e ignorados se registrados depois.
 *
 * - standard: faz a URL ser parseada como URL de verdade, com normalização de
 *   `..` — é o que impede path traversal (media://local/a/../../etc/passwd vira
 *   /etc/passwd antes de chegar no nosso código, e aí o allowlist barra).
 * - secure: sem isso o Chromium trata o esquema como origem insegura e bloqueia
 *   o carregamento a partir de http://localhost:5173 (o renderer em dev).
 * - stream: habilita requisições parciais (Range), que o <video> usa para
 *   começar a tocar sem baixar o arquivo inteiro e para permitir seek.
 */
export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
}

/** Precisa rodar DEPOIS de app.whenReady(). */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, handleMediaRequest)
}

async function handleMediaRequest(request: Request): Promise<Response> {
  const filePath = pathFromMediaUrl(request.url)

  // A trava de segurança: só serve arquivo que está catalogado em media_files,
  // ou seja, que veio de uma pasta que o usuário escolheu no seletor nativo.
  // O renderer não consegue pedir /etc/passwd nem ~/.ssh/id_rsa — mesmo que o
  // código da interface seja comprometido, o alcance dele é a biblioteca.
  if (!filePath || !db.isCatalogued(filePath)) {
    return new Response('Arquivo fora do catálogo', { status: 404 })
  }

  let stats
  try {
    stats = await fs.stat(filePath)
  } catch {
    // Catalogado mas sumiu do disco (movido ou apagado desde o scan).
    return new Response('Arquivo não encontrado no disco', { status: 404 })
  }
  if (!stats.isFile()) return new Response('Não é um arquivo', { status: 404 })

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(request.headers.get('Range'), stats.size)

  if (range === 'invalid') {
    return new Response('Range inválido', {
      status: 416,
      headers: { 'Content-Range': `bytes */${stats.size}` },
    })
  }

  if (range) {
    // 206 Partial Content: é assim que o <video> pula para um trecho do arquivo
    // sem precisar carregar tudo que veio antes.
    return new Response(toWebStream(filePath, range.start, range.end), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  return new Response(toWebStream(filePath), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
      // Anuncia suporte a Range; sem isso o Chromium não tenta fazer seek.
      'Accept-Ranges': 'bytes',
    },
  })
}

function toWebStream(filePath: string, start?: number, end?: number): ReadableStream {
  // Stream em vez de readFile: um vídeo de 4 GB não cabe (e não deve caber) na
  // memória do processo main só para ser exibido.
  return Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
}

type ParsedRange = { start: number; end: number } | null | 'invalid'

/** Interpreta o cabeçalho Range (`bytes=0-1023`, `bytes=500-`, `bytes=-500`). */
function parseRange(header: string | null, size: number): ParsedRange {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return 'invalid'

  // `bytes=-500` significa "os últimos 500 bytes", não "do 0 ao 500".
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd))
  const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1) : size - 1

  if (start > end || start >= size) return 'invalid'
  return { start, end }
}
