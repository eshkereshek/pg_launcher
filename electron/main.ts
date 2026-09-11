import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import https from 'node:https'
import { execFile, execSync, spawnSync, execFileSync } from 'node:child_process'
import extract from 'extract-zip'
// @ts-ignore
import { Client } from 'minecraft-launcher-core'
import { Auth } from 'msmc'
// @ts-ignore
import DiscordRPC from 'discord-rpc'
import * as cheerio from 'cheerio'

const require = createRequire(import.meta.url)

// --- Patch MCLC for speed --- //
if (!process.env.PORTABLE_EXECUTABLE_DIR) {
  try {
    const mclcHandlerPath = require.resolve('minecraft-launcher-core/components/handler.js')
    let handlerCode = fs.readFileSync(mclcHandlerPath, 'utf8')
    // Fix freezing asset check by using async stat instead of sync stat or checksum
    if (handlerCode.includes('!await this.checkSum(hash, path.join(subAsset, hash))')) {
      handlerCode = handlerCode.replace(
        '!await this.checkSum(hash, path.join(subAsset, hash))',
        '(await require("fs").promises.stat(path.join(subAsset, hash)).then(s => s.size === 0).catch(() => true))'
      )
      
      // Fix isModernForge for Minecraft >= 2.0 or 26.0 (where the '1.' prefix is dropped)
      if (handlerCode.includes("json.inheritsFrom.split('.')[1] >= 12")) {
        handlerCode = handlerCode.split("json.inheritsFrom.split('.')[1] >= 12").join(
          "(parseInt(json.inheritsFrom.split('.')[0]) > 1 || parseInt(json.inheritsFrom.split('.')[1]) >= 12)"
        )
      }

      fs.writeFileSync(mclcHandlerPath, handlerCode)
      console.log('MCLC handler patched successfully for fast assets check and modern forge!')
    }
  } catch (e) {
    console.log('Failed to patch MCLC:', e)
  }
}

process.noDeprecation = true;
app.commandLine.appendSwitch('limit-fps', '60');

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Polyfill __dirname for ES Modules (required by minecraft-launcher-core)
// @ts-ignore
global.__dirname = __dirname

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const launcher = new Client()

function createWindow() {
  const isInstaller = !!process.env.PORTABLE_EXECUTABLE_DIR;
  win = new BrowserWindow({
    width: isInstaller ? 800 : 1100,
    height: isInstaller ? 500 : 650,
    minWidth: isInstaller ? 800 : 1100,
    minHeight: isInstaller ? 500 : 650,
    resizable: !isInstaller,
    title: 'Pagrysha Launcher',
    icon: path.join(process.env.VITE_PUBLIC || '', 'icon.png'),
    show: isInstaller,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: [isInstaller ? '--is-installer' : '--not-installer']
    },
    frame: false
  })

  if (!isInstaller) {
    win.once('ready-to-show', () => {
      win?.show()
    })
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.whenReady().then(() => {
  if (!process.env.PORTABLE_EXECUTABLE_DIR) {
    saveInstallPath(path.dirname(process.execPath));
  }
  createWindow()
  if (!process.env.PORTABLE_EXECUTABLE_DIR) {
    setTimeout(() => {
      setupDiscordRPC().catch(() => {})
    }, 100)
  }
})

ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-maximize', () => win?.isMaximized() ? win?.unmaximize() : win?.maximize())
ipcMain.on('window-close', async () => {
  try {
    await win?.webContents.session.flushStorageData()
  } catch {}
  win?.close()
})
ipcMain.on('window-hide', () => win?.hide())
ipcMain.on('window-show', () => win?.show())
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

// --- MINECRAFT LOGIC --- //
const rootPath = path.join(app.getPath('userData'), 'minecraft_data')
const modpacksFile = path.join(app.getPath('userData'), 'modpacks.json')
const accountsFile = path.join(app.getPath('userData'), 'accounts.json')
const settingsFile = path.join(app.getPath('userData'), 'settings.json')

// --- SETTINGS PERSISTENCE ---
ipcMain.handle('get-settings', () => {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    }
  } catch (e) { console.error('Failed to read settings:', e) }
  return null
})

ipcMain.handle('save-settings', (_, settings) => {
  try {
    let existing: any = {}
    if (fs.existsSync(settingsFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
      } catch {}
    }
    const updated = { ...existing, ...settings }
    fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2), 'utf-8')
    return { status: 'ok' }
  } catch (e: any) {
    console.error('Failed to save settings:', e)
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('reset-settings', () => {
  try {
    if (fs.existsSync(settingsFile)) {
      fs.unlinkSync(settingsFile)
    }
    return { status: 'ok' }
  } catch (e: any) {
    console.error('Failed to reset settings:', e)
    return { status: 'error', error: e.message }
  }
})

// --- ACCOUNTS PERSISTENCE ---
ipcMain.handle('get-accounts', () => {
  try {
    if (fs.existsSync(accountsFile)) {
      return JSON.parse(fs.readFileSync(accountsFile, 'utf-8'))
    }
  } catch (e) { console.error('Failed to read accounts:', e) }
  return []
})

ipcMain.handle('save-accounts', (_, accounts) => {
  try {
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2))
    return { status: 'ok' }
  } catch (e: any) {
    console.error('Failed to save accounts:', e)
    return { status: 'error', error: e.message }
  }
})

// --- MSMC AUTH ---
ipcMain.handle('auth-microsoft', async () => {
  try {
    const authManager = new Auth("select_account")
    const xboxManager = await authManager.launch("electron")
    const token: any = await xboxManager.getMinecraft()
    return {
      type: 'microsoft',
      username: token.profile?.name || 'Player',
      uuid: token.profile?.id || '0',
      token: token.mclc().access_token,
      skinUrl: `https://crafatar.com/avatars/${token.profile?.id}`
    }
  } catch (e: any) {
    console.error(e)
    const errStr = typeof e === 'string' ? e : e?.message || String(e)
    let userMsg = errStr
    if (errStr.includes('error.gui.closed')) userMsg = 'Окно авторизации было закрыто.'
    throw new Error('Ошибка: ' + userMsg)
  }
})

// --- ELY.BY AUTH ---
ipcMain.handle('auth-elyby', async (_, email, password) => {
  try {
    const response = await fetch('https://authserver.ely.by/auth/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { name: 'Minecraft', version: 1 },
        username: email,
        password: password,
        requestUser: true
      })
    })
    if (!response.ok) {
      throw new Error('Неверный логин или пароль')
    }
    const data: any = await response.json()
    let rawUuid = data.selectedProfile.id;
    if (rawUuid && rawUuid.length === 32 && !rawUuid.includes('-')) {
      rawUuid = `${rawUuid.slice(0,8)}-${rawUuid.slice(8,12)}-${rawUuid.slice(12,16)}-${rawUuid.slice(16,20)}-${rawUuid.slice(20)}`;
    }
    return {
      type: 'elyby',
      username: data.selectedProfile.name,
      uuid: rawUuid,
      token: data.accessToken,
      clientToken: data.clientToken,
      skinUrl: `https://ely.by/services/skins-renderer?url=https://skinsystem.ely.by/skins/${data.selectedProfile.name}.png&scale=5&renderFace=1`
    }
  } catch (e: any) {
    console.error(e)
    throw new Error('Ошибка Ely.by: ' + e.message)
  }
})

// --- PG-SYNC AUTH ---
ipcMain.handle('auth-pgsync', async (_, username, password) => {
  try {
    const response = await fetch('https://pg-sync-server.onrender.com/api/yggdrasil/authserver/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: { name: 'Minecraft', version: 1 },
        username: username,
        password: password,
        requestUser: true
      })
    })
    if (!response.ok) {
      throw new Error('Неверный логин или пароль')
    }
    const data: any = await response.json()
    let rawUuid = data.selectedProfile.id;
    if (rawUuid && rawUuid.length === 32 && !rawUuid.includes('-')) {
      rawUuid = `${rawUuid.slice(0,8)}-${rawUuid.slice(8,12)}-${rawUuid.slice(12,16)}-${rawUuid.slice(16,20)}-${rawUuid.slice(20)}`;
    }
    return {
      type: 'pgsync',
      username: data.selectedProfile.name,
      uuid: rawUuid,
      token: data.accessToken,
      clientToken: data.clientToken,
      skinUrl: `https://minotar.net/helm/${data.selectedProfile.name}/40.png`
    }
  } catch (e: any) {
    console.error(e)
    throw new Error('Ошибка Pagrysha Account: ' + e.message)
  }
})

// --- SKINS PERSISTENCE ---
const skinsDir = path.join(app.getPath('userData'), 'skins')

ipcMain.handle('select-skin-file', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите скин',
    filters: [{ name: 'Images', extensions: ['png'] }],
    properties: ['openFile']
  })
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0]
  }
  return null
})

ipcMain.handle('select-icon-file', async () => {
  if (!win) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите иконку',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile']
  })
  if (!res.canceled && res.filePaths.length > 0) {
    const filePath = res.filePaths[0];
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  }
  return null
})

ipcMain.handle('get-skins', () => {
  try {
    if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true })
    const files = fs.readdirSync(skinsDir)
    return files.filter(f => f.endsWith('.png')).map(f => ({
      id: f,
      name: f.replace('.png', ''),
      path: path.join(skinsDir, f)
    }))
  } catch (e) {
    console.error('Failed to get skins:', e)
    return []
  }
})

