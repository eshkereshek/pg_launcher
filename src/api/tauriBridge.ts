import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const tauriBridge = {
  getVersions: () => invoke('get_versions'),
  launchGame: (options: any) => invoke('launch_game', { options }),
  // Horizon (Rust-версия Minecraft): статус установки и отдельный запуск.
  horizonStatus: () => invoke<{ installed: boolean; prepared: boolean; tag: string | null; gameVersion: string | null; running: boolean }>('horizon_status'),
  launchHorizon: (options: any) => invoke('launch_horizon', { options }),
  getModpacks: () => invoke('get_modpacks'),
  saveModpacks: (modpacks: any) => invoke('save_modpacks', { modpacks }),
  getAccounts: () => invoke('get_accounts'),
  saveAccounts: (accounts: any) => invoke('save_accounts', { accounts }),
  authMicrosoft: () => invoke('auth_microsoft'),
  authElyby: (email: string, pass: string) => invoke('auth_elyby', { email, password: pass }),
  openFolder: (instanceId?: string) => invoke('open_folder', { instanceId }),
  clearCache: () => invoke('clear_cache'),
  getSystemInfo: () => invoke('get_system_info'),
  readLocalImage: (filePath: string) => invoke('read_local_image', { filePath }),
  fetchImageData: (url: string) => invoke('fetch_image_data', { url }),
  getElybySkin: (username: string) => invoke('get_elyby_skin', { username }),
  logSkinDebug: (msg: string) => invoke('log_skin_debug', { msg }),
  // Каталог серверов Modrinth (тип проекта minecraft_java_server).
  searchServers: (query = '', offset = 0, category = 'all', version = 'all', sort = 'follows') =>
    invoke('search_modrinth_servers', { query, offset, category, version, sort }),
  getServer: (slug: string) => invoke('get_modrinth_server', { slug }),
  importModFile: (fileName: string, buffer: ArrayBuffer, instanceId?: string) =>
    invoke('import_mod_file', { fileName, buffer: Array.from(new Uint8Array(buffer)), instanceId }),
  importModPaths: (paths: string[], instanceId: string) =>
    invoke<{ status: string; imported: string[]; rejected: string[] }>('import_mod_paths', { paths, instanceId }),
  searchMods: (query: string, loader: string, version: string, offset = 0, projectType = 'mod', sort = 'relevance') =>
    invoke('search_mods', { query, loader, version, offset, projectType, sort }),
  getPopularMods: (loader: string, version: string, offset = 0) =>
    invoke('get_popular_mods', { loader, version, offset }),
  getPopularModpacks: (version?: string, offset = 0, category = 'all', loader = 'all', sort = 'downloads') =>
    invoke('get_popular_modpacks', { version: version || null, offset, category, loader, sort }),
  searchModpacks: (query: string, version?: string, offset = 0, category = 'all', loader = 'all', sort = 'relevance') =>
    invoke('search_modpacks', { query, version: version || null, offset, category, loader, sort }),
  // CurseForge: каталог, версии, установка контента и сборок, импорт с диска.
  // ИИ-сборщик: модель отдаёт план, моды в нём уже подобраны по Modrinth.
  aiStatus: () => invoke('ai_status'),
  aiPlan: (request: string, gameVersion: string, loader: string, count = 20) =>
    invoke('ai_plan', { request, gameVersion, loader, count }),
  // Чат сборок: ответ на вопрос, заказ новой сборки (pack) или правка
  // последней сборки чата (edit) — контекст передаём в pack.
  aiAssistant: (
    message: string,
    history: Array<{ role: string; content: string }> = [],
    pack: any = null,
  ) =>
    invoke<{
      kind: 'chat' | 'pack' | 'edit'
      answer?: string
      name?: string
      add?: any[]
      remove?: string[]
      unresolved?: string[]
    }>('ai_assistant', { message, history, pack }),
  // Отзыв модели о готовой сборке.
  aiPackComment: (pack: any) => invoke<{ comment: string }>('ai_pack_comment', { pack }),

  // ── Память и бэкапы ──────────────────────────────────────────────
  memoryStats: () =>
    invoke<{
      systemTotalMb: number
      systemFreeMb: number
      launcherRssMb: number
      disk: { versions: number; assets: number; libraries: number; logs: number; backups: number; launcher: number }
      backups: Array<{ name: string; sizeMb: number; created: number }>
    }>('memory_stats'),
  // Перенос всех данных лаунчера (включая AppData) на другой диск.
  moveDataDir: (target: string) =>
    invoke<{ dataDir: string; movedMb: number; removedOld: boolean; oldDir: string }>(
      'move_data_dir',
      { target },
    ),
  // Перезапуск после переноса: путь данных применён к новым процессам.
  restartLauncher: () => invoke('restart_launcher'),
  listInstances: () =>
    invoke<Array<{ name: string; kind: 'version' | 'pack'; hasSaves: boolean }>>('list_instances'),
  createBackup: (instanceId: string, keep = 3) =>
    invoke<{ name: string; backups: Array<{ name: string; sizeMb: number; created: number }> }>(
      'create_backup',
      { instanceId, keep },
    ),
  restoreBackup: (name: string, instanceId: string) =>
    invoke('restore_backup', { name, instanceId }),
  deleteBackup: (name: string) =>
    invoke<{ backups: Array<{ name: string; sizeMb: number; created: number }> }>('delete_backup', { name }),  // Разбор краша: ИИ называет виноватый мод и предлагает удалить/отключить/доставить.
  aiDiagnoseCrash: (crashLog: string, instanceId: string | null, gameVersion: string, loader: string) =>
    invoke<{
      action: 'remove' | 'disable' | 'install' | 'other'
      file: string | null
      title: string | null
      reason: string
      explain: string
      missing: Array<{
        project_id?: string
        title?: string
        icon_url?: string
        description?: string
        query?: string
      }>
    }>('ai_diagnose_crash', { crashLog, instanceId, gameVersion, loader }),  // История чатов ИИ-сборщика: файл в папке лаунчера.
  aiHistory: () => invoke('ai_history_load'),
  aiSaveHistory: (chats: any[]) => invoke('ai_history_save', { chats }),  // Сессия Ely.by: проверка и обновление токена перед запуском игры.
  authElybyValidate: (accessToken: string) => invoke('auth_elyby_validate', { accessToken }),
  authElybyRefresh: (accessToken: string, clientToken: string) =>
    invoke('auth_elyby_refresh', { accessToken, clientToken }),  cfSearch: (kind: string, query: string, gameVersion: string, loader: string, offset = 0, sort = 'relevance', category = 'all') =>
    invoke('cf_search', { kind, query, gameVersion: gameVersion || '', loader: loader || 'all', offset, sort, category }),
  cfCategories: (kind: string) => invoke('cf_categories', { kind }),
  cfProject: (projectId: string) => invoke('cf_project', { projectId }),
  cfVersions: (projectId: string, gameVersion: string, loader: string) =>
    invoke('cf_versions', { projectId, gameVersion: gameVersion || '', loader: loader || 'all' }),
  cfInstallContent: (projectId: string, kind: string, gameVersion: string, loader: string, instanceId: string, versionId?: string) =>
    invoke('cf_install_content', { projectId, kind, gameVersion, loader, instanceId, versionId: versionId || null }),
  cfInstallModpack: (projectId: string, versionId: string | null, modpackName: string, gameVersion: string, loader: string) =>
    invoke('cf_install_modpack', { projectId, versionId, packName: modpackName, gameVersion, loader }),
  cfDetectPacks: (extraPaths?: string[]) => invoke('cf_detect_packs', { extraPaths: extraPaths || null }),
  cfImportPack: (sourcePath: string, name: string, gameVersion: string, loader: string) =>
    invoke('cf_import_pack', { sourcePath, name, gameVersion, loader }),  downloadMod: (projectId: string, version: string, loader: string, instanceId: string, projectType = 'mod', versionId?: string) =>
    invoke('download_mod', { projectId, version, loader, instanceId, projectType, versionId }),
  uninstallMod: (filename: string, instanceId: string) =>
    invoke('uninstall_mod', { filename, instanceId }),
  toggleMod: (filename: string, instanceId: string, enable: boolean) =>
    invoke('toggle_mod', { filename, instanceId, enable }),
  deleteModpackFolder: (instanceId: string) =>
    invoke('delete_modpack_folder', { instanceId }),
  renameModpackFolder: (oldName: string, newName: string) =>
    invoke('rename_modpack_folder', { oldName, newName }),
  getInstalledMods: (instanceId: string) =>
    invoke('get_installed_mods', { instanceId }),
  getModsMetadata: (instanceId: string, files?: string[]) =>
    invoke<{ items: { file: string; name?: string; modId?: string; version?: string; icon?: string }[] }>(
      'get_mods_metadata',
      { instanceId, files }
    ),
  installOptifine: (gameVersion: string, instanceId: string) =>
    invoke('install_optifine', { gameVersion, instanceId }),
  // Loader versions come from Rust: the webview CSP blocks those hosts.
  listLoaderVersions: (loader: string, gameVersion: string) =>
    invoke<string[]>('list_loader_versions', { loader, gameVersion }),
  selectSkinFile: () => invoke('select_skin_file'),
  selectIconFile: () => invoke('select_icon_file'),
  getSkins: () => invoke('get_skins'),
  saveSkin: (filePath: string) => invoke('save_skin', { filePath }),
  deleteSkin: (skinId: string) => invoke('delete_skin', { skinId }),
  equipElybySkin: (skinPath: string, token: string) =>
    invoke('equip_elyby_skin', { skinPath, token }),
  // versionId — конкретный релиз из вкладки «Версии»; пусто = брать по игре и
  // загрузчику. Так можно поставить старую версию сборки.
  installModpack: (projectId: string, gameVersion: string, loader: string, modpackName: string, versionId = '') =>
    invoke('install_modpack', { projectId, gameVersion, loader, modpackName, versionId }),
  // Описание переводит Rust: connect-src в CSP разрешает странице только
  // Modrinth и ely.by, так что fetch провайдера из вебвью был бы заблокирован.
  translateText: (text: string, target = 'ru') =>
    invoke<{ text: string; provider: string; truncated: boolean; already_target: boolean }>(
      'translate_text',
      { text, target },
    ),

  onLaunchProgress: (callback: (msg: string) => void) =>
    listen<string>('launch-progress', (event) => callback(event.payload)),
  onDownloadUpdate: (callback: (data: { id: string; name: string; text: string; progress: number }) => void) =>
    listen<{ id: string; name: string; text: string; progress: number }>('download-update', (event) => callback(event.payload)),
  onDownloadFinish: (callback: (id: string) => void) =>
    listen<string>('download-finish', (event) => callback(event.payload)),
  // Окно игры реально создано: до этого события запуск ещё идёт.
  onGameReady: (callback: () => void) =>
    listen('game-ready', () => callback()),
  // Прогресс машинного перевода: { done, total } по переведённым кускам.
  onTranslateProgress: (callback: (data: { done: number; total: number }) => void) =>
    listen<{ done: number; total: number }>('translate-progress', (event) => callback(event.payload)),
  onGameClosed: (callback: () => void) =>
    listen('game-closed', () => callback()),
  onGameCrashed: (callback: (log: string) => void) =>
    listen<string>('game-crashed', (event) => callback(event.payload)),

  windowMinimize: () => invoke('window_minimize'),
  windowMaximize: () => invoke('window_maximize'),
  windowClose: () => invoke('window_close'),
  windowHide: () => invoke('window_hide'),
  windowShow: () => invoke('window_show'),
  openExternal: (url: string) => invoke('open_external', { url }),

  isInstallerSync: () => null,
  isInstaller: () => invoke<boolean>('is_installer'),
  selectFolder: (defaultPath?: string) => invoke('select_folder', { defaultPath }),
  getDefaultInstallPath: () => invoke('get_default_install_path'),
  installApp: (targetPath: string) => invoke('install_app', { targetPath }),
  createShortcuts: (targetPath: string, desktop?: boolean, startMenu?: boolean) =>
    invoke('create_shortcuts', { targetPath, desktop, startMenu }),
  launchInstalled: (targetPath: string) => invoke('launch_installed', { targetPath }),
  // Прошлая установка (папка лаунчера + папка данных): по ней установщик
  // делает тихое обновление вместо мастера.
  getExistingInstall: () =>
    invoke<{ installDir: string; dataDir: string } | null>('get_existing_install'),
  checkIsInstalled: (targetPath: string) => invoke('check_is_installed', { targetPath }),
  uninstallApp: (targetPath: string) => invoke('uninstall_app', { targetPath }),

  updateDiscordPresence: (presence: any) => invoke('update_discord_presence', { presence }),

  checkUpdates: () => invoke('check_updates'),
  downloadAndRunUpdate: (url: string) => invoke('download_and_run_update', { url }),
  onUpdateProgress: (callback: (progress: number) => void) =>
    listen<number>('update-progress', (event) => callback(event.payload)),

  getSettings: () => invoke('get_settings'),
  // Язык / размер интерфейса / нарратор из options.txt сборки (или .minecraft).
  readGameOptions: (instanceId?: string) =>
    invoke('read_game_options', { instanceId: instanceId ?? null }),
  saveSettings: (settings: any) => invoke('save_settings', { settings }),
  resetSettings: () => invoke('reset_settings'),

  getInstalledJavas: () => invoke('get_installed_javas'),
  installJava: (version: string) => invoke('install_java', { version }),
  cleanUninstallJava: () => invoke('clean_uninstall_java'),
  onJavaInstallProgress: (callback: (data: { version: string; status: string; progress: number }) => void) =>
    listen<{ version: string; status: string; progress: number }>('java-install-progress', (event) => callback(event.payload)),
}

export function initTauriBridge() {
  // @ts-ignore
  window.electronAPI = tauriBridge
}
