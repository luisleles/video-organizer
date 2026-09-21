export function validateFolderName(name: string, platform: string): string | null {
  if (!name) return 'Escolha um nome para a pasta'
  if (name === '.' || name === '..') return 'Esse nome não pode ser usado'
  if (/[\\/\0]/.test(name)) return 'O nome não pode conter barras'
  if (platform === 'win32') {
    if (/[<>:"|?*\x00-\x1f]/.test(name)) return 'O nome contém caracteres inválidos no Windows'
    if (/[. ]$/.test(name)) return 'O nome não pode terminar com ponto ou espaço'
    if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) {
      return 'Esse nome é reservado pelo Windows'
    }
  }
  if (name.startsWith('.')) return 'Nomes começando com ponto ficam ocultos no Linux'
  if (name.length > 255) return 'O nome é longo demais'
  return null
}
