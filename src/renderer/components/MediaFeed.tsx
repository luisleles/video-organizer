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
  /** "Tamanho original" (contain) ou "Preencher tela" (cover) — controlado de
   *  fora (App.tsx): é global da navegação do feed, não por item. */
  fitMode: 'original' | 'fill'
  onToggleFitMode: () => void
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
 * Tempo da transição de largura do painel lateral — precisa bater com a
 * duração `duration-[240ms]` no CSS do próprio painel, porque o desmonte só
 * acontece depois que a animação de fechar termina.
 */
const DRAWER_TRANSITION_MS = 240

/**
 * O corpo do feed vertical em si — swipe, slides, painel de organização, rail
 * de ações, atalhos de teclado. Compartilhado entre a fila principal e a tela
 * de favoritos: as duas são o mesmo componente, parametrizado por `mode`.
 */
export default function MediaFeed({
  mode,
  stats,
  onStatsChanged,
  fitMode,
  onToggleFitMode,
  emptyState,
}: MediaFeedProps) {
  const [items, setItems] = useState<MediaFile[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  // `drawerMounted` controla se o painel existe no DOM; `drawerVisible` controla
  // a largura (0 ou aberta). Precisam ser dois estados porque fechar precisa
  // animar antes de desmontar — ver closeDrawer.
  const [drawerMounted, setDrawerMounted] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)
  // Incrementado a cada organização bem-sucedida — o painel usa isso pra saber
  // quando recarregar a lista de destinos e atualizar o destaque de "recente"
  // sem precisar fechar e reabrir (ver o comentário em handleOrganize).
  const [destinationsVersion, setDestinationsVersion] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exitingId, setExitingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  // A área da mídia inteira (slides + pílulas + rail de ações), não só o
  // <video>/<img>: é isso que entra em tela cheia — ver toggleFullscreen.
  const mediaAreaRef = useRef<HTMLDivElement>(null)
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

  const openDrawer = useCallback(() => {
    setDrawerMounted(true)
    // Dois requestAnimationFrame, de propósito: o primeiro garante que o
    // navegador pintou o painel na largura 0 pelo menos uma vez antes de
    // aplicar a largura final — só assim a transição de CSS anima em vez de
    // saltar direto pro tamanho aberto.
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawerVisible(true)))
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
    // Só desmonta depois que a transição de largura termina — desmontar na
    // hora cortaria a animação de fechar pela metade.
    setTimeout(() => setDrawerMounted(false), DRAWER_TRANSITION_MS)
  }, [])

  // Tela cheia da área da mídia (slides + rail de ações), não da janela nem do
  // documento inteiro: a árvore de destino e a rail de navegação ficam de fora
  // de propósito, mas organizar, favoritar, seek e zoom continuam dentro do
  // elemento que vai pra tela cheia, então continuam visíveis e funcionando.
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement != null)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void mediaAreaRef.current?.requestFullscreen().catch(() => {})
    }
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

    // O painel fica aberto de propósito: o objetivo é dar pra organizar vários
    // itens seguidos sem reabrir. Só fecha pelo X, clique fora ou Escape.
    setBusy(true)
    const result = await window.api.organizeMedia(item.id, destinationPath)
    setBusy(false)

    if (result.status !== 'moved') {
      handleMoveFailure(result, item)
      return
    }

    onStatsChanged()
    // A pasta usada agora precisa aparecer como "recente" se o usuário for
    // organizar o próximo item na sequência, sem fechar e reabrir o painel.
    setDestinationsVersion((version) => version + 1)
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

  /** Funciona tanto pro item ainda na origem quanto já organizado: os dois
   *  casos são só `active.path` apontando pra um lugar diferente. */
  const handleShowInFolder = useCallback(() => {
    const item = items?.[activeIndex]
    if (item) void window.api.showItemInFolder(item.path)
  }, [activeIndex, items])

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
      // O painel fica aberto enquanto o usuário navega pelo feed — só o campo
      // de busca (ou o de criar pasta) dentro dele precisa roubar o teclado;
      // as setas, por exemplo, continuam trocando de item com o painel aberto.
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
          openDrawer()
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
        case 'r':
        case 'R':
          event.preventDefault()
          handleShowInFolder()
          break
        case 'p':
        case 'P':
          event.preventDefault()
          onToggleFitMode()
          break
        case 'Escape':
          // O navegador já sai da tela cheia sozinho com Esc; isso aqui é só
          // para garantir, sem depender desse comportamento nativo. O painel
          // tem seu próprio onKeyDown para Escape (chama stopPropagation), que
          // roda primeiro e impede este case de fechar a tela cheia junto.
          if (document.fullscreenElement) void document.exitFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeIndex,
    goTo,
    handleFavorite,
    handleShowInFolder,
    handleSkip,
    onToggleFitMode,
    openDrawer,
  ])

  if (items === null) return <FeedSkeleton />

  if (items.length === 0) return <>{emptyState}</>

  const active = items[activeIndex]

  return (
    <div className="bg-canvas text-fg relative h-full overflow-hidden">
      {/* Linha em vez de pilha de absolutos: o painel lateral é um irmão de
          flex, não uma sobreposição. Assim ele empurra a área da mídia em vez
          de cobri-la — a transição de largura de um reflui suavemente no
          outro, de graça, porque é o próprio flexbox recalculando a cada
          quadro enquanto a largura do painel anima. */}
      <div className="flex h-full">
        {/* bg-canvas explícito: em tela cheia este elemento passa a ser
            renderizado sozinho (sem o pai que hoje dá o fundo), e sem uma cor
            própria o Chromium mostraria o fundo padrão de tela cheia em vez do
            "preto" (quase-preto) consistente com o resto do app. */}
        <div ref={mediaAreaRef} className="bg-canvas relative h-full min-w-0 flex-1">
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
                  // O painel lateral não pausa o vídeo nem some com ele: `active`
                  // não depende do painel de propósito, a mídia continua tocando
                  // ao lado dele.
                  <Slide
                    file={item}
                    active={index === activeIndex}
                    muted={muted}
                    fitMode={fitMode}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                  />
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
                    <span className="text-accent-hover font-semibold">
                      {percentOrganized(stats)}%
                    </span>
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
              <NavButton
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex === items.length - 1}
              >
                <Icon name="arrowDown" />
              </NavButton>
            </div>
          </div>

          {/* Barra lateral de ações, no estilo do TikTok. */}
          <div className="pointer-events-none absolute top-1/2 right-6 flex -translate-y-1/2 flex-col items-center gap-4">
            <RailButton
              onClick={openDrawer}
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
            <RailButton
              onClick={handleShowInFolder}
              disabled={false}
              icon="revealInFolder"
              label="Ver na pasta"
              hint="R"
            />
            <RailButton
              onClick={onToggleFitMode}
              disabled={false}
              icon="frame"
              iconFilled={fitMode === 'fill'}
              label={fitMode === 'fill' ? 'Preenchido' : 'Tamanho original'}
              hint="P"
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
        </div>

        {drawerMounted && active && (
          <DestinationDrawer
            open={drawerVisible}
            filename={active.filename}
            refreshToken={destinationsVersion}
            onOrganize={handleOrganize}
            onClose={closeDrawer}
          />
        )}
      </div>
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

