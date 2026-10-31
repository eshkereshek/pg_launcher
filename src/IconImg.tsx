import React, { useEffect, useState } from 'react'
import { PROJECT_FALLBACK_ICON } from './projectMeta'

/**
 * Иконка проекта/версии с гарантированным фолбэком.
 *
 * Обычный `<img src={icon}>` показывает системный «битый» значок, если файл
 * не загрузился: у Modrinth ссылки на иконки иногда протухают, а локальные
 * пути зависят от того, откуда лаунчер поднял страницу. Здесь вместо этого
 * подставляется блочная заглушка. Состояние `failed` не даёт повторного
 * запроса: src становится самим фолбэком, и React больше его не меняет.
 */
export const IconImg: React.FC<{
  src?: string | null
  size?: number
  className?: string
  style?: React.CSSProperties
  fallback?: string
  alt?: string
  loading?: 'lazy' | 'eager'
}> = ({ src, size, className, style, fallback = PROJECT_FALLBACK_ICON, alt = '', loading }) => {
  const [failed, setFailed] = useState(false)

  // Сменилась иконка — про ошибку забываем.
  useEffect(() => setFailed(false), [src])

  return (
    <img
      src={!src || failed ? fallback : src}
      width={size}
      height={size}
      className={className}
      style={style}
      alt={alt}
      loading={loading}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

export default IconImg
