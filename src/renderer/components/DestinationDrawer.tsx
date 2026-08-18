import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import type { DestinationFolder, TreeFolder } from '../../shared/types'

interface DestinationDrawerProps {
  /** Controla a largura (0 ou aberta) — false enquanto a animação de fechar
   *  ainda não terminou e o componente segue montado por causa dela. */
  open: boolean
  filename: string
  /** Muda a cada organização bem-sucedida, com o painel ainda aberto — dispara
   *  uma releitura da lista de destinos pra manter o destaque de "recente"
   *  certo enquanto o usuário organiza vários itens seguidos sem fechar. */
  refreshToken: number
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
 * Painel lateral de organização — ocupa espaço próprio ao lado da mídia (a
 * largura anima de 0 até aberta) em vez de flutuar por cima dela com z-index.
 * Como é um irmão de flexbox do contêiner da mídia, o feed encolhe e reflui
 * sozinho conforme essa largura muda — não há sobreposição para corrigir.
 * Substitui o antigo modal central.
 */
export default function DestinationDrawer({
  open,
  filename,
  refreshToken,
  onOrganize,
  onClose,
}: DestinationDrawerProps) {
  const [destinations, setDestinations] = useState<DestinationFolder[]>([])
  const [roots, setRoots] = useState<DestinationFolder[] | null>(null)
  const [query, setQuery] = useState('')

  const asideRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Recarrega no primeiro render e de novo a cada `refreshToken` — as raízes
  // vêm de novo aqui também, mas isso não perde o estado de expandido/criado
  // de cada nó: cada `TreeNode` é mantido pela `key` (o id da pasta), então o
  // React só atualiza os dados da lista, sem remontar quem já estava aberto.
  useEffect(() => {
    void Promise.all([window.api.listDestinations(), window.api.listRootDestinations()]).then(
      ([flat, rootList]) => {
        setDestinations(flat)
        setRoots(rootList)
      },
    )
  }, [refreshToken])

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
  // registrado é a mais recente da biblioteca inteira. Comparado por path, não
  // por id: um nó da árvore que acabou de ser cadastrado na hora (organizando
  // direto numa subpasta nunca usada antes) tem o id certo só depois de uma
  // releitura que não acontece pra todo nó já expandido — o path nunca muda.
  const mostRecentPath = destinations.find((folder) => folder.lastUsedAt)?.path ?? null

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
      // shrink-0: sem isso o flexbox tentaria encolher o painel junto com a
      // mídia em vez de deixar só a largura animada mandar. overflow-hidden
      // esconde o conteúdo de largura fixa enquanto o invólucro ainda está
      // estreito, no meio da animação de abrir.
      className={`border-line bg-surface/95 h-full shrink-0 overflow-hidden border-l shadow-2xl backdrop-blur-xl transition-[width] duration-[240ms] ease-out ${
        open ? 'w-96 max-w-[90%]' : 'w-0'
      }`}
    >
      {/* Largura fixa própria: o conteúdo não pode espremer/reformatar junto
          com o invólucro animando — só revelar aos poucos conforme ele cresce. */}
      <div className="flex h-full w-96 max-w-[90%] flex-col">
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
              mostRecentPath={mostRecentPath}
              onOrganize={onOrganize}
            />
          ) : (
            <Tree
              roots={roots}
              mostRecentPath={mostRecentPath}
              onOrganize={onOrganize}
              onCreatedRoot={(folder) => setRoots((current) => [...(current ?? []), folder])}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

function SearchResults({
  results,
  query,
  mostRecentPath,
  onOrganize,
}: {
  results: DestinationFolder[]
  query: string
  mostRecentPath: string | null
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
              folder.path === mostRecentPath ? 'bg-accent/10 ring-accent/40 ring-1' : ''
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{folder.name}</span>
              <span className="text-fg-subtle block truncate text-xs" title={folder.path}>
                {folder.path}
              </span>
            </span>
            {folder.path === mostRecentPath && (
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
  mostRecentPath,
  onOrganize,
  onCreatedRoot,
}: {
  roots: DestinationFolder[] | null
  mostRecentPath: string | null
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
            mostRecentPath={mostRecentPath}
            onOrganize={onOrganize}
          />
        ))
      )}
    </div>
  )
}

