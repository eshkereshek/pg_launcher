import { Palette, RotateCcw, Sun, Moon, Sparkles, Layers } from 'lucide-react'
import './customization.css'
import { useTranslation, type TKey } from './i18n'
import { useHalloween } from './Halloween'
import { Check } from './PixelIcons'
import {
  ACCENT_SWATCHES,
  PRESETS,
  type ThemeColors,
  type ThemeConfig,
  type Density,
  readableOn,
  shade
} from './theme'

/**
 * Вкладка «Кастомизация».
 *
 * Все изменения применяются сразу: тема — это CSS-слой, который пересобирается
 * на каждый клик, поэтому предпросмотр здесь не картинка, а сам лаунчер.
 * Маленькая карточка предпросмотра нужна, чтобы видеть результат, не уходя
 * с экрана настроек.
 */

interface Props {
  theme: ThemeConfig
  onChange: (patch: Partial<ThemeConfig>) => void
  onPreset: (presetId: string) => void
  onMode: (mode: 'dark' | 'light') => void
  onReset: () => void
}

const COLOR_FIELDS: { key: keyof ThemeColors; label: TKey; hint: TKey }[] = [
  { key: 'background', label: 'cz.roleBackground', hint: 'cz.roleBackgroundHint' },
  { key: 'panel', label: 'cz.rolePanel', hint: 'cz.rolePanelHint' },
  { key: 'card', label: 'cz.roleCard', hint: 'cz.roleCardHint' },
  { key: 'text', label: 'cz.roleText', hint: 'cz.roleTextHint' },
  { key: 'muted', label: 'cz.roleMuted', hint: 'cz.roleMutedHint' },
  { key: 'button', label: 'cz.roleButton', hint: 'cz.roleButtonHint' },
  { key: 'border', label: 'cz.roleBorder', hint: 'cz.roleBorderHint' }
]

const DENSITIES: { id: Density; label: TKey }[] = [
  { id: 'compact', label: 'cz.densityCompact' },
  { id: 'normal', label: 'cz.densityNormal' },
  { id: 'comfortable', label: 'cz.densityCozy' }
]

