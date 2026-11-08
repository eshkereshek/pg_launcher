import {
  useState,
  useEffect,
  useRef } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import CardSkeletons from './CardSkeletons'
import { useTranslation } from './i18n'
import { Plus,
  Package,
  Search,
  Power,
  Trash2,
} from 'lucide-react'
import { McSelect } from './McSelect'
import ModViewer from './ModViewer'
import ModpackCreatePage, { PRESET_ICONS } from './ModpackCreatePage'
import ModpackSettingsPage from './ModpackSettingsPage'
import { ProjectArt } from './ProjectArt'
import { PROJECT_FALLBACK_ICON, formatCount } from './projectMeta'
import { showOk, showError, errorText } from './Toasts'
import IconImg from './IconImg'
import { Settings } from './PixelIcons'
const CubicCrossIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}>
    <rect x="2" y="2" width="2" height="2" />
    <rect x="4" y="4" width="2" height="2" />
    <rect x="6" y="6" width="4" height="4" />
    <rect x="10" y="4" width="2" height="2" />
    <rect x="12" y="2" width="2" height="2" />
    <rect x="2" y="12" width="2" height="2" />
    <rect x="4" y="10" width="2" height="2" />
    <rect x="10" y="10" width="2" height="2" />
    <rect x="12" y="12" width="2" height="2" />
  </svg>
)

interface Modpack {
  name: string
  loader: string
  version: string
  loaderVersion?: string
  installedMods: { id: string; title: string; type?: string; isEnabled?: boolean; projectId?: string; isLocal?: boolean }[]
  icon?: string
  hasElybySkins?: boolean
}

/**
 * Ждёт промис не дольше указанного времени.
 *
 * Создание сборки с OptiFine зависало на «Создаём сборку...»: запрос к зеркалу
 * мог не отвечать вовсе, и промис не завершался. Таймаут возвращает управление,
 * чтобы показать ошибку и вернуть форму в рабочее состояние.
 */
const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])



/**
 * Читаемое название из имени файла: `create-1.20.1-0.5.1.f.jar` → `Create`.
 *
 * Нужно как запасной вариант: настоящие названия приходят из манифеста мода,
 * но у файлов, скопированных в папку вручную, манифеста может не быть.
 */
