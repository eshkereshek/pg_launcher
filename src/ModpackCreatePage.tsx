import { useState } from 'react'
import { FolderOpen, HardDrive, Loader2, Plus, Search, Sparkles } from 'lucide-react'
import { useTranslation } from './i18n'
import { McSelect } from './McSelect'
import BackButton from './BackButton'
import { errorText, showError, showOk } from './Toasts'
import './ModpackCreate.css'

/**
 * Значки по умолчанию. Те же, что в списке сборок и в её настройках: сборка,
 * созданная здесь, должна выглядеть так же, как везде. Экспортируем отсюда,
 * чтобы ModsMenu не держал второй список.
 */
export const PRESET_ICONS = [
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
  './iconsblocks/End_Stone_(inventory)_MCE.png',
  './iconsblocks/Bookshelf_(inventory)_MCE.png',
  './iconsblocks/Brick_Block_(inventory)_MCE.png',
  './iconsblocks/Coarse_Dirt_(inventory)_MCE.png',
  './iconsblocks/MCE_Dark_Prismarine_(inventory).png',
  './iconsblocks/MCE_Sticky_Piston_(inventory).png',
  './iconsblocks/Melon_(inventory)_MCE.png',
  './iconsblocks/Mycelium_(inventory)_MCE.png',
  './iconsblocks/Packed_Ice_(inventory)_MCE.png',
  './iconsblocks/Bucket_of_Pufferfish_(inventory)_MCE.png',
]

const LOADER_OPTIONS = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'neoforge', label: 'NeoForge' },
]

/**
 * Поиск сборок сторонних лаунчеров и их перенос в лаунчер.
 *
 * Сканирование только читает каталоги: файлы копируются лишь после нажатия
 * «Импортировать». Импортированная сборка сразу попадает в modpacks.json, чтобы
 * появиться в списке и на главной.
 */