function TreeNode({
  nodePath,
  name,
  mostRecentPath,
  onOrganize,
}: {
  nodePath: string
  name: string
  mostRecentPath: string | null
  onOrganize: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<TreeFolder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  // Por path, não por id: o id de uma subpasta recém-cadastrada (organizada
  // direto sem nunca ter sido expandida antes) só chegaria aqui numa releitura
  // que não existe para todo nó já aberto — o path, esse nunca muda.
  const isMostRecent = nodePath === mostRecentPath

  async function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    // Sob demanda, sempre lido do disco na hora — é o que mantém a árvore
    // sincronizada com subpastas criadas por fora do app, e evita ler a
    // árvore inteira de uma vez quando uma pasta tem muitos níveis.
    if (next && children === null) {
      setLoading(true)
      setChildren(await window.api.listSubfolders(nodePath))
      setLoading(false)
    }
  }

  return (
    <div>
      {/* A linha inteira é o alvo do clique — organizar não depende de acertar
          o texto do nome. Chevron e "+" ficam por cima e chamam
          stopPropagation, senão cada clique neles também organizaria. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOrganize(nodePath)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOrganize(nodePath)
          }
        }}
        title={nodePath}
        className={`group rounded-control flex w-full cursor-pointer items-center gap-1.5 py-1.5 pr-1.5 pl-1 text-left transition hover:bg-surface-hover ${
          isMostRecent ? 'bg-accent/10 ring-accent/40 ring-1' : ''
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void toggleExpand()
          }}
          aria-label={expanded ? 'Recolher pasta' : 'Expandir pasta'}
          className="text-fg-subtle hover:text-fg shrink-0 rounded p-0.5 transition"
        >
          <Icon
            name="chevron"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        </button>

        <Icon
          name={expanded ? 'folderOpen' : 'folder'}
          className="text-fg-subtle h-4 w-4 shrink-0"
        />

        <span className="min-w-0 flex-1 truncate text-sm text-fg">{name}</span>

        {isMostRecent && (
          <span className="text-accent-hover shrink-0 text-[10px] font-medium">recente</span>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void window.api.openPath(nodePath)
          }}
          title="Abrir no gerenciador de arquivos"
          aria-label="Abrir no gerenciador de arquivos"
          className="text-fg-subtle hover:text-fg shrink-0 rounded p-1 opacity-0 transition group-hover:opacity-100"
        >
          <Icon name="revealInFolder" className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setCreating(true)
          }}
          title="Nova subpasta"
          aria-label="Nova subpasta"
          className="text-fg-subtle hover:text-fg shrink-0 rounded p-1 opacity-0 transition group-hover:opacity-100"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Linha guia: cada nível de profundidade soma sua própria margem +
          borda esquerda, então a linha "empilha" e conecta visualmente pai e
          filhos sem precisar calcular recuo por profundidade na mão. */}
      {(creating || expanded) && (
        <div className="border-line-strong ml-3.5 flex flex-col border-l pl-2.5">
          {creating && (
            <div className="py-1 pr-1">
              <InlineCreateField
                parentPath={nodePath}
                onCreated={(folder) => {
                  setChildren((current) =>
                    [
                      ...(current ?? []),
                      {
                        path: folder.path,
                        name: folder.name,
                        destinationId: folder.id,
                        lastUsedAt: folder.lastUsedAt,
                      },
                    ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
                  )
                  setExpanded(true)
                  setCreating(false)
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}

          {expanded &&
            (loading ? (
              <p className="text-fg-subtle py-1.5 text-xs">Carregando…</p>
            ) : children && children.length > 0 ? (
              children.map((child) => (
                <TreeNode
                  key={child.path}
                  nodePath={child.path}
                  name={child.name}
                  mostRecentPath={mostRecentPath}
                  onOrganize={onOrganize}
                />
              ))
            ) : (
              <p className="text-fg-subtle py-1.5 text-xs">Nenhuma subpasta</p>
            ))}
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
  // Só usado na raiz: subpastas que já existem de verdade dentro da pasta
  // escolhida, pra não obrigar o usuário a redigitar o nome de uma pasta que
  // ele já tem no disco. `null` enquanto carrega.
  const [existing, setExisting] = useState<TreeFolder[] | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const isRoot = parentPath === null

  useEffect(() => {
    if (isRoot) void window.api.organizationRoot().then(setParent)
  }, [isRoot])

  useEffect(() => {
    if (!isRoot || !parent) return
    setExisting(null)
    void window.api.listSubfolders(parent).then((folders) =>
      // As que já têm destinationId já são uma pasta de destino cadastrada —
      // já aparecem na árvore logo abaixo, sugeri-las aqui de novo só
      // duplicaria a raiz ao clicar.
      setExisting(folders.filter((folder) => folder.destinationId === null)),
    )
  }, [isRoot, parent])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** Cria (ou, se já existir no disco, só cadastra) `folderName` dentro de `parent`. */
  async function submit(folderName: string) {
    if (!folderName.trim() || !parent || busy) return
    setBusy(true)
    setError(null)
    const result = await window.api.createDestination(folderName, parent)
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
      {isRoot && existing && existing.length > 0 && (
        <div className="border-line flex flex-col gap-0.5 border-b pb-2">
          <p className="text-fg-subtle px-1 text-[11px] font-medium">Pastas que já existem aqui</p>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
            {existing.map((folder) => (
              <button
                key={folder.path}
                type="button"
                disabled={busy}
                onClick={() => void submit(folder.name)}
                className="rounded-control text-fg hover:bg-surface-hover flex items-center gap-1.5 px-1.5 py-1 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="folder" className="text-fg-subtle h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit(name)
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
          onClick={() => void submit(name)}
          disabled={!name.trim() || busy}
          className="rounded-control bg-accent hover:bg-accent-hover disabled:bg-surface-hover disabled:text-fg-subtle px-2.5 py-1 text-xs font-semibold text-white transition"
        >
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </div>
  )
}
