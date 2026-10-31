import React, { useState, useEffect, useRef } from 'react'
import {
  useTranslation,
  translate,
  type Language } from './i18n'
import { Trash,
  Blocks,
  FlaskConical,
  SlidersHorizontal,
  ChevronRight,
  Palette,
} from 'lucide-react'
import ModsMenu from './ModsMenu'
import ModpacksMenu from './ModpacksMenu'
import { ServersMenu } from './ServersMenu'
import { McSelect, RussianFlag, AmericanFlag } from './McSelect'
import { ProjectArt } from './ProjectArt'
import { formatCount, projectLoaderLabel } from './projectMeta'
import pkg from '../package.json'
import PlayIcon from './PlayIcon'
import HammerIcon from './HammerIcon'
import ModpackBoxIcon from './ModpackBoxIcon'
import ServersIcon from './ServersIcon'
import AccountsIcon from './AccountsIcon'
import SettingsIcon from './SettingsIcon'
import LauncherLoadingScreen from './LauncherLoadingScreen'
import LaunchStatusBar from './LaunchStatusBar'
import MinecraftFace from './MinecraftFace'
import IconImg from './IconImg'
import { Pumpkin, useHalloween } from './Halloween'
import CustomizationTab from './CustomizationTab'
import PlayButton from './PlayButton'
import { showError, showOk, errorText } from './Toasts'
import { applyTheme, DEFAULT_THEME, presetTheme, sanitizeTheme, withMode, type ThemeConfig } from './theme'
import { Folder, Download } from './PixelIcons'

