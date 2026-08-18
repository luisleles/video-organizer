import { useEffect, useRef, useState } from 'react'
import type { DestinationFolder } from '../../shared/types'

interface OrganizePanelProps {
  filename: string
  onChoose: (destination: DestinationFolder) => void
  onClose: () => void
}

/** Busca sem acento: digitar "ferias" precisa encontrar "Férias". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function OrganizePanel({ filename, onChoose, onClose }: OrganizePanelProps) {
  const [destinations, setDestinations] = useState<DestinationFolder[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [parentPath, setParentPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([window.api.listDestinations(), window.api.organizationRoot()]).then(
      ([folders, root]) => {
        setDestinations(folders)
        setParentPath(root)
        // Sem pasta nenhuma cadastrada, criar é a única ação possível: já abre
        // no formulário em vez de mostrar uma lista vazia.
        if (folders.length === 0) setCreating(true)
      },
    )
  }, [])

  useEffect(() => {
    // Foco automático para dar pra sair digitando, sem tocar no mouse.
    if (creating) nameRef.current?.focus()
    else searchRef.current?.focus()
  }, [creating])

  const filtered = query
    ? destinations.filter(
        (folder) =>
          normalize(folder.name).includes(normalize(query)) ||
          normalize(folder.path).includes(normalize(query)),
      )
    : destinations

  async function handleChooseParent() {
    const chosen = await window.api.chooseDestinationParent()
    if (chosen) setParentPath(chosen)
  }

  async function handleCreate() {
    setError(null)
    setBusy(true)
    const result = await window.api.createDestination(newName, parentPath)
    setBusy(false)

    switch (result.status) {
      case 'created':
      case 'already-known':
        // Criar já organiza: era esse o objetivo de abrir o painel.
        onChoose(result.folder)
        break
      case 'invalid-name':
        setError(result.message)
        break
      case 'permission-denied':
        setError(`Sem permissão para criar pastas em ${parentPath}`)
        break
      case 'error':
        setError(result.message)
        break
    }
  }

  return (
    <div
      className="animate-fade-in absolute inset-0 z-20 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        // stopPropagation: clicar dentro do painel não pode fechá-lo.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
        className="animate-slide-up mb-8 flex max-h-[75%] w-full max-w-lg flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-2xl"
      >
        <div className="border-b border-line px-5 py-4">
          <p className="text-xs text-fg-subtle">Organizar</p>
          <p className="truncate text-sm font-medium text-fg" title={filename}>
            {filename}
          </p>
        </div>

        {creating ? (
          <div className="flex flex-col gap-4 p-5">
            <div>
              <label className="text-xs font-medium text-fg-muted" htmlFor="nova-pasta">
                Nome da nova pasta
              </label>
              <input
                id="nova-pasta"
                ref={nameRef}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newName.trim() && !busy) void handleCreate()
                }}
                placeholder="Férias 2024"
                className="mt-1.5 w-full rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-fg-muted">Será criada em</p>
              <div className="mt-1.5 flex items-center gap-2">
                <p
                  className="min-w-0 flex-1 truncate rounded-control bg-canvas px-3 py-2 text-xs text-fg-muted"
                  title={parentPath}
                >
                  {parentPath || '…'}
                </p>
                <button
                  type="button"
                  onClick={handleChooseParent}
                  className="shrink-0 rounded-control border border-line-strong px-3 py-2 text-xs text-fg-muted transition hover:border-fg-subtle hover:text-white"
                >
                  Alterar
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-negative">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (destinations.length === 0) onClose()
                  else setCreating(false)
                }}
                className="rounded-control px-4 py-2 text-sm text-fg-muted transition hover:text-fg"
              >
                {destinations.length === 0 ? 'Cancelar' : 'Voltar para a lista'}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || busy}
                className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:bg-surface-hover disabled:text-fg-subtle"
              >
                {busy ? 'Criando…' : 'Criar e mover para cá'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter escolhe o primeiro resultado: fluxo de digitar e sair.
                  if (event.key === 'Enter' && filtered[0]) onChoose(filtered[0])
                }}
                placeholder="Buscar pasta de destino…"
                className="w-full rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto px-4">
              {filtered.length === 0 ? (
                <li className="px-1 py-6 text-center text-sm text-fg-subtle">
                  Nenhuma pasta encontrada para “{query}”.
                </li>
              ) : (
                filtered.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      onClick={() => onChoose(folder)}
                      className="group flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition hover:bg-surface-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{folder.name}</span>
                        <span className="block truncate text-xs text-fg-subtle" title={folder.path}>
                          {folder.path}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-fg-subtle group-hover:text-fg-muted">
                        {folder.lastUsedAt ? 'usada antes' : 'nova'}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="border-t border-line p-4">
              <button
                type="button"
                onClick={() => {
                  setNewName(query)
                  setCreating(true)
                }}
                className="w-full rounded-control border border-dashed border-line-strong px-4 py-2.5 text-sm text-fg-muted transition hover:border-accent hover:text-white"
              >
                + Criar nova pasta
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
