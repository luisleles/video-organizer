// Tradução entre caminho no disco e URL do protocolo customizado. Fica em shared
// porque o renderer monta a URL e o main a desmonta — as duas metades precisam
// concordar exatamente, senão o vídeo simplesmente não carrega.

export const MEDIA_SCHEME = 'media'

// Host fixo. Um esquema "standard" exige host na URL; o valor não importa, mas
// precisa existir e ser o mesmo dos dois lados.
const MEDIA_HOST = 'local'

/** Preserva caminhos Unix, unidades do Windows e compartilhamentos UNC. */
export function toMediaUrl(absolutePath: string): string {
  // A query preserva barras, acentos e caracteres especiais sem normalização
  // pelo parser de URL. O handler continua exigindo presença no catálogo.
  return `${MEDIA_SCHEME}://${MEDIA_HOST}/file?path=${encodeURIComponent(absolutePath)}`
}

/** Caminho absoluto de volta, ou null se a URL não for do nosso esquema. */
export function pathFromMediaUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== MEDIA_HOST ||
      parsed.pathname !== '/file' || parsed.username || parsed.password) return null
  const filePath = parsed.searchParams.get('path')
  if (!filePath || filePath.includes('\0')) return null
  // Unix, unidade do Windows ou compartilhamento de rede UNC.
  if (!filePath.startsWith('/') && !/^[a-z]:[\\/]/i.test(filePath) &&
      !/^\\\\[^\\]+\\[^\\]+/.test(filePath)) return null
  return filePath
}
