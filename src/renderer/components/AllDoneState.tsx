import type { LibraryStats } from '../../shared/types'

interface AllDoneStateProps {
  stats: LibraryStats | null
  onBack: () => void
  onOpenSettings: () => void
}

/**
 * Fim da fila. Mostra o que foi feito em vez de só dizer que acabou — depois de
 * uma sessão longa, o número é a recompensa.
 */
export default function AllDoneState({ stats, onBack, onOpenSettings }: AllDoneStateProps) {
  const nothingEverOrganized = (stats?.organized ?? 0) === 0

  return (
    <div className="bg-canvas text-fg flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="animate-rise-in flex flex-col items-center">
        <span className="text-6xl">{nothingEverOrganized ? '📂' : '🎉'}</span>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {nothingEverOrganized ? 'Nada na fila' : 'Tudo organizado!'}
        </h1>

        <p className="text-fg-muted mt-2 max-w-md text-sm">
          {nothingEverOrganized
            ? 'Não há arquivos esperando. Cadastre uma pasta de origem ou sincronize para buscar novidades.'
            : 'Você chegou ao fim da fila. Nada mais esperando por aqui.'}
        </p>

        {!nothingEverOrganized && stats && (
          <div className="mt-10 flex items-stretch gap-3">
            <Stat value={stats.organizedVideos} label={stats.organizedVideos === 1 ? 'vídeo' : 'vídeos'} />
            <Stat
              value={stats.organizedImages}
              label={stats.organizedImages === 1 ? 'imagem' : 'imagens'}
            />
            <Stat
              value={stats.foldersUsed}
              label={stats.foldersUsed === 1 ? 'pasta' : 'pastas'}
              muted
            />
          </div>
        )}

        <div className="mt-10 flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSettings}
            className="bg-accent hover:bg-accent-hover rounded-control px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            Sincronizar ou adicionar pastas
          </button>
          <button
            type="button"
            onClick={onBack}
            className="border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg rounded-control border px-5 py-2.5 text-sm transition"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="border-line bg-surface/50 rounded-card min-w-28 border px-6 py-5">
      <p
        className={`text-3xl font-bold tabular-nums ${muted ? 'text-fg-muted' : 'text-accent-hover'}`}
      >
        {value.toLocaleString('pt-BR')}
      </p>
      <p className="text-fg-subtle mt-1 text-xs">{label}</p>
    </div>
  )
}