/** `95` -> `"01:35"` (MM:SS). Sem hora: os vídeos deste app não chegam perto disso. */
function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00'
  const whole = Math.floor(totalSeconds)
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function Slide({
  file,
  active,
  muted,
  fitMode,
  isFullscreen,
  onToggleFullscreen,
}: {
  file: MediaFile
  active: boolean
  muted: boolean
  fitMode: 'original' | 'fill'
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="px-8 text-center">
        <p className="text-fg-muted">Não foi possível abrir este arquivo.</p>
        <p className="text-fg-subtle mt-2 text-xs break-all">{file.path}</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {file.type === 'video' ? (
        <VideoSlide
          file={file}
          active={active}
          muted={muted}
          fitMode={fitMode}
          onFail={() => setFailed(true)}
        />
      ) : (
        <ImageSlide file={file} active={active} fitMode={fitMode} onFail={() => setFailed(true)} />
      )}

      {/* Canto vazio desde que o botão "Voltar" saiu do overlay — não briga
          com a pílula do topo, com a rail de ações nem com a barra de seek. */}
      <button
        type="button"
        onClick={onToggleFullscreen}
        onPointerDown={(event) => event.stopPropagation()}
        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        className="absolute bottom-6 left-6 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80"
      >
        <Icon name={isFullscreen ? 'compress' : 'expand'} className="h-4 w-4" />
      </button>
    </div>
  )
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.5

function ImageSlide({
  file,
  active,
  fitMode,
  onFail,
}: {
  file: MediaFile
  active: boolean
  fitMode: 'original' | 'fill'
  onFail: () => void
}) {
  // Aparece só depois de decodificada: sem isso o navegador pinta a imagem
  // linha a linha enquanto carrega, e o feed pisca a cada item.
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)

  // "Trocar de item" é isto: sempre que esta imagem volta a ser a ativa (seja
  // porque acabou de entrar no radar de montagem, seja porque o usuário voltou
  // rolando pra ela), o zoom começa do zero — não persiste de uma visita à
  // imagem para a próxima.
  useEffect(() => {
    if (active) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [active])

  function clampPan(nextPan: { x: number; y: number }, z: number) {
    // Não é um cálculo exato dos limites reais da imagem (dependeria de medir
    // o retângulo renderizado, que muda com o fit escolhido) — é uma margem
    // generosa que cresce com o zoom, só para não deixar arrastar a imagem
    // pra bem longe da tela.
    const maxOffset = (z - 1) * 160
    return {
      x: Math.min(maxOffset, Math.max(-maxOffset, nextPan.x)),
      y: Math.min(maxOffset, Math.max(-maxOffset, nextPan.y)),
    }
  }

  // Só usa a forma funcional do setState (nunca lê `zoom`/`pan` do escopo por
  // fora): assim esta função continua correta mesmo chamada a partir de um
  // listener nativo registrado uma vez só (ver useEffect logo abaixo), sem
  // depender de capturar o valor mais recente de `zoom` num closure.
  function applyZoom(change: number | ((current: number) => number)) {
    setZoom((current) => {
      const nextZoom = typeof change === 'function' ? change(current) : change
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      setPan((currentPan) => (clamped === 1 ? { x: 0, y: 0 } : clampPan(currentPan, clamped)))
      return clamped
    })
  }

  // Listener nativo, não o onWheel sintético do React: o React registra wheel
  // como passivo por padrão, e nesse modo preventDefault() é ignorado — o
  // Ctrl+scroll continuaria navegando o feed em vez de só dar zoom na imagem.
  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return

    function handleWheel(event: WheelEvent) {
      // Sem o modificador, o scroll é do feed (trocar de item) — só
      // intercepta com Ctrl, senão rolar a roda numa imagem nunca navegaria.
      if (!event.ctrlKey) return
      event.preventDefault()
      applyZoom((current) => current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

  function handlePointerDown(event: React.PointerEvent<HTMLImageElement>) {
    // Clicar na própria mídia nunca deve fechar o painel lateral — vale mesmo
    // sem zoom, quando o clique não inicia arraste nenhum (early return abaixo).
    event.stopPropagation()
    if (zoom <= 1) return
    setDragging(true)
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLImageElement>) {
    if (!dragging) return
    const dx = event.clientX - dragStart.current.pointerX
    const dy = event.clientY - dragStart.current.pointerY
    setPan(clampPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy }, zoom))
  }

  function handlePointerUp(event: React.PointerEvent<HTMLImageElement>) {
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <img
        src={toMediaUrl(file.path)}
        alt={file.filename}
        onLoad={() => setLoaded(true)}
        onError={onFail}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        className={`transition-opacity duration-300 ${
          fitMode === 'fill' ? 'h-full w-full object-cover' : 'max-h-full max-w-full object-contain'
        } ${loaded ? 'opacity-100' : 'opacity-0'} ${
          zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
      />

      {/* Controles de zoom — só existem pra imagem; vídeo já tem seek/pausa.
          Empilhados sobre o botão de tela cheia (mesmo canto), não no centro
          embaixo: ali é onde o toast de organizar aparece. stopPropagation no
          contêiner cobre os três botões de uma vez: nenhum deve fechar o
          painel lateral ao ser clicado. */}
      <div
        className="pointer-events-none absolute bottom-20 left-6 flex items-center gap-1.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => applyZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          title="Diminuir zoom"
          aria-label="Diminuir zoom"
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="zoomOut" className="h-4 w-4" />
        </button>

        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => applyZoom(1)}
            title="Redefinir zoom"
            aria-label="Redefinir zoom"
            className="pointer-events-auto rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium tabular-nums text-white/90 backdrop-blur transition hover:bg-black/80"
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

        <button
          type="button"
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          title="Aumentar zoom"
          aria-label="Aumentar zoom"
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="zoomIn" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Quanto tempo o ícone de play/pause fica visível no centro antes de sumir. */
const PLAYBACK_FEEDBACK_MS = 650

function VideoSlide({
  file,
  active,
  muted,
  fitMode,
  onFail,
}: {
  file: MediaFile
  active: boolean
  muted: boolean
  fitMode: 'original' | 'fill'
  onFail: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Ícone de play/pause que pisca no centro ao clicar no vídeo. `key` força um
  // ícone novo a cada clique, mesmo clicando duas vezes seguidas no mesmo estado.
  const [feedback, setFeedback] = useState<{ icon: 'play' | 'pause'; key: number } | null>(null)
  const feedbackCounter = useRef(0)
  // Só true quando o próprio usuário pausou clicando no vídeo — usado para a
  // transição de tela cheia saber se deve retomar a reprodução depois (ver
  // o efeito de fullscreenchange logo abaixo).
  const manuallyPausedRef = useRef(false)

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
      manuallyPausedRef.current = false
    } else {
      video.pause()
    }
    // Só depende de `active` de propósito: reentrar num item sempre retoma a
    // reprodução, mesmo que o usuário tivesse pausado manualmente antes de
    // rolar pra outro — pausar/retomar por clique não deve mexer aqui.
  }, [active])

  // Entrar ou sair da tela cheia redimensiona a janela inteira, e em alguns
  // ambientes isso interrompe a reprodução como efeito colateral do próprio
  // navegador (sem relação com o clique de pausar) — às vezes só depois que o
  // redimensionamento de verdade termina, que pode demorar mais que o próprio
  // evento de fullscreenchange. Por isso várias tentativas espaçadas em vez de
  // uma só: cada `play()` extra num vídeo que já está tocando não custa nada.
  // Só se quem pausou foi essa transição — um pause manual do usuário continua
  // valendo.
  useEffect(() => {
    const RETRY_DELAYS_MS = [0, 300, 800, 1600, 2500]
    let retryTimers: ReturnType<typeof setTimeout>[] = []

    function handleFullscreenChange() {
      const video = videoRef.current
      if (!video || !active || manuallyPausedRef.current) return
      for (const timer of retryTimers) clearTimeout(timer)
      retryTimers = RETRY_DELAYS_MS.map((delay) =>
        setTimeout(() => void videoRef.current?.play().catch(() => {}), delay),
      )
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      for (const timer of retryTimers) clearTimeout(timer)
    }
  }, [active])

  // Some sozinho, e não via onAnimationEnd: assim o ícone é removido mesmo
  // se o usuário tiver "prefers-reduced-motion" ligado (a animação de CSS é
  // desativada nesse caso, mas o estado ainda precisa ser limpo).
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), PLAYBACK_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [feedback])

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    const wasPaused = video.paused
    if (wasPaused) void video.play().catch(() => {})
    else video.pause()
    manuallyPausedRef.current = !wasPaused

    feedbackCounter.current += 1
    setFeedback({ icon: wasPaused ? 'play' : 'pause', key: feedbackCounter.current })
  }

  function ratioFromClientX(clientX: number): number {
    const bar = barRef.current
    if (!bar || bar.clientWidth === 0) return 0
    const rect = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  function seekTo(ratio: number) {
    const video = videoRef.current
    if (!video || !duration) return
    const time = ratio * duration
    video.currentTime = time
    setCurrentTime(time)
  }

  function handleBarPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Sem isso o clique na barra também dispararia o pausar/retomar do vídeo
    // por baixo dela — são duas ações distintas na mesma região da tela.
    event.stopPropagation()
    setDragging(true)
    barRef.current?.setPointerCapture(event.pointerId)
    seekTo(ratioFromClientX(event.clientX))
  }

  function handleBarPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    seekTo(ratioFromClientX(event.clientX))
  }

  function handleBarPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    setDragging(false)
    barRef.current?.releasePointerCapture(event.pointerId)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    // Clicar em qualquer ponto do vídeo pausa/retoma — a barra de seek fica
    // por cima e chama stopPropagation, então não aciona isso também. O
    // stopPropagation aqui é no pointerdown, não no click: o painel lateral
    // fecha ao ouvir pointerdown fora de si, que dispara antes do click —
    // sem isso, clicar no vídeo fecharia o painel antes de pausar/retomar.
    <div
      className="relative flex h-full w-full items-center justify-center"
      onClick={togglePlayback}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={toMediaUrl(file.path)}
        loop
        playsInline
        // Só metadados: com preload="auto" o Chromium começaria a baixar os
        // vizinhos inteiros, e o feed engasgaria em arquivos grandes.
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          // Enquanto arrasta, o tempo já está sendo escrito pelo próprio
          // arrasto — deixar o evento nativo escrever por cima brigaria com o
          // dedo do usuário e a barra tremeria.
          if (!dragging) setCurrentTime(event.currentTarget.currentTime)
        }}
        onLoadedData={() => setReady(true)}
        onError={onFail}
        className={`transition-opacity duration-300 ${
          fitMode === 'fill' ? 'h-full w-full object-cover' : 'max-h-full max-w-full object-contain'
        } ${ready ? 'opacity-100' : 'opacity-0'}`}
      />

      {feedback && (
        <div
          key={feedback.key}
          className="animate-icon-flash pointer-events-none absolute flex h-16 w-16 items-center justify-center rounded-full bg-black/50"
        >
          <Icon name={feedback.icon} filled className="h-7 w-7 text-white" />
        </div>
      )}

      {/* Grupo nomeado (não o `group` genérico, pra não colidir com outro uso
          por aí): o rótulo de tempo mora fora da faixa de clique da barra, mas
          precisa reagir ao hover dela mesmo assim. */}
      <div className="group/seek absolute inset-x-0 bottom-0">
        {/* Discreto por padrão — só "aparece de verdade" ao arrastar (estado,
            não CSS, porque o ponteiro pode sair da faixa durante o arrasto) ou
            ao passar o mouse por cima (hover, para quem não está arrastando). */}
        <div
          className={`pointer-events-none flex justify-center pb-1.5 transition-opacity duration-150 ${
            dragging ? 'opacity-100' : 'opacity-40 group-hover/seek:opacity-100'
          }`}
        >
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Fina e discreta como no TikTok; a faixa de clique é mais alta que a
            barra visível só para dar um alvo confortável de mirar/arrastar. */}
        <div
          ref={barRef}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          className="touch-none flex h-4 cursor-pointer items-end"
        >
          <div className="h-1 w-full bg-white/25">
            <div className="h-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
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
      // O painel lateral fecha ao detectar pointerdown fora de si — sem isto,
      // esse mesmo clique já teria borbulhado até lá antes do onClick disparar,
      // fechando o painel em vez de (só) executar a ação do botão.
      onPointerDown={(event) => event.stopPropagation()}
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
      onPointerDown={(event) => event.stopPropagation()}
      disabled={disabled}
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg backdrop-blur transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}