ipcMain.handle('save-skin', (_, filePath) => {
  try {
    if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true })
    const filename = path.basename(filePath)
    const newId = Date.now() + '_' + filename
    const dest = path.join(skinsDir, newId)
    fs.copyFileSync(filePath, dest)
    return { status: 'success', id: newId, path: dest }
  } catch (e: any) {
    console.error('Failed to save skin:', e)
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('delete-skin', (_, skinId) => {
  try {
    const target = path.join(skinsDir, skinId)
    if (fs.existsSync(target)) fs.unlinkSync(target)
    return { status: 'success' }
  } catch (e: any) {
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('equip-elyby-skin', async (_, _skinPath, _token) => {
  try {
    // Ely.by often uses FormData for uploads, but doing it headless might be hard.
    // If it fails, we will fallback to opening the browser.
    return { status: 'not_implemented', fallback: 'open_browser' }
  } catch (e: any) {
    return { status: 'error', error: e.message }
  }
})

// --- MODPACK PERSISTENCE ---
ipcMain.handle('get-modpacks', () => {
  try {
    if (fs.existsSync(modpacksFile)) {
      return JSON.parse(fs.readFileSync(modpacksFile, 'utf-8'))
    }
  } catch (e) { console.error('Failed to read modpacks:', e) }
  return []
})

ipcMain.handle('get-installed-mods', (_, instanceId: string) => {
  try {
    const modsDir = path.join(rootPath, 'versions', instanceId, 'mods')
    if (fs.existsSync(modsDir)) {
      const files = fs.readdirSync(modsDir)
      return files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled')).map(f => ({
        id: f,
        title: f.replace('.disabled', ''),
        type: 'mod',
        isLocal: true,
        isEnabled: !f.endsWith('.disabled')
      }))
    }
  } catch (e) {
    console.error(`Failed to read mods for ${instanceId}:`, e)
  }
  return []
})

ipcMain.handle('toggle-mod', async (_, filename: string, instanceId: string, enable: boolean) => {
  try {
    const modsDir = path.join(rootPath, 'versions', instanceId, 'mods')
    const enabledPath = path.join(modsDir, filename.replace('.disabled', ''))
    const disabledPath = path.join(modsDir, filename.replace('.disabled', '') + '.disabled')
    
    if (enable) {
      if (fs.existsSync(disabledPath)) fs.renameSync(disabledPath, enabledPath)
    } else {
      if (fs.existsSync(enabledPath)) fs.renameSync(enabledPath, disabledPath)
    }
  } catch (e) {
    console.error(`Failed to toggle mod ${filename} for ${instanceId}:`, e)
  }
})

ipcMain.handle('save-modpacks', (_, modpacks) => {
  try {
    fs.writeFileSync(modpacksFile, JSON.stringify(modpacks, null, 2))
    return { status: 'ok' }
  } catch (e: any) {
    console.error('Failed to save modpacks:', e)
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('rename-modpack-folder', (_, oldName: string, newName: string) => {
  try {
    const oldPath = path.join(rootPath, 'versions', oldName)
    const newPath = path.join(rootPath, 'versions', newName)
    if (fs.existsSync(oldPath)) {
      if (fs.existsSync(newPath)) return { status: 'error', error: 'Directory already exists' }
      fs.renameSync(oldPath, newPath)
      return { status: 'success' }
    }
    return { status: 'error', error: 'Old directory not found' }
  } catch (e: any) {
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('open-folder', () => {
  if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true })
  shell.openPath(rootPath)
})

ipcMain.handle('clear-cache', async () => {
  try {
    const tempDir = app.getPath('temp')
    // Clear temp files matching our pattern
    const files = fs.readdirSync(tempDir)
    for (const f of files) {
      if (f.startsWith('mrpack_')) {
        fs.rmSync(path.join(tempDir, f), { recursive: true, force: true })
      }
    }
    // Clear electron session cache
    await win?.webContents.session.clearCache()

    // Delete minecraft downloaded data
    const foldersToClear = [
      'versions',
      'assets',
      'libraries',
      'forge-installers',
      'fabric-installers',
      'quilt-installers',
      'neoforge-installers',
      'optifine-installers',
      'mods' // global mods folder
    ]

    for (const folder of foldersToClear) {
      const folderPath = path.join(rootPath, folder)
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true })
      }
    }
    return { status: 'success' }
  } catch(e: any) {
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('get-system-info', () => {
  const totalMB = Math.floor(os.totalmem() / (1024 * 1024))
  return { totalMemoryMB: totalMB }
})

ipcMain.handle('import-mod-file', (_, fileName: string, buffer: ArrayBuffer, instanceId?: string) => {
  try {
    const modsDir = instanceId 
      ? path.join(rootPath, 'versions', instanceId, 'mods') 
      : path.join(rootPath, 'mods')
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })
    const dest = path.join(modsDir, fileName)
    fs.writeFileSync(dest, Buffer.from(buffer))
    return { status: 'success', filename: fileName }
  } catch (e: any) {
    console.error('Failed to import mod file:', e)
    return { status: 'error', error: e.message }
  }
})

ipcMain.handle('read-local-image', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).substring(1)
    return `data:image/${ext};base64,${buffer.toString('base64')}`
  } catch(e) {
    console.error('Failed to read local image', e)
    return null
  }
})

ipcMain.handle('get-popular-mods', async (_, loader, version, offset = 0) => {
  const url = `https://api.modrinth.com/v2/search?facets=[["categories:${loader}"],["versions:${version}"],["project_type:mod"]]&limit=20&offset=${offset}`
  const response = await fetch(url)
  return await response.json()
})

ipcMain.handle('search-curseforge-mods', async (_, query, loader, version, offset = 0) => {
  let modLoaderType = 0
  if (loader === 'fabric') modLoaderType = 4
  else if (loader === 'forge') modLoaderType = 1

  const url = `https://api.curse.nikky.moe/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&gameVersion=${version}&modLoaderType=${modLoaderType}&index=${offset}&pageSize=20`
  try {
    const response = await fetch(url)
    return await response.json()
  } catch (e) {
    console.error(e)
    return { data: [] }
  }
})

ipcMain.handle('search-mods', async (_, query, loader, version, offset = 0, projectType = 'mod', sort = 'relevance') => {
  try {
    let facets = `[["versions:${version}"],["project_type:${projectType}"]]`
    if (projectType === 'mod') {
      facets = `[["categories:${loader}"],["versions:${version}"],["project_type:${projectType}"]]`
    }
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${facets}&limit=20&offset=${offset}&index=${sort}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("API error")
    const data: any = await res.json()
    
    let hits = data.hits
    if (version === '1.12.2' && projectType === 'mod') {
      const queryLower = query.toLowerCase()
      if (queryLower === '' || queryLower.includes('jenny')) {
        hits.unshift({
          project_id: 'jenny-mod',
          project_type: 'mod',
          slug: 'jenny-mod',
          author: 'Schnurri_tv',
          title: 'Jenny Mod',
          description: 'The legendary Jenny Mod. Adds Jenny to your world.',
          categories: ['adventure', 'mobs', 'cursed'],
          display_categories: ['adventure', 'mobs', 'cursed'],
          versions: ['1.12.2'],
          downloads: 696969,
          icon_url: 'https://minotar.net/helm/Jenny/100.png',
          date_modified: new Date().toISOString()
        })
      }
    }
    return { hits, totalHits: data.total_hits }
  } catch (e) {
    console.error('search-mods failed:', e)
    return { hits: [], totalHits: 0 }
  }
})

ipcMain.handle('get-popular-modpacks', async (_, version, offset = 0, category = 'all', loader = 'all', sort = 'downloads') => {
  try {
    const facetList: any[] = [["project_type:modpack"]]
    if (version && version !== 'all') facetList.push([`versions:${version}`])
    if (loader && loader !== 'all') facetList.push([`categories:${loader}`])
    if (category && category !== 'all') facetList.push([`categories:${category}`])
    const facets = encodeURIComponent(JSON.stringify(facetList))
    const sortIndex = sort || 'downloads'
    const url = `https://api.modrinth.com/v2/search?facets=${facets}&index=${sortIndex}&limit=20&offset=${offset}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("API error")
    const data: any = await res.json()
    return { hits: data.hits, totalHits: data.total_hits }
  } catch (e) {
    console.error('get-popular-modpacks failed:', e)
    return { hits: [], totalHits: 0 }
  }
})

ipcMain.handle('search-modpacks', async (_, query, version, offset = 0, category = 'all', loader = 'all', sort = 'relevance') => {
  try {
    const facetList: any[] = [["project_type:modpack"]]
    if (version && version !== 'all') facetList.push([`versions:${version}`])
    if (loader && loader !== 'all') facetList.push([`categories:${loader}`])
    if (category && category !== 'all') facetList.push([`categories:${category}`])
    const facets = encodeURIComponent(JSON.stringify(facetList))
    const queryParam = query ? `query=${encodeURIComponent(query)}&` : ''
    const sortIndex = sort || 'relevance'
    const url = `https://api.modrinth.com/v2/search?${queryParam}facets=${facets}&index=${sortIndex}&limit=20&offset=${offset}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("API error")
    const data: any = await res.json()
    return { hits: data.hits, totalHits: data.total_hits }
  } catch (e) {
    console.error('search-modpacks failed:', e)
    return { hits: [], totalHits: 0 }
  }
})

