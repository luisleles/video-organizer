import { useEffect } from 'react'

export interface ToastData {
  id: number
  kind: 'success' | 'error'
  text: string
  detail?: string
  action?: { label: string; onAction: () => void }
}

interface ToastProps {
  toast: ToastData
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 7000

// Fundo sólido, não translúcido: o toast aparece por cima de vídeo em movimento,
// e um fundo transparente deixaria o texto ilegível dependendo do quadro.
const KIND_STYLES: Record<ToastData['kind'], string> = {
  success: 'border-positive/60 bg-surface',
  error: 'border-negative/60 bg-surface',
}

const KIND_DOT: Record<ToastData['kind'], string> = {
  success: 'bg-positive',
  error: 'bg-negative',
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  // A key do componente muda a cada toast novo, então este efeito reinicia o
  // cronômetro em vez de deixar o anterior fechar a mensagem nova mais cedo.
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      role="status"
      className={`animate-slide-up pointer-events-auto flex items-center gap-4 rounded-card border px-4 py-3 shadow-xl backdrop-blur ${KIND_STYLES[toast.kind]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[toast.kind]}`} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{toast.text}</p>
        {toast.detail && <p className="truncate text-xs text-fg-muted">{toast.detail}</p>}
      </div>

      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onAction}
          className="shrink-0 rounded-control border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="shrink-0 text-fg-subtle transition hover:text-fg-muted"
      >
        ✕
      </button>
    </div>
  )
}