const prettyModName = (filename: string) => {
  const stem = (filename || '').replace(/\.disabled$/i, '').replace(/\.(jar|zip)$/i, '')
  const parts = stem.split(/[-_. ]+/)
  const cut = parts.findIndex(p => /^\d/.test(p))
  const words = (cut > 0 ? parts.slice(0, cut) : parts).filter(Boolean)
  if (words.length === 0) return stem
  return words
    .map(w => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

const normalizeModFilename = (filename: string) => {
  return (filename || '').toLowerCase().trim().replace(/\.disabled$/, '')
}

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

export default function ModsMenu({
  currentVersion,
  opacity = 95,
  autoOpenSettings = false,
  onCloseAutoOpenSettings,
  autoOpenCreate = false,
  onCloseAutoOpenCreate
}: {
  currentVersion: string,
  opacity?: number,
  autoOpenSettings?: boolean,
  onCloseAutoOpenSettings?: () => void,
  autoOpenCreate?: boolean,
  onCloseAutoOpenCreate?: () => void
}) {
  const { t } = useTranslation();
  const [modpacks, setModpacks] = useState<Modpack[]>([])
  const [activeModpack, setActiveModpack] = useState<Modpack | null>(null)
  const [showCreatePage, setShowCreatePage] = useState(false)
  // Создание не мгновенное: OptiFine и фикс скинов качаются. Всё это время
  // страница остаётся на экране с занятой кнопкой, а не исчезает из-под
  // курсора, и второй клик не создаёт дубль.
  const [creatingModpack, setCreatingModpack] = useState(false)
  // Моды из плана ИИ: ставятся сразу после создания сборки.
  // Настройки сборки открываются страницей, а не модальным окном.
  const [showSettingsPage, setShowSettingsPage] = useState(false)
  const [editModpackName, setEditModpackName] = useState('')
  const [editModpackIcon, setEditModpackIcon] = useState('')
  // Вкладка «Установлено» / «Каталог» — вместо двух параллельных списков
  const [activeTab, setActiveTab] = useState<'installed' | 'catalog'>('installed')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [installOptifine, setInstallOptifine] = useState(false)
  const [installElybySkins, setInstallElybySkins] = useState(false)
  const [selectedModForViewer, setSelectedModForViewer] = useState<any>(null)
  const [installedSearchQuery, setInstalledSearchQuery] = useState('')
  const [contextMenuModId, setContextMenuModId] = useState<string | null>(null)
  // Название и иконка из манифеста внутри jar, по имени файла:
  // `{ "worldedit-mod-7.2.15.jar": { name: "WorldEdit", icon: "data:..." } }`
  const [modMeta, setModMeta] = useState<Record<string, { name?: string; icon?: string; version?: string }>>({})

  useEffect(() => {
    const handleClose = () => setContextMenuModId(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

  const [newName, setNewName] = useState('')
  const [newLoader, setNewLoader] = useState('fabric')
  const [newVersion, setNewVersion] = useState((currentVersion && !currentVersion.startsWith('mp:')) ? currentVersion : '1.20.1')

  const [newIcon, setNewIcon] = useState(PRESET_ICONS[0])
  // Pin for the loader version. Empty means "take the latest one",
  // which is exactly what the launcher always did.
  const [newLoaderVersion, setNewLoaderVersion] = useState('')
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])

  const [query, setQuery] = useState('')
  const [projectType, setProjectType] = useState('mod')
  // Источник каталога: у CurseForge другой API, но карточки той же формы.
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
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
    '26.2', '26.1.2', '26.1.1', '26.1',
    '1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    '1.18.2', '1.18.1', '1.18',
    '1.17.1',
    '1.16.5', '1.16.4',
    '1.15.2',
    '1.14.4',
    '1.12.2',
    '1.8.9',
    '1.7.10'
  ]

  // Loader version lists are fetched in Rust: the CSP of the webview
  // allows Modrinth only, meta.fabricmc.net and BMCLAPI are blocked there.
  useEffect(() => {
    if (!showCreatePage) return
    let disposed = false
    setLoaderVersions([])
    // @ts-ignore
    const request = window.electronAPI?.listLoaderVersions?.(newLoader, newVersion)
    if (!request) return
    request
      .then((list: string[]) => {
        if (!disposed) setLoaderVersions(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        // No list came back: only the automatic option remains.
      })
    return () => {
      disposed = true
    }
  }, [showCreatePage, newLoader, newVersion])

  // Load modpacks
  useEffect(() => {
    const load = async () => {
      try {
        // @ts-ignore
        const saved = await window.electronAPI.getModpacks()
        setModpacks(saved || [])
        if (saved && saved.length > 0) {
          const matched = currentVersion && currentVersion.startsWith('mp:')
            ? saved.find((m: any) => m.name === currentVersion.replace('mp:', ''))
            : null;
          selectModpack(matched || saved[0])
        }
      } catch (e) { console.error(e) }
    }
    load()
  }, [])

  useEffect(() => {
    if (autoOpenSettings && activeModpack) {
      setEditModpackName(activeModpack.name);
      setEditModpackIcon(activeModpack.icon || PRESET_ICONS[0]);
      setConfirmDelete(false);
      setShowSettingsPage(true);
      if (onCloseAutoOpenSettings) onCloseAutoOpenSettings();
    }
  }, [autoOpenSettings, activeModpack]);

  useEffect(() => {
    if (autoOpenCreate) {
      const cleanVer = currentVersion.replace(' Forge', '');
      setNewVersion(cleanVer);
      setShowCreatePage(true);
      if (onCloseAutoOpenCreate) onCloseAutoOpenCreate();
    }
  }, [autoOpenCreate, currentVersion]);

  // Refetch when projectType or sort changes
  useEffect(() => {
    if (activeModpack) {
      setOffset(0)
      searchMods(0, false)
    }
  }, [projectType, sort, activeModpack?.name, source])

  const persistModpacks = (updated: Modpack[]) => {
    setModpacks(updated)
    // @ts-ignore
    window.electronAPI.saveModpacks(updated)
  }

  // Свежий список сборок для параллельных установок: замыкание на state
  // отстаёт, а сохранять файл из updater'а нельзя (StrictMode зовёт его дважды).
  const modpacksRef = useRef<Modpack[]>(modpacks)
  useEffect(() => {
    modpacksRef.current = modpacks
  }, [modpacks])

  // Добавление модов в сборку из параллельных загрузок: считаем от свежего
  // списка, иначе два одновременных мода затирают друг друга.
  const mergeInstalledMods = (packName: string, addedMods: any[], removedFiles: string[] = []) => {
    const merge = (list: any[]) => {
      const kept = list.filter((mod: any) => !removedFiles.includes(mod.id))
      const addedNorms = new Set(addedMods.map((mod: any) => normalizeModFilename(mod.id)))
      const filtered = kept.filter((mod: any) => !addedNorms.has(normalizeModFilename(mod.id)))
      return [...filtered, ...addedMods]
    }

    const next = modpacksRef.current.map((pack) =>
      pack.name === packName ? { ...pack, installedMods: merge(pack.installedMods || []) } : pack,
    )
    modpacksRef.current = next
    setModpacks(next)
    // @ts-ignore
    window.electronAPI.saveModpacks(next)

    setActiveModpack((prev) =>
      prev && prev.name === packName ? { ...prev, installedMods: merge(prev.installedMods || []) } : prev,
    )
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
    // Список установленного собирается с диска: папка знает и тип файла
    // (мод, ресурспак, шейдер), и то, что он ещё на месте. Из modpacks.json
    // берутся только данные проекта — по ним каталог помечает «Установлено».
    try {
      // @ts-ignore
      const localMods: { id: string; title: string; type?: string; isLocal?: boolean; isEnabled?: boolean }[] = await window.electronAPI.getInstalledMods(mp.name) || []

      const savedByName = new Map<string, NonNullable<Modpack['installedMods']>[number]>()
      for (const item of mp.installedMods || []) {
    savedByName.set(normalizeModFilename(item.id || item.title), item)
      }

      // Диск — источник правды. Файла нет в папке — нет и строки в списке,
      // файл скопировали руками — строка появляется. Раньше список собирался
      // из modpacks.json, и всё, что не было туда записано (а ресурспаки и
      // шейдеры не записывались), в интерфейсе не показывалось вовсе.
      const installedMods: Modpack['installedMods'] = localMods.map(lm => {
        const saved = savedByName.get(normalizeModFilename(lm.id || lm.title))
        return {
          id: lm.id,
          // Имя файла — идентификатор, а не подпись: сохранённое название
          // проекта важнее, иначе в списке снова «create-1.20.1-0.5.1.f.jar».
          title: saved?.title && saved.title !== saved.id ? saved.title : prettyModName(lm.title || lm.id),
          type: lm.type || 'mod',
          isLocal: saved ? Boolean(saved.isLocal) : true,
          isEnabled: lm.isEnabled !== false,
          projectId: saved?.projectId
        }
      })

      if (JSON.stringify(installedMods) !== JSON.stringify(mp.installedMods)) {
        mp.installedMods = installedMods
        setModpacks(prev => {
          const updated = prev.map(p => p.name === mp.name ? mp : p)
          // @ts-ignore
          window.electronAPI.saveModpacks(updated)
          return updated
        })
      }
    } catch (e) {
      console.error(e)
    }

    setActiveModpack(mp)
    setQuery('')
    setOffset(0)
    loadRecommended(mp, 0, false)
  }

  const closeCreatePage = () => {
    // Пока сборка пишется на диск, назад нельзя: это середина процесса.
    if (creatingModpack) return
    setShowCreatePage(false)
  }

  const createModpack = async () => {
    if (!newName.trim() || creatingModpack) return
    const safeName = newName.replace(/[<>:"/\\|?*]/g, '-')

    // Дубликат имени проверяем до любых действий — иначе перезапишем чужую сборку
    if (modpacks.some(m => m.name === safeName)) {
      showError(t('mods.duplicateName'))
      return
    }

    const shouldInstallOptifine = installOptifine
    const shouldInstallElyby = installElybySkins
    const createdName = safeName
    const createdVersion = newVersion
    const createdLoader = newLoader
    const createdIcon = newIcon
    const createdLoaderVersion = newLoaderVersion

    // Диалог закрывался до начала работы, и весь прогресс уходил в фон.
    setCreatingModpack(true)
    try {

      const initialInstalledMods: { id: string; title: string; type?: string; isEnabled?: boolean; projectId?: string }[] = []

      if (createdLoader === 'forge' && shouldInstallOptifine) {
        try {
          // @ts-ignore
          const result = (await withTimeout(
            window.electronAPI.installOptifine(createdVersion, createdName),
            120000,
            t('mods.optifineTimeout'),
          )) as any
          // Бэкенд возвращает и filenames, и filename — поддерживаем оба варианта
          const files = result.filenames || (result.filename ? [result.filename] : [])
          if (result.status === 'success' && files.length > 0) {
            files.forEach((filename: string) => {
              initialInstalledMods.push({ id: filename, title: filename, type: 'mod', isEnabled: true })
            })
          } else if (result.status === 'error') {
            showError(t('mods.optifineFailed', { error: result.error || t('app.unknownError') }))
          }
        } catch (e: any) {
          // Раньше ошибка молча терялась: сборка создавалась без OptiFine,
          // и пользователь не понимал, почему мода нет в списке.
          console.error(e)
          showError(t('mods.optifineFailed', { error: errorText(e, t('app.unknownError')) }))
        }
      }

      // For Ely.by skins:
      // If Forge with OptiFine, DO NOT install CustomSkinLoader mod as it causes bytecode collision / crash with OptiFine.
      // Instead, hasElybySkins activates native authlib-injector in launch-game!
      let hasElybySkins = false
      if (shouldInstallElyby) {
        hasElybySkins = true
        if (!(createdLoader === 'forge' && shouldInstallOptifine)) {
          try {
            const cslRes: any = await withTimeout(
              // @ts-ignore
              window.electronAPI.downloadMod('customskinloader', createdVersion, createdLoader, createdName),
              120000,
              t('ai.timeout'),
            )
            if (cslRes?.filenames) {
              cslRes.filenames.forEach((fn: string) => {
                  initialInstalledMods.push({ id: fn, projectId: 'customskinloader', title: 'CustomSkinLoader', type: 'mod', isEnabled: true })
              })
            }
          } catch (e) {
            console.error('Failed to install CustomSkinLoader:', e)
          }
        }
      }

      const mp: Modpack = {
        name: safeName,
        loader: createdLoader,
        version: createdVersion,
        loaderVersion: createdLoaderVersion || undefined,
        installedMods: initialInstalledMods,
        icon: createdIcon,
        hasElybySkins: hasElybySkins
      }

      setModpacks(prev => {
        const updated = [...prev, mp]
        // @ts-ignore
        window.electronAPI.saveModpacks(updated)
        return updated
      })
      window.dispatchEvent(new CustomEvent('modpacks-updated'))

      await selectModpack(mp)

      // Форма очищается и закрывается только когда сборка создана и выбрана.
      setNewName('')
      setNewIcon(PRESET_ICONS[0])
      setNewLoaderVersion('')
      setInstallOptifine(false)
      setInstallElybySkins(false)
      setShowCreatePage(false)
    } finally {
      setCreatingModpack(false)
    }
  }

  const saveModpackSettings = async () => {
    if (!activeModpack || !editModpackName.trim()) return
    const safeEditName = editModpackName.replace(/[<>:"/\\|?*]/g, '-')
    const oldName = activeModpack.name

    if (safeEditName !== oldName) {
      try {
        // @ts-ignore
        const res = await window.electronAPI.renameModpackFolder(oldName, safeEditName)
        if (res && res.status === 'error') {
          showError(t('app.renameFolderFailed', { error: res.error || t('app.unknownError') }))
          return
        }
      } catch (e: any) {
        console.error(e)
        showError(t('app.renameFolderFailed', { error: errorText(e, t('app.unknownError')) }))
        return
      }
    }

    setModpacks(prev => {
      const updated = prev.map(mp => {
        if (mp.name === oldName) {
          return { ...mp, name: safeEditName, icon: editModpackIcon }
        }
        return mp
      })
      // @ts-ignore
      window.electronAPI.saveModpacks(updated)
      return updated
    })
    setActiveModpack({ ...activeModpack, name: safeEditName, icon: editModpackIcon })

    if (safeEditName !== oldName) {
      // Сообщаем старое и новое имя: по нему внешние слушатели обновляют выбранную сборку
      window.dispatchEvent(new CustomEvent('modpack-renamed', { detail: { oldName, newName: safeEditName } }))
    }
    window.dispatchEvent(new CustomEvent('modpacks-updated'))
    setShowSettingsPage(false)
  }

  const deleteModpack = async () => {
    if (!activeModpack) return

    try {
      // @ts-ignore
      await window.electronAPI.deleteModpackFolder(activeModpack.name)
    } catch (e) {
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
    setShowSettingsPage(false)
  }

  const searchMods = async (currentOffset = 0, append = false) => {
    if (!activeModpack) return

    if (currentOffset === 0) setLoading(true)
    else setIsFetchingMore(true)

    try {
      // @ts-ignore
      const data = source === 'curseforge'
        ? await window.electronAPI.cfSearch(projectType, query, activeModpack.version, activeModpack.loader, currentOffset, sort, 'all')
        : await window.electronAPI.searchMods(query, activeModpack.loader, activeModpack.version, currentOffset, projectType, sort)
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

  const installMod = async (mod: any, versionId?: string) => {
    if (!activeModpack) return

    // Normalize IDs for state
    const modId = mod.project_id

    setDownloading(prev => ({ ...prev, [modId]: true }))
    try {
      const loader = activeModpack.loader
      // @ts-ignore
      const result = source === 'curseforge'
        ? await window.electronAPI.cfInstallContent(
            mod.project_id,
            projectType,
            activeModpack.version,
            loader,
            activeModpack.name,
            versionId
          )
        : await window.electronAPI.downloadMod(mod.project_id, activeModpack.version, loader, activeModpack.name, projectType, versionId)
      // CurseForge возвращает один файл, Modrinth — список имён.
      const installedNames: string[] = result.filenames || (result.fileName ? [result.fileName] : [])
      const newMods = installedNames.map((name: string, i: number) => ({
        id: name,
        projectId: i === 0 ? modId : undefined,
        // Первый файл — сам проект, у него есть название из каталога.
        // Зависимости подписываем читаемым именем из файла.
        title: i === 0 ? mod.title || mod.name || prettyModName(name) : prettyModName(name),
        type: projectType,
        isEnabled: true
      }))

      // Параллельная установка: состав собираем от свежего списка, а не от
      // замыкания на старом modpacks — иначе моды теряются при гонке.
      mergeInstalledMods(activeModpack.name, newMods)

    } catch (e: any) {
      // Tauri отклоняет invoke строкой, поэтому e.message тут часто undefined
      showError(t('mods.modFailed', { error: errorText(e, t('app.unknownError')) }))
    }
    setDownloading(prev => ({ ...prev, [modId]: false }))
  }

  const openModrinthPage = (mod: any) => {
    const slug = mod.slug || mod.project_id
    if (slug) {
      // @ts-ignore
      window.electronAPI.openExternal(source === 'curseforge'
        ? (mod.page_url || `https://www.curseforge.com/minecraft/${projectType === 'mod' ? 'mc-mods' : projectType === 'resourcepack' ? 'texture-packs' : 'shaders'}/${slug}`)
        : `https://modrinth.com/${projectType}/${slug}`)
    }
  }

  const openOptifinePage = () => {
    // @ts-ignore
    window.electronAPI.openExternal('https://optifine.net/home')
  }

  const isOptifineInstalled = () => {
    return activeModpack?.installedMods.some(m => 
      (m.title && m.title.toLowerCase().includes('optifine')) ||
      (m.id && m.id.toLowerCase().includes('optifine'))
    ) || false
  }

  const installOptifineManually = async () => {
    if (!activeModpack) return
    setDownloading(prev => ({ ...prev, ['optifine']: true }))
    try {
      // @ts-ignore
      const result = await window.electronAPI.installOptifine(activeModpack.version, activeModpack.name)
      // Бэкенд возвращает и filenames, и filename — поддерживаем оба варианта
      const optifineFiles = result.filenames || (result.filename ? [result.filename] : [])
      if (result.status === 'success' && optifineFiles.length > 0) {
        const filteredMods = activeModpack.installedMods.filter(
          m => !((m.title || '').toLowerCase().includes('optifine') || (m.id || '').toLowerCase().includes('optifine'))
        )
        const newMods = optifineFiles.map((name: string) => ({
          id: name,
          title: name,
          type: 'mod',
          isEnabled: true
        }))
        const updatedMp = {
          ...activeModpack,
          installedMods: [...filteredMods, ...newMods]
        }
        setActiveModpack(updatedMp)
        const updatedAll = modpacks.map(m => m.name === updatedMp.name ? updatedMp : m)
        persistModpacks(updatedAll)
      } else if (result.status === 'error') {
        showError(t('mods.optifineFailed', { error: result.error || t('app.unknownError') }))
      }
    } catch (e: any) {
      // Tauri отклоняет invoke строкой, а не Error — берём текст из любого вида
      showError(t('mods.optifineFailed', { error: errorText(e, t('app.unknownError')) }))
    }
    setDownloading(prev => ({ ...prev, ['optifine']: false }))
  }

  const isInstalled = (mod: any) => {
    const modId = mod?.project_id
    const slug = mod?.slug
    return activeModpack?.installedMods.some(m => 
      (modId && (m.projectId === modId || m.id === modId)) ||
      (slug && (m.projectId === slug || m.id === slug)) ||
      (m.title && modId && m.title.toLowerCase().includes(modId.toLowerCase()))
    ) || false
  }

  // Helpers to normalize Modrinth data
  const getModId = (mod: any) => mod.project_id
  const getModIcon = (mod: any) => mod.icon_url || PROJECT_FALLBACK_ICON
  const getModTitle = (mod: any) => mod.title
  const getModDesc = (mod: any) => mod.description
  const getModDate = (mod: any) => {
    const d = mod.date_modified
    if (!d) return '01.01.2023'
    const date = new Date(d)
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`
  }

  // Метаданные установленных модов: настоящее название, версия и иконка
  // читаются из манифеста внутри jar. Список пересобирается при смене сборки
  // и после добавления/удаления файлов.
  //
  // Читаем пачками по несколько файлов: разбор сотни jar одним запросом
  // подвешивал окно на несколько секунд (чтение zip + base64 в одном IPC).
  // Между пачками отдаём кадр браузеру, поэтому иконки «дотекают» постепенно,
  // а список с кнопками остаётся отзывчивым.
  const installedList = activeModpack?.installedMods
  useEffect(() => {
    const packName = activeModpack?.name
    const files = (installedList || []).map(m => m.id || m.title).filter(Boolean)

    if (!packName || files.length === 0) {
      setModMeta({})
      return
    }

    let cancelled = false
    setModMeta({})

    const loadInBatches = async () => {
      const BATCH = 6
      for (let i = 0; i < files.length; i += BATCH) {
        if (cancelled) return
        const batch = files.slice(i, i + BATCH)
        try {
          // @ts-ignore
          const res = await window.electronAPI.getModsMetadata(packName, batch)
          if (cancelled) return
          const items: any[] = res?.items || []
          if (items.length > 0) {
            setModMeta(prev => {
              const next = { ...prev }
              for (const item of items) {
                next[normalizeModFilename(item.file)] = item
              }
              return next
            })
          }
        } catch {
          // Один битый jar не должен останавливать загрузку остальных.
        }
        // Отдаём кадр: без паузы пачки идут подряд и окно всё равно дёргается.
        await new Promise(resolve => setTimeout(resolve, 16))
      }
    }

    loadInBatches()

    return () => {
      cancelled = true
    }
  }, [activeModpack?.name, installedList])

  // Перетаскивание файлов в окно.
  //
  // В WebView2 файловые drop-события до страницы не доходят: их забирает Tauri
  // и отдаёт только пути через `onDragDropEvent`. Поэтому HTML5-обработчики
  // onDrop/onDragOver ниже по коду сами по себе не срабатывают — слушаем
  // нативное событие. Значения берём из ref'ов: подписка одна на всё время
  // жизни экрана, а сборку и колбэк перезагрузки списка они отдают свежими.
  const activeModpackRef = useRef<Modpack | null>(null)
  activeModpackRef.current = activeModpack
  const reloadModpackRef = useRef(selectModpack)
  reloadModpackRef.current = selectModpack
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    const isModFile = (path: string) => {
      const lower = path.toLowerCase()
      return lower.endsWith('.jar') || lower.endsWith('.zip')
    }

    Promise.resolve(
      getCurrentWebview().onDragDropEvent(async (event) => {
        const payload: any = event.payload

        if (payload.type === 'enter' || payload.type === 'over') {
          setDragActive((payload.paths || []).some(isModFile))
          return
        }
        if (payload.type === 'leave') {
          setDragActive(false)
          return
        }
        if (payload.type !== 'drop') return

        setDragActive(false)
        const paths: string[] = (payload.paths || []).filter(isModFile)
        const mp = activeModpackRef.current
        if (!mp || paths.length === 0) return

        try {
          // @ts-ignore
          const result = await window.electronAPI.importModPaths(paths, mp.name)
          const imported: string[] = result?.imported || []
          const rejected: string[] = result?.rejected || []

          if (imported.length > 0) {
            await reloadModpackRef.current(mp)
          }
          if (rejected.length > 0) {
            showError(t('mods.droppedRejected', { files: rejected.join(', ') }))
          }
        } catch (e: any) {
          showError(t('mods.droppedFailed', { error: errorText(e, t('app.unknownError')) }))
        }
      })
    )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {
        // Не Tauri (например, браузер при разработке) — остаются HTML5-обработчики.
      })

    return () => {
      disposed = true
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  // Карточка OptiFine рисуется сама, без результатов поиска: пустой каталог
  // с ней — это не «ничего не найдено», поэтому надпись показываем отдельно.
  const showOptifineCard = projectType === 'mod' && activeModpack?.loader === 'forge'
    && offset === 0 && (!query || query.toLowerCase().includes('opti'))
  const catalogIsEmpty = !loading && !isFetchingMore && results.length === 0 && !showOptifineCard

  return (
    <div className="mods-menu">
      {dragActive && (
        <div className="mods-drop-overlay">
          <div className="mods-drop-overlay-inner">
            <Package size={22} />
            <span>{t('mods.dropHint')}</span>
          </div>
        </div>
      )}
      {/* Шапка сборки: контекст сверху, одно главное действие справа */}
      <div className="mods-header">
        <div className="mods-pack">
          <div className="mods-pack-icon">
            <img src={activeModpack?.icon || PRESET_ICONS[0]} alt="" />
          </div>
          <div className="mods-pack-info">
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
              style={{ minWidth: '220px' }}
            />
            {/* Строка «FORGE · 1.20.1 · N файлов» из шапки убрана: загрузчик и
                версия видны в лаунчере над кнопкой ИГРАТЬ, а счётчик файлов
                менялся на глазах и только шумел. Подсказку оставляем, пока
                сборка не выбрана. */}
            {!activeModpack && (
              <div className="mods-pack-meta">{t("mods.createOrSelect")}</div>
            )}
          </div>
          {activeModpack && (
            <button
              className="mods-icon-btn"
              title={t("mods.modpackSettings")}
              onClick={() => {
                setEditModpackName(activeModpack.name)
                setEditModpackIcon(activeModpack.icon || PRESET_ICONS[0])
                setConfirmDelete(false)
                setShowSettingsPage(true)
              }}
            >
              <Settings size={18} />
            </button>
          )}
        </div>

        <div className="mods-header-actions">
          <button className="mods-btn-primary" onClick={() => setShowCreatePage(true)}>
            <Plus size={14} /> {t("mods.create")}
          </button>
        </div>
      </div>

      {/* Установленное и каталог — вкладки, а не две колонки одновременно */}
      <div className="mods-tabs">
        <button
          className={`mods-tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          <span className="mods-tab-text">{t("mods.tabInstalled")}</span>
          <span className="mods-count">{activeModpack?.installedMods.length || 0}</span>
        </button>
        <button
          className={`mods-tab ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          <span className="mods-tab-text">{t("mods.catalog")}</span>
        </button>
        <div className="mods-tabs-meta">
          {activeModpack ? `${activeModpack.loader.toUpperCase()} · ${activeModpack.version}` : ''}
        </div>
      </div>

      {/* Одна панель поиска для активной вкладки */}
      <div className="mods-toolbar">
        {activeTab === 'installed' ? (
          <div className="mods-search">
            <Search size={14} color="#777" />
            <input
              type="text"
              placeholder={t("mods.searchInstalled")}
              value={installedSearchQuery}
              onChange={e => setInstalledSearchQuery(e.target.value)}
              disabled={!activeModpack}
            />
            {installedSearchQuery && (
              <button className="mods-search-clear" onClick={() => setInstalledSearchQuery('')} title={t('ui.clear')}>×</button>
            )}
          </div>
        ) : (
          <>
            <div className="mods-search">
              <Search size={14} color="#777" />
              <input
                type="text"
                placeholder={t("mods.search")}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
                disabled={!activeModpack}
              />
            </div>
            <div className="mc-source-switch" role="group" aria-label={t('mods.source')}>
              <button
                type="button"
                className={source === 'modrinth' ? 'on' : ''}
                disabled={!activeModpack}
                onClick={() => setSource('modrinth')}
              >
                {t('mods.sourceModrinth')}
              </button>
              <button
                type="button"
                className={source === 'curseforge' ? 'on' : ''}
                disabled={!activeModpack}
                onClick={() => setSource('curseforge')}
              >
                {t('mods.sourceCurseforge')}
              </button>
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
          </>
        )}
      </div>

      {/* Содержимое активной вкладки */}
      {activeTab === 'installed' ? (
        <div
          className="mods-installed"
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
            let added = 0
            let rejected = 0

            for (const file of files) {
              // Перетаскивать можно только моды (.jar), остальное игнорируем
              if (!file.name.toLowerCase().endsWith('.jar')) {
                rejected++
                continue
              }
              try {
                const buffer = await file.arrayBuffer()
                // @ts-ignore
                const result = await window.electronAPI.importModFile(file.name, buffer, activeModpack.name)
                if (result && (result.status === 'ok' || result.status === 'success')) {
                  added++
                }
              } catch (err) {
                console.error('Failed to import file:', err)
              }
            }

            if (rejected > 0) {
              showError(t('mods.onlyJarAllowed'))
            }

            if (added > 0) {
              // Обновляем список установленных через повторное чтение сборки
              await selectModpack(activeModpack)
              showOk(t('mods.droppedAdded', { count: added }))
            }
          }}
        >
          {!activeModpack ? (
            <div className="mods-empty">
              <Package size={40} />
              <p>{t("mods.createOrSelect")}</p>
              <button className="mods-btn-ghost" onClick={() => setShowCreatePage(true)}>
                <Plus size={14} /> {t("mods.create")}
              </button>
            </div>
          ) : (
            (() => {
              const search = installedSearchQuery.toLowerCase()
              const visible = activeModpack.installedMods.filter(m => {
                // Искать надо и по настоящему названию: имя файла игрок не помнит.
                  const meta = modMeta[normalizeModFilename(m.id || m.title)]
                return (
                  (m.title || '').toLowerCase().includes(search) ||
                  (meta?.name || '').toLowerCase().includes(search)
                )
              })

              if (visible.length === 0) {
                return (
                  <div className="mods-empty">
                    <Package size={36} />
                    <p>{activeModpack.installedMods.length === 0 ? t("mods.empty") : t("mods.nothingFound")}</p>
                  </div>
                )
              }

              // Категории идут в одном порядке: моды, ресурспаки, шейдеры.
              // Пустые разделы не рисуются, поэтому список не пухнет заголовками.
              const categories = [
                { type: 'mod', label: t('mods.mods') },
                { type: 'resourcepack', label: t('mods.resourcepacks') },
                { type: 'shader', label: t('mods.shaders') },
              ]

              const renderRow = (m: any) => {
                const enabled = m.isEnabled !== false
                const local = Boolean(m.isLocal) || !m.projectId
                // Иконка и имя из jar; если манифеста нет — прежняя буква.
                            const meta = modMeta[normalizeModFilename(m.id || m.title)]
                const displayName = meta?.name || m.title
                return (
                  <div key={m.id} className={`mods-row ${enabled ? '' : 'disabled'}`}>
                    <div className="mods-row-icon">
                      {meta?.icon ? (
                        <IconImg src={meta.icon} loading="lazy" />
                      ) : (
                        (displayName || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="mods-row-info">
                      <div className="mods-row-name" title={m.title}>{displayName}</div>
                      <div className="mods-row-meta">
                        {m.type === 'resourcepack'
                          ? t('mods.resourcepacks')
                          : m.type === 'shader'
                            ? t('mods.shaders')
                            : t('mods.mods')}
                        {' · '}
                        {local ? t('mods.localFile') : activeModpack.loader.toUpperCase()}
                        {meta?.version ? ` · ${meta.version}` : ''}
                      </div>
                    </div>
                    <button
                      className={`mods-switch ${enabled ? 'on' : ''}`}
                      title={enabled ? t('mods.disable') : t('mods.enable')}
                      aria-pressed={enabled}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          // @ts-ignore
                            await window.electronAPI.toggleMod(m.id || m.title, activeModpack.name, !enabled);
                          const updatedMp = {
                            ...activeModpack,
                            installedMods: activeModpack.installedMods.map(mod =>
                              (mod.id === m.id || normalizeModFilename(mod.id) === normalizeModFilename(m.id))
                                ? { ...mod, isEnabled: !enabled }
                                : mod
                            )
                          };
                          setActiveModpack(updatedMp);
                          const updatedAll = modpacks.map(mp => mp.name === updatedMp.name ? updatedMp : mp);
                          persistModpacks(updatedAll);
                        } catch (err) { console.error(err) }
                      }}
                    >
                      <span />
                    </button>
                    <button
                      className="mods-row-delete"
                      title={t('app.delete')}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          // @ts-ignore
                            await window.electronAPI.uninstallMod(m.id || m.title, activeModpack.name);
                          const updatedMp = {
                            ...activeModpack,
                            installedMods: activeModpack.installedMods.filter(
                              mod => mod.id !== m.id && normalizeModFilename(mod.id) !== normalizeModFilename(m.id)
                            )
                          };
                          setActiveModpack(updatedMp);
                          const updatedAll = modpacks.map(mp => mp.name === updatedMp.name ? updatedMp : mp);
                          persistModpacks(updatedAll);
                        } catch (err) { console.error(err) }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              }

              return (
                <div className="mods-list">
                  {categories.map(category => {
                    const items = visible.filter(m => (m.type || 'mod') === category.type)
                    if (items.length === 0) return null
                    return (
                      <section key={category.type} className="mods-section">
                        <div className="mods-section-head">
                          <span className="mods-section-title">{category.label}</span>
                          <span className="mods-section-count">{items.length}</span>
                        </div>
                        {items.map(m => renderRow(m))}
                      </section>
                    )
                  })}
                </div>
              )
            })()
          )}

          {activeModpack && (
            <div className="mods-dropzone">
              <span>{t("mods.dropHint")}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mods-grid" onScroll={handleScroll} ref={listRef}>
          {!activeModpack ? (
            <div className="mods-empty" style={{ gridColumn: '1 / -1' }}>
              <Package size={48} />
              <p>{t("mods.createOrSelect")}</p>
            </div>
          ) : loading ? (
            <CardSkeletons count={6} />
          ) : (
            <>
              {showOptifineCard && (
                <div className="mc-card mc-mod-card">
                  <ProjectArt icon="https://optifine.net/favicon.ico" />
                  <div className="mc-card-body">
                    <div className="mc-card-header">
                      <img src="https://optifine.net/favicon.ico" alt="icon" className="mc-card-icon" style={{ background: 'white' }} />
                      <div className="mc-card-title-area">
                        <div className="mc-card-heading">
                          <span className="mc-card-title">OptiFine</span>
                          <span className="mc-card-author">{t('mods.fromOptifine')}</span>
                        </div>
                      </div>
                      <button className="mc-card-more" onClick={openOptifinePage}>•••</button>
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
                        <button className="mc-card-btn installed" disabled>{t("mods.isInstalled")}</button>
                      ) : downloading['optifine'] ? (
                        <button className="mc-card-btn" disabled>...</button>
                      ) : (
                        <button className="mc-card-btn" onClick={() => installOptifineManually()}>{t("mods.install")}</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {results.map((mod: any) => (
                <div key={getModId(mod)} className="mc-card mc-mod-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedModForViewer(mod)}>
                  <ProjectArt project={mod} />
                  <div className="mc-card-body">
                    <div className="mc-card-header">
                      <img
                        src={getModIcon(mod)}
                        alt="icon"
                        className="mc-card-icon"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = PROJECT_FALLBACK_ICON }}
                      />
                      <div className="mc-card-title-area">
                        <div className="mc-card-heading">
                          <span className="mc-card-title">{getModTitle(mod)}</span>
                          {/* Автор проекта: предлог берётся из языка лаунчера. */}
                      <span className="mc-card-author">{t('mods.byAuthor', { author: mod.author || 'Modrinth' })}</span>
                        </div>
                      </div>
                      <button className="mc-card-more" onClick={(e) => { e.stopPropagation(); openModrinthPage(mod); }}>•••</button>
                    </div>

                    <div className="mc-card-desc">
                      {getModDesc(mod)}
                    </div>

                    <div className="mc-card-categories">
                      {mod.display_categories?.slice(0, 3).map((cat: string) => (
                        <img key={cat} src={getCategoryIcon(cat)} className="mc-card-cat-icon" title={cat} />
                      ))}
                    </div>

                    <div className="mc-card-footer" onClick={e => e.stopPropagation()}>
                      <div className="mc-card-meta">
                        <span>↓ {formatCount(mod.downloads)} dl</span>
                        <span>≡ {getModDate(mod)}</span>
                      </div>
                      {isInstalled(mod) ? (
                        <button className="mc-card-btn installed" disabled>{t("mods.isInstalled")}</button>
                      ) : downloading[getModId(mod)] ? (
                        <button className="mc-card-btn" disabled>...</button>
                      ) : (
                        <button className="mc-card-btn" onClick={() => installMod(mod)}>{t("mods.install")}</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {catalogIsEmpty && (
                <div className="mods-empty" style={{ gridColumn: '1 / -1' }}>
                  <Package size={36} />
                  <p>{t("mods.nothingFound")}</p>
                </div>
              )}
              {isFetchingMore && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#aaa' }}>{t("mods.loadMore")}</div>}
            </>
          )}
        </div>
      )}
      {/* Создание сборки — отдельная страница по образцу раскрытой
          карточки мода: стрелка назад, вкладки, главное действие в шапке. */}
      {showCreatePage && (
        <ModpackCreatePage
          name={newName}
          onNameChange={setNewName}
          loader={newLoader}
          onLoaderChange={setNewLoader}
          version={newVersion}
          onVersionChange={setNewVersion}          loaderVersion={newLoaderVersion}
          onLoaderVersionChange={setNewLoaderVersion}
          loaderVersions={loaderVersions}
          gameVersions={gameVersions}
          icon={newIcon}
          onIconChange={setNewIcon}
          installOptifine={installOptifine}
          onInstallOptifineChange={setInstallOptifine}
          installElyby={installElybySkins}
          onInstallElybyChange={setInstallElybySkins}
          creating={creatingModpack}
          onCreate={createModpack}
          onClose={closeCreatePage}
        />
      )}

      {/* Настройки выбранной сборки — такая же страница, как создание:
          рельса «назад», секции и подвал вместо модального окна. */}
      {showSettingsPage && activeModpack && (
        <ModpackSettingsPage
          name={editModpackName}
          onNameChange={setEditModpackName}
          icon={editModpackIcon}
          onIconChange={setEditModpackIcon}
          version={activeModpack.version || ''}
          loader={activeModpack.loader || ''}
          modsCount={activeModpack.installedMods?.length || 0}
          onSave={saveModpackSettings}
          onDelete={deleteModpack}
          onClose={() => setShowSettingsPage(false)}
        />
      )}

      {/* Mod Viewer Modal */}
      {selectedModForViewer && (
        <ModViewer
          mod={selectedModForViewer}
          activeModpack={activeModpack}
          onClose={() => setSelectedModForViewer(null)}
          onInstall={installMod}
          isInstalled={isInstalled(selectedModForViewer)}
          isDownloading={!!downloading[getModId(selectedModForViewer)]}
        />
      )}
    </div>
  )
}
