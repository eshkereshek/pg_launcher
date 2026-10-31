import { useEffect, useRef, useState } from 'react'
import { useTranslation, getLocale, type Language } from './i18n'
import { McSelect } from './McSelect'
import { ProjectArt } from './ProjectArt'
import { formatCount } from './projectMeta'
import IconImg from './IconImg'
import ServerViewer from './ServerViewer'

/**
 * Каталог серверов Modrinth.
 *
 * Данные берутся из `/v2/search` по типу проекта `minecraft_java_server`.
 * Отдельного серверного API у Modrinth нет, поэтому адрес сервера приходит не
 * из ответа, а вытаскивается бэкендом из описания (`server_address`).
 */

const PAGE = 20


/** Русские подписи тегов: в API они приходят слагами. */
/** Языконезависимые подписи тегов: аббревиатуры и собственные имена. */
const TAG_BRANDS: Record<string, string> = {
  'smp': 'SMP',
  'pvp': 'PvP',
  'pve': 'PvE',
  'skyblock': 'SkyBlock',
  'oneblock': 'OneBlock',
  'bedwars': 'BedWars',
  'kitpvp': 'KitPvP',
  'lifesteal': 'Lifesteal',
  'rpg': 'RPG',
  'mmo': 'MMO',
  'op': 'OP',
}

/** Русские подписи тегов: в API они приходят слагами. */
const TAG_LABELS_RU: Record<string, string> = {
  'survival-mode': 'Выживание',
  'creative-mode': 'Креатив',
  'adventure-mode': 'Приключения',
  'hardcore-mode': 'Хардкор',
  'minigames': 'Мини-игры',
  'microgames': 'Микроигры',
  'anarchy': 'Анархия',
  'factions': 'Фракции',
  'prison': 'Тюрьма',
  'gens': 'Генераторы',
  'parkour': 'Паркур',
  'racing': 'Гонки',
  'roleplay': 'Ролевые',
  'economy': 'Экономика',
  'questing': 'Квесты',
  'bosses': 'Боссы',
  'dungeons': 'Подземелья',
  'pokemon': 'Cobblemon',
  'classes': 'Классы',
  'plots': 'Участки',
  'towns': 'Города',
  'teams': 'Команды',
  'custom-content': 'Свой контент',
  'competitive': 'Соревновательный',
  'social': 'Общение',
  'technical': 'Технический',
  'creator-community': 'Сообщество',
  'recording-smp': 'SMP с записью',
  'network': 'Сеть',
  'crossplay': 'Кроссплей',
  'offline-mode': 'Оффлайн-режим',
  'whitelisted': 'Вайтлист',
  'vanilla-like': 'Ванильный',
  'world-resets': 'Вайпы',
  'keep-inventory': 'Инвентарь',
  'media': 'Медиа',
  'personal-worlds': 'Личные миры',
}

