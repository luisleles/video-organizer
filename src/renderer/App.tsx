import { useState } from 'react'
import FeedScreen from './screens/FeedScreen'
import SetupScreen from './screens/SetupScreen'

type Screen = 'setup' | 'feed'

// Navegação por estado, sem roteador: são duas telas e nenhuma URL para
// compartilhar. Quando surgir uma terceira tela ou navegação aninhada, trocar
// por react-router aqui não afeta o resto do código.
export default function App() {
  const [screen, setScreen] = useState<Screen>('setup')

  return screen === 'setup' ? (
    <SetupScreen onStart={() => setScreen('feed')} />
  ) : (
    <FeedScreen onBack={() => setScreen('setup')} />
  )
}
