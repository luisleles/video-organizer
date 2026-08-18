import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import type { DestinationFolder, TreeFolder } from '../../shared/types'

interface DestinationDrawerProps {
  filename: string
  /** Clicar num nome (na árvore ou na busca) já organiza — sem confirmação. */
  onOrganize: (destinationPath: string) => void
  onClose: () => void
}

/** Busca sem acento: digitar "ferias" precisa encontrar "Férias". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Painel lateral de organização — desliza da direita, sem cobrir a tela: o
 * item por trás continua visível (e, se for vídeo, continua tocando).
 * Substitui o antigo modal central.
 */
export default function DestinationDrawer({ filename, onOrganize, onClose }: DestinationDrawerProps) {
  const [destinations, setDestinations] = useState<DestinationFolder[]>([])
  const [roots, setRoots] = useState<DestinationFolder[] | null>(null)
  const [query, setQuery] = useState('')

  const asideRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([window.api.listDestinations(), window.api.listRootDestinations()]).then(
      ([flat, rootList]) => {
        setDestinations(flat)
        setRoots(rootList)
      },
    )
  }, [])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // Fecha ao clicar fora do painel. Não é um backdrop cobrindo a tela — um
  // backdrop bloquearia o clique no vídeo por trás, que precisa continuar
  // interativo com o painel aberto.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (asideRef.current && !asideRef.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  // listDestinations já vem ordenada por lastUsedAt desc: a primeira com uso
  // registrado é a mais recente da biblioteca inteira.
  const mostRecentId = destinations.find((folder) => folder.lastUsedAt)?.id ?? null

  const filtered = query
    ? destinations.filter(
        (folder) =>
          normalize(folder.name).includes(normalize(query)) ||
          normalize(folder.path).includes(normalize(query)),
      )
    : []

  return (
    <aside
      ref={asideRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      className="animate-slide-in-right border-line bg-surface/95 absolute top-0 right-0 z-20 flex h-full w-96 max-w-[90%] flex-col border-l shadow-2xl backdrop-blur-xl"
    >
      <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-fg-subtle text-xs">Organizar</p>
          <p className="truncate text-sm font-medium text-fg" title={filename}>
            {filename}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg shrink-0 p-1.5 transition"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filtered[0]) onOrganize(filtered[0].path)
          }}
          placeholder="Buscar pasta de destino…"
          className="rounded-control border-line-strong bg-canvas text-fg placeholder:text-fg-subtle focus:border-accent w-full border px-3 py-2 text-sm outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {query ? (
          <SearchResults
            results={filtered}
            query={query}
            mostRecentId={mostRecentId}
            onOrganize={onOrganize}
          />
        ) : (
          <Tree
            roots={roots}
            mostRecentId={mostRecentId}
            onOrganize={onOrganize}
            onCreatedRoot={(folder) => setRoots((current) => [...(current ?? []), folder])}
          />
        )}
      </div>
    </aside>
  )
}

