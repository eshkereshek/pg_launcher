import { useState, useEffect, useRef } from 'react'
import { useTranslation } from './i18n'
import { Plus, X, Package, Check, Settings, Trash, Power, PowerOff } from 'lucide-react'
import { McSelect } from './McSelect'

interface Modpack {
  name: string
  loader: string
  version: string
  installedMods: { id: string; title: string; type?: string; isEnabled?: boolean }[]
  icon?: string
}

const PRESET_ICONS = [
  './iconsblocks/Grass_Block_(inventory)_MCE.png',
  './iconsblocks/MCE_Dirt_(inventory).png',
  './iconsblocks/Cobblestone_(inventory)_MCE.png',
  './iconsblocks/Oak_Wood_Planks_(inventory)_MCE.png',
  './iconsblocks/Oak_Log_(inventory)_MCE.png',
  './iconsblocks/Jungle_Leaves_(inventory)_MCE.png',
  './iconsblocks/Crafting_Table_(inventory)_MCE.png',
  './iconsblocks/Furnace_(inventory)_MCE.png',
  './iconsblocks/Chest_(inventory)_MCE.png',
  './iconsblocks/MCE_Diamond_Ore_(inventory).png',
  './iconsblocks/Emerald_Block_(inventory)_MCE.png',
  './iconsblocks/MCE_Bedrock_(inventory).png',
  './iconsblocks/Obsidian_(inventory)_MCE.png',
  './iconsblocks/Netherrack_(inventory)_MCE.png',
  './iconsblocks/End_Stone_(inventory)_MCE.png',
  './iconsblocks/Bookshelf_(inventory)_MCE.png',
  './iconsblocks/Brick_Block_(inventory)_MCE.png',
  './iconsblocks/Coarse_Dirt_(inventory)_MCE.png',
  './iconsblocks/MCE_Dark_Prismarine_(inventory).png',
  './iconsblocks/MCE_Sticky_Piston_(inventory).png',
  './iconsblocks/Melon_(inventory)_MCE.png',
  './iconsblocks/Mycelium_(inventory)_MCE.png',
  './iconsblocks/Packed_Ice_(inventory)_MCE.png',
  './iconsblocks/Bucket_of_Pufferfish_(inventory)_MCE.png'
]

const getCategoryIcon = (cat: string) => {
  const base = "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/item/";
  const map: Record<string, string> = {
    optimization: base + "redstone.png",
    magic: base + "amethyst_shard.png",
    technology: base + "redstone_torch.png",
    library: base + "book.png",
    adventure: base + "filled_map.png",
    worldgen: base + "oak_sapling.png",
    decoration: base + "painting.png",
    utility: base + "name_tag.png",
    storage: base + "shulker_shell.png",
    equipment: base + "diamond_chestplate.png",
    food: base + "apple.png",
    mobs: base + "bone.png",
    social: base + "writable_book.png",
    transportation: base + "minecart.png",
    fabric: base + "string.png",
    forge: base + "iron_ingot.png",
    quilt: base + "leather.png",
    neoforge: base + "gold_ingot.png",
    cursed: base + "spider_eye.png",
    minigame: base + "bow.png",
    misc: base + "slime_ball.png"
  };
  return map[cat.toLowerCase()] || base + "diamond_pickaxe.png";
}