async function downloadModRecursively(projectId: string, gameVersion: string, loader: string, downloadedIds: Set<string>, instanceId: string, sendStatus?: (msg: string) => void, projectType: string = 'mod'): Promise<string[]> {
  if (downloadedIds.has(projectId)) return []
  downloadedIds.add(projectId)

  let targetDir = 'mods'
  if (projectType === 'resourcepack') targetDir = 'resourcepacks'
  else if (projectType === 'shader') targetDir = 'shaderpacks'
  
  const modsDir = path.join(rootPath, 'versions', instanceId, targetDir)
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

  if (projectId === 'jenny-mod') {
    if (sendStatus) sendStatus(`Загрузка мода JennyMod-1.12.2.jar...`)
    const zipPath = path.join(modsDir, 'JennyMod-1.12.2.jar')
    if (!fs.existsSync(zipPath)) {
      const emptyZipHex = '504B0506000000000000000000000000000000000000'
      fs.writeFileSync(zipPath, Buffer.from(emptyZipHex, 'hex'))
    }
    return ['JennyMod-1.12.2.jar']
  }

  const loaderQuery = projectType === 'mod' ? `&loaders=["${loader}"]` : ""
  const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?game_versions=["${gameVersion}"]${loaderQuery}`)
  if (!res.ok) return []
  const versions: any = await res.json()
  if (!versions.length) return []
  
  const version = versions[0]
  const file = version.files.find((f: any) => f.primary) || version.files[0]
  
  if (sendStatus) sendStatus(`Загрузка мода ${file.filename}...`)

  const zipPath = path.join(modsDir, file.filename)
  if (!fs.existsSync(zipPath)) {
    const dlRes = await fetch(file.url)
    const buffer = await dlRes.arrayBuffer()
    fs.writeFileSync(zipPath, Buffer.from(buffer))
  }
  
  let downloadedNames = [file.filename]

  // Download dependencies
  if (version.dependencies && version.dependencies.length > 0) {
    for (const dep of version.dependencies) {
      if (dep.dependency_type === 'required' && dep.project_id) {
        const depNames = await downloadModRecursively(dep.project_id, gameVersion, loader, downloadedIds, instanceId, sendStatus, projectType)
        downloadedNames = downloadedNames.concat(depNames)
      }
    }
  }
  
  return downloadedNames
}

ipcMain.handle('download-mod', async (_, projectId, gameVersion, loader, instanceId, projectType = 'mod') => {
  const sendStatus = (msg: string) => win?.webContents.send('launch-progress', msg)
  win?.webContents.send('download-update', { id: `mod_${projectId}`, name: projectId, text: `Скачивание ${projectType}...`, progress: 0 })
  
  let downloadedNames: string[] = []
  try {
    downloadedNames = await downloadModRecursively(projectId, gameVersion, loader, new Set(), instanceId, sendStatus, projectType)
    if (downloadedNames.length === 0) throw new Error("No compatible versions found")
    sendStatus(`Установка завершена!`)
  } catch (e: any) {
    sendStatus(`Ошибка установки: ${e.message}`)
    throw e
  } finally {
    win?.webContents.send('download-update', { id: `mod_${projectId}`, name: projectId, text: `Установка завершена`, progress: 100 })
    win?.webContents.send('download-finish', `mod_${projectId}`)
  }
  return { status: 'success', filenames: downloadedNames }
})

ipcMain.handle('uninstall-mod', async (_, filename, instanceId) => {
  const dirs = ['mods', 'resourcepacks', 'shaderpacks']
  for (const dir of dirs) {
    const p = path.join(rootPath, 'versions', instanceId, dir, filename)
    const pDisabled = path.join(rootPath, 'versions', instanceId, dir, filename + '.disabled')
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      return { status: 'success' }
    }
    if (fs.existsSync(pDisabled)) {
      fs.unlinkSync(pDisabled)
      return { status: 'success' }
    }
  }
  return { status: 'not_found' }
})

ipcMain.handle('delete-modpack-folder', async (_, instanceId) => {
  const instancePath = path.join(rootPath, 'versions', instanceId)
  if (fs.existsSync(instancePath)) {
    fs.rmSync(instancePath, { recursive: true, force: true })
  }
  return { status: 'success' }
})

ipcMain.handle('install-optifine', async (_, gameVersion, instanceId) => {
  const sendStatus = (msg: string) => win?.webContents.send('launch-progress', msg)
  const sendDownload = (text: string, progress: number) => {
    win?.webContents.send('download-update', {
      id: 'optifine',
      name: 'OptiFine',
      text,
      progress
    })
  }

  sendStatus('Поиск OptiFine...')
  sendDownload('Поиск подходящей версии OptiFine...', 10)
  
  try {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    let filename = ''
    let target: any = null

    // Method 1: BMCLAPI2 / BMCLAPI version list
    const bmclHosts = ['https://bmclapi2.bangbang93.com', 'https://bmclapi.bangbang93.com']
    for (const host of bmclHosts) {
      try {
        const res = await fetch(`${host}/optifine/versionList`, { headers: { 'User-Agent': userAgent } })
        if (res.ok) {
          const list = await res.json() as any[]
          const compatible = list.filter(v => v.mcversion === gameVersion)
          if (compatible.length > 0) {
            const stable = compatible.filter(v => !v.filename?.startsWith('preview_'))
            target = stable.length > 0 ? stable[stable.length - 1] : compatible[compatible.length - 1]
            filename = target.filename || `OptiFine_${target.mcversion}_${target.type}_${target.patch}.jar`
            break
          }
        }
      } catch (e) {}
    }

    // Method 2: Scrape optifine.net/downloads if not found
    if (!filename) {
      try {
        const res = await fetch('https://optifine.net/downloads', { headers: { 'User-Agent': userAgent } })
        if (res.ok) {
          const html = await res.text()
          const regex = /href=['"][^'"]*(?:adloadx\?f=)([^'"&]+)[^'"]*/g
          let m: RegExpExecArray | null
          const matched: string[] = []
          while ((m = regex.exec(html)) !== null) {
            const fn = m[1]
            const vMatch = fn.match(/(?:preview_)?OptiFine_([0-9.]+)_/i)
            if (vMatch && vMatch[1] === gameVersion) {
              matched.push(fn)
            }
          }
          if (matched.length > 0) {
            const stable = matched.filter(f => !f.startsWith('preview_'))
            filename = stable.length > 0 ? stable[0] : matched[0]
          }
        }
      } catch (e) {}
    }

    if (!filename) {
      sendStatus('OptiFine для этой версии не найден!')
      sendDownload('OptiFine для этой версии не найден', 100)
      setTimeout(() => {
        sendStatus('')
        win?.webContents.send('download-finish', 'optifine')
      }, 3000)
      return { status: 'not_found' }
    }
    
    const modsDir = path.join(rootPath, 'versions', instanceId, 'mods')
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })
    
    const zipPath = path.join(modsDir, filename)
    if (!fs.existsSync(zipPath)) {
      sendDownload(`Скачивание ${filename}...`, 30)
      sendStatus(`Скачивание ${filename}...`)

      let downloadedBuffer: Buffer | null = null
      let lastError = ''
      
      // Source 1: OptiFine.net official mirror
      try {
        const adloadUrl = `https://optifine.net/adloadx?f=${filename}`
        const adRes = await fetch(adloadUrl, {
          headers: { 'User-Agent': userAgent, 'Referer': 'https://optifine.net/downloads' }
        })
        if (adRes.ok) {
          const html = await adRes.text()
          const match = html.match(/downloadx\?f=[^'"]+/)
          if (match) {
            const dlUrl = `https://optifine.net/${match[0]}`
            const dlRes = await fetch(dlUrl, {
              headers: { 'User-Agent': userAgent, 'Referer': adloadUrl }
            })
            if (dlRes.ok) {
              const buf = Buffer.from(await dlRes.arrayBuffer())
              if (buf.length > 100000 && buf[0] === 0x50 && buf[1] === 0x4B) {
                downloadedBuffer = buf
              }
            }
          }
        }
      } catch (e: any) {
        lastError = e.message
      }

      // Source 2: BMCLAPI2
      if (!downloadedBuffer && target) {
        try {
          const dlUrl = `https://bmclapi2.bangbang93.com/optifine/${target.mcversion}/${target.type}/${target.patch}`
          const dlRes = await fetch(dlUrl, { headers: { 'User-Agent': userAgent } })
          if (dlRes.ok) {
            const buf = Buffer.from(await dlRes.arrayBuffer())
            if (buf.length > 100000 && buf[0] === 0x50 && buf[1] === 0x4B) {
              downloadedBuffer = buf
            }
          }
        } catch (e: any) {
          lastError = e.message
        }
      }

      // Source 3: BMCLAPI Primary
      if (!downloadedBuffer && target) {
        try {
          const dlUrl = `https://bmclapi.bangbang93.com/optifine/${target.mcversion}/${target.type}/${target.patch}`
          const dlRes = await fetch(dlUrl, { headers: { 'User-Agent': userAgent } })
          if (dlRes.ok) {
            const buf = Buffer.from(await dlRes.arrayBuffer())
            if (buf.length > 100000 && buf[0] === 0x50 && buf[1] === 0x4B) {
              downloadedBuffer = buf
            }
          }
        } catch (e: any) {
          lastError = e.message
        }
      }
      
      if (!downloadedBuffer) {
        throw new Error(lastError || 'Не удалось скачать ни с одного источника')
      }

      fs.writeFileSync(zipPath, downloadedBuffer)
    }
    
    sendStatus('OptiFine успешно установлен!')
    sendDownload('Установка завершена', 100)
    setTimeout(() => {
      win?.webContents.send('download-finish', 'optifine')
    }, 2000)

    return { status: 'success', filenames: [filename] }
  } catch (e: any) {
    sendStatus('Ошибка установки OptiFine: ' + e.message)
    sendDownload('Ошибка установки: ' + e.message, 100)
    setTimeout(() => {
      sendStatus('')
      win?.webContents.send('download-finish', 'optifine')
    }, 3000)
    return { status: 'error', error: e.message }
  }
})

// --- Modpack Installer ---
ipcMain.handle('install-modpack', async (_, projectId, gameVersion, loader, modpackName) => {
  const sendStatus = (msg: string) => win?.webContents.send('launch-progress', msg)

  sendStatus(`Fetching modpack versions for ${projectId}...`)
  const url = `https://api.modrinth.com/v2/project/${projectId}/version`
  const response = await fetch(url)
  const versions: any = await response.json()

  let targetVersion = versions.find((v: any) => 
    v.game_versions.includes(gameVersion) && 
    v.loaders.includes(loader)
  )

  if (!targetVersion) {
    sendStatus(`Exact version match not found, picking the latest compatible version for ${loader}...`)
    targetVersion = versions.find((v: any) => v.loaders.includes(loader))
    if (!targetVersion) {
      sendStatus(`No version matched loader ${loader}, picking the very first available version...`)
      targetVersion = versions[0]
      if (!targetVersion) {
        throw new Error(`This project has no published versions for the selected loader!`)
      }
    }
  }

  const actualLoader = targetVersion.loaders[0] || loader;
  const file = targetVersion.files.find((f: any) => f.primary) || targetVersion.files[0]
  const downloadUrl = file.url

  const tempDir = path.join(app.getPath('temp'), `mrpack_${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  
  const mrpackPath = path.join(tempDir, 'modpack.mrpack')
  
  sendStatus(`Downloading modpack archive...`)
  await new Promise<void>((resolve, reject) => {
    https.get(downloadUrl, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Failed to download mrpack: ${res.statusCode}`))
      const writeStream = fs.createWriteStream(mrpackPath)
      res.pipe(writeStream)
      writeStream.on('finish', resolve)
    }).on('error', reject)
  })

  sendStatus(`Extracting modpack...`)
  await extract(mrpackPath, { dir: tempDir })

  const indexPath = path.join(tempDir, 'modrinth.index.json')
  if (!fs.existsSync(indexPath)) {
    throw new Error('Invalid Modrinth modpack: Missing modrinth.index.json')
  }

  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  const filesToDownload = indexData.files || []

  const instancePath = path.join(rootPath, 'versions', modpackName)
  try {
    fs.mkdirSync(instancePath, { recursive: true })

    let downloadedCount = 0
    for (const f of filesToDownload) {
      if (f.downloads && f.downloads.length > 0) {
        const destPath = path.join(instancePath, f.path)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        
        sendStatus(`Downloading file ${++downloadedCount}/${filesToDownload.length}: ${path.basename(f.path)}`)
        win?.webContents.send('download-update', { 
          id: `modpack_${modpackName}`, 
          name: modpackName, 
          text: `Файл ${downloadedCount} из ${filesToDownload.length}`, 
          progress: Math.round((downloadedCount / filesToDownload.length) * 100) 
        })
        
        await new Promise<void>((resolve, reject) => {
          const fetchFile = (downloadUrl: string) => {
            https.get(downloadUrl, (res) => {
              if (res.statusCode === 301 || res.statusCode === 302) {
                fetchFile(res.headers.location!)
              } else if (res.statusCode === 200) {
                const stream = fs.createWriteStream(destPath)
                res.pipe(stream)
                stream.on('finish', resolve)
              } else {
                reject(new Error(`Failed to download file: HTTP ${res.statusCode}`))
              }
            }).on('error', reject)
          }
          fetchFile(f.downloads[0])
        })
      }
    }

    const copyOverrides = (dirName: string) => {
      const dirPath = path.join(tempDir, dirName)
      if (fs.existsSync(dirPath)) {
        sendStatus(`Applying ${dirName}...`)
        const copyRecursive = (src: string, dest: string) => {
          if (fs.statSync(src).isDirectory()) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
            for (const child of fs.readdirSync(src)) {
              copyRecursive(path.join(src, child), path.join(dest, child))
            }
          } else {
            fs.copyFileSync(src, dest)
          }
        }
        copyRecursive(dirPath, instancePath)
      }
    }

    copyOverrides('overrides')
    copyOverrides('client-overrides')
  } catch (error) {
    try {
      if (fs.existsSync(instancePath)) {
        fs.rmSync(instancePath, { recursive: true, force: true })
      }
    } catch (e) {
      console.error('Failed to cleanup instance path after install error:', e)
    }
    throw error
  }

  sendStatus('Modpack installation complete!')
  win?.webContents.send('download-finish', `modpack_${modpackName}`)
  
  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch (e) { console.error('Cleanup error:', e) }

  return { status: 'success', gameVersion: targetVersion.game_versions[0], actualLoader }
})

