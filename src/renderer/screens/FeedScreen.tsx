import { useCallback, useEffect, useRef, useState } from 'react'
import { toMediaUrl } from '../../shared/media-url'
import type { MediaFile } from '../../shared/types'

interface FeedScreenProps {
  onBack: () => void
}

/**
 * Quantos itens de cada lado do ativo ficam realmente montados no DOM.
 *
 * Os contêineres de todos os itens existem sempre (é o que dá a altura de scroll
 * correta e alimenta o observer), mas <video> e <img> só são criados perto do
 * ativo: com algumas centenas de arquivos, montar todas as tags de vídeo de uma
 * vez faria o Chromium abrir um decodificador por arquivo e comer a memória toda.
 * Manter 1 de cada lado deixa o vizinho pré-carregado antes de você chegar nele.
 */
const MOUNT_RADIUS = 1

export default function FeedScreen({ onBack }: FeedScreenProps) {
  const [items, setItems] = useState<MediaFile[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    void window.api.listUnorganizedMedia().then(setItems)
  }, [])

  // Quem está em foco é decidido pelo Intersection Observer, não pela posição do
  // scroll: o observer é o único que sabe a verdade quando o snap ainda está
  // animando, quando a janela é redimensionada, ou quando o item foi alcançado
  // por teclado em vez de scroll.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !items?.length) return

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

  const goTo = useCallback(
    (index: number) => {
      const container = containerRef.current
      if (!container || !items?.length) return
      const target = Math.max(0, Math.min(index, items.length - 1))
      // Rolar o contêiner (em vez de scrollIntoView) mantém o controle do snap
      // com o CSS e evita que a página inteira role junto.
      container.scrollTo({ top: target * container.clientHeight, behavior: 'smooth' })
    },
    [items],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
        case 'm':
          setMuted((current) => !current)
          break
        case 'Escape':
          onBack()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, goTo, onBack])

  if (items === null) {
    return <Centered>Carregando…</Centered>
  }

  if (items.length === 0) {
    return (
      <Centered>
        <p className="text-slate-400">Nada para organizar por aqui.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          Voltar para a configuração
        </button>
      </Centered>
    )
  }

  const active = items[activeIndex]

  return (
    <div className="relative h-full overflow-hidden bg-black text-white">
      <div
        ref={containerRef}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll"
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
            className="flex h-full w-full snap-start snap-always items-center justify-center"
          >
            {Math.abs(index - activeIndex) <= MOUNT_RADIUS ? (
              <Slide file={item} active={index === activeIndex} muted={muted} />
            ) : null}
          </div>
        ))}
      </div>

      {/* Sobreposições: pointer-events-none no container para não bloquear o
          scroll; os botões reativam o clique individualmente. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 rounded-xl bg-black/60 px-4 py-2.5 backdrop-blur">
            <p className="truncate text-sm font-medium" title={active?.path}>
              {active?.filename}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {active?.type === 'video' ? 'Vídeo' : 'Imagem'}
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-black/60 px-4 py-2.5 text-sm tabular-nums backdrop-blur">
            {activeIndex + 1} de {items.length} restantes
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto rounded-lg bg-black/60 px-4 py-2 text-xs text-slate-300 backdrop-blur transition hover:text-white"
          >
            Voltar (Esc)
          </button>

          <div className="flex items-center gap-2">
            {active?.type === 'video' && (
              <button
                type="button"
                onClick={() => setMuted((current) => !current)}
                title="Atalho: M"
                className="pointer-events-auto rounded-full bg-black/60 px-4 py-2.5 text-sm backdrop-blur transition hover:bg-black/80"
              >
                {muted ? '🔇 Sem som' : '🔊 Com som'}
              </button>
            )}

            <NavButton onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0}>
              ↑
            </NavButton>
            <NavButton
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === items.length - 1}
            >
              ↓
            </NavButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide({ file, active, muted }: { file: MediaFile; active: boolean; muted: boolean }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="px-8 text-center">
        <p className="text-slate-300">Não foi possível abrir este arquivo.</p>
        <p className="mt-2 text-xs break-all text-slate-600">{file.path}</p>
      </div>
    )
  }

  return file.type === 'video' ? (
    <VideoSlide file={file} active={active} muted={muted} onFail={() => setFailed(true)} />
  ) : (
    <img
      src={toMediaUrl(file.path)}
      alt={file.filename}
      onError={() => setFailed(true)}
      className="max-h-full max-w-full object-contain"
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
      // Volta ao início para que o item sempre comece do zero ao reaparecer.
      video.currentTime = 0
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
      onError={onFail}
      className="max-h-full max-w-full object-contain"
    />
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-black text-sm text-slate-400">
      {children}
    </div>
  )
}
