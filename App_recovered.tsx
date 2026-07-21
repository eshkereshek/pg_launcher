import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation, type Language } from './i18n'
import { Trash, Folder, Play, Image, Brush, Settings, Wrench, Sparkles, ChevronDown, X } from 'lucide-react'
import ModsMenu from './ModsMenu'
import ModpacksMenu from './ModpacksMenu'
import { ServersMenu } from './ServersMenu'
import SkinsMenu from './SkinsMenu'
import { McSelect } from './McSelect'
import pkg from '../package.json'

interface Modpack {
  name: string
  loader: string
  version: string
  installedMods: { id: string; title: string; type?: string }[]
  icon?: string
}

interface Account {
  id: string
  name: string
  type: 'offline' | 'elyby' | 'microsoft'
  uuid?: string
  token?: string
  clientToken?: string
  skinUrl?: string
}

const saveCompressedImage = (file: File, key: string, callback: (dataUrl: string) => void) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    if (width > 1920 || height > 1080) {
      const ratio = Math.min(1920 / width, 1080 / height);
      width *= ratio;
      height *= ratio;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    try {
      localStorage.setItem(key, dataUrl);
      callback(dataUrl);
    } catch (e) {
      console.error('Failed to save image to localStorage', e);
      alert('Картинка слишком большая!');
    }
  };
  img.src = URL.createObjectURL(file);
};

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

