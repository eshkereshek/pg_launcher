import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

window.onerror = function (msg, _url, _lineNo, _columnNo, error) {
  document.body.innerHTML = '<div style="color: red; padding: 20px; background: white; z-index: 9999; position: absolute; top:0; left:0; width: 100%; height: 100%; overflow: auto;"><h2>Uncaught Error</h2>' + msg + '<br/><pre>' + (error ? error.stack : '') + '</pre></div>';
  fetch('http://127.0.0.1:33333/error', { method: 'POST', body: msg + '\n' + (error ? error.stack : '') }).catch(() => { });
  return false;
};

window.addEventListener('unhandledrejection', function (event) {
  document.body.innerHTML = '<div style="color: red; padding: 20px; background: white; z-index: 9999; position: absolute; top:0; left:0; width: 100%; height: 100%; overflow: auto;"><h2>Unhandled Promise Rejection</h2><pre>' + (event.reason && event.reason.stack ? event.reason.stack : event.reason) + '</pre></div>';
  fetch('http://127.0.0.1:33333/error', { method: 'POST', body: 'Promise Rejection: ' + (event.reason && event.reason.stack ? event.reason.stack : event.reason) }).catch(() => { });
});

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
