import type { LibraryStats } from '../../shared/types'

interface AllDoneStateProps {
  /**
   * `no-folders`: nenhuma pasta de origem cadastrada ainda — convida a ir em
   * Configurações. `all-done`: há pastas, mas a fila está vazia (tudo
   * organizado ou tudo pulado até o fim).
   */
  kind: 'no-folders' | 'all-done'
  stats: LibraryStats | null
  onOpenSettings: () => void
}

/**
 * Fim da fila (ou início vazio). Mostra o que foi feito em vez de só dizer que
 * acabou — depois de uma sessão longa, o número é a recompensa.
 */
export default function AllDoneState({ kind, stats, onOpenSettings }: AllDoneStateProps) {
  const noFolders = kind === 'no-folders'

  return (
    <div className="bg-canvas text-fg flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="animate-rise-in flex flex-col items-center">
        <span className="text-6xl">{noFolders ? '📂' : '🎉'}</span>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {noFolders ? 'Nenhuma pasta cadastrada' : 'Tudo organizado!'}
        </h1>

        <p className="text-fg-muted mt-2 max-w-md text-sm">
          {noFolders
            ? 'Vá em Configurações e adicione uma pasta com vídeos ou imagens para começar.'
            : 'Você chegou ao fim da fila. Nada mais esperando por aqui.'}
        </p>

        {!noFolders && stats && (
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

        <div className="mt-10">
          <button
            type="button"
            onClick={onOpenSettings}
            className="bg-accent hover:bg-accent-hover rounded-control px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            {noFolders ? 'Ir para Configurações' : 'Sincronizar ou adicionar pastas'}
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
