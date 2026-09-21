import React, { useState, useEffect, useRef } from 'react'
import { useTranslation, type Language } from './i18n'
import { Trash, Folder } from 'lucide-react'
import ModsMenu from './ModsMenu'
import ModpacksMenu from './ModpacksMenu'
import { ServersMenu } from './ServersMenu'
import { McSelect, RussianFlag, AmericanFlag } from './McSelect'
import pkg from '../package.json'
import WardrobeMenu from './WardrobeMenu'
import PlayIcon from './PlayIcon'
import HammerIcon from './HammerIcon'
import ModpackBoxIcon from './ModpackBoxIcon'
import ServersIcon from './ServersIcon'
import AccountsIcon from './AccountsIcon'
import SettingsIcon from './SettingsIcon'

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

const CubicCrossIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg viewBox="0 0 9 8" width={size} height={size * (8 / 9)} style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', flexShrink: 0 }}>
    <g fill="rgba(0,0,0,0.7)">
      <rect x="1" y="1" width="2" height="1" />
      <rect x="7" y="1" width="2" height="1" />
      <rect x="2" y="2" width="2" height="1" />
      <rect x="6" y="2" width="2" height="1" />
      <rect x="3" y="3" width="4" height="1" />
      <rect x="4" y="4" width="2" height="1" />
      <rect x="3" y="5" width="4" height="1" />
      <rect x="2" y="6" width="2" height="1" />
      <rect x="6" y="6" width="2" height="1" />
      <rect x="1" y="7" width="2" height="1" />
      <rect x="7" y="7" width="2" height="1" />
    </g>
    <g fill={color}>
      <rect x="0" y="0" width="2" height="1" />
      <rect x="6" y="0" width="2" height="1" />
      <rect x="1" y="1" width="2" height="1" />
      <rect x="5" y="1" width="2" height="1" />
      <rect x="2" y="2" width="4" height="1" />
      <rect x="3" y="3" width="2" height="1" />
      <rect x="2" y="4" width="4" height="1" />
      <rect x="1" y="5" width="2" height="1" />
      <rect x="5" y="5" width="2" height="1" />
      <rect x="0" y="6" width="2" height="1" />
      <rect x="6" y="6" width="2" height="1" />
    </g>
  </svg>
)

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
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string, body?: string}>({
    hasUpdate: false,
    version: '',
    downloadUrl: '',
    body: ''
  })
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState('')


  const MinecraftFace = ({ acc, size = 32 }: { acc: Account, size?: number }) => {
    const [useFallback, setUseFallback] = useState(false)

    if ((acc.type !== 'elyby' && acc.type !== 'pgsync') || useFallback) {
      const url = (!useFallback && acc.skinUrl) ? acc.skinUrl : `https://minotar.net/helm/${acc.name}/${size}.png`
      return (
        <img
          src={url}
          width={size}
          height={size}
          style={{ imageRendering: 'pixelated', borderRadius: 0, width: size, height: size }}
          onError={(e) => {
            e.currentTarget.onerror = null
            e.currentTarget.src = `https://minotar.net/helm/Steve/${size}.png`
          }}
          alt="Skin"
        />
      )
    }

    const rawSkinUrl = acc.type === 'pgsync' 
      ? `https://pg-sync-server.onrender.com/api/cosmetics/${acc.name}/skin.png?v=${skinTimestamp}` 
      : `https://skinsystem.ely.by/skins/${acc.name}.png?v=${skinTimestamp}`

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
        <img
          src={rawSkinUrl}
          style={{
            position: 'absolute',
            top: -size,
            left: -size,
            width: size * 8,
            height: size * 8,
            maxWidth: 'none',
            maxHeight: 'none'
          }}
          onError={() => setUseFallback(true)}
          alt="Base"
        />
        <img
          src={rawSkinUrl}
          style={{
            position: 'absolute',
            top: -size,
            left: -(size * 5),
            width: size * 8,
            height: size * 8,
            maxWidth: 'none',
            maxHeight: 'none'
          }}
          onError={() => setUseFallback(true)}
          alt="Hat"
        />
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
  const settingsLoadedRef = useRef(false)
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

  // Custom Modal State for Launcher Confirmations / Alerts
  interface CustomModalState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    isAlert?: boolean;
    isLoading?: boolean;
    onConfirm?: () => Promise<void> | void;
    onCancel?: () => void;
  }

  const [customModal, setCustomModal] = useState<CustomModalState>({
    isOpen: false,
    title: '',
    message: ''
  })

  const handleClearCacheClick = () => {
    setCustomModal({
      isOpen: true,
      title: 'Очистка кэша',
      message: 'Вы действительно хотите очистить кэш лаунчера? Будут удалены временные файлы обновлений, кэш загрузок сборок и сессий.',
      confirmText: 'Очистить кэш',
      cancelText: 'Отмена',
      isDanger: false,
      isAlert: false,
      onConfirm: async () => {
        try {
          // @ts-ignore
          const res = await window.electronAPI?.clearCache?.();
          if (res?.status === 'success') {
            setCustomModal({
              isOpen: true,
              title: 'Кэш очищен',
              message: 'Кэш лаунчера успешно очищен.',
              isAlert: true,
              confirmText: 'Понятно',
              isLoading: false
            });
          } else {
            setCustomModal({
              isOpen: true,
              title: 'Ошибка',
              message: 'Не удалось очистить кэш: ' + (res?.error || 'Неизвестная ошибка'),
              isAlert: true,
              isDanger: true,
              confirmText: 'Закрыть',
              isLoading: false
            });
          }
        } catch (e: any) {
          setCustomModal({
            isOpen: true,
            title: 'Ошибка',
            message: 'Ошибка при очистке кэша: ' + (e?.message || e),
            isAlert: true,
            isDanger: true,
            confirmText: 'Закрыть',
            isLoading: false
          });
        }
      }
    });
  };

  const handleCleanUninstallJavaClick = () => {
    setCustomModal({
      isOpen: true,
      title: 'Удаление Java',
      message: 'Вы действительно хотите полностью удалить все версии Java Runtime? Будут принудительно завершены процессы Java и удалены все локальные среды исполнения Java (8, 17, 21). При необходимости лаунчер автоматически скачает нужную версию при запуске игры.',
      confirmText: 'Удалить Java',
      cancelText: 'Отмена',
      isDanger: true,
      isAlert: false,
      onConfirm: async () => {
        try {
          // @ts-ignore
          await window.electronAPI?.cleanUninstallJava?.();
          await refreshInstalledJavas();
          setCustomJava('auto');
          localStorage.setItem('mc_custom_java', 'auto');
          setCustomModal({
            isOpen: true,
            title: 'Java удалена',
            message: 'Все установленные компоненты Java Runtime были успешно и полностью удалены.',
            isAlert: true,
            confirmText: 'Понятно',
            isLoading: false
          });
        } catch (e: any) {
          setCustomModal({
            isOpen: true,
            title: 'Ошибка',
            message: 'Ошибка при удалении Java: ' + (e?.message || e),
            isAlert: true,
            isDanger: true,
            confirmText: 'Закрыть',
            isLoading: false
          });
        }
      }
    });
  };

  const handleResetSettingsClick = () => {
    setCustomModal({
      isOpen: true,
      title: 'Сброс настроек',
      message: 'Вы действительно хотите сбросить все настройки лаунчера? Будут возвращены исходные параметры лаунчера, сброшена память и очищен список сохранённых аккаунтов.',
      confirmText: 'Сбросить всё',
      cancelText: 'Отмена',
      isDanger: true,
      isAlert: false,
      onConfirm: async () => {
        try {
          // @ts-ignore
          await window.electronAPI?.resetSettings?.();
        } catch {}
        localStorage.clear();
        window.location.reload();
      }
    });
  };

  const handleCheckUpdatesClick = async () => {
    try {
      // @ts-ignore
      const info = await window.electronAPI?.checkUpdates?.()
      if (info && info.hasUpdate) {
        setUpdateInfo(info)
        setShowUpdateModal(true)
      } else {
        setCustomModal({
          isOpen: true,
          title: 'Обновлений нет',
          message: `У вас установлена последняя версия лаунчера (v${pkg.version}).`,
          isAlert: true,
          confirmText: 'Понятно',
          isLoading: false
        })
      }
    } catch {
      setCustomModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Не удалось проверить наличие обновлений.',
        isAlert: true,
        isDanger: true,
        confirmText: 'Закрыть',
        isLoading: false
      })
    }
  };

  useEffect(() => {
    // Intercept native window.alert to show our in-app Minecraft modal window instead of Electron native dialogs
    window.alert = (msg: any) => {
      setCustomModal({
        isOpen: true,
        title: 'Уведомление',
        message: typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg),
        isAlert: true,
        confirmText: 'Понятно',
        isLoading: false
      });
    };

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
      window.electronAPI.checkUpdates().then((info: any) => {
        if (info && info.hasUpdate) {
          setUpdateInfo(info)
          setShowUpdateModal(true)
        }
      }).catch((e: any) => console.warn('Update check failed:', e))
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
      } finally {
        settingsLoadedRef.current = true
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

  // Auto-save settings on change
  useEffect(() => {
    if (!settingsLoadedRef.current) return

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
  }, [
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
  ])

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
      setGameRunning(false)
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
          <img src="./icon.png" alt="icon" width={15} height={15} />
          <span>Pagrysha Launcher</span>
        </div>
        <div className="titlebar-right">
          <div style={{ display: "flex", alignItems: "center", gap: "15px", height: "100%" }}>
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
              <div className="jl-nav-icon">
                <PlayIcon size={24} opacity={view === 'play' ? 1 : 0.75} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarPlay")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'installations' ? 'active' : ''}`} onClick={() => setView('installations')}>
              <div className="jl-nav-icon">
                <HammerIcon size={24} opacity={view === 'installations' ? 1 : 0.75} />
              </div>
              <span className="jl-nav-text">{t("app.installations")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'modpacks' ? 'active' : ''}`} onClick={() => setView('modpacks')}>
              <div className="jl-nav-icon">
                <ModpackBoxIcon size={24} opacity={view === 'modpacks' ? 1 : 0.75} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarModpacks")}</span>
            </div>

            {enableServersTab && (
              <div className={`jl-nav-item ${view === 'servers' ? 'active' : ''}`} onClick={() => setView('servers')}>
                <div className="jl-nav-icon">
                  <ServersIcon size={24} opacity={view === 'servers' ? 1 : 0.75} />
                </div>
                <span className="jl-nav-text">{t("app.sidebarServers")}</span>
              </div>
            )}

            {activeAccount.type === 'pgsync' && (
              <div className={`jl-nav-item ${view === 'wardrobe' ? 'active' : ''}`} onClick={() => setView('wardrobe')}>
                <div className="jl-nav-icon">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{
                    opacity: view === 'wardrobe' ? 1 : 0.75
                  }}>
                    <path d="M20.38 3.46L16 2a8.5 8.5 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
                  </svg>
                </div>
                <span className="jl-nav-text">{t("app.sidebarWardrobe")}</span>
              </div>
            )}
          </div>

          <div className="jl-bottom">
            <div className={`jl-nav-item ${view === 'accounts' ? 'active' : ''}`} onClick={() => { setView('accounts'); setSelectedAuthMethod(null); }}>
              <div className="jl-nav-icon">
                <AccountsIcon size={24} opacity={view === 'accounts' ? 1 : 0.75} />
              </div>
              <span className="jl-nav-text">{t("app.accounts")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
              <div className="jl-nav-icon">
                <SettingsIcon size={24} opacity={view === 'settings' ? 1 : 0.75} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarSettings")}</span>
            </div>

            <div className="jl-bottom-btn outlined" onClick={openFolder}>
              <Folder size={18} /> {t("app.gameFolder")}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="jl-main" style={view === 'play' ? { backgroundImage: mainBgDataUrl ? `url("${mainBgDataUrl}")` : 'url("./faq.png")' } : { backgroundImage: secBgDataUrl ? `url("${secBgDataUrl}")` : 'url("./bg-minecraft.png")' }}>
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
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontFamily: '"Blocks", sans-serif',
                            fontSize: '11px',
                            color: '#888',
                            display: 'inline-block',
                            transform: (showVersionDropdown && !isClosingVersionDropdown) ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                            userSelect: 'none',
                            lineHeight: 1
                          }}
                        >
                          v
                        </span>
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
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (isVanillaInstalled) {
                                      setCustomModal({
                                        isOpen: true,
                                        title: 'Переустановка версии',
                                        message: `Вы уверены, что хотите переустановить ${v}? Все файлы этой версии будут загружены заново.`,
                                        confirmText: 'Переустановить',
                                        cancelText: 'Отмена',
                                        isDanger: false,
                                        onConfirm: async () => {
                                          // @ts-ignore
                                          await window.electronAPI.deleteModpackFolder(v);
                                          setInstalledVersions(installedVersions.filter(iv => iv !== v));
                                          setCustomModal(prev => ({ ...prev, isOpen: false }));
                                        }
                                      });
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
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      if (isForgeInstalled) {
                                        setCustomModal({
                                          isOpen: true,
                                          title: 'Переустановка Forge',
                                          message: `Вы уверены, что хотите переустановить ${forgeLabel}?`,
                                          confirmText: 'Переустановить',
                                          cancelText: 'Отмена',
                                          isDanger: false,
                                          onConfirm: async () => {
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
                                            setCustomModal(prev => ({ ...prev, isOpen: false }));
                                          }
                                        });
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
                        <span
                          style={{
                            fontFamily: '"Blocks", sans-serif',
                            fontSize: '11px',
                            color: '#888',
                            display: 'inline-block',
                            transform: (showVersionDropdown && !isClosingVersionDropdown) ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                            userSelect: 'none',
                            lineHeight: 1
                          }}
                        >
                          v
                        </span>
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
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isVanillaInstalled) {
                                    setCustomModal({
                                      isOpen: true,
                                      title: 'Переустановка версии',
                                      message: `Вы уверены, что хотите переустановить ${v}? Все файлы этой версии будут загружены заново.`,
                                      confirmText: 'Переустановить',
                                      cancelText: 'Отмена',
                                      isDanger: false,
                                      onConfirm: async () => {
                                        // @ts-ignore
                                        await window.electronAPI.deleteModpackFolder(v);
                                        setInstalledVersions(installedVersions.filter(iv => iv !== v));
                                        setCustomModal(prev => ({ ...prev, isOpen: false }));
                                      }
                                    });
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
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isForgeInstalled) {
                                      setCustomModal({
                                        isOpen: true,
                                        title: 'Переустановка Forge',
                                        message: `Вы уверены, что хотите переустановить ${forgeLabel}?`,
                                        confirmText: 'Переустановить',
                                        cancelText: 'Отмена',
                                        isDanger: false,
                                        onConfirm: async () => {
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
                                          setCustomModal(prev => ({ ...prev, isOpen: false }));
                                        }
                                      });
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
                borderBottom: `2px solid rgba(0, 0, 0, ${Math.max(0.4, (menuOpacity / 100) * 0.8)})`,
                boxShadow: '0 1px 0 rgba(255, 255, 255, 0.05)',
                padding: '24px 45px 0 45px',
                userSelect: 'none',
                flexShrink: 0,
                background: `rgba(18, 18, 18, ${Math.max(0.65, menuOpacity / 100)})`,
                backdropFilter: 'blur(6px)',
                zIndex: 10
              }}>
                {[
                  { id: 'customization', label: 'ЛАУНЧЕР' },
                  { id: 'main', label: 'MINECRAFT' },
                  { id: 'experimental', label: 'ЭКСПЕРИМЕНТАЛЬНЫЕ' }
                ].map(tab => {
                  const isActive = settingsTab === tab.id;
                  return (
                    <div
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id as any)}
                      style={{
                        position: 'relative',
                        fontSize: '15px',
                        fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                        color: isActive ? '#ffffff' : '#888888',
                        paddingBottom: '12px',
                        cursor: 'pointer',
                        letterSpacing: '1px',
                        transition: 'color 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        userSelect: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = '#cccccc';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = '#888888';
                      }}
                    >
                      {tab.label}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          left: 0,
                          right: 0,
                          height: '3px',
                          backgroundColor: 'var(--pg-yellow)',
                          boxShadow: isActive ? '0 0 10px rgba(241, 196, 15, 0.65)' : 'none',
                          transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
                          transformOrigin: 'center',
                          opacity: isActive ? 1 : 0,
                          transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease'
                        }}
                      />
                    </div>
                  );
                })}
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
                            { value: 'ru', label: 'Русский - Россия', icon: <RussianFlag /> },
                            { value: 'en', label: 'English - United States', icon: <AmericanFlag /> }
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
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="5" 
                            className="ram-slider" 
                            value={menuOpacity} 
                            onChange={e => setMenuOpacity(Number(e.target.value))} 
                            style={{ 
                              width: '100%',
                              background: `linear-gradient(to right, var(--pg-yellow) 0%, var(--pg-yellow) ${menuOpacity}%, #0e0e0e ${menuOpacity}%, #0e0e0e 100%)`
                            }} 
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white', fontFamily: '"Inter", sans-serif', fontWeight: 500 }}>
                          <input type="number" className="mc-input" value={menuOpacity} onChange={e => setMenuOpacity(Number(e.target.value))} style={{ width: '60px', padding: '5px', textAlign: 'center' }} /> %
                        </div>
                      </div>
                    </div>

                    {/* Section: Фоновые изображения */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {t('app.bgImages')}
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', 
                        gap: '16px', 
                        maxWidth: '650px', 
                        width: '100%' 
                      }}>
                        {/* Main Screen Frame */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          background: `rgba(20, 20, 20, ${Math.max(0.25, (menuOpacity / 100) * 0.95)})`,
                          border: `2px solid rgba(0, 0, 0, ${Math.max(0.4, menuOpacity / 100)})`,
                          boxShadow: `inset 1px 1px 0 rgba(255, 255, 255, ${0.08 * (menuOpacity / 100)}), inset -1px -1px 0 rgba(0, 0, 0, ${0.6 * (menuOpacity / 100)}), 0 4px 14px rgba(0, 0, 0, 0.35)`,
                          borderRadius: '0px',
                          overflow: 'hidden',
                          transition: 'background 0.2s ease, border 0.2s ease'
                        }}>
                          {/* Header Bar */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            background: `rgba(32, 32, 32, ${Math.max(0.3, menuOpacity / 100)})`,
                            borderBottom: `2px solid rgba(0, 0, 0, ${Math.max(0.4, menuOpacity / 100)})`
                          }}>
                            <span style={{
                              fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                              fontSize: '13px',
                              color: '#ffffff',
                              letterSpacing: '0.6px',
                              textShadow: '1px 1px 0 #000'
                            }}>
                              {t('app.mainScreen')}
                            </span>
                            {mainBgDataUrl && (
                              <span style={{
                                fontSize: '10px',
                                fontFamily: '"Inter", sans-serif',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                padding: '2px 8px',
                                borderRadius: '2px',
                                background: 'rgba(46, 204, 113, 0.18)',
                                border: '1px solid rgba(46, 204, 113, 0.45)',
                                color: '#2ecc71'
                              }}>
                                {language === 'ru' ? 'Свой фон' : 'Custom'}
                              </span>
                            )}
                          </div>

                          {/* Body */}
                          <div style={{
                            padding: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px'
                          }}>
                            {/* 16:9 Thumbnail Frame */}
                            <div style={{
                              width: '108px',
                              height: '61px',
                              flexShrink: 0,
                              background: `rgba(10, 10, 10, ${Math.max(0.3, menuOpacity / 100)})`,
                              border: `2px solid rgba(0, 0, 0, ${Math.max(0.5, menuOpacity / 100)})`,
                              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.4)',
                              overflow: 'hidden',
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <img 
                                src={mainBgDataUrl || './faq.png'} 
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = './faq.png'; }}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                                alt="Main Screen Preview" 
                              />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', color: '#8c8c8c', fontFamily: '"Inter", sans-serif', lineHeight: 1.3 }}>
                                1920×1080 • PNG / JPG
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label 
                                  className="mc-btn-primary hover-scale-btn" 
                                  style={{ 
                                    cursor: 'pointer', 
                                    padding: '6px 14px', 
                                    fontSize: '11.5px', 
                                    color: '#000', 
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  {t('app.selectFile')}
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    style={{ display: 'none' }} 
                                    onChange={(e: any) => {
                                      if (e.target.files && e.target.files[0]) {
                                        saveCompressedImage(e.target.files[0], 'mc_main_bg_data', (url) => {
                                          setMainBgDataUrl(url);
                                          window.dispatchEvent(new Event('storage'));
                                        });
                                      }
                                    }} 
                                  />
                                </label>
                                {mainBgDataUrl && (
                                  <button 
                                    type="button" 
                                    className="mc-btn-danger hover-scale-btn" 
                                    style={{ 
                                      padding: '6px 10px', 
                                      fontSize: '11px', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '5px' 
                                    }} 
                                    title={t('app.resetBg')} 
                                    onClick={() => { 
                                      localStorage.removeItem('mc_main_bg_data'); 
                                      setMainBgDataUrl(null); 
                                      window.dispatchEvent(new Event('storage'));
                                    }}
                                  >
                                    <Trash size={12} />
                                    <span>{t('app.reset')}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Secondary Screen Frame */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          background: `rgba(20, 20, 20, ${Math.max(0.25, (menuOpacity / 100) * 0.95)})`,
                          border: `2px solid rgba(0, 0, 0, ${Math.max(0.4, menuOpacity / 100)})`,
                          boxShadow: `inset 1px 1px 0 rgba(255, 255, 255, ${0.08 * (menuOpacity / 100)}), inset -1px -1px 0 rgba(0, 0, 0, ${0.6 * (menuOpacity / 100)}), 0 4px 14px rgba(0, 0, 0, 0.35)`,
                          borderRadius: '0px',
                          overflow: 'hidden',
                          transition: 'background 0.2s ease, border 0.2s ease'
                        }}>
                          {/* Header Bar */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            background: `rgba(32, 32, 32, ${Math.max(0.3, menuOpacity / 100)})`,
                            borderBottom: `2px solid rgba(0, 0, 0, ${Math.max(0.4, menuOpacity / 100)})`
                          }}>
                            <span style={{
                              fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                              fontSize: '13px',
                              color: '#ffffff',
                              letterSpacing: '0.6px',
                              textShadow: '1px 1px 0 #000'
                            }}>
                              {t('app.secondaryScreen')}
                            </span>
                            {secBgDataUrl && (
                              <span style={{
                                fontSize: '10px',
                                fontFamily: '"Inter", sans-serif',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                padding: '2px 8px',
                                borderRadius: '2px',
                                background: 'rgba(46, 204, 113, 0.18)',
                                border: '1px solid rgba(46, 204, 113, 0.45)',
                                color: '#2ecc71'
                              }}>
                                {language === 'ru' ? 'Свой фон' : 'Custom'}
                              </span>
                            )}
                          </div>

                          {/* Body */}
                          <div style={{
                            padding: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px'
                          }}>
                            {/* 16:9 Thumbnail Frame */}
                            <div style={{
                              width: '108px',
                              height: '61px',
                              flexShrink: 0,
                              background: `rgba(10, 10, 10, ${Math.max(0.3, menuOpacity / 100)})`,
                              border: `2px solid rgba(0, 0, 0, ${Math.max(0.5, menuOpacity / 100)})`,
                              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.4)',
                              overflow: 'hidden',
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <img 
                                src={secBgDataUrl || './bg-minecraft.png'} 
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = './bg-minecraft.png'; }}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                                alt="Secondary Screen Preview" 
                              />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', color: '#8c8c8c', fontFamily: '"Inter", sans-serif', lineHeight: 1.3 }}>
                                1920×1080 • PNG / JPG
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label 
                                  className="mc-btn-primary hover-scale-btn" 
                                  style={{ 
                                    cursor: 'pointer', 
                                    padding: '6px 14px', 
                                    fontSize: '11.5px', 
                                    color: '#000', 
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  {t('app.selectFile')}
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    style={{ display: 'none' }} 
                                    onChange={(e: any) => {
                                      if (e.target.files && e.target.files[0]) {
                                        saveCompressedImage(e.target.files[0], 'mc_sec_bg_data', (url) => {
                                          setSecBgDataUrl(url);
                                          window.dispatchEvent(new Event('storage'));
                                        });
                                      }
                                    }} 
                                  />
                                </label>
                                {secBgDataUrl && (
                                  <button 
                                    type="button" 
                                    className="mc-btn-danger hover-scale-btn" 
                                    style={{ 
                                      padding: '6px 10px', 
                                      fontSize: '11px', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '5px' 
                                    }} 
                                    title={t('app.resetBg')} 
                                    onClick={() => { 
                                      localStorage.removeItem('mc_sec_bg_data'); 
                                      setSecBgDataUrl(null); 
                                      window.dispatchEvent(new Event('storage'));
                                    }}
                                  >
                                    <Trash size={12} />
                                    <span>{t('app.reset')}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Кэш и настройки лаунчера */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ fontFamily: '"MinecraftTen", "Blocks", sans-serif', fontSize: '13px', color: '#aaaaaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Кэш и управление данными
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button 
                          type="button"
                          className="mc-btn-primary hover-scale-btn" 
                          style={{ padding: '8px 16px', fontSize: '12px' }} 
                          onClick={handleCheckUpdatesClick}
                        >
                          Проверить обновления
                        </button>

                        <button 
                          type="button"
                          className="mc-btn-primary hover-scale-btn" 
                          style={{ padding: '8px 16px', fontSize: '12px' }} 
                          onClick={handleClearCacheClick}
                        >
                          Очистить кэш лаунчера
                        </button>

                        <button 
                          type="button"
                          className="mc-btn-danger hover-scale-btn"
                          style={{ padding: '8px 16px', fontSize: '12px' }}
                          onClick={handleCleanUninstallJavaClick}
                        >
                          Полное удаление Java
                        </button>

                        <button 
                          type="button"
                          className="mc-btn-danger hover-scale-btn"
                          style={{ padding: '8px 16px', fontSize: '12px' }}
                          onClick={handleResetSettingsClick}
                        >
                          Сбросить настройки лаунчера
                        </button>
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
                          <input 
                            type="range" 
                            min="512" 
                            max={maxRam} 
                            step="512" 
                            className="ram-slider" 
                            value={ramValue} 
                            onChange={e => setRamValue(Number(e.target.value))} 
                            style={{ 
                              width: '100%',
                              background: `linear-gradient(to right, var(--pg-yellow) 0%, var(--pg-yellow) ${Math.max(0, Math.min(100, Math.round(((ramValue - 512) / (maxRam - 512)) * 100)))}%, #0e0e0e ${Math.max(0, Math.min(100, Math.round(((ramValue - 512) / (maxRam - 512)) * 100)))}%, #0e0e0e 100%)`
                            }} 
                          />
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
        <div className="mc-dialog-overlay" onClick={() => setCrashLog(null)}>
          <div className="mc-dialog-window" style={{ width: '800px', maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
            <div className="mc-dialog-header">
              <div className="mc-dialog-title danger">
                <svg viewBox="0 0 16 16" width="18" height="18" style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', flexShrink: 0 }}>
                  <rect x="2" y="2" width="12" height="12" fill="#5a0909"/>
                  <rect x="3" y="3" width="10" height="10" fill="#e74c3c"/>
                  <rect x="7" y="5" width="2" height="4" fill="#ffffff"/>
                  <rect x="7" y="10" width="2" height="2" fill="#ffffff"/>
                </svg>
                <span>ИГРА КРАШНУЛАСЬ!</span>
              </div>
              <button
                onClick={() => setCrashLog(null)}
                className="mc-close-cube-btn"
                title="Закрыть"
              >
                <CubicCrossIcon />
              </button>
            </div>
            
            <div className="mc-dialog-content" style={{ padding: '12px' }}>
              <div style={{ color: '#888', fontSize: '11px', marginBottom: '8px', fontFamily: '"Blocks", sans-serif', textTransform: 'uppercase' }}>
                Лог ошибки запуска Minecraft:
              </div>
              <div style={{ 
                background: '#0a0a0a', 
                color: '#2ecc71', 
                fontFamily: 'monospace', 
                fontSize: '12px', 
                padding: '12px', 
                height: '350px', 
                overflowY: 'auto',
                border: '2px solid #000',
                boxShadow: 'inset 2px 2px 0 0 #000',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                userSelect: 'text'
              }}>
                {crashLog}
              </div>
            </div>
            
            <div className="mc-dialog-footer">
              <button 
                type="button"
                className="mc-cube-btn neutral"
                onClick={() => {
                  navigator.clipboard.writeText(crashLog);
                  setCustomModal({ isOpen: true, title: 'Уведомление', message: 'Лог ошибки скопирован в буфер обмена!', isAlert: true, confirmText: 'Понятно' });
                }}
              >
                Скопировать лог
              </button>
              <button type="button" className="mc-cube-btn gold" onClick={() => setCrashLog(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlayEditModal && (
        <div className="mc-dialog-overlay" onClick={() => setShowPlayEditModal(false)}>
          <div className="mc-dialog-window" onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '92vw' }}>
            <div className="mc-dialog-header">
              <div className="mc-dialog-title warning">
                <span>НАСТРОЙКИ СБОРКИ</span>
              </div>
              <button 
                className="mc-close-cube-btn" 
                title="Закрыть" 
                onClick={() => setShowPlayEditModal(false)}
              >
                <CubicCrossIcon />
              </button>
            </div>

            <div className="mc-dialog-content">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ color: 'var(--pg-yellow)', fontSize: '11px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Название сборки
                  </label>
                  <input type="text" className="mc-input" value={editPlayName} onChange={e => setEditPlayName(e.target.value)} style={{ fontFamily: '"Blocks", sans-serif' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ color: 'var(--pg-yellow)', fontSize: '11px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Иконка
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <label
                      onClick={async (e) => {
                        e.preventDefault();
                        // @ts-ignore
                        const dataUrl = await window.electronAPI.selectIconFile();
                        if (dataUrl) setEditPlayIcon(dataUrl);
                      }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '2px dashed #555', cursor: 'pointer', background: '#181818' }}
                      title="Выбрать свой файл"
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
                          background: editPlayIcon === icon ? 'rgba(241,196,15,0.15)' : 'transparent',
                          objectFit: 'cover'
                        }}
                        onClick={() => setEditPlayIcon(icon)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mc-dialog-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="mc-cube-btn danger"
                onClick={() => {
                  if (confirmPlayDelete) {
                    handleDeletePlayEdit();
                  } else {
                    setConfirmPlayDelete(true);
                  }
                }}
              >
                {confirmPlayDelete ? 'Точно удалить?' : 'Удалить'}
              </button>
              <button type="button" className="mc-cube-btn gold" onClick={handleSavePlayEdit}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Java Manager Modal */}
      {showJavaManagerModal && (
        <div className="mc-dialog-overlay" onClick={() => setShowJavaManagerModal(false)}>
          <div className="mc-dialog-window" onClick={e => e.stopPropagation()} style={{ width: '620px', maxWidth: '94vw', maxHeight: '90vh' }}>
            <div className="mc-dialog-header">
              <div className="mc-dialog-title warning">
                <span>☕ КОМПОНЕНТЫ JAVA RUNTIME</span>
              </div>
              <button 
                className="mc-close-cube-btn" 
                title="Закрыть" 
                onClick={() => setShowJavaManagerModal(false)}
              >
                <CubicCrossIcon />
              </button>
            </div>

            <div className="mc-dialog-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#ccc', lineHeight: '1.5' }}>
                Лаунчер автоматически выбирает нужную версию Java для каждой версии игры. Вы можете установить недостающие версии вручную:
              </p>

              {javaError && (
                <div style={{ padding: '8px 12px', backgroundColor: '#3b0d0d', border: '2px solid #b71c1c', color: '#ffb3b3', fontSize: '12px', marginBottom: '12px' }}>
                  {javaError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                      backgroundColor: '#181818', 
                      border: '2px solid #000',
                      boxShadow: isInst ? 'inset 0 0 0 1px #27ae60' : 'inset 1px 1px 0 #282828',
                      padding: '12px 16px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: '#fff', fontSize: '13.5px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', letterSpacing: '0.5px' }}>{item.title}</strong>
                            <span style={{ fontSize: '10px', background: '#252525', color: 'var(--pg-yellow)', padding: '2px 6px', border: '1px solid #333' }}>{item.badge}</span>
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
                              className="mc-cube-btn gold"
                              style={{ padding: '6px 14px', fontSize: '11px' }}
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
                              background: 'linear-gradient(to right, #d4a90a, #f1c40f)',
                              transition: 'width 0.2s'
                            }}></div>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--pg-yellow)', marginTop: '4px', fontFamily: 'monospace' }}>
                            {javaProgress?.status || 'Загрузка...'}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mc-dialog-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  disabled={!!installingJava || Object.values(installedJavas).every(j => j.installed)}
                  onClick={handleInstallAllRecommended}
                  className="mc-cube-btn gold"
                >
                  Установить все
                </button>
                <button
                  type="button"
                  disabled={!!installingJava}
                  onClick={handleCleanUninstallJavaClick}
                  className="mc-cube-btn danger"
                >
                  Удалить Java
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowJavaManagerModal(false)}
                className="mc-cube-btn neutral"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Action Dialog Modal (Minecraft Authentic GUI Style) */}
      {customModal.isOpen && (
        <div 
          className="mc-dialog-overlay" 
          onClick={() => { if (!customModal.isLoading) setCustomModal(prev => ({ ...prev, isOpen: false })) }}
        >
          <div 
            className="mc-dialog-window" 
            onClick={e => e.stopPropagation()} 
          >
            {/* Header */}
            <div className="mc-dialog-header">
              <div className={`mc-dialog-title ${customModal.isDanger ? 'danger' : 'warning'}`}>
                {customModal.isDanger ? (
                  <svg viewBox="0 0 16 16" width="18" height="18" style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', flexShrink: 0 }}>
                    <rect x="2" y="2" width="12" height="12" fill="#5a0909"/>
                    <rect x="3" y="3" width="10" height="10" fill="#e74c3c"/>
                    <rect x="7" y="5" width="2" height="4" fill="#ffffff"/>
                    <rect x="7" y="10" width="2" height="2" fill="#ffffff"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="18" height="18" style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges', flexShrink: 0 }}>
                    <rect x="2" y="2" width="12" height="12" fill="#3b2800"/>
                    <rect x="3" y="3" width="10" height="10" fill="#f1c40f"/>
                    <rect x="7" y="5" width="2" height="4" fill="#000000"/>
                    <rect x="7" y="10" width="2" height="2" fill="#000000"/>
                  </svg>
                )}
                <span>{customModal.title.toUpperCase()}</span>
              </div>
              {!customModal.isLoading && (
                <button 
                  className="mc-close-cube-btn"
                  title="Закрыть"
                  onClick={() => setCustomModal(prev => ({ ...prev, isOpen: false }))}
                >
                  <CubicCrossIcon />
                </button>
              )}
            </div>

            {/* Inset Content Box */}
            <div className="mc-dialog-content">
              {customModal.message}
            </div>

            {/* Footer Buttons */}
            <div className="mc-dialog-footer">
              {!customModal.isAlert && (
                <button
                  type="button"
                  disabled={customModal.isLoading}
                  onClick={() => {
                    if (customModal.onCancel) customModal.onCancel();
                    setCustomModal(prev => ({ ...prev, isOpen: false }));
                  }}
                  className="mc-cube-btn neutral"
                >
                  {customModal.cancelText || 'Отмена'}
                </button>
              )}

              <button
                type="button"
                disabled={customModal.isLoading}
                onClick={async () => {
                  if (customModal.onConfirm) {
                    setCustomModal(prev => ({ ...prev, isLoading: true }));
                    try {
                      await customModal.onConfirm();
                    } finally {
                      setCustomModal(prev => ({ ...prev, isLoading: false }));
                    }
                  } else {
                    setCustomModal(prev => ({ ...prev, isOpen: false }));
                  }
                }}
                className={`mc-cube-btn ${customModal.isDanger ? 'danger' : 'gold'}`}
              >
                {customModal.isLoading ? 'Выполнение...' : (customModal.confirmText || (customModal.isAlert ? 'Понятно' : 'Подтвердить'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minecraft Launcher Update Modal */}
      {showUpdateModal && updateInfo.hasUpdate && (
        <div 
          className="mc-update-overlay"
          onClick={() => {
            if (!isUpdating) setShowUpdateModal(false)
          }}
        >
          <div 
            className="mc-update-window"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mc-update-header">
              <div className="mc-update-title">
                ОБНОВЛЕНИЕ ЛАУНЧЕРА
              </div>
              <button 
                type="button" 
                className="mc-close-cube-btn"
                disabled={isUpdating}
                onClick={() => setShowUpdateModal(false)}
                title="Закрыть"
              >
                <CubicCrossIcon />
              </button>
            </div>

            {/* Content */}
            <div className="mc-update-content">
              <div className="mc-update-version">
                Доступна версия <span className="mc-update-version-num">v{updateInfo.version || pkg.version}</span>.
              </div>

              <div className="mc-update-section-title">
                ИСПРАВЛЕНО
              </div>

              <div className="mc-update-changelog">
                {updateInfo.body ? (
                  updateInfo.body
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('#'))
                    .map(line => line.replace(/^[-*]\s*/, ''))
                    .slice(0, 8)
                    .join('\n') || 'Загрузка некоторых сборок и запуск установок с fabric.'
                ) : (
                  'Загрузка некоторых сборок и запуск установок с fabric.'
                )}
              </div>

              {isUpdating && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ 
                    height: '14px', 
                    background: '#0a0a0a', 
                    border: '2px solid #000', 
                    boxShadow: 'inset 1px 1px 0 #222',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(to right, #d4a90a, #f1c40f)',
                      width: `${activeDownloads.find(d => d.id === 'app_update')?.progress || 0}%`,
                      transition: 'width 0.2s'
                    }} />
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--pg-yellow)', marginTop: '6px', fontFamily: 'monospace' }}>
                    {activeDownloads.find(d => d.id === 'app_update')?.text || 'Загрузка обновления...'}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="mc-update-footer">
              <button 
                type="button" 
                disabled={isUpdating}
                onClick={handleUpdate}
                className="mc-cube-btn gold"
              >
                {isUpdating ? 'Загрузка...' : 'Обновить'}
              </button>

              <button 
                type="button" 
                disabled={isUpdating}
                onClick={() => setShowUpdateModal(false)}
                className="mc-cube-btn neutral"
              >
                Позже
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
 
