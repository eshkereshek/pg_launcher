import React, { useState, useEffect } from 'react'
import { useTranslation } from './i18n'
import { Star } from 'lucide-react'
import { McSelect } from './McSelect'
import { ProjectArt } from './ProjectArt'
import { formatCount, projectLoaderLabel } from './projectMeta'
import { showOk, showError, errorText } from './Toasts'
import ModViewer from './ModViewer'
import CardSkeletons from './CardSkeletons'
import IconImg from './IconImg'
import AiChat from './AiChat'

export default function ModpacksMenu({ currentVersion, opacity = 95, initialQuery = '' }: { currentVersion: string, opacity?: number, initialQuery?: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery)
  const [versionFilter, setVersionFilter] = useState('all')
  const [loaderFilter, setLoaderFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortFilter, setSortFilter] = useState('relevance')
  // Каталог берётся либо с Modrinth, либо с CurseForge: у них разные API,
  // но карточки приводятся к одной форме.
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')

  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [downloadStatus, setDownloadStatus] = useState<Record<string, string>>({})

  // Карточка сборки, открытая на просмотр, и имена уже установленных сборок:
  // по ним понятно, что ставить не нужно.
  const [viewer, setViewer] = useState<any>(null)
  const [installed, setInstalled] = useState<Record<string, boolean>>({})

  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  // Listen to download progress
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onDownloadUpdate) {
      // @ts-ignore
      Promise.resolve(window.electronAPI.onDownloadUpdate((data: any) => {
        if (data && data.name) {
          setDownloadStatus(prev => ({ ...prev, [data.name]: data.text || `${data.progress}%` }))
        }
      })).then((fn: any) => {
        // Слушатель мог прийти уже после размонтирования
        if (cancelled) { if (typeof fn === 'function') fn(); return }
        unlisten = fn
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  /** Имена собранных сборок: их держит бэкенд в modpacks.json. */
  const loadInstalled = async () => {
    try {
      const list = await (window as any).electronAPI.getModpacks() || []
      const map: Record<string, boolean> = {}
      for (const m of list) {
        // Та же нормализация, что и у карточек каталога.
        const key = packKey(m)
        if (key) map[key] = true
      }
      setInstalled(map)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadInstalled()
    // Установка сборки из другого места лаунчера тоже должна обновить бейдж.
    const handler = () => { loadInstalled() }
    window.addEventListener('modpacks-updated', handler)
    return () => window.removeEventListener('modpacks-updated', handler)
  }, [])

  // Имя сборки на диске — это заголовок с запрещёнными символами, заменёнными
  // на «-». Сравниваем в той же нормализации, иначе «Установлено» не покажется
  // на сборках вида «Better MC [NEOFORGE] BMC5».
  const packKey = (pack: any) => String(pack?.name || pack?.title || '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .toLowerCase()
    .trim()

  const fetchModpacks = async (
    currentOffset = 0, 
    append = false, 
    q = query, 
    v = versionFilter, 
    l = loaderFilter, 
    c = categoryFilter, 
    s = sortFilter
  ) => {
    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
      // CurseForge отдаёт готовый каталог с фильтрами — отдельная ветка запроса.
      if (source === 'curseforge') {
        // @ts-ignore
        const cf = await window.electronAPI.cfSearch('modpack', q, v, l, currentOffset, s, c)
        const cfHits = cf?.hits || []
        setResults(prev => append ? [...prev, ...cfHits] : cfHits)
        setHasMore(cfHits.length === 20)
        setLoading(false)
        setIsFetchingMore(false)
        return
      }

      let data: any
      if (!q.trim() && s === 'relevance') {
        // Default view uses downloads sorting
        // @ts-ignore
        data = await window.electronAPI.getPopularModpacks(v, currentOffset, c, l, 'downloads')
      } else if (!q.trim()) {
        // @ts-ignore
        data = await window.electronAPI.getPopularModpacks(v, currentOffset, c, l, s)
      } else {
        // @ts-ignore
        data = await window.electronAPI.searchModpacks(q, v, currentOffset, c, l, s)
      }
      const newResults = data?.hits || []
      setResults(prev => append ? [...prev, ...newResults] : newResults)
      setHasMore(newResults.length === 20)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setIsFetchingMore(false)
  }

  // Refetch when filters change
  useEffect(() => {
    setOffset(0)
    fetchModpacks(0, false, query, versionFilter, loaderFilter, categoryFilter, sortFilter)
  }, [versionFilter, loaderFilter, categoryFilter, sortFilter, source])

  const handleSearchSubmit = () => {
    setOffset(0)
    fetchModpacks(0, false, query, versionFilter, loaderFilter, categoryFilter, sortFilter)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading && !isFetchingMore) {
      const nextOffset = offset + 20
      setOffset(nextOffset)
      fetchModpacks(nextOffset, true, query, versionFilter, loaderFilter, categoryFilter, sortFilter)
    }
  }

  const installModpack = async (modpack: any, version?: any) => {
    setDownloading(prev => ({ ...prev, [modpack.project_id]: true }))
    try {
      // Если версия выбрана в карточке сборки, берём игру и загрузчик из неё:
      // фильтры списка могут стоять на «любой» версии.
      const loader = version?.loaders?.[0] || (loaderFilter !== 'all'
        ? loaderFilter
        : (modpack.categories?.find((c: string) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)) || 'all'))
      const rawName = modpack.title || modpack.name
      const modpackName = rawName.replace(/[<>:"/\\|?*]/g, '-').trim()
      // 'all' бэкенд понимает как «фильтр по версии не задан» — так и отправляем
      const installGameVersion = version?.game_versions?.[0] || versionFilter

      const result = modpack.source === 'curseforge'
        ? await (window as any).electronAPI.cfInstallModpack(
            modpack.project_id,
            version?.id || null,
            modpackName,
            installGameVersion,
            loader
          )
        : await (window as any).electronAPI.installModpack(
            modpack.project_id,
            installGameVersion,
            loader,
            modpackName,
            version?.id || ''
          )
      
      // Реальную версию и загрузчик сообщает бэкенд; хардкод-fallback не используем
      const actualVersion = result?.gameVersion || (versionFilter !== 'all' ? versionFilter : (modpack.versions?.[0] || ''))
      const finalLoader = result?.actualLoader || (loader !== 'all' ? loader : '')
      
      const mps = await (window as any).electronAPI.getModpacks() || []
      const installedMods = await (window as any).electronAPI.getInstalledMods?.(modpackName) || []
      const newMp = {
        name: modpackName,
        modrinthId: modpack.project_id,
        loader: finalLoader,
        version: actualVersion,
        installedMods: installedMods,
        icon: modpack.icon_url || modpack.gallery?.[0] || './iconsblocks/Chest_(inventory)_MCE.png'
      }

      const existingIndex = mps.findIndex((m: any) => m.name === newMp.name)
      if (existingIndex !== -1) {
        mps[existingIndex] = { ...mps[existingIndex], ...newMp }
      } else {
        mps.push(newMp)
      }
      await (window as any).electronAPI.saveModpacks(mps)
      window.dispatchEvent(new CustomEvent('modpacks-updated'))

      showOk(t('modpacks.installedOk', { name: rawName }))
    } catch (e: any) {
      showError(t('modpacks.installFailed', { error: errorText(e, t('app.unknownError')) }))
    } finally {
      setDownloading(prev => ({ ...prev, [modpack.project_id]: false }))
    }
  }

  return (
    <div className="modpacks-menu" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top Bar Row 1: Game Version & Loader Filters */}
      <div style={{ display: 'flex', padding: '15px 20px', background: 'var(--pg-dark)', alignItems: 'center', gap: '15px', borderBottom: '1px solid var(--pg-dark3)', flexWrap: 'wrap', position: 'relative', zIndex: 12, flexShrink: 0 }}>
        <div className="mc-source-switch" role="group" aria-label={t('mods.source')}>
          <button
            type="button"
            className={source === 'modrinth' ? 'on' : ''}
            onClick={() => setSource('modrinth')}
          >
            {t('mods.sourceModrinth')}
          </button>
          <button
            type="button"
            className={source === 'curseforge' ? 'on' : ''}
            onClick={() => setSource('curseforge')}
          >
            {t('mods.sourceCurseforge')}
          </button>
        </div>
        <span style={{ fontWeight: 'bold', flexShrink: 0, color: 'var(--pg-text)', fontSize: '13px' }}>{t("mods.gameVersion")}</span>
        <McSelect
          value={versionFilter}
          onChange={(v) => setVersionFilter(v)}
          options={[
            { value: 'all', label: t("modpacks.allVersions") },
            { value: '1.21.4', label: '1.21.4' },
            { value: '1.21.1', label: '1.21.1' },
            { value: '1.20.4', label: '1.20.4' },
            { value: '1.20.1', label: '1.20.1' },
            { value: '1.19.4', label: '1.19.4' },
            { value: '1.19.2', label: '1.19.2' },
            { value: '1.18.2', label: '1.18.2' },
            { value: '1.16.5', label: '1.16.5' },
            { value: '1.12.2', label: '1.12.2' },
            { value: '1.7.10', label: '1.7.10' }
          ]}
          style={{ minWidth: '160px' }}
        />

        <span style={{ fontWeight: 'bold', flexShrink: 0, color: 'var(--pg-text)', fontSize: '13px', marginLeft: '10px' }}>{t("mods.loader")}</span>
        <McSelect
          value={loaderFilter}
          onChange={(v) => setLoaderFilter(v)}
          options={[
            { value: 'all', label: t("modpacks.allLoaders") },
            { value: 'fabric', label: 'Fabric' },
            { value: 'forge', label: 'Forge' },
            { value: 'neoforge', label: 'NeoForge' },
            { value: 'quilt', label: 'Quilt' }
          ]}
          style={{ minWidth: '160px' }}
        />
      </div>

      {/* Top Bar Row 2: Search, Category, Sorting */}
      <div className="mods-top-bar" style={{ position: 'relative', zIndex: 11, flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="#aaa" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
            <path d="M22 22h-2v-2h2zm-2-2h-2v-2h2zm-6-2H6v-2h8zm4 0h-2v-2h2zM6 16H4v-2h2zm10 0h-2v-2h2zM4 14H2V6h2zm14 0h-2V6h2zM6 6H4V4h2zm10 0h-2V4h2zm-2-2H6V2h8z" />
          </svg>
          <input
            type="text"
            className="mc-input"
            placeholder={t("modpacks.search")}
            style={{ paddingLeft: '35px', width: '100%' }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
          />
        </div>

        <McSelect
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v)}
          options={[
            { value: 'all', label: t("modpacks.allCategories") },
            { value: 'optimization', label: t("modpacks.optimization") },
            { value: 'adventure', label: t("modpacks.adventure") },
            { value: 'magic', label: t("modpacks.magic") },
            { value: 'technology', label: t("modpacks.technology") },
            { value: 'quests', label: t("modpacks.quests") },
            { value: 'combat', label: t("modpacks.combat") }
          ]}
        />

        <McSelect
          value={sortFilter}
          onChange={(v) => setSortFilter(v)}
          options={[
            { value: 'relevance', label: t("mods.relevance") },
            { value: 'downloads', label: t("mods.downloads") },
            { value: 'newest', label: t("mods.newest") },
            { value: 'updated', label: t("mods.updated") }
          ]}
        />

        {/* Иконка открывает всплывающий чат: он собирает сборку и ставит моды. */}
        <AiChat version={versionFilter} loader={loaderFilter} />
      </div>

      <div className="modpacks-content" style={{ position: 'relative', zIndex: 1 }} onScroll={handleScroll}>
        {loading ? (
          <CardSkeletons count={6} />
        ) : (
          <>
            {results.map((pack: any) => (
              <div
                key={pack.project_id}
                className="mc-card mc-pack-card"
                onClick={() => setViewer(pack)}
                title={t('modpacks.detailsBtn')}
                style={{ cursor: 'pointer' }}
              >
                <ProjectArt project={pack} />
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
                        <span className="mc-card-author">от {pack.author || 'Modrinth'}</span>
                      </div>
                      <span className="mc-card-loader">{projectLoaderLabel(pack)}</span>
                    </div>
                  </div>
                  <div className="mc-card-desc">
                    {pack.description}
                  </div>
                  <div className="mc-card-footer">
                    <div className="mc-card-meta">
                      <span><Star size={10} style={{ display: 'inline' }}/> {formatCount(pack.follows)}</span>
                      <span>↓ {formatCount(pack.downloads)}</span>
                    </div>
                    {downloading[pack.project_id] ? (
                      <button className="mc-card-btn" disabled onClick={e => e.stopPropagation()}>{t("modpacks.downloading")}</button>
                    ) : installed[packKey(pack)] ? (
                      <button className="mc-card-btn installed" disabled title={t('modpacks.alreadyInstalled')}>
                        {t("mods.isInstalled") || t('modpacks.installedBadge')}
                      </button>
                    ) : (
                      <button
                        className="mc-card-btn"
                        disabled={Object.values(downloading).some(Boolean)}
                        onClick={(e) => { e.stopPropagation(); installModpack(pack) }}
                      >
                        {t("modpacks.install")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isFetchingMore && <div className="mods-loading" style={{ gridColumn: '1 / -1', padding: '20px 0' }}>{t("modpacks.loadMore")}</div>}
          </>
        )}
      </div>

      {/* Подробная карточка сборки — тот же просмотрщик, что у модов. */}
      {viewer && (
        <ModViewer
          key={viewer.project_id}
          mod={viewer}
          kind="modpack"
          activeModpack={{
            version: versionFilter !== 'all' ? versionFilter : (String(currentVersion).match(/\d+\.\d+(\.\d+)?/)?.[0] || ''),
            loader: loaderFilter !== 'all' ? loaderFilter : '',
          }}
          isInstalled={!!installed[packKey(viewer)]}
          isDownloading={!!downloading[viewer.project_id]}
          onClose={() => setViewer(null)}
          onInstall={async (pack: any, _versionId?: string, version?: any) => {
            await installModpack(pack, version)
            setViewer(null)
          }}
        />
      )}
    </div>
  )
}