// Fetch all versions from Mojang API
ipcMain.handle('get-versions', async () => {
  return new Promise((resolve, reject) => {
    https.get('https://launchermeta.mojang.com/mc/game/version_manifest.json', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          let installed: string[] = []
          try {
            const versionsDir = path.join(rootPath, 'versions')
            if (fs.existsSync(versionsDir)) {
              installed = fs.readdirSync(versionsDir)
            }
            // Add modern Forge installations (MCLC puts them in rootPath/forge/<version>/version.json)
            const forgeDir = path.join(rootPath, 'forge')
            if (fs.existsSync(forgeDir)) {
              const forgeVersions = fs.readdirSync(forgeDir)
              for (const fv of forgeVersions) {
                if (fs.existsSync(path.join(forgeDir, fv, 'version.json'))) {
                  installed.push(`${fv}-forge-modern`)
                }
              }
            }
          } catch(e) {}
          resolve({ releases: json.versions, installed })
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
})

// --- FABRIC INSTALLER ---
async function ensureFabric(gameVersion: string, sendStatus: (msg: string) => void): Promise<string> {
  sendStatus(`Installing Fabric for ${gameVersion}...`)
  
  // Get latest Fabric loader version
  const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader')
  const loaders: any = await loaderRes.json()
  const latestLoader = loaders[0].version
  
  const customId = `fabric-loader-${latestLoader}-${gameVersion}`
  const versionDir = path.join(rootPath, 'versions', customId)
  const jsonPath = path.join(versionDir, `${customId}.json`)
  
  // Skip if already installed
  if (fs.existsSync(jsonPath)) {
    sendStatus('Fabric already installed!')
    return customId
  }
  
  // Download Fabric profile JSON
  sendStatus(`Downloading Fabric ${latestLoader}...`)
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${latestLoader}/profile/json`
  const profileRes = await fetch(profileUrl)
  if (!profileRes.ok) throw new Error(`Failed to download Fabric profile: ${profileRes.statusText}`)
  const profileJson: any = await profileRes.json()
  
  fs.mkdirSync(versionDir, { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(profileJson, null, 2))
  
  sendStatus('Fabric installed successfully!')
  return customId
}

// --- QUILT INSTALLER ---
async function ensureQuilt(gameVersion: string, sendStatus: (msg: string) => void): Promise<string> {
  sendStatus(`Installing Quilt for ${gameVersion}...`)
  
  // Get latest Quilt loader version
  const loaderRes = await fetch('https://meta.quiltmc.org/v3/versions/loader')
  const loaders: any = await loaderRes.json()
  const latestLoader = loaders[0].version
  
  const customId = `quilt-loader-${latestLoader}-${gameVersion}`
  const versionDir = path.join(rootPath, 'versions', customId)
  const jsonPath = path.join(versionDir, `${customId}.json`)
  
  // Skip if already installed
  if (fs.existsSync(jsonPath)) {
    sendStatus('Quilt already installed!')
    return customId
  }
  
  // Download Quilt profile JSON
  sendStatus(`Downloading Quilt ${latestLoader}...`)
  const profileUrl = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${latestLoader}/profile/json`
  const profileRes = await fetch(profileUrl)
  if (!profileRes.ok) throw new Error(`Failed to download Quilt profile: ${profileRes.statusText}`)
  const profileJson: any = await profileRes.json()
  
  fs.mkdirSync(versionDir, { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(profileJson, null, 2))
  
  sendStatus('Quilt installed successfully!')
  return customId
}

// --- FORGE INSTALLER ---
async function ensureForge(gameVersion: string, sendStatus: (msg: string) => void): Promise<string> {
  sendStatus(`Looking for Forge for ${gameVersion}...`)
  
  // Get Forge versions list from Modrinth's API (simpler than Forge's own)
  // Actually, let's use Forge's promotion API
  const promoRes = await fetch(`https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`)
  const promoData: any = await promoRes.json()
  
  // Try to find recommended, then latest
  let forgeVersion = promoData.promos[`${gameVersion}-recommended`] || promoData.promos[`${gameVersion}-latest`]
  
  if (!forgeVersion) {
    throw new Error(`Forge not available for ${gameVersion}. Try Fabric instead.`)
  }
  
  const fullForgeVersion = `${gameVersion}-${forgeVersion}`
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullForgeVersion}/forge-${fullForgeVersion}-installer.jar`
  
  const forgeDir = path.join(app.getPath('userData'), 'forge-installers')
  fs.mkdirSync(forgeDir, { recursive: true })
  const installerPath = path.join(forgeDir, `forge-${fullForgeVersion}-installer.jar`)
  
  const isModernForge = () => {
    const parts = gameVersion.split('.').map(Number);
    // Minecraft 26.x+ (dropped the 1. prefix) is always modern
    if (parts[0] > 1) return true;
    if (parts[0] === 1 && parts[1] > 20) return true;
    if (parts[0] === 1 && parts[1] === 20 && (parts[2] || 0) >= 6) return true;
    return false;
  }
  const expectedProfileName = `${gameVersion}-forge-${forgeVersion}`;

  // Check if forge is already installed in versions
  const forgeVersionDir = path.join(rootPath, 'versions', fullForgeVersion)
  const newForgeVersionDir = path.join(rootPath, 'versions', expectedProfileName)
  
  if (fs.existsSync(forgeVersionDir) && !isModernForge()) {
    sendStatus('Forge already installed!')
    return installerPath
  }
  if (fs.existsSync(newForgeVersionDir) && isModernForge()) {
    sendStatus('Forge already installed!')
    return expectedProfileName
  }
  
  // Download installer
  sendStatus(`Downloading Forge ${forgeVersion}...`)
  const dlRes = await fetch(installerUrl)
  if (!dlRes.ok) throw new Error(`Failed to download Forge installer: ${dlRes.statusText}`)
  const buffer = await dlRes.arrayBuffer()
  fs.writeFileSync(installerPath, Buffer.from(buffer))
  
  if (isModernForge()) {
    sendStatus(`Installing Forge ${forgeVersion} locally (this will take a minute)...`)
    const { javaPath } = await ensureJava(gameVersion, sendStatus)
    const profilesPath = path.join(rootPath, 'launcher_profiles.json')
    if (!fs.existsSync(profilesPath)) {
      fs.writeFileSync(profilesPath, JSON.stringify({profiles: {}}))
    }
    try {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(javaPath, 0o755) } catch {}
      }
      execSync(`"${javaPath}" -jar "${installerPath}" --installClient "${rootPath}"`, { stdio: 'ignore' })
    } catch (e: any) {
      throw new Error(`Forge installation failed: ${e.message}`)
    }
    return expectedProfileName
  }
  
  sendStatus('Forge downloaded! Installing...')
  return installerPath
}

// --- Java Runtime Resolution and Management --- //

// Helper to determine the required Java major version
function getRequiredJavaMajor(gameVersion: string, versionData?: any): '8' | '17' | '21' | '25' {
  // 1. Check versionData (from official Minecraft version JSON) if available
  if (versionData) {
    const major = versionData.javaVersion?.majorVersion
    if (major) {
      if (major <= 8) return '8'
      if (major === 16 || major === 17) return '17' // Adoptium has no 16; 17 runs 1.17 flawlessly
      if (major <= 21) return '21'
      return '25'
    }

    const comp = versionData.javaVersion?.component
    if (comp) {
      if (comp.includes('legacy')) return '8'
      if (comp.includes('alpha') || comp.includes('beta') || comp.includes('gamma')) return '17'
      if (comp.includes('delta')) return '21'
    }
  }

  const vStr = (gameVersion || '').trim()

  // 2. Alpha, Beta, Classic, Infdev, In-dev, Cave game (always Java 8)
  if (/^(?:[abc]|inf-|rd-|in-)/i.test(vStr) || /alpha|beta|classic|infdev/i.test(vStr)) {
    return '8'
  }

  // 3. Snapshot format (e.g. 13w02a, 20w14a, 24w10a)
  const snapMatch = vStr.match(/^(\d{2})w/i)
  if (snapMatch) {
    const snapYear = parseInt(snapMatch[1], 10)
    if (snapYear <= 20) return '8'
    if (snapYear < 24) return '17'
    return '21'
  }

  // 4. Standard semantic version parsing (e.g. 1.12.2, 1.16.5, 1.20.4, 1.21, 26.1)
  const numMatch = vStr.match(/(?:^|[^\d])(1|2)\.(\d+)(?:\.(\d+))?/)
  if (numMatch) {
    const major = parseInt(numMatch[1], 10)
    const minor = parseInt(numMatch[2], 10)
    const patch = parseInt(numMatch[3] || '0', 10)

    if (major === 1) {
      if (minor <= 16) return '8'
      if (minor === 17) return '17' // Java 17 for 1.17
      if (minor >= 18 && minor <= 19) return '17'
      if (minor === 20 && patch <= 4) return '17'
      return '21' // 1.20.5+ and 1.21+
    }
  }

  // Check modern versions without 1. prefix (e.g. 26.0+)
  const modernMatch = vStr.match(/(?:^|[^\d])(\d{2,})\.(\d+)/)
  if (modernMatch) {
    const val = parseInt(modernMatch[1], 10)
    if (val >= 26) return '25'
  }

  // Check if string contains legacy markers
  if (/1\.(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16)/.test(vStr)) {
    return '8'
  }

  // Default to 21 for modern releases
  return '21'
}

// Recursively look for java binary with depth limit to stay fast
function findJavaBinary(dir: string, depth = 0): string | null {
  if (!fs.existsSync(dir) || depth > 6) return null
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const isWin = process.platform === 'win32'

    // First check files in current directory
    for (const entry of entries) {
      if (entry.isFile()) {
        const lower = entry.name.toLowerCase()
        if (isWin) {
          if (lower === 'javaw.exe' || lower === 'java.exe') {
            return path.join(dir, entry.name)
          }
        } else {
          if (entry.name === 'java' || lower === 'java') {
            return path.join(dir, entry.name)
          }
        }
      }
    }

    // Then recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const full = path.join(dir, entry.name)
        const res = findJavaBinary(full, depth + 1)
        if (res) return res
      }
    }
  } catch {}
  return null
}

// Read release file or execute java -version to get exact Java major version
function getJavaMajorFromExe(javaExe: string): number | null {
  try {
    const binDir = path.dirname(javaExe)
    const candidateDirs = [
      path.dirname(binDir), // e.g. /Contents/Home or /jdk-17
      binDir,
      path.dirname(path.dirname(binDir)) // e.g. /Contents
    ]
    for (const d of candidateDirs) {
      const releaseFile = path.join(d, 'release')
      if (fs.existsSync(releaseFile)) {
        const content = fs.readFileSync(releaseFile, 'utf8')
        const match = content.match(/JAVA_VERSION="?(?:1\.)?(\d+)/)
        if (match) {
          return parseInt(match[1], 10)
        }
      }
    }

    // Fallback: run java -version
    const res = spawnSync(javaExe, ['-version'], { encoding: 'utf8', timeout: 3000 })
    const output = (res.stderr || '') + (res.stdout || '')
    const match = output.match(/(?:version|version\s*")(?:\s*1\.)?(\d+)/i)
    if (match) {
      return parseInt(match[1], 10)
    }
  } catch {}
  return null
}

// Search for already installed Java runtimes across all known locations
function findInstalledJava(targetMajor: '8' | '17' | '21' | '25'): string | null {
  const targetNum = parseInt(targetMajor, 10)

  // 1. Check userData/java-runtime-<major> and userData/java-runtime
  const candidateDirs = [
    path.join(app.getPath('userData'), `java-runtime-${targetMajor}`),
    path.join(app.getPath('userData'), 'java-runtime'),
  ]

  for (const dir of candidateDirs) {
    const bin = findJavaBinary(dir)
    if (bin) {
      const detectedMajor = getJavaMajorFromExe(bin)
      if (detectedMajor === targetNum || (!detectedMajor && dir.endsWith(`-${targetMajor}`))) {
        if (process.platform !== 'win32') {
          try { fs.chmodSync(bin, 0o755) } catch {}
        }
        return bin
      }
    }
  }

  // 2. Check Mojang launcher runtimes in .minecraft/runtime across platforms
  const mojangRuntimeCandidates = [
    path.join(rootPath, 'runtime'),
    process.env['APPDATA'] ? path.join(process.env['APPDATA'], '.minecraft', 'runtime') : '',
    process.env['HOME'] ? path.join(process.env['HOME'], 'Library', 'Application Support', 'minecraft', 'runtime') : '',
    process.env['HOME'] ? path.join(process.env['HOME'], '.minecraft', 'runtime') : ''
  ].filter(Boolean)

  const mojangDirs = targetMajor === '8'
    ? ['jre-legacy']
    : targetMajor === '17'
    ? ['java-runtime-gamma', 'java-runtime-beta', 'java-runtime-alpha']
    : targetMajor === '21'
    ? ['java-runtime-delta']
    : []

  for (const mBase of mojangRuntimeCandidates) {
    if (!fs.existsSync(mBase)) continue
    for (const sub of mojangDirs) {
      const dir = path.join(mBase, sub)
      const bin = findJavaBinary(dir)
      if (bin) {
        if (process.platform !== 'win32') {
          try { fs.chmodSync(bin, 0o755) } catch {}
        }
        return bin
      }
    }
  }

  // 3. Check OS-specific system installations
  if (process.platform === 'win32') {
    const winCandidateRoots = [
      process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Java') : '',
      process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Eclipse Adoptium') : '',
      process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'BellSoft') : '',
      process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Microsoft') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Java') : ''
    ].filter(Boolean)

    for (const root of winCandidateRoots) {
      if (!fs.existsSync(root)) continue
      try {
        const subdirs = fs.readdirSync(root)
        for (const sub of subdirs) {
          const bin = findJavaBinary(path.join(root, sub))
          if (bin) {
            const detectedMajor = getJavaMajorFromExe(bin)
            if (detectedMajor === targetNum) return bin
          }
        }
      } catch {}
    }
  } else if (process.platform === 'darwin') {
    // macOS: First query standard /usr/libexec/java_home
    try {
      const vArg = targetMajor === '8' ? '1.8' : targetMajor
      const out = execFileSync('/usr/libexec/java_home', ['-v', vArg], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (out && fs.existsSync(out)) {
        const bin = path.join(out, 'bin', 'java')
        if (fs.existsSync(bin)) {
          try { fs.chmodSync(bin, 0o755) } catch {}
          return bin
        }
      }
    } catch {}

    // macOS: Check standard JVM locations
    const macRoots = [
      '/Library/Java/JavaVirtualMachines',
      process.env['HOME'] ? path.join(process.env['HOME'], 'Library', 'Java', 'JavaVirtualMachines') : '',
      '/System/Library/Java/JavaVirtualMachines',
      '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home'
    ].filter(Boolean)

    for (const root of macRoots) {
      if (!fs.existsSync(root)) continue
      try {
        if (fs.statSync(root).isDirectory()) {
          const subdirs = fs.readdirSync(root)
          for (const sub of subdirs) {
            const bin = findJavaBinary(path.join(root, sub))
            if (bin) {
              const detectedMajor = getJavaMajorFromExe(bin)
              if (detectedMajor === targetNum) {
                try { fs.chmodSync(bin, 0o755) } catch {}
                return bin
              }
            }
          }
        }
      } catch {}
    }
  } else {
    // Linux: Check standard JVM directories
    const linuxRoots = [
      '/usr/lib/jvm',
      '/usr/java',
      '/opt/java',
      '/opt/jdk'
    ]
    for (const root of linuxRoots) {
      if (!fs.existsSync(root)) continue
      try {
        const subdirs = fs.readdirSync(root)
        for (const sub of subdirs) {
          const bin = findJavaBinary(path.join(root, sub))
          if (bin) {
            const detectedMajor = getJavaMajorFromExe(bin)
            if (detectedMajor === targetNum) {
              try { fs.chmodSync(bin, 0o755) } catch {}
              return bin
            }
          }
        }
      } catch {}
    }
  }

  // 4. Check JAVA_HOME if set
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    const bin = findJavaBinary(process.env.JAVA_HOME)
    if (bin) {
      const detectedMajor = getJavaMajorFromExe(bin)
      if (detectedMajor === targetNum) {
        if (process.platform !== 'win32') {
          try { fs.chmodSync(bin, 0o755) } catch {}
        }
        return bin
      }
    }
  }

  return null
}

// Download and extract Java runtime from Adoptium with full cross-platform (macOS x64/arm64, Linux, Windows) support
async function downloadAndInstallJava(
  targetMajor: '8' | '17' | '21' | '25',
  onProgress?: (status: string, percent?: number) => void
): Promise<string> {
  const javaDir = path.join(app.getPath('userData'), `java-runtime-${targetMajor}`)
  if (fs.existsSync(javaDir)) {
    try {
      fs.rmSync(javaDir, { recursive: true, force: true })
    } catch {}
  }
  fs.mkdirSync(javaDir, { recursive: true })

  onProgress?.(`Подготовка к загрузке Java ${targetMajor}...`, 5)

  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  const osName = isWin ? 'windows' : isMac ? 'mac' : 'linux'
  // On macOS Apple Silicon (arm64), Java 8 is only available as x64 (which runs seamlessly via Rosetta 2)
  let archName = process.arch === 'arm64' ? 'aarch64' : 'x64'
  if (isMac && targetMajor === '8') {
    archName = 'x64'
  }

  const archiveExt = isWin ? 'zip' : 'tar.gz'
  const archivePath = path.join(javaDir, `java.${archiveExt}`)

  const jreUrl = `https://api.adoptium.net/v3/binary/latest/${targetMajor}/ga/${osName}/${archName}/jre/hotspot/normal/eclipse`
  const jdkUrl = `https://api.adoptium.net/v3/binary/latest/${targetMajor}/ga/${osName}/${archName}/jdk/hotspot/normal/eclipse`

  let response: Response
  try {
    response = await fetch(jreUrl)
    if (!response.ok) throw new Error(`JRE status: ${response.status}`)
  } catch {
    response = await fetch(jdkUrl)
    if (!response.ok) throw new Error(`Не удалось скачать Java ${targetMajor}: ${response.statusText}`)
  }

  const contentLength = Number(response.headers.get('content-length')) || 0
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Не удалось прочитать поток ответа при скачивании Java')

  const fileStream = fs.createWriteStream(archivePath)
  let downloadedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      downloadedBytes += value.length
      fileStream.write(value)
      if (contentLength > 0) {
        const pct = Math.min(90, Math.round((downloadedBytes / contentLength) * 85) + 5)
        const mbDown = (downloadedBytes / (1024 * 1024)).toFixed(1)
        const mbTotal = (contentLength / (1024 * 1024)).toFixed(1)
        onProgress?.(`Скачивание Java ${targetMajor}... (${mbDown} / ${mbTotal} МБ)`, pct)
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.end(() => resolve())
    fileStream.on('error', reject)
  })

  onProgress?.(`Распаковка Java ${targetMajor}...`, 92)
  try {
    if (isWin) {
      await extract(archivePath, { dir: javaDir })
    } else {
      // macOS and Linux tar extract
      await new Promise<void>((resolve, reject) => {
        execFile('tar', ['-xzf', archivePath, '-C', javaDir], (err) => {
          if (err) reject(new Error(`Ошибка распаковки tar.gz: ${err.message}`))
          else resolve()
        })
      })
    }
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
  } catch (err: any) {
    try { fs.rmSync(javaDir, { recursive: true, force: true }) } catch {}
    throw new Error(`Ошибка распаковки Java: ${err.message || err}`)
  }

  onProgress?.(`Java ${targetMajor} успешно установлена!`, 100)
  const installedBin = findJavaBinary(javaDir)
  if (!installedBin) throw new Error(`Java ${targetMajor} распакована, но исполняемый файл не найден`)

  if (!isWin) {
    try {
      fs.chmodSync(installedBin, 0o755)
      const binDir = path.dirname(installedBin)
      const binFiles = fs.readdirSync(binDir)
      for (const bf of binFiles) {
        try { fs.chmodSync(path.join(binDir, bf), 0o755) } catch {}
      }
    } catch {}
  }

  return installedBin
}

// Ensures the correct Java version is ready without redownloading if already present
async function ensureJava(
  gameVersion: string,
  sendStatus: (msg: string) => void,
  versionData?: any,
  overrideJavaPath?: string
): Promise<{ javaPath: string; major: number }> {
  // If user specified custom Java path in settings
  if (overrideJavaPath && fs.existsSync(overrideJavaPath)) {
    const detectedMajor = getJavaMajorFromExe(overrideJavaPath) || 21
    return { javaPath: overrideJavaPath, major: detectedMajor }
  }

  const targetMajor = getRequiredJavaMajor(gameVersion, versionData)
  const targetNum = parseInt(targetMajor, 10)

  // Check if Java is already installed anywhere on the machine
  const existing = findInstalledJava(targetMajor)
  if (existing) {
    sendStatus(`Java ${targetMajor} готова к запуску!`)
    return { javaPath: existing, major: targetNum }
  }

  // Not installed: download runtime once
  sendStatus(`Java ${targetMajor} не найдена. Начинаем загрузку...`)
  const downloaded = await downloadAndInstallJava(targetMajor, (msg, pct) => {
    sendStatus(pct ? `${msg} [${pct}%]` : msg)
  })

  return { javaPath: downloaded, major: targetNum }
}

ipcMain.handle('get-installed-javas', async () => {
  const versions: ('8' | '17' | '21')[] = ['8', '17', '21']
  const result: Record<string, { installed: boolean; path: string | null }> = {}
  for (const v of versions) {
    const p = findInstalledJava(v)
    result[v] = {
      installed: !!p,
      path: p
    }
  }
  return result
})

ipcMain.handle('install-java', async (_event, version: '8' | '17' | '21') => {
  if (!['8', '17', '21'].includes(version)) {
    throw new Error(`Неподдерживаемая версия Java: ${version}`)
  }
  const installedPath = await downloadAndInstallJava(version, (status, progress) => {
    win?.webContents.send('java-install-progress', {
      version,
      status,
      progress: progress || 0
    })
  })
  return { success: true, path: installedPath }
})

// Helper to analyze Minecraft / JVM crashes and format diagnostics
function formatCrashReport(gameDir: string, launcherLogPath: string, exitCode: number): string {
  let crashReportPath: string | null = null
  let crashReportContent = ''

  // 1. Check crash-reports folder in game directory
  try {
    const crashReportsDir = path.join(gameDir, 'crash-reports')
    if (fs.existsSync(crashReportsDir)) {
      const files = fs.readdirSync(crashReportsDir)
        .filter(f => f.startsWith('crash-') && f.endsWith('.txt'))
        .map(f => {
          const fullPath = path.join(crashReportsDir, f)
          return { fullPath, name: f, mtime: fs.statSync(fullPath).mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)

      if (files.length > 0) {
        const latest = files[0]
        if (Date.now() - latest.mtime < 5 * 60 * 1000) {
          crashReportPath = latest.fullPath
          crashReportContent = fs.readFileSync(latest.fullPath, 'utf8')
        }
      }
    }
  } catch (e) {
    console.error('Error scanning crash-reports:', e)
  }

  // 2. If no crash report, check for hs_err_pid*.log (JVM Fatal Crash)
  if (!crashReportContent) {
    try {
      const candidateDirs = [gameDir, rootPath]
      for (const d of candidateDirs) {
        if (!fs.existsSync(d)) continue
        const hsFiles = fs.readdirSync(d)
          .filter(f => f.startsWith('hs_err_pid') && f.endsWith('.log'))
          .map(f => {
            const fullPath = path.join(d, f)
            return { fullPath, name: f, mtime: fs.statSync(fullPath).mtimeMs }
          })
          .sort((a, b) => b.mtime - a.mtime)

        if (hsFiles.length > 0 && (Date.now() - hsFiles[0].mtime < 5 * 60 * 1000)) {
          crashReportPath = hsFiles[0].fullPath
          crashReportContent = fs.readFileSync(hsFiles[0].fullPath, 'utf8')
          break
        }
      }
    } catch (e) {
      console.error('Error scanning hs_err_pid:', e)
    }
  }

  // 3. Read launcher log tail
  let launcherLogTail = ''
  try {
    if (fs.existsSync(launcherLogPath)) {
      const fullLog = fs.readFileSync(launcherLogPath, 'utf8')
      const lines = fullLog.split('\n')
      launcherLogTail = lines.slice(-80).join('\n')
    }
  } catch {}

  // 4. Intelligent Diagnostics
  const combinedText = (crashReportContent + '\n' + launcherLogTail).toLowerCase()
  let diagnosis = ''
  let recommendation = ''

  if (combinedText.includes('outofmemoryerror') || combinedText.includes('java heap space') || combinedText.includes('gc overhead limit exceeded')) {
    diagnosis = 'Недостаточно выделенной оперативной памяти (OutOfMemoryError).'
    recommendation = 'Перейдите в Настройки лаунчера (вкладка Minecraft) и увеличьте значение ОЗУ (рекомендуется от 3072 до 6144 MB для модов).'
  } else if (
    combinedText.includes('nvoglv64.dll') || 
    combinedText.includes('atio6axx.dll') || 
    combinedText.includes('atig6pxx.dll') || 
    combinedText.includes('ig9ic64.dll') || 
    combinedText.includes('ig10ic64.dll') ||
    (combinedText.includes('exception_access_violation') && (combinedText.includes('opengl') || combinedText.includes('d3d')))
  ) {
    diagnosis = 'Критический сбой видеодрайвера графического процессора (EXCEPTION_ACCESS_VIOLATION).'
    recommendation = 'Обновите драйвер видеокарты (NVIDIA / AMD / Intel), проверьте совместимость установленных шейдеров или отключите несовместимые моды графики.'
  } else if (combinedText.includes('unsatisfiedlinkerror') || combinedText.includes('can\'t find dependent libraries') || combinedText.includes('vcruntime140')) {
    diagnosis = 'Отсутствуют системные библиотеки или повреждены файлы нативных модулей (UnsatisfiedLinkError).'
    recommendation = 'Установите Microsoft Visual C++ 2015-2022 Redistributable (x64) и убедитесь, что путь к игре не содержит запрещенных символов.'
  } else if (combinedText.includes('mixin apply failed') || combinedText.includes('mixintransformererror') || combinedText.includes('mixin post transform')) {
    diagnosis = 'Конфликт модов при внедрении Mixin.'
    recommendation = 'Один из установленных модов несовместим с текущей версией игры или другим модом. Проверьте последние добавленные моды.'
  } else if (combinedText.includes('nosuchmethoderror') || combinedText.includes('nosuchfielderror') || combinedText.includes('classnotfoundexception')) {
    diagnosis = 'Несовместимость библиотек или версий модов (NoSuchMethodError / ClassNotFoundException).'
    recommendation = 'Убедитесь, что установлены все требуемые модами библиотеки (например, Fabric API, Cloth Config, Architectury) и версии соответствуют игре.'
  } else if (combinedText.includes('duplicatemodsfoundexception') || combinedText.includes('duplicate mods')) {
    diagnosis = 'Обнаружены дубликаты модов.'
    recommendation = 'В папке mods присутствуют несколько версий одного и того же мода. Удалите повторяющиеся файлы.'
  } else if (exitCode === -1073740791) {
    diagnosis = 'Сбой процесса игры (STATUS_STACK_BUFFER_OVERRUN / Код -1073740791).'
    recommendation = 'Чаще всего вызван сбоем видеодрайвера, оверлеями (Discord / RivaTuner / Geforce Experience) или конфликтом памяти.'
  } else if (exitCode === -1073741819) {
    diagnosis = 'Нарушение прав доступа к памяти (STATUS_ACCESS_VIOLATION / Код -1073741819).'
    recommendation = 'Проверьте стабильность видеодрайвера и отключите сторонние оверлеи.'
  } else if (exitCode !== 0) {
    diagnosis = `Игра аварийно завершилась с кодом ${exitCode}.`
    recommendation = 'Ознакомьтесь с деталями ниже для выяснения точной причины ошибки.'
  }

  const divider = '='.repeat(70)
  const header = [
    divider,
    '                    [ АНАЛИЗАТОР ОШИБОК КРАША ]',
    divider,
    `Код завершения игры: ${exitCode}`,
    `Время сбоя: ${new Date().toLocaleString()}`,
    ...(diagnosis ? [`\n[ДИАГНОЗ]: ${diagnosis}`] : []),
    ...(recommendation ? [`[РЕШЕНИЕ]: ${recommendation}`] : []),
    divider
  ].join('\n')

  let reportBody = ''
  if (crashReportPath && crashReportContent) {
    reportBody = [
      `\n>>> НАЙДЕН ДЕТАЛЬНЫЙ ОТЧЕТ ОБ ОШИБКЕ:`,
      `>>> Путь: ${crashReportPath}\n`,
      crashReportContent.trim(),
      `\n${divider}`,
      `>>> ХВОСТ ЛОГА ЗАПУСКА ЛАУНЧЕРА:\n`,
      launcherLogTail.trim()
    ].join('\n')
  } else {
    reportBody = [
      `\n>>> ДЕТАЛЬНЫЙ ЛОГ ЗАПУСКА MINECRAFT:\n`,
      launcherLogTail.trim() || '(Лог пуст)'
    ].join('\n')
  }

  return `${header}\n${reportBody}\n`
}

ipcMain.handle('launch-game', async (_event, options) => {
  const sendStatus = (msg: string) => win?.webContents.send('launch-progress', msg)
  
  try {
    sendStatus('Checking Java...')
    
    let actualMcVersion = options.version
    let versionType = 'release'
    let vJson: any = null
    const versionJsonPath = path.join(rootPath, 'versions', options.version, `${options.version}.json`)
    if (fs.existsSync(versionJsonPath)) {
      try {
        vJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))
        if (vJson.inheritsFrom) {
          actualMcVersion = vJson.inheritsFrom
          const parentPath = path.join(rootPath, 'versions', vJson.inheritsFrom, `${vJson.inheritsFrom}.json`)
          if (fs.existsSync(parentPath)) {
            try {
              const parentJson = JSON.parse(fs.readFileSync(parentPath, 'utf8'))
              if (!vJson.javaVersion && parentJson.javaVersion) {
                vJson.javaVersion = parentJson.javaVersion
              }
            } catch {}
          }
        } else if (vJson.clientVersion) {
          actualMcVersion = vJson.clientVersion
        }
        if (vJson.type) versionType = vJson.type
      } catch (e) {}
    }
    
    const { javaPath, major: javaMajor } = await ensureJava(actualMcVersion, sendStatus, vJson, options.javaPath)
    
    // Ensure executable permissions on non-Windows
    if (process.platform !== 'win32' && javaPath !== 'java') {
      try { fs.chmodSync(javaPath, 0o755) } catch {}
    }

    sendStatus('Initializing Minecraft Core...')
    
    let javaHome = path.dirname(path.dirname(javaPath))
    if (process.platform === 'darwin' && javaPath.includes('/Contents/Home/bin/java')) {
      javaHome = javaPath.replace(/\/bin\/java$/, '')
    }

    const totalSystemMem = Math.floor(os.totalmem() / (1024 * 1024))
    
    // Parse memory constraints
    let minRam = 1024;
    let maxRam = 2048;
    
    if (options.memory?.max) {
      const parsed = parseInt(options.memory.max.replace(/\D/g, ''))
      if (!isNaN(parsed) && parsed > 0) maxRam = parsed
    } else if (options.maxRam) {
      const parsed = parseInt(options.maxRam.toString().replace(/\D/g, ''))
      if (!isNaN(parsed) && parsed > 0) maxRam = parsed
    }
    
    // Bounds check
    if (maxRam < 1024) maxRam = 1024
    if (maxRam > totalSystemMem) maxRam = totalSystemMem
    
    let finalUuid = options.uuid || '00000000-0000-0000-0000-000000000000';
    if (finalUuid && finalUuid.length === 32 && !finalUuid.includes('-')) {
      finalUuid = `${finalUuid.slice(0,8)}-${finalUuid.slice(8,12)}-${finalUuid.slice(12,16)}-${finalUuid.slice(16,20)}-${finalUuid.slice(20)}`;
    }
    let finalAccessToken = options.token || '0';
    let finalClientToken = options.clientToken || '0';

    if (!options.uuid || options.uuid === '') {
      const hash = crypto.createHash('md5').update('OfflinePlayer:' + (options.username || 'Player')).digest();
      hash[6] = (hash[6] & 0x0f) | 0x30;
      hash[8] = (hash[8] & 0x3f) | 0x80;
      const hex = hash.toString('hex');
      finalUuid = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    if (options.authType === 'elyby' && options.token && options.clientToken) {
      try {
        const refreshRes = await fetch('https://authserver.ely.by/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: options.token,
            clientToken: options.clientToken,
            requestUser: true
          })
        });
        if (refreshRes.ok) {
          const refData: any = await refreshRes.json();
          finalAccessToken = refData.accessToken;
          finalClientToken = refData.clientToken;
        }
      } catch (e) {
        console.error('Failed to refresh Ely.by token:', e);
      }
    }

    const gameDir = options.modpackName ? path.join(rootPath, 'versions', options.instanceId) : rootPath

    const envOverrides: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(javaPath !== 'java' ? { JAVA_HOME: javaHome } : {})
    }
    if (process.platform === 'win32') {
      // Compatibility Shims to force High-Performance Discrete GPU for Minecraft Java on Windows
      envOverrides['SHIM_MCCOMPAT'] = '0x800000001'
      envOverrides['__NV_PRIME_RENDER_OFFLOAD'] = '1'
      envOverrides['__GLX_VENDOR_LIBRARY_NAME'] = 'nvidia'
    }

    // Default JVM args: UTF-8 & Cyrillic path support, IPv4 preference, and hardware OpenGL
    const defaultJvmArgs: string[] = [
      '-Dfile.encoding=UTF-8',
      '-Dsun.jnu.encoding=UTF-8',
      '-Djava.net.preferIPv4Stack=true',
      '-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=false'
    ]

    // Parse user custom JVM arguments from settings (mc_args)
    let userCustomArgs: string[] = []
    if (typeof options.jvmArgs === 'string' && options.jvmArgs.trim()) {
      const tokens = options.jvmArgs.trim().match(/(?:[^\s"]+|"[^"]*")+/g)
      if (tokens) {
        userCustomArgs = tokens.map((t: string) => t.replace(/^"|"$/g, ''))
      }
    } else if (Array.isArray(options.jvmArgs)) {
      userCustomArgs = options.jvmArgs.filter((a: any) => typeof a === 'string' && a.trim())
    }

    const opts: any = {
      clientPackage: undefined,
      authorization: {
        access_token: finalAccessToken,
        client_token: finalClientToken,
        uuid: finalUuid,
        name: options.username || 'Player',
        user_properties: {},
        meta: {
          type: options.authType === 'microsoft' ? 'msa' : 'mojang',
          demo: false
        }
      },
      root: rootPath,
      version: {
        number: options.version,
        type: versionType
      },
      memory: {
        max: `${maxRam}M`,
        min: `${minRam}M`
      },
      javaPath: javaPath,
      customArgs: [...defaultJvmArgs],
      overrides: {
        detached: false,
        env: envOverrides,
        gameDirectory: gameDir
      }
    }

    if (options.authType === 'elyby' || options.authType === 'pgsync') {
      const injectorPath = path.join(rootPath, 'authlib-injector.jar')
      if (!fs.existsSync(injectorPath)) {
        sendStatus('Downloading Skin system helper...')
        try {
          const response = await fetch('https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.8/authlib-injector-1.2.8.jar')
          if (!response.ok) throw new Error(`HTTP error ${response.status}`)
          const arrayBuffer = await response.arrayBuffer()
          fs.writeFileSync(injectorPath, Buffer.from(arrayBuffer))
          sendStatus('Skin helper downloaded!')
        } catch (e: any) {
          console.error('Failed to download authlib-injector', e)
          sendStatus(`Warning: Skin system failed: ${e.message}`)
        }
      }
      if (fs.existsSync(injectorPath)) {
        const yggdrasilUrl = options.authType === 'elyby' ? 'ely.by' : 'https://pg-sync-server.onrender.com/api/yggdrasil';
        let jvmArgs = [
          `-javaagent:${injectorPath}=${yggdrasilUrl}`,
          '-Dauthlibinjector.side=client'
        ]
        // Only pass modular JVM arguments on Java 9+ (Java 8 will crash with Unrecognized option: --add-opens)
        if (javaMajor > 8) {
          jvmArgs.push(
            '--add-opens=java.base/java.net=ALL-UNNAMED',
            '--add-opens=java.base/sun.security.util=ALL-UNNAMED',
            '--add-opens=java.base/java.util.jar=ALL-UNNAMED',
            '--add-opens=java.base/java.lang.invoke=ALL-UNNAMED',
            '--add-opens=java.base/java.lang=ALL-UNNAMED',
            '--add-opens=java.base/java.util=ALL-UNNAMED',
            '--add-exports=java.base/sun.security.util=ALL-UNNAMED',
            '--add-exports=java.naming/com.sun.jndi.ldap=ALL-UNNAMED'
          )
        }
        opts.customArgs = [
          ...jvmArgs,
          ...(opts.customArgs || [])
        ]
        sendStatus('Skin system injected!')
      }
    }

    // Handle modded versions
    if (options.loader === 'fabric') {
      const customId = await ensureFabric(options.version, sendStatus)
      opts.version.custom = customId
    } else if (options.loader === 'quilt') {
      const customId = await ensureQuilt(options.version, sendStatus)
      opts.version.custom = customId
    } else if (options.loader === 'forge') {
      const forgePath = await ensureForge(options.version, sendStatus)
      if (forgePath.endsWith('.jar')) {
        opts.forge = forgePath
        // Disable Forge's EarlyDisplay window - causes EXCEPTION_ACCESS_VIOLATION crash
        // on AMD Radeon GPUs (atio6axx.dll) with glMapBuffer calls
        opts.customArgs = [
          '-Dfml.earlyprogresswindow=false',
          '-Dforge.enableRenderQueue=false',
          ...(opts.customArgs || [])
        ]
      } else {
        // Modern forge (returned as custom version profile name)
        opts.version.custom = forgePath
        opts.forge = undefined
      }
    } else if (options.loader === 'neoforge') {
      throw new Error("NeoForge пока не поддерживается ядром лаунчера (MCLC). Пожалуйста, выберите Forge, Fabric или Quilt.");
    }

    // Append user custom JVM arguments last so user options take priority
    if (userCustomArgs.length > 0) {
      opts.customArgs = [
        ...(opts.customArgs || []),
        ...userCustomArgs
      ]
    }

    const logPath = path.join(app.getPath('userData'), 'minecraft_launcher.log')
    fs.writeFileSync(logPath, `--- Launching Game ${options.version} (${options.loader || 'vanilla'}) ---\n`)

    let gameStarted = false;

    // Remove any previous event listeners to eliminate EventEmitter memory leaks and duplicate handlers
    launcher.removeAllListeners()

    launcher.on('debug', (e: any) => {
      fs.appendFileSync(logPath, `[DEBUG] ${e}\n`)
    })
    launcher.on('data', (e: any) => {
      fs.appendFileSync(logPath, `[DATA] ${e}\n`)
      if (!gameStarted && e.includes('Download') && !e.includes('100%') && !e.includes('ERROR') && !e.includes('Error')) {
        sendStatus(e.substring(0, 50) + '...')
      }
    })
    let lastDownloadTime = 0;
    launcher.on('download-status', (e: any) => {
      if (!gameStarted) {
        const now = Date.now();
        if (now - lastDownloadTime < 100) return;
        lastDownloadTime = now;

        let dispName = e.name;
        if (dispName.length > 30 && /^[a-f0-9]+$/i.test(dispName)) dispName = 'Ассеты игры';
        else if (dispName.length > 30) dispName = dispName.substring(0, 30) + '...';

        sendStatus(`Скачивание: ${dispName} (${Math.round((e.current / e.total) * 100)}%)`)
        win?.webContents.send('download-update', { id: 'game_launch', name: 'Minecraft', text: `Скачивание: ${dispName}`, progress: Math.round((e.current / e.total) * 100) })
      }
    })
    launcher.on('progress', (e: any) => {
      if (!gameStarted) {
        sendStatus(`Проверка файлов: ${e.type} (${Math.round((e.task/e.total)*100)}%)`)
      }
    })
    
    launcher.on('close', (e: any) => {
      fs.appendFileSync(logPath, `[CLOSE] Game exited with code ${e}\n`)
      if (e !== 0) {
        win?.webContents.send('launch-progress', `Error: Game crashed (Code ${e}). Check logs!`)
        try {
          const formattedLog = formatCrashReport(gameDir, logPath, e)
          win?.webContents.send('game-crashed', formattedLog)
        } catch(err) {
          try {
            const rawLog = fs.readFileSync(logPath, 'utf8')
            win?.webContents.send('game-crashed', rawLog)
          } catch {}
        }
      }
      win?.webContents.send('game-closed')
      win?.show()
    })
    
    sendStatus('Preparing game files... (This may take a while)')
    await launcher.launch(opts)
    
    gameStarted = true;
    win?.webContents.send('download-finish', 'game_launch')
    sendStatus('Игра запущена')



    setTimeout(() => {
      sendStatus('')
    }, 5000)

    return { status: 'success' }
  } catch (error: any) {
    console.error(error)
    sendStatus(`Error: ${error.message}`)
    throw error
  }
})

// --- INSTALLER LOGIC ---
const lastInstallPathFile = path.join(app.getPath('appData'), 'pagrysha-launcher-data', 'last_install_path.txt');

function getSavedInstallPath(): string {
  try {
    if (fs.existsSync(lastInstallPathFile)) {
      const saved = fs.readFileSync(lastInstallPathFile, 'utf-8').trim();
      if (saved && saved.length > 0) {
        return saved;
      }
    }
  } catch (e) {}
  if (process.platform === 'win32') {
    return path.join(app.getPath('appData'), '..', 'Local', 'pagrysha-launcher');
  } else if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Applications', 'Pagrysha Launcher');
  } else {
    return path.join(app.getPath('home'), '.local', 'share', 'pagrysha-launcher');
  }
}

