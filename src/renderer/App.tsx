import { useCallback, useEffect, useState } from 'react'
import LibraryProgress from './components/LibraryProgress'
import NavRail, { type Screen } from './components/NavRail'
import FavoritesScreen from './screens/FavoritesScreen'
import FeedScreen from './screens/FeedScreen'
import ReviewScreen from './screens/ReviewScreen'
import SettingsScreen from './screens/SettingsScreen'
import type { LibraryStats } from '../shared/types'

// Navegação por estado, sem roteador: são três telas e nenhuma URL para
// compartilhar. Quando surgir navegação aninhada, trocar por react-router aqui
// não afeta o resto do código.
//
// O feed é a tela inicial (estilo "Para você" do TikTok) — não há mais uma
// etapa de cadastro obrigatória antes dele. Configurações vira uma tela
// acessória atrás do ícone de engrenagem na rail lateral.
export default function App() {
  const [screen, setScreen] = useState<Screen>('feed')
  const [stats, setStats] = useState<LibraryStats | null>(null)
  // Vive aqui, não dentro do feed: é "global da sessão" de propósito — trocar
  // de tela e voltar não deve resetar pra "tamanho original" no meio do uso.
  const [fitMode, setFitMode] = useState<'original' | 'fill'>('original')
  const toggleFitMode = useCallback(
    () => setFitMode((current) => (current === 'original' ? 'fill' : 'original')),
    [],
  )

  // As estatísticas vivem aqui porque três telas as mostram e duas as alteram.
  // Cada tela recarregando por conta própria daria números divergentes na mesma
  // janela — a barra do topo dizendo 40% e o feed, 45%.
  const refreshStats = useCallback(() => {
    void window.api.libraryStats().then(setStats)
  }, [])

  useEffect(refreshStats, [refreshStats])

  return (
    <div className="bg-canvas text-fg flex h-full flex-col">
      {/* Fita fina no topo da janela: o progresso fica visível inclusive no feed
          em tela cheia, sem roubar espaço da mídia. */}
      <LibraryProgress stats={stats} variant="line" />

      <div className="relative min-h-0 flex-1">
        {/* A rail de navegação (Início, Favoritos, Configurações) fica sobre o
            feed. Em Configurações ela some: a tela já tem seu próprio jeito de
            voltar, no cabeçalho. */}
        {screen !== 'settings' && <NavRail screen={screen} onNavigate={setScreen} />}

        {screen === 'feed' && (
          <FeedScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onOpenSettings={() => setScreen('settings')}
            fitMode={fitMode}
            onToggleFitMode={toggleFitMode}
          />
        )}

        {screen === 'favorites' && (
          <FavoritesScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onOpenSettings={() => setScreen('settings')}
            fitMode={fitMode}
            onToggleFitMode={toggleFitMode}
          />
        )}

        {screen === 'review' && (
          <ReviewScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onOpenSettings={() => setScreen('settings')}
            fitMode={fitMode}
            onToggleFitMode={toggleFitMode}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onBack={() => setScreen('feed')}
          />
        )}
      </div>
    </div>
  )
}
