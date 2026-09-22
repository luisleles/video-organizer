import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredTheme } from './theme'
import './index.css'

// Antes do primeiro render: se isso rodasse dentro de um efeito do React, a
// primeira pintura ainda usaria o tema padrão (escuro) e só depois trocaria
// pro claro, gerando um flash visível.
applyTheme(getStoredTheme())

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado em index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
