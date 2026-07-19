import { useState, useEffect } from 'react'
import { useTranslation } from './i18n'
import { Star } from 'lucide-react'

export default function ModpacksMenu({ currentVersion, opacity = 95 }: { currentVersion: string, opacity?: number }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'))

  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('mc_sec_bg_data')) {
      // @ts-ignore
      window.electronAPI.readLocalImage('C:\\Users\\Kiirr12il\\Pictures\\bg-minecraft.png')
        .then((dataUrl: string) => { if (dataUrl) setBgImage(dataUrl) })
        .catch(console.error)
    }

    loadRecommended(0, false)
  }, [])

  const loadRecommended = async (currentOffset = 0, append = false) => {
    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
      // @ts-ignore
      const data = await window.electronAPI.getPopularModpacks(null, currentOffset)
      const newResults = data?.hits || []
      setResults(prev => append ? [...prev, ...newResults] : newResults)
      setHasMore(newResults.length === 20)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setIsFetchingMore(false)
  }

  const searchModpacks = async (currentOffset = 0, append = false) => {
    if (!query.trim()) { loadRecommended(currentOffset, append); return }
    
    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
      // @ts-ignore
      const data = await window.electronAPI.searchModpacks(query, null, currentOffset)
      const newResults = data?.hits || []
      setResults(prev => append ? [...prev, ...newResults] : newResults)
      setHasMore(newResults.length === 20)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setIsFetchingMore(false)
  }

  const handleSearchSubmit = () => {
    setOffset(0)
    searchModpacks(0, false)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading && !isFetchingMore) {
      const nextOffset = offset + 20
      setOffset(nextOffset)
      searchModpacks(nextOffset, true)
    }
  }

  const installModpack = async (modpack: any) => {
    setDownloading(prev => ({ ...prev, [modpack.project_id]: true }))
    try {
      const loader = modpack.categories?.find((c: string) => ['fabric', 'forge', 'quilt', 'neoforge'].includes(c)) || 'fabric'
      const rawName = modpack.title || modpack.name
      const modpackName = rawName.replace(/[<>:"/\\|?*]/g, '-')
      const result = await (window as any).electronAPI.installModpack(modpack.project_id, currentVersion, loader, modpackName)
      
      const actualVersion = result?.gameVersion || currentVersion
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
    <div className="modpacks-menu" style={{ backgroundImage: bgImage ? `url("${bgImage}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 0 }} />
      
      <div className="mods-top-bar" style={{ position: 'sticky', top: 0, zIndex: 10, padding: '20px 30px', background: 'var(--pg-dark)', borderBottom: '1px solid var(--pg-dark3)' }}>
        <span className="mods-top-title">{t("modpacks.modrinthModpacks")}</span>
        <div className="mods-search-container" style={{ marginLeft: 'auto', width: '300px' }}>
          <input 
            type="text" 
            placeholder={t("modpacks.search")} 
            className="mods-search" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
          <button className="search-btn" onClick={handleSearchSubmit}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M22 22h-2v-2h2zm-2-2h-2v-2h2zm-6-2H6v-2h8zm4 0h-2v-2h2zM6 16H4v-2h2zm10 0h-2v-2h2zM4 14H2V6h2zm14 0h-2V6h2zM6 6H4V4h2zm10 0h-2V4h2zm-2-2H6V2h8z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="modpacks-content" style={{ position: 'relative', zIndex: 1 }} onScroll={handleScroll}>
        {loading ? (
          <div className="mods-loading">{t("modpacks.loading")}</div>
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
