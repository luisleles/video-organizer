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

const KIND_STYLES: Record<ToastData['kind'], string> = {
  success: 'border-emerald-800 bg-emerald-950/90',
  error: 'border-red-800 bg-red-950/90',
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
      className={`animate-slide-up pointer-events-auto flex items-center gap-4 rounded-xl border px-4 py-3 shadow-xl backdrop-blur ${KIND_STYLES[toast.kind]}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-100">{toast.text}</p>
        {toast.detail && <p className="truncate text-xs text-slate-400">{toast.detail}</p>}
      </div>

      {toast.action && (
        <button
          type="button"
          onClick={toast.action.onAction}
          className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="shrink-0 text-slate-500 transition hover:text-slate-300"
      >
        ✕
      </button>
    </div>
  )
}