function saveInstallPath(targetPath: string) {
  try {
    const parent = path.dirname(lastInstallPathFile);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(lastInstallPathFile, targetPath, 'utf-8');
  } catch (e) {
    console.error('Failed to save install path:', e);
  }
}

ipcMain.handle('is-installer', () => {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
});

ipcMain.handle('select-folder', async (_, defaultPath?: string) => {
  const options: Electron.OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Выберите папку для установки Pagrysha Launcher'
  };
  if (defaultPath && typeof defaultPath === 'string' && defaultPath.trim().length > 0) {
    options.defaultPath = defaultPath;
  }
  const result = await dialog.showOpenDialog(options);
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-default-install-path', () => {
  return getSavedInstallPath();
});

ipcMain.handle('install-app', async (_, targetPath: string) => {
  let prevNoAsar = process.noAsar;
  try {
    const sourceDir = path.dirname(process.execPath);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
    // Save target install path so future updates/installers remember it
    saveInstallPath(targetPath);

    // Disable ASAR so fs.promises.cp treats app.asar as a normal file
    process.noAsar = true;
    await fs.promises.cp(sourceDir, targetPath, { recursive: true, force: true });
    process.noAsar = prevNoAsar;
    
    return true;
  } catch (error: any) {
    process.noAsar = prevNoAsar;
    console.error('Install error:', error);
    throw new Error('Ошибка установки: ' + error.message);
  }
});