function isHex(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

export default function CustomizationTab({ theme, onChange, onPreset, onMode, onReset }: Props) {
  const colors = theme.colors
  const { t, language } = useTranslation()
  const halloween = useHalloween()

  const setColor = (key: keyof ThemeColors, value: string) => {
    if (!isHex(value)) return
    onChange({
      preset: 'custom',
      colors: { ...colors, [key]: value.toLowerCase() }
    })
  }

  const preview = (
    <div
      className="cz-preview"
      style={{
        background: colors.background,
        borderColor: colors.border
      }}
    >
      <div
        className="cz-preview-card"
        style={{ background: colors.card, borderColor: colors.border }}
      >
        <div className="cz-preview-head">
          <span className="cz-preview-avatar" style={{ background: colors.button }}>
            <Layers size={14} color={colors.text} />
          </span>
          <div className="cz-preview-titles">
            <span className="cz-preview-title" style={{ color: colors.text }}>{t('mods.modpackName')}</span>
            <span className="cz-preview-sub" style={{ color: colors.muted }}>FORGE · 1.20.1</span>
          </div>
          <span
            className="cz-preview-badge"
            style={{
              background: colors.accent,
              color: readableOn(colors.accent),
              borderColor: shade(colors.accent, -0.35)
            }}
          >
            {t('cz.active')}
          </span>
        </div>
        <p className="cz-preview-text" style={{ color: colors.muted }}>
          {t('cz.previewHint')}
        </p>
        <div className="cz-preview-actions">
          <span
            className="cz-preview-btn"
            style={{
              background: colors.accent,
              color: readableOn(colors.accent),
              borderColor: shade(colors.accent, -0.4)
            }}
          >
            {t('cz.navPlay')}
          </span>
          <span
            className="cz-preview-btn ghost"
            style={{
              background: colors.button,
              color: colors.text,
              borderColor: colors.border
            }}
          >
            {t('settings.title')}
          </span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <section className="settings-card">
        <div className="settings-card-head">
          <h2><Palette size={15} /> Цветовая тема</h2>
          <p>{t('cz.presetHint')}</p>
        </div>

        <div className="cz-presets">
          {PRESETS.map(preset => {
            const active = theme.preset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                className={`cz-preset ${active ? 'active' : ''}`}
                onClick={() => onPreset(preset.id)}
              >
                <span className="cz-preset-sample" style={{ background: preset.colors.background }}>
                  <span className="cz-preset-panel" style={{ background: preset.colors.panel }} />
                  <span className="cz-preset-card" style={{ background: preset.colors.card }}>
                    <i style={{ background: preset.colors.accent }} />
                    <b style={{ background: preset.colors.muted }} />
                  </span>
                </span>
                <span className="cz-preset-name">
                  {language === 'en' ? (preset.nameEn || preset.name) : preset.name}
                  {active && <Check size={12} />}
                </span>
              </button>
            )
          })}

          {theme.preset === 'custom' && (
            <div className="cz-preset active custom">
              <span className="cz-preset-sample" style={{ background: colors.background }}>
                <span className="cz-preset-panel" style={{ background: colors.panel }} />
                <span className="cz-preset-card" style={{ background: colors.card }}>
                  <i style={{ background: colors.accent }} />
                  <b style={{ background: colors.muted }} />
                </span>
              </span>
              <span className="cz-preset-name">{t('cz.customTheme')}<Check size={12} /></span>
            </div>
          )}
        </div>

        <div className="settings-inline" style={{ marginTop: '4px' }}>
          <div className="cz-seg">
            <button
              type="button"
              className={theme.mode === 'dark' ? 'active' : ''}
              onClick={() => onMode('dark')}
            >
              <Moon size={13} /> Тёмная
            </button>
            <button
              type="button"
              className={theme.mode === 'light' ? 'active' : ''}
              onClick={() => onMode('light')}
            >
              <Sun size={13} /> Светлая
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2><Sparkles size={15} /> Акцентный цвет</h2>
          <p>{t('cz.accentHint')}</p>
        </div>

        <div className="cz-swatches">
          {ACCENT_SWATCHES.map(color => (
            <button
              key={color}
              type="button"
              className={`cz-swatch ${colors.accent.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
              style={{ background: color }}
              title={color}
              onClick={() => setColor('accent', color)}
            />
          ))}
          <label className="cz-swatch custom" style={{ background: colors.accent }}>
            <input
              type="color"
              value={colors.accent}
              onChange={event => setColor('accent', event.target.value)}
            />
          </label>
          <input
            className="cz-hex"
            value={colors.accent}
            spellCheck={false}
            onChange={event => setColor('accent', event.target.value)}
          />
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('cz.colorsTitle')}</h2>
          <p>{t('cz.colorsDesc')}</p>
        </div>

        <div className="cz-color-list">
          {COLOR_FIELDS.map(field => (
            <label key={field.key} className="cz-color-row">
              <span className="cz-color-label">
                {t(field.label)}
                <small>{t(field.hint)}</small>
              </span>
              <input
                type="color"
                className="cz-color-input"
                value={colors[field.key]}
                onChange={event => setColor(field.key, event.target.value)}
              />
              <input
                className="cz-hex"
                value={colors[field.key]}
                spellCheck={false}
                onChange={event => setColor(field.key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('cz.effectsTitle')}</h2>
          <p>{t('cz.effectsDesc')}</p>
        </div>

        <div className="settings-check-list">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={theme.animations}
              onChange={event => onChange({ animations: event.target.checked })}
            />
            <span className="settings-check-text">
              <span className="settings-check-title">{t('cz.animations')}</span>
              <span className="settings-check-desc">{t('cz.animationsDesc')}</span>
            </span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={theme.blur}
              onChange={event => onChange({ blur: event.target.checked })}
            />
            <span className="settings-check-text">
              <span className="settings-check-title">{t('cz.blur')}</span>
              <span className="settings-check-desc">{t('cz.blurDesc')}</span>
            </span>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={theme.effects}
              onChange={event => onChange({ effects: event.target.checked })}
            />
            <span className="settings-check-text">
              <span className="settings-check-title">{t('cz.effects')}</span>
              <span className="settings-check-desc">{t('cz.effectsNote')}</span>
            </span>
          </label>
          {/* Лента «Рекомендуем» на главном экране: её можно убрать, если
              игроку нужен только собственный список сборок. */}
          <label className="settings-check">
            <input
              type="checkbox"
              checked={theme.showRecommended !== false}
              onChange={event => onChange({ showRecommended: event.target.checked })}
            />
            <span className="settings-check-text">
              <span className="settings-check-title">{t('cz.recommended')}</span>
              <span className="settings-check-desc">{t('cz.recommendedDesc')}</span>
            </span>
          </label>
          {/* Хеллоуин живёт отдельным переключателем: он не часть темы, а
              сезонный декор, и по умолчанию включается сам на неделю Хеллоина. */}
          <label className="settings-check">
            <input
              type="checkbox"
              checked={halloween.on}
              onChange={event => halloween.setMode(event.target.checked ? 'on' : 'off')}
            />
            <span className="settings-check-text">
              <span className="settings-check-title">{t('settings.halloweenTitle')}</span>
              <span className="settings-check-desc">{t('settings.halloweenDesc')}</span>
            </span>
          </label>
        </div>

        <div className="settings-inline" style={{ marginTop: '6px' }}>
          <div className="cz-seg">
            {DENSITIES.map(item => (
              <button
                key={item.id}
                type="button"
                className={theme.density === item.id ? 'active' : ''}
                onClick={() => onChange({ density: item.id })}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('cz.previewTitle')}</h2>
          <p>{t('cz.previewDesc')}</p>
        </div>

        {preview}

        <div className="settings-inline" style={{ marginTop: '4px' }}>
          <button type="button" className="settings-action-btn" onClick={onReset}>
            <RotateCcw size={12} /> Вернуть оформление по умолчанию
          </button>
        </div>
      </section>
    </>
  )
}