export default function ModsMenu({ currentVersion, opacity = 95, blur = true }: { currentVersion: string, opacity?: number, blur?: boolean }) {
  const { t } = useTranslation();
  const [modpacks, setModpacks] = useState<Modpack[]>([])
  const [activeModpack, setActiveModpack] = useState<Modpack | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showModpackSettingsModal, setShowModpackSettingsModal] = useState(false)
  const [editModpackName, setEditModpackName] = useState('')
  const [editModpackIcon, setEditModpackIcon] = useState('')
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [installOptifine, setInstallOptifine] = useState(false)
  const [installElybySkins, setInstallElybySkins] = useState(false)

  const [newName, setNewName] = useState('')
  const [newLoader, setNewLoader] = useState('forge')
  const [newVersion, setNewVersion] = useState((currentVersion && !currentVersion.startsWith('mp:')) ? currentVersion : '1.20.1')
  const [newIcon, setNewIcon] = useState(PRESET_ICONS[0])

  const [query, setQuery] = useState('')
  const [projectType, setProjectType] = useState('mod')
  const [sort, setSort] = useState('relevance')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})

  // Infinite Scroll State
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)

  const gameVersions = [
    '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    '1.20.6', '1.20.4', '1.20.2', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10'
  ]

  // Load modpacks
  useEffect(() => {
    const load = async () => {
      try {
        // @ts-ignore
        const saved = await window.electronAPI.getModpacks()
        setModpacks(saved || [])
        if (saved && saved.length > 0) {
          selectModpack(saved[0])
        }
      } catch (e) { console.error(e) }
    }
    load()

    if (!localStorage.getItem('mc_sec_bg_data')) {
      // @ts-ignore
      window.electronAPI.readLocalImage('C:\\Users\\Kiirr12il\\Pictures\\servbcg.jpg')
        .then((dataUrl: string) => { if (dataUrl) setBgImage(dataUrl) })
        .catch(console.error)
    }
  }, [])

  // Refetch when projectType or sort changes
  useEffect(() => {
    if (activeModpack) {
      setOffset(0)
      searchMods(0, false)
    }
  }, [projectType, sort, activeModpack?.name])

  const persistModpacks = (updated: Modpack[]) => {
    setModpacks(updated)
    // @ts-ignore
    window.electronAPI.saveModpacks(updated)
  }

  const loadRecommended = async (mp: Modpack, currentOffset = 0, append = false) => {
    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
        // @ts-ignore
        const data = await window.electronAPI.searchMods('', mp.loader, mp.version, currentOffset, projectType, sort)
        const newResults = data?.hits || []
        setResults(prev => append ? [...prev, ...newResults] : newResults)
        setHasMore(newResults.length === 20)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setIsFetchingMore(false)
  }

  const selectModpack = async (mp: Modpack) => {
    // Sync installed mods with actual files in directory
    try {
      // @ts-ignore
      const localMods = await window.electronAPI.getInstalledMods(mp.name)
      if (localMods && localMods.length > 0) {
        // Merge local mods with known mods
        const knownIds = new Set(mp.installedMods.map(m => m.id))
        const newMods = localMods.filter((lm: any) => !knownIds.has(lm.id))
        if (newMods.length > 0) {
          mp.installedMods = [...mp.installedMods, ...newMods]
          setModpacks(prev => {
            const updated = prev.map(p => p.name === mp.name ? mp : p)
            // @ts-ignore
            window.electronAPI.saveModpacks(updated)
            return updated
          })
        }
      }
    } catch(e) { console.error(e) }

    setActiveModpack(mp)
    setQuery('')
    setOffset(0)
    loadRecommended(mp, 0, false)
  }

  const createModpack = async () => {
    if (!newName.trim()) return
    const safeName = newName.replace(/[<>:"/\\|?*]/g, '-')
    const mp: Modpack = { name: safeName, loader: newLoader, version: newVersion, installedMods: [], icon: newIcon }
    
    setModpacks(prev => {
      const updated = [...prev, mp]
      // @ts-ignore
      window.electronAPI.saveModpacks(updated)
      return updated
    })
    
    setShowCreateModal(false)
    const shouldInstallOptifine = installOptifine
    const createdName = safeName
    const createdVersion = newVersion
    const createdLoader = newLoader

    setNewName('')
    setNewIcon(PRESET_ICONS[0])
    setInstallOptifine(false)
    setInstallElybySkins(false)
    selectModpack(mp)

    const shouldInstallElyby = installElybySkins

    if (createdLoader === 'forge' && shouldInstallOptifine) {
      try {
        // @ts-ignore
        const result = await window.electronAPI.installOptifine(createdVersion, createdName)
        if (result.status === 'success' && result.filenames) {
          setModpacks(currentModpacks => {
            const newMp = currentModpacks.find(m => m.name === createdName)
            if (newMp) {
              const updatedMp = { ...newMp, installedMods: [...newMp.installedMods] }
              result.filenames.forEach((filename: string, i: number) => {
                updatedMp.installedMods.push({ id: `optimization-${i}-${Date.now()}`, title: filename, type: 'mod' })
              })
              const newAll = currentModpacks.map(m => m.name === createdName ? updatedMp : m)
              // @ts-ignore
              window.electronAPI.saveModpacks(newAll)
              setActiveModpack(curr => curr?.name === createdName ? updatedMp : curr)
              return newAll
            }
            return currentModpacks
          })
        } else if (result.status === 'error') {
          alert(t('mods.failedOptifine') + ' ' + result.error)
        }
      } catch (e) {
        console.error(e)
      }
    }

    if (shouldInstallElyby) {
      try {
        // @ts-ignore
        await window.electronAPI.downloadMod('customskinloader', createdVersion, createdLoader, createdName)
      } catch (e) {
        console.error('Failed to install CustomSkinLoader:', e)
      }
    }
  }

  const saveModpackSettings = async () => {
    if (!activeModpack || !editModpackName.trim()) return
    const safeEditName = editModpackName.replace(/[<>:"/\\|?*]/g, '-')
    
    if (safeEditName !== activeModpack.name) {
      try {
        // @ts-ignore
        const res = await window.electronAPI.renameModpackFolder(activeModpack.name, safeEditName)
        if (res.status === 'error') {
          alert('Не удалось переименовать папку сборки: ' + res.error)
          return
        }
      } catch (e) {
        console.error(e)
        return
      }
    }

    setModpacks(prev => {
      const updated = prev.map(mp => {
        if (mp.name === activeModpack.name) {
          return { ...mp, name: safeEditName, icon: editModpackIcon }
        }
        return mp
      })
      // @ts-ignore
      window.electronAPI.saveModpacks(updated)
      return updated
    })
    setActiveModpack({ ...activeModpack, name: safeEditName, icon: editModpackIcon })
    setShowModpackSettingsModal(false)
  }

  const deleteModpack = async () => {
    if (!activeModpack) return

    try {
      // @ts-ignore
      await window.electronAPI.deleteModpackFolder(activeModpack.name)
    } catch(e) {
      console.error(e)
    }

    setModpacks(prev => {
      const updated = prev.filter(mp => mp.name !== activeModpack.name)
      // @ts-ignore
      window.electronAPI.saveModpacks(updated)
      
      // Auto-select another modpack if list is not empty
      if (updated.length > 0) {
        selectModpack(updated[0])
      } else {
        setActiveModpack(null)
        setResults([])
        setQuery('')
      }
      return updated
    })
    setConfirmDelete(false)
    setShowModpackSettingsModal(false)
  }

  const searchMods = async (currentOffset = 0, append = false) => {
    if (!activeModpack) return
    
    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
      // @ts-ignore
      const data = await window.electronAPI.searchMods(query, activeModpack.loader, activeModpack.version, currentOffset, projectType, sort)
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
    searchMods(0, false)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading && !isFetchingMore) {
      const nextOffset = offset + 20
      setOffset(nextOffset)
      searchMods(nextOffset, true)
    }
  }

  const installMod = async (mod: any) => {
    if (!activeModpack) return
    
    // Normalize IDs for state
    const modId = mod.project_id
    
    setDownloading(prev => ({ ...prev, [modId]: true }))
    try {
        const loader = activeModpack.loader
        // @ts-ignore
        const result = await window.electronAPI.downloadMod(mod.project_id, activeModpack.version, loader, activeModpack.name, projectType)
        const newMods = result.filenames.map((name: string, i: number) => ({
          id: i === 0 ? modId : `dep-${modId}-${i}`,
          title: name,
          type: projectType
        }))
        const updatedMp = { 
          ...activeModpack, 
          installedMods: [...activeModpack.installedMods, ...newMods] 
        }
        setActiveModpack(updatedMp)
        const updatedAll = modpacks.map(m => m.name === updatedMp.name ? updatedMp : m)
        persistModpacks(updatedAll)

    } catch (e: any) {
      alert(t("mods.failedToInstall") + " " + e.message)
    }
    setDownloading(prev => ({ ...prev, [modId]: false }))
  }

  const openModrinthPage = (mod: any) => {
    const slug = mod.slug || mod.project_id
    if (slug) {
      // @ts-ignore
      window.electronAPI.openExternal(`https://modrinth.com/${projectType}/${slug}`)
    }
  }

  const openOptifinePage = () => {
    // @ts-ignore
    window.electronAPI.openExternal('https://optifine.net/home')
  }

  const isOptifineInstalled = () => {
    return activeModpack?.installedMods.some(m => m.title.toLowerCase().includes('optifine')) || false
  }

  const installOptifineManually = async () => {
    if (!activeModpack) return
    setDownloading(prev => ({ ...prev, ['optifine']: true }))
    try {
      // @ts-ignore
      const result = await window.electronAPI.installOptifine(activeModpack.version, activeModpack.name)
      if (result.status === 'success' && result.filenames) {
        const newMods = result.filenames.map((name: string, i: number) => ({
          id: `optifine-manual-${Date.now()}-${i}`,
          title: name,
          type: 'mod'
        }))
        const updatedMp = { 
          ...activeModpack, 
          installedMods: [...activeModpack.installedMods, ...newMods] 
        }
        setActiveModpack(updatedMp)
        const updatedAll = modpacks.map(m => m.name === updatedMp.name ? updatedMp : m)
        persistModpacks(updatedAll)
      } else if (result.status === 'error') {
        alert(t('mods.failedOptifine') + ' ' + result.error)
      }
    } catch(e: any) {
      alert(t('mods.failedOptifine') + ' ' + e.message)
    }
    setDownloading(prev => ({ ...prev, ['optifine']: false }))
  }

  const isInstalled = (mod: any) => {
    const modId = mod.project_id
    return activeModpack?.installedMods.some(m => m.id === modId) || false
  }

  // Helpers to normalize Modrinth data
  const getModId = (mod: any) => mod.project_id
  const getModIcon = (mod: any) => mod.icon_url || 'https://via.placeholder.com/64'
  const getModTitle = (mod: any) => mod.title
  const getModDesc = (mod: any) => mod.description
  const getModDownloads = (mod: any) => (mod.downloads || 0).toLocaleString()
  const getModDate = (mod: any) => {
    const d = mod.date_modified
    if (!d) return '01.01.2023'
    const date = new Date(d)
    return `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}.${date.getFullYear()}`
  }

  return (
    <div className="mods-menu" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--pg-black)', backgroundImage: bgImage ? `url("${bgImage}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', overflow: 'hidden' }}>
      
      {/* Settings row for modpacks (Custom wrapper for previous top bar logic) */}
      <div style={{ display: 'flex', padding: '15px 20px', background: '#111', alignItems: 'center', gap: '15px', borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', flexShrink: 0, color: 'white' }}>{t("mods.modpack")}</span>
        <McSelect 
          value={activeModpack?.name || ''} 
          onChange={(val) => {
            const mp = modpacks.find(m => m.name === val)
            if (mp) selectModpack(mp)
          }}
          options={[
            { value: '', label: t("mods.selectModpack"), disabled: true },
            ...modpacks.map(mp => ({ value: mp.name, label: mp.name }))
          ]}
          style={{ minWidth: '200px' }}
        />
        
        {activeModpack && (
          <button 
            className="mc-btn-primary"
            style={{ padding: '6px', background: '#222', borderColor: '#333', color: '#aaa', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => {
              setEditModpackName(activeModpack.name)
              setEditModpackIcon(activeModpack.icon || PRESET_ICONS[0])
              setConfirmDelete(false)
              setShowModpackSettingsModal(true)
            }}
          >
            <Settings size={18} />
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <button 
            className="mc-btn-primary mc-btn-yellow"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={14} /> {t("mods.create")}
          </button>
        </div>
      </div>

      {/* Top bar (Minecraft styled) */}
      <div className="mods-top-bar">
        <div style={{ position: 'relative', flex: 1 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="#aaa" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
            <path d="M22 22h-2v-2h2zm-2-2h-2v-2h2zm-6-2H6v-2h8zm4 0h-2v-2h2zM6 16H4v-2h2zm10 0h-2v-2h2zM4 14H2V6h2zm14 0h-2V6h2zM6 6H4V4h2zm10 0h-2V4h2zm-2-2H6V2h8z"/>
          </svg>
          <input 
            type="text" 
            className="mc-input" 
            placeholder={t("mods.search")} 
            style={{ paddingLeft: '35px', width: '100%' }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
            disabled={!activeModpack}
          />
        </div>
        
        <McSelect 
          value={projectType} 
          onChange={(v) => setProjectType(v)} 
          disabled={!activeModpack}
          options={[
            { value: 'mod', label: t("mods.mods") },
            { value: 'resourcepack', label: t("mods.resourcepacks") },
            { value: 'shader', label: t("mods.shaders") }
          ]}
        />

        <McSelect 
          value={sort} 
          onChange={(v) => setSort(v)} 
          disabled={!activeModpack}
          options={[
            { value: 'relevance', label: t("mods.relevance") },
            { value: 'downloads', label: t("mods.downloads") },
            { value: 'newest', label: t("mods.newest") },
            { value: 'updated', label: t("mods.updated") }
          ]}
        />
      </div>

      {/* Main Grid Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Installed Mods Left Panel */}
        {activeModpack && (
          <div 
            style={{ width: '220px', background: 'rgba(26,26,26,0.95)', borderRight: '2px solid #333', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              
              if (!activeModpack) return
              const files = Array.from(e.dataTransfer.files)
              let added = false
              
              for (const file of files) {
                if (file.name.endsWith('.jar') || file.name.endsWith('.zip')) {
                  try {
                    const buffer = await file.arrayBuffer()
                    // @ts-ignore
                    const result = await window.electronAPI.importModFile(file.name, buffer, activeModpack.name)
                    if (result.status === 'success') {
                      added = true
                    }
                  } catch (err) {
                    console.error('Failed to import file:', err)
                  }
                }
              }
              
              if (added) {
                // Refresh installed mods
                // @ts-ignore
                const installed = await window.electronAPI.getInstalledMods(activeModpack.name)
                
                setModpacks(prev => {
                  const updated = prev.map(mp => {
                    if (mp.name === activeModpack.name) {
                      return { ...mp, installedMods: installed }
                    }
                    return mp
                  })
                  // @ts-ignore
                  window.electronAPI.saveModpacks(updated)
                  return updated
                })
                
                setActiveModpack({ ...activeModpack, installedMods: installed })
              }
            }}
          >
            <div style={{ padding: '15px', fontWeight: 'bold', borderBottom: '1px solid var(--pg-dark3)', display: 'flex', justifyContent: 'space-between', color: 'white', fontSize: '14px' }}>
               <span>{t('mods.installed')} {projectType === 'resourcepack' ? t('mods.typeResourcepacks') : projectType === 'shader' ? t('mods.typeShaders') : t('mods.typeMods')} ({activeModpack.installedMods.filter(m => (m.type || 'mod') === projectType).length})</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '10px', gap: '5px' }}>
              {activeModpack.installedMods.filter(m => (m.type || 'mod') === projectType).length === 0 ? (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '20px', fontSize: '13px' }}>{t("mods.empty")}</div>
              ) : (
                activeModpack.installedMods.filter(m => (m.type || 'mod') === projectType).map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--pg-dark3)', borderRadius: '0', opacity: m.isEnabled === false ? 0.5 : 1 }}>
                    <Check size={16} color={m.isEnabled === false ? "#777" : "#2ecc71"} style={{ flexShrink: 0 }} />
                    <span style={{ color: 'white', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textDecoration: m.isEnabled === false ? 'line-through' : 'none' }}>{m.title}</span>
                    <button 
                      onClick={async () => {
                        try {
                          // @ts-ignore
                          await window.electronAPI.toggleMod(m.title, activeModpack.name, !(m.isEnabled !== false));
                          const updatedMp = { 
                            ...activeModpack, 
                            installedMods: activeModpack.installedMods.map(mod => mod.id === m.id ? { ...mod, isEnabled: (m.isEnabled === false) } : mod) 
                          };
                          setActiveModpack(updatedMp);
                          const updatedAll = modpacks.map(mp => mp.name === updatedMp.name ? updatedMp : mp);
                          persistModpacks(updatedAll);
                        } catch(e) { console.error(e) }
                      }} 
                      title={m.isEnabled === false ? "Enable" : "Disable"}
                      style={{ background: 'transparent', border: 'none', color: m.isEnabled === false ? '#aaa' : '#f39c12', cursor: 'pointer', padding: '2px', display: 'flex' }}
                    >
                      {m.isEnabled === false ? <PowerOff size={14} /> : <Power size={14} />}
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          // @ts-ignore
                          await window.electronAPI.uninstallMod(m.title, activeModpack.name);
                          const updatedMp = { ...activeModpack, installedMods: activeModpack.installedMods.filter(mod => mod.id !== m.id) };
                          setActiveModpack(updatedMp);
                          const updatedAll = modpacks.map(mp => mp.name === updatedMp.name ? updatedMp : mp);
                          persistModpacks(updatedAll);
                        } catch(e) { console.error(e) }
                      }} 
                      style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '2px', display: 'flex' }}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="mods-grid" onScroll={handleScroll} ref={listRef} style={{ flex: 1 }}>
          {!activeModpack ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px', color: 'white' }}>
              <Package size={48} />
              <p style={{ marginTop: '15px', fontFamily: '"Blocks", sans-serif', fontSize: '16px' }}>{t("mods.createOrSelect")}</p>
            </div>
          ) : loading ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px', color: '#aaa' }}>{t("mods.loading")}</div>
          ) : (
            <>
              {projectType === 'mod' && activeModpack?.loader === 'forge' && offset === 0 && (!query || query.toLowerCase().includes('opti')) && (
                <div className="mc-card" style={{ background: `rgba(20, 20, 20, ${opacity / 100})`, backdropFilter: blur ? 'blur(10px)' : 'none', WebkitBackdropFilter: blur ? 'blur(10px)' : 'none' }}>
                  <div className="mc-card-header">
                    <img src="https://optifine.net/favicon.ico" alt="icon" className="mc-card-icon" style={{ background: 'white' }} />
                    <div className="mc-card-title-area">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="mc-card-title">OptiFine</span>
                        <span className="mc-card-loader">(FORGE)</span>
                      </div>
                      <button className="mc-card-more" onClick={openOptifinePage}>•••</button>
                    </div>
                  </div>

                  <div className="mc-card-desc">
                    {t("mods.optifineDesc")}
                  </div>

                  <div className="mc-card-categories">
                    <img src={getCategoryIcon('optimization')} className="mc-card-cat-icon" title="optimization" />
                  </div>

                  <div className="mc-card-footer">
                    <div className="mc-card-meta">
                      <span>↓ ∞ dl</span>
                      <span>≡ {t("mods.alwaysFresh")}</span>
                    </div>
                    {isOptifineInstalled() ? (
                      <button className="mc-btn-primary" style={{ background: '#27ae60', borderColor: '#2ecc71' }}>{t("mods.isInstalled")}</button>
                    ) : downloading['optifine'] ? (
                      <button className="mc-btn-primary" disabled>...</button>
                    ) : (
                      <button className="mc-btn-primary" onClick={() => installOptifineManually()}>{t("mods.install")}</button>
                    )}
                  </div>
                </div>
              )}
              {results.map((mod: any) => (
                <div key={getModId(mod)} className="mc-card" style={{ background: `rgba(20, 20, 20, ${opacity / 100})`, backdropFilter: blur ? 'blur(10px)' : 'none', WebkitBackdropFilter: blur ? 'blur(10px)' : 'none' }}>
                  <div className="mc-card-header">
                    <img src={getModIcon(mod)} alt="icon" className="mc-card-icon" />
                    <div className="mc-card-title-area">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="mc-card-title">{getModTitle(mod)}</span>
                        <span className="mc-card-loader">({activeModpack.loader.toUpperCase()})</span>
                      </div>
                      <button className="mc-card-more" onClick={() => openModrinthPage(mod)}>•••</button>
                    </div>
                  </div>

                  <div className="mc-card-desc">
                    {getModDesc(mod)}
                  </div>

                  <div className="mc-card-categories">
                    {mod.display_categories?.slice(0, 3).map((cat: string) => (
                      <img key={cat} src={getCategoryIcon(cat)} className="mc-card-cat-icon" title={cat} />
                    ))}
                  </div>

                  <div className="mc-card-footer">
                    <div className="mc-card-meta">
                      <span>↓ {getModDownloads(mod)} dl</span>
                      <span>≡ {getModDate(mod)}</span>
                    </div>
                    {isInstalled(mod) ? (
                      <button className="mc-btn-primary" style={{ background: '#27ae60', borderColor: '#2ecc71' }}>{t("mods.isInstalled")}</button>
                    ) : downloading[getModId(mod)] ? (
                      <button className="mc-btn-primary" disabled>...</button>
                    ) : (
                      <button className="mc-btn-primary" onClick={() => installMod(mod)}>{t("mods.install")}</button>
                    )}
                  </div>
                </div>
              ))}
              {isFetchingMore && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#aaa' }}>{t("mods.loadMore")}</div>}
            </>
          )}
        </div>
      </div>

      {/* Create Modpack Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', padding: '20px', width: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '18px', color: 'white' }}>{t("mods.createModpackTitle")}</span>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.name")}</label>
                <input type="text" className="mc-input" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.loader")}</label>
                  <McSelect 
                    value={newLoader} 
                    onChange={v => setNewLoader(v)}
                    options={[
                      { value: 'fabric', label: 'Fabric' },
                      { value: 'forge', label: 'Forge' },
                      { value: 'quilt', label: 'Quilt' },
                      { value: 'neoforge', label: 'NeoForge' }
                    ]}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.gameVersion")}</label>
                  <McSelect 
                    value={newVersion} 
                    onChange={v => setNewVersion(v)}
                    options={gameVersions.map((v: string) => ({ value: v, label: v }))}
                  />
                </div>
              </div>

              {newLoader === 'forge' && (
                <div className="settings-checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={installOptifine} onChange={e => setInstallOptifine(e.target.checked)} />
                    {t("mods.installOptifine")}
                  </label>
                </div>
              )}

              <div className="settings-checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={installElybySkins} onChange={e => setInstallElybySkins(e.target.checked)} />
                  {t("mods.installElyby")}
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.icon")}</label>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <label 
                    onClick={async (e) => {
                      e.preventDefault()
                      // @ts-ignore
                      const dataUrl = await window.electronAPI.selectIconFile()
                      if (dataUrl) setNewIcon(dataUrl)
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '2px dashed #444', cursor: 'pointer', background: '#222' }}
                  >
                    <span style={{ fontSize: 20, color: '#aaa' }}>+</span>
                  </label>
                  {PRESET_ICONS.map(icon => (
                    <img 
                      key={icon} 
                      src={icon} 
                      width={32} 
                      height={32} 
                      style={{ 
                        cursor: 'pointer', 
                        border: newIcon === icon ? '2px solid var(--pg-yellow)' : '2px solid transparent',
                        padding: '2px',
                        objectFit: 'cover'
                      }} 
                      onClick={() => setNewIcon(icon)}
                    />
                  ))}
                </div>
              </div>

              <button className="mc-btn-primary" onClick={createModpack} style={{ marginTop: '10px', padding: '10px' }}>{t("mods.btnCreate")}</button>
            </div>
          </div>
        </div>
      )}


      {/* Modpack Settings Modal */}
      {showModpackSettingsModal && activeModpack && (
        <div className="modal-overlay" onClick={() => setShowModpackSettingsModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', padding: '20px', width: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '18px', color: 'white' }}>{t("mods.modpackSettings")}</span>
              <button onClick={() => setShowModpackSettingsModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.name")}</label>
                <input type="text" className="mc-input" value={editModpackName} onChange={e => setEditModpackName(e.target.value)} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px' }}>{t("mods.icon")}</label>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <label 
                    onClick={async (e) => {
                      e.preventDefault()
                      // @ts-ignore
                      const dataUrl = await window.electronAPI.selectIconFile()
                      if (dataUrl) setEditModpackIcon(dataUrl)
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '2px dashed #444', cursor: 'pointer', background: '#222' }}
                  >
                    <span style={{ fontSize: 20, color: '#aaa' }}>+</span>
                  </label>
                  {PRESET_ICONS.map(icon => (
                    <img 
                      key={icon} 
                      src={icon} 
                      width={32} 
                      height={32} 
                      style={{ 
                        cursor: 'pointer', 
                        border: editModpackIcon === icon ? '2px solid var(--pg-yellow)' : '2px solid transparent',
                        padding: '2px',
                        objectFit: 'cover'
                      }} 
                      onClick={() => setEditModpackIcon(icon)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  className="mc-btn-primary" 
                  onClick={() => {
                    if (confirmDelete) {
                      deleteModpack()
                    } else {
                      setConfirmDelete(true)
                    }
                  }} 
                  style={{ flex: 1, padding: '10px', background: '#e74c3c', borderColor: '#c0392b', color: 'white' }}
                >
                  {confirmDelete ? t('mods.areYouSure') : t('mods.deleteModpack')}
                </button>
                <button className="mc-btn-primary" onClick={saveModpackSettings} style={{ flex: 1, padding: '10px' }}>{t("mods.save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
