import type { LibraryStats } from '../../shared/types'

interface LibraryProgressProps {
  stats: LibraryStats | null
  /** `line` é a fita fina do topo da janela; `full` traz rótulo e números. */
  variant: 'line' | 'full'
}

export function percentOrganized(stats: LibraryStats | null): number {
  if (!stats || stats.total === 0) return 0
  return Math.round((stats.organized / stats.total) * 100)
}

export default function LibraryProgress({ stats, variant }: LibraryProgressProps) {
  const percent = percentOrganized(stats)
  const hasLibrary = (stats?.total ?? 0) > 0

  if (variant === 'line') {
    return (
      <div className="bg-surface h-0.5 w-full shrink-0" aria-hidden>
        <div
          className="from-accent to-accent-hover h-full bg-gradient-to-r transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    )
  }

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progresso da organização"
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-fg-muted text-sm">
          {hasLibrary ? (
            <>
              Organizando: <span className="text-fg font-semibold tabular-nums">{percent}%</span>
            </>
          ) : (
            'Nenhum arquivo catalogado ainda'
          )}
        </p>
        {hasLibrary && (
          <p className="text-fg-subtle text-xs tabular-nums">
            {stats!.organized.toLocaleString('pt-BR')} de {stats!.total.toLocaleString('pt-BR')}{' '}
            arquivos
          </p>
        )}
      </div>

      <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
        <div
          className="from-accent to-accent-hover h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
