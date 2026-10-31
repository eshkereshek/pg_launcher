import { StrictMode, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

// Глобальные обработчики ошибок больше не разрушают DOM: показываем ненавязчивое
// уведомление в углу (не чаще раза в 5 секунд) и пишем ошибку в консоль.
let lastErrorNoticeAt = 0

function showErrorNotice(text: string) {
  const now = Date.now()
  if (now - lastErrorNoticeAt < 5000) return
  lastErrorNoticeAt = now

  const notice = document.createElement('div')
  notice.style.cssText = [
    'position: fixed',
    'right: 16px',
    'bottom: 16px',
    'z-index: 100000',
    'max-width: 420px',
    'padding: 10px 12px',
    'background: #1b1b1b',
    'border: 2px solid #f1c40f',
    'box-shadow: 0 4px 14px rgba(0,0,0,0.6)',
    'color: #ddd',
    'font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    'font-size: 12px',
    'line-height: 1.4',
    'word-break: break-word',
    'user-select: text'
  ].join(';')

  const message = document.createElement('div')
  message.style.cssText = 'margin-bottom: 8px; white-space: pre-wrap; max-height: 160px; overflow: auto;'
  message.textContent = text

  const hideBtn = document.createElement('button')
  hideBtn.textContent = translate('ui.hide')
  hideBtn.style.cssText = 'background: #f1c40f; color: #000; border: none; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;'
  hideBtn.onclick = () => notice.remove()

  notice.appendChild(message)
  notice.appendChild(hideBtn)
  document.body.appendChild(notice)
}

window.onerror = function (msg, _url, _lineNo, _columnNo, error) {
  console.error('Uncaught Error:', msg, error)
  showErrorNotice(String(msg) + (error?.stack ? '\n' + error.stack : ''))
  fetch('http://127.0.0.1:33333/error', { method: 'POST', body: msg + '\n' + (error ? error.stack : '') }).catch(() => { });
  return false;
};

window.addEventListener('unhandledrejection', function (event) {
  const reason = event.reason
  const text = reason && reason.stack ? reason.stack : String(reason)
  console.error('Unhandled Promise Rejection:', reason)
  showErrorNotice(translate('app.errorPrefix') + text)
  fetch('http://127.0.0.1:33333/error', { method: 'POST', body: 'Promise Rejection: ' + text }).catch(() => { });
});

import './index.css'
import './settings.css'
import './layout.css'
import './LaunchStatusBar.css'
import './mc-cards.css'
import './accounts.css'
// Ступенчатые углы для панелей, полей и кнопок — подключается последним.
import './pixel-corners.css'

import { LanguageProvider, translate } from './i18n.tsx'
import { Toaster } from './Toasts'
import { initTauriBridge } from './api/tauriBridge'

// Initialize Tauri bridge to supply window.electronAPI
initTauriBridge()

const App = lazy(() => import('./App.tsx'))

function MainWrapper() {
  useEffect(() => {
    document.documentElement.style.backgroundColor = '#151515'
    document.body.style.backgroundColor = '#151515'
  }, [])

  return (
    <Suspense fallback={<div style={{ backgroundColor: '#151515', width: '100%', height: '100%' }} />}>
      <LanguageProvider>
        <div className="launcher-appear-wrap" style={{ backgroundColor: '#151515', position: 'relative', width: '100%', height: '100%' }}>
          <App />
          <Toaster />
        </div>
      </LanguageProvider>
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainWrapper />
  </StrictMode>,
)
