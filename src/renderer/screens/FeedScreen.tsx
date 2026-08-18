import AllDoneState from '../components/AllDoneState'
import MediaFeed from '../components/MediaFeed'
import type { LibraryStats } from '../../shared/types'

interface FeedScreenProps {
  stats: LibraryStats | null
  onStatsChanged: () => void
  onOpenSettings: () => void
}

/** Tela inicial do app: a fila principal, no estilo "Para você" do TikTok. */
export default function FeedScreen({ stats, onStatsChanged, onOpenSettings }: FeedScreenProps) {
  // `stats.total === 0` cobre tanto "nenhuma pasta cadastrada" quanto "pastas
  // cadastradas mas ainda sem nada catalogado" — nos dois casos a ação certa é
  // a mesma: ir em Configurações. Evita um round-trip extra só para decidir a
  // mensagem.
  const kind = (stats?.total ?? 0) === 0 ? 'no-folders' : 'all-done'

  return (
    <MediaFeed
      mode="queue"
      stats={stats}
      onStatsChanged={onStatsChanged}
      emptyState={<AllDoneState kind={kind} stats={stats} onOpenSettings={onOpenSettings} />}
    />
  )
}
