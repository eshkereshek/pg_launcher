// Общие данные карточек каталога: у модов и сборок одна форма — широкий баннер,
// шапка с иконкой и названием, описание и строка фактов.
import { getLocale } from './i18n'

/** Заглушка, если у проекта нет ни галереи, ни иконки. */
export const PROJECT_FALLBACK_ICON = './iconsblocks/Chest_(inventory)_MCE.png'

// Превью видео — не обложка: такие ссылки из галереи Modrinth отбрасываем.
const VIDEO_URL = /(youtube\.com|youtu\.be|vimeo\.com)/

export const isProjectImage = (url: unknown): url is string =>
  typeof url === 'string' && /^https?:\/\//.test(url) && !VIDEO_URL.test(url)

/**
 * Кандидаты в обложку по убыванию: витрина проекта, затем галерея. Иконку в
 * список не берём — квадратная картинка в кадре 2:1 обрезается; если широкого
 * кадра нет, ProjectArt сам собирает фон из размытой иконки.
 */
export const projectBanners = (project: any): string[] => {
  const gallery: string[] = Array.isArray(project?.gallery) ? project.gallery : []
  const candidates = [project?.featured_gallery, ...gallery]
  return Array.from(new Set(candidates.filter(isProjectImage)))
}

export const projectBanner = (project: any) => projectBanners(project)[0] || PROJECT_FALLBACK_ICON

/**
 * Modrinth кладёт загрузчик в categories — показываем его плашкой.
 *
 * У шейдеров и ресурспаков загрузчики свои (iris, optifine, canvas), поэтому
 * плашка сборки («FORGE») на карточке шейдера была бы неправдой.
 */
const KNOWN_LOADERS = ['neoforge', 'forge', 'fabric', 'quilt', 'iris', 'optifine', 'canvas']

export const projectLoaderLabel = (project: any, fallback = 'MODPACK') => {
  const categories: string[] = Array.isArray(project?.categories) ? project.categories : []
  const loader = KNOWN_LOADERS.find((l) => categories.includes(l))
  return loader ? loader.toUpperCase() : fallback
}

/** Компактное число скачиваний: 1,2 млн / 1.2M — разделитель по локали языка. */
export const formatCount = (value?: number) => {
  const count = Number(value || 0)
  const locale = getLocale()
  if (count < 1000) return count.toLocaleString(locale)
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count)
}

/** Дата в формате текущего языка лаунчера. */
export const formatDate = (value?: string | number | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(getLocale(), options ?? { day: '2-digit', month: 'short', year: 'numeric' })
}
