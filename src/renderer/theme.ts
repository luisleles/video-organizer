export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'video-organizer:theme'

/**
 * O tema escuro é a decisão de produto padrão (ver comentário em index.css),
 * então qualquer valor ausente ou inesperado no localStorage cai em 'dark'.
 */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Perfil sem acesso a localStorage (ex.: modo privado): o tema só não
    // sobrevive a um reinício, o app continua funcionando normalmente.
  }
}

/**
 * `data-theme` no <html> é o que os seletores de `index.css` leem para trocar
 * os tokens de cor. Chamado antes do primeiro render (ver main.tsx) para não
 * piscar de escuro pra claro quando o usuário já escolheu o tema claro.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}
