import { useEffect, useState } from 'react'
import { PROJECT_FALLBACK_ICON, projectBanners } from './projectMeta'

/**
 * Обложка карточки проекта: широкий баннер из галереи, а если широкого кадра
 * нет — размытая копия иконки с резкой иконкой по центру. Пустых серых
 * прямоугольников в сетке не остаётся.
 */
export function ProjectArt({
  project,
  icon,
  className = '',
}: {
  project?: any
  icon?: string
  className?: string
}) {
  const banners = projectBanners(project)
  const [tried, setTried] = useState(0)
  const source = banners[tried]

  // Список переиспользует карточки при смене фильтров — начинаем подбор заново.
  useEffect(() => {
    setTried(0)
  }, [project?.project_id, project?.slug])

  const fallbackIcon = icon || project?.icon_url || PROJECT_FALLBACK_ICON
  const useFallback = (img: HTMLImageElement) => {
    if (img.getAttribute('src') !== PROJECT_FALLBACK_ICON) img.src = PROJECT_FALLBACK_ICON
  }

  return (
    <span className={`project-art${className ? ` ${className}` : ''}${source ? '' : ' is-icon'}`}>
      {source ? (
        <img
          className="project-art-img"
          src={source}
          alt=""
          loading="lazy"
          onError={() => setTried((n) => n + 1)}
        />
      ) : (
        <>
          <img
            className="project-art-bg"
            src={fallbackIcon}
            alt=""
            aria-hidden="true"
            onError={(e) => useFallback(e.currentTarget)}
          />
          <img
            className="project-art-ic"
            src={fallbackIcon}
            alt=""
            onError={(e) => useFallback(e.currentTarget)}
          />
        </>
      )}
    </span>
  )
}
