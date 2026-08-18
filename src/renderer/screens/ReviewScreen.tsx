import MediaFeed from '../components/MediaFeed'
import type { LibraryStats } from '../../shared/types'

interface ReviewScreenProps {
  stats: LibraryStats | null
  onStatsChanged: () => void
  onOpenSettings: () => void
  fitMode: 'original' | 'fill'
  onToggleFitMode: () => void
}

/**
 * Revisão aleatória do que já foi organizado — o mesmo feed das outras seções,
 * alimentado com uma ordem sorteada entre TODAS as pastas de destino.
 *
 * Serve para redescobrir o que já foi arquivado: organizar aqui não tira o item
 * da lista, só o move de uma pasta de destino para outra, para o caso de a
 * escolha original não ter sido a melhor.
 */
export default function ReviewScreen({
  stats,
  onStatsChanged,
  fitMode,
  onToggleFitMode,
}: ReviewScreenProps) {
  return (
    <MediaFeed
      mode="review"
      stats={stats}
      onStatsChanged={onStatsChanged}
      fitMode={fitMode}
      onToggleFitMode={onToggleFitMode}
      emptyState={<EmptyReview />}
    />
  )
}

function EmptyReview() {
  return (
    <div className="bg-canvas text-fg flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="animate-rise-in flex flex-col items-center">
        <span className="text-6xl">🎲</span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Nada para revisar ainda</h1>
        <p className="text-fg-muted mt-2 max-w-md text-sm">
          Esta aba embaralha o que você já organizou, para redescobrir itens espalhados pelas pastas
          de destino. Organize alguns arquivos no Início e eles aparecem aqui.
        </p>
      </div>
    </div>
  )
}
