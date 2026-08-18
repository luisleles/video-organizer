import { useCallback, useEffect, useState } from 'react'
import LibraryProgress from './components/LibraryProgress'
import FeedScreen from './screens/FeedScreen'
import SettingsScreen from './screens/SettingsScreen'
import SetupScreen from './screens/SetupScreen'
import type { LibraryStats } from '../shared/types'

type Screen = 'setup' | 'feed' | 'settings'

// Navegação por estado, sem roteador: são três telas e nenhuma URL para
// compartilhar. Quando surgir navegação aninhada, trocar por react-router aqui
// não afeta o resto do código.
export default function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [stats, setStats] = useState<LibraryStats | null>(null)

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

      <div className="min-h-0 flex-1">
        {screen === 'setup' && (
          <SetupScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onStart={() => setScreen('feed')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}

        {screen === 'feed' && (
          <FeedScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onBack={() => setScreen('setup')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            stats={stats}
            onStatsChanged={refreshStats}
            onBack={() => setScreen('setup')}
          />
        )}
      </div>
    </div>
  )
}
