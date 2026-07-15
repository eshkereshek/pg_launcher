import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'
import fs from 'node:fs'
import os from 'node:os'
import https from 'node:https'
import extract from 'extract-zip'
// @ts-ignore
import { Client } from 'minecraft-launcher-core'
import { Auth } from 'msmc'
// @ts-ignore
import DiscordRPC from 'discord-rpc'
import * as cheerio from 'cheerio'

const require = createRequire(import.meta.url)

// --- Patch MCLC for speed --- //
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

process.noDeprecation = true;
app.disableHardwareAcceleration();

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
    width: isInstaller ? 800 : 1000,
    height: isInstaller ? 500 : 600,
    minWidth: 800,
    minHeight: 500,
    resizable: !isInstaller,
    title: 'Pagrysha Launcher',
    icon: path.join(process.env.VITE_PUBLIC || '', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: false
  })

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
  setupDiscordRPC()
  createWindow()
})

ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-maximize', () => win?.isMaximized() ? win?.unmaximize() : win?.maximize())
ipcMain.on('window-close', () => win?.close())
ipcMain.on('window-hide', () => win?.hide())
ipcMain.on('window-show', () => win?.show())
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

// --- MINECRAFT LOGIC --- //
const rootPath = path.join(app.getPath('userData'), 'minecraft_data')
const modpacksFile = path.join(app.getPath('userData'), 'modpacks.json')
const accountsFile = path.join(app.getPath('userData'), 'accounts.json')

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
    return {
      type: 'elyby',
      username: data.selectedProfile.name,
      uuid: data.selectedProfile.id,
      token: data.accessToken,
      clientToken: data.clientToken,
      skinUrl: `https://ely.by/services/skins-renderer?url=https://skinsystem.ely.by/skins/${data.selectedProfile.name}.png&scale=5&renderFace=1`
    }
  } catch (e: any) {
    console.error(e)
    throw new Error('Ошибка Ely.by: ' + e.message)
  }
})

// --- SKINS PERSISTENCE ---
const skinsDir = path.join(app.getPath('userData'), 'skins')
import { dialog } from 'electron'

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

ipcMain.handle('get-popular-modpacks', async (_, version, offset = 0) => {
  try {
    const versionFacet = version ? `,["versions:${version}"]` : ''
    const url = `https://api.modrinth.com/v2/search?facets=[["project_type:modpack"]${versionFacet}]&index=downloads&limit=20&offset=${offset}`
    const res = await fetch(url)
    if (!res.ok) throw new Error("API error")
    const data: any = await res.json()
    return { hits: data.hits, totalHits: data.total_hits }
  } catch (e) {
    console.error('get-popular-modpacks failed:', e)
    return { hits: [], totalHits: 0 }
  }
})

