/**
 * Ícones em SVG, desenhados no mesmo traço (24×24, stroke 2, pontas arredondadas).
 *
 * Antes eram emojis. Funcionavam, mas cada um vinha com a paleta própria da
 * fonte do sistema — um 📂 amarelo e um ⏭ laranja ao lado de uma interface azul
 * e cinza. Em SVG eles herdam `currentColor` e passam a obedecer aos tokens.
 */
const PATHS = {
  folder:
    'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
  // Pasta expandida na árvore: a mesma aba do topo, mas com a frente aberta
  // num trapézio em vez de um retângulo fechado.
  folderOpen:
    'M3.75 9.78c.11-.02.23-.03.34-.03h15.8c.12 0 .23.01.35.03m-16.5 0a2.25 2.25 0 0 0-1.88 2.54l.86 6a2.25 2.25 0 0 0 2.22 1.93h13.05a2.25 2.25 0 0 0 2.23-1.93l.86-6a2.25 2.25 0 0 0-1.89-2.54m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.88a1.5 1.5 0 0 1 1.06.44l2.12 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.78',
  skip: 'M5 4v16l10-8zM19 5v14',
  volumeOn: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  volumeOff: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  arrowUp: 'm18 15-6-6-6 6',
  arrowDown: 'm6 9 6 6 6-6',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  // Duas setas cruzando — o símbolo usual de "ordem aleatória".
  shuffle:
    'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4',
  heart: 'M12 21s-7.5-4.6-10-9.3C.5 8.4 2.2 5 5.6 5c1.9 0 3.4 1 4.4 2.4C11 6 12.5 5 14.4 5 17.8 5 19.5 8.4 22 11.7 19.5 16.4 12 21 12 21Z',
  home: 'M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  expand: 'M15 3h6v6M9 21h-6v-6M21 3l-7 7M3 21l7-7',
  compress: 'M4 14h6v6M20 10h-6v-6M14 10l7-7M3 21l7-7',
  play: 'M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  // Pasta com uma seta de "abrir por fora" no canto — usado tanto pro item
  // atual (mostrar no gerenciador de arquivos) quanto por pasta na árvore.
  revealInFolder:
    'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2ZM14 9l6-6M15 3h5v5',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35M8 11h6',
  // Um só desenho pros dois modos de exibição: contorno = tamanho original,
  // preenchido (via a prop `filled`) = preencher tela.
  frame: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  className = 'h-5 w-5',
  filled = false,
}: {
  name: IconName
  className?: string
  /** Só o coração usa isso hoje: contorno vs preenchido conforme favoritado. */
  filled?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
