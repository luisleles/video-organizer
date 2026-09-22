import Icon, { type IconName } from './Icon'

export type Screen = 'feed' | 'favorites' | 'review' | 'settings'

interface NavRailProps {
  screen: Screen
  onNavigate: (screen: Screen) => void
}

const ITEMS: { screen: Screen; icon: IconName; label: string }[] = [
  { screen: 'feed', icon: 'home', label: 'Início' },
  { screen: 'favorites', icon: 'heart', label: 'Favoritos' },
  { screen: 'review', icon: 'shuffle', label: 'Revisão' },
  { screen: 'settings', icon: 'settings', label: 'Configurações' },
]

/**
 * Rail de navegação fixo na lateral esquerda — o equivalente aos ícones
 * laterais do TikTok (perfil, configurações). Fica por cima do feed (que
 * ocupa a tela inteira), centralizado verticalmente para espelhar a rail de
 * ações do lado direito e não brigar com as pílulas do canto superior.
 */
export default function NavRail({ screen, onNavigate }: NavRailProps) {
  return (
    <div className="pointer-events-none absolute top-1/2 left-6 z-20 flex -translate-y-1/2 flex-col items-center gap-3">
      {ITEMS.map((item) => {
        const active = item.screen === screen
        return (
          <button
            key={item.screen}
            type="button"
            onClick={() => onNavigate(item.screen)}
            title={item.label}
            aria-label={item.label}
            aria-current={active}
            className={`border-line pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition ${
              active
                ? 'bg-accent/90 hover:bg-accent-hover border-transparent text-white'
                : 'text-fg-muted hover:text-fg bg-surface/90 hover:bg-surface-hover'
            }`}
          >
            <Icon name={item.icon} filled={item.icon === 'heart' && active} />
          </button>
        )
      })}
    </div>
  )
}