ipcMain.handle('search-modpacks', async (_, query, version, offset = 0) => {
  try {
    const versionFacet = version ? `,["versions:${version}"]` : ''
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=[["project_type:modpack"]${versionFacet}]&limit=20&offset=${offset}`
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
  sendStatus('Поиск OptiFine...')
  
  try {
    const res = await fetch('https://bmclapi2.bangbang93.com/optifine/versionList')
    if (!res.ok) throw new Error("Failed to fetch OptiFine list")
    const versions = await res.json() as any[]
    
    const compatible = versions.filter(v => v.mcversion === gameVersion)
    if (compatible.length === 0) {
      sendStatus('OptiFine для этой версии не найден!')
      setTimeout(() => sendStatus(''), 3000)
      return { status: 'not_found' }
    }
    
    const target = compatible[compatible.length - 1]
    const filename = target.filename || `OptiFine_${target.mcversion}_${target.type}_${target.patch}.jar`
    
    const modsDir = path.join(rootPath, 'versions', instanceId, 'mods')
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })
    
    const zipPath = path.join(modsDir, filename)
    if (!fs.existsSync(zipPath)) {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      let success = false
      let lastError = ''
      
      // Source 1: BMCLAPI Primary
      try {
        sendStatus(`Скачивание ${filename} (Источник 1)...`)
        const dlUrl = `https://bmclapi.bangbang93.com/optifine/${target.mcversion}/${target.type}/${target.patch}`
        const dlRes = await fetch(dlUrl, { headers: { 'User-Agent': userAgent } })
        if (dlRes.ok) {
          const buffer = await dlRes.arrayBuffer()
          fs.writeFileSync(zipPath, Buffer.from(buffer))
          success = true
        } else {
          lastError = `BMCLAPI returned ${dlRes.status} ${dlRes.statusText}`
        }
      } catch (e: any) {
        lastError = e.message
      }
      
      // Source 2: FastMinecraftMirror
      if (!success) {
        try {
          sendStatus(`Скачивание ${filename} (Источник 2)...`)
          const dlUrl = `https://optifine.fastmcmirror.org/${filename}`
          const dlRes = await fetch(dlUrl, { headers: { 'User-Agent': userAgent } })
          if (dlRes.ok) {
            const buffer = await dlRes.arrayBuffer()
            fs.writeFileSync(zipPath, Buffer.from(buffer))
            success = true
          } else {
            lastError = `FastMinecraftMirror returned ${dlRes.status} ${dlRes.statusText}`
          }
        } catch (e: any) {
          lastError = e.message
        }
      }
      
      // Source 3: OptiFine.net Scraping
      if (!success) {
        try {
          sendStatus(`Скачивание ${filename} (Источник 3)...`)
          const adloadRes = await fetch(`https://optifine.net/adloadx?f=${filename}`, { headers: { 'User-Agent': userAgent } })
          const html = await adloadRes.text()
          const match = html.match(/downloadx\?f=OptiFine[^']+/)
          if (match) {
            const dlUrl = `https://optifine.net/${match[0]}`
            const dlRes = await fetch(dlUrl, { headers: { 'User-Agent': userAgent } })
            if (dlRes.ok) {
              const buffer = await dlRes.arrayBuffer()
              fs.writeFileSync(zipPath, Buffer.from(buffer))
              success = true
            } else {
              lastError = `OptiFine.net returned ${dlRes.status} ${dlRes.statusText}`
            }
          } else {
            lastError = 'Could not parse download link from OptiFine.net'
          }
        } catch (e: any) {
          lastError = e.message
        }
      }
      
      if (!success) {
        throw new Error(lastError || 'Не удалось скачать ни с одного источника')
      }
    }
    
    sendStatus('OptiFine успешно установлен!')
    return { status: 'success', filenames: [filename] }
  } catch (e: any) {
    sendStatus('Ошибка установки OptiFine: ' + e.message)
    setTimeout(() => sendStatus(''), 3000)
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
  
  // Check if forge is already installed in versions
  const forgeVersionDir = path.join(rootPath, 'versions', fullForgeVersion)
  if (fs.existsSync(forgeVersionDir)) {
    sendStatus('Forge already installed!')
    return installerPath
  }
  
  // Download installer
  sendStatus(`Downloading Forge ${forgeVersion}...`)
  const dlRes = await fetch(installerUrl)
  if (!dlRes.ok) throw new Error(`Failed to download Forge installer: ${dlRes.statusText}`)
  const buffer = await dlRes.arrayBuffer()
  fs.writeFileSync(installerPath, Buffer.from(buffer))
  
  sendStatus('Forge downloaded! Installing...')
  return installerPath
}

// Auto-download Java logic
async function ensureJava(gameVersion: string, sendStatus: (msg: string) => void): Promise<string> {
  // Determine Java version based on Minecraft version
  let javaVersion = '21' // default modern
  const parts = gameVersion.split('.')
  const major = parseInt(parts[0]) || 1
  const minor = parseInt(parts[1]) || 0
  const patch = parseInt(parts[2]) || 0

  if (major === 1) {
    if (minor <= 16) javaVersion = '8'
    else if (minor === 17) javaVersion = '16'
    else if (minor >= 18 && minor <= 19) javaVersion = '17'
    else if (minor === 20 && patch <= 4) javaVersion = '17'
    else javaVersion = '21'
  } else if (major >= 26) {
    javaVersion = '25'
  }

  const javaDir = path.join(app.getPath('userData'), `java-runtime-${javaVersion}`)

  const findJava = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      if (fs.statSync(fullPath).isDirectory()) {
        const res = findJava(fullPath)
        if (res) return res
      } else if (file === 'java.exe') {
        return fullPath
      }
    }
    return null
  }

  const existingJava = findJava(javaDir)
  if (existingJava) {
    sendStatus(`Java ${javaVersion} is already installed!`)
    return existingJava
  }

  sendStatus(`Downloading Java ${javaVersion} Runtime...`)
  if (fs.existsSync(javaDir)) {
    fs.rmSync(javaDir, { recursive: true, force: true })
  }
  fs.mkdirSync(javaDir, { recursive: true })
  const zipPath = path.join(javaDir, 'java.zip')

  // Adoptium Eclipse Temurin
  const url = `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/windows/x64/jre/hotspot/normal/eclipse`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download Java: ${response.statusText}`)
    const arrayBuffer = await response.arrayBuffer()
    fs.writeFileSync(zipPath, Buffer.from(arrayBuffer))
  } catch (err) {
    // Fallback to JDK if JRE is missing for some versions
    try {
      const jdkUrl = `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/windows/x64/jdk/hotspot/normal/eclipse`
      const response = await fetch(jdkUrl)
      if (!response.ok) throw new Error(`Failed to download Java JDK: ${response.statusText}`)
      const arrayBuffer = await response.arrayBuffer()
      fs.writeFileSync(zipPath, Buffer.from(arrayBuffer))
    } catch (err2) {
      throw new Error(`Java download failed: ${err2}`)
    }
  }

  sendStatus('Extracting Java Runtime...')
  try {
    await extract(zipPath, { dir: javaDir })
    fs.unlinkSync(zipPath)
  } catch (err) {
    fs.rmSync(javaDir, { recursive: true, force: true })
    throw new Error(`Failed to extract Java: ${err}`)
  }

  return findJava(javaDir) || 'java'
}

ipcMain.handle('launch-game', async (_event, options) => {
  const sendStatus = (msg: string) => win?.webContents.send('launch-progress', msg)
  
  try {
    sendStatus('Checking Java...')
    
    let actualMcVersion = options.version
    let versionType = 'release'
    const versionJsonPath = path.join(rootPath, 'versions', options.version, `${options.version}.json`)
    if (fs.existsSync(versionJsonPath)) {
      try {
        const vJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'))
        if (vJson.inheritsFrom) actualMcVersion = vJson.inheritsFrom
        else if (vJson.clientVersion) actualMcVersion = vJson.clientVersion
        if (vJson.type) versionType = vJson.type
      } catch (e) {}
    }
    
    const javaPath = await ensureJava(actualMcVersion, sendStatus)
    
    sendStatus('Initializing Minecraft Core...')
    
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
    
    const opts: any = {
      clientPackage: undefined,
      authorization: {
        access_token: options.token || '0',
        client_token: options.clientToken || '0',
        uuid: options.uuid || '00000000-0000-0000-0000-000000000000',
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
      overrides: {
        maxSockets: 32,
        detached: false,
        env: {
          ...process.env,
          ...(javaPath !== 'java' ? { JAVA_HOME: path.dirname(path.dirname(javaPath)) } : {})
        },
        gameDirectory: path.join(rootPath, 'versions', options.instanceId || options.version)
      }
    }

    if (options.authType === 'elyby') {
      const injectorPath = path.join(rootPath, 'authlib-injector.jar')
      if (!fs.existsSync(injectorPath)) {
        sendStatus('Downloading Ely.by Skin system helper...')
        try {
          const response = await fetch('https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.8/authlib-injector-1.2.8.jar')
          if (!response.ok) throw new Error(`HTTP error ${response.status}`)
          const arrayBuffer = await response.arrayBuffer()
          fs.writeFileSync(injectorPath, Buffer.from(arrayBuffer))
          sendStatus('Ely.by Skin helper downloaded!')
        } catch (e: any) {
          console.error('Failed to download authlib-injector', e)
          sendStatus(`Warning: Ely.by skin system failed: ${e.message}`)
        }
      }
      if (fs.existsSync(injectorPath)) {
        let jvmArgs = [`-javaagent:${injectorPath}=ely.by`]
        const minorVer = parseInt(options.version.split('.')[1]) || 0
        if (minorVer >= 17) {
          jvmArgs.push(
            '--add-opens=java.base/java.net=ALL-UNNAMED',
            '--add-opens=java.base/sun.security.util=ALL-UNNAMED',
            '--add-opens=java.base/java.util.jar=ALL-UNNAMED',
            '--add-opens=java.base/java.lang.invoke=ALL-UNNAMED',
            '--add-exports=java.base/sun.security.util=ALL-UNNAMED',
            '--add-exports=java.naming/com.sun.jndi.ldap=ALL-UNNAMED'
          )
        }
        opts.customArgs = [
          ...jvmArgs,
          ...(opts.customArgs || [])
        ]
        sendStatus('Ely.by skin system injected!')
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
      opts.forge = forgePath
    } else if (options.loader === 'neoforge') {
      throw new Error("NeoForge пока не поддерживается ядром лаунчера (MCLC). Пожалуйста, выберите Forge, Fabric или Quilt.");
    }

    const logPath = path.join(app.getPath('userData'), 'minecraft_launcher.log')
    fs.writeFileSync(logPath, `--- Launching Game ${options.version} (${options.loader || 'vanilla'}) ---\n`)

    let gameStarted = false;

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
          const crashLog = fs.readFileSync(logPath, 'utf8')
          win?.webContents.send('game-crashed', crashLog)
        } catch(err) {}
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
ipcMain.handle('is-installer', () => {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
});

ipcMain.handle('get-default-install-path', () => {
  return path.join(app.getPath('appData'), '..', 'Local', 'pagrysha-launcher');
});

ipcMain.handle('install-app', async (_, targetPath: string) => {
  let prevNoAsar = process.noAsar;
  try {
    const sourceDir = path.dirname(process.execPath);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
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
      description: 'Minecraft Launcher'
    });

    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    if (!fs.existsSync(startMenuDir)) fs.mkdirSync(startMenuDir, { recursive: true });
    const startMenuShortcutPath = path.join(startMenuDir, 'Pagrysha Launcher.lnk');
    shell.writeShortcutLink(startMenuShortcutPath, 'create', {
      target: finalExePath
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

ipcMain.handle('uninstall-app', async (_, targetPath: string) => {
  try {
    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    }
    const desktopDir = app.getPath('desktop');
    const shortcutPath = path.join(desktopDir, 'Pagrysha Launcher.lnk');
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);
    
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const startMenuShortcutPath = path.join(startMenuDir, 'Pagrysha Launcher.lnk');
    if (fs.existsSync(startMenuShortcutPath)) fs.unlinkSync(startMenuShortcutPath);
    
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
ipcMain.handle('check-updates', async () => {
  try {
    const res = await fetch('https://api.github.com/repos/eshkereshek/pg_launcher/releases/latest');
    const data: any = await res.json();
    if (!data.tag_name) return { hasUpdate: false };
    
    const latestVersion = data.tag_name.replace('v', '');
    const currentVersion = app.getVersion();
    
    if (latestVersion !== currentVersion) {
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
