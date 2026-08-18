/**
 * Esqueleto do feed enquanto a fila carrega.
 *
 * Reproduz o formato real da tela — moldura da mídia, pílulas do topo, barra
 * lateral de ações — para que a interface não dê um salto quando o conteúdo
 * chegar. Um spinner solto no meio do vazio deixaria a transição mais brusca.
 */
export default function FeedSkeleton() {
  return (
    <div className="bg-canvas relative h-full overflow-hidden" aria-busy>
      <div className="flex h-full items-center justify-center">
        <div className="bg-surface/40 animate-pulse-soft h-[70%] w-[42%] rounded-panel" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="bg-surface/60 animate-pulse-soft rounded-card h-14 w-56" />
          <div className="bg-surface/60 animate-pulse-soft rounded-card h-11 w-40" />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="bg-surface/60 animate-pulse-soft rounded-control h-9 w-28" />
          <div className="flex gap-2">
            <div className="bg-surface/60 animate-pulse-soft h-11 w-11 rounded-full" />
            <div className="bg-surface/60 animate-pulse-soft h-11 w-11 rounded-full" />
          </div>
        </div>
      </div>

      <div className="absolute top-1/2 right-6 flex -translate-y-1/2 flex-col items-center gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex w-16 flex-col items-center gap-1">
            <div className="bg-surface/60 animate-pulse-soft h-14 w-14 rounded-full" />
            <div className="bg-surface/50 animate-pulse-soft h-2.5 w-12 rounded-full" />
          </div>
        ))}
      </div>

      <p className="text-fg-subtle absolute bottom-6 left-1/2 -translate-x-1/2 text-xs">
        Carregando a fila…
      </p>
    </div>
  )
}
