import React, { useEffect, useState } from 'react'
import { useTranslation } from './i18n'
import './toasts.css'

export type ToastKind = 'ok' | 'error' | 'info'

export interface ToastItem {
  id: number
  text: string
  kind: ToastKind
}

/**
 * Короткие уведомления вместо window.alert(): нативный диалог WebView2
 * блокирует страницу, выглядит как браузерная ошибка и не перекрашивается
 * темой лаунчера. Сюда приходят уже переведённые тексты — перевод делает
 * вызывающая сторона, чтобы список тостов не зависел от перерисовок.
 */
let seq = 0
let items: ToastItem[] = []
const listeners = new Set<(next: ToastItem[]) => void>()

const emit = () => listeners.forEach((l) => l(items))

export const dismissToast = (id: number) => {
  items = items.filter((item) => item.id !== id)
  emit()
}

/** @returns id уведомления — можно снять раньше срока через dismissToast. */
export const showToast = (text: string, kind: ToastKind = 'info') => {
  const item: ToastItem = { id: ++seq, text, kind }
  // Показываем не больше четырёх подряд: старые просто уходят из списка.
  items = [...items, item].slice(-4)
  emit()
  window.setTimeout(() => dismissToast(item.id), kind === 'error' ? 7000 : 3800)
  return item.id
}

export const showOk = (text: string) => showToast(text, 'ok')
export const showError = (text: string) => showToast(text, 'error')

/** Ошибка от Tauri: invoke отклоняется строкой, а не объектом Error. */
export const errorText = (e: any, fallback = '') => {
  const raw = typeof e === 'string' ? e : (e?.message || (e ? String(e) : ''))
  return raw || fallback
}

export const Toaster: React.FC = () => {
  const { t } = useTranslation()
  const [list, setList] = useState<ToastItem[]>(items)

  useEffect(() => {
    listeners.add(setList)
    setList(items)
    return () => {
      listeners.delete(setList)
    }
  }, [])

  if (list.length === 0) return null

  return (
    <div className="jl-toasts" role="status" aria-live="polite">
      {list.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`jl-toast jl-toast-${item.kind}`}
          onClick={() => dismissToast(item.id)}
          title={t('ui.close')}
          aria-label={t('ui.close')}
        >
          <span className="jl-toast-mark" aria-hidden="true">
            {item.kind === 'error' ? '!' : item.kind === 'ok' ? '✓' : 'i'}
          </span>
          <span className="jl-toast-text">{item.text}</span>
        </button>
      ))}
    </div>
  )
}

export default Toaster
