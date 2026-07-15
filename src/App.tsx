import { useState, useEffect, useMemo } from 'react'
import { useTranslation, type Language } from './i18n'
import { Trash, Folder, Play } from 'lucide-react'
import ModsMenu from './ModsMenu'
import ModpacksMenu from './ModpacksMenu'
import { ServersMenu } from './ServersMenu'
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

  const [selectedVersion, setSelectedVersion] = useState('')
  const [launching, setLaunching] = useState(false)
  const [gameRunning, setGameRunning] = useState(false)
  const [crashLog, setCrashLog] = useState<string | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<{ id: string, name: string, text: string, progress: number }[]>([])
  const [showDownloadsDropdown, setShowDownloadsDropdown] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [isUpdating, setIsUpdating] = useState(false)
  const [progress, setProgress] = useState('')
  const translatedProgress = useMemo(() => {
    if (!progress) return '';
    if (progress === 'Инициализация запуска...') return t('backend.initLaunch');
    if (progress === 'Установка завершена!') return t('backend.installComplete');
    if (progress === 'Игра запущена') return t('backend.gameStarted');
    if (progress === 'Моды установлены!') return t('backend.modsInstalled');

    if (progress.startsWith('Скачивание: ')) return progress.replace('Скачивание: ', t('backend.downloading') + ' ');
    if (progress.startsWith('Проверка файлов: ')) return progress.replace('Проверка файлов: ', t('backend.checkingFiles') + ' ');
    if (progress.startsWith('Загрузка мода ')) return progress.replace('Загрузка мода ', t('backend.downloadingMod') + ' ');
    if (progress === 'Поиск OptiFine...') return t('backend.searchOptifine');
    if (progress === 'OptiFine для этой версии не найден!') return t('backend.optifineNotFound');
    if (progress.startsWith('Скачивание ') && progress.includes('(Источник')) {
      return progress.replace('Скачивание ', t('backend.downloading') + ' ').replace('Источник', t('backend.source'));
    }
    if (progress === 'OptiFine успешно установлен!') return t('backend.optifineSuccess');
    if (progress.startsWith('Ошибка установки OptiFine:')) return progress.replace('Ошибка установки OptiFine:', t('backend.optifineError'));

    if (progress.startsWith('Fetching modpack versions')) return progress.replace('Fetching modpack versions', t('backend.fetchingModpackVersions'));
    if (progress.startsWith('Downloading file')) return progress.replace('Downloading file', t('backend.downloadingFile'));
    if (progress.startsWith('Extracting modpack')) return t('backend.extractingModpack');
    if (progress.startsWith('Downloading modpack archive')) return t('backend.downloadingArchive');
    if (progress.startsWith('Applying')) return progress.replace('Applying', t('backend.applying'));
    if (progress === 'Modpack installation complete!') return t('backend.modpackComplete');
    if (progress.startsWith('Installing Fabric')) return progress.replace('Installing Fabric', t('backend.installingFabric'));
    if (progress.startsWith('Downloading Fabric')) return progress.replace('Downloading Fabric', t('backend.downloadingFabric'));
    if (progress === 'Fabric installed successfully!') return t('backend.fabricSuccess');
    if (progress === 'Fabric already installed!') return t('backend.fabricAlreadyInstalled');
    if (progress.startsWith('Looking for Forge')) return progress.replace('Looking for Forge', t('backend.lookingForForge'));
    if (progress === 'Forge already installed!') return t('backend.forgeAlreadyInstalled');
    if (progress.startsWith('Downloading Forge')) return progress.replace('Downloading Forge', t('backend.downloadingForge'));
    if (progress === 'Forge downloaded! Installing...') return t('backend.forgeDownloaded');
    if (progress.startsWith('Java ') && progress.includes('is already installed!')) return progress.replace('is already installed!', t('backend.javaAlreadyInstalled'));
    if (progress.startsWith('Downloading Java')) return progress.replace('Downloading Java', t('backend.downloadingJava'));
    if (progress === 'Extracting Java Runtime...') return t('backend.extractingJava');
    if (progress === 'Checking Java...') return t('backend.checkingJava');
    if (progress === 'Initializing Minecraft Core...') return t('backend.initCore');
    if (progress === 'Downloading Ely.by Skin system helper...') return t('backend.downloadElyby');
    if (progress === 'Ely.by Skin helper downloaded!') return t('backend.elybyDownloaded');
    if (progress.startsWith('Warning: Ely.by')) return progress.replace('Warning: Ely.by skin system failed:', t('backend.elybyWarning'));
    if (progress === 'Preparing game files... (This may take a while)') return t('backend.preparingFiles');
    if (progress.startsWith('Error:')) return progress.replace('Error:', t('backend.error'));

    return progress;
  }, [progress, t]);


  const MinecraftFace = ({ acc, size = 32 }: { acc: Account, size?: number }) => {
    if (acc.type !== 'elyby') {
      const url = acc.skinUrl || `https://minotar.net/helm/${acc.name}/${size}.png`;
      return <img src={url} width={size} height={size} style={{ imageRendering: 'pixelated', borderRadius: 0, width: size, height: size }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://minotar.net/helm/Steve/${size}.png`; }} alt="Skin" />
    }

    const rawSkinUrl = `http://skinsystem.ely.by/skins/${acc.name}.png`;



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
  const [showOldReleases, setShowOldReleases] = useState(localStorage.getItem('mc_show_old_releases') !== 'false')
  const [showBeta, setShowBeta] = useState(localStorage.getItem('mc_show_beta') === 'true')
  const [showAlpha, setShowAlpha] = useState(localStorage.getItem('mc_show_alpha') === 'true')
  const [mcArgs, setMcArgs] = useState(localStorage.getItem('mc_args') || '')

  const [maxRam, setMaxRam] = useState(8192)
  const [ramValue, setRamValue] = useState(Number(localStorage.getItem('mc_ram')) || 2048)

  const [menuOpacity, setMenuOpacity] = useState(Number(localStorage.getItem('mc_menu_opacity') || 95))
  const [enableMenuBlur, setEnableMenuBlur] = useState(localStorage.getItem('mc_menu_blur') === 'true')
  const [enableServersTab, setEnableServersTab] = useState(localStorage.getItem('mc_enable_servers_tab') === 'true')

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.titlebar-downloads') && !target.closest('.downloads-dropdown')) {
        setShowDownloadsDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // @ts-ignore
    window.electronAPI.onLaunchProgress((msg: string) => {
      setProgress(msg)
      if (msg === 'Launch complete') setTimeout(() => setProgress(''), 3000)
      if (msg === 'Установка завершена!') setTimeout(() => setProgress(''), 2000)
    })

    // @ts-ignore
    window.electronAPI.onDownloadUpdate((data: any) => {
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
      setActiveDownloads(prev => prev.filter(d => d.id !== id))
    })

    // @ts-ignore
    window.electronAPI.onGameClosed(() => {
      setGameRunning(false)
      if (localStorage.getItem('mc_hide_launcher_on_play') === 'true') {
        // We can't directly un-hide from here if hidden in main.ts, but main.ts does win.show()
      }
      
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
      // @ts-ignore
      window.electronAPI.onUpdateProgress((prog: number) => {
        setUpdateProgress(prog)
      })
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
          setActiveAccount(savedAccounts[0])
        }
      } catch (e) { }
    }
    loadAccounts()
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

    if (filtered.length > 0 && !selectedVersion) {
      setSelectedVersion(filtered[0].id)
    }
  }, [rawVersions, showSnapshots, showModified, showOldReleases, showBeta, showAlpha])

  const saveSettings = () => {
    localStorage.setItem('mc_ram', ramValue.toString())
    localStorage.setItem('mc_show_snapshots', showSnapshots.toString())
    localStorage.setItem('mc_show_modified', showModified.toString())
    localStorage.setItem('mc_show_old_releases', showOldReleases.toString())
    localStorage.setItem('mc_show_beta', showBeta.toString())
    localStorage.setItem('mc_show_alpha', showAlpha.toString())
    localStorage.setItem('mc_args', mcArgs)
    localStorage.setItem('hideLauncherOnPlay', hideLauncherOnPlay.toString())
    localStorage.setItem('mc_menu_opacity', menuOpacity.toString())
    localStorage.setItem('mc_menu_blur', enableMenuBlur.toString())
    localStorage.setItem('mc_enable_servers_tab', enableServersTab.toString())
    handleCloseSettings()
  }



  const saveAccounts = async (newAccounts: Account[], newActive: Account) => {
    setAccounts(newAccounts)
    setActiveAccount(newActive)
    // @ts-ignore
    await window.electronAPI.saveAccounts(newAccounts)
  }

  const addAccount = async () => {
    setAuthError('')
    if (authType === 'offline' && !newAccountName.trim()) return
    setAuthLoading(true)
    try {
      let newAcc: Account
      if (authType === 'offline') {
        newAcc = { id: Date.now().toString(), name: newAccountName, type: 'offline' }
      } else if (authType === 'microsoft') {
        // @ts-ignore
        const res = await window.electronAPI.authMicrosoft()
        newAcc = { id: Date.now().toString(), name: res.username, type: 'microsoft', uuid: res.uuid, token: res.token, skinUrl: res.skinUrl }
      } else {
        // Ely.by
        if (!authEmail || !authPassword) { setAuthError('Введите логин и пароль'); setAuthLoading(false); return }
        // @ts-ignore
        const res = await window.electronAPI.authElyby(authEmail, authPassword)
        newAcc = { id: Date.now().toString(), name: res.username, type: 'elyby', uuid: res.uuid, token: res.token, clientToken: res.clientToken, skinUrl: res.skinUrl }
      }

      const newAccounts = [...accounts, newAcc]
      saveAccounts(newAccounts, newAcc)
      setNewAccountName('')
      setAuthEmail('')
      setAuthPassword('')
      setShowAccountsModal(false)
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
      }
      
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
      if (hideLauncherOnPlay) {
        // @ts-ignore
        window.electronAPI.windowShow()
      }
    }
    setLaunching(false)
  }

  // @ts-ignore
  const openFolder = () => window.electronAPI.openFolder()

  const handleUpdate = () => {
    if (updateInfo.downloadUrl) {
      setUpdateProgress(0)
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
        <div className="titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
            onClick={() => setShowDownloadsDropdown(!showDownloadsDropdown)}
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
                  cursor: 'default'
                }}
              >
                {activeDownloads.length === 0 ? (
                  <div style={{ color: '#888', textAlign: 'center', padding: '20px 0', fontSize: '12px' }}>Нет активных загрузок</div>
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
                  setShowAccountsModal(true);
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
                opacity: view === 'installations' ? 1 : 0.67,
                transition: 'opacity 0.2s'
              }}>
                <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAkklEQVR4AZSPgQ6AIAgFq///Z+PcwDdNodabCNxtPlf9a7ZK7Bh/VQB4D2xUFcEWRpMJFNYalnvLBCwSlvUJca8KgIEW2UkAAAhEqLXX652gD6GmIKEV8y9BDNmU0Pe46JoFLMRwgul7YqSCDA5ICxVo3+ud1OfLE2JgRQrbziIA8vBedo7RJwBojqAPVeC9X+cLAAD//3V/9IAAAAAGSURBVAMAkiYeIQXDV5IAAAAASUVORK5CYII=" width="16" height="16" />
              </svg> {t("app.installations")}
            </div>
            <div className={`jl-nav-item ${view === 'modpacks' ? 'active' : ''}`} onClick={() => setView('modpacks')}>
              <svg viewBox="0 0 16 16" width="22" height="22" style={{
                filter: 'brightness(0) invert(1)',
                opacity: view === 'modpacks' ? 1 : 0.67,
                transition: 'opacity 0.2s'
              }}>
                <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAm0lEQVR4AbSSCw6AIAxD1fvfWftmpgUnifETClvXlZG4TC+/Xw1WDedQel3VBNmEetYGdEzOkwfcwAU0gRBpIwYKWyM3oPgYvUF5i1z76UTtqzeAxQQQ943JUwtUBlHQ5mKPVTrXyOBUDaLPDfzN1b2Xuk/AOwGNCDkdyaEBUXODILRRBNkgKn4eOEB+oDLIImJH8s05MmiEd8kGAAD//6TAe8AAAAAGSURBVAMAv9MaIYD4VE4AAAAASUVORK5CYII=" width="16" height="16" />
              </svg> {t("app.sidebarModpacks")}
            </div>
            {enableServersTab && (
              <div className={`jl-nav-item ${view === 'servers' ? 'active' : ''}`} onClick={() => setView('servers')}>
                <svg viewBox="0 0 16 16" width="22" height="22" style={{
                  filter: 'brightness(0) invert(1)',
                  opacity: view === 'servers' ? 1 : 0.67,
                  transition: 'opacity 0.2s'
                }}>
                  <image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnUlEQVR4AaxSgQ2AIAwbPq5eru1MTSMqEDV0wa7buoQpPn6/NthgZgSQR8gBC5NAWBtAOk/WqEEyCAVYGqAGkuN4A04my84OcldIe67gAk5weK66u4MZWZ/8dqcW8rh1kIne4A64V0FhD6iFNG4dXK2n8Cm4A+1VIHbgtzrSVg44vfUOqDk7ygEnimT3N0iXNWpAksQIWFOtkORI2AEAAP//kZTYHgAAAAZJREFUAwBWGzYhjQL2qgAAAABJRU5ErkJggg==" width="16" height="16" />
                </svg> {t("app.sidebarServers")}
              </div>
            )}
          </div>

          <div className="jl-nav-separator" style={{ height: '8px', background: '#333', margin: '10px 0', border: '3px solid #111', borderLeft: 'none', borderRight: 'none', boxShadow: 'inset 0 3px 0 0 #555, inset 0 -3px 0 0 #222' }}></div>

          <div className="jl-bottom">
            <div className="jl-nav-item" onClick={() => setShowAccountsModal(true)}>
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
        <div className="jl-main" style={view === 'play' || view === 'skins' ? { backgroundImage: mainBgDataUrl ? `url("${mainBgDataUrl}")` : 'url("./background.jpg")' } : {}}>

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
              rgba(255, 255, 255, 0.15) 75%,
              transparent 75%,
              transparent
            );
            background-size: 40px 40px;
            animation: progress-bar-stripes 1s linear infinite;
          }
        `}</style>

          {progress && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(26,26,26,0.95)',
              padding: '10px 20px',
              border: '3px solid #111',
              boxShadow: 'inset 0 3px 0 0 #444, inset 3px 0 0 0 #333, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #222, 0 8px 16px rgba(0,0,0,0.6)',
              color: 'white',
              zIndex: 100,
              fontSize: '13px',
              maxWidth: '500px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px'
            }}>
              <span style={{
                maxWidth: '300px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: '"Inter", sans-serif',
                fontWeight: 500
              }}>
                {translatedProgress}
              </span>
              {progress !== 'Установка завершена!' && progress !== 'Игра запущена' && progress !== 'Моды установлены!' && (
                <div style={{
                  width: '100px',
                  height: '8px',
                  background: '#0d0d0d',
                  border: '2px solid #000',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div
                    style={{
                      width: `${(() => {
                        const match = progress.match(/\((\d+)%\)/);
                        if (match) return match[1];
                        if (progress.toLowerCase().includes('started') || progress.toLowerCase().includes('запущен')) return '100';
                        return '20'; // Default placeholder width for indeterminate
                      })()}%`,
                      height: '100%',
                      background: 'var(--pg-yellow)',
                      transition: 'width 0.3s ease-out',
                    }}
                    className={!progress.match(/\((\d+)%\)/) && !progress.toLowerCase().includes('запущен') && !progress.toLowerCase().includes('started') ? 'progress-striped' : ''}
                  />
                </div>
              )}
            </div>
          )}


          {view === 'play' && (
            <div className="jl-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px', padding: '0 40px', width: '100%' }}>
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
                                onClick={() => { setSelectedVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                              >
                                <img src={mp.icon || './iconsblocks/Grass_Block_(inventory)_MCE.png'} width={24} height={24} style={{ objectFit: 'cover' }} />
                                <span style={{ color: 'white', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                              </div>
                            ))}
                          </>
                        )}
                        <div style={{ padding: '8px 10px', fontSize: '11px', color: '#aaa', background: '#222', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
                        {versions.map(v => (
                          <div
                            key={v}
                            className="dropdown-item"
                            onClick={() => { setSelectedVersion(v); handleCloseVersionDropdown(); }}
                            style={{
                              padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a',
                              background: installedVersions.includes(v) ? 'rgba(255, 255, 255, 0.05)' : 'transparent'
                            }}
                          >
                            <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={24} height={24} />
                            <span style={{ color: installedVersions.includes(v) ? '#fff' : '#aaa', fontSize: '13px', fontWeight: installedVersions.includes(v) ? 'bold' : 'normal' }}>
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
                  <img src="./play_empty.png" alt="Play" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                  <span style={{
                    position: 'relative', zIndex: 2,
                    fontFamily: '"MinecraftTen", "Blocks", monospace',
                    fontSize: '16px', color: '#ffffff', WebkitTextFillColor: '#ffffff', WebkitTextStroke: '1px #f9ca24', textShadow: '2px 2px 0px rgba(0,0,0,0.5)', letterSpacing: '2px',
                    userSelect: 'none', transition: 'transform 0.1s'
                  }}>
                    {gameRunning ? t('app.gameRunning') : (!selectedVersion || selectedVersion.startsWith('mp:') || installedVersions.includes(selectedVersion) ? t('app.playBtn') : t('app.installBtn'))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {view === 'installations' && <ModsMenu currentVersion={selectedVersion} opacity={menuOpacity} blur={enableMenuBlur} />}
          {view === 'modpacks' && <ModpacksMenu currentVersion={selectedVersion} opacity={menuOpacity} blur={enableMenuBlur} />}
          {view === 'servers' && <ServersMenu opacity={menuOpacity} blur={enableMenuBlur} />}

        </div>
      </div>

      {/* Settings Overlay */}
      {view === 'settings' && (
        <div className={`settings-modal-overlay ${isClosingSettings ? 'closing' : ''}`} onClick={handleCloseSettings}>
          <div className="settings-modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div onClick={() => setSettingsTab('main')} style={{ padding: '10px 0', color: settingsTab === 'main' ? '#fff' : '#aaa', borderBottom: settingsTab === 'main' ? '2px solid var(--pg-yellow)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>{t("app.mainSettings")}</div>
                <div onClick={() => setSettingsTab('customization')} style={{ padding: '10px 0', color: settingsTab === 'customization' ? '#fff' : '#aaa', borderBottom: settingsTab === 'customization' ? '2px solid var(--pg-yellow)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>{t("app.launcherSettings")}</div>
                <div onClick={() => setSettingsTab('experimental')} style={{ padding: '10px 0', color: settingsTab === 'experimental' ? '#fff' : '#aaa', borderBottom: settingsTab === 'experimental' ? '2px solid var(--pg-yellow)' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>Экспериментальные</div>
              </div>
              <button
                onClick={handleCloseSettings}
                className="mc-btn-primary"
                style={{ padding: '6px 10px', background: '#222', border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '14px', lineHeight: '14px', textTransform: 'lowercase' }}>x</span>
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
                    value="default" 
                    onChange={() => {}} 
                    options={[{value: 'default', label: t("app.default")}]} 
                    style={{ flex: 1 }} 
                  />
                  <button className="mc-btn-primary" style={{ background: '#2c3e50', borderColor: '#34495e', color: 'white', textShadow: 'none' }}>{t("app.change")}</button>
                </div>

                <div className="settings-label" style={{ marginTop: '20px' }}>{t("app.memoryAllocation")}</div>
                <div className="settings-ram-wrapper" style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div className="ram-slider-container" style={{ flex: 1 }}>
                    <input type="range" min="512" max={maxRam} step="512" className="ram-slider" value={ramValue} onChange={e => setRamValue(Number(e.target.value))} style={{ width: '100%' }} />
                    <div className="ram-marks" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '5px' }}>
                      <span>512M</span>
                      <span>{Math.floor(maxRam * 0.25)}M</span>
                      <span>{Math.floor(maxRam * 0.5)}M</span>
                      <span>{Math.floor(maxRam * 0.75)}M</span>
                      <span>MAX</span>
                    </div>
                  </div>
                  <div className="ram-value-box" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white' }}>
                    <input type="number" className="mc-input" value={ramValue} onChange={e => setRamValue(Number(e.target.value))} style={{ width: '70px', padding: '5px' }} /> MB
                  </div>
                </div>

              </div>
            ) : settingsTab === 'customization' ? (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hideLauncherOnPlay} onChange={e => setHideLauncherOnPlay(e.target.checked)} /> Скрывать лаунчер при запуске игры
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">{t('app.launcherLanguage')}</div>
                  <div style={{ marginTop: '5px' }}>
                    <McSelect 
                      value={language} 
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
                  <div className="settings-label">{t('app.mainBg')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                    {mainBgDataUrl && (
                      <img src={mainBgDataUrl} style={{ width: '192px', height: '108px', objectFit: 'cover', border: '2px solid #333', borderRadius: '4px' }} alt="Main Preview" />
                    )}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label className="mc-btn-primary" style={{ cursor: 'pointer', padding: '8px 15px', color: 'white' }}>
                        {t('app.selectFile')}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: any) => {
                          if (e.target.files && e.target.files[0]) {
                            saveCompressedImage(e.target.files[0], 'mc_main_bg_data', (url) => setMainBgDataUrl(url));
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="settings-label">Прозрачность меню</div>
                  <div className="settings-ram-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div className="ram-slider-container" style={{ flex: 1 }}>
                      <input type="range" min="0" max="100" step="5" className="ram-slider" value={menuOpacity} onChange={e => setMenuOpacity(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <div className="ram-value-box" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white' }}>
                      <input type="number" className="mc-input" value={menuOpacity} onChange={e => setMenuOpacity(Number(e.target.value))} style={{ width: '60px', padding: '5px' }} /> %
                    </div>
                  </div>
                </div>

              </div>
            ) : settingsTab === 'experimental' ? (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={enableMenuBlur} onChange={e => setEnableMenuBlur(e.target.checked)} /> Включить размытие фона (Blur)
                  </label>
                  <span style={{ fontSize: '11px', color: '#888', marginLeft: '24px' }}>Внимание: Размытие может вызывать снижение производительности при прокрутке меню на некоторых системах.</span>
                  
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '13px', cursor: 'pointer', marginTop: '10px' }}>
                    <input type="checkbox" checked={enableServersTab} onChange={e => setEnableServersTab(e.target.checked)} /> Включить вкладку "Сервера"
                  </label>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <div className="settings-label">Очистка данных</div>
                  <button className="mc-btn-primary" style={{ background: '#e74c3c', borderColor: '#c0392b', color: 'white', padding: '10px', width: '250px' }} onClick={async () => {
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
                  }}>
                    Очистить кэш лаунчера
                  </button>
                  <span style={{ fontSize: '11px', color: '#888' }}>Удаляет временные файлы установки сборок и кэш сессии.</span>
                </div>
              </div>
            ) : null}

            <div className="settings-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
              <button className="mc-btn-primary" style={{ background: '#222', borderColor: '#333', color: 'white', textShadow: 'none' }} onClick={handleCloseSettings}>{t("app.cancel")}</button>
              <button className="mc-btn-primary" onClick={saveSettings}>{t("app.save")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts Modal */}
      {showAccountsModal && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setShowAccountsModal(false)}>
          <div className="modal-box" style={{ background: '#111', border: '3px solid #000', boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #0a0a0a', padding: '30px', width: '500px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ color: '#fff', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontFamily: '"Blocks", sans-serif' }}>{t("app.chooseAccountType")}</h2>
                <span style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>{t("app.chooseAccountDesc")}</span>
              </div>
              <button
                onClick={() => setShowAccountsModal(false)}
                className="mc-btn-primary"
                style={{ padding: '6px 10px', background: '#222', border: 'none', color: '#aaa', display: 'flex', alignItems: 'center', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                <span style={{ fontFamily: '"Blocks", sans-serif', fontSize: '14px', lineHeight: '14px', textTransform: 'lowercase' }}>x</span>
              </button>
            </div>

            {/* Existing accounts list */}
            {accounts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', marginBottom: '25px' }}>
                {accounts.map(acc => (
                  <div key={acc.id} className="mc-acc-list-item" onClick={() => saveAccounts(accounts, acc)}
                    style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '10px 15px', background: activeAccount.id === acc.id ? '#1e1e1e' : '#151515', border: '1px solid', borderColor: activeAccount.id === acc.id ? '#555' : '#222', cursor: 'pointer' }}>
                    <MinecraftFace acc={acc} size={32} />
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span style={{ color: 'white', fontWeight: activeAccount.id === acc.id ? 'bold' : 'normal', fontSize: '14px' }}>{acc.name}</span>
                      <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>{acc.type === 'offline' ? t("app.typeOffline") : acc.type}</span>
                    </div>
                    {accounts.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); removeAccount(acc.id) }} className="icon-button" style={{ color: '#e74c3c' }}>
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Account Type Selector - Beautiful Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className={`mc-acc-type-btn ${authType === 'elyby' ? 'selected' : ''}`} onClick={() => setAuthType('elyby')}>
                <div className="mc-acc-icon-box"><img src="https://ely.by/favicon.ico" width={24} /></div>
                <div className="mc-acc-text">
                  <span className="subtitle">{t("app.licenseTitle")}</span>
                  <span className="title">{t("app.elybyAccount")}</span>
                </div>
                <div className="mc-acc-arrow">{'>'}</div>
              </div>
              <div className={`mc-acc-type-btn ${authType === 'microsoft' ? 'selected' : ''}`} onClick={() => setAuthType('microsoft')}>
                <div className="mc-acc-icon-box"><img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" width={24} /></div>
                <div className="mc-acc-text">
                  <span className="subtitle">{t("app.licenseTitle")}</span>
                  <span className="title">{t("app.microsoftAccount")}</span>
                </div>
                <div className="mc-acc-arrow">{'>'}</div>
              </div>
              <div className={`mc-acc-type-btn ${authType === 'offline' ? 'selected' : ''}`} onClick={() => setAuthType('offline')}>
                <div className="mc-acc-icon-box"><img src="https://minotar.net/helm/Steve/40.png" width={24} style={{ imageRendering: 'pixelated' }} /></div>
                <div className="mc-acc-text">
                  <span className="subtitle">{t("app.offlineTitle")}</span>
                  <span className="title">{t("app.offlineAccount")}</span>
                </div>
                <div className="mc-acc-arrow">{'>'}</div>
              </div>
            </div>

            {/* Inputs depending on selected type */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {authType === 'offline' && (
                <input type="text" className="mc-input" placeholder={t("app.nicknamePlaceholder")} value={newAccountName} onChange={e => setNewAccountName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAccount()} />
              )}
              {authType === 'elyby' && (
                <>
                  <input type="text" className="mc-input" placeholder="E-mail" disabled={authLoading} value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? "text" : "password"} className="mc-input" placeholder={t("app.passwordPlaceholder")} disabled={authLoading} value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAccount()} style={{ width: '100%', paddingRight: '40px' }} />
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
                </>
              )}
              {authError && (
                <div style={{ color: '#e74c3c', fontSize: '13px', marginTop: '5px' }}>{authError}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
                <button className="mod-btn install" style={{ padding: '10px 25px', textTransform: 'uppercase', letterSpacing: '1px' }} onClick={addAccount} disabled={authLoading}>
                  {authLoading ? t("app.loading") : t("app.add")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
 
