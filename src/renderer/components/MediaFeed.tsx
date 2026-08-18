import { useCallback, useEffect, useRef, useState } from 'react'
import FeedSkeleton from './FeedSkeleton'
import Icon, { type IconName } from './Icon'
import { percentOrganized } from './LibraryProgress'
import DestinationDrawer from './DestinationDrawer'
import Toast, { type ToastData } from './Toast'
import { toMediaUrl } from '../../shared/media-url'
import type { LibraryStats, MediaFile, OrganizeResult, UndoResult } from '../../shared/types'

interface MediaFeedProps {
  /** `queue` é a fila principal (organizar tira o item da lista); `favorites`
   *  mostra só favoritados e organizar não tira nada daqui — só atualiza o
   *  caminho do arquivo. */
  mode: 'queue' | 'favorites'
  stats: LibraryStats | null
  onStatsChanged: () => void
  /** O que mostrar quando a lista está vazia — cada tela resolve a mensagem certa. */
  emptyState: React.ReactNode
}

/**
 * Quantos itens de cada lado do ativo ficam realmente montados no DOM.
 *
 * Os contêineres de todos os itens existem sempre (é o que dá a altura de scroll
 * correta e alimenta o observer), mas <video> e <img> só são criados perto do
 * ativo: com algumas centenas de arquivos, montar todas as tags de vídeo de uma
 * vez faria o Chromium abrir um decodificador por arquivo e comer a memória toda.
 */
const MOUNT_RADIUS = 1

/** Tempo da animação de saída antes de o item deixar a lista. */
const EXIT_MS = 220

/**
 * O corpo do feed vertical em si — swipe, slides, painel de organização, rail
 * de ações, atalhos de teclado. Compartilhado entre a fila principal e a tela
 * de favoritos: as duas são o mesmo componente, parametrizado por `mode`.
 */
