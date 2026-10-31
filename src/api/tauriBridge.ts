import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const tauriBridge = {
  getVersions: () => invoke('get_versions'),
  launchGame: (options: any) => invoke('launch_game', { options }),
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
  downloadMod: (projectId: string, version: string, loader: string, instanceId: string, projectType = 'mod', versionId?: string) =>
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
