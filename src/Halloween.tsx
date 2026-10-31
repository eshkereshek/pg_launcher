import React, { useEffect, useState } from 'react'
import './halloween.css'

const STORE_KEY = 'mc_halloween'

export type HalloweenMode = 'auto' | 'on' | 'off'

/** Календарный сезон тыкв: 24 октября — 9 ноября включительно. */
export const inHalloweenSeason = (date = new Date()) => {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 10) return day >= 24
  if (month === 11) return day <= 9
  return false
}

/**
 * С 10 ноября сезон закрыт для всех: декор гаснет и у тех, у кого стоял
 * режим auto, и у тех, кто включил тыквы руками. Дальше — только вручную,
 * и до следующей осени.
 */
export const isSeasonClosed = (date = new Date()) => {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 11) return day >= 10
  return month === 12
}

export const getMode = (): HalloweenMode => {
  const saved = localStorage.getItem(STORE_KEY)
  return saved === 'on' || saved === 'off' ? saved : 'auto'
}

/** Правила для конкретного дня: закрытый сезон перекрывает даже «on». */
export const resolveDecor = (mode: HalloweenMode, date = new Date()) => {
  if (mode === 'off') return false
  if (isSeasonClosed(date)) return false
  if (mode === 'on') return true
  return inHalloweenSeason(date)
}

const listeners = new Set<(on: boolean) => void>()
let current = resolveDecor(getMode())

const recompute = () => {
  current = resolveDecor(getMode())
  listeners.forEach((l) => l(current))
}

export const setMode = (mode: HalloweenMode) => {
  localStorage.setItem(STORE_KEY, mode)
  recompute()
}

/** Текущий режим для React-компонентов. */
export const useHalloween = () => {
  const [on, setOn] = useState(current)
  useEffect(() => {
    listeners.add(setOn)
    setOn(current)
    return () => { listeners.delete(setOn) }
  }, [])
  return { on, mode: getMode(), setMode }
}

/** Пиксельная тыква. Размер задаёт класс-вариант в halloween.css. */
export const Pumpkin: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style,
}) => (
  <img
    className={className ? `hw-pumpkin-img ${className}` : 'hw-pumpkin-img'}
    src="./halloween/pumpkin.svg"
    style={style}
    alt=""
    aria-hidden="true"
    draggable={false}
  />
)

export default Pumpkin
