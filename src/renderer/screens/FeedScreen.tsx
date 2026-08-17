interface FeedScreenProps {
  onBack: () => void
}

export default function FeedScreen({ onBack }: FeedScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-slate-950 text-slate-100">
      <h1 className="text-4xl font-bold tracking-tight">Feed</h1>
      <p className="max-w-md text-center text-sm text-slate-400">
        Aqui vão aparecer os arquivos encontrados, um por vez, para você organizar.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        Voltar para a configuração
      </button>
    </div>
  )
}