function DiskImport({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation()
  const [packs, setPacks] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const scan = async () => {
    setBusy('scan')
    try {
      // @ts-ignore
      const res = await window.electronAPI.cfDetectPacks()
      setPacks(res?.packs || [])
    } catch (e) {
      showError(errorText(e, t('app.unknownError')))
    } finally {
      setBusy(null)
    }
  }

  /** Ручной выбор папки: нужен, если лаунчер пишет данные в нестандартное место. */
  const pickFolder = async () => {
    setBusy('pick')
    try {
      // @ts-ignore
      const dir = await window.electronAPI.selectFolder()
      if (!dir) return
      // @ts-ignore
      const res = await window.electronAPI.cfDetectPacks([dir])
      const found = res?.packs || []
      setPacks(prev => {
        const base = prev || []
        const known = new Set(base.map((p: any) => p.path))
        return [...base, ...found.filter((p: any) => !known.has(p.path))]
      })
    } catch (e) {
      showError(errorText(e, t('app.unknownError')))
    } finally {
      setBusy(null)
    }
  }

  const importPack = async (pack: any) => {
    setBusy(pack.path)
    try {
      // @ts-ignore
      const res = await window.electronAPI.cfImportPack(
        pack.path,
        pack.name,
        pack.gameVersion || '',
        pack.loader || ''
      )
      // @ts-ignore
      const list = (await window.electronAPI.getModpacks()) || []
      const name = res?.name || pack.name
      const entry = {
        name,
        loader: res?.loader || pack.loader || '',
        version: res?.gameVersion || pack.gameVersion || '',
        installedMods: [],
        icon: './iconsblocks/Chest_(inventory)_MCE.png',
        importedFrom: pack.source,
      }
      const idx = list.findIndex((m: any) => m.name === name)
      if (idx >= 0) list[idx] = { ...list[idx], ...entry }
      else list.push(entry)
      // @ts-ignore
      await window.electronAPI.saveModpacks(list)
      window.dispatchEvent(new CustomEvent('modpacks-updated'))
      showOk(t('mods.importedOk', { name }))
      setPacks(prev => (prev || []).filter(p => p.path !== pack.path))
    } catch (e) {
      showError(t('mods.importFailed', { error: errorText(e, t('app.unknownError')) }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mcp-step mcp-step-import">
      <div className="mcp-step-head">
        <span className="mcp-step-num mcp-step-num-icon">
          <HardDrive size={13} />
        </span>
        <h2 className="mcp-step-title">{t('mods.diskImportTitle')}</h2>
      </div>
      <div className="mcp-step-body">
        <p className="mcp-import-desc">{t('mods.diskImportDesc')}</p>

        <div className="mcp-import-actions">
          <button
            type="button"
            className="mods-btn-primary mcp-import-scan"
            onClick={() => { void scan() }}
            disabled={disabled || busy === 'scan'}
          >
            {busy === 'scan' ? <Loader2 size={14} className="mcp-spin" /> : <Search size={14} />}
            {busy === 'scan' ? t('mods.diskImportScanning') : t('mods.diskImportScan')}
          </button>
          <button
            type="button"
            className="mods-btn-ghost mcp-import-pick"
            onClick={() => { void pickFolder() }}
            disabled={disabled || busy === 'pick'}
          >
            <FolderOpen size={14} />
            {t('mods.diskImportPick')}
          </button>
          {packs !== null && (
            <span className="mcp-import-count">
              {t('mods.diskImportFound', { count: packs.length })}
            </span>
          )}
        </div>

        {packs !== null && packs.length === 0 && (
          <p className="mcp-import-empty">{t('mods.diskImportEmpty')}</p>
        )}

        {packs !== null && packs.length > 0 && (
          <ul className="mcp-import-list">
            {packs.map((pack: any) => (
              <li key={pack.path} className="mcp-import-item">
                <span className="mcp-import-source">{pack.source}</span>
                <div className="mcp-import-info">
                  <span className="mcp-import-name" title={pack.path}>{pack.name}</span>
                  <span className="mcp-import-meta">
                    {pack.gameVersion || '—'}
                    {pack.loader ? ` · ${pack.loader.toUpperCase()}` : ''}
                    {pack.mods ? ` · ${t('mods.diskImportMods', { count: pack.mods })}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="mods-btn-primary mcp-import-btn"
                  disabled={disabled || busy !== null}
                  onClick={() => { void importPack(pack) }}
                >
                  {busy === pack.path ? <Loader2 size={13} className="mcp-spin" /> : null}
                  {busy === pack.path ? t('mods.importing') : t('mods.importBtn')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
/**
 * ИИ-сборщик: игрок описывает сборку словами, модель отдаёт план, а моды в плане
 * уже подобраны по Modrinth — с реальными id и иконками. План подставляет
 * название, загрузчик и версию в форму, а сами моды ставятся после создания.
 */
function AiBuild({
  version,
  loader,
  onName,
  onLoader,
  onVersion,
  onMods,
}: {
  version: string
  loader: string
  onName: (v: string) => void
  onLoader: (v: string) => void
  onVersion: (v: string) => void
  onMods: (mods: any[]) => void
}) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      // @ts-ignore
      const res = await window.electronAPI.aiPlan(
        prompt.trim(),
        version || '1.20.1',
        loader || 'fabric',
        20,
      )
      setPlan(res)
      if (res?.name) onName(res.name)
      if (res?.loader) onLoader(res.loader)
      if (res?.gameVersion) onVersion(res.gameVersion)
      onMods(res?.mods || [])
    } catch (e: any) {
      setError(errorText(e, t('app.unknownError')))
      onMods([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mcp-step mcp-step-ai">
      <div className="mcp-step-head">
        <span className="mcp-step-num mcp-step-num-icon">
          <Sparkles size={13} />
        </span>
        <h2 className="mcp-step-title">{t('ai.title')}</h2>
      </div>
      <div className="mcp-step-body">
        <p className="mcp-import-desc">{t('ai.desc')}</p>
        <textarea
          className="mc-input mcp-ai-prompt"
          placeholder={t('ai.placeholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={busy}
        />
        <div className="mcp-import-actions">
          <button
            type="button"
            className="mods-btn-primary mcp-import-scan"
            onClick={() => { void generate() }}
            disabled={busy || !prompt.trim()}
          >
            {busy ? (
              <>
                <Loader2 size={14} className="spin" /> {t('ai.generating')}
              </>
            ) : (
              <>
                <Sparkles size={14} /> {t('ai.generate')}
              </>
            )}
          </button>
          {plan?.mods?.length ? (
            <span className="mcp-import-count">
              {t('ai.found', { count: plan.mods.length })}
            </span>
          ) : null}
        </div>

        {error ? <p className="mcp-ai-error">{error}</p> : null}

        {plan?.mods?.length ? (
          <>
            <p className="mcp-ai-summary">{plan.summary}</p>
            <ul className="mcp-ai-mods">
              {plan.mods.map((mod: any) => (
                <li key={mod.project_id} className="mcp-ai-mod">
                  {mod.icon_url ? <img src={mod.icon_url} alt="" /> : null}
                  <span title={mod.title}>{mod.title}</span>
                </li>
              ))}
            </ul>
            <p className="mcp-import-desc">{t('ai.note')}</p>
          </>
        ) : null}
      </div>
    </section>
  )
}

interface ModpackCreatePageProps {
  name: string
  onNameChange: (value: string) => void
  loader: string
  onLoaderChange: (value: string) => void
  version: string
  onVersionChange: (value: string) => void
  /** Пустая строка — «самая свежая версия загрузчика», как было раньше. */
  loaderVersion: string
  onLoaderVersionChange: (value: string) => void
  loaderVersions: string[]
  gameVersions: string[]
  icon: string
  onIconChange: (value: string) => void
  installOptifine: boolean
  onInstallOptifineChange: (value: boolean) => void
  installElyby: boolean
  onInstallElybyChange: (value: boolean) => void
  /** Сборка создаётся не мгновенно: OptiFine и фикс скинов качаются. */
  creating: boolean
  onCreate: () => void
  onClose: () => void
  /** Моды, подобранные ИИ: ставятся сразу после создания сборки. */
  aiMods: any[]
  onAiModsChange: (mods: any[]) => void
}

/**
 * Экран создания сборки. Композиция своя, не как у карточки мода: сверху
 * узкий рельс с крошками, дальше шаги одним потоком — название, окружение,
 * дополнения, значок. Справа предпросмотр сборки, внизу панель действий.
 * Вкладки, обложка с крупным значком и кнопка в шапке тут не используются.
 */
const ICON_SIZE = 128

export const cropToSquare = (source: string) =>
  new Promise<string>(resolve => {
    const image = new window.Image()

    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = ICON_SIZE
      canvas.height = ICON_SIZE
      const context = canvas.getContext('2d')
      if (!side || !context) {
        resolve(source)
        return
      }
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        ICON_SIZE,
        ICON_SIZE,
      )
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => resolve(source)
    image.src = source
  })

export default function ModpackCreatePage({
  name,
  onNameChange,
  loader,
  onLoaderChange,
  version,
  onVersionChange,
  loaderVersion,
  onLoaderVersionChange,
  loaderVersions,
  gameVersions,
  icon,
  onIconChange,
  installOptifine,
  onInstallOptifineChange,
  installElyby,
  onInstallElybyChange,
  creating,
  onCreate,
  onClose,
  aiMods,
  onAiModsChange,
  }: ModpackCreatePageProps) {
  const { t } = useTranslation()

  const isForge = loader === 'forge'
  const hasName = name.trim().length > 0
  // Пустое имя бэкенд превратил бы в папку без названия, поэтому кнопка
  // живая только с именем. Пока сборка создаётся, второй клик не нужен.
  const canCreate = hasName && !creating

  const handleSubmit = (event: React.FormEvent) => {
    // Enter в поле имени приходит сюда же, что и клик по кнопке.
    event.preventDefault()
    if (canCreate) onCreate()
  }

  const pickCustomIcon = async () => {
    try {
      // @ts-ignore
      const dataUrl = await window.electronAPI?.selectIconFile?.()
      if (dataUrl) onIconChange(await cropToSquare(dataUrl))
    } catch (e) {
      console.error('Не удалось выбрать файл значка:', e)
    }
  }

  return (
    <div className="mcp-page">
      <div className="mcp-rail">
        <BackButton onClick={onClose} disabled={creating} />
        <div className="mcp-crumb">
          <span>{t('app.mods')}</span>
          <span>/</span>
          <b>{t('mods.newModpack')}</b>
        </div>

      </div>

      <form className="mcp-main" onSubmit={handleSubmit}>
        <div className="mcp-body">
          <div className="mcp-form">
            <AiBuild
              version={version}
              loader={loader}
              onName={onNameChange}
              onLoader={onLoaderChange}
              onVersion={onVersionChange}
              onMods={onAiModsChange}
            />

            <section className="mcp-step">
              <div className="mcp-step-head">
                <span className="mcp-step-num">1</span>
                <h2 className="mcp-step-title">{t('mods.stepName')}</h2>
              </div>
              <div className="mcp-step-body">
                <div className="mcp-field">

                  <input
                    id="mcp-name"
                    type="text"
                    className="mc-input mcp-name"
                    value={name}
                    autoFocus
                    disabled={creating}
                    onChange={event => onNameChange(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="mcp-step">
              <div className="mcp-step-head">
                <span className="mcp-step-num">2</span>
                <h2 className="mcp-step-title">{t('mods.stepEnv')}</h2>
              </div>
              <div className="mcp-step-body">
                <div className="mcp-field">
                  <div className="mcp-chips">
                    {LOADER_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`mcp-chip ${loader === option.value ? 'on' : ''}`}
                        disabled={creating}
                        aria-pressed={loader === option.value}
                        onClick={() => onLoaderChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mcp-field-row">
                  <div className="mcp-field">
                    <span className="mcp-field-label">{t('mods.fieldVersion')}</span>
                    <McSelect
                      value={version}
                      onChange={onVersionChange}
                      disabled={creating}
                      options={gameVersions.map((v: string) => ({ value: v, label: v }))}
                    />
                  </div>

                  <div className="mcp-field">
                    <span className="mcp-field-label">{t('mods.fieldLoaderVersion')}</span>
                    <McSelect
                      value={loaderVersion}
                      onChange={onLoaderVersionChange}
                      disabled={creating}
                      options={[
                        { value: '', label: t('mods.autoLoaderVersion') },
                        ...loaderVersions.map((v: string) => ({ value: v, label: v })),
                      ]}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="mcp-step">
              <div className="mcp-step-head">
                <span className="mcp-step-num">3</span>
                <h2 className="mcp-step-title">{t('mods.stepExtras')}</h2>
              </div>
              <div className="mcp-step-body">
                {isForge && (
                  <button
                    type="button"
                    className={`mcp-option ${installOptifine ? 'on' : ''}`}
                    disabled={creating}
                    aria-pressed={installOptifine}
                    onClick={() => onInstallOptifineChange(!installOptifine)}
                  >
                    <span className="mcp-option-text">
                      <span className="mcp-option-title">{t('mods.installOptifine')}</span>
                    </span>
                    <span className={`mods-switch ${installOptifine ? 'on' : ''}`}>
                      <span />
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className={`mcp-option ${installElyby ? 'on' : ''}`}
                  disabled={creating}
                  aria-pressed={installElyby}
                  onClick={() => onInstallElybyChange(!installElyby)}
                >
                  <span className="mcp-option-text">
                    <span className="mcp-option-title">{t('mods.installElyby')}</span>
                  </span>
                  <span className={`mods-switch ${installElyby ? 'on' : ''}`}>
                    <span />
                  </span>
                </button>
              </div>
            </section>

            <section className="mcp-step">
              <div className="mcp-step-head">
                <span className="mcp-step-num">4</span>
                <h2 className="mcp-step-title">{t('mods.stepIcon')}</h2>
              </div>
              <div className="mcp-step-body">
                <div className="mcp-tiles">
                  <button
                    type="button"
                    className="mcp-tile-add"
                    title={t('mods.iconCustom')}
                    disabled={creating}
                    onClick={() => {
                      void pickCustomIcon()
                    }}
                  >
                    <Plus size={17} />
                  </button>
                  {PRESET_ICONS.map(preset => (
                    <img
                      key={preset}
                      src={preset}
                      alt=""
                      className={`mcp-tile ${icon === preset ? 'on' : ''}`}
                      onClick={() => {
                        if (!creating) onIconChange(preset)
                      }}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Перенос готовых сборок — под выбором значка: сначала игрок
                оформляет свою сборку, ниже видит вариант не создавать с нуля. */}
            <DiskImport disabled={creating} />
          </div>

          <aside className="mcp-aside">
            <div className="mcp-aside-group">
              <div className="mcp-aside-title">{t('mods.previewTitle')}</div>
              <div className="mcp-card">
                <div className="mcp-card-icon">
                  <img src={icon} alt="" />
                </div>
                <div className="mcp-card-info">
                  <div className="mcp-card-name">{hasName ? name.trim() : t('mods.newModpack')}</div>
                  <div className="mcp-card-meta">
                    {loader.toUpperCase()} · {version}
                    {loaderVersion ? ` / ${loaderVersion}` : ''}
                  </div>
                  {(isForge && installOptifine) || installElyby ? (
                    <div className="mcp-card-badges">
                      {isForge && installOptifine && <span className="mcp-badge on">OptiFine</span>}
                      {installElyby && <span className="mcp-badge on">Ely.by</span>}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mcp-footer">
          <div className="mcp-footer-actions">
            <button type="button" className="mods-btn-ghost" onClick={onClose} disabled={creating}>
              {t('mods.cancel')}
            </button>
            <button type="submit" className={`mods-btn-primary ${creating ? 'busy' : ''}`} disabled={!canCreate}>
              {creating ? <Loader2 size={14} className="mcp-spin" /> : null}
              {creating ? t('mods.creating') : t('mods.btnCreate')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
