import { useCallback, useEffect, useState } from 'react'
import type { ScanProgress, SourceFolder } from '../../shared/types'

interface SourceFolderManagerProps {
  /** Chamado quando a lista muda, para quem precisa recarregar estatísticas. */
  onChanged?: () => void
}

type Notice = { kind: 'info' | 'warn' | 'error'; text: string }

const NOTICE_STYLES: Record<Notice['kind'], string> = {
  info: 'border-accent-deep bg-accent-deep/15 text-accent-hover',
  warn: 'border-amber-800 bg-amber-950/60 text-amber-200',
  error: 'border-negative/60 bg-negative/15 text-negative',
}

/**
 * Cadastro de pastas de origem. Vive num componente próprio porque aparece em
 * dois lugares: na tela inicial e nas configurações — e o comportamento precisa
 * ser o mesmo nos dois.
 */
export default function SourceFolderManager({ onChanged }: SourceFolderManagerProps) {
  const [folders, setFolders] = useState<SourceFolder[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const refresh = useCallback(async () => {
    setFolders(await window.api.listFolders())
    onChanged?.()
  }, [onChanged])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A função devolvida remove o listener; sem ela, o StrictMode do React (que
  // monta duas vezes em dev) já deixaria um listener órfão no canal.
  useEffect(() => window.api.onScanProgress(setProgress), [])

  async function handleAdd() {
    setNotice(null)
    setScanning(true)
    setProgress(null)

    try {
      const result = await window.api.addFolder()
      switch (result.status) {
        case 'added':
          await refresh()
          setNotice({
            kind: 'info',
            text: `${result.folder.totalCount.toLocaleString('pt-BR')} arquivo(s) encontrado(s) em ${basename(result.folder.path)}.`,
          })
          break
        case 'cancelled':
          break
        case 'duplicate':
          setNotice({ kind: 'warn', text: 'Essa pasta já está cadastrada.' })
          break
        case 'nested':
          setNotice({
            kind: 'warn',
            text: `Conflito com ${result.existingPath} — uma pasta está dentro da outra, e os arquivos seriam contados duas vezes.`,
          })
          break
        case 'error':
          setNotice({ kind: 'error', text: `Falha ao escanear: ${result.message}` })
          break
      }
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  async function handleRemove(folder: SourceFolder) {
    await window.api.removeFolder(folder.id)
    await refresh()
    setNotice({
      kind: 'info',
      text: `${basename(folder.path)} saiu do cadastro. Nenhum arquivo foi apagado do disco.`,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleAdd}
          disabled={scanning}
          className="bg-accent hover:bg-accent-hover rounded-control px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-fg-subtle"
        >
          {scanning ? 'Escaneando…' : 'Adicionar pasta de origem'}
        </button>

        {scanning && progress && (
          <p className="text-fg-subtle min-w-0 flex-1 truncate text-xs">
            {progress.filesFound.toLocaleString('pt-BR')} encontrado(s) · {progress.currentDir}
          </p>
        )}
      </div>

      {notice && (
        <p className={`rounded-control border px-4 py-3 text-sm ${NOTICE_STYLES[notice.kind]}`}>
          {notice.text}
        </p>
      )}

      {folders === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <div key={row} className="bg-surface/60 rounded-card animate-pulse-soft h-[74px]" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <div className="border-line rounded-card border border-dashed px-6 py-12 text-center">
          <p className="text-fg-muted text-sm">Nenhuma pasta cadastrada ainda.</p>
          <p className="text-fg-subtle mt-1 text-xs">
            Vídeos: .mp4 .mov .mkv .avi .webm · Imagens: .jpg .jpeg .png .gif .webp
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="border-line bg-surface/50 rounded-card animate-rise-in flex items-center gap-4 border px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{basename(folder.path)}</p>
                <p className="text-fg-subtle truncate text-xs" title={folder.path}>
                  {folder.path}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-xs">
                <Badge className="bg-indigo-950 text-indigo-300">
                  {folder.videoCount.toLocaleString('pt-BR')} vídeos
                </Badge>
                <Badge className="bg-teal-950 text-teal-300">
                  {folder.imageCount.toLocaleString('pt-BR')} imagens
                </Badge>
              </div>

              <button
                type="button"
                onClick={() => handleRemove(folder)}
                title="Remove do cadastro; não apaga os arquivos"
                className="border-line-strong text-fg-muted hover:border-negative/60 hover:bg-negative/10 hover:text-negative rounded-control shrink-0 border px-3 py-1.5 text-xs transition"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 font-medium ${className}`}>{children}</span>
}

function basename(fullPath: string): string {
  return fullPath.split('/').filter(Boolean).pop() ?? fullPath
}
