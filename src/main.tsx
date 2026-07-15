import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './settings.css'
import './layout.css'
import './mc-cards.css'
import App from './App.tsx'

import { LanguageProvider } from './i18n.tsx'

import { useState, useEffect } from 'react'
import InstallerApp from './InstallerApp'

function MainWrapper() {
  const [isInstaller, setIsInstaller] = useState<boolean | null>(null)

  useEffect(() => {
    // @ts-ignore
    window.electronAPI.isInstaller().then(setIsInstaller)
  }, [])

  if (isInstaller === null) return <div style={{ backgroundColor: '#1e222d', width: '100vw', height: '100vh' }} />
  
  if (isInstaller) {
    return <InstallerApp />
  }

  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainWrapper />
  </StrictMode>,
)