/** Слаг сам по себе читается по-английски: survival-mode -> Survival mode. */
const humanizeTag = (tag: string) => {
  const words = tag.replace(/-/g, ' ').trim()
  if (!words) return tag
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const tagLabel = (tag: string, language: Language) =>
  TAG_BRANDS[tag] || (language === 'ru' ? TAG_LABELS_RU[tag] : undefined) || humanizeTag(tag)

const VERSIONS = [
  'all', '26.3', '26.2', '26.1', '1.21.9', '1.21.8', '1.21.5', '1.21.4',
  '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2',
]

const mainTag = (hit: any): string => {
  const list: string[] = Array.isArray(hit?.display_categories) && hit.display_categories.length
    ? hit.display_categories
    : Array.isArray(hit?.categories) ? hit.categories : []
  return list[0] || ''
}

/** Загрузчик сервера: Modrinth кладёт его в общий список категорий. */
const loaderLabel = (hit: any): string => {
  const list: string[] = Array.isArray(hit?.categories) ? hit.categories : []
  const loader = ['neoforge', 'forge', 'fabric', 'quilt'].find((l) => list.includes(l))
  return loader ? loader.toUpperCase() : ''
}


export function ServersMenu({ opacity = 95 }: { opacity?: number }) {
  const { t, language } = useTranslation()

  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [version, setVersion] = useState('all')
  const [sort, setSort] = useState('follows')

  const [hits, setHits] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState('')

  const [copied, setCopied] = useState<string | null>(null)
  const [opened, setOpened] = useState<any | null>(null)

  const offsetRef = useRef(0)
  const reqRef = useRef(0)
  const busyRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Поиск с паузой: не дёргаем API на каждую букву.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(query.trim()), 450)
    return () => clearTimeout(timer)
  }, [query])

  const load = async (reset: boolean) => {
    if (!reset && busyRef.current) return
    busyRef.current = true
    const token = ++reqRef.current
    const offset = reset ? 0 : offsetRef.current

    if (reset) {
      setLoading(true)
      setError('')
    } else {
      setLoadingMore(true)
    }

    try {
      // @ts-ignore
      const data = await window.electronAPI.searchServers(applied, offset, 'all', version, sort)
      if (token !== reqRef.current) return
      const batch: any[] = Array.isArray(data?.hits) ? data.hits : []
      setTotal(Number(data?.total_hits || 0))
      offsetRef.current = offset + batch.length
      setHasMore(batch.length >= PAGE)
      setHits((prev) => {
        if (reset) return batch
        const seen = new Set(prev.map((p) => p.project_id))
        return [...prev, ...batch.filter((b) => !seen.has(b.project_id))]
      })
    } catch (e: any) {
      if (token !== reqRef.current) return
      setError(typeof e === 'string' ? e : t('servers.loadCatalogFailed'))
      if (reset) {
        setHits([])
        setHasMore(false)
      }
    } finally {
      busyRef.current = false
      if (token === reqRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    offsetRef.current = 0
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, version, sort])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loading || loadingMore || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 420) load(false)
  }

  const copyAddress = (address: string) => {
    try {
      navigator.clipboard?.writeText(address)?.catch(() => {})
    } catch (e) {
      console.error(e)
    }
    setCopied(address)
    setTimeout(() => setCopied((current) => (current === address ? null : current)), 1800)
  }

  const address = (pack: any): string => pack?.server_address || ''

  return (
    <div className="servers-page" style={{ opacity: opacity / 100 }}>
      {/* Шапка: заголовок, поиск, сортировка */}
      <header className="servers-hero">
        <div className="servers-hero-text">
          <h1 className="servers-hero-title">{t('app.servers') || t('servers.tabTitle')}</h1>
          <p className="servers-hero-sub">
            {total > 0
              ? t('servers.catalogCount', { count: total.toLocaleString(getLocale()) })
              : t('servers.catalogTitle')}
          </p>
        </div>

        <div className="servers-hero-tools">
          <div className="servers-search">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M22 22h-2v-2h2zm-2-2h-2v-2h2zm-6-2H6v-2h8zm4 0h-2v-2h2zM6 16H4v-2h2zm10 0h-2v-2h2zM4 14H2V6h2zm14 0h-2V6h2zM6 6H4V4h2zm10 0h-2V4h2zm-2-2H6V2h8z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('servers.searchPlaceholder')}
              spellCheck={false}
            />
            {query && (
              <button type="button" className="servers-search-clear" onClick={() => setQuery('')} title={t('ui.clear')}>
                ×
              </button>
            )}
          </div>

          <McSelect
            value={sort}
            onChange={setSort}
            options={[
              { value: 'follows', label: t('servers.sortSubscribers') },
              { value: 'downloads', label: t('servers.sortVisits') },
              { value: 'relevance', label: t('servers.sortRelevance') },
              { value: 'newest', label: t('servers.sortNew') },
              { value: 'updated', label: t('servers.sortUpdated') },
            ]}
            style={{ width: '190px' }}
          />

          <McSelect
            value={version}
            onChange={setVersion}
            options={VERSIONS.map((v) => ({ value: v, label: v === 'all' ? t('servers.anyVersion') : v }))}
            style={{ width: '150px' }}
          />
        </div>
      </header>

      <div className="servers-scroll" ref={scrollRef} onScroll={handleScroll}>
        {loading ? (
          <div className="servers-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="mc-card server-skeleton" aria-hidden="true">
                <div className="server-skeleton-art" />
                <div className="mc-card-body">
                  <div className="server-skeleton-line" />
                  <div className="server-skeleton-line short" />
                  <div className="server-skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="servers-empty">
            <p>{error}</p>
            <button type="button" className="mc-card-btn" onClick={() => load(true)}>
              {t('app.retry')}
            </button>
          </div>
        ) : hits.length === 0 ? (
          <div className="servers-empty">
            <p>{t('servers.nothingFound')}</p>
          </div>
        ) : (
          <>
            <div className="servers-grid">
              {hits.map((pack) => {
                const tag = mainTag(pack)
                const loader = loaderLabel(pack)
                const ip = address(pack)
                const packVersions: string[] = Array.isArray(pack.versions) ? pack.versions : []
                return (
                  <article
                    key={pack.project_id}
                    className="mc-card mc-server-card"
                    onClick={() => setOpened(pack)}
                    title={pack.description}
                  >
                    <ProjectArt project={pack} />
                    {tag && <span className="server-badge">{tagLabel(tag, language)}</span>}

                    <div className="mc-card-body">
                      <div className="mc-card-header">
                        <IconImg
                          src={pack.icon_url}
                          className="mc-card-icon"
                          loading="lazy"
                        />
                        <div className="mc-card-title-area">
                          <div className="mc-card-heading">
                            <span className="mc-card-title">{pack.title}</span>
                            <span className="mc-card-author">{t('servers.byAuthor', { author: pack.author || 'Modrinth' })}</span>
                          </div>
                          {loader && <span className="mc-card-loader">{loader}</span>}
                        </div>
                      </div>

                      <div className="mc-card-desc">{pack.description}</div>

                      <div className="server-tags">
                        {(pack.display_categories || pack.categories || [])
                          .slice(0, 3)
                          .map((c: string) => (
                            <span key={c} className="server-tag">
                              {tagLabel(c, language)}
                            </span>
                          ))}
                      </div>

                      <div className="mc-card-footer">
                        <div className="mc-card-meta">
                          <span>↓ {formatCount(pack.downloads)}</span>
                          <span>★ {formatCount(pack.follows)}</span>
                          {packVersions[0] && <span>{packVersions[0]}</span>}
                        </div>
                        {ip ? (
                          // Класс `installed` не добавляем: он красит текст в
                          // зелёный, а после копирования цвет меняться не должен.
                          <button
                            type="button"
                            className="mc-card-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyAddress(ip)
                            }}
                          >
                            {copied === ip ? t('ui.copied') : t('servers.copyIp')}
                          </button>
                        ) : (
                          // В описании адреса нет — он часто лежит в теле
                          // проекта, поэтому ведём в карточку, где он
                          // подтянется отдельным запросом.
                          <button
                            type="button"
                            className="mc-card-btn ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpened(pack)
                            }}
                          >
                            {t('servers.open')}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {loadingMore && <div className="servers-more">{t('servers.loadingMore')}</div>}
            {!hasMore && hits.length > 0 && (
              <div className="servers-more servers-more-end">{t('servers.allLoaded')}</div>
            )}
          </>
        )}
      </div>

      {opened && (
        <ServerViewer key={opened.slug || opened.project_id} server={opened} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}
