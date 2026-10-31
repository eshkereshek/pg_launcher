import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from './i18n'
import './LauncherLoadingScreen.css'

interface LauncherLoadingScreenProps {
  title?: string
  badge?: string
  statusText?: string
  progress?: number
  autoAdvance?: boolean
  minDuration?: number
  onComplete?: () => void
  isOverlay?: boolean
}


export const LauncherLoadingScreen: React.FC<LauncherLoadingScreenProps> = ({
  title = 'PAGRYSHA LAUNCHER',
  badge,
  statusText,
  progress: controlledProgress,
  autoAdvance = true,
  minDuration = 1800,
  onComplete,
  isOverlay = false,
}) => {
  const [internalProgress, setInternalProgress] = useState(autoAdvance ? 5 : 0)
  const [stepIndex, setStepIndex] = useState(0)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const { t } = useTranslation()
  // Подписи этапов собираются тут, чтобы язык брался актуальный.
  const steps = [
    { text: t('app.loadingStepInit'), targetProgress: 20 },
    { text: t('app.loadingStepProfiles'), targetProgress: 45 },
    { text: t('app.loadingStepJava'), targetProgress: 75 },
    { text: t('app.loadingStepResources'), targetProgress: 92 },
    { text: t('app.loadingStepReady'), targetProgress: 100 },
  ]
  const startTimeRef = useRef(Date.now())

  // Auto-advancing logic for splash startup screen
  useEffect(() => {
    if (!autoAdvance) return

    const interval = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        // Advance smoothly towards 100
        const remaining = 100 - prev
        const increment = Math.max(1.5, Math.min(6, remaining * 0.15))
        const next = Math.min(100, prev + increment)

        // Advance step text based on progress
        if (next > 88) setStepIndex(4)
        else if (next > 65) setStepIndex(3)
        else if (next > 40) setStepIndex(2)
        else if (next > 18) setStepIndex(1)
        else setStepIndex(0)

        return next
      })
    }, 60)

    return () => clearInterval(interval)
  }, [autoAdvance])

  const effectiveProgress = controlledProgress !== undefined 
    ? Math.min(100, Math.max(0, controlledProgress)) 
    : Math.round(internalProgress)

  const currentStatus = statusText || (steps[stepIndex]?.text || t('app.loading'))

  // Trigger completion and fade-out when progress reaches 100%
  useEffect(() => {
    if (effectiveProgress >= 100 && !isFadingOut) {
      const elapsed = Date.now() - startTimeRef.current
      const waitTime = Math.max(150, minDuration - elapsed)

      const timer = setTimeout(() => {
        setIsFadingOut(true)
        setTimeout(() => {
          if (onComplete) onComplete()
        }, 450)
      }, waitTime)

      return () => clearTimeout(timer)
    }
  }, [effectiveProgress, minDuration, onComplete, isFadingOut])

  return (
    <div className={`launcher-loading-screen ${isFadingOut ? 'fading-out' : ''} ${isOverlay ? 'is-overlay' : ''}`}>
      {/* Top drag area for native window movement */}
      <div className="loading-titlebar-drag">
        <div className="loading-titlebar-left">
          <img src="./icon.png" alt="icon" width={16} height={16} style={{ imageRendering: 'pixelated' }} />
          <span>Pagrysha Launcher</span>
        </div>
      </div>

      <div className="loading-content">
        {/* Title */}
        <div className="loading-title-wrap">
          <h1 className="loading-title">{title}</h1>
          {badge && <div className="loading-badge">{badge}</div>}
        </div>

        {/* Progress bar and status */}
        <div className="loading-progress-box">
          <div className="loading-status-row">
            <span className="loading-status-text">{currentStatus}</span>
            <span className="loading-status-percent">{effectiveProgress}%</span>
          </div>

          <div className="loading-progress-track">
            <div
              className="loading-progress-fill"
              style={{ width: `${effectiveProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LauncherLoadingScreen
