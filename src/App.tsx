import React, { useState, useEffect, useRef } from 'react'
import { useTranslation, type Language } from './i18n'
import { Trash, Folder, Play } from 'lucide-react'
import ModsMenu from './ModsMenu'
import ModpacksMenu from './ModpacksMenu'
import { ServersMenu } from './ServersMenu'
import { McSelect } from './McSelect'
import pkg from '../package.json'
import WardrobeMenu from './WardrobeMenu'

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
  type: 'offline' | 'elyby' | 'microsoft' | 'pgsync'
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

const FORGE_VERSIONS = [
  '26.2', '26.1.2', '26.1.1', '26.1',
  '1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5',
  '1.21.4', '1.21.3', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
  '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
  '1.18.2', '1.18.1', '1.18', '1.17.1', '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1',
  '1.15.2', '1.15.1', '1.15', '1.14.4', '1.14.3', '1.14.2', '1.13.2', '1.12.2', '1.11.2', '1.10.2', '1.9.4', '1.8.9', '1.7.10'
]
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
  './iconsblocks/End_Stone_(inventory)_MCE.png'
];

const renderLoaderIcon = (verName: string) => {
  if (!verName) return null;
  const lower = verName.toLowerCase();
  if (lower.includes('forge')) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }} title="Forge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#e67e22" style={{ imageRendering: 'pixelated' }}>
          <path d="M1 2h14v3h-3v1c0 1.5-1 2.5-2 3v1h3v3H2v-3h3v-1c-1-.5-2-1.5-2-3V5H1V2z" />
        </svg>
      </span>
    );
  }
  if (lower.includes('fabric')) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }} title="Fabric">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#bdc3c7" style={{ imageRendering: 'pixelated' }}>
          <path d="M3 1a1 1 0 0 1 1-1h5l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V1zm6 0v3h3L9 1z" />
        </svg>
      </span>
    );
  }
  if (lower.includes('quilt')) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }} title="Quilt">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#9b59b6">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <path d="M4 4h8v8H4z" fill="#8e44ad" />
        </svg>
      </span>
    );
  }
  return null;
};

const renderSelectedVersionIcon = (selectedVersion: string, modpacks: any[], size = 46) => {
  if (!selectedVersion) return <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="icon" />;
  const lower = selectedVersion.toLowerCase();
  if (lower.startsWith('mp:')) {
    const mpName = selectedVersion.replace('mp:', '');
    const mp = modpacks.find(m => m.name === mpName);
    if (mp) {
      if (mp.icon) {
        return <img src={mp.icon} width={size} height={size} style={{ objectFit: 'cover' }} alt="icon" />;
      }
      const lLower = (mp.loader || '').toLowerCase();
      if (lLower.includes('forge')) {
        return <img src="./iconsblocks/Anvil.png" width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="Forge" />;
      }
      if (lLower.includes('fabric')) {
        return (
          <svg width={size} height={size} viewBox="0 0 16 16" fill="#bdc3c7" style={{ imageRendering: 'pixelated' }}>
            <path d="M3 1a1 1 0 0 1 1-1h5l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V1zm6 0v3h3L9 1z" />
          </svg>
        );
      }
      if (lLower.includes('quilt')) {
        return (
          <svg width={size} height={size} viewBox="0 0 16 16" fill="#9b59b6">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <path d="M4 4h8v8H4z" fill="#8e44ad" />
          </svg>
        );
      }
      return <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="icon" />;
    }
  }
  if (lower.includes('forge')) {
    return <img src="./iconsblocks/Anvil.png" width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="Forge" />;
  }
  if (lower.includes('fabric')) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="#bdc3c7" style={{ imageRendering: 'pixelated' }}>
        <path d="M3 1a1 1 0 0 1 1-1h5l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V1zm6 0v3h3L9 1z" />
      </svg>
    );
  }
  if (lower.includes('quilt')) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="#9b59b6">
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M4 4h8v8H4z" fill="#8e44ad" />
      </svg>
    );
  }
  return <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="icon" />;
};

