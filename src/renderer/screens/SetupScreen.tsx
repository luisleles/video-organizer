import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import LibraryProgress from '../components/LibraryProgress'
import SourceFolderManager from '../components/SourceFolderManager'
import type { LibraryStats } from '../../shared/types'

interface SetupScreenProps {
  stats: LibraryStats | null
  onStatsChanged: () => void
  onStart: () => void
  onOpenSettings: () => void
}

export default function SetupScreen({
  stats,
  onStatsChanged,
  onStart,
  onOpenSettings,
}: SetupScreenProps) {
  const [pending, setPending] = useState(0)

  // A fila do feed não sai das estatísticas: `total - organized` inclui itens
  // que o usuário pulou, então o número exato vem da mesma consulta que o feed.
  useEffect(() => {
    void window.api.listUnorganizedMedia().then((items) => setPending(items.length))
  }, [stats])

  return (
    <div className="bg-canvas text-fg flex h-full flex-col">
      <header className="border-line border-b px-10 py-8">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Video Organizer</h1>
            <p className="text-fg-muted mt-2 max-w-xl text-sm">
              Escolha as pastas onde estão seus vídeos e imagens. O app percorre as subpastas e
              cataloga o que encontrar — nada é movido ou alterado neste passo.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Configurações"
            aria-label="Configurações"
            className="border-line text-fg-muted hover:border-line-strong hover:text-fg rounded-control shrink-0 border p-2.5 transition"
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <LibraryProgress stats={stats} variant="full" />
          <SourceFolderManager onChanged={onStatsChanged} />
        </div>
      </main>

      <footer className="border-line border-t px-10 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <p className="text-fg-subtle text-sm">
            {pending === 0
              ? 'Adicione uma pasta com vídeos ou imagens para começar.'
              : `${pending.toLocaleString('pt-BR')} arquivo(s) esperando na fila.`}
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={pending === 0}
            className="from-accent to-accent-hover hover:from-accent-hover rounded-control bg-gradient-to-r px-6 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:from-surface-hover disabled:to-surface-hover disabled:text-fg-subtle"
          >
            Começar a organizar
          </button>
        </div>
      </footer>
    </div>
  )
}