interface Modpack {
  name: string
  loader: string
  version: string
  installedMods: { id: string; title: string; type?: string }[]
  icon?: string
  // Пусто — лаунчер берёт самую свежую версию загрузчика.
  loaderVersion?: string
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
      showError(translate('app.imageTooBig'));
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

const renderSelectedVersionIcon = (selectedVersion: string, modpacks: any[], size = 46, isSnapshot = false) => {
  if (!selectedVersion) return <img src="./iconsblocks/Grass_Block_(inventory)_MCE.png" width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="icon" />;
  const lower = selectedVersion.toLowerCase();
  if (lower.startsWith('mp:')) {
    const mpName = selectedVersion.replace('mp:', '');
    const mp = modpacks.find(m => m.name === mpName);
    if (mp) {
      if (mp.icon) {
        return <IconImg src={mp.icon} size={size} style={{ objectFit: 'cover' }} />;
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
      return (
        <IconImg
          src={mp.icon}
          size={size}
          fallback="./iconsblocks/Grass_Block_(inventory)_MCE.png"
          style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
        />
      );
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
  return <img src={isSnapshot ? "./iconsblocks/MCE_Dirt_(inventory).png" : "./iconsblocks/Grass_Block_(inventory)_MCE.png"} width={size} height={size} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} alt="icon" />;
};

/* «и ещё 2 аккаунта» — плашка в списке аккаунтов боковой панели. */
const moreAccountsLabel = (n: number, english: boolean) => {
  if (english) return `and ${n} more account${n === 1 ? '' : 's'}`
  const ten = n % 10
  const hundred = n % 100
  if (ten === 1 && hundred !== 11) return `и ещё ${n} аккаунт`
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `и ещё ${n} аккаунта`
  return `и ещё ${n} аккаунтов`
}

export default function App() {
  const { t, language, setLanguage } = useTranslation();
  const { on: halloweenOn } = useHalloween();
  const [view, setView] = useState<'play' | 'installations' | 'modpacks' | 'settings' | 'servers' | 'accounts'>('play')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showVersionDropdown, setShowVersionDropdown] = useState(false)
  const [isClosingVersionDropdown, setIsClosingVersionDropdown] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')

  const [settingsTab, setSettingsTab] = useState<'appearance' | 'customization' | 'main' | 'experimental'>('appearance')

  // Оформление. Читаем из localStorage сразу, чтобы не было вспышки
  // стандартных цветов перед загрузкой настроек с диска.
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    try {
      const stored = localStorage.getItem('mc_theme')
      return stored ? sanitizeTheme(JSON.parse(stored)) : DEFAULT_THEME
    } catch {
      return DEFAULT_THEME
    }
  })
  // Один фон на лаунчер: тёмный, обои лобби или своё изображение.
  const [bgMode, setBgMode] = useState<'dark' | 'wallpaper' | 'custom'>(() => {
    const stored = localStorage.getItem('mc_bg_mode')
    if (stored === 'dark' || stored === 'wallpaper' || stored === 'custom') return stored
    // Миграция со старой пары «главный / вторичный фон»
    return localStorage.getItem('mc_main_bg_data') ? 'custom' : 'dark'
  })
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('mc_main_bg_data'))
  const [bgDim, setBgDim] = useState(() => {
    const raw = localStorage.getItem('mc_bg_dim')
    const parsed = raw === null ? NaN : Number(raw)
    return Number.isFinite(parsed) ? Math.min(90, Math.max(0, parsed)) : 55
  })
  const [bgBlur, setBgBlur] = useState(() => {
    const raw = localStorage.getItem('mc_bg_blur')
    const parsed = raw === null ? NaN : Number(raw)
    return Number.isFinite(parsed) ? Math.min(20, Math.max(0, parsed)) : 6
  })


  // Ping the server to wake it up on launcher start
  useEffect(() => {
    // Старые настройки фона и прозрачности больше не используются
    localStorage.removeItem('mc_sec_bg_data');
    localStorage.removeItem('mc_menu_opacity');
  }, []);

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
      let stateStr = translate('app.presenceMainMenu')
      if (view === 'installations') stateStr = translate('app.presenceInstallations')
      if (view === 'modpacks') stateStr = translate('app.presenceModpacks')
      if (view === 'settings') stateStr = translate('app.presenceSettings')
      if (view === 'accounts') stateStr = translate('app.presenceAccounts')
      
      // @ts-ignore
      window.electronAPI.updateDiscordPresence({
        details: translate('app.presenceInLauncher'),
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
  const [authType, setAuthType] = useState<'offline' | 'elyby' | 'microsoft'>('offline')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<'offline' | 'elyby' | null>(null)

  const [rawVersions, setRawVersions] = useState<any[]>([])
  const [versions, setVersions] = useState<string[]>([])
  // Сообщение о проблемах загрузки списка версий (нет сети, бэкенд недоступен)
  const [versionsError, setVersionsError] = useState('')
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
  // Страховка на случай, если окно игры так и не отзовётся: полоса прогресса
  // не должна висеть вечно.
  const launchReadyTimerRef = useRef<any>(null)
  // Окно уже подтвердило запуск: таймер-страховка больше не нужен.
  const launchReadyRef = useRef(false)
  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string, body?: string}>({
    hasUpdate: false,
    version: '',
    downloadUrl: '',
    body: ''
  })
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState('')


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
  // Игра во весь экран и лаунчер в панель задач при запуске. Значения по
  // умолчанию — «включено»; выключается в настройках, вкладка Minecraft.
  const [launchFullscreen, setLaunchFullscreen] = useState(localStorage.getItem('mc_launch_fullscreen') !== 'false')
  const [launchMinimize, setLaunchMinimize] = useState(localStorage.getItem('mc_launch_minimize') !== 'false')
  // Профиль настроек игрока. Пустое значение = «не трогать» эту опцию в игре;
  // диктора по умолчанию выключаем — это самое частое «опять он включился».
  const [playerLang, setPlayerLang] = useState(localStorage.getItem('mc_player_lang') || '')
  const [playerGuiScale, setPlayerGuiScale] = useState(localStorage.getItem('mc_player_guiscale') || '')
  const [playerNarrator, setPlayerNarrator] = useState(localStorage.getItem('mc_player_narrator') ?? '0')
  const [applyPlayerOptions, setApplyPlayerOptions] = useState(localStorage.getItem('mc_apply_player_options') !== 'false')

  // Интерфейс всегда непрозрачный: полупрозрачные панели ломали читаемость.
  const [menuOpacity] = useState(100)
  const [enableServersTab, setEnableServersTab] = useState(localStorage.getItem('mc_enable_servers_tab') === 'true')
  const [enableTabAnimations, setEnableTabAnimations] = useState(localStorage.getItem('mc_enable_tab_animations') !== 'false')
  const [enableNewDesign] = useState(localStorage.getItem('mc_new_design') === 'true')
  const [autoOpenInstallSettings, setAutoOpenInstallSettings] = useState(false)
  const settingsLoadedRef = useRef(false)
  // Имя сборки, которую только что переименовали. Нужно, чтобы фоновое
  // перечитывание modpacks.json не приняло смену имени за удаление сборки
  // и не сбросило выбор на первую версию.
  const pendingRenameRef = useRef<string | null>(null)
  const [autoOpenInstallCreate, setAutoOpenInstallCreate] = useState(false)
  const [showPlayEditModal, setShowPlayEditModal] = useState(false)
  const [editPlayName, setEditPlayName] = useState('')
  const [editPlayIcon, setEditPlayIcon] = useState('')
  const [confirmPlayDelete, setConfirmPlayDelete] = useState(false)
  // Лента рекомендаций на главной: популярные сборки Modrinth.
  const [lobbyRecs, setLobbyRecs] = useState<any[]>([])
  const [lobbyRecsLoading, setLobbyRecsLoading] = useState(true)
  // How many cards fit into one row at the current window width: exactly
  // that many are rendered, so no extra nodes stay behind a scrollbar.
  const [recsVisible, setRecsVisible] = useState(0)
  const lobbyRecsRowRef = useRef<HTMLDivElement | null>(null)
  const recsVisibleRef = useRef(0)
  // Поисковый запрос, с которым открывается каталог сборок из рекомендаций.
  const [modpacksInitialQuery, setModpacksInitialQuery] = useState('')

  const recsHoveredRef = useRef(false)
  const recsAutoTimerRef = useRef<any>(null)

  // Ширина карточки и промежуток совпадают с CSS ленты (.lobby-rec = 194px,
  // gap = 12px): сколько таких карточек влезает в ряд, столько и показываем.
  const RECS_CARD_MIN = 194
  const RECS_GAP = 12

  // The row turns by itself every 15-20 s: nothing is scrolled, the shown
  // page is moved to the end of the pool instead. Hovering the row pauses
  // the rotation so it does not get in the way of picking a pack.
  const rotateLobbyRecs = () => {
    if (recsHoveredRef.current) return
    const step = recsVisibleRef.current
    setLobbyRecs(prev => {
      if (!step || prev.length <= step) return prev // весь пул влезает — крутить нечего
      return [...prev.slice(step), ...prev.slice(0, step)]
    })
  }

  const visibleCount = recsVisible || 6
  const visibleRecs = lobbyRecs.slice(0, visibleCount)
  // Always reserve the full set of columns: fewer cards than columns
  // only leaves free space on the right instead of inflating the cards.
  const recsColumns = visibleCount

  // The card count depends on the row width only. It is measured through a
  // ref callback instead of a [] effect: the row is unmounted every time
  // another screen opens, so an effect would stay attached to a dead node
  // and the stale count of a hidden row (one card across the whole screen)
  // would be kept when the lobby appears again.
  const measureLobbyRecs = () => {
    const el = lobbyRecsRowRef.current
    // A hidden or not yet laid out row reports 0 width: keeping the previous
    // count is the only sane answer there.
    if (!el || el.clientWidth <= 0) return
    const next = Math.max(1, Math.floor((el.clientWidth + RECS_GAP) / (RECS_CARD_MIN + RECS_GAP)))
    recsVisibleRef.current = next
    setRecsVisible(prev => (prev === next ? prev : next))
  }

  const recsObserverRef = useRef<ResizeObserver | null>(null)

  const attachLobbyRecsRow = (el: HTMLDivElement | null) => {
    if (lobbyRecsRowRef.current === el) return
    lobbyRecsRowRef.current = el
    if (recsObserverRef.current) {
      recsObserverRef.current.disconnect()
      recsObserverRef.current = null
    }
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measureLobbyRecs())
    observer.observe(el)
    recsObserverRef.current = observer
    measureLobbyRecs()
  }

  // Safety net: works even without ResizeObserver and reacts to any window
  // resize, not only to the box of the row itself.
  useEffect(() => {
    measureLobbyRecs()
    window.addEventListener('resize', measureLobbyRecs)
    return () => window.removeEventListener('resize', measureLobbyRecs)
  }, [])

  useEffect(() => {
    if (lobbyRecsLoading || lobbyRecs.length === 0) return
    // Системная настройка «уменьшить движение» — автопрокрутку не включаем.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    const schedule = () => {
      // 15–20 с: интервал каждый раз чуть разный, чтобы лента не ходила
      // как метроном.
      const delay = 15000 + Math.random() * 5000
      recsAutoTimerRef.current = setTimeout(() => {
        if (cancelled) return
        rotateLobbyRecs()
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      if (recsAutoTimerRef.current) clearTimeout(recsAutoTimerRef.current)
      recsAutoTimerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyRecsLoading, lobbyRecs.length])


  useEffect(() => {
    let cancelled = false
    const loadRecommendations = async () => {
      try {
        // Загружаем пул из топа популярных сборок (3 страницы по 20 = топ 60),
        // затем перемешиваем по алгоритму Фишера — Йетса.
        // Так в рекомендациях остаются только качественные популярные сборки,
        // но каждый запуск лаунчера их порядок и состав уникальны (не как в Modrinth).
        const [p1, p2, p3] = await Promise.all([
          // @ts-ignore
          window.electronAPI.getPopularModpacks('all', 0, 'all', 'all', 'downloads').catch(() => null),
          // @ts-ignore
          window.electronAPI.getPopularModpacks('all', 20, 'all', 'all', 'downloads').catch(() => null),
          // @ts-ignore
          window.electronAPI.getPopularModpacks('all', 40, 'all', 'all', 'downloads').catch(() => null)
        ])

        const combined: any[] = [
          ...(Array.isArray(p1?.hits) ? p1.hits : []),
          ...(Array.isArray(p2?.hits) ? p2.hits : []),
          ...(Array.isArray(p3?.hits) ? p3.hits : [])
        ]

        // Убираем дубликаты
        const seen = new Set<string>()
        const unique = combined.filter(item => {
          const id = item?.project_id || item?.slug || item?.title
          if (!id || seen.has(id)) return false
          seen.add(id)
          return true
        })

        // Перемешиваем (Fisher-Yates)
        for (let i = unique.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [unique[i], unique[j]] = [unique[j], unique[i]]
        }

        if (!cancelled) {
          setLobbyRecs(unique)
        }
      } catch (e) {
        // Без сети лента просто останется пустой — лобби не должно ломаться.
        console.error('Failed to load lobby recommendations:', e)
      } finally {
        if (!cancelled) setLobbyRecsLoading(false)
      }
    }
    loadRecommendations()
    return () => { cancelled = true }
  }, [])

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

  const handleInstallJava = async (version: '8' | '17' | '21' | '25') => {
    if (installingJava) return
    setInstallingJava(version)
    setJavaError('')
    setJavaProgress({ version, status: t('app.javaInstalling', { version }), progress: 5 })
    try {
      // @ts-ignore
      await window.electronAPI.installJava(version)
      await refreshInstalledJavas()
      setJavaProgress(null)
    } catch (err: any) {
      setJavaError(err.message || t('app.javaInstallError'))
    } finally {
      setInstallingJava(null)
    }
  }

  const handleInstallAllRecommended = async () => {
    if (installingJava) return
    const toInstall: ('8' | '17' | '21' | '25')[] = []
    if (!installedJavas['8']?.installed) toInstall.push('8')
    if (!installedJavas['17']?.installed) toInstall.push('17')
    if (!installedJavas['21']?.installed) toInstall.push('21')
    if (!installedJavas['25']?.installed) toInstall.push('25')

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
      title: t('app.cacheClearTitle'),
      message: t('app.cacheClearMsg'),
      confirmText: t('app.cacheClearBtn'),
      cancelText: t('ui.cancel'),
      isDanger: false,
      isAlert: false,
      onConfirm: async () => {
        try {
          // @ts-ignore
          const res = await window.electronAPI?.clearCache?.();
          if (res?.status === 'ok' || res?.status === 'success') {
            setCustomModal({
              isOpen: true,
              title: t('app.cacheClearedTitle'),
              message: t('app.cacheClearedMsg'),
              isAlert: true,
              confirmText: t('app.gotIt'),
              isLoading: false
            });
          } else {
            const reason = res?.status === 'error'
              ? (res?.error || t('app.unknownError'))
              : (res?.error || t('app.cacheUnknownResponse'))
            setCustomModal({
              isOpen: true,
              title: t('app.error'),
              message: t('app.cacheFailedMsg', { reason }),
              isAlert: true,
              isDanger: true,
              confirmText: t('ui.close'),
              isLoading: false
            });
          }
        } catch (e: any) {
          setCustomModal({
            isOpen: true,
            title: t('app.error'),
            message: t('app.cacheErrorMsg', { error: errorText(e, t('app.unknownError')) }),
            isAlert: true,
            isDanger: true,
            confirmText: t('ui.close'),
            isLoading: false
          });
        }
      }
    });
  };

  const handleCleanUninstallJavaClick = () => {
    setCustomModal({
      isOpen: true,
      title: t('app.javaRemoveTitle'),
      message: t('app.javaRemoveMsg'),
      confirmText: t('app.javaRemoveBtn'),
      cancelText: t('ui.cancel'),
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
            title: t('app.javaRemovedTitle'),
            message: t('app.javaRemovedMsg'),
            isAlert: true,
            confirmText: t('app.gotIt'),
            isLoading: false
          });
        } catch (e: any) {
          setCustomModal({
            isOpen: true,
            title: t('app.error'),
            message: t('app.javaRemoveError', { error: errorText(e, t('app.unknownError')) }),
            isAlert: true,
            isDanger: true,
            confirmText: t('ui.close'),
            isLoading: false
          });
        }
      }
    });
  };

  const handleResetSettingsClick = () => {
    setCustomModal({
      isOpen: true,
      title: t('app.resetTitle'),
      message: t('app.resetMsg'),
      confirmText: t('app.resetBtn'),
      cancelText: t('ui.cancel'),
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
          title: t('app.noUpdatesTitle'),
          message: t('app.upToDateMsg', { p1: pkg.version }),
          isAlert: true,
          confirmText: t('app.gotIt'),
          isLoading: false
        })
      }
    } catch {
      setCustomModal({
        isOpen: true,
        title: t('app.error'),
        message: t('app.updateCheckFailed'),
        isAlert: true,
        isDanger: true,
        confirmText: t('ui.close'),
        isLoading: false
      })
    }
  };

  useEffect(() => {
    // Перехват window.alert больше не нужен: места, где он использовался,
    // переехали на тосты (см. Toasts.tsx). Присваивание к window.alert к тому
    // же падает в браузерах, где это свойство недоступно для записи.
    refreshInstalledJavas()
    // Подписку на прогресс Java сохраняем и снимаем при размонтировании
    let unsubJavaProgress: (() => void) | null = null
    let disposed = false
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onJavaInstallProgress) {
      // @ts-ignore
      Promise.resolve(window.electronAPI.onJavaInstallProgress((data: any) => {
        setJavaProgress(data)
      }))
        .then((unlisten: any) => {
          if (disposed) {
            if (typeof unlisten === 'function') unlisten()
          } else {
            unsubJavaProgress = typeof unlisten === 'function' ? unlisten : null
          }
        })
        .catch(() => { })
    }

    return () => {
      disposed = true
      if (unsubJavaProgress) unsubJavaProgress()
      unsubJavaProgress = null
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

    // Текст ошибки не должен исчезать раньше, чем его успеют прочитать
    const isError = progress.startsWith('Error:');
    if (isCompleted) {
      const timer = setTimeout(() => {
        setProgress('');
      }, isError ? 8000 : 3500);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  useEffect(() => {
    // Обёртки listen возвращают Promise<unlisten>: сохраняем функции отписки и
    // вызываем их в cleanup, иначе обработчики копятся при каждом монтировании.
    let unsubs: Array<() => void> = []
    let disposed = false
    const subscribe = (register: Promise<() => void> | undefined) => {
      if (!register) return
      Promise.resolve(register)
        .then((unlisten: any) => {
          if (typeof unlisten !== 'function') return
          if (disposed) unlisten()
          else unsubs.push(unlisten)
        })
        .catch(() => { })
    }

    // @ts-ignore
    subscribe(window.electronAPI.onLaunchProgress((msg: string) => {
      setProgress(msg)
    }))

    // Процесс Java стартует мгновенно, а окно у сборок с модами появляется
    // через 5–20 секунд. Запуск считаем завершённым только когда бэкенд
    // увидел в логе игры созданное окно — иначе полоса исчезала сразу после
    // клика, и ожидание выглядело как «ничего не происходит».
    // @ts-ignore
    subscribe(window.electronAPI.onGameReady(() => {
      launchReadyRef.current = true
      if (launchReadyTimerRef.current) {
        clearTimeout(launchReadyTimerRef.current)
        launchReadyTimerRef.current = null
      }
      setLaunching(false)
      setProgress(t('app.progressGameStarted'))
    }))

    // @ts-ignore
    subscribe(window.electronAPI.onDownloadUpdate((data: any) => {
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
    }))

    // @ts-ignore
    subscribe(window.electronAPI.onDownloadFinish((id: string) => {
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
    }))

    // @ts-ignore
    subscribe(window.electronAPI.onGameClosed(() => {
      setGameRunning(false)
      // Игра закрылась раньше, чем появилось окно, — ждать больше нечего.
      if (launchReadyTimerRef.current) {
        clearTimeout(launchReadyTimerRef.current)
        launchReadyTimerRef.current = null
      }
      setLaunching(false)
      // Подпись «Игра запускается...» не должна пережить сам процесс.
      setProgress('')

      // @ts-ignore
      if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
        // @ts-ignore
        window.electronAPI.updateDiscordPresence({
          details: translate('app.presenceInLauncher'),
          state: translate('app.presenceMainMenu'),
          largeImageKey: "logo",
          largeImageText: "Pagrysha Launcher"
        })
      }
    }))

    // @ts-ignore
    subscribe(window.electronAPI.onGameCrashed((log: string) => {
      // Игра упала — процесс уже мёртв, но без сброса кнопка навсегда осталась
      // бы в состоянии «В ИГРЕ», и повторный запуск был бы недоступен.
      setGameRunning(false)
      if (launchReadyTimerRef.current) {
        clearTimeout(launchReadyTimerRef.current)
        launchReadyTimerRef.current = null
      }
      setLaunching(false)
      setCrashLog(log)
    }))

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
        const releases = Array.isArray(v?.releases) ? v.releases : []
        const installed = Array.isArray(v?.installed) ? v.installed : []
        // Бэкенд может работать без сети: releases пуст, но установленные версии есть.
        // В этом случае строим список из installed, чтобы их можно было запускать.
        if (releases.length === 0 && installed.length > 0) {
          setRawVersions(installed.map((id: string) => ({ id, type: 'release' })))
          setVersionsError(v?.offline
            ? t('app.versionsOfflineOnlyInstalled')
            : t('app.versionsEmptyList'))
        } else {
          setRawVersions(releases)
          setVersionsError(v?.offline ? t('app.versionsOfflinePartial') : '')
        }
        setInstalledVersions(installed)
      } catch (e: any) {
        console.error(e)
        setVersionsError(t('app.versionsLoadFailed'))
      }
    }
    fetchVersions()

    // @ts-ignore
    window.electronAPI.getSystemInfo().then((info: any) => {
      // Бэкенд может отдавать объём ОЗУ в одном из двух полей
      const total = info?.totalMemoryMB ?? info?.totalRam
      if (typeof total === 'number' && total > 0) {
        setMaxRam(total)
        if (!localStorage.getItem('mc_ram')) {
          // Без сохранённого значения выделяем половину ОЗУ, но не меньше 1024 МБ
          setRamValue(Math.max(1024, Math.floor(total / 2)))
        }
      }
    }).catch(() => { })

    const loadAccounts = async () => {
      try {
        // @ts-ignore
        const raw = await window.electronAPI.getAccounts()
        // Аккаунты PG-Sync больше не поддерживаются: в старом accounts.json они
        // лежат с type 'pgsync'. Переводим их в офлайн, иначе такой аккаунт
        // не находит ни одну ветку авторизации и остаётся без скина.
        const savedAccounts = (Array.isArray(raw) ? raw : []).map((a: any) =>
          a?.type === 'pgsync' ? { ...a, type: 'offline' } : a
        )
        if (savedAccounts.length > 0) {
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
          if (disk.launchFullscreen !== undefined) {
            setLaunchFullscreen(Boolean(disk.launchFullscreen))
            localStorage.setItem('mc_launch_fullscreen', String(Boolean(disk.launchFullscreen)))
          }
          if (disk.launchMinimizeLauncher !== undefined) {
            setLaunchMinimize(Boolean(disk.launchMinimizeLauncher))
            localStorage.setItem('mc_launch_minimize', String(Boolean(disk.launchMinimizeLauncher)))
          }
          // Профиль настроек игрока лежит одним объектом: так его удобнее
          // переносить между машинами вместе с остальными настройками.
          if (disk.applyPlayerOptions !== undefined) {
            setApplyPlayerOptions(Boolean(disk.applyPlayerOptions))
            localStorage.setItem('mc_apply_player_options', String(Boolean(disk.applyPlayerOptions)))
          }
          const savedPlayerOptions = disk.playerOptions || {}
          const playerFields: Array<[string, (v: string) => void, string]> = [
            ['lang', setPlayerLang, 'mc_player_lang'],
            ['guiScale', setPlayerGuiScale, 'mc_player_guiscale'],
            ['narrator', setPlayerNarrator, 'mc_player_narrator'],
          ]
          playerFields.forEach(([key, setter, storageKey]) => {
            const raw = savedPlayerOptions[key]
            if (raw === undefined) return
            const value = String(raw)
            setter(value)
            localStorage.setItem(storageKey, value)
          })
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
          if (disk.theme) {
            setTheme(sanitizeTheme(disk.theme))
          }
          if (disk.bgMode === 'dark' || disk.bgMode === 'wallpaper' || disk.bgMode === 'custom') {
            setBgMode(disk.bgMode)
            localStorage.setItem('mc_bg_mode', disk.bgMode)
          }
          if (disk.bgDim !== undefined) {
            const parsed = Number(disk.bgDim)
            if (Number.isFinite(parsed)) {
              const safe = Math.min(90, Math.max(0, parsed))
              setBgDim(safe)
              localStorage.setItem('mc_bg_dim', String(safe))
            }
          }
          if (disk.bgBlur !== undefined) {
            const parsed = Number(disk.bgBlur)
            if (Number.isFinite(parsed)) {
              const safe = Math.min(20, Math.max(0, parsed))
              setBgBlur(safe)
              localStorage.setItem('mc_bg_blur', String(safe))
            }
          }
        }
      } catch (e) {
        console.error('Failed to load disk settings:', e)
      } finally {
        settingsLoadedRef.current = true
      }
    }
    loadSettings()

    return () => {
      disposed = true
      unsubs.forEach(u => { try { u() } catch { } })
      unsubs = []
    }
  }, [])

  // Тема — это CSS-слой, который пересобирается на каждое изменение:
  // предпросмотр в настройках и есть сам лаунчер.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

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
              // Сначала проверяем, не переименована ли выбранная сборка:
              // иначе «исчезновение» старого имени сбросило бы выбор.
              const pending = pendingRenameRef.current
              if (pending && saved.some((m: any) => `mp:${m.name}` === pending)) {
                pendingRenameRef.current = null
                handleSelectVersion(pending)
              } else if (versions.length > 0) {
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
    const handleUpdated = () => { fetchModpacks() }
    // Переименование сборки: правим локальный список и выбранную версию без перезагрузки
    const handleRenamed = (event: Event) => {
      const detail = (event as CustomEvent<{ oldName?: string; newName?: string }>).detail
      if (!detail?.oldName || !detail?.newName) return
      const { oldName, newName } = detail
      pendingRenameRef.current = `mp:${newName}`
      setModpacks(prev => prev.map(m => (m.name === oldName ? { ...m, name: newName } : m)))
      if (selectedVersion === `mp:${oldName}`) {
        handleSelectVersion(`mp:${newName}`)
      }
    }
    window.addEventListener('modpacks-updated', handleUpdated)
    window.addEventListener('modpack-renamed', handleRenamed)
    return () => {
      window.removeEventListener('modpacks-updated', handleUpdated)
      window.removeEventListener('modpack-renamed', handleRenamed)
    }
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
    localStorage.setItem('mc_launch_fullscreen', String(launchFullscreen))
    localStorage.setItem('mc_launch_minimize', String(launchMinimize))
    localStorage.setItem('mc_player_lang', playerLang)
    localStorage.setItem('mc_player_guiscale', playerGuiScale)
    localStorage.setItem('mc_player_narrator', playerNarrator)
    localStorage.setItem('mc_apply_player_options', String(applyPlayerOptions))
    localStorage.setItem('mc_show_snapshots', showSnapshots.toString())
    localStorage.setItem('mc_show_modified', showModified.toString())
    localStorage.setItem('mc_show_old_releases', showOldReleases.toString())
    localStorage.setItem('mc_show_beta', showBeta.toString())
    localStorage.setItem('mc_show_alpha', showAlpha.toString())
    localStorage.setItem('mc_args', mcArgs)
    localStorage.setItem('mc_custom_java', customJava)
    localStorage.setItem('mc_bg_mode', bgMode)
    localStorage.setItem('mc_bg_dim', bgDim.toString())
    localStorage.setItem('mc_bg_blur', bgBlur.toString())
    localStorage.setItem('mc_enable_servers_tab', enableServersTab.toString())
    localStorage.setItem('mc_enable_tab_animations', enableTabAnimations.toString())
    localStorage.setItem('mc_new_design', enableNewDesign.toString())
    localStorage.setItem('mc_theme', JSON.stringify(theme))

    // Also persist to disk settings.json
    // @ts-ignore
    window.electronAPI?.saveSettings?.({
      ramValue,
      launchFullscreen,
      launchMinimizeLauncher: launchMinimize,
      applyPlayerOptions,
      playerOptions: {
        lang: playerLang,
        guiScale: playerGuiScale,
        narrator: playerNarrator,
      },
      showSnapshots,
      showModified,
      showOldReleases,
      showBeta,
      showAlpha,
      mcArgs,
      customJava,
      bgMode,
      bgDim,
      bgBlur,
      enableServersTab,
      enableTabAnimations,
      enableNewDesign,
      selectedVersion,
      theme
    })
  }, [
    ramValue,
    launchFullscreen,
    launchMinimize,
    applyPlayerOptions,
    playerLang,
    playerGuiScale,
    playerNarrator,
    showSnapshots,
    showModified,
    showOldReleases,
    showBeta,
    showAlpha,
    mcArgs,
    customJava,
    bgMode,
    bgDim,
    bgBlur,
    enableServersTab,
    enableTabAnimations,
    enableNewDesign,
    selectedVersion,
    theme
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

    const oldName = mp.name
    if (safeEditName !== oldName) {
      try {
        // @ts-ignore
        const res = await window.electronAPI.renameModpackFolder(oldName, safeEditName);
        if (res?.status === 'error') {
          showError(t('app.renameFolderFailed', { error: res.error || t('app.unknownError') }));
          return;
        }
      } catch (e: any) {
        // Ошибка не должна оставлять модалку в подвешенном состоянии
        showError(t('app.renameFolderFailed', { error: errorText(e, t('app.unknownError')) }));
        return;
      }
    }

    const updated = modpacks.map(m => {
      if (m.name === oldName) {
        return { ...m, name: safeEditName, icon: editPlayIcon };
      }
      return m;
    });

    setModpacks(updated);
    // @ts-ignore
    await window.electronAPI.saveModpacks(updated);
    if (safeEditName !== oldName) {
      if (selectedVersion === `mp:${oldName}`) {
        pendingRenameRef.current = `mp:${safeEditName}`
        handleSelectVersion(`mp:${safeEditName}`);
      }
      window.dispatchEvent(new CustomEvent('modpack-renamed', { detail: { oldName, newName: safeEditName } }))
    }
    window.dispatchEvent(new CustomEvent('modpacks-updated'))
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
      } else if (authType === 'elyby') {
        if (!authEmail || !authPassword) { setAuthError(t('auth.enterLoginPassword')); setAuthLoading(false); return }
        const res = await window.electronAPI.authElyby(authEmail, authPassword)
        
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
        errMsg = t('auth.invalidCredentials')
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
    const target = accounts.find(a => a.id === id)
    if (!target) return

    setCustomModal({
      isOpen: true,
      title: t('app.deleteAccountTitle'),
      message: t('app.deleteAccountMsg', { name: target.name }),
      confirmText: t('app.delete'),
      cancelText: t('ui.cancel'),
      isDanger: true,
      isAlert: false,
      onConfirm: async () => {
        const remaining = accounts.filter(a => a.id !== id)
        if (remaining.length === 0) {
          setCustomModal(prev => ({ ...prev, isOpen: false }))
          return
        }
        // Неактивный аккаунт не должен менять текущий активный
        const nextActive = activeAccount && activeAccount.id !== id
          ? (remaining.find(a => a.id === activeAccount.id) || remaining[0])
          : remaining[0]
        try {
          await saveAccounts(remaining, nextActive)
        } finally {
          setCustomModal(prev => ({ ...prev, isOpen: false }))
        }
      }
    })
  }

  // Берёт язык, масштаб интерфейса и диктора из options.txt выбранной сборки:
  // человек один раз настроил игру, а профиль лаунчера подхватит это сам.
  const handleTakePlayerOptions = async () => {
    const instanceId = selectedVersion.startsWith('mp:') ? selectedVersion.slice(3) : undefined
    try {
      // @ts-ignore
      const values = await window.electronAPI?.readGameOptions?.(instanceId)
      if (!values || (!values.lang && !values.guiScale && !values.narrator)) {
        showError(t('settings.playerNothing'))
        return
      }
      if (values.lang) setPlayerLang(String(values.lang))
      if (values.guiScale) setPlayerGuiScale(String(values.guiScale))
      if (values.narrator !== undefined) setPlayerNarrator(String(values.narrator))
      setApplyPlayerOptions(true)
      showOk(t('settings.playerTaken', { name: instanceId || t('settings.navMinecraft') }))
    } catch (e) {
      showError(errorText(e, t('app.unknownError')))
    }
  }

  const handleLaunch = async () => {
    if (gameRunning) return;
    if (!activeAccount) {
      showError(t('app.pickAccountToPlay'));
      setView('accounts');
      return;
    }
    setGameRunning(true)
    setLaunching(true)
    launchReadyRef.current = false
    
    setProgress(t('app.progressInit'))

    // Check if a modpack is selected
    const isModpack = selectedVersion.startsWith('mp:')
    let launchOpts: any = {
      version: selectedVersion,
      username: activeAccount.name,
      uuid: activeAccount.uuid,
      token: activeAccount.token,
      clientToken: activeAccount.clientToken,
      authType: activeAccount.type,
      maxRam: ramValue,
      instanceId: selectedVersion,
      onPlayBehavior: 'keep',
      customArgs: mcArgs.trim() ? mcArgs.trim().split(/\s+/) : undefined,
      javaPath: customJava === '8'
        ? (installedJavas['8']?.path || undefined)
        : customJava === '17'
        ? (installedJavas['17']?.path || undefined)
        : customJava === '21'
        ? (installedJavas['21']?.path || undefined)
        : customJava === '25'
        ? (installedJavas['25']?.path || undefined)
        : customJava !== 'auto' && customJava
        ? customJava
        : undefined,
      // Rust: fullscreen пишется в options.txt сборки, minimizeLauncher
      // сворачивает окно лаунчера по событию game-ready.
      fullscreen: launchFullscreen,
      minimizeLauncher: launchMinimize,
      // Пустые поля Rust пропускает: опция остаётся той, что уже стоит в игре.
      playerOptions: applyPlayerOptions
        ? {
            lang: playerLang || undefined,
            guiScale: playerGuiScale || undefined,
            narrator: playerNarrator || undefined,
          }
        : undefined
    }

    if (isModpack) {
      const mpName = selectedVersion.replace('mp:', '')
      const mp = modpacks.find(m => m.name === mpName)
      if (mp) {
        launchOpts.version = mp.version
        launchOpts.loader = mp.loader
        launchOpts.modpackName = mp.name
        launchOpts.loaderVersion = mp.loaderVersion || undefined
        launchOpts.instanceId = mp.name
      }
    } else if (selectedVersion.endsWith(' Forge')) {
      launchOpts.version = selectedVersion.replace(' Forge', '')
      launchOpts.loader = 'forge'
    }

    try {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
        // @ts-ignore
        window.electronAPI.updateDiscordPresence({
          details: translate('app.presencePlaying'),
          state: t('app.presenceVersion', { p1: isModpack ? selectedVersion.replace('mp:', '') : selectedVersion }),
          startTimestamp: Date.now(),
          largeImageKey: "logo",
          largeImageText: "Pagrysha Launcher"
        })
      }
      
      // @ts-ignore
      await window.electronAPI.launchGame(launchOpts)
      // Команда вернулась сразу после `spawn`: окна ещё нет. Полосу гасит
      // событие `game-ready`, а таймер — страховка, если игра так и не
      // напишет в лог (тогда запуск считаем состоявшимся, но не висим вечно).
      setProgress(t('app.progressGameLaunching'))
      if (!launchReadyRef.current) {
        if (launchReadyTimerRef.current) clearTimeout(launchReadyTimerRef.current)
        launchReadyTimerRef.current = setTimeout(() => {
          if (launchReadyRef.current) return
          setLaunching(false)
          setProgress('')
        }, 120000)
      }
    } catch (e: any) {
      // Tauri отклоняет invoke строкой, а не объектом Error — иначе в
      // сообщении было бы «Error: undefined».
      const text = typeof e === 'string' ? e : (e?.message || String(e))
      setProgress(`Error: ${text}`)
      setGameRunning(false)
      setLaunching(false)
    }
  }

  // @ts-ignore
  const openFolder = () => {
    // Для сборки открываем папку инстанса, иначе — общий игровой каталог
    const instanceId = selectedVersion.startsWith('mp:') ? selectedVersion.replace('mp:', '') : undefined
    // @ts-ignore
    return window.electronAPI.openFolder(instanceId)
  }

  const handleUpdate = async () => {
    if (isUpdating) return;
    if (!updateInfo.downloadUrl) return;
    setIsUpdating(true);
    try {
      // @ts-ignore
      const res = await window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
      if (res && res.status === 'error') {
        setCustomModal({
          isOpen: true,
          title: t('app.updaterErrorTitle'),
          message: t('app.updateLoadFailed', { error: res.error || t('app.unknownError') }),
          isAlert: true,
          isDanger: true,
          confirmText: t('ui.close')
        })
      }
    } catch (e: any) {
      setCustomModal({
        isOpen: true,
        title: t('app.updaterErrorTitle'),
        message: t('app.updateLoadFailed', { error: errorText(e, t('app.unknownError')) }),
        isAlert: true,
        isDanger: true,
        confirmText: t('ui.close')
      })
    } finally {
      setIsUpdating(false)
    }
  }

  // Небольшая подпись с прогрессом запуска рядом с кнопкой Play.
  // Абсолютное позиционирование и pointerEvents: 'none' — layout не сдвигается.
  const renderLaunchProgress = (anchor?: React.CSSProperties) => {
    if (!progress) return null
    const isError = progress.startsWith('Error:')
    return (
      <div
        title={progress}
        style={{
          position: 'absolute',
          bottom: '100%',
          marginBottom: '6px',
          left: '50%',
          transform: 'translateX(-50%)',
          // Якорь можно переопределить (например, прижать к правому краю)
          ...anchor,
          maxWidth: '320px',
          fontFamily: '"Blocks", sans-serif',
          fontSize: '11px',
          lineHeight: 1.3,
          color: isError ? '#e74c3c' : 'var(--pg-yellow)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '1px 1px 0 rgba(0,0,0,0.85)',
          pointerEvents: 'none',
          zIndex: 20
        }}
      >
        {progress}
      </div>
    )
  }

  // Снапшоты отмечаем землёй вместо травы. Тип версии есть только в исходном
  // манифесте — в `versions` лежат одни id.
  const snapshotIds = new Set<string>(
    rawVersions.filter(rv => rv.type === 'snapshot').map(rv => rv.id)
  )

  // Полоса прогресса запуска внизу главного экрана.
  // Видна, пока идёт запуск, и пока не погас текст ошибки: общий эффект выше
  // очищает `progress` через 8 секунд, и полоса исчезает вместе с ним.
  const launchIsError = progress.startsWith('Error:')
  const launchBarVisible = launching || (launchIsError && progress.length > 0)
  // Точный процент есть только у установки Java; у этапов запуска его нет,
  // поэтому полоса показывает «бегущее» заполнение.
  const launchPercent =
    launching && javaProgress && typeof javaProgress.progress === 'number' && javaProgress.progress > 0
      ? javaProgress.progress
      : null

  // Обои живут только на лобби: рабочие экраны всегда на сплошной подложке.
  const lobbyWallpaperUrl = bgMode === 'custom' ? bgImage : bgMode === 'wallpaper' ? '/bg-minecraft.png' : null
  const showLobbyWallpaper = view === 'play' && Boolean(lobbyWallpaperUrl)

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
                        {t('installs.allDone')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--pg-text-muted)', textAlign: 'center', padding: '20px 0', fontSize: '12px' }}>{t('app.noActiveDownloads')}</div>
                  )
                ) : (
                  activeDownloads.map(d => (
                    <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: 'var(--pg-dark)', padding: '10px', border: '2px solid var(--border-soft)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'var(--pg-text)', fontWeight: 'bold' }}>{d.name}</span>
                        <span style={{ color: 'var(--pg-yellow)' }}>{d.progress}%</span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--pg-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.text}</div>
                      <div style={{ height: '4px', background: 'var(--pg-track)', width: '100%', marginTop: '5px' }}>
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
          <div style={{ position: 'relative' }}>
            <div className="jl-profile" onClick={() => setShowAccountDropdown(!showAccountDropdown)}>
              <div className="jl-profile-avatar">
                <MinecraftFace acc={activeAccount} size={38} skinTimestamp={skinTimestamp} />
              </div>
              <div className="jl-profile-info">
                <span className="jl-profile-name">{activeAccount.name}</span>
                <span className="jl-profile-status">
                  <span className="jl-profile-dot" />
                  {activeAccount.type === 'microsoft' && <>{t('app.licenseBadge')}</>}
                  {activeAccount.type === 'elyby' && <>Ely.by</>}
                  {activeAccount.type === 'offline' && <>Offline</>}
                </span>
              </div>
              <span className={`jl-profile-caret${showAccountDropdown ? ' open' : ''}`} />
            </div>

            {showAccountDropdown && (
              <div className="account-dropdown" style={{
                position: 'absolute',
                top: '100%',
                left: '10px',
                width: 'calc(100% - 20px)',
                background: 'var(--pg-dark)',
                borderBottom: '1px solid var(--pg-dark3)',
                zIndex: 100,
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column'
              }}>
              {/* Показываем не больше трёх аккаунтов: раньше список рос вместе
                  с их числом и строчка «Изменить» уезжала за нижний край. */}
              {accounts.slice(0, 3).map(acc => (
                <div
                  key={acc.id}
                  onClick={() => {
                    saveAccounts(accounts, acc);
                    setShowAccountDropdown(false);
                  }}
                  className={`account-dropdown-item ${activeAccount.id === acc.id ? 'active' : ''}`}
                >
                  <MinecraftFace acc={acc} size={38} skinTimestamp={skinTimestamp} />
                  <span style={{ color: 'var(--pg-text)', fontWeight: activeAccount.id === acc.id ? 'bold' : 'normal', fontSize: '13px' }}>{acc.name}</span>
                </div>
              ))}
              {/* Список ограничен тремя аккаунтами, поэтому «Изменить» всегда
                  на месте: привычная подпись и стрелка, а спрятанные аккаунты
                  показаны просто жёлтой цифрой слева. */}
              <div
                onClick={() => {
                  setShowAccountDropdown(false);
                  setView('accounts');
                  setSelectedAuthMethod(null);
                }}
                className="account-dropdown-item account-dropdown-manage"
                title={accounts.length > 3
                  ? moreAccountsLabel(accounts.length - 3, language === 'en')
                  : undefined}
              >
                <span className="account-dropdown-manage-label">
                  {accounts.length > 3 && (
                    <span className="account-dropdown-count">{accounts.length - 3}</span>
                  )}
                  {t("app.change")}
                </span>
                <span className="account-dropdown-manage-arrow">&gt;</span>
              </div>
            </div>
          )}
          </div>

          <div className="jl-nav">
            <div className={`jl-nav-item ${view === 'play' ? 'active' : ''}`} onClick={() => setView('play')}>
              <div className="jl-nav-icon jl-nav-icon-play">
                <PlayIcon size={24} opacity={view === 'play' ? 1 : 0.6} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarPlay")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'installations' ? 'active' : ''}`} onClick={() => setView('installations')}>
              <div className="jl-nav-icon">
                <HammerIcon size={24} opacity={view === 'installations' ? 1 : 0.6} />
              </div>
              <span className="jl-nav-text">{t("app.installations")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'modpacks' ? 'active' : ''}`} onClick={() => { setModpacksInitialQuery(''); setView('modpacks') }}>
              <div className="jl-nav-icon">
                <ModpackBoxIcon size={24} opacity={view === 'modpacks' ? 1 : 0.6} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarModpacks")}</span>
            </div>

            {enableServersTab && (
              <div className={`jl-nav-item ${view === 'servers' ? 'active' : ''}`} onClick={() => setView('servers')}>
                <div className="jl-nav-icon">
                  <ServersIcon size={24} opacity={view === 'servers' ? 1 : 0.6} />
                </div>
                <span className="jl-nav-text">{t("app.sidebarServers")}</span>
              </div>
            )}

          </div>

          <div className="jl-bottom">
            <div className={`jl-nav-item ${view === 'accounts' ? 'active' : ''}`} onClick={() => { setView('accounts'); setSelectedAuthMethod(null); }}>
              <div className="jl-nav-icon">
                <AccountsIcon size={24} opacity={view === 'accounts' ? 1 : 0.6} />
              </div>
              <span className="jl-nav-text">{t("app.accounts")}</span>
            </div>

            <div className={`jl-nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
              <div className="jl-nav-icon">
                <SettingsIcon size={24} opacity={view === 'settings' ? 1 : 0.6} />
              </div>
              <span className="jl-nav-text">{t("app.sidebarSettings")}</span>
            </div>

            <div className="jl-bottom-btn outlined" onClick={openFolder}>
              <Folder size={18} /> {t("app.gameFolder")}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div
          className={`jl-main${showLobbyWallpaper ? ' has-wallpaper' : ''}`}
          style={showLobbyWallpaper ? ({
            '--jl-wallpaper': `url("${lobbyWallpaperUrl}")`,
            '--jl-wallpaper-dim': String(bgDim / 100),
            '--jl-wallpaper-blur': `${bgBlur}px`
          } as React.CSSProperties) : undefined}
        >
          <LaunchStatusBar
            visible={launchBarVisible}
            error={launchIsError}
            percent={launchPercent}
          />
          <div
            key={view}
            className={enableTabAnimations ? 'subtle-tab-transition' : ''}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}
          >
            {view === 'play' && (
            <div className="jl-content lobby-content">
              {!enableNewDesign ? (
                <>
                  <section className="lobby-recs">
                    <div className="lobby-recs-head">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h2>{t('app.recommended')}</h2>
                          {halloweenOn && <Pumpkin className='hw-pumpkin-inline' />}
                        </div>
                        <p>{t('app.recommendedDesc')}</p>
                      </div>
                      {/* Стрелок ручного перелистывания нет: лента листается
                          сама, а колесиком/свайпом крутить и так можно. */}
                      <div className="lobby-recs-actions">
                        <button
                          type="button"
                          className="lobby-recs-all"
                          onClick={() => { setModpacksInitialQuery(''); setView('modpacks') }}
                        >
                          {t('app.allModpacks')} <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                    <div
                      className="lobby-recs-row"
                      ref={attachLobbyRecsRow}
                      style={{ gridTemplateColumns: `repeat(${recsColumns}, minmax(0, 1fr))` }}
                      onMouseEnter={() => { recsHoveredRef.current = true }}
                      onMouseLeave={() => { recsHoveredRef.current = false }}
                    >
                      {lobbyRecsLoading ? (
                        Array.from({ length: visibleCount }).map((_, i) => (
                          <div key={i} className="lobby-rec skeleton" aria-hidden="true" />
                        ))
                      ) : lobbyRecs.length > 0 ? (
                        visibleRecs.map((pack: any, index: number) => (
                          <button
                            key={pack.project_id || pack.slug || pack.title}
                            type="button"
                            className="lobby-rec"
                            onClick={() => { setModpacksInitialQuery(pack.title || ''); setView('modpacks') }}
                            style={{ animationDelay: `${Math.min(index * 35, 210)}ms` }}
                          >
                            <span className="lobby-rec-cover">
                              <ProjectArt project={pack} />
                              <span className="lobby-rec-badge">{projectLoaderLabel(pack)}</span>
                            </span>
                            <span className="lobby-rec-info">
                              <span className="lobby-rec-head">
                                <IconImg
                                  className="lobby-rec-icon"
                                  src={pack.icon_url}
                                  loading="lazy"
                                />
                                <strong>{pack.title}</strong>
                              </span>
                              <span className="lobby-rec-meta">
                                <Download size={12} />
                                {formatCount(pack.downloads)}
                                <span className="lobby-rec-dot">·</span>
                                {projectLoaderLabel(pack)}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <button type="button" className="lobby-recs-empty" onClick={() => { setModpacksInitialQuery(''); setView('modpacks') }}>
                          {t('app.catalogUnavailable')}
                        </button>
                      )}
                    </div>
                  </section>

                  <div className="lobby-play-row">
                    {/* Рамку и тени панели задаёт CSS (.jl-play-bar): раньше они жили
                        в инлайн-стилях и не перекрашивались темой. */}
                    <div className="jl-play-bar">
                      <div className="jl-version-selector" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--pg-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{t("app.currentVersion")}</label>
                        <div
                          className="custom-dropdown"
                          onClick={() => {
                            if (showVersionDropdown) handleCloseVersionDropdown()
                            else setShowVersionDropdown(true)
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: '200px' }}
                        >
                          <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {renderSelectedVersionIcon(selectedVersion, modpacks, 32, snapshotIds.has(selectedVersion))}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '14px', color: 'var(--pg-text)', fontWeight: 'bold' }}>
                              {selectedVersion.startsWith('mp:') ? selectedVersion.replace('mp:', '') : selectedVersion || t("app.selectVersion")}
                            </span>
                            {selectedVersion.startsWith('mp:') && (
                              <span style={{ fontSize: '11px', color: 'var(--pg-text-muted)' }}>
                                {modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.loader} {modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.version}
                              </span>
                            )}
                          </div>
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontFamily: '"Blocks", sans-serif',
                            fontSize: '11px',
                            color: 'var(--pg-text-muted)',
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
                        <div className={`dropdown-menu ${isClosingVersionDropdown ? 'closing' : ''}`} style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', background: 'var(--pg-dark)', border: '2px solid var(--pg-dark3)', maxHeight: '300px', overflowY: 'auto', zIndex: 50 }}>
                          {modpacks.length > 0 && (
                            <>
                              <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>{t("app.myModpacks")}</div>
                              {modpacks.map(mp => (
                                <div
                                  key={mp.name}
                                  className="dropdown-item"
                                  onClick={() => { handleSelectVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                  style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border-soft)' }}
                                >
                                  <IconImg src={mp.icon} size={24} fallback="./iconsblocks/Grass_Block_(inventory)_MCE.png" style={{ objectFit: 'cover' }} />
                                  <span style={{ color: 'var(--pg-text)', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                                </div>
                              ))}
                            </>
                          )}
                          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
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
                                        title: t('app.reinstallVersionTitle'),
                                        message: t('app.reinstallVersionMsg', { version: v }),
                                        confirmText: t('app.reinstall'),
                                        cancelText: t('ui.cancel'),
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
                                    padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: hasForge ? 'none' : '1px solid var(--border-soft)',
                                    background: isVanillaInstalled ? 'var(--surface-3)' : 'transparent'
                                  }}
                                >
                                  <IconImg size={24} src={v?.toLowerCase()?.match(/(forge|fabric|optifine|quilt|lite)/) ? "./iconsblocks/Anvil.png" : snapshotIds.has(v) ? "./iconsblocks/MCE_Dirt_(inventory).png" : "./iconsblocks/Grass_Block_(inventory)_MCE.png"} />
                                  <span style={{ color: isVanillaInstalled ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: isVanillaInstalled ? 'bold' : 'normal', flex: 1 }}>
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
                                          title: t('app.reinstallForgeTitle'),
                                          message: t('app.reinstallForgeMsg', { version: forgeLabel }),
                                          confirmText: t('app.reinstall'),
                                          cancelText: t('ui.cancel'),
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
                                      borderBottom: '1px solid var(--border-soft)',
                                      background: isForgeInstalled ? 'var(--surface-3)' : 'transparent'
                                    }}
                                  >
                                    <img src="./iconsblocks/Anvil.png" width={24} height={24} />
                                    <span style={{ color: isForgeInstalled ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: isForgeInstalled ? 'bold' : 'normal', flex: 1 }}>
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
                    <PlayButton />
                    {halloweenOn && <Pumpkin className='hw-pumpkin-on-play' />}
                    <span className="pg-play-label" style={{
                      position: 'relative', zIndex: 2,
                      fontFamily: '"MinecraftTen", "Blocks", monospace',
                      // Плитка красится акцентом темы — цвет надписи берём из
                      // готового токена: на светлом акценте он чёрный, на тёмном — белый.
                      fontSize: '16px', color: 'var(--pg-on-accent)', WebkitTextFillColor: 'var(--pg-on-accent)', WebkitTextStroke: '0', textShadow: '0 1px 0 rgba(255,255,255,0.28)', letterSpacing: '2px',
                      userSelect: 'none', transition: 'transform 0.1s'
                    }}>
                      {launching ? t('app.launching') : gameRunning ? t('app.gameRunning') : (() => {
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
                  {renderLaunchProgress({ left: 'auto', right: '20px', transform: 'none' })}
                  </div>
                </>
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
                      {renderSelectedVersionIcon(selectedVersion, modpacks, 46, snapshotIds.has(selectedVersion))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '15px',
                          color: 'var(--pg-text)',
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
                            t('app.officialReleasePrefix') + ' ' + selectedVersion
                          )}
                        </span>
                        {/* Custom decorative loader icon (anvil, paper, etc.) */}
                        {renderLoaderIcon(selectedVersion.startsWith('mp:') ? (modpacks.find(m => m.name === selectedVersion.replace('mp:', ''))?.loader || '') : selectedVersion)}
                      </div>
                    </div>

                    {(showVersionDropdown || isClosingVersionDropdown) && (
                      <div className={`dropdown-menu ${isClosingVersionDropdown ? 'closing' : ''}`} style={{ position: 'absolute', bottom: '100%', left: 0, width: '280px', background: 'var(--pg-dark)', border: '2px solid var(--pg-dark3)', maxHeight: '300px', overflowY: 'auto', zIndex: 50 }}>
                        {modpacks.length > 0 && (
                          <>
                            <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>{t("app.myModpacks")}</div>
                            {modpacks.map(mp => (
                              <div
                                key={mp.name}
                                className="dropdown-item"
                                onClick={(e) => { e.stopPropagation(); handleSelectVersion(`mp:${mp.name}`); handleCloseVersionDropdown(); }}
                                style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid var(--border-soft)' }}
                              >
                                <IconImg src={mp.icon} size={24} fallback="./iconsblocks/Grass_Block_(inventory)_MCE.png" style={{ objectFit: 'cover' }} />
                                <span style={{ color: 'var(--pg-text)', fontSize: '13px', flex: 1 }}>{mp.name}</span>
                              </div>
                            ))}
                          </>
                        )}
                        <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--pg-text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>{t("app.officialReleases")}</div>
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
                                      title: t('app.reinstallVersionTitle'),
                                      message: t('app.reinstallVersionMsg', { version: v }),
                                      confirmText: t('app.reinstall'),
                                      cancelText: t('ui.cancel'),
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
                                  padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: hasForge ? 'none' : '1px solid var(--border-soft)',
                                  background: isVanillaInstalled ? 'var(--surface-3)' : 'transparent'
                                }}
                              >
                                <IconImg size={24} src={v?.toLowerCase()?.match(/(forge|fabric|optifine|quilt|lite)/) ? "./iconsblocks/Anvil.png" : snapshotIds.has(v) ? "./iconsblocks/MCE_Dirt_(inventory).png" : "./iconsblocks/Grass_Block_(inventory)_MCE.png"} />
                                <span style={{ color: isVanillaInstalled ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: isVanillaInstalled ? 'bold' : 'normal', flex: 1 }}>
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
                                        title: t('app.reinstallForgeTitle'),
                                        message: t('app.reinstallForgeMsg', { version: forgeLabel }),
                                        confirmText: t('app.reinstall'),
                                        cancelText: t('ui.cancel'),
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
                                    borderBottom: '1px solid var(--border-soft)',
                                    background: isForgeInstalled ? 'var(--surface-3)' : 'transparent'
                                  }}
                                >
                                  <img src="./iconsblocks/Anvil.png" width={24} height={24} />
                                  <span style={{ color: isForgeInstalled ? 'var(--pg-text)' : 'var(--pg-text-muted)', fontSize: '13px', fontWeight: isForgeInstalled ? 'bold' : 'normal', flex: 1 }}>
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
                      // Жёлтая кнопка — чёрные буквы: белые на ней почти сливались.
                      color: '#141414',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                      WebkitTextStroke: '0',
                      fontSize: '17px',
                      userSelect: 'none'
                    }}
                    className="jl-flat-yellow-btn hover-scale-btn active-press-btn"
                  >
                    <span>
                      {launching ? t('app.launching') : gameRunning ? t('app.gameRunning') : (() => {
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
                  {renderLaunchProgress()}

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
                      title={selectedVersion.startsWith('mp:') ? t('app.editModpack') : t('app.editModpackDisabled')}
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
          {view === 'modpacks' && <ModpacksMenu currentVersion={selectedVersion} opacity={menuOpacity} initialQuery={modpacksInitialQuery} />}
          {view === 'servers' && <ServersMenu opacity={menuOpacity} />}
          {view === 'settings' && (
            <div className="settings-view">
              {/* Вертикальная навигация вместо верхних вкладок */}
              <aside className="settings-nav">
                <div className="settings-nav-head">
                  <SlidersHorizontal size={15} />
                  <span>{t('settings.navTitle')}</span>
                </div>
                <nav className="settings-nav-list">
                  {[
                    { id: 'appearance', label: t('settings.navAppearance'), icon: <Palette size={15} /> },
                    { id: 'customization', label: t('settings.navLauncher'), icon: <SlidersHorizontal size={15} /> },
                    { id: 'main', label: t('settings.navMinecraft'), icon: <Blocks size={15} /> },
                    { id: 'experimental', label: t('settings.navExperimental'), icon: <FlaskConical size={15} /> }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`settings-nav-item ${settingsTab === item.id ? 'active' : ''}`}
                      onClick={() => setSettingsTab(item.id as any)}
                    >
                      <span className="settings-nav-icon">{item.icon}</span>
                      <span className="settings-nav-label">{item.label}</span>
                    </button>
                  ))}
                </nav>
                <div className="settings-nav-foot">Pagrysha Launcher v{pkg.version}</div>
              </aside>

              <div className="settings-pane custom-scrollbar">
                <div className="settings-pane-inner">
                  <header className="settings-pane-head">
                    <h1>
                      {settingsTab === 'appearance'
                        ? t('settings.navAppearance')
                        : settingsTab === 'customization'
                          ? t('settings.navLauncher')
                          : settingsTab === 'main'
                            ? t('settings.navMinecraft')
                            : t('settings.navExperimental')}
                    </h1>
                    <p>
                      {settingsTab === 'appearance'
                        ? t('settings.descAppearance')
                        : settingsTab === 'customization'
                          ? t('settings.descLauncher')
                          : settingsTab === 'main'
                            ? t('settings.descMinecraft')
                            : t('settings.descExperimental')}
                    </p>
                  </header>
                {settingsTab === 'appearance' && (
                  <>
                    <CustomizationTab
                      theme={theme}
                      onChange={(patch) => setTheme(prev => ({ ...prev, ...patch }))}
                      onPreset={(id) => setTheme(presetTheme(id))}
                      onMode={(mode) => setTheme(prev => withMode(prev, mode))}
                      onReset={() => setTheme(DEFAULT_THEME)}
                    />

                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('app.bgTitle')}</h2>
                        <p>{t('settings.bgDesc')}</p>
                      </div>

                      <div className="bg-mode-grid">
                        {[
                          { id: 'dark', title: t('app.bgModeDark'), desc: t('app.bgModeDarkDesc') },
                          { id: 'wallpaper', title: t('app.bgModeWallpaper'), desc: t('app.bgModeWallpaperDesc') },
                          { id: 'custom', title: t('app.bgModeCustom'), desc: t('app.bgModeCustomDesc') }
                        ].map(mode => {
                          const active = bgMode === mode.id
                          const previewSrc = mode.id === 'custom' ? (bgImage || './bg-minecraft.png') : './bg-minecraft.png'
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              className={`bg-mode ${active ? 'active' : ''}`}
                              onClick={() => setBgMode(mode.id as 'dark' | 'wallpaper' | 'custom')}
                            >
                              <span className={`bg-mode-preview ${mode.id === 'dark' ? 'dark' : ''}`}>
                                {mode.id !== 'dark' && (
                                  <img
                                    src={previewSrc}
                                    alt=""
                                    style={{ filter: mode.id === 'custom' ? 'blur(2px) brightness(.45)' : 'brightness(.6)' }}
                                  />
                                )}
                              </span>
                              <span className="bg-mode-body">
                                <span className="bg-mode-title">{mode.title}</span>
                                <span className="bg-mode-desc">{mode.desc}</span>
                              </span>
                              <span className="bg-mode-check" />
                            </button>
                          )
                        })}
                      </div>

                      {bgMode === 'custom' && (
                        <div className="settings-inline">
                          <label className="settings-action-btn primary" style={{ cursor: 'pointer' }}>
                            {t('app.selectFile')}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e: any) => {
                                if (e.target.files && e.target.files[0]) {
                                  saveCompressedImage(e.target.files[0], 'mc_main_bg_data', (url) => {
                                    setBgImage(url);
                                    setBgMode('custom');
                                    window.dispatchEvent(new Event('storage'));
                                  });
                                }
                              }}
                            />
                          </label>
                          {bgImage && (
                            <button
                              type="button"
                              className="settings-action-btn danger"
                              onClick={() => {
                                localStorage.removeItem('mc_main_bg_data');
                                setBgImage(null);
                                setBgMode('dark');
                                window.dispatchEvent(new Event('storage'));
                              }}
                            >
                              <Trash size={12} /> {t('app.reset')}
                            </button>
                          )}
                        </div>
                      )}

                      <div className={`settings-sliders ${bgMode === 'dark' ? 'disabled' : ''}`}>
                        <div className="settings-slider-row">
                          <span className="settings-slider-label">{t('app.bgDim')}</span>
                          <input
                            type="range"
                            min="0"
                            max="90"
                            step="5"
                            className="ram-slider"
                            value={bgDim}
                            disabled={bgMode === 'dark'}
                            onChange={e => setBgDim(Number(e.target.value))}
                            style={{ flex: 1, background: `linear-gradient(to right, var(--pg-yellow) 0%, var(--pg-yellow) ${(bgDim / 90) * 100}%, var(--pg-track, #0e0e0e) ${(bgDim / 90) * 100}%, var(--pg-track, #0e0e0e) 100%)` }}
                          />
                          <span className="settings-slider-value">{bgDim}%</span>
                        </div>
                        <div className="settings-slider-row">
                          <span className="settings-slider-label">{t('app.bgBlur')}</span>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            step="1"
                            className="ram-slider"
                            value={bgBlur}
                            disabled={bgMode === 'dark'}
                            onChange={e => setBgBlur(Number(e.target.value))}
                            style={{ flex: 1, background: `linear-gradient(to right, var(--pg-yellow) 0%, var(--pg-yellow) ${(bgBlur / 20) * 100}%, var(--pg-track, #0e0e0e) ${(bgBlur / 20) * 100}%, var(--pg-track, #0e0e0e) 100%)` }}
                          />
                          <span className="settings-slider-value">{bgBlur} px</span>
                        </div>
                      </div>

                      <div className="settings-hint">
                        {t('app.bgHint')}
                      </div>
                    </section>
                  </>
                )}

                {/* Tab 1: ЛАУНЧЕР (Customization) */}
                {settingsTab === 'customization' && (
                  <>
                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.languageTitle')}</h2>
                        <p>{t('settings.languageDesc')}</p>
                      </div>
                      <McSelect 
                        value={language} 
                        onChange={(v) => setLanguage(v as Language)} 
                        options={[
                          { value: 'ru', label: 'Русский - Россия', icon: <RussianFlag /> },
                          { value: 'en', label: 'English - United States', icon: <AmericanFlag /> }
                        ]} 
                        style={{ width: '300px' }} 
                      />
                    </section>

                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.maintenanceTitle')}</h2>
                        <p>{t('settings.maintenanceDesc')}</p>
                      </div>
                      <div className="settings-actions-row">
                        <button type="button" className="settings-action-btn" onClick={handleCheckUpdatesClick}>
                          {t('settings.checkUpdatesBtn')}
                        </button>

                        <button type="button" className="settings-action-btn" onClick={handleClearCacheClick}>
                          {t('settings.clearCacheBtn')}
                        </button>
                      </div>
                    </section>

                    <section className="settings-card danger-zone">
                      <div className="settings-card-head">
                        <h2>{t('settings.dangerTitle')}</h2>
                        <p>{t('settings.dangerDesc')}</p>
                      </div>
                      <div className="settings-actions-row">
                        <button type="button" className="settings-action-btn danger" onClick={handleCleanUninstallJavaClick}>
                          {t('settings.removeJavaBtn')}
                        </button>

                        <button type="button" className="settings-action-btn danger" onClick={handleResetSettingsClick}>
                          {t('settings.resetAllBtn')}
                        </button>
                      </div>
                    </section>
                  </>
                )}

                {/* Tab 2: MINECRAFT (Main) */}
                {settingsTab === 'main' && (
                  <>
                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.ramTitle')}</h2>
                        <p>{t('settings.ramDesc')}</p>
                      </div>
                      <div className="settings-ram">
                        <div className="settings-ram-slider">
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
                              background: `linear-gradient(to right, var(--pg-yellow) 0%, var(--pg-yellow) ${Math.max(0, Math.min(100, Math.round(((ramValue - 512) / (maxRam - 512)) * 100)))}%, var(--pg-track, #0e0e0e) ${Math.max(0, Math.min(100, Math.round(((ramValue - 512) / (maxRam - 512)) * 100)))}%, var(--pg-track, #0e0e0e) 100%)`
                            }} 
                          />
                          <div className="settings-ram-scale">
                            <span>512M</span>
                            <span>{Math.floor(maxRam * 0.25)}M</span>
                            <span>{Math.floor(maxRam * 0.5)}M</span>
                            <span>{Math.floor(maxRam * 0.75)}M</span>
                            <span>MAX ({maxRam}M)</span>
                          </div>
                        </div>
                        <div className="settings-ram-value">
                          <input type="number" className="mc-input" value={ramValue} onChange={e => {
                            const raw = e.target.value
                            if (raw.trim() === '') return
                            const parsed = Number(raw)
                            if (!Number.isFinite(parsed)) return
                            // Пока пользователь набирает число, не поджимаем его к
                            // границам: иначе первая цифра «8» сразу стала бы 512.
                            setRamValue(parsed)
                          }} onBlur={() => setRamValue(v => Math.min(maxRam, Math.max(512, Math.round(v))))} style={{ width: '78px', padding: '5px', textAlign: 'center' }} />
                          <span>MB</span>
                        </div>
                      </div>
                    </section>

                    {/* Окно игры: полный экран + сворачивание лаунчера. */}
                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('app.launchWindowCard')}</h2>
                        <p>{t('app.launchWindowDesc')}</p>
                      </div>
                      <div className="settings-check-list">
                        <label className="settings-check">
                          <input type="checkbox" checked={launchFullscreen} onChange={e => setLaunchFullscreen(e.target.checked)} />
                          <span>{t("app.launchFullscreen")}</span>
                        </label>
                        <label className="settings-check">
                          <input type="checkbox" checked={launchMinimize} onChange={e => setLaunchMinimize(e.target.checked)} />
                          <span>{t("app.launchMinimize")}</span>
                        </label>
                      </div>
                    </section>

                    {/* Профиль настроек игрока: язык, интерфейс, диктор. */}
                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.playerCard')}</h2>
                        <p>{t('settings.playerDesc')}</p>
                      </div>

                      <div className="settings-check-list" style={{ marginBottom: 14 }}>
                        <label className="settings-check">
                          <input type="checkbox" checked={applyPlayerOptions} onChange={e => setApplyPlayerOptions(e.target.checked)} />
                          <span>{t('settings.playerApply')}</span>
                        </label>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: applyPlayerOptions ? 1 : 0.5 }}>
                        <div>
                          <div className="settings-hint" style={{ marginBottom: 6 }}>{t('settings.playerLang')}</div>
                          <McSelect
                            value={playerLang}
                            onChange={setPlayerLang}
                            disabled={!applyPlayerOptions}
                            style={{ width: '320px' }}
                            options={[
                              { value: '', label: t('settings.playerNone') },
                              { value: 'ru_ru', label: 'Русский' },
                              { value: 'en_us', label: 'English' },
                              { value: 'uk_ua', label: 'Українська' },
                              { value: 'be_by', label: 'Беларуская' },
                              { value: 'de_de', label: 'Deutsch' },
                              { value: 'es_es', label: 'Español' },
                              { value: 'fr_fr', label: 'Français' },
                              { value: 'it_it', label: 'Italiano' },
                              { value: 'pl_pl', label: 'Polski' },
                              { value: 'pt_br', label: 'Português (Brasil)' },
                              { value: 'tr_tr', label: 'Türkçe' },
                            ]}
                          />
                        </div>
                        <div>
                          <div className="settings-hint" style={{ marginBottom: 6 }}>{t('settings.playerGui')}</div>
                          <McSelect
                            value={playerGuiScale}
                            onChange={setPlayerGuiScale}
                            disabled={!applyPlayerOptions}
                            style={{ width: '320px' }}
                            options={[
                              { value: '', label: t('settings.playerNone') },
                              { value: '0', label: t('settings.playerAuto') },
                              { value: '1', label: '1' },
                              { value: '2', label: '2' },
                              { value: '3', label: '3' },
                              { value: '4', label: '4' },
                            ]}
                          />
                        </div>
                        <div>
                          <div className="settings-hint" style={{ marginBottom: 6 }}>{t('settings.playerNarrator')}</div>
                          <McSelect
                            value={playerNarrator}
                            onChange={setPlayerNarrator}
                            disabled={!applyPlayerOptions}
                            style={{ width: '320px' }}
                            options={[
                              { value: '', label: t('settings.playerNone') },
                              { value: '0', label: t('settings.playerNarratorOff') },
                              { value: '1', label: t('settings.playerNarratorSelect') },
                              { value: '2', label: t('settings.playerNarratorAll') },
                            ]}
                          />
                        </div>
                        <div className="settings-actions-row">
                          <button type="button" className="settings-action-btn" onClick={handleTakePlayerOptions} disabled={!applyPlayerOptions}>
                            {t('settings.playerTake')}
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.versionListTitle')}</h2>
                        <p>{t('settings.versionListDesc')}</p>
                      </div>
                      <div className="settings-check-list">
                        <label className="settings-check">
                          <input type="checkbox" checked={showSnapshots} onChange={e => handleToggleSnapshots(e.target.checked)} />
                          <span>{t("app.showSnapshots")}</span>
                        </label>
                        <label className="settings-check">
                          <input type="checkbox" checked={showModified} onChange={e => handleToggleModified(e.target.checked)} />
                          <span>{t("app.showForge")}</span>
                        </label>
                        <label className="settings-check">
                          <input type="checkbox" checked={showOldReleases} onChange={e => handleToggleOldReleases(e.target.checked)} />
                          <span>{t("app.showOldReleases")}</span>
                        </label>
                        <label className="settings-check">
                          <input type="checkbox" checked={showBeta} onChange={e => handleToggleBeta(e.target.checked)} />
                          <span>{t("app.showBeta")}</span>
                        </label>
                        <label className="settings-check">
                          <input type="checkbox" checked={showAlpha} onChange={e => handleToggleAlpha(e.target.checked)} />
                          <span>{t("app.showAlpha")}</span>
                        </label>
                      </div>
                    </section>

                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>{t('settings.jvmTitle')}</h2>
                        <p>{t('settings.jvmDesc')}</p>
                      </div>
                      <input type="text" value={mcArgs} onChange={e => setMcArgs(e.target.value)} placeholder="-Xmx4G -XX:+UseG1GC" className="mc-input settings-input" />
                    </section>

                    <section className="settings-card">
                      <div className="settings-card-head">
                        <h2>Java</h2>
                        <p>{t('settings.javaRuntimeDesc')}</p>
                      </div>
                      <div className="settings-inline">
                        <McSelect 
                          value={customJava} 
                          onChange={(val: string) => {
                            setCustomJava(val)
                            localStorage.setItem('mc_custom_java', val)
                          }} 
                          options={[
                            { value: 'auto', label: t('settings.javaAuto') },
                            ...(installedJavas['8']?.installed ? [{ value: '8', label: t('settings.java8') }] : []),
                            ...(installedJavas['17']?.installed ? [{ value: '17', label: t('settings.java17') }] : []),
                            ...(installedJavas['21']?.installed ? [{ value: '21', label: t('settings.java21') }] : []),
                            ...(installedJavas['25']?.installed ? [{ value: '25', label: t('settings.java25') }] : []),
                            ...(!['auto', '8', '17', '21', '25'].includes(customJava) && customJava ? [{ value: customJava, label: t('settings.javaCustom', { p1: customJava }) }] : [])
                          ]} 
                          style={{ width: '320px' }} 
                        />
                        <button 
                          className="settings-action-btn" 
                          onClick={() => { setShowJavaManagerModal(true); refreshInstalledJavas(); }}
                        >
                          {t('settings.javaComponents')}
                        </button>
                      </div>
                    </section>
                  </>
                )}

                {/* Tab 3: ЭКСПЕРИМЕНТАЛЬНЫЕ (Experimental) */}
                {settingsTab === 'experimental' && (
                  <section className="settings-card">
                    <div className="settings-card-head">
                      <h2>{t('settings.experimentalTitle')}</h2>
                      <p>{t('settings.experimentalDesc')}</p>
                    </div>
                    <div className="settings-check-list">
                      <label className="settings-check">
                        <input type="checkbox" checked={enableServersTab} onChange={e => {
                          setEnableServersTab(e.target.checked);
                          localStorage.setItem('mc_enable_servers_tab', e.target.checked.toString());
                        }} />
                        <span className="settings-check-text">
                          <span className="settings-check-title">{t('settings.serversTabTitle')}</span>
                          <span className="settings-check-desc">{t('settings.serversTabDesc')}</span>
                        </span>
                      </label>
                      <label className="settings-check">
                        <input type="checkbox" checked={enableTabAnimations} onChange={e => {
                          setEnableTabAnimations(e.target.checked);
                          localStorage.setItem('mc_enable_tab_animations', e.target.checked.toString());
                        }} />
                        <span className="settings-check-text">
                          <span className="settings-check-title">{t('settings.tabsAnimationTitle')}</span>
                          <span className="settings-check-desc">{t('settings.tabsAnimationDesc')}</span>
                        </span>
                      </label>
                    </div>
                  </section>
                )}
                </div>
              </div>
            </div>
          )}

         

          {view === 'accounts' && (
            <div
              className="accounts-tab-view accounts-page"
              style={{
                flex: 1,
                height: '100%',
                background: `rgba(18, 18, 18, ${menuOpacity / 100})`,
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}
            >
              <div className="accounts-inner">
                {/* Шапка: заголовок и подпись текущего шага. */}
                <header className="accounts-hero">
                  <div>
                    <div className="accounts-kicker">
                      {selectedAuthMethod === null ? t('app.accountsStep1') : t('app.accountsStep2')}
                    </div>
                    <h1 className="accounts-title">
                      {selectedAuthMethod === null
                        ? t("app.chooseAccountType")
                        : (selectedAuthMethod === 'offline' ? t('app.loginOffline') : t('app.loginAccount'))}
                    </h1>
                    <p className="accounts-sub">
                      {selectedAuthMethod === null
                        ? t("app.chooseAccountDesc")
                        : (selectedAuthMethod === 'offline' ? t('app.nickHint') : t('app.credsHint'))}
                    </p>
                  </div>

                </header>

                {selectedAuthMethod === null ? (
                  <>
                    {/* Список: карточки вместо плотных строк с инлайновыми рамками. */}
                    <section className="accounts-section">
                      <div className="accounts-section-head">
                        <h2 className="accounts-section-title">{t('app.yourAccounts')}</h2>
                        <span className="accounts-count">{accounts.length}</span>
                      </div>

                      {accounts.length === 0 ? (
                        <div className="accounts-empty">
                          {t('app.noAccounts')}
                        </div>
                      ) : (
                        <div className="accounts-grid">
                          {accounts.map(acc => (
                            <div
                              key={acc.id}
                              className={`accounts-card${activeAccount.id === acc.id ? ' active' : ''}`}
                              onClick={() => saveAccounts(accounts, acc)}
                              title={t('app.makeActive')}
                            >
                              <div className="accounts-card-fill" />
                              <MinecraftFace acc={acc} size={44} skinTimestamp={skinTimestamp} />
                              {/* 1 1 90px: ник тянется, но у бейджа и кнопки
                                  удаления свои неизменяемые места. */}
                              <div style={{ flex: '1 1 90px', minWidth: 0 }}>
                                <span className="accounts-card-name">{acc.name}</span>
                                <span className="accounts-card-type">
                                  {acc.type === 'offline' ? t("app.typeOffline") : acc.type}
                                </span>
                              </div>
                              {activeAccount.id === acc.id && (
                                <span className="accounts-card-badge">{t('app.active')}</span>
                              )}
                              {accounts.length > 1 && (
                                <button
                                  className="accounts-card-del"
                                  title={t('app.deleteAccountTitle')}
                                  onClick={(e) => { e.stopPropagation(); removeAccount(acc.id) }}
                                >
                                  <Trash size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="accounts-section">
                      <div className="accounts-section-head">
                        <h2 className="accounts-section-title">{t('app.addAccount')}</h2>
                      </div>

                      <div className="accounts-methods">
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
                          onClick={() => { setSelectedAuthMethod('offline'); setAuthType('offline'); setAuthError(''); }}
                          style={{ cursor: 'pointer', padding: '8px 16px' }}
                        >
                          <div className="mc-acc-icon-box" style={{ width: '40px', height: '40px' }}><img src="./steve-head-Djx_sDkf.png" width={32} style={{ imageRendering: 'pixelated' }} /></div>
                          <div className="mc-acc-text">
                            <span className="subtitle" style={{ fontSize: '11px' }}>{t("app.offlineTitle")}</span>
                            <span className="title" style={{ fontSize: '14px' }}>{t("app.offlineAccount")}</span>
                          </div>
                          <div className="mc-acc-arrow">{'>'}</div>
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  /* Форма входа. Рамка — фон панели, заливка — отдельный слой,
                     иначе clip-path съедал уголки. */
                  <section className="accounts-form">
                    <div className="accounts-form-fill" />

                    <div className="accounts-form-top">
                      <button
                        className="accounts-back"
                        onClick={() => { setSelectedAuthMethod(null); setAuthError(''); }}
                      >
                        {t('app.back')}
                      </button>

                      <div className="accounts-form-who">
                        {selectedAuthMethod === 'elyby' && <img src="https://ely.by/favicon.ico" width={20} />}
                        {selectedAuthMethod === 'offline' && <img src="./steve-head-Djx_sDkf.png" width={24} style={{ imageRendering: 'pixelated' }} />}
                        <span>
                          {selectedAuthMethod === 'elyby' && t("app.elybyAccount")}
                          {selectedAuthMethod === 'offline' && t("app.offlineAccount")}
                        </span>
                      </div>

                      <span className="accounts-form-step">{t('app.stepOf')}</span>
                    </div>

                    <div className="accounts-form-body">
                      {selectedAuthMethod === 'offline' && (
                        <div className="accounts-field">
                          <label className="accounts-field-label">{t('app.nickname')}</label>
                          <div className="accounts-field-row">
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
                          <span className="accounts-field-hint">{t('app.nicknameDesc')}</span>
                        </div>
                      )}

                      {selectedAuthMethod === 'elyby' && (
                        <>
                          <div className="accounts-field">
                            <label className="accounts-field-label">{t('app.emailOrNick')}</label>
                            <div className="accounts-field-row">
                              <input
                                type="text"
                                className="mc-input"
                                placeholder="E-mail"
                                disabled={authLoading}
                                value={authEmail}
                                onChange={e => setAuthEmail(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>

                          <div className="accounts-field">
                            <label className="accounts-field-label">{t('app.password')}</label>
                            <div className="accounts-field-row">
                              <input
                                type={showPassword ? "text" : "password"}
                                className="mc-input"
                                placeholder={t("app.passwordPlaceholder")}
                                disabled={authLoading}
                                value={authPassword}
                                onChange={e => setAuthPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addAccount()}
                              />
                              <button
                                className="accounts-eye"
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                title={showPassword ? t('app.hidePassword') : t('app.showPassword')}
                              >
                                {showPassword ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                              </button>
                            </div>
                            <span className="accounts-field-hint">{t('app.elybyNote')}</span>
                          </div>
                        </>
                      )}

                      {authError && (
                        <div className="accounts-error">
                          <span style={{ flex: 1 }}>
                            <b>{t('app.loginFailed')}</b>
                            {authError}
                          </span>
                        </div>
                      )}

                      <div className="accounts-form-actions">
                        <button
                          className="mc-btn-primary"
                          style={{ padding: '11px 26px', textTransform: 'uppercase', letterSpacing: '1px' }}
                          onClick={addAccount}
                          disabled={authLoading}
                        >
                          {authLoading ? t("app.loading") : t("app.add")}
                        </button>
                      </div>
                    </div>
                  </section>
                )}
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
                <span>{t('app.gameCrashed')}</span>
              </div>
              <button
                onClick={() => setCrashLog(null)}
                className="mc-close-cube-btn"
                title={t('ui.close')}
              >
                <CubicCrossIcon />
              </button>
            </div>
            
            <div className="mc-dialog-content" style={{ padding: '12px' }}>
              <div style={{ color: '#888', fontSize: '11px', marginBottom: '8px', fontFamily: '"Blocks", sans-serif', textTransform: 'uppercase' }}>
                {t('app.launchErrorLog')}
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
                  navigator.clipboard?.writeText(crashLog)?.catch(() => {});
                  setCustomModal({ isOpen: true, title: t('app.noticeTitle'), message: t('app.logCopied'), isAlert: true, confirmText: t('app.gotIt') });
                }}
              >
                {t('app.copyLog')}
              </button>
              <button type="button" className="mc-cube-btn gold" onClick={() => setCrashLog(null)}>
                {t('ui.close')}
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
                <span>{t('app.modpackSettingsTitle')}</span>
              </div>
              <button 
                className="mc-close-cube-btn" 
                title={t('ui.close')} 
                onClick={() => setShowPlayEditModal(false)}
              >
                <CubicCrossIcon />
              </button>
            </div>

            <div className="mc-dialog-content">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ color: 'var(--pg-yellow)', fontSize: '11px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    {t('app.modpackName')}
                  </label>
                  <input type="text" className="mc-input" value={editPlayName} onChange={e => setEditPlayName(e.target.value)} style={{ fontFamily: '"Blocks", sans-serif' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ color: 'var(--pg-yellow)', fontSize: '11px', fontFamily: '"MinecraftTen", "Blocks", sans-serif', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    {t('app.iconLabel')}
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
                      title={t('app.chooseFile')}
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
                {confirmPlayDelete ? t('app.confirmDelete') : t('app.delete')}
              </button>
              <button type="button" className="mc-cube-btn gold" onClick={handleSavePlayEdit}>
                {t('app.save')}
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
                <span>{t('app.javaRuntimeTitle')}</span>
              </div>
              <button 
                className="mc-close-cube-btn" 
                title={t('ui.close')} 
                onClick={() => setShowJavaManagerModal(false)}
              >
                <CubicCrossIcon />
              </button>
            </div>

            <div className="mc-dialog-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#ccc', lineHeight: '1.5' }}>
                {t('app.javaAutoNote')}
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
                    desc: t('app.java8Note'),
                    badge: '<= 1.16.5'
                  },
                  {
                    version: '17' as const,
                    title: 'Java 17 (JRE 17)',
                    desc: t('app.java17Note'),
                    badge: '1.17 — 1.20.4'
                  },
                  {
                    version: '21' as const,
                    title: 'Java 21 (JRE 21)',
                    desc: t('app.java21Note'),
                    badge: '1.20.5+'
                  },
                  {
                    version: '25' as const,
                    title: 'Java 25 (JRE 25)',
                    desc: t('app.java25Note'),
                    badge: '26.x+ / Snapshots'
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
                              <span>✓</span> {t('app.installed')}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!!installingJava}
                              onClick={() => handleInstallJava(item.version)}
                              className="mc-cube-btn gold"
                              style={{ padding: '6px 14px', fontSize: '11px' }}
                            >
                              {isThisInstalling ? t('app.installing') : t('app.install')}
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
                            {javaProgress?.status || t('app.loading')}
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
                  {t('app.installAll')}
                </button>
                <button
                  type="button"
                  disabled={!!installingJava}
                  onClick={handleCleanUninstallJavaClick}
                  className="mc-cube-btn danger"
                >
                  {t('app.removeJavaButton')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowJavaManagerModal(false)}
                className="mc-cube-btn neutral"
              >
                {t('ui.close')}
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
                  title={t('ui.close')}
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
                  {customModal.cancelText || t('ui.cancel')}
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
                {customModal.isLoading ? t('app.working') : (customModal.confirmText || (customModal.isAlert ? t('app.gotIt') : t('app.confirm')))}
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
                {t('app.updaterTitle')}
              </div>
              <button 
                type="button" 
                className="mc-close-cube-btn"
                disabled={isUpdating}
                onClick={() => setShowUpdateModal(false)}
                title={t('ui.close')}
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
                {t('app.changelogFixed')}
              </div>

              <div className="mc-update-changelog">
                {updateInfo.body ? (
                  updateInfo.body
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('#'))
                    .map(line => line.replace(/^[-*]\s*/, ''))
                    .slice(0, 8)
                    .join('\n') || t('app.changelogFixNote')
                ) : (
                  t('app.changelogFixNote')
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
                    {activeDownloads.find(d => d.id === 'app_update')?.text || t('app.downloadingUpdate')}
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
                {isUpdating ? t('app.loading') : t('app.updateNow')}
              </button>

              <button 
                type="button" 
                disabled={isUpdating}
                onClick={() => setShowUpdateModal(false)}
                className="mc-cube-btn neutral"
              >
                {t('app.later')}
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
 
