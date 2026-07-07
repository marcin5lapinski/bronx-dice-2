import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/components.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { preloadDiceFaces } from './utils/diceAssets'

preloadDiceFaces()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
