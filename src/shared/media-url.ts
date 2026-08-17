// Tradução entre caminho no disco e URL do protocolo customizado. Fica em shared
// porque o renderer monta a URL e o main a desmonta — as duas metades precisam
// concordar exatamente, senão o vídeo simplesmente não carrega.

export const MEDIA_SCHEME = 'media'

// Host fixo. Um esquema "standard" exige host na URL; o valor não importa, mas
// precisa existir e ser o mesmo dos dois lados.
const MEDIA_HOST = 'local'

/** `/home/ana/Vídeos/férias.mp4` -> `media://local/home/ana/V%C3%ADdeos/f%C3%A9rias.mp4` */
export function toMediaUrl(absolutePath: string): string {
  // Codifica segmento a segmento: encodeURIComponent na string inteira comeria
  // as barras, e sem codificar nada os acentos, `#` e `?` dos nomes de arquivo
  // quebrariam a URL.
  const segments = absolutePath.split('/').filter(Boolean).map(encodeURIComponent)
  return `${MEDIA_SCHEME}://${MEDIA_HOST}/${segments.join('/')}`
}

/** Caminho absoluto de volta, ou null se a URL não for do nosso esquema. */
export function pathFromMediaUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null

  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (segments.length === 0) return null
  return '/' + segments.join('/')
}