export default function MediaFeed({ mode, stats, onStatsChanged, emptyState }: MediaFeedProps) {
  const [items, setItems] = useState<MediaFile[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [exitingId, setExitingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  // Contador só para dar uma key nova a cada toast e reiniciar o cronômetro dele.
  const toastCounter = useRef(0)

  useEffect(() => {
    setItems(null)
    void (mode === 'queue' ? window.api.listUnorganizedMedia() : window.api.listFavorites()).then(
      setItems,
    )
  }, [mode])

  // Quem está em foco é decidido pelo Intersection Observer, não pela posição do
  // scroll: o observer é o único que sabe a verdade quando o snap ainda está
  // animando, quando a janela é redimensionada, ou quando o item foi alcançado
  // por teclado em vez de scroll.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !items?.length) return

    // A lista encolhe ao organizar; sem cortar o array de refs, o observer
    // tentaria observar nós que já saíram da tela.
    slideRefs.current.length = items.length

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.6) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.index))
          }
        }
      },
      // root é o contêiner de scroll, não a janela — sem isso o observer mediria
      // contra o viewport e nunca dispararia direito dentro de um overflow.
      { root: container, threshold: [0.6] },
    )

    for (const slide of slideRefs.current) {
      if (slide) observer.observe(slide)
    }
    return () => observer.disconnect()
  }, [items])

  const goTo = useCallback((index: number) => {
    const container = containerRef.current
    if (!container) return
    // Não depende de `items` de propósito: é chamado logo depois de mexer na
    // fila, quando o estado ainda não foi aplicado e o tamanho antigo levaria a
    // um limite errado. O próprio navegador corta o excesso de scrollTop.
    container.scrollTo({
      top: Math.max(0, index) * container.clientHeight,
      behavior: 'smooth',
    })
  }, [])

  const showToast = useCallback((data: Omit<ToastData, 'id'>) => {
    toastCounter.current += 1
    setToast({ ...data, id: toastCounter.current })
  }, [])

  /** Tira o item da fila com a animação de saída e reposiciona o foco. */
  const removeActiveItem = useCallback(
    (mediaId: number) =>
      new Promise<void>((resolve) => {
        setExitingId(mediaId)
        setTimeout(() => {
          setItems((current) => {
            if (!current) return current
            const remaining = current.filter((item) => item.id !== mediaId)
            // Se o item removido era o último, o índice ativo passa a apontar
            // para fora da lista — o React renderizaria uma tela em branco.
            setActiveIndex((index) => Math.min(index, Math.max(0, remaining.length - 1)))
            return remaining
          })
          setExitingId(null)
          resolve()
        }, EXIT_MS)
      }),
    [],
  )

  async function handleOrganize(destinationPath: string) {
    const item = items?.[activeIndex]
    if (!item || busy) return

    setDrawerOpen(false)
    setBusy(true)
    const result = await window.api.organizeMedia(item.id, destinationPath)
    setBusy(false)

    if (result.status !== 'moved') {
      handleMoveFailure(result, item)
      return
    }

    onStatsChanged()
    const toastPayload: Omit<ToastData, 'id'> = {
      kind: 'success',
      text: `Movido para ${basename(destinationPath)}`,
      detail: result.wasRenamed
        ? `Já existia um arquivo com esse nome — salvo como ${result.newFilename}`
        : item.filename,
    }

    if (mode === 'queue') {
      const positionBefore = activeIndex
      await removeActiveItem(item.id)
      showToast({
        ...toastPayload,
        action: { label: 'Desfazer', onAction: () => void handleUndo(item, positionBefore) },
      })
    } else {
      // Nos favoritos o item continua na tela — organizar só atualiza onde ele
      // está agora, sem tirar nada daqui (favoritar é independente de organizar).
      updateItemPath(item.id, result.newPath, result.newFilename)
      showToast({
        ...toastPayload,
        action: { label: 'Desfazer', onAction: () => void handleUndo(item, activeIndex) },
      })
    }
  }

  function updateItemPath(mediaId: number, newPath: string, newFilename: string) {
    setItems(
      (current) =>
        current?.map((other) =>
          other.id === mediaId ? { ...other, path: newPath, filename: newFilename } : other,
        ) ?? current,
    )
  }

  async function handleUndo(item: MediaFile, position: number) {
    setToast(null)
    const result = await window.api.undoOrganize(item.id)

    if (result.status !== 'restored') {
      showToast({ kind: 'error', text: undoErrorMessage(result), detail: item.filename })
      return
    }

    const restoredFilename = basename(result.restoredPath)

    if (mode === 'queue') {
      // Devolve o item exatamente onde estava, para o feed não dar um salto.
      setItems((current) => {
        if (!current) return current
        const restored: MediaFile = { ...item, path: result.restoredPath, filename: restoredFilename }
        const next = [...current]
        next.splice(Math.min(position, next.length), 0, restored)
        return next
      })
      setActiveIndex(position)
      // Espera o React pintar a lista com o item de volta antes de rolar até ele;
      // rolar no mesmo tick miraria a lista antiga, que tinha um item a menos.
      requestAnimationFrame(() => goTo(position))
    } else {
      updateItemPath(item.id, result.restoredPath, restoredFilename)
    }

    onStatsChanged()
    showToast({ kind: 'success', text: 'Organização desfeita', detail: item.filename })
  }

  function handleMoveFailure(result: OrganizeResult, item: MediaFile) {
    switch (result.status) {
      case 'source-missing':
        showToast({
          kind: 'error',
          text: 'Este arquivo não está mais no disco',
          detail: 'Ele foi movido ou apagado por fora do app. Tirando da fila.',
        })
        // Insistir com um arquivo que não existe mais só geraria erro de novo.
        void removeActiveItem(item.id)
        break
      case 'permission-denied':
        showToast({
          kind: 'error',
          text: 'Sem permissão para escrever nessa pasta',
          detail: 'Escolha outra pasta de destino ou ajuste as permissões.',
        })
        break
      case 'disk-full':
        showToast({
          kind: 'error',
          text: 'Não há espaço livre no disco de destino',
          detail: 'Libere espaço e tente de novo.',
        })
        break
      case 'error':
        showToast({ kind: 'error', text: 'Não foi possível mover', detail: result.message })
        break
    }
  }

  const handleFavorite = useCallback(async () => {
    const item = items?.[activeIndex]
    if (!item) return

    const nowFavorited = await window.api.toggleFavorite(item.id)

    if (mode === 'favorites' && !nowFavorited) {
      // Saiu da lista de favoritos: some da tela com a mesma animação de saída
      // usada ao organizar na fila principal.
      await removeActiveItem(item.id)
    } else {
      setItems(
        (current) =>
          current?.map((other) =>
            other.id === item.id ? { ...other, favorited: nowFavorited } : other,
          ) ?? current,
      )
    }
  }, [activeIndex, items, mode, removeActiveItem])

  const handleSkip = useCallback(() => {
    // "Pular" é um conceito de fila de trabalho — não faz sentido nos favoritos.
    if (mode !== 'queue' || !items?.length || busy) return

    if (items.length === 1) {
      showToast({ kind: 'error', text: 'Este é o único arquivo na fila' })
      return
    }

    const item = items[activeIndex]!
    const indexBefore = activeIndex
    const wasLast = activeIndex === items.length - 1

    setExitingId(item.id)
    setTimeout(() => {
      // Em dois passos, de propósito.
      //
      // O intuitivo seria remover e reanexar de uma vez, mas o scroll-snap do
      // Chromium mantém o item ancorado grudado: mudá-lo de posição faz o
      // contêiner rolar atrás dele, e o usuário vê o mesmo arquivo de novo.
      //
      // Remover é seguro (não há mais o que seguir) e faz o próximo item ocupar
      // o índice atual; reanexar no fim também é seguro, porque não desloca o
      // item que está ancorado agora.
      setItems((current) => current?.filter((other) => other.id !== item.id) ?? current)
      setExitingId(null)

      if (wasLast) {
        // Estando no fim, o próximo pendente está lá no começo da fila.
        goTo(0)
      } else {
        // Fixa a posição no mesmo índice, que agora contém o item seguinte. Sem
        // isso o contêiner encolhe e o Chromium reposiciona o scroll para trás,
        // fazendo o contador parecer andar ao contrário.
        requestAnimationFrame(() => goTo(indexBefore))
      }

      setTimeout(() => {
        setItems((current) => (current ? [...current, item] : current))
      }, 400)
    }, EXIT_MS)
  }, [activeIndex, busy, goTo, items, mode, showToast])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Com o painel aberto o teclado é dele: digitar "s" na busca não pode
      // pular o item, e as setas não podem rolar o feed por baixo do painel.
      if (drawerOpen) return
      // Mesma proteção para qualquer campo de texto que venha a existir.
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

      switch (event.key) {
        case 'ArrowDown':
          // preventDefault: sem isso o scroll nativo da seta briga com o
          // scrollTo suave e o feed para entre dois itens.
          event.preventDefault()
          goTo(activeIndex + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          goTo(activeIndex - 1)
          break
        case 'o':
        case 'O':
          event.preventDefault()
          setDrawerOpen(true)
          break
        case 's':
        case 'S':
          event.preventDefault()
          handleSkip()
          break
        case 'm':
        case 'M':
          setMuted((current) => !current)
          break
        case 'f':
        case 'F':
          event.preventDefault()
          void handleFavorite()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, drawerOpen, goTo, handleFavorite, handleSkip])

  if (items === null) return <FeedSkeleton />

  if (items.length === 0) return <>{emptyState}</>

  const active = items[activeIndex]

  return (
    <div className="bg-canvas text-fg relative h-full overflow-hidden">
      <div
        ref={containerRef}
        className="no-scrollbar no-scroll-anchor h-full snap-y snap-mandatory overflow-y-scroll"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            data-index={index}
            ref={(element) => {
              slideRefs.current[index] = element
            }}
            // snap-always: sem ele, um giro rápido da roda do mouse atravessa
            // vários itens de uma vez em vez de parar no próximo.
            className={`flex h-full w-full snap-start snap-always items-center justify-center transition duration-200 ${
              exitingId === item.id ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            {Math.abs(index - activeIndex) <= MOUNT_RADIUS ? (
              // O painel lateral não pausa o vídeo: `active` não depende de
              // `drawerOpen` de propósito, a mídia continua tocando atrás dele.
              <Slide file={item} active={index === activeIndex} muted={muted} />
            ) : null}
          </div>
        ))}
      </div>

      {/* Sobreposições: pointer-events-none no container para não bloquear o
          scroll; os botões reativam o clique individualmente. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-card min-w-0 bg-black/60 px-4 py-2.5 backdrop-blur">
            <p className="truncate text-sm font-medium" title={active?.path}>
              {active?.filename}
            </p>
            <p className="text-fg-muted mt-0.5 text-xs">
              {active?.type === 'video' ? 'Vídeo' : 'Imagem'}
            </p>
          </div>

          <div className="rounded-card shrink-0 bg-black/60 px-4 py-2.5 text-sm tabular-nums backdrop-blur">
            {mode === 'queue' ? (
              <>
                <span className="text-accent-hover font-semibold">{percentOrganized(stats)}%</span>
                <span className="text-fg-subtle"> organizado · </span>
                {activeIndex + 1} de {items.length} restantes
              </>
            ) : (
              <>
                {activeIndex + 1} de {items.length}
                <span className="text-fg-subtle"> favoritos</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <NavButton onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>
            <Icon name="arrowUp" />
          </NavButton>
          <NavButton onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === items.length - 1}>
            <Icon name="arrowDown" />
          </NavButton>
        </div>
      </div>

      {/* Barra lateral de ações, no estilo do TikTok. */}
      <div className="pointer-events-none absolute top-1/2 right-6 flex -translate-y-1/2 flex-col items-center gap-4">
        <RailButton
          onClick={() => setDrawerOpen(true)}
          disabled={busy}
          icon="folder"
          label="Organizar"
          hint="O"
          highlighted
        />
        <RailButton
          onClick={() => void handleFavorite()}
          disabled={false}
          icon="heart"
          iconFilled={active?.favorited}
          label={active?.favorited ? 'Favoritado' : 'Favoritar'}
          hint="F"
          tone={active?.favorited ? 'favorite' : undefined}
        />
        {mode === 'queue' && (
          <RailButton onClick={handleSkip} disabled={busy} icon="skip" label="Pular" hint="S" />
        )}
        {active?.type === 'video' && (
          <RailButton
            onClick={() => setMuted((current) => !current)}
            disabled={false}
            icon={muted ? 'volumeOff' : 'volumeOn'}
            label={muted ? 'Sem som' : 'Com som'}
            hint="M"
          />
        )}
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-6">
          <Toast key={toast.id} toast={toast} onDismiss={() => setToast(null)} />
        </div>
      )}

      {drawerOpen && active && (
        <DestinationDrawer
          filename={active.filename}
          onOrganize={handleOrganize}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

function undoErrorMessage(result: UndoResult): string {
  switch (result.status) {
    case 'nothing-to-undo':
      return 'Não há o que desfazer para este arquivo'
    case 'source-missing':
      return 'O arquivo não está mais na pasta de destino'
    case 'permission-denied':
      return 'Sem permissão para devolver o arquivo ao lugar original'
    default:
      return 'Não foi possível desfazer'
  }
}

function basename(fullPath: string): string {
  return fullPath.split('/').filter(Boolean).pop() ?? fullPath
}

function Slide({ file, active, muted }: { file: MediaFile; active: boolean; muted: boolean }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="px-8 text-center">
        <p className="text-fg-muted">Não foi possível abrir este arquivo.</p>
        <p className="text-fg-subtle mt-2 text-xs break-all">{file.path}</p>
      </div>
    )
  }

  return file.type === 'video' ? (
    <VideoSlide file={file} active={active} muted={muted} onFail={() => setFailed(true)} />
  ) : (
    <ImageSlide file={file} onFail={() => setFailed(true)} />
  )
}

function ImageSlide({ file, onFail }: { file: MediaFile; onFail: () => void }) {
  // Aparece só depois de decodificada: sem isso o navegador pinta a imagem
  // linha a linha enquanto carrega, e o feed pisca a cada item.
  const [loaded, setLoaded] = useState(false)

  return (
    <img
      src={toMediaUrl(file.path)}
      alt={file.filename}
      onLoad={() => setLoaded(true)}
      onError={onFail}
      className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
    />
  )
}

function VideoSlide({
  file,
  active,
  muted,
  onFail,
}: {
  file: MediaFile
  active: boolean
  muted: boolean
  onFail: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  // O React não reflete `muted` como atributo do DOM — passar muted={muted} no
  // JSX não tem efeito depois da primeira renderização. Tem que ser propriedade.
  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = muted
  }, [muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (active) {
      // play() devolve uma Promise que rejeita se o vídeo sair de vista antes de
      // começar (scroll rápido). É esperado, não é erro: engolir sem barulho.
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [active])

  return (
    <video
      ref={videoRef}
      src={toMediaUrl(file.path)}
      loop
      playsInline
      // Só metadados: com preload="auto" o Chromium começaria a baixar os
      // vizinhos inteiros, e o feed engasgaria em arquivos grandes.
      preload="metadata"
      onLoadedData={() => setReady(true)}
      onError={onFail}
      className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${
        ready ? 'opacity-100' : 'opacity-0'
      }`}
    />
  )
}

function RailButton({
  onClick,
  disabled,
  icon,
  iconFilled,
  label,
  hint,
  highlighted,
  tone,
}: {
  onClick: () => void
  disabled: boolean
  icon: IconName
  iconFilled?: boolean
  label: string
  hint: string
  highlighted?: boolean
  tone?: 'favorite'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (tecla ${hint})`}
      className="pointer-events-auto flex w-16 flex-col items-center gap-1 transition disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full text-xl backdrop-blur transition ${
          highlighted
            ? 'bg-accent/90 hover:bg-accent-hover hover:scale-105'
            : 'bg-black/60 hover:bg-black/80 hover:scale-105'
        } ${tone === 'favorite' ? 'text-negative' : ''}`}
      >
        <Icon name={icon} filled={iconFilled} className="h-6 w-6" />
      </span>
      <span className="text-fg-muted text-[11px] font-medium">{label}</span>
    </button>
  )
}

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}
