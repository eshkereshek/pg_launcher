import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from './i18n'
import { McSelect } from './McSelect'
import BackButton from './BackButton'
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