export default function App() {
  const { t, language, setLanguage } = useTranslation();
  const [view, setView] = useState<'play' | 'installations' | 'modpacks' | 'skins' | 'settings' | 'servers'>('play')
  const [showAccountsModal, setShowAccountsModal] = useState(false)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showVersionDropdown, setShowVersionDropdown] = useState(false)
  const [isClosingVersionDropdown, setIsClosingVersionDropdown] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')



  const [settingsTab, setSettingsTab] = useState<'main' | 'customization' | 'experimental'>('main')
  const [mainBgDataUrl, setMainBgDataUrl] = useState<string | null>(() => localStorage.getItem('mc_main_bg_data'))
  const [secBgDataUrl, setSecBgDataUrl] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'))

  const [isClosingSettings, setIsClosingSettings] = useState(false);
  const [hideLauncherOnPlay, setHideLauncherOnPlay] = useState(() => localStorage.getItem('hideLauncherOnPlay') === 'true');

  const handleCloseSettings = () => {
    setIsClosingSettings(true);
    setTimeout(() => {
      setView('play');
      setIsClosingSettings(false);
      setTheme(localStorage.getItem('mc_theme') || 'dark');
    }, 200);
  };

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
      let stateStr = "В главном меню"
      if (view === 'installations') stateStr = "Устанавливает версии"
      if (view === 'modpacks') stateStr = "Выбирает моды"
      if (view === 'skins') stateStr = "Примеряет скины"
      if (view === 'settings') stateStr = "В настройках"
      
      // @ts-ignore
      window.electronAPI.updateDiscordPresence({
        details: "В лаунчере",
        state: stateStr,
        largeImageKey: "logo",
        largeImageText: "Pagrysha Launcher"
      })
    }
  }, [view])

  const handleCloseVersionDropdown = () => {
    setIsClosingVersionDropdown(true)
    setTimeout(() => {
      setShowVersionDropdown(false)
      setIsClosingVersionDropdown(false)
    }, 200)
  }

  const [accounts, setAccounts] = useState<Account[]>([{ id: '1', name: 'Player', type: 'offline' }])
  const [activeAccount, setActiveAccount] = useState<Account>({ id: '1', name: 'Player', type: 'offline' })
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authType, setAuthType] = useState<'offline' | 'elyby' | 'microsoft'>('offline')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [rawVersions, setRawVersions] = useState<any[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [installedVersions, setInstalledVersions] = useState<string[]>([])
  const [modpacks, setModpacks] = useState<Modpack[]>([])

  const [selectedVersion, setSelectedVersion] = useState(() => localStorage.getItem('lastVersion') || '')
  const [launching, setLaunching] = useState(false)
  const [gameRunning, setGameRunning] = useState(false)
  const [crashLog, setCrashLog] = useState<string | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<{ id: string, name: string, text: string, progress: number }[]>([])
  const [showDownloadsDropdown, setShowDownloadsDropdown] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState('')
    try {
  const [showModpackSettingsModal, setShowModpackSettingsModal] = useState(false)
  const [editModpackName, setEditModpackName] = useState('')
  const [editModpackIcon, setEditModpackIcon] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  const activeModpack = useMemo(() => {
    if (!selectedVersion || !selectedVersion.startsWith('mp:')) return null
    return modpacks.find(mp => mp.name === selectedVersion.replace('mp:', '')) || null
  }, [modpacks, selectedVersion])
        navigator.clipboard.writeText(data.url)
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
  const [activeDownloads, setActiveDownloads] = useState<{ id: string, name: string, text: string, progress: number }[]>([])
    const updated = modpacks.map(mp => {
      if (mp.name === activeModpack.name) {
        return { ...mp, name: safeEditName, icon: editModpackIcon }
      }
      return mp
    })
    
    setModpacks(updated)
    // @ts-ignore
    window.electronAPI.saveModpacks(updated)
    
    setSelectedVersion(`mp:${safeEditName}`)









































































































































































  }

  // Settings State
  const [showSnapshots, setShowSnapshots] = useState(localStorage.getItem('mc_show_snapshots') === 'true')
  const [showModified, setShowModified] = useState(localStorage.getItem('mc_show_modified') !== 'false')
  const [showOldReleases, setShowOldReleases] = useState(localStorage.getItem('mc_show_old_releases') !== 'false')
  const [showBeta, setShowBeta] = useState(localStorage.getItem('mc_show_beta') === 'true')











  const [theme, setTheme] = useState(() => localStorage.getItem('mc_theme') || 'dark')

  useEffect(() => {
    const root = document.documentElement;
    const themes: Record<string, Record<string, string>> = {
      dark: {
        '--pg-black': '#111111',
        '--pg-dark': '#1a1a1a',
        '--pg-dark2': '#222222',
        '--pg-dark3': '#2a2a2a',
        '--pg-text': '#ffffff',
        '--pg-text-muted': '#888888',
        '--pg-yellow': '#ffca24',
        '--pg-yellow-hover': '#ffd64a',
        '--pg-yellow-highlight': '#ffe675',
        '--pg-yellow-dark': '#b38500',
        '--pg-yellow-shadow': '#805c00',
        '--pg-hover': 'rgba(255, 255, 255, 0.05)',
        '--pg-active': 'rgba(255, 255, 255, 0.1)',
        '--pg-icon-filter': 'brightness(0) invert(1)',
      },
      light: {
        '--pg-black': '#ffffff',
        '--pg-dark': '#f5f5f5',
        '--pg-dark2': '#e0e0e0',
        '--pg-dark3': '#cccccc',
        '--pg-text': '#111111',
        '--pg-text-muted': '#666666',
        '--pg-yellow': '#e2a300',
        '--pg-yellow-hover': '#f0b400',
        '--pg-yellow-highlight': '#ffdf7a',
        '--pg-yellow-dark': '#a37200',
        '--pg-yellow-shadow': '#6e4c00',
        '--pg-hover': 'rgba(0, 0, 0, 0.06)',
        '--pg-active': 'rgba(0, 0, 0, 0.12)',
        '--pg-icon-filter': 'brightness(0)',
      },
      warm_dark: {
        '--pg-black': '#1c1816',
        '--pg-dark': '#27211e',
        '--pg-dark2': '#332b27',
        '--pg-dark3': '#3f3530',
        '--pg-text': '#f7ebe1',
        '--pg-text-muted': '#a69285',
        '--pg-yellow': '#d97736',
        '--pg-yellow-hover': '#e88848',
        '--pg-yellow-highlight': '#fcae79',
        '--pg-yellow-dark': '#ad531f',
        '--pg-yellow-shadow': '#803810',
        '--pg-hover': 'rgba(255, 255, 255, 0.05)',
        '--pg-active': 'rgba(255, 255, 255, 0.1)',
        '--pg-icon-filter': 'brightness(0) invert(1)',
      },
      warm_white: {
        '--pg-black': '#fdfaf6',
        '--pg-dark': '#f5eedc',
        '--pg-dark2': '#ebdcb9',
        '--pg-dark3': '#dcc899',
        '--pg-text': '#2c241c',
        '--pg-text-muted': '#7d6b5c',
        '--pg-yellow': '#c68936',
        '--pg-yellow-hover': '#d99743',
        '--pg-yellow-highlight': '#f2be7e',
        '--pg-yellow-dark': '#966320',
        '--pg-yellow-shadow': '#664110',
        '--pg-hover': 'rgba(0, 0, 0, 0.06)',
        '--pg-active': 'rgba(0, 0, 0, 0.12)',
        '--pg-icon-filter': 'brightness(0)',
      },
      cold_dark: {
        '--pg-black': '#0f131a',
        '--pg-dark': '#171d26',
        '--pg-dark2': '#212936',
        '--pg-dark3': '#2d3848',
        '--pg-text': '#e2e8f0',
        '--pg-text-muted': '#8090a8',
        '--pg-yellow': '#39b54a',
        '--pg-yellow-hover': '#43c555',
        '--pg-yellow-highlight': '#5cdb6e',
        '--pg-yellow-dark': '#2a8b36',
        '--pg-yellow-shadow': '#1d6225',
        '--pg-hover': 'rgba(255, 255, 255, 0.05)',
        '--pg-active': 'rgba(255, 255, 255, 0.1)',
        '--pg-icon-filter': 'brightness(0) invert(1)',
      },
      cold_white: {
        '--pg-black': '#ffffff',
        '--pg-dark': '#f0f4f8',
        '--pg-dark2': '#d9e2ec',
        '--pg-dark3': '#bcccdc',
        '--pg-text': '#102a43',
        '--pg-text-muted': '#627d98',
        '--pg-yellow': '#39b54a',
        '--pg-yellow-hover': '#43c555',
        '--pg-yellow-highlight': '#5cdb6e',
        '--pg-yellow-dark': '#2a8b36',
        '--pg-yellow-shadow': '#1d6225',
        '--pg-hover': 'rgba(0, 0, 0, 0.06)',
        '--pg-active': 'rgba(0, 0, 0, 0.12)',
        '--pg-icon-filter': 'brightness(0)',
      }
    };
    // @ts-ignore
    const activeTheme = themes[theme] || themes.dark;
    Object.entries(activeTheme).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });
  }, [theme]);
    if (window.electronAPI && window.electronAPI.checkUpdates) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.titlebar-downloads') && !target.closest('.downloads-dropdown')) {







































        if (saved) {
          setModpacks(saved)
          if (selectedVersion.startsWith('mp:')) {
            const mpName = selectedVersion.replace('mp:', '')
            if (!saved.some((m: any) => m.name === mpName)) {
              if (versions.length > 0) {
                setSelectedVersion(versions[0])
              } else {
                setSelectedVersion('')
              }
            }
          }
        }
      } catch (e) { console.error(e) }
    }
    fetchModpacks()
  }, [view, versions, selectedVersion])

  useEffect(() => {
    let filtered = rawVersions
    if (!showSnapshots) filtered = filtered.filter(v => v.type !== 'snapshot')
    if (!showOldReleases) filtered = filtered.filter(v => v.type !== 'old_alpha' && v.type !== 'old_beta')
    setVersions(filtered.map(v => v.id))
    const finalVersions: string[] = []
    if (filtered.length > 0 && !selectedVersion) {
      setSelectedVersion(filtered[0].id)
    }
  }, [rawVersions, showSnapshots, showModified, showOldReleases, showBeta, showAlpha])
      }
  useEffect(() => {
    if (selectedVersion) localStorage.setItem('lastVersion', selectedVersion)
  }, [selectedVersion])
    if (finalVersions.length > 0 && !selectedVersion) {
  const saveSettings = () => {
    localStorage.setItem('mc_ram', ramValue.toString())
    localStorage.setItem('mc_show_snapshots', showSnapshots.toString())
    localStorage.setItem('mc_show_modified', showModified.toString())
    localStorage.setItem('mc_show_old_releases', showOldReleases.toString())
    localStorage.setItem('mc_show_beta', showBeta.toString())
    localStorage.setItem('mc_show_alpha', showAlpha.toString())
    localStorage.setItem('mc_args', mcArgs)
  const saveSettings = () => {
    localStorage.setItem('mc_ram', ramValue.toString())
    localStorage.setItem('mc_show_snapshots', showSnapshots.toString())
    localStorage.setItem('mc_show_modified', showModified.toString())
    localStorage.setItem('mc_show_old_releases', showOldReleases.toString())























































  const removeAccount = (id: string) => {
    if (accounts.length <= 1) return
    const newAccounts = accounts.filter(a => a.id !== id)
    saveAccounts(newAccounts, newAccounts[0])
  }

  const handleLaunch = async () => {
    if (gameRunning) return;
    if (!activeAccount) {
      alert('Пожалуйста, выберите или добавьте аккаунт для игры!');
      setShowAccountsModal(true);
      return;
    }
    setGameRunning(true)
    setLaunching(true)
    setProgress('Инициализация запуска...')

    // Check if a modpack is selected
    const isModpack = selectedVersion.startsWith('mp:')
    let launchOpts: any = {
      version: selectedVersion,
      username: activeAccount.name,
      uuid: activeAccount.uuid,
      token: activeAccount.token,
      clientToken: activeAccount.clientToken,
      authType: activeAccount.type,
      memory: { max: `${ramValue}M`, min: '1024M' },
      instanceId: selectedVersion
    }

    if (isModpack) {
      const mpName = selectedVersion.replace('mp:', '')
      const mp = modpacks.find(m => m.name === mpName)
      if (mp) {
        launchOpts.version = mp.version
        launchOpts.loader = mp.loader
        launchOpts.modpackName = mp.name
        launchOpts.instanceId = mp.name
      }
    }

    try {
      if (hideLauncherOnPlay) {
        // @ts-ignore
        window.electronAPI.windowHide()













































































































































































































































































            <div className="jl-bottom-btn outlined" onClick={openFolder}>
              <Folder size={18} /> {t("app.gameFolder")}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="jl-main" style={view === 'play' || view === 'skins' ? { backgroundImage: mainBgDataUrl ? `url("${mainBgDataUrl}")` : 'url("./background.jpg")' } : {}}>
          view === 'play' || view === 'skins' ? { backgroundImage: mainBgDataUrl ? `url("${mainBgDataUrl}")` : 'url("./background.jpg")' } : 
          <style>{`
          @keyframes progress-bar-stripes {
            from { background-position: 40px 0; }
            to { background-position: 0 0; }
          }
          .progress-striped {
            background-image: linear-gradient(
              45deg,
              rgba(255, 255, 255, 0.15) 25%,
              transparent 25%,
              transparent 50%,
              rgba(255, 255, 255, 0.15) 50%,
































































                      if (showVersionDropdown) handleCloseVersionDropdown()
                      else setShowVersionDropdown(true)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                  >
                    <img
                      src={selectedVersion.startsWith('mp:')
                        ? (modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png')
                        : './iconsblocks/Grass_Block_(inventory)_MCE.png'}
                      width={40} height={40}
                      alt="icon"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold', textTransform: 'none', letterSpacing: '0.5px' }}>




                          {formatVersionLabel(selectedVersion)}
                        </span>
                        {isModified && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); setSettingsTab('main'); setView('settings'); }}
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#888' }}
                            className="hover-white-icon"
                            title="Настройки версии"
                          >
                            <Wrench size={13} />
                          </div>
                        )}
                        {loaderType === 'forge' && (
                          <div title="Forge Loader" style={{ display: 'flex', alignItems: 'center' }}>
                            <svg viewBox="0 0 100 100" width="13" height="13">
                              <path d="M10 30 L90 30 L90 45 C75 45 65 55 65 70 L75 70 L75 80 L25 80 L25 70 L35 70 L35 55 C35 45 25 45 10 45 Z" fill="#df6a26" stroke="#111" strokeWidth="6" strokeLinejoin="round" />
                              <path d="M10 30 L90 30 L90 45 C75 45 65 55 65 70 L75 70 L75 80 L25 80 L25 70 L35 70 L35 55 C35 45 25 45 10 45 Z" fill="#df6a26" />
                              <rect x="20" y="80" width="60" height="10" fill="#a04010" stroke="#111" strokeWidth="6" strokeLinejoin="round" />
                              <rect x="20" y="80" width="60" height="10" fill="#a04010" />
                            </svg>
                          </div>



















                              <span style={{ color: 'var(--pg-text)', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--pg-dark2)', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                      {versions.map(v => (
                        <div
                          key={v}
                          className="dropdown-item"
                          onClick={() => { setSelectedVersion(v); handleCloseVersionDropdown(); }}
                          style={{
                            padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--pg-dark3)',
                            background: installedVersions.includes(v) ? 'var(--pg-active)' : 'transparent'
                          }}
                        >
                          <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={24} height={24} />
                          <span style={{ color: installedVersions.includes(v) ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: installedVersions.includes(v) ? 'bold' : 'normal', flex: 1 }}>
                            {v} {installedVersions.includes(v) && t('app.downloaded')}
                          </span>
                          {installedVersions.includes(v) && (
                            <div
                              title="Переустановить"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Переустановить ${v}?`)) {
                                  // @ts-ignore
                                  await window.electronAPI.deleteModpackFolder(v);
                                  setInstalledVersions(installedVersions.filter(iv => iv !== v));
                                }
                              }}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'var(--pg-dark2)', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <RefreshCw size={14} color="var(--pg-text-muted)" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>










                  {(showVersionDropdown || isClosingVersionDropdown) && (
                    <div className={`dropdown-menu ${isClosingVersionDropdown ? 'closing' : ''}`} style={{ position: 'absolute', bottom: 'calc(100% + 15px)', left: 0, minWidth: '280px', background: 'var(--pg-dark)', border: '2px solid var(--pg-dark3)', maxHeight: '300px', overflowY: 'auto', zIndex: 100, boxShadow: '0 -5px 15px rgba(0,0,0,0.5)' }}>
                      {modpacks.length > 0 && (
                        <>
                          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--pg-dark2)', textTransform: 'uppercase' }}>{t("app.myModpacks")}</div>
                          {modpacks.map(mp => (
                            <div
                              key={mp.name}
                              className="dropdown-item"
                              onClick={() => { setSelectedVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                              style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--pg-dark3)' }}
                            >
                              <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={24} height={24} style={{ objectFit: 'cover' }} />
                              <span style={{ color: 'var(--pg-text)', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--pg-dark2)', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                      {versions.map(v => (
                        <div
                          key={v}
                          className="dropdown-item"
                          onClick={() => { setSelectedVersion(v); handleCloseVersionDropdown(); }}
                          style={{
                            padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--pg-dark3)',
                            background: installedVersions.includes(v) ? 'var(--pg-active)' : 'transparent'
                          }}
                        >
                          <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={24} height={24} />
                          <span style={{ color: installedVersions.includes(v) ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: installedVersions.includes(v) ? 'bold' : 'normal' }}>
                            {v} {installedVersions.includes(v) && t('app.downloaded')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                        setConfirmDelete(false);
                {/* Play Button (Center) */}
                <div
                  className="jl-exp-play-btn"
                  onClick={(!launching && !gameRunning) ? handleLaunch : undefined}
                  style={{
                    cursor: (launching || gameRunning) ? 'default' : 'pointer',
                    filter: (launching || gameRunning) ? 'grayscale(1)' : 'none',
                    opacity: (launching || gameRunning) ? 0.5 : 1,
                  }}
                >
                  <span style={{
























                        onClick={() => {
                          if (showVersionDropdown) handleCloseVersionDropdown()
                          else setShowVersionDropdown(true)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: '200px' }}
                      >
                        <img
                          src={selectedVersion.startsWith('mp:')
                            ? (modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png')
                            : './iconsblocks/Grass_Block_(inventory)_MCE.png'}
                          width={32} height={32}
                          alt="icon"
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', color: 'white', fontWeight: 'bold' }}>
                            {selectedVersion.startsWith('mp:') ? selectedVersion.replace('mp:', '') : selectedVersion || t("app.selectVersion")}









                                  className="dropdown-item"
                                  onClick={() => { setSelectedVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                  style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--pg-dark3)' }}
                                >
                                  <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={24} height={24} style={{ objectFit: 'cover' }} />
                                  <span style={{ color: 'var(--pg-text)', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                                </div>
                              ))}
                            </>
                          )}
                          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--pg-dark2)', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                          {versions.map(v => (
                            <div
                              key={v}
                              className="dropdown-item"
                              onClick={() => { setSelectedVersion(v); handleCloseVersionDropdown(); }}
                              style={{
                                padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--pg-dark3)',
                                background: installedVersions.includes(v) ? 'var(--pg-active)' : 'transparent'
                              }}
                            >
                              <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={24} height={24} />
                              <span style={{ color: installedVersions.includes(v) ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: installedVersions.includes(v) ? 'bold' : 'normal' }}>
                                {v} {installedVersions.includes(v) && t('app.downloaded')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="jl-play-btn-wrapper hover-scale-btn"
                    onClick={(!launching && !gameRunning) ? handleLaunch : undefined}
                    style={{
                      zIndex: 10, position: 'relative', width: '220px', height: '70px',
                      cursor: (launching || gameRunning) ? 'default' : 'pointer', filter: (launching || gameRunning) ? 'grayscale(1)' : 'none', opacity: (launching || gameRunning) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >



























































              </button>
            </div>
            {settingsTab === 'main' ? (
              <div className="settings-grid" style={{ marginTop: '10px' }}>
                <div className="settings-label">{t("app.versionList")}</div>
                <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={showSnapshots} onChange={e => setShowSnapshots(e.target.checked)} /> {t("app.showSnapshots")}</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={showModified} onChange={e => setShowModified(e.target.checked)} /> {t("app.showModified")}</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={showOldReleases} onChange={e => setShowOldReleases(e.target.checked)} /> {t("app.showOldReleases")}</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={showBeta} onChange={e => setShowBeta(e.target.checked)} /> {t("app.showBeta")}</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" checked={showAlpha} onChange={e => setShowAlpha(e.target.checked)} /> {t("app.showAlpha")}</label>
                </div>

                <div className="settings-label" style={{ marginTop: '20px' }}>{t("app.minecraftArguments")}</div>
                <div className="settings-input-wrapper" style={{ marginTop: '20px' }}>
                  <input type="text" value={mcArgs} onChange={e => setMcArgs(e.target.value)} placeholder={t("app.mcArgsPlaceholder")} className="mc-input" style={{ width: '100%' }} />
                </div>

                <div className="settings-label" style={{ marginTop: '20px' }}>{t("app.javaSelection")}</div>
                <div className="settings-java-row" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <McSelect 



















                      onChange={(v) => setLanguage(v as Language)} 
                      options={[
                        { value: 'ru', label: 'Русский', icon: '🇷🇺' },
                        { value: 'en', label: 'English', icon: '🇬🇧' }
                      ]} 
                      style={{ width: '200px' }} 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">Тема оформления</div>
                  <div style={{ marginTop: '5px' }}>
                    <McSelect 
                      value={theme} 
                      onChange={(v) => setTheme(v)} 
                      options={[
                        { value: 'dark', label: 'Темная (по умолчанию)' },
                        { value: 'light', label: 'Светлая' }
                      ]} 
                      style={{ width: '250px' }} 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">{t('app.mainBg')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                    {mainBgDataUrl && (
                      <img src={mainBgDataUrl} style={{ width: '192px', height: '108px', objectFit: 'cover', border: '2px solid #333', borderRadius: '4px' }} alt="Main Preview" />
                    )}



















                        { value: 'ru', label: 'Русский', icon: '🇷🇺' },
                        { value: 'en', label: 'English', icon: '🇬🇧' }
                      ]} 
                      style={{ width: '200px' }} 
                    />
                  </div>
                </div>
                        {t('app.selectFile')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">Тема оформления</div>
                  <div style={{ marginTop: '5px' }}>
                    <McSelect 
                      value={theme} 
                      onChange={(v) => setTheme(v)} 
                      options={[
                        { value: 'dark', label: 'Темная (по умолчанию)' },
                        { value: 'light', label: 'Светлая' },
                        { value: 'warm_dark', label: 'Темная теплая' },
                        { value: 'warm_white', label: 'Теплая Белая' },
                        { value: 'cold_dark', label: 'Холодная Темная' },
                        { value: 'cold_white', label: 'Холодная белая' }
                          }
                        }} />
                      </label>
                      {mainBgDataUrl && (
                        <button className="mc-btn-primary" style={{ background: '#c0392b', borderColor: '#e74c3c' }} onClick={() => { localStorage.removeItem('mc_main_bg_data'); setMainBgDataUrl(null); }}>
                          {t('app.reset')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">{t('app.secBg')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                    {secBgDataUrl && (
                      <img src={secBgDataUrl} style={{ width: '192px', height: '108px', objectFit: 'cover', border: '2px solid #333', borderRadius: '4px' }} alt="Secondary Preview" />
                    )}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label className="mc-btn-primary" style={{ cursor: 'pointer', padding: '8px 15px', color: 'white' }}>
                        {t('app.selectFile')}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: any) => {
                          if (e.target.files && e.target.files[0]) {
                            saveCompressedImage(e.target.files[0], 'mc_sec_bg_data', (url) => setSecBgDataUrl(url));
                          }
                        }} />
                      </label>
                      <button className="mc-btn-primary" style={{ background: '#e74c3c', borderColor: '#c0392b', color: 'white', padding: '8px 15px' }} onClick={() => {
                        localStorage.removeItem('mc_sec_bg_data');
                        setSecBgDataUrl(null);
                      }}>{t('app.reset')}</button>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>{t("app.secBgWarning")}</span>
                </div>


























































































































































      {/* Crash Modal */}
      {crashLog !== null && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }} onClick={() => setCrashLog(null)}>
          <div className="modal-box" style={{ background: '#111', border: '3px solid #000', boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #0a0a0a', padding: '30px', width: '800px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ color: '#e74c3c', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontFamily: '"Blocks", sans-serif' }}>Игра Крашнулась!</h2>
                <span style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>Лог ошибки запуска</span>
              </div>
              <button
                onClick={() => setCrashLog(null)}
                className="mc-btn-primary"
                style={{ padding: '6px 10px', background: '#222', border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '14px', lineHeight: '14px', textTransform: 'lowercase' }}>x</span>
              </button>
            </div>
            
            <div style={{ 
              background: '#000', 
              color: '#0f0', 
              fontFamily: 'monospace', 
              fontSize: '12px', 
              padding: '10px', 
              height: '400px', 
              overflowY: 'auto',
              border: '1px solid #333',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              userSelect: 'text'
            }}>
              {crashLog}
            </div>
            
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="mc-btn-primary mc-btn-yellow" onClick={() => setCrashLog(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
              </div>
              <button
                onClick={() => setCrashLog(null)}
                className="mc-btn-primary"
                style={{ padding: '6px 10px', background: '#222', border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '14px', lineHeight: '14px', textTransform: 'lowercase' }}>x</span>
              </button>
            </div>
            




              fontSize: '12px', 
              padding: '10px', 
              height: '400px', 
              overflowY: 'auto',
              border: '1px solid #333',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              userSelect: 'text'
            }}>
              {crashLog}
            </div>
            
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="mc-btn-primary mc-btn-green" onClick={handleSendLog} disabled={logUploadState === 'uploading'}>
                {logUploadState === 'idle' ? 'Отправить лог разработчику' : logUploadState === 'uploading' ? 'Загрузка...' : logUploadState === 'uploaded' ? 'Ссылка скопирована!' : 'Ошибка загрузки'}
              </button>
              <button className="mc-btn-primary mc-btn-yellow" onClick={() => setCrashLog(null)}>
                Закрыть
              </button>
            </div>
          </div>