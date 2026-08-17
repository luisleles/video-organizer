import { useCallback, useEffect, useState } from 'react'
import type { ScanProgress, SourceFolder } from '../../shared/types'

interface SetupScreenProps {
  onStart: () => void
}

type Notice = { kind: 'info' | 'warn' | 'error'; text: string }

const NOTICE_STYLES: Record<Notice['kind'], string> = {
  info: 'border-sky-800 bg-sky-950/60 text-sky-200',
  warn: 'border-amber-800 bg-amber-950/60 text-amber-200',
  error: 'border-red-800 bg-red-950/60 text-red-200',
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  const [folders, setFolders] = useState<SourceFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const refresh = useCallback(async () => {
    setFolders(await window.api.listFolders())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // O main empurra o progresso do scan por um canal separado. A função devolvida
  // por onScanProgress remove o listener quando o componente sai de tela — sem
  // ela, o StrictMode do React (que monta duas vezes em dev) já deixaria um
  // listener órfão acumulado no canal.
  useEffect(() => window.api.onScanProgress(setProgress), [])

  async function handleAddFolder() {
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
            text: `Conflito com a pasta já cadastrada ${result.existingPath} — uma está dentro da outra, e os arquivos seriam contados duas vezes.`,
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

  const totalFiles = folders.reduce((sum, folder) => sum + folder.totalCount, 0)

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-10 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Configuração inicial</h1>
        <p className="mt-2 text-sm text-slate-400">
          Escolha as pastas onde estão seus vídeos e imagens. O app percorre as subpastas e
          cataloga o que encontrar — nada é movido ou alterado neste passo.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleAddFolder}
              disabled={scanning}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {scanning ? 'Escaneando…' : 'Adicionar pasta de origem'}
            </button>

            {scanning && progress && (
              <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                {progress.filesFound.toLocaleString('pt-BR')} encontrado(s) · {progress.currentDir}
              </p>
            )}
          </div>

          {notice && (
            <p className={`rounded-lg border px-4 py-3 text-sm ${NOTICE_STYLES[notice.kind]}`}>
              {notice.text}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : folders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 px-6 py-16 text-center">
              <p className="text-sm text-slate-400">Nenhuma pasta cadastrada ainda.</p>
              <p className="mt-1 text-xs text-slate-600">
                Vídeos: .mp4 .mov .mkv .avi .webm · Imagens: .jpg .jpeg .png .gif .webp
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {folders.map((folder) => (
                <li
                  key={folder.id}
                  className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{basename(folder.path)}</p>
                    <p className="truncate text-xs text-slate-500" title={folder.path}>
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
                    className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-red-800 hover:bg-red-950/50 hover:text-red-300"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-between border-t border-slate-800 px-10 py-6">
        <p className="text-sm text-slate-500">
          {folders.length === 0
            ? 'Adicione ao menos uma pasta para continuar.'
            : `${folders.length} pasta(s) · ${totalFiles.toLocaleString('pt-BR')} arquivo(s) catalogado(s).`}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={totalFiles === 0 || scanning}
          className="rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400"
        >
          Começar a organizar
        </button>
      </footer>
    </div>
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 font-medium ${className}`}>{children}</span>
}

function basename(fullPath: string): string {
  return fullPath.split('/').filter(Boolean).pop() ?? fullPath
}