import { spawn } from 'child_process';
ipcMain.handle('create-shortcuts', async (_, targetPath: string) => {
  try {
    const exeName = path.basename(process.execPath);
    const finalExePath = path.join(targetPath, exeName);

    const desktopDir = app.getPath('desktop');
    const shortcutPath = path.join(desktopDir, 'Pagrysha Launcher.lnk');
    shell.writeShortcutLink(shortcutPath, 'create', {
      target: finalExePath,
      icon: finalExePath,
      iconIndex: 0,
      description: 'Minecraft Launcher'
    });

    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (!fs.existsSync(startMenuDir)) fs.mkdirSync(startMenuDir, { recursive: true });
    const startMenuShortcutPath = path.join(startMenuDir, 'Pagrysha Launcher.lnk');
    shell.writeShortcutLink(startMenuShortcutPath, 'create', {
      target: finalExePath,
      icon: finalExePath,
      iconIndex: 0
    });
    return true;
  } catch (e: any) {
    console.error('Shortcut error:', e);
    throw new Error('Ошибка создания ярлыков: ' + e.message);
  }
});

ipcMain.handle('launch-installed', async (_, targetPath: string) => {
  const exeName = path.basename(process.execPath);
  const finalExePath = path.join(targetPath, exeName);
  
  // Create a copy of the environment variables without PORTABLE_EXECUTABLE_DIR
  // so the launched app doesn't think it's still the installer.
  const env = { ...process.env };
  delete env.PORTABLE_EXECUTABLE_DIR;
  
  spawn(finalExePath, [], { detached: true, stdio: 'ignore', env }).unref();
  app.quit();
});

