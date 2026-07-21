import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getVersions: () => ipcRenderer.invoke('get-versions'),
  launchGame: (options: any) => ipcRenderer.invoke('launch-game', options),
  getModpacks: () => ipcRenderer.invoke('get-modpacks'),
  saveModpacks: (modpacks: any) => ipcRenderer.invoke('save-modpacks', modpacks),
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccounts: (accounts: any) => ipcRenderer.invoke('save-accounts', accounts),
  authMicrosoft: () => ipcRenderer.invoke('auth-microsoft'),
  authElyby: (e: string, p: string) => ipcRenderer.invoke('auth-elyby', e, p),
  authPgsync: (e: string, p: string) => ipcRenderer.invoke('auth-pgsync', e, p),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  readLocalImage: (filePath: string) => ipcRenderer.invoke('read-local-image', filePath),
  searchServers: (page: number, region?: string) => ipcRenderer.invoke('search-servers', page, region),
  importModFile: (fileName: string, buffer: ArrayBuffer, instanceId?: string) => ipcRenderer.invoke('import-mod-file', fileName, buffer, instanceId),
  searchMods: (query: string, loader: string, version: string, offset?: number, projectType?: string, sort?: string) => ipcRenderer.invoke('search-mods', query, loader, version, offset || 0, projectType || 'mod', sort || 'relevance'),
  getPopularMods: (loader: string, version: string, offset?: number) => ipcRenderer.invoke('get-popular-mods', loader, version, offset || 0),
  searchCurseforgeMods: (query: string, loader: string, version: string, offset?: number) => ipcRenderer.invoke('search-curseforge-mods', query, loader, version, offset || 0),
  getPopularModpacks: (loader: string, version: string, offset?: number) => ipcRenderer.invoke('get-popular-modpacks', loader, version, offset || 0),
  searchModpacks: (query: string, version?: string, offset?: number) => ipcRenderer.invoke('search-modpacks', query, version, offset || 0),
  downloadMod: (projectId: string, version: string, loader: string, instanceId: string, projectType?: string) => ipcRenderer.invoke('download-mod', projectId, version, loader, instanceId, projectType || 'mod'),
  uninstallMod: (filename: string, instanceId: string) => ipcRenderer.invoke('uninstall-mod', filename, instanceId),
  toggleMod: (filename: string, instanceId: string, enable: boolean) => ipcRenderer.invoke('toggle-mod', filename, instanceId, enable),
  deleteModpackFolder: (instanceId: string) => ipcRenderer.invoke('delete-modpack-folder', instanceId),
  renameModpackFolder: (oldName: string, newName: string) => ipcRenderer.invoke('rename-modpack-folder', oldName, newName),
  getInstalledMods: (instanceId: string) => ipcRenderer.invoke('get-installed-mods', instanceId),
  installOptifine: (gameVersion: string, instanceId: string) => ipcRenderer.invoke('install-optifine', gameVersion, instanceId),
  selectSkinFile: () => ipcRenderer.invoke('select-skin-file'),
  selectIconFile: () => ipcRenderer.invoke('select-icon-file'),
  getSkins: () => ipcRenderer.invoke('get-skins'),
  saveSkin: (filePath: string) => ipcRenderer.invoke('save-skin', filePath),
  deleteSkin: (skinId: string) => ipcRenderer.invoke('delete-skin', skinId),
  equipElybySkin: (skinPath: string, token: string) => ipcRenderer.invoke('equip-elyby-skin', skinPath, token),
  installModpack: (projectId: string, version: string, loader: string, modpackName: string) => ipcRenderer.invoke('install-modpack', projectId, version, loader, modpackName),
  onLaunchProgress: (callback: (msg: string) => void) => {
    ipcRenderer.on('launch-progress', (_, msg) => callback(msg))
  },
  onDownloadUpdate: (callback: (data: { id: string, name: string, text: string, progress: number }) => void) => {
    ipcRenderer.on('download-update', (_, data) => callback(data))
  },
  onDownloadFinish: (callback: (id: string) => void) => {
    ipcRenderer.on('download-finish', (_, id) => callback(id))
  },
  onGameClosed: (callback: () => void) => {
    ipcRenderer.on('game-closed', () => callback())
  },
  onGameCrashed: (callback: (log: string) => void) => {
    ipcRenderer.on('game-crashed', (_, log) => callback(log))
  },
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowHide: () => ipcRenderer.send('window-hide'),
  windowShow: () => ipcRenderer.send('window-show'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // Installer API
  isInstaller: () => ipcRenderer.invoke('is-installer'),
  getDefaultInstallPath: () => ipcRenderer.invoke('get-default-install-path'),
  installApp: (targetPath: string) => ipcRenderer.invoke('install-app', targetPath),
  createShortcuts: (targetPath: string) => ipcRenderer.invoke('create-shortcuts', targetPath),
  launchInstalled: (targetPath: string) => ipcRenderer.invoke('launch-installed', targetPath),
  checkIsInstalled: (targetPath: string) => ipcRenderer.invoke('check-is-installed', targetPath),
  uninstallApp: (targetPath: string) => ipcRenderer.invoke('uninstall-app', targetPath),
  
  // Discord RPC
  updateDiscordPresence: (presence: any) => ipcRenderer.send('update-discord-presence', presence),

  // Auto Updater
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadAndRunUpdate: (url: string) => ipcRenderer.invoke('download-and-run-update', url),
  onUpdateProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('update-progress', (_, progress) => callback(progress))
  }
})