function SearchResults({
  results,
  query,
  mostRecentId,
  onOrganize,
}: {
  results: DestinationFolder[]
  query: string
  mostRecentId: number | null
  onOrganize: (path: string) => void
}) {
  if (results.length === 0) {
    return (
      <p className="text-fg-subtle px-2 py-6 text-center text-sm">
        Nenhuma pasta encontrada para “{query}”.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {results.map((folder) => (
        <li key={folder.id}>
          <button
            type="button"
            onClick={() => onOrganize(folder.path)}
            className={`rounded-control flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-hover ${
              folder.id === mostRecentId ? 'bg-accent/10 ring-accent/40 ring-1' : ''
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{folder.name}</span>
              <span className="text-fg-subtle block truncate text-xs" title={folder.path}>
                {folder.path}
              </span>
            </span>
            {folder.id === mostRecentId && (
              <span className="text-accent-hover shrink-0 text-[10px] font-medium">recente</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Tree({
  roots,
  mostRecentId,
  onOrganize,
  onCreatedRoot,
}: {
  roots: DestinationFolder[] | null
  mostRecentId: number | null
  onOrganize: (path: string) => void
  onCreatedRoot: (folder: DestinationFolder) => void
}) {
  const [creatingRoot, setCreatingRoot] = useState(false)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-fg-subtle text-xs font-medium">Pastas de destino</p>
        <button
          type="button"
          onClick={() => setCreatingRoot(true)}
          title="Nova pasta de destino"
          aria-label="Nova pasta de destino"
          className="rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg p-1 transition"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>

      {creatingRoot && (
        <div className="px-2 pb-1.5">
          <InlineCreateField
            parentPath={null}
            onCreated={(folder) => {
              onCreatedRoot(folder)
              setCreatingRoot(false)
            }}
            onCancel={() => setCreatingRoot(false)}
          />
        </div>
      )}

      {roots === null ? (
        <p className="text-fg-subtle px-2 py-6 text-center text-sm">Carregando…</p>
      ) : roots.length === 0 && !creatingRoot ? (
        <p className="text-fg-subtle px-2 py-6 text-center text-sm">
          Nenhuma pasta de destino ainda. Use o “+” acima para criar a primeira.
        </p>
      ) : (
        roots.map((folder) => (
          <TreeNode
            key={folder.id}
            nodePath={folder.path}
            name={folder.name}
            destinationId={folder.id}
            mostRecentId={mostRecentId}
            onOrganize={onOrganize}
            depth={0}
          />
        ))
      )}
    </div>
  )
}

function TreeNode({
  nodePath,
  name,
  destinationId,
  mostRecentId,
  onOrganize,
  depth,
}: {
  nodePath: string
  name: string
  destinationId: number | null
  mostRecentId: number | null
  onOrganize: (path: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<TreeFolder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const isMostRecent = destinationId !== null && destinationId === mostRecentId
  const indent = depth * 16 + 4

  async function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    // Sob demanda, sempre lido do disco na hora — é o que mantém a árvore
    // sincronizada com subpastas criadas por fora do app.
    if (next && children === null) {
      setLoading(true)
      setChildren(await window.api.listSubfolders(nodePath))
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        className={`group rounded-control flex items-center gap-1 py-1.5 pr-1.5 transition hover:bg-surface-hover ${
          isMostRecent ? 'bg-accent/10 ring-accent/40 ring-1' : ''
        }`}
        style={{ paddingLeft: indent }}
      >
        <button
          type="button"
          onClick={toggleExpand}
          aria-label={expanded ? 'Recolher pasta' : 'Expandir pasta'}
          className="text-fg-subtle hover:text-fg shrink-0 rounded p-0.5 transition"
        >
          <Icon
            name="chevron"
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>

        <button
          type="button"
          onClick={() => onOrganize(nodePath)}
          className="min-w-0 flex-1 truncate text-left text-sm text-fg"
          title={nodePath}
        >
          {name}
          {isMostRecent && (
            <span className="text-accent-hover ml-2 text-[10px] font-medium">recente</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Nova subpasta"
          aria-label="Nova subpasta"
          className="text-fg-subtle hover:text-fg shrink-0 rounded p-1 opacity-0 transition group-hover:opacity-100"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>

      {creating && (
        <div style={{ paddingLeft: indent + 16 }} className="py-1 pr-2">
          <InlineCreateField
            parentPath={nodePath}
            onCreated={(folder) => {
              setChildren((current) =>
                [
                  ...(current ?? []),
                  { path: folder.path, name: folder.name, destinationId: folder.id, lastUsedAt: folder.lastUsedAt },
                ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
              )
              setExpanded(true)
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {expanded && (
        <div>
          {loading ? (
            <p style={{ paddingLeft: indent + 20 }} className="text-fg-subtle py-1.5 text-xs">
              Carregando…
            </p>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <TreeNode
                key={child.path}
                nodePath={child.path}
                name={child.name}
                destinationId={child.destinationId}
                mostRecentId={mostRecentId}
                onOrganize={onOrganize}
                depth={depth + 1}
              />
            ))
          ) : (
            <p style={{ paddingLeft: indent + 20 }} className="text-fg-subtle py-1.5 text-xs">
              Nenhuma subpasta
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Campo de criação sem modal: aparece embutido na própria árvore. Enter cria;
 * `parentPath` nulo significa "raiz nova" — usa a raiz de organização como
 * sugestão e permite trocar, igual ao fluxo antigo.
 */
function InlineCreateField({
  parentPath,
  onCreated,
  onCancel,
}: {
  parentPath: string | null
  onCreated: (folder: DestinationFolder) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string | null>(parentPath)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const isRoot = parentPath === null

  useEffect(() => {
    if (isRoot) void window.api.organizationRoot().then(setParent)
  }, [isRoot])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleCreate() {
    if (!name.trim() || !parent || busy) return
    setBusy(true)
    setError(null)
    const result = await window.api.createDestination(name, parent)
    setBusy(false)

    switch (result.status) {
      case 'created':
      case 'already-known':
        onCreated(result.folder)
        break
      case 'invalid-name':
        setError(result.message)
        break
      case 'permission-denied':
        setError(`Sem permissão para criar pastas em ${parent}`)
        break
      case 'error':
        setError(result.message)
        break
    }
  }

  async function handleChangeParent() {
    const chosen = await window.api.chooseDestinationParent()
    if (chosen) setParent(chosen)
  }

  return (
    <div className="animate-fade-in rounded-control border-line-strong bg-canvas flex flex-col gap-1.5 border p-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleCreate()
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }}
        placeholder="Nome da pasta"
        disabled={busy}
        className="rounded-control border-line-strong bg-surface text-fg placeholder:text-fg-subtle focus:border-accent w-full border px-2.5 py-1.5 text-sm outline-none"
      />

      {isRoot && (
        <div className="text-fg-subtle flex items-center gap-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate" title={parent ?? undefined}>
            em {parent ?? '…'}
          </span>
          <button
            type="button"
            onClick={handleChangeParent}
            className="text-fg-muted hover:text-fg shrink-0 underline-offset-2 hover:underline"
          >
            Alterar
          </button>
        </div>
      )}

      {error && <p className="text-negative text-xs">{error}</p>}

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control text-fg-muted hover:text-fg px-2 py-1 text-xs transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!name.trim() || busy}
          className="rounded-control bg-accent hover:bg-accent-hover disabled:bg-surface-hover disabled:text-fg-subtle px-2.5 py-1 text-xs font-semibold text-white transition"
        >
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </div>
  )
}
