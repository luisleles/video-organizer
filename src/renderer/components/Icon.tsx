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
  skip: 'M5 4v16l10-8zM19 5v14',
  volumeOn: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  volumeOff: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  arrowUp: 'm18 15-6-6-6 6',
  arrowDown: 'm6 9 6 6 6-6',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  heart: 'M12 21s-7.5-4.6-10-9.3C.5 8.4 2.2 5 5.6 5c1.9 0 3.4 1 4.4 2.4C11 6 12.5 5 14.4 5 17.8 5 19.5 8.4 22 11.7 19.5 16.4 12 21 12 21Z',
  home: 'M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
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
