import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import BackButton from './BackButton'
import { PRESET_ICONS, cropToSquare } from './ModpackCreatePage'
import { useTranslation } from './i18n'

interface ModpackSettingsPageProps {
  name: string
  onNameChange: (value: string) => void
  icon: string
  onIconChange: (value: string) => void
  version: string
  loader: string
  modsCount: number
  saving?: boolean
  deleting?: boolean
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Настройки существующей сборки отдельной страницей, а не модальным окном:
 * так же, как создание сборки — с рельсой «назад», секциями и подвалом.
 * Функциональность прежняя: переименование, значок, удаление.
 */
export default function ModpackSettingsPage({
  name,
  onNameChange,
  icon,
  onIconChange,
  version,
  loader,
  modsCount,
  saving = false,
  deleting = false,
  onSave,
  onDelete,
  onClose,
}: ModpackSettingsPageProps) {
  const { t } = useTranslation()
  // Удаление необратимо, поэтому первая кнопка только взводит подтверждение.
  const [confirmDelete, setConfirmDelete] = useState(false)

  const hasName = name.trim().length > 0
  const canSave = hasName && !saving && !deleting

  const pickCustomIcon = async () => {
    try {
      // @ts-ignore
      const dataUrl = await window.electronAPI?.selectIconFile?.()
      if (dataUrl) onIconChange(await cropToSquare(dataUrl))
    } catch (e) {
      console.error('Не удалось выбрать файл значка:', e)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (canSave) onSave()
  }

  return (
    <div className="mcp-page">
      <div className="mcp-rail">
        <BackButton onClick={onClose} disabled={saving || deleting} />
        <div className="mcp-crumb">
          <span>{t('app.mods')}</span>
          <span>/</span>
          <b>{t('mods.modpackSettings')}</b>
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
                    type="text"
                    className="mc-input mcp-name"
                    value={name}
                    autoFocus
                    disabled={saving || deleting}
                    onChange={event => onNameChange(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="mcp-step">
              <div className="mcp-step-head">
                <span className="mcp-step-num">2</span>
                <h2 className="mcp-step-title">{t('mods.stepIcon')}</h2>
              </div>
              <div className="mcp-step-body">
                <div className="mcp-tiles">
                  <button
                    type="button"
                    className="mcp-tile-add"
                    title={t('mods.iconCustom')}
                    disabled={saving || deleting}
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
                        if (!saving && !deleting) onIconChange(preset)
                      }}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="mcp-step mcp-step-danger">
              <div className="mcp-step-head">
                <span className="mcp-step-num mcp-step-num-danger">!</span>
                <h2 className="mcp-step-title">{t('mods.dangerZone')}</h2>
              </div>
              <div className="mcp-step-body">
                <p className="mcp-import-desc">{t('mods.deletePackDesc')}</p>
                <div className="mcp-import-actions">
                  <button
                    type="button"
                    className={`mcp-danger-btn ${confirmDelete ? 'on' : ''}`}
                    disabled={saving || deleting}
                    onClick={() => {
                      if (confirmDelete) onDelete()
                      else setConfirmDelete(true)
                    }}
                    onBlur={() => setConfirmDelete(false)}
                  >
                    {deleting
                      ? t('mods.deleting')
                      : confirmDelete
                        ? t('mods.areYouSure')
                        : t('mods.deleteModpack')}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside className="mcp-aside">
            <div className="mcp-aside-group">
              <div className="mcp-aside-title">{t('mods.stepInfo')}</div>
              <div className="mcp-card">
                <div className="mcp-card-icon">
                  <img src={icon} alt="" />
                </div>
                <div className="mcp-card-info">
                  <div className="mcp-card-name">{hasName ? name.trim() : t('mods.modpackName')}</div>
                  <div className="mcp-card-meta">
                    {loader ? loader.toUpperCase() : '—'} · {version || '—'}
                  </div>
                  <div className="mcp-card-badges">
                    <span className="mcp-badge on">
                      {t('mods.diskImportMods', { count: modsCount })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mcp-footer">
          <div className="mcp-footer-actions">
            <button
              type="button"
              className="mods-btn-ghost"
              onClick={onClose}
              disabled={saving || deleting}
            >
              {t('mods.cancel')}
            </button>
            <button
              type="submit"
              className={`mods-btn-primary ${saving ? 'busy' : ''}`}
              disabled={!canSave}
            >
              {saving ? <Loader2 size={14} className="mcp-spin" /> : null}
              {saving ? t('mods.saving') : t('mods.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
