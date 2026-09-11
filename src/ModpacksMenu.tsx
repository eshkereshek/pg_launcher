import React, { useState, useEffect } from 'react'
import { useTranslation } from './i18n'
import { Star } from 'lucide-react'
import { McSelect } from './McSelect'

export default function ModpacksMenu({ currentVersion, opacity = 95 }: { currentVersion: string, opacity?: number }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('')
  const [versionFilter, setVersionFilter] = useState('all')
  const [loaderFilter, setLoaderFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortFilter, setSortFilter] = useState('relevance')

  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'))

  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  // Listen to secondary background changes
  useEffect(() => {
    const updateBg = () => {
      const customBg = localStorage.getItem('mc_sec_bg_data')
      setBgImage(customBg || null)
    }
    updateBg()
    window.addEventListener('storage', updateBg)
    return () => window.removeEventListener('storage', updateBg)
  }, [])

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
  }, [versionFilter, loaderFilter, categoryFilter, sortFilter])

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

  const installModpack = async (modpack: any) => {
    setDownloading(prev => ({ ...prev, [modpack.project_id]: true }))
    try {
      const loader = modpack.categories?.find((c: string) => ['fabric', 'forge', 'quilt', 'neoforge'].includes(c)) || (loaderFilter !== 'all' ? loaderFilter : 'fabric')
      const rawName = modpack.title || modpack.name
      const modpackName = rawName.replace(/[<>:"/\\|?*]/g, '-')
      const installGameVersion = versionFilter !== 'all' ? versionFilter : currentVersion
      const result = await (window as any).electronAPI.installModpack(modpack.project_id, installGameVersion, loader, modpackName)
      
      const actualVersion = result?.gameVersion || installGameVersion
      const finalLoader = result?.actualLoader || loader
      
      const mps = await (window as any).electronAPI.getModpacks() || []
      const newMp = {
        name: modpackName,
        loader: finalLoader,
        version: actualVersion,
        installedMods: [],
        icon: modpack.icon_url || modpack.gallery?.[0] || './iconsblocks/Chest_(inventory)_MCE.png'
      }
      if (!mps.some((m: any) => m.name === newMp.name)) {
        mps.push(newMp)
        await (window as any).electronAPI.saveModpacks(mps)
      }

      alert(`${t('modpacks.installSuccess').replace('Сборка', 'Сборка ' + modpack.title)}`)
    } catch (e: any) {
      alert(t('modpacks.error') + ' ' + e.message)
    } finally {
      setDownloading(prev => ({ ...prev, [modpack.project_id]: false }))
    }
  }

  return (
    <div className="modpacks-menu" style={{ backgroundColor: 'transparent', backgroundImage: bgImage ? `url("${bgImage}")` : 'url("./bg-minecraft.png")', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top Bar Row 1: Game Version & Loader Filters */}
      <div style={{ display: 'flex', padding: '15px 20px', background: 'var(--pg-dark)', alignItems: 'center', gap: '15px', borderBottom: '1px solid var(--pg-dark3)', flexWrap: 'wrap', position: 'relative', zIndex: 12, flexShrink: 0 }}>
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
      </div>

      <div className="modpacks-content" style={{ position: 'relative', zIndex: 1 }} onScroll={handleScroll}>
        {loading ? (
          <div className="mods-loading" style={{ gridColumn: '1 / -1', minHeight: '350px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t("modpacks.loading")}
          </div>
        ) : (
          <>
            {results.map((pack: any) => (
              <div key={pack.project_id} className="mc-card" style={{ background: `color-mix(in srgb, var(--pg-dark) ${opacity}%, transparent)` }}>
                <div className="mc-card-header">
                  <img src={pack.icon_url || pack.gallery?.[0] || 'https://via.placeholder.com/64'} alt="cover" className="mc-card-icon" />
                  <div className="mc-card-title-area">
                    <span className="mc-card-title" style={{ fontSize: '18px' }}>{pack.title}</span>
                  </div>
                </div>
                <div className="mc-card-desc">
                  {pack.description}
                </div>
                <div className="mc-card-footer">
                  <div className="mc-card-meta">
                    <span><Star size={10} style={{ display: 'inline' }}/> {pack.follows}</span>
                    <span>↓ {(pack.downloads || 0).toLocaleString()}</span>
                  </div>
                  {downloading[pack.project_id] ? (
                    <button className="mc-btn-primary" disabled>{t("modpacks.downloading")}</button>
                  ) : (
                    <button className="mc-btn-primary" disabled={Object.values(downloading).some(Boolean)} onClick={() => installModpack(pack)}>{t("modpacks.install")}</button>
                  )}
                </div>
              </div>
            ))}
            {isFetchingMore && <div className="mods-loading" style={{ gridColumn: '1 / -1', padding: '20px 0' }}>{t("modpacks.loadMore")}</div>}
          </>
        )}
      </div>
    </div>
  )
}
