import { StrictMode, useState, useEffect, lazy, Suspense } from 'react'
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

import { LanguageProvider } from './i18n.tsx'
import InstallerApp from './InstallerApp'

const App = lazy(() => import('./App.tsx'))

function MainWrapper() {
  // @ts-ignore
  const initialSync = window.electronAPI?.isInstallerSync ? window.electronAPI.isInstallerSync() : null
  const [isInstaller, setIsInstaller] = useState<boolean | null>(initialSync)

  useEffect(() => {
    if (isInstaller === null) {
      // @ts-ignore
      window.electronAPI?.isInstaller?.().then((res: boolean) => setIsInstaller(res)).catch(() => setIsInstaller(false))
    }
  }, [isInstaller])

  if (isInstaller === null) return <div style={{ backgroundColor: '#1e222d', width: '100vw', height: '100vh' }} />

  if (isInstaller) {
    return <InstallerApp />
  }

  return (
    <Suspense fallback={<div style={{ backgroundColor: '#1e222d', width: '100vw', height: '100vh' }} />}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainWrapper />
  </StrictMode>,
)