export default function App() {
  const { t, language, setLanguage } = useTranslation();
  const [view, setView] = useState<'play' | 'installations' | 'modpacks' | 'settings' | 'servers' | 'wardrobe' | 'accounts'>('play')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showVersionDropdown, setShowVersionDropdown] = useState(false)
  const [isClosingVersionDropdown, setIsClosingVersionDropdown] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')

  const [settingsTab, setSettingsTab] = useState<'customization' | 'main' | 'experimental'>('customization')
  const [mainBgDataUrl, setMainBgDataUrl] = useState<string | null>(() => localStorage.getItem('mc_main_bg_data'))
  const [secBgDataUrl, setSecBgDataUrl] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'))


  // Ping the server to wake it up on launcher start
  useEffect(() => {
    fetch('https://pg-sync-server.onrender.com/').catch(() => {});
  }, []);

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
      let stateStr = "В главном меню"
      if (view === 'installations') stateStr = "Устанавливает версии"
      if (view === 'modpacks') stateStr = "Выбирает моды"
      if (view === 'settings') stateStr = "В настройках"
      if (view === 'accounts') stateStr = "Управление аккаунтами"
      
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
  const [skinTimestamp, setSkinTimestamp] = useState<number>(Date.now())
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authType, setAuthType] = useState<'offline' | 'elyby' | 'microsoft' | 'pgsync'>('offline')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<'offline' | 'elyby' | 'pgsync' | null>(null)

  const [rawVersions, setRawVersions] = useState<any[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [forgeVersions] = useState<string[]>(FORGE_VERSIONS.map(v => `${v} Forge`))
  const [installedVersions, setInstalledVersions] = useState<string[]>([])
  const [modpacks, setModpacks] = useState<Modpack[]>([])

  const [selectedVersion, setSelectedVersion] = useState(localStorage.getItem('mc_selected_version') || '')
  const [launching, setLaunching] = useState(false)
  const [gameRunning, setGameRunning] = useState(false)
  const [crashLog, setCrashLog] = useState<string | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<{ id: string, name: string, text: string, progress: number }[]>([])
  const [showDownloadsDropdown, setShowDownloadsDropdown] = useState(false)
  const [isClosingDownloadsDropdown, setIsClosingDownloadsDropdown] = useState(false)
  const [justCompletedDownloads, setJustCompletedDownloads] = useState(false)
  const downloadsCloseTimerRef = useRef<any>(null)
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState('')


  const MinecraftFace = ({ acc, size = 32 }: { acc: Account, size?: number }) => {
    if (acc.type !== 'elyby' && acc.type !== 'pgsync') {
      const url = acc.skinUrl || `https://minotar.net/helm/${acc.name}/${size}.png`;
      return <img src={url} width={size} height={size} style={{ imageRendering: 'pixelated', borderRadius: 0, width: size, height: size }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://minotar.net/helm/Steve/${size}.png`; }} alt="Skin" />
    }

    const rawSkinUrl = acc.type === 'pgsync' 
      ? `https://pg-sync-server.onrender.com/api/cosmetics/${acc.name}/skin.png?v=${skinTimestamp}` 
      : `http://skinsystem.ely.by/skins/${acc.name}.png?v=${skinTimestamp}`;



    return (
      <div style={{
        width: size,
        height: size,
        position: 'relative',
        overflow: 'hidden',
        imageRendering: 'pixelated',
        borderRadius: 0,
        minWidth: size,
        minHeight: size
      }}>
        <img src={rawSkinUrl} style={{
          position: 'absolute',
          top: -size,
          left: -size,
          width: size * 8,
          height: size * 8,
          maxWidth: 'none',
          maxHeight: 'none'
        }} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="Base" />
        <img src={rawSkinUrl} style={{
          position: 'absolute',
          top: -size,
          left: -(size * 5),
          width: size * 8,
          height: size * 8,
          maxWidth: 'none',
          maxHeight: 'none'
        }} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="Hat" />
        <img src={`https://minotar.net/helm/${acc.name}/${size}.png`} style={{
          position: 'absolute',
          top: 0, left: 0, width: size, height: size, zIndex: -1, maxWidth: 'none', maxHeight: 'none'
        }} onError={(e) => { e.currentTarget.src = `https://minotar.net/helm/Steve/${size}.png`; }} alt="Fallback" />
      </div>
    )
  }

  // Settings State
  const [showSnapshots, setShowSnapshots] = useState(localStorage.getItem('mc_show_snapshots') === 'true')
  const [showModified, setShowModified] = useState(localStorage.getItem('mc_show_modified') !== 'false')
  const [showOldReleases, setShowOldReleases] = useState(localStorage.getItem('mc_show_old_releases') === 'true')
  const [showBeta, setShowBeta] = useState(localStorage.getItem('mc_show_beta') === 'true')
  const [showAlpha, setShowAlpha] = useState(localStorage.getItem('mc_show_alpha') === 'true')

  const handleSelectVersion = (v: string) => {
    setSelectedVersion(v)
    localStorage.setItem('mc_selected_version', v)
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ selectedVersion: v })
  }

  const handleToggleSnapshots = (checked: boolean) => {
    setShowSnapshots(checked)
    localStorage.setItem('mc_show_snapshots', checked.toString())
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ showSnapshots: checked })
  }
  const handleToggleModified = (checked: boolean) => {
    setShowModified(checked)
    localStorage.setItem('mc_show_modified', checked.toString())
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ showModified: checked })
  }
  const handleToggleOldReleases = (checked: boolean) => {
    setShowOldReleases(checked)
    localStorage.setItem('mc_show_old_releases', checked.toString())
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ showOldReleases: checked })
  }
  const handleToggleBeta = (checked: boolean) => {
    setShowBeta(checked)
    localStorage.setItem('mc_show_beta', checked.toString())
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ showBeta: checked })
  }
  const handleToggleAlpha = (checked: boolean) => {
    setShowAlpha(checked)
    localStorage.setItem('mc_show_alpha', checked.toString())
    // @ts-ignore
    window.electronAPI?.saveSettings?.({ showAlpha: checked })
  }
  const [mcArgs, setMcArgs] = useState(localStorage.getItem('mc_args') || '')

  const [maxRam, setMaxRam] = useState(8192)
  const [ramValue, setRamValue] = useState(Number(localStorage.getItem('mc_ram')) || 2048)

  const [menuOpacity, setMenuOpacity] = useState(Number(localStorage.getItem('mc_menu_opacity') || 95))
  const [enableServersTab, setEnableServersTab] = useState(localStorage.getItem('mc_enable_servers_tab') === 'true')
  const [enableTabAnimations, setEnableTabAnimations] = useState(localStorage.getItem('mc_enable_tab_animations') !== 'false')
  const [enableNewDesign] = useState(localStorage.getItem('mc_new_design') === 'true')
  const [autoOpenInstallSettings, setAutoOpenInstallSettings] = useState(false)
  const [autoOpenInstallCreate, setAutoOpenInstallCreate] = useState(false)
  const [showPlayEditModal, setShowPlayEditModal] = useState(false)
  const [editPlayName, setEditPlayName] = useState('')
  const [editPlayIcon, setEditPlayIcon] = useState('')
  const [confirmPlayDelete, setConfirmPlayDelete] = useState(false)

  // Java Runtime State
  const [customJava, setCustomJava] = useState(localStorage.getItem('mc_custom_java') || 'auto')
  const [installedJavas, setInstalledJavas] = useState<Record<string, { installed: boolean; path: string | null }>>({})
  const [showJavaManagerModal, setShowJavaManagerModal] = useState(false)
  const [installingJava, setInstallingJava] = useState<string | null>(null)
  const [javaProgress, setJavaProgress] = useState<{ version: string; status: string; progress: number } | null>(null)
  const [javaError, setJavaError] = useState('')

  const refreshInstalledJavas = async () => {
    try {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.getInstalledJavas) {
        // @ts-ignore
        const res = await window.electronAPI.getInstalledJavas()
        if (res) setInstalledJavas(res)
      }
    } catch (e) {
      console.error('Failed to load installed Javas:', e)
    }
  }

  const handleInstallJava = async (version: '8' | '17' | '21') => {
    if (installingJava) return
    setInstallingJava(version)
    setJavaError('')
    setJavaProgress({ version, status: `Подготовка к установке Java ${version}...`, progress: 5 })
    try {
      // @ts-ignore
      await window.electronAPI.installJava(version)
      await refreshInstalledJavas()
      setJavaProgress(null)
    } catch (err: any) {
      setJavaError(err.message || 'Ошибка установки Java')
    } finally {
      setInstallingJava(null)
    }
  }

  const handleInstallAllRecommended = async () => {
    if (installingJava) return
    const toInstall: ('8' | '17' | '21')[] = []
    if (!installedJavas['8']?.installed) toInstall.push('8')
    if (!installedJavas['17']?.installed) toInstall.push('17')
    if (!installedJavas['21']?.installed) toInstall.push('21')

    for (const v of toInstall) {
      await handleInstallJava(v)
    }
  }

  useEffect(() => {
    refreshInstalledJavas()
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onJavaInstallProgress) {
      // @ts-ignore
      window.electronAPI.onJavaInstallProgress((data: any) => {
        setJavaProgress(data)
      })
    }
  }, [])

  const handleCloseDownloadsDropdown = () => {
    if (downloadsCloseTimerRef.current) {
      clearTimeout(downloadsCloseTimerRef.current);
      downloadsCloseTimerRef.current = null;
    }
    setIsClosingDownloadsDropdown(true);
    setTimeout(() => {
      setShowDownloadsDropdown(false);
      setIsClosingDownloadsDropdown(false);
      setJustCompletedDownloads(false);
    }, 250);
  };

  const handleToggleDownloadsDropdown = () => {
    if (showDownloadsDropdown) {
      handleCloseDownloadsDropdown();
    } else {
      setIsClosingDownloadsDropdown(false);
      setShowDownloadsDropdown(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.titlebar-downloads') && !target.closest('.downloads-dropdown')) {
        if (showDownloadsDropdown && !isClosingDownloadsDropdown) {
          handleCloseDownloadsDropdown();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDownloadsDropdown, isClosingDownloadsDropdown]);

  useEffect(() => {
    if (!progress) return;

    const lower = progress.toLowerCase();
    const isCompleted = 
      lower.includes('установлен') ||
      lower.includes('установлена') ||
      lower.includes('установлены') ||
      lower.includes('завершена') ||
      lower.includes('запущен') ||
      lower.includes('complete') ||
      lower.includes('installed') ||
      lower.includes('ошибка') ||
      lower.includes('error') ||
      lower.includes('не найден') ||
      lower.includes('failed');

    if (isCompleted) {
      const timer = setTimeout(() => {
        setProgress('');
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  useEffect(() => {
    // @ts-ignore
    window.electronAPI.onLaunchProgress((msg: string) => {
      setProgress(msg)
    })

    // @ts-ignore
    window.electronAPI.onDownloadUpdate((data: any) => {
      if (downloadsCloseTimerRef.current) {
        clearTimeout(downloadsCloseTimerRef.current)
        downloadsCloseTimerRef.current = null
      }
      setJustCompletedDownloads(false)
      setIsClosingDownloadsDropdown(false)
      setShowDownloadsDropdown(true)
      setActiveDownloads(prev => {
        const idx = prev.findIndex(d => d.id === data.id)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = data
          return next
        }
        return [...prev, data]
      })
    })

    // @ts-ignore
    window.electronAPI.onDownloadFinish((id: string) => {
      setActiveDownloads(prev => {
        const next = prev.filter(d => d.id !== id)
        if (next.length === 0) {
          setJustCompletedDownloads(true)
          if (downloadsCloseTimerRef.current) {
            clearTimeout(downloadsCloseTimerRef.current)
          }
          downloadsCloseTimerRef.current = setTimeout(() => {
            setIsClosingDownloadsDropdown(true)
            setTimeout(() => {
              setShowDownloadsDropdown(false)
              setIsClosingDownloadsDropdown(false)
              setJustCompletedDownloads(false)
            }, 300)
          }, 2000)
        }
        return next
      })
    })

    // @ts-ignore
    window.electronAPI.onGameClosed(() => {
      setGameRunning(false)

      // @ts-ignore
      if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
        // @ts-ignore
        window.electronAPI.updateDiscordPresence({
          details: "В лаунчере",
          state: "В главном меню",
          largeImageKey: "logo",
          largeImageText: "Pagrysha Launcher"
        })
      }
    })

    // @ts-ignore
    window.electronAPI.onGameCrashed((log: string) => {
      setCrashLog(log)
    })

    // @ts-ignore
    if (window.electronAPI && window.electronAPI.checkUpdates) {
      // @ts-ignore
      window.electronAPI.checkUpdates().then(setUpdateInfo)
    }

    const fetchVersions = async () => {
      try {
        // @ts-ignore
        const v = await window.electronAPI.getVersions()
        setRawVersions(v.releases || [])
        setInstalledVersions(v.installed || [])
      } catch (e) { console.error(e) }
    }
    fetchVersions()

    // @ts-ignore
    window.electronAPI.getSystemInfo().then((info: any) => {
      if (info && info.totalMemoryMB) {
        setMaxRam(info.totalMemoryMB)
        if (!localStorage.getItem('mc_ram')) {
          setRamValue(Math.floor(info.totalMemoryMB / 2))
        }
      }
    })

    const loadAccounts = async () => {
      try {
        // @ts-ignore
        const savedAccounts = await window.electronAPI.getAccounts()
        if (Array.isArray(savedAccounts) && savedAccounts.length > 0) {
          setAccounts(savedAccounts)
          const lastId = localStorage.getItem('activeAccountId')
          const found = savedAccounts.find(a => a.id === lastId)
          setActiveAccount(found || savedAccounts[0])
        }
      } catch (e) { }
    }
    loadAccounts()

    const loadSettings = async () => {
      try {
        // @ts-ignore
        const disk = await window.electronAPI?.getSettings?.()
        if (disk && typeof disk === 'object') {
          if (disk.showSnapshots !== undefined) {
            setShowSnapshots(Boolean(disk.showSnapshots))
            localStorage.setItem('mc_show_snapshots', String(disk.showSnapshots))
          }
          if (disk.showModified !== undefined) {
            setShowModified(Boolean(disk.showModified))
            localStorage.setItem('mc_show_modified', String(disk.showModified))
          }
          if (disk.showOldReleases !== undefined) {
            setShowOldReleases(Boolean(disk.showOldReleases))
            localStorage.setItem('mc_show_old_releases', String(disk.showOldReleases))
          }
          if (disk.showBeta !== undefined) {
            setShowBeta(Boolean(disk.showBeta))
            localStorage.setItem('mc_show_beta', String(disk.showBeta))
          }
          if (disk.showAlpha !== undefined) {
            setShowAlpha(Boolean(disk.showAlpha))
            localStorage.setItem('mc_show_alpha', String(disk.showAlpha))
          }
          if (disk.ramValue !== undefined) {
            setRamValue(Number(disk.ramValue))
            localStorage.setItem('mc_ram', String(disk.ramValue))
          }
          if (disk.mcArgs !== undefined) {
            setMcArgs(String(disk.mcArgs))
            localStorage.setItem('mc_args', String(disk.mcArgs))
          }
          if (disk.customJava !== undefined) {
            setCustomJava(String(disk.customJava))
            localStorage.setItem('mc_custom_java', String(disk.customJava))
          }
          if (disk.selectedVersion !== undefined) {
            setSelectedVersion(String(disk.selectedVersion))
            localStorage.setItem('mc_selected_version', String(disk.selectedVersion))
          }
          if (disk.enableTabAnimations !== undefined) {
            setEnableTabAnimations(Boolean(disk.enableTabAnimations))
            localStorage.setItem('mc_enable_tab_animations', String(disk.enableTabAnimations))
          }
          if (disk.enableServersTab !== undefined) {
            setEnableServersTab(Boolean(disk.enableServersTab))
            localStorage.setItem('mc_enable_servers_tab', String(disk.enableServersTab))
          }
          if (disk.menuOpacity !== undefined) {
            setMenuOpacity(Number(disk.menuOpacity))
            localStorage.setItem('mc_menu_opacity', String(disk.menuOpacity))
          }
        }
      } catch (e) {
        console.error('Failed to load disk settings:', e)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    const fetchModpacks = async () => {
      try {
        // @ts-ignore
        const saved = await window.electronAPI.getModpacks()
        if (saved) {
          setModpacks(saved)
          if (selectedVersion.startsWith('mp:')) {
            const mpName = selectedVersion.replace('mp:', '')
            if (!saved.some((m: any) => m.name === mpName)) {
              if (versions.length > 0) {
                handleSelectVersion(versions[0])
              } else {
                handleSelectVersion('')
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

    if (!showSnapshots) {
      filtered = filtered.filter(v => v.type !== 'snapshot')
    }
    if (!showBeta) {
      filtered = filtered.filter(v => v.type !== 'old_beta' && !v.id?.startsWith('b1.') && !v.id?.startsWith('beta'))
    }
    if (!showAlpha) {
      filtered = filtered.filter(v => 
        v.type !== 'old_alpha' && 
        !v.id?.startsWith('a1.') && 
        !v.id?.startsWith('alpha') && 
        !v.id?.startsWith('c0.') && 
        !v.id?.startsWith('inf-') && 
        !v.id?.startsWith('rd-')
      )
    }
    if (!showOldReleases) {
      filtered = filtered.filter(v => !(v.type === 'release' && /^1\.[0-5](\.|$)/.test(v.id)))
    }

    const versionIds = filtered.map(v => v.id)
    setVersions(versionIds)

    if (versionIds.length > 0) {
      const savedVersion = localStorage.getItem('mc_selected_version')
      const isVersionValid = (ver: string | null | undefined): boolean => {
        if (!ver) return false
        if (ver.startsWith('mp:')) return true
        if (versionIds.includes(ver)) return true
        if (showModified && (forgeVersions.includes(ver) || ver.includes('Forge'))) return true
        if (installedVersions.includes(ver)) return true
        return false
      }

      if (!selectedVersion || !isVersionValid(selectedVersion)) {
        if (isVersionValid(savedVersion)) {
          setSelectedVersion(savedVersion!)
        } else {
          setSelectedVersion(versionIds[0])
        }
      }
    }
  }, [rawVersions, showSnapshots, showModified, showOldReleases, showBeta, showAlpha, forgeVersions, installedVersions])

  const saveSettings = () => {
    localStorage.setItem('mc_ram', ramValue.toString())
    localStorage.setItem('mc_show_snapshots', showSnapshots.toString())
    localStorage.setItem('mc_show_modified', showModified.toString())
    localStorage.setItem('mc_show_old_releases', showOldReleases.toString())
    localStorage.setItem('mc_show_beta', showBeta.toString())
    localStorage.setItem('mc_show_alpha', showAlpha.toString())
    localStorage.setItem('mc_args', mcArgs)
    localStorage.setItem('mc_custom_java', customJava)
    localStorage.setItem('mc_menu_opacity', menuOpacity.toString())
    localStorage.setItem('mc_enable_servers_tab', enableServersTab.toString())
    localStorage.setItem('mc_enable_tab_animations', enableTabAnimations.toString())
    localStorage.setItem('mc_new_design', enableNewDesign.toString())

    // Also persist to disk settings.json
    // @ts-ignore
    window.electronAPI?.saveSettings?.({
      ramValue,
      showSnapshots,
      showModified,
      showOldReleases,
      showBeta,
      showAlpha,
      mcArgs,
      customJava,
      menuOpacity,
      enableServersTab,
      enableTabAnimations,
      enableNewDesign,
      selectedVersion
    })

    alert('Настройки сохранены!')
  }

  const handleOpenPlayEditModal = () => {
    if (selectedVersion.startsWith('mp:')) {
      const mpName = selectedVersion.replace('mp:', '');
      const mp = modpacks.find(m => m.name === mpName);
      if (mp) {
        setEditPlayName(mp.name);
        setEditPlayIcon(mp.icon || PRESET_ICONS[0]);
        setConfirmPlayDelete(false);
        setShowPlayEditModal(true);
      }
    }
  };

  const handleSavePlayEdit = async () => {
    if (!selectedVersion.startsWith('mp:')) return;
    const mpName = selectedVersion.replace('mp:', '');
    const mp = modpacks.find(m => m.name === mpName);
    if (!mp || !editPlayName.trim()) return;
    const safeEditName = editPlayName.replace(/[<>:"/\\|?*]/g, '-');

    if (safeEditName !== mp.name) {
      try {
        // @ts-ignore
        const res = await window.electronAPI.renameModpackFolder(mp.name, safeEditName);
        if (res.status === 'error') {
          alert('Не удалось переименовать папку сборки: ' + res.error);
          return;
        }
      } catch (e) {
        console.error(e);
        return;
      }
    }

    const updated = modpacks.map(m => {
      if (m.name === mp.name) {
        return { ...m, name: safeEditName, icon: editPlayIcon };
      }
      return m;
    });

    setModpacks(updated);
    // @ts-ignore
    await window.electronAPI.saveModpacks(updated);
    handleSelectVersion(`mp:${safeEditName}`);
    setShowPlayEditModal(false);
  };

  const handleDeletePlayEdit = async () => {
    if (!selectedVersion.startsWith('mp:')) return;
    const mpName = selectedVersion.replace('mp:', '');
    const mp = modpacks.find(m => m.name === mpName);
    if (!mp) return;

    try {
      // @ts-ignore
      await window.electronAPI.deleteModpackFolder(mp.name);
    } catch (e) {
      console.error(e);
    }

    const updated = modpacks.filter(m => m.name !== mp.name);
    setModpacks(updated);
    // @ts-ignore
    await window.electronAPI.saveModpacks(updated);

    if (updated.length > 0) {
      handleSelectVersion(`mp:${updated[0].name}`);
    } else if (versions.length > 0) {
      handleSelectVersion(versions[0]);
    } else {
      handleSelectVersion('');
    }
    setShowPlayEditModal(false);
  };



  const saveAccounts = async (newAccounts: Account[], newActive: Account) => {
    setAccounts(newAccounts)
    setActiveAccount(newActive)
    localStorage.setItem('activeAccountId', newActive.id)
    // @ts-ignore
    await window.electronAPI.saveAccounts(newAccounts)
  }

  const addAccount = async () => {
    setAuthError('')
    if (authType === 'offline' && !newAccountName.trim()) return
    setAuthLoading(true)
    try {
      let newAcc: Account | null = null;
      if (authType === 'offline') {
        newAcc = { id: Date.now().toString(), name: newAccountName, type: 'offline' }
      } else if (authType === 'microsoft') {
        // @ts-ignore
        const res = await window.electronAPI.authMicrosoft()
        newAcc = { id: Date.now().toString(), name: res.username, type: 'microsoft', uuid: res.uuid, token: res.token, skinUrl: res.skinUrl }
      } else if (authType === 'elyby' || authType === 'pgsync') {
        if (!authEmail || !authPassword) { setAuthError('Введите логин и пароль'); setAuthLoading(false); return }
        const res = authType === 'elyby' 
          // @ts-ignore
          ? await window.electronAPI.authElyby(authEmail, authPassword)
          // @ts-ignore
          : await window.electronAPI.authPgsync(authEmail, authPassword);
        
        newAcc = { id: Date.now().toString(), name: res.username, type: authType, uuid: res.uuid, token: res.token, clientToken: res.clientToken, skinUrl: res.skinUrl }
      }

      if (!newAcc) return;
      const newAccounts = [...accounts, newAcc]
      saveAccounts(newAccounts, newAcc)
      setNewAccountName('')
      setAuthEmail('')
      setAuthPassword('')
      setSelectedAuthMethod(null)
      setView('play')
    } catch (e: any) {
      let errMsg = e.message || String(e)
      if (errMsg.includes('Неверный логин или пароль')) {
        errMsg = 'Неверный логин или пароль'
      } else if (errMsg.includes('Error invoking remote method')) {
        const parts = errMsg.split('Error:')
        errMsg = parts[parts.length - 1].trim()
      }
      setAuthError(errMsg)
      setAuthPassword('')
    } finally {
      setAuthLoading(false)
    }
  }

  const removeAccount = (id: string) => {
    if (accounts.length <= 1) return
    const newAccounts = accounts.filter(a => a.id !== id)
    saveAccounts(newAccounts, newAccounts[0])
  }

  const handleLaunch = async () => {
    if (gameRunning) return;
    if (!activeAccount) {
      alert('Пожалуйста, выберите или добавьте аккаунт для игры!');
      setView('accounts');
      return;
    }
    setGameRunning(true)
    setLaunching(true)
    
    // Ping server to wake it up if it's sleeping (Render free tier)
    setProgress('Пробуждаем сервер (до 1 мин)...')
    let serverReady = false
    let retries = 0
    while (!serverReady && retries < 30) { // Up to 60 seconds (30 * 2s)
      try {
        const res = await fetch('https://pg-sync-server.onrender.com/')
        if (res.ok) {
          serverReady = true
        } else {
          await new Promise(r => setTimeout(r, 2000))
          retries++
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 2000))
        retries++
      }
    }

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
      instanceId: selectedVersion,
      onPlayBehavior: 'keep',
      jvmArgs: mcArgs,
      javaPath: customJava === '8'
        ? (installedJavas['8']?.path || undefined)
        : customJava === '17'
        ? (installedJavas['17']?.path || undefined)
        : customJava === '21'
        ? (installedJavas['21']?.path || undefined)
        : customJava !== 'auto' && customJava
        ? customJava
        : undefined
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
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
        // @ts-ignore
        window.electronAPI.updateDiscordPresence({
          details: "Играет в Minecraft",
          state: `Версия: ${isModpack ? selectedVersion.replace('mp:', '') : selectedVersion}`,
          startTimestamp: Date.now(),
          largeImageKey: "logo",
          largeImageText: "Pagrysha Launcher"
        })
      }
      
      // @ts-ignore
      await window.electronAPI.launchGame(launchOpts)
      setProgress('Игра запущена')
    } catch (e: any) {
      setProgress(`Error: ${e.message}`)
    }
    setLaunching(false)
  }

  // @ts-ignore
  const openFolder = () => window.electronAPI.openFolder()

  const handleUpdate = () => {
    if (isUpdating) return;
    if (updateInfo.downloadUrl) {
      setIsUpdating(true);
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }

  return (
    <div className="app-container just-style">

      {/* Custom Title Bar */}
      <div className="custom-titlebar">
        <div className="titlebar-left">
          <img src="./icon.png" alt="icon" width={16} />
          <span>Pagrysha Launcher</span>
        </div>
        <div className="titlebar-right">
          <div style={{ display: "flex", alignItems: "center", gap: "15px", height: "100%" }}>
          {updateInfo.hasUpdate && (
            <div 
              className="update-banner"
              onClick={(e) => { e.stopPropagation(); handleUpdate(); }}
              style={{
                background: 'var(--pg-primary)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                animation: 'pulse 2s infinite',
                boxShadow: '0 0 10px rgba(255, 122, 0, 0.5)',
                cursor: isUpdating ? 'default' : 'pointer',
                opacity: isUpdating ? 0.7 : 1
              }}
            >
              {isUpdating ? 'Загрузка...' : `Доступно обновление: v${updateInfo.version}`}
            </div>
          )}
          
          <div 
            className="titlebar-downloads" 
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={handleToggleDownloadsDropdown}
          >
            <div>
              <span style={{ fontSize: 10, color: activeDownloads.length > 0 ? 'var(--pg-yellow)' : 'inherit' }}>■</span> {t("app.downloads")} {activeDownloads.length > 0 && `(${activeDownloads.length})`}
            </div>
            
            {showDownloadsDropdown && (
              <div 
                className="downloads-dropdown"
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '10px',
                  width: '300px',
                  background: 'var(--pg-black)',
                  border: '2px solid #111',
                  boxShadow: 'inset 0 2px 0 0 #444, inset 2px 0 0 0 #333, inset 0 -4px 0 0 #000, inset -2px 0 0 0 #222, 0 4px 10px rgba(0,0,0,0.5)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  zIndex: 2000,
                  maxHeight: '400px',
                  overflowY: 'auto',
                  cursor: 'default',
                  opacity: isClosingDownloadsDropdown ? 0 : 1,
                  transform: isClosingDownloadsDropdown ? 'translateY(-6px)' : 'translateY(0)',
                  transition: 'opacity 0.25s ease, transform 0.25s ease',
                  pointerEvents: isClosingDownloadsDropdown ? 'none' : 'auto'
                }}
              >
                {activeDownloads.length === 0 ? (
                  justCompletedDownloads ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '16px 0' }}>
                      <div style={{ color: 'var(--pg-yellow)', fontFamily: '"Blocks", sans-serif', fontSize: '13px' }}>
                        ✓ ВСЕ УСТАНОВКИ ЗАВЕРШЕНЫ
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#888', textAlign: 'center', padding: '20px 0', fontSize: '12px' }}>Нет активных загрузок</div>
                  )
                ) : (
                  activeDownloads.map(d => (
                    <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: '#1a1a1a', padding: '10px', border: '2px solid #222' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'white', fontWeight: 'bold' }}>{d.name}</span>
                        <span style={{ color: 'var(--pg-yellow)' }}>{d.progress}%</span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.text}</div>
                      <div style={{ height: '4px', background: '#111', width: '100%', marginTop: '5px' }}>
                        <div style={{ height: '100%', width: `${d.progress}%`, background: 'var(--pg-yellow)', transition: 'width 0.2s' }}></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          </div>
          <div className="win-btn" onClick={() => (window as any).electronAPI.windowMinimize()} style={{ fontFamily: '"Blocks", sans-serif' }}>-</div>
          <div className="win-btn" onClick={() => (window as any).electronAPI.windowMaximize()} style={{ fontFamily: '"Blocks", sans-serif', fontSize: '14px' }}>[ ]</div>
          <div className="win-btn close" onClick={() => (window as any).electronAPI.windowClose()} style={{ fontFamily: '"Blocks", sans-serif' }}>X</div>
        </div>
      </div>

      <div className="app-body">
        {/* Sidebar */}
        {/* Sidebar */}
        <div className="jl-sidebar" style={{ position: 'relative' }}>
          <div className="jl-profile" onClick={() => setShowAccountDropdown(!showAccountDropdown)}>
            <MinecraftFace acc={activeAccount} size={40} />
            <div className="jl-profile-info">
              <span className="jl-profile-name">{activeAccount.name}</span>
              <span className="jl-profile-status" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {activeAccount.type === 'microsoft' && <>Лицензия</>}
                {activeAccount.type === 'elyby' && <>Ely.by</>}
                {activeAccount.type === 'pgsync' && <>Pagrysha</>}
                {activeAccount.type === 'offline' && <>Offline</>}
              </span>
            </div>
            <span style={{ marginLeft: 'auto', color: '#888', fontFamily: '"Blocks", sans-serif', fontSize: '11px', transform: showAccountDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>v</span>
          </div>

          {showAccountDropdown && (
            <div className="account-dropdown" style={{
              position: 'absolute',
              top: '81px',
              left: 0,
              width: '100%',
              background: '#1b1b1b',
              borderBottom: '1px solid var(--pg-dark3)',
              zIndex: 100,
              boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  onClick={() => {
                    saveAccounts(accounts, acc);
                    setShowAccountDropdown(false);
                  }}
                  className={`account-dropdown-item ${activeAccount.id === acc.id ? 'active' : ''}`}
                >
                  <MinecraftFace acc={acc} size={32} />
                  <span style={{ color: 'white', fontWeight: activeAccount.id === acc.id ? 'bold' : 'normal', fontSize: '13px' }}>{acc.name}</span>
                </div>
              ))}
              <div
                onClick={() => {
                  setShowAccountDropdown(false);
                  setView('accounts');
                  setSelectedAuthMethod(null);
                }}
                className="account-dropdown-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--pg-dark3)',
                  background: 'rgba(0,0,0,0.2)'
                }}
              >
                <span style={{ color: '#ccc', fontSize: '13px', fontFamily: '"Blocks", sans-serif' }}>{t("app.change")}</span>
                <span style={{ color: '#888', fontSize: '14px', fontFamily: '"Blocks", sans-serif' }}>&gt;</span>
              </div>
            </div>
          )}

          <div className="jl-nav">
            <div className={`jl-nav-item ${view === 'play' ? 'active' : ''}`} onClick={() => setView('play')}>
              <div className="nav-play-icon" style={{ background: 'var(--pg-yellow)', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={12} fill="black" color="black" /></div> {t("app.sidebarPlay")}
            </div>
            <div className={`jl-nav-item ${view === 'installations' ? 'active' : ''}`} onClick={() => setView('installations')}>
              <svg viewBox="0 0 16 16" width="22" height="22" style={{
                filter: 'brightness(0) invert(1)',
                opacity: view === 'installations' ? 1 : 0.67
              }}>
                <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAkklEQVR4AZSPgQ6AIAgFq///Z+PcwDdNodabCNxtPlf9a7ZK7Bh/VQB4D2xUFcEWRpMJFNYalnvLBCwSlvUJca8KgIEW2UkAAAhEqLXX652gD6GmIKEV8y9BDNmU0Pe46JoFLMRwgul7YqSCDA5ICxVo3+ud1OfLE2JgRQrbziIA8vBedo7RJwBojqAPVeC9X+cLAAD//3V/9IAAAAAGSURBVAMAkiYeIQXDV5IAAAAASUVORK5CYII=" width="16" height="16" />
              </svg> {t("app.installations")}
            </div>
            <div className={`jl-nav-item ${view === 'modpacks' ? 'active' : ''}`} onClick={() => setView('modpacks')}>
              <svg viewBox="0 0 16 16" width="22" height="22" style={{
                filter: 'brightness(0) invert(1)',
                opacity: view === 'modpacks' ? 1 : 0.67
              }}>
                <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAm0lEQVR4AbSSCw6AIAxD1fvfWftmpgUnifETClvXlZG4TC+/Xw1WDedQel3VBNmEetYGdEzOkwfcwAU0gRBpIwYKWyM3oPgYvUF5i1z76UTtqzeAxQQQ943JUwtUBlHQ5mKPVTrXyOBUDaLPDfzN1b2Xuk/AOwGNCDkdyaEBUXODILRRBNkgKn4eOEB+oDLIImJH8s05MmiEd8kGAAD//6TAe8AAAAAGSURBVAMAv9MaIYD4VE4AAAAASUVORK5CYII=" width="16" height="16" />
              </svg> {t("app.sidebarModpacks")}
            </div>
            {enableServersTab && (
              <div className={`jl-nav-item ${view === 'servers' ? 'active' : ''}`} onClick={() => setView('servers')}>
                <svg viewBox="0 0 16 16" width="22" height="22" style={{
                  filter: 'brightness(0) invert(1)',
                  opacity: view === 'servers' ? 1 : 0.67
                }}>
                  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnUlEQVR4AaxSgQ2AIAwbPq5eru1MTSMqEDV0wa7buoQpPn6/NthgZgSQR8gBC5NAWBtAOk/WqEEyCAVYGqAGkuN4A04my84OcldIe67gAk5weK66u4MZWZ/8dqcW8rh1kIne4A64V0FhD6iFNG4dXK2n8Cm4A+1VIHbgtzrSVg44vfUOqDk7ygEnimT3N0iXNWpAksQIWFOtkORI2AEAAP//kZTYHgAAAAZJREFUAwBWGzYhjQL2qgAAAABJRU5ErkJggg==" width="16" height="16" />
                </svg> {t("app.sidebarServers")}
              </div>
            )}
            {activeAccount.type === 'pgsync' && (
              <div className={`jl-nav-item ${view === 'wardrobe' ? 'active' : ''}`} onClick={() => setView('wardrobe')}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
                  opacity: view === 'wardrobe' ? 1 : 0.67
                }}>
                  <path d="M20.38 3.46L16 2a8.5 8.5 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
                </svg> {t("app.sidebarWardrobe")}
              </div>
            )}
          </div>

          <div className="jl-bottom">
            <div className={`jl-nav-item ${view === 'accounts' ? 'active' : ''}`} onClick={() => { setView('accounts'); setSelectedAuthMethod(null); }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img src="https://minotar.net/helm/Steve/16.png" style={{ width: 16, height: 16, zIndex: 2 }} />
                <img src="https://minotar.net/helm/Alex/16.png" style={{ width: 16, height: 16, marginLeft: -6, zIndex: 1 }} />
              </div> {t("app.accounts")}
            </div>
            <div className="jl-nav-item" onClick={() => setView('settings')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32" fill="#fff">
                <path d="m25.905 9.14 0 -3.04 4.57 0 0 -1.53 -4.57 0 0 -3.05 -1.52 0 0 7.62 1.52 0z"></path>
                <path d="m25.905 30.48 0 -3.05 4.57 0 0 -1.53 -4.57 0 0 -3.04 -1.52 0 0 7.62 1.52 0z"></path>
                <path d="m30.475 15.24 -21.33 0 0 -3.05 -1.52 0 0 -1.52 -1.53 0 0 1.52 -1.52 0 0 3.05 -3.05 0 0 1.52 3.05 0 0 3.05 1.52 0 0 1.52 1.53 0 0 -1.52 1.52 0 0 -3.05 21.33 0 0 -1.52z"></path>
                <path d="M22.855 30.48h1.53V32h-1.53Z"></path>
                <path d="M22.855 21.33h1.53v1.53h-1.53Z"></path>
                <path d="M22.855 9.14h1.53v1.53h-1.53Z"></path>
                <path d="M22.855 0h1.53v1.52h-1.53Z"></path>
                <path d="m22.855 22.86 -1.52 0 0 3.04 -19.81 0 0 1.53 19.81 0 0 3.05 1.52 0 0 -7.62z"></path>
                <path d="m21.335 4.57 -19.81 0 0 1.53 19.81 0 0 3.04 1.52 0 0 -7.62 -1.52 0 0 3.05z"></path>
              </svg> {t("app.sidebarSettings")}
            </div>
            <div className="jl-bottom-btn outlined" onClick={openFolder}>
              <Folder size={18} /> {t("app.gameFolder")}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="jl-main" style={view === 'play' ? { backgroundImage: mainBgDataUrl ? `url("${mainBgDataUrl}")` : 'url("/faq.png")' } : { backgroundImage: secBgDataUrl ? `url("${secBgDataUrl}")` : 'url("/faq.png")' }}>
          <div
            key={view}
            className={enableTabAnimations ? 'subtle-tab-transition' : ''}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}
          >
            {view === 'play' && (
            <div className="jl-content" style={enableNewDesign ? { justifyContent: 'flex-end', height: '100%' } : {}}>
              {!enableNewDesign ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '0 40px', width: '100%' }}>
                  <div className="jl-play-bar" style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '10px 20px', background: 'rgba(26,26,26,0.95)', border: '3px solid #111', boxShadow: 'inset 0 3px 0 0 #444, inset 3px 0 0 0 #333, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #222', position: 'relative' }}>
                    <div className="jl-version-selector" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold' }}>{t("app.currentVersion")}</label>
                      <div
                        className="custom-dropdown"
                        onClick={() => {
                          if (showVersionDropdown) handleCloseVersionDropdown()
                          else setShowVersionDropdown(true)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: '200px' }}
                      >
                        <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {renderSelectedVersionIcon(selectedVersion, modpacks, 32)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '14px', color: 'white', fontWeight: 'bold' }}>
                            {selectedVersion.startsWith('mp:') ? selectedVersion.replace('mp:', '') : selectedVersion || t("app.selectVersion")}
                          </span>
                          {selectedVersion.startsWith('mp:') && (
                            <span style={{ fontSize: '11px', color: '#aaa' }}>
                              {modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.loader} {modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.version}
                            </span>
                          )}
                        </div>
                        <span style={{ marginLeft: 'auto', fontFamily: '"Blocks", sans-serif', fontSize: '10px', color: '#888' }}>▼</span>
                      </div>

                      {(showVersionDropdown || isClosingVersionDropdown) && (
                        <div className={`dropdown-menu ${isClosingVersionDropdown ? 'closing' : ''}`} style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', background: '#1a1a1a', border: '2px solid #333', maxHeight: '300px', overflowY: 'auto', zIndex: 50 }}>
                          {modpacks.length > 0 && (
                            <>
                              <div style={{ padding: '8px 10px', fontSize: '11px', color: '#aaa', background: '#222', textTransform: 'uppercase' }}>{t("app.myModpacks")}</div>
                              {modpacks.map(mp => (
                                <div
                                  key={mp.name}
                                  className="dropdown-item"
                                  onClick={() => { handleSelectVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                  style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                                >
                                  <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={24} height={24} style={{ objectFit: 'cover' }} />
                                  <span style={{ color: 'white', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                                </div>
                              ))}
                            </>
                          )}
                          <div style={{ padding: '8px 10px', fontSize: '11px', color: '#aaa', background: '#222', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                          {versions.map(v => {
                            const isVanillaInstalled = installedVersions.includes(v);
                            const isForgeInstalled = installedVersions.some(iv =>
                              iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-'))
                            );
                            const forgeLabel = `${v} Forge`;
                            const hasForge = showModified && forgeVersions.includes(forgeLabel);
                            return (
                              <React.Fragment key={v}>
                                <div
                                  className="dropdown-item"
                                  onClick={() => { handleSelectVersion(v); handleCloseVersionDropdown(); }}
                                  onContextMenu={async (e) => {
                                    e.preventDefault();
                                    if (isVanillaInstalled) {
                                      if (confirm(`Переустановить ${v}?`)) {
                                        // @ts-ignore
                                        await window.electronAPI.deleteModpackFolder(v);
                                        setInstalledVersions(installedVersions.filter(iv => iv !== v));
                                      }
                                    }
                                  }}
                                  style={{
                                    padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: hasForge ? 'none' : '1px solid #2a2a2a',
                                    background: isVanillaInstalled ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                                  }}
                                >
                                  <img src={v?.toLowerCase()?.match(/(forge|fabric|optifine|quilt|lite)/) ? "./iconsblocks/Anvil.png" : "./iconsblocks/Grass_Block_(inventory)_MCE.png"} width={24} height={24} />
                                  <span style={{ color: isVanillaInstalled ? '#fff' : '#aaa', fontSize: '13px', fontWeight: isVanillaInstalled ? 'bold' : 'normal', flex: 1 }}>
                                    {v} {isVanillaInstalled && t('app.downloaded')}
                                  </span>
                                </div>
                                {hasForge && (
                                  <div
                                    className="dropdown-item"
                                    onClick={() => { handleSelectVersion(forgeLabel); handleCloseVersionDropdown(); }}
                                    onContextMenu={async (e) => {
                                      e.preventDefault();
                                      if (isForgeInstalled) {
                                        if (confirm(`Переустановить ${forgeLabel}?`)) {
                                          const forgeFolders = installedVersions.filter(iv =>
                                            iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-'))
                                          );
                                          for (const ff of forgeFolders) {
                                            // @ts-ignore
                                            await window.electronAPI.deleteModpackFolder(ff);
                                          }
                                          setInstalledVersions(installedVersions.filter(iv =>
                                            !(iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-')))
                                          ));
                                        }
                                      }
                                    }}
                                    style={{
                                      padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                                      borderBottom: '1px solid #2a2a2a',
                                      background: isForgeInstalled ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                                    }}
                                  >
                                    <img src="./iconsblocks/Anvil.png" width={24} height={24} />
                                    <span style={{ color: isForgeInstalled ? '#fff' : '#aaa', fontSize: '13px', fontWeight: isForgeInstalled ? 'bold' : 'normal', flex: 1 }}>
                                      {forgeLabel} {isForgeInstalled && t('app.downloaded')}
                                    </span>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="jl-play-btn-wrapper"
                    onClick={(!launching && !gameRunning) ? handleLaunch : undefined}
                    style={{
                      zIndex: 10, position: 'relative', width: '220px', height: '70px',
                      cursor: (launching || gameRunning) ? 'default' : 'pointer', filter: (launching || gameRunning) ? 'grayscale(1)' : 'none', opacity: (launching || gameRunning) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <img src="./play_empty.png" alt="Play" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                    <span style={{
                      position: 'relative', zIndex: 2,
                      fontFamily: '"MinecraftTen", "Blocks", monospace',
                      fontSize: '16px', color: '#ffffff', WebkitTextFillColor: '#ffffff', WebkitTextStroke: '1px #f9ca24', textShadow: '2px 2px 0px rgba(0,0,0,0.5)', letterSpacing: '2px',
                      userSelect: 'none', transition: 'transform 0.1s'
                    }}>
                      {gameRunning ? t('app.gameRunning') : (() => {
                        if (!selectedVersion) return t('app.playBtn');
                        if (selectedVersion.startsWith('mp:')) return t('app.playBtn');
                        if (selectedVersion?.endsWith(' Forge')) {
                          const baseV = selectedVersion.replace(' Forge', '');
                          const isForgeInstalled = installedVersions.some(iv => iv.startsWith(baseV + '-') && (/^\d/.test(iv.slice(baseV.length + 1)) || iv.includes('-forge-'))) || installedVersions.includes(selectedVersion);
                          return isForgeInstalled ? t('app.playBtn') : t('app.installBtn');
                        }
                        return installedVersions.includes(selectedVersion) ? t('app.playBtn') : t('app.installBtn');
                      })()}
                    </span>
                  </div>
                </div>
              ) : (
                // Console-style New Design
                <div style={{ width: '100%', background: '#141414', borderTop: '3px solid #111', padding: '10px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '76px', boxSizing: 'border-box' }}>
                  {/* Left: Version Selector */}
                  <div
                    onClick={() => {
                      if (showVersionDropdown) handleCloseVersionDropdown()
                      else setShowVersionDropdown(true)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', zIndex: 11, position: 'relative' }}
                  >
                    <div style={{ width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {renderSelectedVersionIcon(selectedVersion, modpacks, 46)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '15px',
                          color: 'white',
                          fontWeight: 'bold',
                          fontFamily: '"Blocks", sans-serif',
                          maxWidth: '160px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'inline-block'
                        }}>
                          {selectedVersion.startsWith('mp:') ? selectedVersion.replace('mp:', '') : selectedVersion || t("app.selectVersion")}
                        </span>
                        <span style={{ fontSize: '9px', color: '#888', transform: 'scaleY(0.8)' }}>▼</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {selectedVersion.startsWith('mp:') ? (
                            `${modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.loader} ${modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.version}`
                          ) : selectedVersion?.endsWith(' Forge') ? (
                            'ForgeOptiFine ' + selectedVersion.replace(' Forge', '')
                          ) : (
                            'Official Release ' + selectedVersion
                          )}
                        </span>
                        {/* Custom decorative loader icon (anvil, paper, etc.) */}
                        {renderLoaderIcon(selectedVersion.startsWith('mp:') ? (modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.loader || '') : selectedVersion)}
                      </div>
                    </div>

                    {(showVersionDropdown || isClosingVersionDropdown) && (
                      <div className={`dropdown-menu ${isClosingVersionDropdown ? 'closing' : ''}`} style={{ position: 'absolute', bottom: '100%', left: 0, width: '280px', background: '#1a1a1a', border: '2px solid #333', maxHeight: '300px', overflowY: 'auto', zIndex: 50 }}>
                        {modpacks.length > 0 && (
                          <>
                            <div style={{ padding: '8px 10px', fontSize: '11px', color: '#aaa', background: '#222', textTransform: 'uppercase' }}>{t("app.myModpacks")}</div>
                            {modpacks.map(mp => (
                              <div
                                key={mp.name}
                                className="dropdown-item"
                                onClick={(e) => { e.stopPropagation(); handleSelectVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                              >
                                <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={24} height={24} style={{ objectFit: 'cover' }} />
                                <span style={{ color: 'white', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                              </div>
                            ))}
                          </>
                        )}
                        <div style={{ padding: '8px 10px', fontSize: '11px', color: '#aaa', background: '#222', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                        {versions.map(v => {
                          const isVanillaInstalled = installedVersions.includes(v);
                          const isForgeInstalled = installedVersions.some(iv =>
                            iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-'))
                          );
                          const forgeLabel = `${v} Forge`;
                          const hasForge = showModified && forgeVersions.includes(forgeLabel);
                          return (
                            <React.Fragment key={v}>
                              <div
                                className="dropdown-item"
                                onClick={(e) => { e.stopPropagation(); handleSelectVersion(v); handleCloseVersionDropdown(); }}
                                onContextMenu={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isVanillaInstalled) {
                                    if (confirm(`Переустановить ${v}?`)) {
                                      // @ts-ignore
                                      await window.electronAPI.deleteModpackFolder(v);
                                      setInstalledVersions(installedVersions.filter(iv => iv !== v));
                                    }
                                  }
                                }}
                                style={{
                                  padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: hasForge ? 'none' : '1px solid #2a2a2a',
                                  background: isVanillaInstalled ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                                }}
                              >
                                <img src={v?.toLowerCase()?.match(/(forge|fabric|optifine|quilt|lite)/) ? "./iconsblocks/Anvil.png" : "./iconsblocks/Grass_Block_(inventory)_MCE.png"} width={24} height={24} />
                                <span style={{ color: isVanillaInstalled ? '#fff' : '#aaa', fontSize: '13px', fontWeight: isVanillaInstalled ? 'bold' : 'normal', flex: 1 }}>
                                  {v} {isVanillaInstalled && t('app.downloaded')}
                                </span>
                              </div>
                              {hasForge && (
                                <div
                                  className="dropdown-item"
                                  onClick={(e) => { e.stopPropagation(); handleSelectVersion(forgeLabel); handleCloseVersionDropdown(); }}
                                  onContextMenu={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isForgeInstalled) {
                                      if (confirm(`Переустановить ${forgeLabel}?`)) {
                                        const forgeFolders = installedVersions.filter(iv =>
                                          iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-'))
                                        );
                                        for (const ff of forgeFolders) {
                                          // @ts-ignore
                                          await window.electronAPI.deleteModpackFolder(ff);
                                        }
                                        setInstalledVersions(installedVersions.filter(iv =>
                                          !(iv.startsWith(v + '-') && (/^\d/.test(iv.slice(v.length + 1)) || iv.includes('-forge-')))
                                        ));
                                      }
                                    }
                                  }}
                                  style={{
                                    padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                                    borderBottom: '1px solid #2a2a2a',
                                    background: isForgeInstalled ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                                  }}
                                >
                                  <img src="./iconsblocks/Anvil.png" width={24} height={24} />
                                  <span style={{ color: isForgeInstalled ? '#fff' : '#aaa', fontSize: '13px', fontWeight: isForgeInstalled ? 'bold' : 'normal', flex: 1 }}>
                                    {forgeLabel} {isForgeInstalled && t('app.downloaded')}
                                  </span>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Center: Big 3D Yellow Play Button */}
                  <div
                    onClick={(!launching && !gameRunning) ? handleLaunch : undefined}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      bottom: '12px',
                      width: '210px',
                      height: '52px',
                      zIndex: 10,
                      cursor: (launching || gameRunning) ? 'default' : 'pointer',
                      filter: (launching || gameRunning) ? 'grayscale(1)' : 'none',
                      opacity: (launching || gameRunning) ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: '"MinecraftTen", "Blocks", monospace',
                      color: '#ffffff',
                      textShadow: '2px 2px 0px rgba(0,0,0,0.7)',
                      WebkitTextStroke: '1px #ab7d00',
                      fontSize: '17px',
                      userSelect: 'none'
                    }}
                    className="jl-flat-yellow-btn hover-scale-btn active-press-btn"
                  >
                    <span>
                      {gameRunning ? t('app.gameRunning') : (() => {
                        if (!selectedVersion) return t('app.playBtn');
                        if (selectedVersion.startsWith('mp:')) return t('app.playBtn');
                        if (selectedVersion?.endsWith(' Forge')) {
                          const baseV = selectedVersion.replace(' Forge', '');
                          const isForgeInstalled = installedVersions.some(iv => iv.startsWith(baseV + '-') && (/^\d/.test(iv.slice(baseV.length + 1)) || iv.includes('-forge-'))) || installedVersions.includes(selectedVersion);
                          return isForgeInstalled ? t('app.playBtn') : t('app.installBtn');
                        }
                        return installedVersions.includes(selectedVersion) ? t('app.playBtn') : t('app.installBtn');
                      })()}
                    </span>
                  </div>

                  {/* Right: Square Quick Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', zIndex: 11 }}>
                    <button
                      onClick={() => { setView('settings'); setSettingsTab('customization'); }}
                      style={{
                        width: '38px', height: '38px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--pg-dark)', borderColor: 'var(--pg-dark3)', color: 'var(--pg-text-muted)',
                        cursor: 'pointer'
                      }}
                      className="mc-btn-primary hover-scale-btn"
                      title="Customization / Backgrounds"
                    >
                      {/* Image icon */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </button>

                    <button
                      onClick={selectedVersion.startsWith('mp:') ? handleOpenPlayEditModal : undefined}
                      style={{
                        width: '38px', height: '38px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--pg-dark)', borderColor: 'var(--pg-dark3)', color: 'var(--pg-text-muted)',
                        cursor: selectedVersion.startsWith('mp:') ? 'pointer' : 'not-allowed',
                        opacity: selectedVersion.startsWith('mp:') ? 1 : 0.4
                      }}
                      className="mc-btn-primary hover-scale-btn"
                      title={selectedVersion.startsWith('mp:') ? "Редактировать сборку" : "Редактировать можно только кастомные сборки"}
                      disabled={!selectedVersion.startsWith('mp:')}
                    >
                      {/* Pencil icon */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>

                    <button
                      onClick={() => { setView('settings'); setSettingsTab('main'); }}
                      style={{
                        width: '38px', height: '38px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--pg-dark)', borderColor: 'var(--pg-dark3)', color: 'var(--pg-text-muted)',
                        cursor: 'pointer'
                      }}
                      className="mc-btn-primary hover-scale-btn"
                      title="Settings"
                    >
                      {/* Settings icon */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'installations' && (
            <ModsMenu
              currentVersion={selectedVersion}
              opacity={menuOpacity}
              autoOpenSettings={autoOpenInstallSettings}
              onCloseAutoOpenSettings={() => setAutoOpenInstallSettings(false)}
              autoOpenCreate={autoOpenInstallCreate}
              onCloseAutoOpenCreate={() => setAutoOpenInstallCreate(false)}
            />
          )}
          {view === 'modpacks' && <ModpacksMenu currentVersion={selectedVersion} opacity={menuOpacity} />}
          {view === 'servers' && <ServersMenu opacity={menuOpacity} />}
          {view === 'settings' && (
            <div 
              className="jl-content settings-tab-view" 
              style={{ 
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: `rgba(18, 18, 18, ${menuOpacity / 100})`,
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}
            >
              {/* Fixed Top Sub-Tabs Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '30px',
                borderBottom: '2px solid #282828',
                padding: '24px 45px 0 45px',
                userSelect: 'none',
                flexShrink: 0,
                background: 'rgba(18, 18, 18, 0.98)',
                zIndex: 10
              }}>
                <div
                  onClick={() => setSettingsTab('customization')}
                  style={{
                    fontSize: '15px',
                    fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                    color: settingsTab === 'customization' ? '#ffffff' : '#888888',
                    borderBottom: settingsTab === 'customization' ? '3px solid var(--pg-yellow)' : '3px solid transparent',
                    paddingBottom: '12px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  ЛАУНЧЕР
                </div>

                <div
                  onClick={() => setSettingsTab('main')}
                  style={{
                    fontSize: '15px',
                    fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                    color: settingsTab === 'main' ? '#ffffff' : '#888888',
                    borderBottom: settingsTab === 'main' ? '3px solid var(--pg-yellow)' : '3px solid transparent',
                    paddingBottom: '12px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  MINECRAFT
                </div>

                <div
                  onClick={() => setSettingsTab('experimental')}
                  style={{
                    fontSize: '15px',
                    fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                    color: settingsTab === 'experimental' ? '#ffffff' : '#888888',
                    borderBottom: settingsTab === 'experimental' ? '3px solid var(--pg-yellow)' : '3px solid transparent',
                    paddingBottom: '12px',
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  ЭКСПЕРИМЕНТАЛЬНЫЕ
                </div>
              </div>

              {/* Scrollable Settings Content Area */}
              <div 
                className="custom-scrollbar" 
                style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  padding: '25px 45px 35px 45px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Tab 1: ЛАУНЧЕР (Customization) */}
                {settingsTab === 'customization' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '650px' }}>
                    {/* Section: Язык */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Язык / Language
                      </div>
                      <div>
                        <McSelect 
                          value={language} 
                          onChange={(v) => setLanguage(v as Language)} 
                          options={[
                            { value: 'ru', label: 'Русский - Россия', icon: '🇷🇺' },
                            { value: 'en', label: 'English - United States', icon: '🇬🇧' }
                          ]} 
                          style={{ width: '300px' }} 
                        />
                      </div>
                    </div>

                    {/* Section: Прозрачность и темы */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Прозрачность интерфейса
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ flex: 1, maxWidth: '400px' }}>
                          <input type="range" min="0" max="100" step="5" className="ram-slider" value={menuOpacity} onChange={e => setMenuOpacity(Number(e.target.value))} style={{ width: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white', fontFamily: '"Inter", sans-serif', fontWeight: 500 }}>
                          <input type="number" className="mc-input" value={menuOpacity} onChange={e => setMenuOpacity(Number(e.target.value))} style={{ width: '60px', padding: '5px', textAlign: 'center' }} /> %
                        </div>
                      </div>
                    </div>

                    {/* Section: Кастомные фоны */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Фоновые изображения
                      </div>
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        {/* Main BG */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          background: '#141414',
                          padding: '10px 14px',
                          border: '1px solid #282828',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                          minWidth: '270px'
                        }}>
                          {/* Mini Preview Thumbnail */}
                          <div style={{
                            width: '72px',
                            height: '44px',
                            background: '#0d0d0d',
                            border: '1px solid #333',
                            borderRadius: '2px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <img 
                              src={mainBgDataUrl || '/faq.png'} 
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = './faq.png'; }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                              alt="Main Preview" 
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                            <span style={{ fontSize: '12px', color: '#ddd', fontWeight: 600 }}>Главный экран</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <label className="mc-btn-primary hover-scale-btn" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '11px', color: '#000', whiteSpace: 'nowrap' }}>
                                {t('app.selectFile')}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: any) => {
                                  if (e.target.files && e.target.files[0]) {
                                    saveCompressedImage(e.target.files[0], 'mc_main_bg_data', (url) => {
                                      setMainBgDataUrl(url);
                                      window.dispatchEvent(new Event('storage'));
                                    });
                                  }
                                }} />
                              </label>
                              {mainBgDataUrl && (
                                <button 
                                  type="button" 
                                  className="mc-btn-danger hover-scale-btn" 
                                  style={{ padding: '4px 8px', fontSize: '11px' }} 
                                  title="Сбросить фон" 
                                  onClick={() => { 
                                    localStorage.removeItem('mc_main_bg_data'); 
                                    setMainBgDataUrl(null); 
                                    window.dispatchEvent(new Event('storage'));
                                  }}
                                >
                                  Сбросить
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Secondary BG */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          background: '#141414',
                          padding: '10px 14px',
                          border: '1px solid #282828',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                          minWidth: '270px'
                        }}>
                          {/* Mini Preview Thumbnail */}
                          <div style={{
                            width: '72px',
                            height: '44px',
                            background: '#0d0d0d',
                            border: '1px solid #333',
                            borderRadius: '2px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <img 
                              src={secBgDataUrl || '/faq.png'} 
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = './faq.png'; }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                              alt="Secondary Preview" 
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                            <span style={{ fontSize: '12px', color: '#ddd', fontWeight: 600 }}>Вторичный экран</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <label className="mc-btn-primary hover-scale-btn" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '11px', color: '#000', whiteSpace: 'nowrap' }}>
                                {t('app.selectFile')}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: any) => {
                                  if (e.target.files && e.target.files[0]) {
                                    saveCompressedImage(e.target.files[0], 'mc_sec_bg_data', (url) => {
                                      setSecBgDataUrl(url);
                                      window.dispatchEvent(new Event('storage'));
                                    });
                                  }
                                }} />
                              </label>
                              {secBgDataUrl && (
                                <button 
                                  type="button" 
                                  className="mc-btn-danger hover-scale-btn" 
                                  style={{ padding: '4px 8px', fontSize: '11px' }} 
                                  title="Сбросить фон" 
                                  onClick={() => { 
                                    localStorage.removeItem('mc_sec_bg_data'); 
                                    setSecBgDataUrl(null); 
                                    window.dispatchEvent(new Event('storage'));
                                  }}
                                >
                                  Сбросить
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Кэш и настройки лаунчера */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Кэш и настройки лаунчера
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                        <button 
                          className="mc-btn-primary hover-scale-btn" 
                          style={{ padding: '8px 16px', fontSize: '12px' }} 
                          onClick={async () => {
                            try {
                              // @ts-ignore
                              const res = await window.electronAPI.clearCache()
                              if (res.status === 'success') {
                                alert('Кэш лаунчера успешно очищен!')
                              } else {
                                alert('Ошибка очистки кэша: ' + res.error)
                              }
                            } catch(e: any) {
                              alert('Ошибка: ' + e.message)
                            }
                          }}
                        >
                          Очистить кэш лаунчера
                        </button>
                        <span style={{ fontSize: '12px', color: '#888' }}>
                          Удаляет временные файлы загрузки сборок, кеш OptiFine и текущей сессии.
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                        <button 
                          className="mc-btn-danger hover-scale-btn"
                          onClick={async () => {
                            if (confirm('Вы действительно хотите сбросить все настройки лаунчера?')) {
                              try {
                                // @ts-ignore
                                await window.electronAPI?.resetSettings?.();
                              } catch {}
                              localStorage.clear();
                              window.location.reload();
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            fontSize: '12px'
                          }}
                        >
                          Сбросить настройки лаунчера
                        </button>
                        <span style={{ fontSize: '12px', color: '#888' }}>
                          Сбрасывает все сохраненные параметры лаунчера и аккаунты.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: MINECRAFT (Main) */}
                {settingsTab === 'main' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '650px' }}>
                    {/* Section: Память ОЗУ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Выделение оперативной памяти (ОЗУ)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ flex: 1, maxWidth: '400px' }}>
                          <input type="range" min="512" max={maxRam} step="512" className="ram-slider" value={ramValue} onChange={e => setRamValue(Number(e.target.value))} style={{ width: '100%' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '4px' }}>
                            <span>512M</span>
                            <span>{Math.floor(maxRam * 0.25)}M</span>
                            <span>{Math.floor(maxRam * 0.5)}M</span>
                            <span>{Math.floor(maxRam * 0.75)}M</span>
                            <span>MAX ({maxRam}M)</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white', fontFamily: '"Inter", sans-serif', fontWeight: 500 }}>
                          <input type="number" className="mc-input" value={ramValue} onChange={e => setRamValue(Number(e.target.value))} style={{ width: '75px', padding: '5px', textAlign: 'center' }} /> MB
                        </div>
                      </div>
                    </div>

                    {/* Section: Список версий */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Отображаемые категории версий
                      </div>
                      <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#141414', padding: '16px', border: '2px solid #000', boxShadow: 'inset -2px -2px 0 0 #0d0d0d, inset 2px 2px 0 0 #2a2a2a' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={showSnapshots} onChange={e => handleToggleSnapshots(e.target.checked)} /> {t("app.showSnapshots")}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={showModified} onChange={e => handleToggleModified(e.target.checked)} /> {t("app.showForge")}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={showOldReleases} onChange={e => handleToggleOldReleases(e.target.checked)} /> {t("app.showOldReleases")}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={showBeta} onChange={e => handleToggleBeta(e.target.checked)} /> {t("app.showBeta")}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={showAlpha} onChange={e => handleToggleAlpha(e.target.checked)} /> {t("app.showAlpha")}
                        </label>
                      </div>
                    </div>

                    {/* Section: Аргументы JVM */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Аргументы запуска Minecraft (JVM)
                      </div>
                      <input type="text" value={mcArgs} onChange={e => setMcArgs(e.target.value)} placeholder="-Xmx4G -XX:+UseG1GC" className="mc-input" style={{ width: '100%', maxWidth: '500px' }} />
                    </div>

                    {/* Section: Java Runtime */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Выбор версии Java
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <McSelect 
                          value={customJava} 
                          onChange={(val: string) => {
                            setCustomJava(val)
                            localStorage.setItem('mc_custom_java', val)
                          }} 
                          options={[
                            { value: 'auto', label: 'Автовыбор (рекомендуется)' },
                            ...(installedJavas['8']?.installed ? [{ value: '8', label: 'Java 8 (для 1.0 — 1.16.5, Alpha, Beta)' }] : []),
                            ...(installedJavas['17']?.installed ? [{ value: '17', label: 'Java 17 (для 1.17 — 1.20.4)' }] : []),
                            ...(installedJavas['21']?.installed ? [{ value: '21', label: 'Java 21 (для 1.20.5+)' }] : []),
                            ...(!['auto', '8', '17', '21'].includes(customJava) && customJava ? [{ value: customJava, label: `Пользовательский: ${customJava}` }] : [])
                          ]} 
                          style={{ width: '320px' }} 
                        />
                        <button 
                          className="mc-btn-primary" 
                          onClick={() => { setShowJavaManagerModal(true); refreshInstalledJavas(); }}
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                          Компоненты Java
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: ЭКСПЕРИМЕНТАЛЬНЫЕ (Experimental) */}
                {settingsTab === 'experimental' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '650px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Функционал в разработке
                      </div>
                      <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#141414', padding: '16px', border: '2px solid #000', boxShadow: 'inset -2px -2px 0 0 #0d0d0d, inset 2px 2px 0 0 #2a2a2a' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={enableServersTab} onChange={e => {
                            setEnableServersTab(e.target.checked);
                            localStorage.setItem('mc_enable_servers_tab', e.target.checked.toString());
                          }} /> Включить вкладку "Сервера"
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={enableTabAnimations} onChange={e => {
                            setEnableTabAnimations(e.target.checked);
                            localStorage.setItem('mc_enable_tab_animations', e.target.checked.toString());
                          }} /> Плавная анимация переключения вкладок
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom Save Action Bar */}
                <div style={{ marginTop: 'auto', paddingTop: '25px', display: 'flex', justifyContent: 'flex-start', borderTop: '1px solid #282828' }}>
                  <button 
                    className="mc-btn-primary hover-scale-btn" 
                    onClick={() => {
                      saveSettings();
                    }}
                    style={{
                      padding: '10px 24px',
                      fontSize: '14px',
                      fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                      letterSpacing: '1px'
                    }}
                  >
                    {t("app.save")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === 'wardrobe' && <WardrobeMenu account={activeAccount} opacity={menuOpacity} onSkinChange={() => setSkinTimestamp(Date.now())} />}

          {view === 'accounts' && (
            <div 
              className="accounts-tab-view" 
              style={{ 
                flex: 1, 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'flex-start',
                background: `rgba(18, 18, 18, ${menuOpacity / 100})`, 
                overflow: 'hidden', 
                boxSizing: 'border-box',
                padding: '24px 40px'
              }}
            >
              <div style={{ 
                maxWidth: '650px', 
                width: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                margin: '0 auto' 
              }}>
                <div>
                  <h1 style={{ color: '#fff', fontSize: '22px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontFamily: '"Blocks", sans-serif' }}>
                    {selectedAuthMethod === null 
                      ? t("app.chooseAccountType") 
                      : (selectedAuthMethod === 'offline' ? 'Вход без регистрации' : 'Вход в аккаунт')}
                  </h1>
                  <span style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    {selectedAuthMethod === null 
                      ? t("app.chooseAccountDesc") 
                      : (selectedAuthMethod === 'offline' ? 'Укажите никнейм игрока для локального входа' : 'Введите имя пользователя/E-mail и пароль')}
                  </span>
                </div>

                {/* Existing accounts list */}
                {selectedAuthMethod === null && accounts.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '12px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Ваши аккаунты
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '190px', overflowY: 'auto', paddingRight: '4px' }}>
                      {accounts.map(acc => (
                        <div 
                          key={acc.id} 
                          className="mc-acc-list-item" 
                          onClick={() => saveAccounts(accounts, acc)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            padding: '8px 14px', 
                            background: activeAccount.id === acc.id ? 'rgba(241, 196, 15, 0.12)' : '#141414', 
                            border: '2px solid', 
                            borderColor: activeAccount.id === acc.id ? 'var(--pg-yellow)' : '#262626', 
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <MinecraftFace acc={acc} size={34} />
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <span style={{ color: 'white', fontWeight: activeAccount.id === acc.id ? 'bold' : 'normal', fontSize: '14px', fontFamily: '"Blocks", sans-serif' }}>{acc.name}</span>
                            <span style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', marginTop: '1px' }}>{acc.type === 'offline' ? t("app.typeOffline") : acc.type}</span>
                          </div>
                          {activeAccount.id === acc.id && (
                            <span style={{ fontSize: '10px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', color: 'var(--pg-yellow)', padding: '2px 6px', background: 'rgba(241,196,15,0.2)', border: '1px solid var(--pg-yellow)' }}>
                              АКТИВЕН
                            </span>
                          )}
                          {accounts.length > 1 && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeAccount(acc.id) }} 
                              className="mc-btn-danger" 
                              style={{ padding: '5px 10px', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
                              title="Удалить аккаунт"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add new account section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: selectedAuthMethod === null ? '1px solid #282828' : 'none', paddingTop: selectedAuthMethod === null ? '12px' : '0px' }}>
                  {selectedAuthMethod === null ? (
                    /* Step 1: Method selection cards */
                    <>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '12px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Добавить новый аккаунт
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div 
                          className="mc-acc-type-btn" 
                          onClick={() => { setSelectedAuthMethod('elyby'); setAuthType('elyby'); setAuthError(''); }}
                          style={{ cursor: 'pointer', padding: '8px 16px' }}
                        >
                          <div className="mc-acc-icon-box" style={{ width: '40px', height: '40px' }}><img src="https://ely.by/favicon.ico" width={22} /></div>
                          <div className="mc-acc-text">
                            <span className="subtitle" style={{ fontSize: '11px' }}>{t("app.licenseTitle")}</span>
                            <span className="title" style={{ fontSize: '14px' }}>{t("app.elybyAccount")}</span>
                          </div>
                          <div className="mc-acc-arrow">{'>'}</div>
                        </div>

                        <div 
                          className="mc-acc-type-btn" 
                          onClick={() => { setSelectedAuthMethod('pgsync'); setAuthType('pgsync'); setAuthError(''); }}
                          style={{ cursor: 'pointer', padding: '8px 16px' }}
                        >
                          <div className="mc-acc-icon-box" style={{ width: '40px', height: '40px' }}><img src="https://raw.githubusercontent.com/eshkereshek/pg_website/main/public/newicon.png" width={22} /></div>
                          <div className="mc-acc-text">
                            <span className="subtitle" style={{ fontSize: '11px' }}>PG-SYNC</span>
                            <span className="title" style={{ fontSize: '14px' }}>{t("app.pgsyncAccount")}</span>
                          </div>
                          <div className="mc-acc-arrow">{'>'}</div>
                        </div>

                        <div 
                          className="mc-acc-type-btn" 
                          onClick={() => { setSelectedAuthMethod('offline'); setAuthType('offline'); setAuthError(''); }}
                          style={{ cursor: 'pointer', padding: '8px 16px' }}
                        >
                          <div className="mc-acc-icon-box" style={{ width: '40px', height: '40px' }}><img src="https://minotar.net/helm/Steve/40.png" width={22} style={{ imageRendering: 'pixelated' }} /></div>
                          <div className="mc-acc-text">
                            <span className="subtitle" style={{ fontSize: '11px' }}>{t("app.offlineTitle")}</span>
                            <span className="title" style={{ fontSize: '14px' }}>{t("app.offlineAccount")}</span>
                          </div>
                          <div className="mc-acc-arrow">{'>'}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Step 2: Dedicated Form Panel */
                    <div className="mc-acc-form-panel" style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px', 
                      background: '#121212', 
                      padding: '18px 24px', 
                      border: '2px solid #2d2d2d',
                      boxShadow: '0 8px 25px rgba(0,0,0,0.6)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #282828', paddingBottom: '15px' }}>
                        <button 
                          className="hover-scale-btn" 
                          onClick={() => { setSelectedAuthMethod(null); setAuthError(''); }}
                          style={{ 
                            padding: '6px 14px', 
                            fontSize: '12px', 
                            background: '#222', 
                            color: '#ccc', 
                            border: '1px solid #444', 
                            cursor: 'pointer',
                            fontFamily: '"Blocks", sans-serif'
                          }}
                        >
                          ← Назад
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {selectedAuthMethod === 'elyby' && <img src="https://ely.by/favicon.ico" width={20} />}
                          {selectedAuthMethod === 'pgsync' && <img src="https://raw.githubusercontent.com/eshkereshek/pg_website/main/public/newicon.png" width={20} />}
                          {selectedAuthMethod === 'offline' && <img src="https://minotar.net/helm/Steve/20.png" width={20} style={{ imageRendering: 'pixelated' }} />}
                          <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '15px', color: '#fff', textTransform: 'uppercase' }}>
                            {selectedAuthMethod === 'elyby' && t("app.elybyAccount")}
                            {selectedAuthMethod === 'pgsync' && t("app.pgsyncAccount")}
                            {selectedAuthMethod === 'offline' && t("app.offlineAccount")}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '5px' }}>
                        {selectedAuthMethod === 'offline' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', color: '#aaa', fontFamily: '"Blocks", sans-serif' }}>Никнейм игрока</label>
                            <input 
                              type="text" 
                              className="mc-input" 
                              placeholder={t("app.nicknamePlaceholder")} 
                              value={newAccountName} 
                              onChange={e => setNewAccountName(e.target.value)} 
                              onKeyDown={e => e.key === 'Enter' && addAccount()} 
                              autoFocus
                            />
                          </div>
                        )}

                        {(selectedAuthMethod === 'elyby' || selectedAuthMethod === 'pgsync') && (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '12px', color: '#aaa', fontFamily: '"Blocks", sans-serif' }}>
                                {selectedAuthMethod === 'pgsync' ? "Имя пользователя" : "E-mail"}
                              </label>
                              <input 
                                type="text" 
                                className="mc-input" 
                                placeholder={selectedAuthMethod === 'pgsync' ? "Имя пользователя" : "E-mail"} 
                                disabled={authLoading} 
                                value={authEmail} 
                                onChange={e => setAuthEmail(e.target.value)} 
                                autoFocus
                              />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '12px', color: '#aaa', fontFamily: '"Blocks", sans-serif' }}>Пароль</label>
                              <div style={{ position: 'relative' }}>
                                <input 
                                  type={showPassword ? "text" : "password"} 
                                  className="mc-input" 
                                  placeholder={t("app.passwordPlaceholder")} 
                                  disabled={authLoading} 
                                  value={authPassword} 
                                  onChange={e => setAuthPassword(e.target.value)} 
                                  onKeyDown={e => e.key === 'Enter' && addAccount()} 
                                  style={{ width: '100%', paddingRight: '40px' }} 
                                />
                                <button 
                                  onClick={() => setShowPassword(!showPassword)}
                                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}
                                  type="button"
                                >
                                  {showPassword ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
                                  ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        {authError && (
                          <div style={{ color: '#e74c3c', fontSize: '13px', padding: '8px 12px', background: 'rgba(231, 76, 60, 0.15)', border: '1px solid #e74c3c' }}>
                            {authError}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
                          <button className="mc-btn-primary" style={{ padding: '10px 25px', textTransform: 'uppercase', letterSpacing: '1px' }} onClick={addAccount} disabled={authLoading}>
                            {authLoading ? t("app.loading") : t("app.add")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
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
      )}

      {showPlayEditModal && (
        <div className="modal-overlay" onClick={() => setShowPlayEditModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', padding: '20px', width: '400px', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', color: 'white', fontFamily: '"Blocks", sans-serif' }}>Настройки сборки</span>
              <button onClick={() => setShowPlayEditModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '18px', lineHeight: '18px' }}>x</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px', fontFamily: '"Blocks", sans-serif' }}>Название</label>
                <input type="text" className="mc-input" value={editPlayName} onChange={e => setEditPlayName(e.target.value)} style={{ fontFamily: '"Blocks", sans-serif' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ color: '#aaa', fontSize: '12px', fontFamily: '"Blocks", sans-serif' }}>Иконка</label>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <label
                    onClick={async (e) => {
                      e.preventDefault();
                      // @ts-ignore
                      const dataUrl = await window.electronAPI.selectIconFile();
                      if (dataUrl) setEditPlayIcon(dataUrl);
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
                        border: editPlayIcon === icon ? '2px solid var(--pg-yellow)' : '2px solid transparent',
                        padding: '2px',
                        objectFit: 'cover'
                      }}
                      onClick={() => setEditPlayIcon(icon)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  className="mc-btn-primary"
                  onClick={() => {
                    if (confirmPlayDelete) {
                      handleDeletePlayEdit();
                    } else {
                      setConfirmPlayDelete(true);
                    }
                  }}
                  style={{ flex: 1, padding: '10px', background: '#e74c3c', borderColor: '#c0392b', color: 'white' }}
                >
                  {confirmPlayDelete ? 'Уверены?' : 'Удалить'}
                </button>
                <button className="mc-btn-primary" onClick={handleSavePlayEdit} style={{ flex: 1, padding: '10px' }}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Java Manager Modal */}
      {showJavaManagerModal && (
        <div className="modal-overlay" onClick={() => setShowJavaManagerModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ background: '#1c1c1c', border: '2px solid #2a2a2a', padding: '24px', width: '580px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', color: '#f1c40f', fontFamily: '"MinecraftTen", "Blocks", sans-serif' }}>☕ Компоненты Java Runtime</span>
              <button onClick={() => setShowJavaManagerModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: '#bbb', lineHeight: '1.5' }}>
              Лаунчер автоматически выбирает нужную версию Java для каждой версии игры. Вы можете установить недостающие версии вручную:
            </p>

            {javaError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#4a1515', border: '1px solid #e74c3c', color: '#ffb3b3', fontSize: '12px' }}>
                {javaError}
              </div>
            )}

            {[
              {
                version: '8' as const,
                title: 'Java 8 (JRE 8)',
                desc: 'Для старых и классических версий (1.0 — 1.16.5, Alpha, Beta, Classic)',
                badge: '<= 1.16.5'
              },
              {
                version: '17' as const,
                title: 'Java 17 (JRE 17)',
                desc: 'Для версий Minecraft 1.17 — 1.20.4',
                badge: '1.17 — 1.20.4'
              },
              {
                version: '21' as const,
                title: 'Java 21 (JRE 21)',
                desc: 'Для современных версий игры (1.20.5 — 1.21+)',
                badge: '1.20.5+'
              }
            ].map(item => {
              const isInst = !!installedJavas[item.version]?.installed
              const isThisInstalling = installingJava === item.version
              const pct = isThisInstalling ? (javaProgress?.progress || 10) : 0

              return (
                <div key={item.version} style={{
                  backgroundColor: '#141414', border: `1px solid ${isInst ? '#27ae60' : '#333'}`,
                  padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ color: '#fff', fontSize: '14px' }}>{item.title}</strong>
                        <span style={{ fontSize: '10px', background: '#282828', color: '#aaa', padding: '2px 6px', borderRadius: '3px' }}>{item.badge}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{item.desc}</div>
                    </div>

                    <div>
                      {isInst ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2ecc71', fontSize: '12px', fontWeight: 'bold' }}>
                          <span>✓</span> Установлена
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!!installingJava}
                          onClick={() => handleInstallJava(item.version)}
                          className="mc-btn-primary"
                          style={{ padding: '6px 14px', fontSize: '11px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {isThisInstalling ? 'Установка...' : 'Установить'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isThisInstalling && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ width: '100%', height: '12px', backgroundColor: '#000', border: '1px solid #333', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: 'linear-gradient(to right, #f39c12, #f1c40f)',
                          transition: 'width 0.2s'
                        }}></div>
                      </div>
                      <div style={{ fontSize: '10px', color: '#f1c40f', marginTop: '4px', fontFamily: 'monospace' }}>
                        {javaProgress?.status || 'Загрузка...'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <button
                type="button"
                disabled={!!installingJava || Object.values(installedJavas).every(j => j.installed)}
                onClick={handleInstallAllRecommended}
                className="mc-btn-primary"
                style={{ padding: '8px 16px', fontSize: '12px' }}
              >
                Установить все
              </button>
              <button
                type="button"
                onClick={() => setShowJavaManagerModal(false)}
                className="mc-btn-primary"
                style={{ padding: '8px 24px', fontSize: '12px' }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '15px',
        color: '#666',
        fontSize: '12px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 100
      }}>
        v{pkg.version}
      </div>
    </div>
  )
}
 
