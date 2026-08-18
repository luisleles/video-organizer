import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import LibraryProgress from '../components/LibraryProgress'
import SourceFolderManager from '../components/SourceFolderManager'
import type { LibraryStats } from '../../shared/types'

interface SettingsScreenProps {
  stats: LibraryStats | null
  onStatsChanged: () => void
  onBack: () => void
}

export default function SettingsScreen({ stats, onStatsChanged, onBack }: SettingsScreenProps) {
  const [root, setRoot] = useState<string | null>(null)
  const [rescanning, setRescanning] = useState(false)
  const [rescanNotice, setRescanNotice] = useState<string | null>(null)

  useEffect(() => {
    void window.api.organizationRoot().then(setRoot)
  }, [])

  const handleChooseRoot = useCallback(async () => {
    const chosen = await window.api.chooseOrganizationRoot()
    if (chosen) setRoot(chosen)
  }, [])

  const handleRescan = useCallback(async () => {
    setRescanning(true)
    setRescanNotice(null)
    try {
      const result = await window.api.rescanFolders()
      onStatsChanged()
      setRescanNotice(
        result.newFiles === 0
          ? `Nada novo em ${result.foldersScanned} pasta(s). Tudo já estava catalogado.`
          : `${result.newFiles.toLocaleString('pt-BR')} arquivo(s) novo(s) em ${result.foldersScanned} pasta(s).`,
      )
    } finally {
      setRescanning(false)
    }
  }, [onStatsChanged])

  return (
    <div className="bg-canvas text-fg flex h-full flex-col">
      <header className="border-line border-b px-10 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
            <p className="text-fg-muted mt-1 text-sm">
              Pastas de origem, destino padrão e sincronização da biblioteca.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg rounded-control shrink-0 border px-4 py-2 text-sm transition"
          >
            Concluído
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          <Section
            title="Progresso"
            description="Quanto da biblioteca já passou pelo feed."
          >
            <LibraryProgress stats={stats} variant="full" />
          </Section>

          <Section
            title="Pastas de origem"
            description="Onde o app procura vídeos e imagens. Remover uma pasta tira os arquivos do catálogo, nunca do disco."
          >
            <SourceFolderManager onChanged={onStatsChanged} />
          </Section>

          <Section
            title="Pasta raiz de organização"
            description="Sugestão padrão ao criar uma nova pasta de destino durante a organização."
          >
            <div className="flex items-center gap-3">
              <p
                className="bg-surface/60 text-fg-muted rounded-control min-w-0 flex-1 truncate px-4 py-2.5 text-sm"
                title={root ?? undefined}
              >
                {root ?? 'Carregando…'}
              </p>
              <button
                type="button"
                onClick={handleChooseRoot}
                className="border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg rounded-control shrink-0 border px-4 py-2.5 text-sm transition"
              >
                Alterar
              </button>
            </div>
          </Section>

          <Section
            title="Sincronizar novamente"
            description="Revarre as pastas de origem atrás de arquivos que apareceram depois do último escaneamento. Nada é duplicado."
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleRescan}
                disabled={rescanning}
                className="border-line-strong text-fg hover:border-accent hover:text-accent-hover rounded-control flex shrink-0 items-center gap-2 border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rescanning ? (
                  <span className="border-fg-subtle border-t-accent animate-spin-slow h-4 w-4 rounded-full border-2" />
                ) : (
                  <Icon name="refresh" className="h-4 w-4" />
                )}
                {rescanning ? 'Sincronizando…' : 'Sincronizar novamente'}
              </button>
              {rescanNotice && (
                <p className="text-fg-muted animate-fade-in min-w-0 text-sm">{rescanNotice}</p>
              )}
            </div>
          </Section>
        </div>
      </main>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-fg-subtle mt-0.5 text-sm">{description}</p>
      </div>
      {children}
    </section>
  )
}