ipcMain.handle('check-is-installed', (_, targetPath: string) => {
  const exeName = path.basename(process.execPath);
  const finalExePath = path.join(targetPath, exeName);
  return fs.existsSync(finalExePath);
});

async function purgeAllLauncherData(targetPath?: string) {
  const pathsToRemove: string[] = [];

  if (targetPath && typeof targetPath === 'string' && targetPath.trim().length > 0) {
    pathsToRemove.push(path.normalize(targetPath));
  }

  const appData = app.getPath('appData');
  const localAppData = path.join(appData, '..', 'Local');

  try {
    pathsToRemove.push(path.normalize(app.getPath('userData')));
  } catch (e) {}
  pathsToRemove.push(path.join(appData, 'pagrysha-launcher'));
  pathsToRemove.push(path.join(appData, 'Pagrysha Launcher'));
  pathsToRemove.push(path.join(appData, 'pagrysha-launcher-data'));

  pathsToRemove.push(path.join(localAppData, 'pagrysha-launcher'));
  pathsToRemove.push(path.join(localAppData, 'Pagrysha Launcher'));
  pathsToRemove.push(path.join(localAppData, 'pagrysha-launcher-updater'));
  pathsToRemove.push(path.join(localAppData, 'pagrysha-launcher-updater-temp'));

  const userHome = os.homedir();
  const systemDrive = process.env.SystemDrive || 'C:';

  for (const p of pathsToRemove) {
    const normalized = path.normalize(p);
    if (
      !normalized ||
      normalized === systemDrive ||
      normalized === systemDrive + '\\' ||
      normalized === userHome ||
      normalized === path.normalize(appData) ||
      normalized === path.normalize(localAppData)
    ) {
      continue;
    }

    try {
      if (fs.existsSync(normalized)) {
        await fs.promises.rm(normalized, { recursive: true, force: true });
      }
    } catch (e) {
      console.error(`Error purging path ${normalized}:`, e);
    }
  }

  try {
    const tempDir = app.getPath('temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        if (f.startsWith('mrpack_') || f.startsWith('pagrysha-')) {
          try {
            fs.rmSync(path.join(tempDir, f), { recursive: true, force: true });
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  try {
    const desktopDir = app.getPath('desktop');
    const shortcutPath = path.join(desktopDir, 'Pagrysha Launcher.lnk');
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);

    const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const startMenuShortcutPath = path.join(startMenuDir, 'Pagrysha Launcher.lnk');
    if (fs.existsSync(startMenuShortcutPath)) fs.unlinkSync(startMenuShortcutPath);
  } catch (e) {}
}

ipcMain.handle('uninstall-app', async (_, targetPath: string) => {
  try {
    await purgeAllLauncherData(targetPath);
    return true;
  } catch (e: any) {
    throw new Error('Ошибка удаления: ' + e.message);
  }
});

// --- DISCORD RPC ---
const discordClientId = '1526569235701043262';
let rpc: DiscordRPC.Client | null = null;
let rpcReady = false;
let currentPresence: any = null;

async function setupDiscordRPC() {
  DiscordRPC.register(discordClientId);
  rpc = new DiscordRPC.Client({ transport: 'ipc' });

  rpc.on('ready', () => {
    console.log('Discord RPC connected!');
    rpcReady = true;
    if (currentPresence) {
      rpc?.setActivity(currentPresence).catch(console.error);
    }
  });

  try {
    await rpc.login({ clientId: discordClientId });
  } catch (e) {
    console.error('Failed to connect Discord RPC:', e);
  }
}

ipcMain.on('update-discord-presence', (_, presence) => {
  currentPresence = presence;
  if (rpcReady && rpc) {
    rpc.setActivity({ ...presence, instance: false }).catch(console.error);
  }
});

app.on('before-quit', () => {
  if (rpcReady && rpc) {
    rpc.clearActivity().catch(console.error);
    rpc.destroy().catch(console.error);
  }
});

// --- AUTO UPDATER ---
function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}

ipcMain.handle('check-updates', async () => {
  try {
    const res = await fetch('https://api.github.com/repos/eshkereshek/pg_launcher/releases/latest');
    const data: any = await res.json();
    if (!data.tag_name) return { hasUpdate: false };
    
    const latestVersion = data.tag_name.replace('v', '');
    const currentVersion = app.getVersion();
    
    if (isNewerVersion(latestVersion, currentVersion)) {
      const downloadUrl = data.assets?.find((a: any) => a.name.endsWith('.exe'))?.browser_download_url;
      if (downloadUrl) {
        return { hasUpdate: true, version: latestVersion, downloadUrl };
      }
    }
    return { hasUpdate: false };
  } catch (e) {
    console.error('Update check failed:', e);
    return { hasUpdate: false };
  }
});

ipcMain.handle('download-and-run-update', async (event, url: string) => {
  try {
    saveInstallPath(path.dirname(process.execPath));
    const tempExePath = path.join(app.getPath('temp'), `Pagrysha_Update_${Date.now()}.exe`);
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
    
    const totalSize = parseInt(res.headers.get('content-length') || '0', 10);
    let downloadedSize = 0;
        if (res.body) {
        event.sender.send('download-update', { id: 'app_update', name: 'Обновление лаунчера', text: 'Загрузка...', progress: 0 });
        const fileStream = fs.createWriteStream(tempExePath);
      // @ts-ignore
      for await (const chunk of res.body) {
        fileStream.write(chunk);
        downloadedSize += chunk.length;
          if (totalSize > 0) {
            const progress = Math.round((downloadedSize / totalSize) * 100);
            event.sender.send('download-update', { id: 'app_update', name: 'Обновление лаунчера', text: `Загружено ${progress}%`, progress });
          }
        }
        fileStream.end();
        await new Promise<void>((resolve) => fileStream.on('close', () => resolve()));
        event.sender.send('download-finish', 'app_update');
      } else {
      throw new Error("No body in response");
    }

      // Run the downloaded exe
      const env = { ...process.env };
      delete env.PORTABLE_EXECUTABLE_DIR;
      spawn(tempExePath, [], { detached: true, stdio: 'ignore', env }).unref();
      setTimeout(() => app.quit(), 500);
      return true;
    } catch (e: any) {
      console.error('Download update failed:', e);
      event.sender.send('download-finish', 'app_update');
    throw new Error('Ошибка скачивания: ' + e.message);
  }
});

ipcMain.handle('search-servers', async (_, page = 1, region = 'russia') => {
  try {
    const url = region === 'global' 
      ? `https://minecraft-mp.com/servers/list/${page}/` 
      : `https://minecraft-mp.com/country/${region}/${page}/`;
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const servers: any[] = [];
    
    $('table.servers-table tbody tr').each((_, el) => {
      const name = $(el).find('.server-card > a').attr('title');
      if (!name) return; // skip rows without server cards

      let ip = $(el).find('button.copy-ip').attr('data-clipboard-text') || 
               $(el).find('a.btn-server-ip strong').text().trim() || 
               $(el).find('a.btn-server-ip').text().trim();
      
      let banner = $(el).find('.server-card > a img').attr('src') || 
                   $(el).find('.server-card > a video').attr('src') || '';
      
      let players = $(el).find('td:nth-child(4) strong').text().trim() || 
                    $(el).find('td:nth-child(4)').text().replace(/\s+/g, ' ').trim();
      
      let version = $(el).find('td:nth-child(3) a.btn-xs').text().trim() || 
                    $(el).find('a[href*="/version/"]').text().trim();

      const finalBanner = banner.startsWith('http') ? banner : (banner ? 'https://minecraft-mp.com' + banner : '');

      servers.push({
        name,
        ip,
        players,
        version,
        banner: finalBanner
      });
    });
    return servers;
  } catch (e) {
    console.error('Failed to scrape servers', e);
    return [];
  }
});
