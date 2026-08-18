import MediaFeed from '../components/MediaFeed'
import type { LibraryStats } from '../../shared/types'

interface FavoritesScreenProps {
  stats: LibraryStats | null
  onStatsChanged: () => void
  onOpenSettings: () => void
  fitMode: 'original' | 'fill'
  onToggleFitMode: () => void
}

/**
 * Feed filtrado só com os itens favoritados — o mesmo componente de feed da
 * tela inicial, então dá pra organizar direto daqui também. Favoritar é
 * independente de organizar: mover um arquivo aqui não o tira desta lista.
 */
export default function FavoritesScreen({
  stats,
  onStatsChanged,
  fitMode,
  onToggleFitMode,
}: FavoritesScreenProps) {
  return (
    <MediaFeed
      mode="favorites"
      stats={stats}
      onStatsChanged={onStatsChanged}
      fitMode={fitMode}
      onToggleFitMode={onToggleFitMode}
      emptyState={<EmptyFavorites />}
    />
  )
}

function EmptyFavorites() {
  return (
    <div className="bg-canvas text-fg flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="animate-rise-in flex flex-col items-center">
        <span className="text-6xl">🤍</span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Nenhum favorito ainda</h1>
        <p className="text-fg-muted mt-2 max-w-md text-sm">
          Toque no coração de um vídeo ou imagem no feed para guardar aqui.
        </p>
      </div>
    </div>
  )
}
