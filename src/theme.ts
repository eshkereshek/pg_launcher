// Темизация лаунчера.
//
// В CSS лаунчера цвета живут двумя способами: переменные (--pg-*, --surface-*)
// и просто числа в правилах конкретных панелей. Переменных хватает на акцент и
// часть поверхностей, но фон карточек или цвет строки списка заданы на месте.
// Поэтому тема применяется слоем правил, который подключается последним и
// перекрывает цвета через !important. Так не приходится править полторы тысячи
// строк существующих стилей — и обычный вид без кастомизации остаётся прежним.

export type ThemeMode = 'dark' | 'light'
export type Density = 'compact' | 'normal' | 'comfortable'

export interface ThemeColors {
  /** Основной акцент: кнопки, активные пункты, подсветка. */
  accent: string
  /** Фон приложения за панелями. */
  background: string
  /** Боковая панель, шапки, полосы. */
  panel: string
  /** Карточки и строки списков. */
  card: string
  /** Основной текст. */
  text: string
  /** Подписи и второстепенный текст. */
  muted: string
  /** Нейтральные кнопки. */
  button: string
  /** Границы и разделители. */
  border: string
}

export interface ThemeConfig {
  mode: ThemeMode
  /** id готовой темы или `custom`, если цвета правлены вручную. */
  preset: string
  colors: ThemeColors
  animations: boolean
  blur: boolean
  effects: boolean
  density: Density
  /** Показывать ленту «Рекомендуем» на главном экране. */
  showRecommended: boolean
}

export interface ThemePreset {
  id: string
  name: string
  /** Название в английском интерфейсе. */
  nameEn?: string
  mode: ThemeMode
  colors: ThemeColors
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  preset: 'pagrysha',
  colors: {
    accent: '#f1c40f',
    background: '#151515',
    panel: '#1b1b1b',
    card: '#202020',
    text: '#ffffff',
    muted: '#8f8f8f',
    button: '#262626',
    border: '#2a2a2a'
  },
  animations: true,
  blur: true,
  effects: true,
  density: 'normal',
  showRecommended: true
}

export const PRESETS: ThemePreset[] = [
  {
    id: 'pagrysha',
    name: 'Пагрыша',
    nameEn: 'Pagrysha',
    mode: 'dark',
    colors: { ...DEFAULT_THEME.colors }
  },
  {
    id: 'emerald',
    name: 'Изумруд',
    nameEn: 'Emerald',
    mode: 'dark',
    colors: {
      accent: '#3ddc84',
      background: '#0f1512',
      panel: '#151d19',
      card: '#1b2620',
      text: '#eaf6ef',
      muted: '#8aa596',
      button: '#22302a',
      border: '#27362e'
    }
  },
  {
    id: 'azure',
    name: 'Лазурь',
    nameEn: 'Azure',
    mode: 'dark',
    colors: {
      accent: '#4aa3ff',
      background: '#0e131b',
      panel: '#141b25',
      card: '#1a2430',
      text: '#e9f1fb',
      muted: '#8ba0b8',
      button: '#212d3b',
      border: '#24313f'
    }
  },
  {
    id: 'sunset',
    name: 'Закат',
    nameEn: 'Sunset',
    mode: 'dark',
    colors: {
      accent: '#ff8a3d',
      background: '#191210',
      panel: '#221816',
      card: '#2a1e1a',
      text: '#fbeee6',
      muted: '#b39383',
      button: '#33241f',
      border: '#3a2a24'
    }
  },
  {
    id: 'neon',
    name: 'Неон',
    nameEn: 'Neon',
    mode: 'dark',
    colors: {
      accent: '#d05cf5',
      background: '#130f1a',
      panel: '#191323',
      card: '#20192c',
      text: '#f2e9fb',
      muted: '#a08fb8',
      button: '#281f36',
      border: '#2f2540'
    }
  },
  {
    id: 'midnight',
    name: 'Полночь',
    nameEn: 'Midnight',
    mode: 'dark',
    colors: {
      accent: '#7aa2f7',
      background: '#0b0d12',
      panel: '#11141b',
      card: '#161a23',
      text: '#e6ebf5',
      muted: '#8891a5',
      button: '#1d222d',
      border: '#232936'
    }
  },
  {
    id: 'light',
    name: 'Светлая',
    nameEn: 'Light',
    mode: 'light',
    colors: {
      accent: '#c8950a',
      background: '#eceff3',
      panel: '#ffffff',
      card: '#f5f7fa',
      text: '#16181d',
      muted: '#5f6672',
      button: '#e4e8ee',
      border: '#d3d8e0'
    }
  }
]

/** Акценты для быстрого выбора — те же, что в готовых темах, плюс пара своих. */
export const ACCENT_SWATCHES = [
  '#f1c40f',
  '#ff8a3d',
  '#ff5c5c',
  '#3ddc84',
  '#4aa3ff',
  '#7aa2f7',
  '#d05cf5',
  '#e8e8e8'
]

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function toRgb(hex: string): [number, number, number] {
  let value = hex.replace('#', '')
  if (value.length === 3) {
    value = value.split('').map(ch => ch + ch).join('')
  }
  const num = Number.parseInt(value, 16)
  if (!Number.isFinite(num)) return [0, 0, 0]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Сдвинуть цвет к белому (amount > 0) или к чёрному (amount < 0).
 * Нужен для фасок, наведения и «вдавленных» состояний: держать для каждого
 * оттенка отдельное поле в настройках бессмысленно.
 */
export function shade(hex: string, amount: number): string {
  if (!HEX.test(hex)) return hex
  const [r, g, b] = toRgb(hex)
  const target = amount >= 0 ? 255 : 0
  const k = Math.min(1, Math.abs(amount))
  return toHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k)
}

/** Цвет с прозрачностью: rgba(...) из hex. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Насколько светлый фон — от этого зависит направление фасок и теней. */
export function isLight(hex: string): boolean {
  const [r, g, b] = toRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55
}

/** Текст, который читается на заданном фоне (для подписей на акцентных кнопках). */
export function readableOn(hex: string): string {
  return isLight(hex) ? '#141414' : '#ffffff'
}

export function findPreset(id: string): ThemePreset | undefined {
  return PRESETS.find(preset => preset.id === id)
}

/** Тема из готового набора: режим берётся у набора. */
export function presetTheme(id: string): ThemeConfig {
  const preset = findPreset(id)
  if (!preset) return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } }
  return {
    ...DEFAULT_THEME,
    mode: preset.mode,
    preset: preset.id,
    colors: { ...preset.colors }
  }
}

/**
 * Переключение светлой и тёмной темы.
 *
 * Цвета не инвертируются арифметически — это даёт грязные оттенки. Для своего
 * набора берём ближайший готовый (светлый или самый тёмный), сохраняя акцент:
 * акцент — то, что игрок выбрал осознанно.
 */
export function withMode(theme: ThemeConfig, mode: ThemeMode): ThemeConfig {
  if (mode === theme.mode) return theme
  const accent = theme.colors.accent
  const base = mode === 'light' ? presetTheme('light') : presetTheme('pagrysha')
  return {
    ...theme,
    mode,
    preset: 'custom',
    colors: { ...base.colors, accent }
  }
}

/** Привести прочитанное из настроек к валидной теме: файл мог остаться от старой версии. */
export function sanitizeTheme(raw: any): ThemeConfig {
  const source = raw && typeof raw === 'object' ? raw : {}
  const colors: ThemeColors = { ...DEFAULT_THEME.colors }
  const incoming = source.colors && typeof source.colors === 'object' ? source.colors : {}

  for (const key of Object.keys(colors) as (keyof ThemeColors)[]) {
    const value = incoming[key]
    if (typeof value === 'string' && HEX.test(value)) {
      colors[key] = value.toLowerCase()
    }
  }

  const density: Density =
    source.density === 'compact' || source.density === 'comfortable' ? source.density : 'normal'

  return {
    mode: source.mode === 'light' ? 'light' : 'dark',
    preset: typeof source.preset === 'string' && source.preset ? source.preset : 'custom',
    colors,
    animations: source.animations !== false,
    blur: source.blur !== false,
    effects: source.effects !== false,
    density,
    showRecommended: source.showRecommended !== false
  }
}

const DENSITY_VALUES: Record<Density, { row: number; gap: number; pad: string; nav: number }> = {
  compact: { row: 44, gap: 2, pad: '12px 14px', nav: 38 },
  normal: { row: 56, gap: 4, pad: '15px 16px', nav: 42 },
  comfortable: { row: 64, gap: 6, pad: '20px 22px', nav: 46 }
}

/**
 * CSS темы. Единственное место, где перечислены поверхности лаунчера —
 * если добавляется новый экран с собственным фоном, его нужно дописать сюда.
 */
export function themeCss(theme: ThemeConfig): string {
  const c = theme.colors
  const light = theme.mode === 'light'
  const dark = !light
  const density = DENSITY_VALUES[theme.density]

  const cardDeep = shade(c.card, dark ? 0.035 : -0.02)
  const panelDeep = shade(c.panel, dark ? 0.05 : -0.03)
  const ink = c.text
  const shadow = dark ? '#000000' : '#b9c0cc'

  return `
:root {
  --pg-bg: ${c.background};
  --pg-panel: ${c.panel};
  --pg-card: ${c.card};
  --pg-line: ${c.border};
  --pg-fg: ${c.text};
  --pg-muted: ${c.muted};
  --pg-accent: ${c.accent};
  --pg-accent-hover: ${shade(c.accent, 0.12)};
  --pg-accent-dark: ${shade(c.accent, -0.2)};
  --pg-on-accent: ${readableOn(c.accent)};
  --pg-btn: ${c.button};

  /* Прежние имена: на них завязана половина стилей лаунчера. */
  --pg-black: ${c.background};
  --pg-dark: ${c.panel};
  --pg-dark2: ${c.card};
  --pg-dark3: ${c.border};
  --pg-yellow: ${c.accent};
  --pg-yellow-hover: ${shade(c.accent, 0.12)};
  --pg-yellow-dark: ${shade(c.accent, -0.2)};
  --pg-text: ${ink};
  --pg-text-muted: ${c.muted};
  --surface-0: ${c.background};
  --surface-1: ${panelDeep};
  --surface-2: ${c.card};
  --surface-3: ${cardDeep};
  --border-soft: ${c.border};
  --text-1: ${ink};
  --text-2: ${c.muted};
  --text-3: ${shade(c.muted, dark ? -0.18 : 0.18)};
  --pg-row-h: ${density.row}px;
  --pg-row-gap: ${density.gap}px;
  --pg-card-pad: ${density.pad};
  --pg-nav-h: ${density.nav}px;
  --pg-track: ${shade(c.card, dark ? -0.06 : -0.04)};

  /* Полупрозрачные слои акцента: рамки чипов, подсветка строк и плашек.
     В разметке оставались rgba(241, 196, 15, …) от старой жёлтой палитры. */
  --pg-accent-faint: ${alpha(c.accent, 0.08)};
  --pg-accent-soft: ${alpha(c.accent, 0.14)};
  --pg-accent-line: ${alpha(c.accent, 0.4)};

  /* Плашка кнопки «Играть» (инлайн-SVG): грань, подсветка, фаска, контур.
     Всё выводится из акцента, поэтому кнопка живёт в любой теме. */
  --pb-face-top: ${shade(c.accent, 0.32)};
  --pb-face-1: ${shade(c.accent, 0.18)};
  --pb-face-2: ${c.accent};
  --pb-face-3: ${shade(c.accent, -0.1)};
  --pb-shine: ${shade(c.accent, 0.45)};
  --pb-side: ${shade(c.accent, 0.3)};
  --pb-soft: ${c.accent};
  --pb-lip: ${shade(c.accent, 0.28)};
  --pb-bevel: ${shade(c.accent, -0.42)};
  --pb-bevel-hi: ${shade(c.accent, -0.28)};
  --pb-corner: ${shade(c.accent, -0.32)};
  --pb-line: ${shade(c.accent, -0.82)};
}

/* --- Оболочка -------------------------------------------------------- */
body, .app-container {
  background: var(--pg-bg) !important;
  color: var(--pg-fg) !important;
}

.custom-titlebar {
  background: ${shade(c.panel, dark ? 0.08 : -0.05)} !important;
  color: ${c.muted} !important;
  border-bottom: 1px solid ${c.border} !important;
}

.jl-main, .settings-view, .settings-pane,
.mods-menu, .accounts-page {
  background: var(--pg-bg) !important;
  color: ${ink} !important;
}

/* Обои рисует ::before у .jl-main, а затемнение — ::after с --surface-0.
   Значит сам .jl-main и .jl-content должны оставаться прозрачными: раньше
   заливка контента закрывала картинку целиком, и обои «не работали». */
.jl-main.has-wallpaper,
.jl-content {
  background: transparent !important;
}

/* --- Боковая панель --------------------------------------------------- */
.jl-sidebar {
  background: ${shade(c.panel, dark ? 0.015 : -0.02)} !important;
  border-right: 2px solid ${shade(c.background, dark ? -0.25 : -0.12)} !important;
  color: var(--pg-fg) !important;
}

.jl-profile {
  background: ${c.card} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.15)} !important;
}

.jl-profile-name { color: ${ink} !important; }
.jl-profile-status { color: ${c.muted} !important; }
.jl-profile-dot { background: ${c.accent} !important; }
.jl-profile:hover { background: ${shade(c.card, dark ? 0.06 : -0.03)} !important; }

.jl-nav-item {
  height: var(--pg-nav-h) !important;
  min-height: var(--pg-nav-h) !important;
  background: ${shade(c.card, dark ? 0.015 : -0.01)} !important;
  color: ${c.muted} !important;
  /* внутренняя подсветка только сверху, низ без тёмной кромки */
  box-shadow: inset 0 1px 0 ${alpha(ink, dark ? 0.05 : 0.5)} !important;
  text-shadow: none !important;
}

.jl-nav-text, .jl-profile-name, .jl-bottom-btn.outlined {
  text-shadow: none !important;
}

.jl-nav-item:hover {
  background: ${shade(c.card, dark ? 0.07 : -0.04)} !important;
  color: ${ink} !important;
}

.jl-nav-item.active {
  background: ${shade(c.card, dark ? 0.09 : -0.06)} !important;
  color: ${ink} !important;
  box-shadow: inset 3px 0 0 ${c.accent}, inset 0 1px 0 ${alpha(ink, dark ? 0.08 : 0.5)} !important;
}

.jl-bottom { border-top-color: ${shade(c.background, dark ? -0.2 : -0.08)} !important; }

.jl-bottom-btn.outlined {
  background: ${c.button} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.15)} !important;
  color: ${ink} !important;
}

.jl-bottom-btn.outlined:hover { background: ${shade(c.button, dark ? 0.08 : -0.04)} !important; }

/* --- Настройки -------------------------------------------------------- */
.settings-nav {
  background: ${shade(c.panel, dark ? 0.01 : -0.015)} !important;
  border-right: 1px solid ${c.border} !important;
}

.settings-nav-item { color: ${c.muted} !important; }
.settings-nav-item:hover { color: ${ink} !important; background: ${alpha(c.accent, 0.08)} !important; }
.settings-nav-item.active { color: ${ink} !important; background: ${alpha(c.accent, 0.14)} !important; }

.settings-card {
  background: ${shade(c.panel, dark ? 0.02 : -0.005)} !important;
  border: 1px solid ${c.border} !important;
  padding: var(--pg-card-pad) !important;
  color: ${ink} !important;
}

.settings-card-head h2 { color: ${ink} !important; }
.settings-card-head p { color: ${c.muted} !important; }

.settings-check {
  color: ${ink} !important;
  border-bottom-color: ${alpha(c.border, 0.8)} !important;
}

.settings-check-desc { color: ${c.muted} !important; }

.settings-action-btn {
  background: ${c.button} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.18)} !important;
  color: ${ink} !important;
}

.settings-action-btn:hover { background: ${shade(c.button, dark ? 0.08 : -0.05)} !important; }

.settings-action-btn.primary {
  background: ${c.accent} !important;
  border-color: ${shade(c.accent, -0.35)} !important;
  color: ${readableOn(c.accent)} !important;
}

.settings-pane-head h1 { color: ${ink} !important; }
.settings-pane-head p { color: ${c.muted} !important; }
.settings-nav-head { color: ${c.muted} !important; }
.settings-nav-label { color: inherit !important; }
.settings-check-title { color: ${ink} !important; }
.settings-slider-label { color: ${c.muted} !important; }
.settings-slider-value { color: ${ink} !important; }
.settings-hint { color: ${c.muted} !important; }

/* --- Моды, сборки, карточки ------------------------------------------ */
.mods-header { border-bottom-color: ${c.border} !important; }
.mods-tabs { border-bottom-color: ${c.border} !important; }

.mods-tab {
  background: linear-gradient(180deg, ${shade(c.border, dark ? 0.2 : -0.1)} 0%, ${shade(c.border, 0.05)} 45%, ${shade(c.background, dark ? 0.04 : -0.1)} 100%) !important;
  color: ${c.muted} !important;
}

.mods-tab::before { background: ${shade(c.panel, dark ? -0.04 : 0.02)} !important; }
.mods-tab:hover { color: ${ink} !important; }
.mods-tab:hover::before { background: ${shade(c.panel, dark ? 0.03 : -0.01)} !important; }

/* Жёлтая у активной вкладки только рамка: текст лежит на заливке ::before,
   поэтому он всегда основного цвета. readableOn(accent) давал чёрный шрифт
   на тёмной заливке — в тёмной теме подпись пропадала. */
.mods-tab.active {
  background: linear-gradient(180deg, ${c.accent} 0%, ${shade(c.accent, -0.15)} 58%, ${shade(c.accent, -0.4)} 100%) !important;
  color: ${ink} !important;
}

.mods-tab.active::before { background: ${shade(c.panel, dark ? 0.06 : -0.02)} !important; }
.mods-tab.active .mods-count {
  background: ${alpha(ink, dark ? 0.14 : 0.1)} !important;
  border-color: ${alpha(ink, 0.18)} !important;
  color: ${ink} !important;
}

/* Рамку строки рисует её фон, заливку — ::before. Если фон равен заливке,
   обводка пропадает и список выглядит плоским. */
.mods-row {
  background: ${shade(c.card, dark ? 0.06 : -0.05)} !important;
  color: ${ink} !important;
  min-height: var(--pg-row-h) !important;
  margin-bottom: var(--pg-row-gap) !important;
}

.mods-row-name { color: ${ink} !important; }
.mods-row-meta, .mods-row-desc { color: ${c.muted} !important; }
.mods-row.disabled { opacity: ${light ? 0.55 : 0.5} !important; }

.mods-section-head { border-bottom-color: ${c.border} !important; }
.mods-section-title { color: ${c.muted} !important; }
.mods-section-count { background: ${shade(c.card, dark ? 0.06 : -0.04)} !important; border-color: ${c.border} !important; color: ${c.muted} !important; }

.mc-card { color: ${ink} !important; }
.mc-card::before { background: linear-gradient(180deg, ${c.card} 0%, ${shade(c.card, dark ? -0.05 : -0.03)} 100%) !important; }
.mc-card-name, .mc-card-title { color: ${ink} !important; }
.mc-card-desc, .mc-card-meta { color: ${c.muted} !important; }

/* --- Кнопки ----------------------------------------------------------- */
/* Вторичная кнопка была белой всегда: в светлой теме надпись пропадала
   на светлой плашке (например, «Установлено» в просмотре мода). */
.mc-btn-secondary {
  color: ${ink} !important;
}

/* Настройка «Кнопки» должна красить все нейтральные кнопки, а не только
   плашки в настройках: ghost-кнопки каталога, иконки-кнопки, вторичные
   кнопки диалогов и подсказки в ИИ-чате. */
.mods-btn-primary {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
  border-color: ${shade(c.accent, -0.55)} !important;
  box-shadow:
    inset 0 2px 0 ${alpha('#ffffff', 0.28)},
    inset 0 -3px 0 ${shade(c.accent, -0.22)} !important;
}

.mods-btn-primary:hover:not(:disabled) {
  background: ${shade(c.accent, dark ? 0.12 : -0.06)} !important;
  color: ${readableOn(c.accent)} !important;
}

.mods-btn-ghost { color: ${c.muted} !important; }

.mods-btn-ghost:hover:not(:disabled) {
  background: ${c.button} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.mods-icon-btn {
  background: ${c.button} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.mods-icon-btn:hover {
  background: ${shade(c.button, dark ? 0.1 : -0.05)} !important;
  color: ${ink} !important;
}

.ai-chat-icon-btn:hover, .ai-chat-close:hover {
  background: ${c.button} !important;
  color: ${ink} !important;
}

.mods-btn-primary {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
  border-color: ${shade(c.accent, -0.4)} !important;
  box-shadow: inset 0 2px 0 ${alpha('#ffffff', 0.25)}, inset 0 -3px 0 ${shade(c.accent, -0.25)} !important;
}

.mc-btn, .mc-card-install {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
}

/* --- Текст ------------------------------------------------------------ */
.mods-count, .mods-tabs-meta { color: ${c.muted} !important; }
.mc-card-facts, .mc-card-fact { color: ${c.muted} !important; }

::selection { background: ${alpha(c.accent, 0.35)}; color: ${ink}; }

/* --- Чекбоксы --------------------------------------------------------- */
/* В светлой теме чёрный квадрат с чёрной рамкой выглядит как дыра. */
input[type="checkbox"] {
  background: ${light ? '#ffffff' : '#0f0f0f'} !important;
  border-color: ${light ? shade(c.border, -0.1) : '#000000'} !important;
  box-shadow: inset -2px -2px 0 ${alpha(ink, 0.12)}, inset 2px 2px 0 ${alpha(shadow, light ? 0.25 : 0.6)} !important;
}

/* Галочка рисуется цветом акцента, поэтому заливка остаётся тёмной (в светлой
   теме — белой): иначе жёлтая галочка исчезает на жёлтом фоне. */
input[type="checkbox"]:checked {
  border-color: ${shade(c.accent, -0.25)} !important;
}

/* --- Выпадающие списки ------------------------------------------------ */
/* Меню выбора (McSelect), список версий и аккаунтов заданы инлайн-стилями —
   тему они игнорировали и в светлой оставались чёрными. */
.mc-custom-select-dropdown,
.account-dropdown,
.dropdown-menu {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
  box-shadow: 0 10px 24px ${alpha('#000000', light ? 0.16 : 0.55)} !important;
}

.mc-custom-select-option,
.account-dropdown-item,
.dropdown-item {
  color: ${ink} !important;
}

.mc-custom-select-option:hover:not(.selected),
.account-dropdown-item:hover,
.dropdown-item:hover {
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
}

.mc-custom-select-option.selected {
  background: ${alpha(c.accent, 0.18)} !important;
  color: ${ink} !important;
}

.account-dropdown-item.active {
  background: ${alpha(c.accent, 0.16)} !important;
}

/* Наведение на активный пункт было коричневым литералом #5c4b16. */
.account-dropdown-item.active:hover {
  background: ${alpha(c.accent, 0.24)} !important;
}

.dropdown-item { border-bottom-color: ${c.border} !important; }

.mc-custom-select-trigger {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
  box-shadow: inset 0 -2px 0 ${shade(c.panel, dark ? -0.25 : -0.08)} !important;
}

/* --- Поля ввода, поиск, переключатели --------------------------------- */
.mods-search, .mc-select-trigger, .mc-select-menu, .settings-input, .mc-input, .mods-toolbar {
  background: ${shade(c.card, dark ? -0.5 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.mods-search input, .mc-input, .settings-input, .mc-select-trigger {
  color: ${ink} !important;
}

.mods-search input::placeholder, .mc-input::placeholder { color: ${shade(c.muted, dark ? -0.15 : 0.1)} !important; }
.mods-search-clear { color: ${c.muted} !important; }
.mods-search-clear:hover { color: ${ink} !important; }

/* Переключатель выключен — нейтральная кнопка, включён — акцент. */
.mods-switch {
  background: ${shade(c.button, dark ? -0.1 : -0.12)} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.2)} !important;
}

.mods-switch span {
  background: ${shade(ink, dark ? -0.25 : -0.55)} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.2)} !important;
}

.mods-switch.on {
  background: ${c.accent} !important;
  border-color: ${shade(c.accent, -0.45)} !important;
}

.mods-switch.on span {
  background: ${light ? '#ffffff' : '#f0f0f0'} !important;
}

/* Кнопки-иконки в строках списка. */
.mods-row-delete { color: ${c.muted} !important; }
.mods-row-delete:hover { color: #ff6b6b !important; }

/* --- Лобби: карточки рекомендаций ------------------------------------- */
/* Рамка карточки — градиентная фаска, заливка — на ::after: ровно как у
   карточек каталога, поэтому тема перекрашивает и их. */
.lobby-rec {
  background: linear-gradient(180deg, ${shade(c.border, dark ? 0.35 : -0.05)} 0%, ${shade(c.border, dark ? 0.15 : 0.06)} 42%, ${shade(c.border, dark ? -0.04 : -0.05)} 100%) !important;
}

.lobby-rec::after {
  background: ${c.card} !important;
}

.lobby-rec:hover {
  background: linear-gradient(180deg, ${shade(c.accent, 0.25)} 0%, ${c.accent} 45%, ${shade(c.accent, -0.45)} 100%) !important;
}

.lobby-rec-cover { background: ${shade(c.card, dark ? -0.06 : -0.03)} !important; }
.lobby-rec-badge { background: ${c.accent} !important; color: ${readableOn(c.accent)} !important; }
.lobby-rec-name, .lobby-rec-head { color: ${ink} !important; }
.lobby-rec-meta, .lobby-rec-dot { color: ${c.muted} !important; }
/* Заголовок ленты остаётся белым в любой теме: это часть «игровой» подачи
   лобби, а не обычный текст. Тень держит его читаемым и на светлом фоне. */
.lobby-recs-head h2 {
  color: #f4f4f4 !important;
  text-shadow: 2px 2px 0 ${alpha('#0b0b0b', light ? 0.85 : 0.75)} !important;
}
.lobby-recs-head p { color: ${c.muted} !important; }

.lobby-recs-all {
  background: ${c.button} !important;
  color: ${ink} !important;
  border-color: ${c.border} !important;
}

.lobby-recs-all:hover {
  color: ${c.accent} !important;
  border-color: ${alpha(c.accent, 0.5)} !important;
}

/* Панель запуска внизу лобби: рамка и внутренние тени — из темы.
   Раньше они были инлайн-стилями (#111, #444, #000) и оставались чёрными
   даже в светлой теме. */
.jl-play-bar {
  background: ${alpha(c.panel, dark ? 0.95 : 0.97)} !important;
  border-color: ${shade(c.border, light ? -0.08 : 0)} !important;
  box-shadow:
    inset 0 3px 0 0 ${shade(c.panel, dark ? 0.2 : -0.06)},
    inset 3px 0 0 0 ${shade(c.panel, dark ? -0.08 : -0.12)},
    inset 0 -6px 0 0 ${shade(c.panel, dark ? -0.5 : -0.2)},
    inset -3px 0 0 0 ${shade(c.panel, dark ? -0.32 : -0.16)} !important;
}

.jl-version-selector label { color: ${c.muted} !important; }

/* Тень под плиткой «Играть»: плитка плоская, без неё кнопка прилипает
   к панели запуска. */
.pg-play-svg {
  filter: drop-shadow(0 5px 10px ${alpha(shadow, dark ? 0.5 : 0.25)}) !important;
}

/* --- Светлая тема: мягкие рамки вместо чёрных ------------------------- */
${light ? `
.jl-nav-item, .jl-profile, .jl-bottom-btn.outlined, .settings-action-btn,
.mods-tab, .cz-preset, .cz-seg, .mods-search, .settings-input, .mc-input,
.mc-custom-select-trigger, .cz-swatch, .cz-color-input, input[type="checkbox"] {
  border-color: ${shade(c.border, -0.08)} !important;
  box-shadow: 0 1px 0 ${alpha('#0b1220', 0.07)} !important;
}

.jl-nav-item.active {
  box-shadow: inset 3px 0 0 ${c.accent}, 0 1px 0 ${alpha('#0b1220', 0.07)} !important;
}

.mods-tab, .lobby-rec, .cz-preset { box-shadow: 0 1px 2px ${alpha('#0b1220', 0.08)} !important; }

.mods-btn-primary, .mc-btn, .mc-card-install, .settings-action-btn.primary {
  box-shadow: 0 1px 2px ${alpha('#0b1220', 0.18)} !important;
}

/* Белый текст из старых правил: в светлой теме он не читается. */
.mc-card-btn.ghost, .mc-card-btn.installed, .mods-btn-ghost, .mods-icon-btn,
.mc-update-content, .mc-update-version, .mc-dialog-content, .default-btn:hover,
.settings-action-btn:hover, .servers-search-clear:hover {
  color: ${ink} !important;
}

.mc-dialog-content, .mc-update-content {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
}

/* В светлой теме панель и плитки почти одного цвета — разводим их, иначе
   меню сливается в одно белое пятно. */
.jl-sidebar { background: ${c.panel} !important; }
.jl-nav-item { background: ${shade(c.card, -0.045)} !important; }
.jl-nav-item:hover { background: ${shade(c.card, -0.08)} !important; }
.jl-nav-item.active { background: ${shade(c.card, -0.1)} !important; }
.jl-profile { background: ${shade(c.card, -0.02)} !important; }
` : ''}

/* --- Верхняя панель окна ---------------------------------------------- */
.titlebar-downloads,
.win-btn {
  border-left-color: ${c.border} !important;
  box-shadow: inset 3px 0 0 ${shade(c.panel, dark ? 0.12 : -0.06)} !important;
  color: ${c.muted} !important;
}

.titlebar-downloads:hover,
.win-btn:hover {
  background: ${shade(c.panel, dark ? 0.14 : -0.08)} !important;
  color: ${ink} !important;
}

/* Закрытие остаётся красным в любой теме: это системный цвет, не акцент. */
.win-btn.close:hover {
  background: #e81123 !important;
  color: #ffffff !important;
}

/* Панель загрузок: рамка и фаски из темы, а не постоянные #111/#444/#000. */
.downloads-dropdown {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
  box-shadow:
    inset 0 2px 0 ${shade(c.panel, dark ? 0.22 : -0.04)},
    inset 2px 0 0 ${shade(c.panel, dark ? -0.06 : -0.1)},
    inset 0 -4px 0 ${shade(c.panel, dark ? -0.45 : -0.12)},
    inset -2px 0 0 ${shade(c.panel, dark ? -0.28 : -0.12)},
    0 4px 10px ${alpha(shadow, dark ? 0.5 : 0.22)} !important;
}

/* --- Выбор версии ------------------------------------------------------ */
.jl-dropdown {
  background-color: ${c.card} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
  box-shadow: inset 0 -2px 0 ${shade(c.card, dark ? -0.2 : -0.08)} !important;
}

/* --- Серверы ----------------------------------------------------------- */
.servers-hero {
  background: linear-gradient(180deg, ${shade(c.panel, dark ? 0.03 : 0)} 0%, ${c.panel} 100%) !important;
  border-bottom-color: ${c.border} !important;
}

.servers-hero-sub { color: ${c.muted} !important; }

.servers-search {
  background: ${shade(c.card, dark ? -0.03 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.servers-search:focus-within { border-color: ${alpha(c.accent, 0.65)} !important; }
.servers-search input { color: ${ink} !important; }
.servers-search input::placeholder { color: ${shade(c.muted, dark ? -0.12 : 0.12)} !important; }
.servers-search-clear { color: ${c.muted} !important; }
.servers-search-clear:hover { color: ${ink} !important; }

.server-tag,
.mc-card-meta span {
  background: ${shade(c.card, dark ? 0.05 : -0.03)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.mc-card-footer { border-top-color: ${c.border} !important; }

.mc-card-btn {
  border-color: ${shade(c.accent, -0.45)} !important;
}

.mc-card-btn.ghost {
  background: ${c.button} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.15)} !important;
  color: ${ink} !important;
  box-shadow: none !important;
}

/* «Установлено» — неактивный статус, но в цветах темы: серая плашка на
   светлой панели выглядела как сломанная кнопка. */
.mc-card-btn.installed {
  background: ${alpha(c.accent, dark ? 0.18 : 0.16)} !important;
  border-color: ${alpha(c.accent, dark ? 0.55 : 0.5)} !important;
  color: ${dark ? shade(c.accent, 0.4) : shade(c.accent, -0.55)} !important;
  box-shadow:
    inset 0 2px 0 ${alpha('#ffffff', dark ? 0.1 : 0.6)},
    inset 0 -2px 0 ${alpha(shadow, 0.18)} !important;
  opacity: 1 !important;
}

/* --- Каталог модов и сборок ------------------------------------------- */
/* Рамку карточки рисует её фон, заливку — ::before; фон тоже из темы, иначе
   в светлой теме вокруг карточки остаётся тёмная фаска. */
.mc-card {
  background: linear-gradient(180deg, ${shade(c.border, dark ? 0.35 : -0.02)} 0%, ${shade(c.border, dark ? 0.15 : 0.06)} 42%, ${shade(c.border, dark ? -0.04 : -0.02)} 100%) !important;
}

/* Наведение: вся рамка становится жёлтой + тень по ступенчатому контуру.
   Без этого правила тема перебивала :hover и обводка исчезала. */
.mc-card:not(.server-skeleton):hover {
  background: linear-gradient(180deg, ${shade(c.accent, 0.22)} 0%, ${c.accent} 45%, ${shade(c.accent, -0.45)} 100%) !important;
  filter:
    drop-shadow(0 8px 14px ${alpha(shadow, dark ? 0.45 : 0.25)})
    drop-shadow(0 0 8px ${alpha(c.accent, 0.22)}) !important;
}

.mods-icon-btn {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.mods-icon-btn:hover {
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
  color: ${ink} !important;
}

.mods-count {
  background: ${shade(c.card, dark ? 0.06 : -0.05)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

/* Заливка строки — слой ::before. Без переопределения она оставалась
   #1e1e1e при наведении, и в светлой теме строка проваливалась в тёмно-серое. */
.mods-row::before { background: ${shade(c.card, dark ? -0.02 : 0)} !important; }

.mods-row:hover {
  background: ${shade(c.border, dark ? 0.35 : -0.04)} !important;
}

.mods-row:hover::before {
  background: ${shade(c.card, dark ? 0.06 : -0.035)} !important;
}

/* --- Аккаунты ----------------------------------------------------------- */
.accounts-hero { border-bottom-color: ${c.border} !important; }
.accounts-kicker { color: ${c.accent} !important; }
.accounts-title { color: ${ink} !important; }
.accounts-sub, .accounts-section-title { color: ${c.muted} !important; }

.accounts-count {
  color: ${ink} !important;
  background: ${shade(c.card, dark ? 0.06 : -0.04)} !important;
  border-color: ${c.border} !important;
}

.accounts-card { background: ${shade(c.border, dark ? 0.28 : -0.02)} !important; }
.accounts-card-fill { background: ${c.card} !important; }
.accounts-card:hover .accounts-card-fill { background: ${shade(c.card, dark ? 0.06 : -0.03)} !important; }

/* Выбранный аккаунт: мягкая полупрозрачная рамка вместо сплошной заливки
   акцентом — список из нескольких карточек больше не «светится». */
.accounts-card.active { background: ${alpha(c.accent, 0.45)} !important; }
.accounts-card.active .accounts-card-fill { background: ${shade(c.card, dark ? 0.03 : -0.02)} !important; }
.accounts-card-name { color: ${ink} !important; }
.accounts-card-type { color: ${c.muted} !important; }
.accounts-card-badge { background: ${c.accent} !important; color: ${readableOn(c.accent)} !important; }

.accounts-card-del {
  background: ${shade(c.card, dark ? 0.04 : -0.05)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.accounts-form { background: ${shade(c.border, dark ? 0.32 : -0.02)} !important; }
.accounts-form-fill { background: ${c.card} !important; }
.accounts-form-top { border-bottom-color: ${c.border} !important; }
.accounts-back {
  color: ${ink} !important;
  background: ${c.button} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.18)} !important;
  box-shadow: none !important;
}
.accounts-form-who span { color: ${ink} !important; }
.accounts-field-label { color: ${c.muted} !important; }

/* --- Сборка «Создать» --------------------------------------------------- */
.mcp-rail, .mcp-footer {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
}

.mcp-aside {
  background: ${shade(c.panel, dark ? 0.01 : -0.02)} !important;
  border-color: ${c.border} !important;
}

.mcp-crumb { color: ${shade(c.muted, dark ? -0.05 : 0.05)} !important; }
.mcp-crumb b { color: ${ink} !important; }

.mcp-step-num {
  background: ${shade(c.card, dark ? -0.05 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${c.accent} !important;
}

.mcp-step-title { color: ${ink} !important; }
.mcp-step-head { border-bottom-color: ${c.border} !important; }

.mcp-chip {
  background: ${shade(c.card, dark ? 0.02 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.mcp-chip:hover:not(:disabled) {
  background: ${shade(c.card, dark ? 0.07 : -0.04)} !important;
  border-color: ${shade(c.border, 0.2)} !important;
  color: ${ink} !important;
}

.mcp-chip.on {
  background: ${c.accent} !important;
  border-color: ${shade(c.accent, -0.45)} !important;
  color: ${readableOn(c.accent)} !important;
}

.mcp-option {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
}

.mcp-option:hover:not(:disabled) {
  background: ${shade(c.card, dark ? 0.06 : -0.03)} !important;
  border-color: ${shade(c.border, 0.2)} !important;
}

.mcp-option.on {
  background: ${alpha(c.accent, dark ? 0.14 : 0.1)} !important;
  border-color: ${alpha(c.accent, 0.55)} !important;
}

.mcp-option-title { color: ${ink} !important; }

.mcp-tile {
  background: ${shade(c.card, dark ? -0.05 : 0)} !important;
  border-color: ${c.border} !important;
}

.mcp-tile:hover { border-color: ${alpha(c.accent, 0.6)} !important; }

.mcp-tile.on {
  border-color: ${c.accent} !important;
  background: ${alpha(c.accent, dark ? 0.16 : 0.12)} !important;
  box-shadow: inset 0 0 0 1px ${alpha(c.accent, 0.4)} !important;
}

.mcp-tile-add {
  background: ${shade(c.card, dark ? -0.05 : 0)} !important;
  border-color: ${shade(c.border, 0.2)} !important;
  color: ${c.muted} !important;
}

.mcp-card {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
}

.mcp-card-icon {
  background: ${shade(c.card, dark ? -0.06 : -0.02)} !important;
  border-color: ${c.border} !important;
}

.mcp-card-name { color: ${ink} !important; }

.mcp-badge {
  background: ${shade(c.card, dark ? 0.05 : -0.03)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.mcp-badge.on {
  background: ${alpha(c.accent, 0.18)} !important;
  border-color: ${alpha(c.accent, 0.5)} !important;
  color: ${c.accent} !important;
}

.mcp-footer .mods-btn-primary.busy:disabled {
  background: ${shade(c.accent, -0.2)} !important;
  color: ${readableOn(c.accent)} !important;
}

/* --- Карточки рекомендаций: текст и иконки ---------------------------- */
.lobby-rec-info strong { color: ${ink} !important; }

.lobby-rec-icon {
  background: ${shade(c.card, dark ? -0.1 : 0)} !important;
  border-color: ${c.border} !important;
}

.lobby-rec-cover { background: ${shade(c.card, dark ? 0.02 : -0.03)} !important; }
.lobby-rec-meta { color: ${c.muted} !important; }
.lobby-rec-dot { color: ${shade(c.muted, dark ? -0.1 : 0.1)} !important; }

.lobby-recs-empty {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.lobby-rec.skeleton {
  background: linear-gradient(100deg, ${shade(c.card, -0.02)} 20%, ${shade(c.card, 0.06)} 40%, ${shade(c.card, -0.02)} 60%) !important;
}

/* Кнопка «Назад» — нейтральная плашка на всех экранах. */
.pg-back-btn {
  background: ${c.button} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.18)} !important;
  color: ${ink} !important;
}

.pg-back-btn:hover:not(:disabled) {
  background: ${shade(c.button, dark ? 0.09 : -0.05)} !important;
  color: ${ink} !important;
}

.mod-version-row:hover {
  background-color: ${shade(c.card, dark ? 0.07 : -0.03)} !important;
}

/* --- Наследие старых экранов ------------------------------------------ */
/* Эти классы остались от прежних версий интерфейса и задавали цвета на месте.
   Экран мог не открываться, но если открывается — текст в нём должен читаться. */
.tl-input, .tl-dropdown, .modal-input, .modal-select {
  background: ${shade(c.card, dark ? -0.02 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.mods-top-bar {
  background: ${c.panel} !important;
  color: ${ink} !important;
}

.mod-info h4 { color: ${ink} !important; }
.mod-btn.downloading { color: ${readableOn(c.accent)} !important; }
.account-dropdown-manage-label { color: ${c.muted} !important; }

.jl-tool-btn {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.jl-tool-btn:hover {
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
}

.mc-card-more:hover { color: ${ink} !important; }

.mods-row-icon {
  background: ${shade(c.card, dark ? -0.04 : -0.02)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

/* Описание мода приходит готовым HTML — его цвет тоже из темы. */
.markdown-body { color: ${ink} !important; }

.mc-close-cube-btn, .mc-close-cube-btn:hover, .mc-update-close-btn {
  color: ${ink} !important;
}

.mc-update-changelog { color: ${c.muted} !important; }

/* Экран загрузки живёт до применения темы, но акцент должен совпадать. */
.loading-title, .loading-status-percent, .loading-footer-tip span {
  color: ${c.accent} !important;
}

.loading-status-text { color: ${c.muted} !important; }

.bg-mode-title { color: ${ink} !important; }
.settings-ram-value { color: ${ink} !important; }
.accounts-error { color: ${light ? '#b3261e' : '#ffb3ab'} !important; }
.accounts-error b { color: ${light ? '#8c1d18' : '#ffd9d4'} !important; }

/* --- Мелкие поверхности ----------------------------------------------- */
/* Иконки проектов лежат на тёмных подложках; в светлой теме это читалось
   как чёрные квадраты. */
.mc-card-icon, .project-art, .mods-pack-icon, .mc-card-cat-icon,
.modpack-cover, .bg-mode-preview {
  background: ${shade(c.card, dark ? -0.05 : -0.02)} !important;
  border-color: ${c.border} !important;
}

.accounts-field-row { background: ${shade(c.card, dark ? 0.05 : -0.04)} !important; }
.accounts-eye { background: ${shade(c.card, dark ? 0.02 : -0.02)} !important; color: ${c.muted} !important; }
.accounts-eye:hover { background: ${shade(c.card, dark ? 0.1 : -0.06)} !important; color: ${ink} !important; }
.accounts-empty { background: ${c.card} !important; color: ${c.muted} !important; }

/* Диалоги и обновление. */
.mc-dialog-window, .mc-update-window {
  background: ${shade(c.panel, dark ? 0.02 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.mc-dialog-header, .mc-update-header {
  background: ${shade(c.panel, dark ? 0.06 : -0.02)} !important;
  border-color: ${c.border} !important;
}

.mc-dialog-content { color: ${ink} !important; }

/* Ползунки: дорожка и бегунок. Бегунок в светлой теме белый, в тёмной —
   в акценте темы; раньше он всегда был жёлтым от старой палитры. */
.ram-slider {
  background: var(--pg-track) !important;
  border-color: ${light ? shade(c.border, -0.12) : '#000000'} !important;
  box-shadow: inset 0 1px 0 ${alpha('#000000', light ? 0.12 : 0.5)} !important;
}

.ram-slider::-webkit-slider-thumb {
  background: ${light
    ? 'linear-gradient(180deg, #ffffff 0%, #e4e8ef 100%)'
    : `linear-gradient(180deg, ${shade(c.accent, 0.2)} 0%, ${shade(c.accent, -0.1)} 100%)`} !important;
  border-color: ${light ? shade(c.border, -0.15) : shade(c.accent, -0.45)} !important;
  box-shadow: ${light
    ? '0 1px 2px rgba(11, 18, 32, 0.2), inset 0 1px 0 #ffffff'
    : `0 2px 4px ${alpha('#000000', 0.55)}, inset 1px 1px 0 ${alpha('#ffffff', 0.55)}`} !important;
}

.ram-slider::-webkit-slider-thumb:hover {
  background: ${light
    ? 'linear-gradient(180deg, #ffffff 0%, #eef1f6 100%)'
    : `linear-gradient(180deg, ${shade(c.accent, 0.3)} 0%, ${c.accent} 100%)`} !important;
}

.ram-slider::-moz-range-thumb {
  background: ${light
    ? 'linear-gradient(180deg, #ffffff 0%, #e4e8ef 100%)'
    : `linear-gradient(180deg, ${shade(c.accent, 0.2)} 0%, ${shade(c.accent, -0.1)} 100%)`} !important;
  border-color: ${light ? shade(c.border, -0.15) : shade(c.accent, -0.45)} !important;
}

.ram-slider::-moz-range-track { background: var(--pg-track) !important; }

input[type="checkbox"]:hover { background: ${light ? '#ffffff' : '#171717'} !important; }
input[type="checkbox"]:active { background: ${light ? '#eef1f6' : '#090909'} !important; }

/* Полоса прокрутки: в светлой теме чёрный ползунок был почти невидим. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: ${shade(c.background, dark ? 0.03 : -0.03)} !important; }
::-webkit-scrollbar-thumb {
  background: ${shade(c.border, dark ? 0.22 : -0.06)} !important;
  border: 2px solid ${shade(c.background, dark ? 0.03 : -0.03)} !important;
}
::-webkit-scrollbar-thumb:hover { background: ${c.accent} !important; }

/* Экран загрузки виден до темы, но цвета должны совпадать. */
.launcher-loading-screen { background: ${c.background} !important; }
.loading-progress-track {
  background: ${shade(c.card, dark ? -0.05 : -0.03)} !important;
  border-color: ${c.border} !important;
}

/* Старые кнопки выбора типа аккаунта («Лицензия» / «Оффлайн»).
   Рамку рисует фон кнопки, заливку — ::before. Раньше перекрашивалась только
   заливка, поэтому в светлой теме оставалась тёмная рамка, а название
   аккаунта (#ddd) становилось белым на белом. */
.mc-acc-type-btn { background: ${c.border} !important; }
.mc-acc-type-btn:hover { background: ${alpha(c.accent, 0.5)} !important; }
.mc-acc-type-btn.selected { background: ${c.accent} !important; }
.mc-acc-type-btn::before { background: ${c.card} !important; }
.mc-acc-type-btn:hover::before { background: ${shade(c.card, dark ? 0.08 : -0.04)} !important; }
.mc-acc-type-btn.selected::before { background: ${alpha(c.accent, 0.18)} !important; }
.mc-acc-icon-box { background: ${c.border} !important; }
.mc-acc-icon-box::before { background: ${shade(c.card, dark ? -0.03 : -0.02)} !important; }
.mc-acc-text .title { color: ${ink} !important; }
.mc-acc-text .subtitle { color: ${c.muted} !important; }
.mc-acc-arrow { color: ${c.accent} !important; text-shadow: 0 2px 0 ${alpha(shadow, dark ? 0.55 : 0.18)} !important; }

.server-skeleton-line {
  background: ${shade(c.card, dark ? 0.05 : -0.03)} !important;
}

/* --- Всплывающие окна и оверлеи --------------------------------------- */
/* Всё, что рисуется поверх экрана, раньше жило на собственных цветах:
   диалоги, просмотр мода/сервера, ИИ-чат. В светлой теме белый текст
   оказывался на белой панели, а «золотые» кнопки оставались жёлтыми
   в любой теме. Ниже — общий слой для этих поверхностей. */

.mc-dialog-overlay, .mc-update-overlay {
  background: ${alpha(c.background, light ? 0.72 : 0.82)} !important;
}

.mc-dialog-window, .mc-update-window {
  background: ${shade(c.panel, dark ? 0.02 : 0)} !important;
  border-color: ${shade(c.background, dark ? -0.3 : -0.15)} !important;
  box-shadow:
    inset 3px 3px 0 0 ${shade(c.panel, dark ? 0.18 : -0.04)},
    inset -3px -3px 0 0 ${shade(c.panel, dark ? -0.38 : -0.12)},
    0 20px 50px ${alpha(shadow, light ? 0.28 : 0.95)} !important;
}

.mc-dialog-header, .mc-update-header {
  background: ${shade(c.panel, dark ? 0.06 : -0.02)} !important;
  border-bottom-color: ${shade(c.background, dark ? -0.25 : -0.12)} !important;
  box-shadow: inset 0 -2px 0 0 ${alpha(shadow, dark ? 0.6 : 0.12)}, 0 2px 0 0 ${shade(c.panel, dark ? 0.12 : -0.05)} !important;
}

/* Заголовки диалогов: «warning» был жёлтым литералом. */
.mc-dialog-title.warning {
  color: ${c.accent} !important;
  text-shadow: none !important;
}

.mc-dialog-title.danger { text-shadow: none !important; }
.mc-dialog-title.success { text-shadow: none !important; }

.mc-dialog-content, .mc-update-content {
  background: ${shade(c.card, dark ? -0.02 : 0)} !important;
  border-color: ${shade(c.background, dark ? -0.25 : -0.12)} !important;
  box-shadow:
    inset 2px 2px 0 0 ${alpha(shadow, dark ? 0.6 : 0.08)},
    inset -2px -2px 0 0 ${alpha(ink, 0.08)} !important;
  color: ${ink} !important;
}

/* Кнопки диалогов: «золотая» — это акцент темы, а не жёлтый цвет. */
.mc-cube-btn { border-color: ${shade(c.background, dark ? -0.45 : -0.2)} !important; }

.mc-cube-btn.gold {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
  text-shadow: none !important;
  box-shadow:
    inset 2px 2px 0 0 ${alpha('#ffffff', 0.35)},
    inset -2px -2px 0 0 ${shade(c.accent, -0.3)},
    0 3px 0 0 ${shade(c.accent, -0.65)} !important;
}

.mc-cube-btn.gold:hover {
  background: ${shade(c.accent, dark ? 0.12 : -0.06)} !important;
  color: ${readableOn(c.accent)} !important;
  outline-color: ${alpha(ink, 0.7)} !important;
}

.mc-cube-btn.gold:active {
  box-shadow:
    inset 2px 2px 0 0 ${alpha('#ffffff', 0.25)},
    inset -2px -2px 0 0 ${shade(c.accent, -0.3)} !important;
}

.mc-cube-btn.neutral {
  background: ${c.button} !important;
  color: ${ink} !important;
  text-shadow: none !important;
  box-shadow:
    inset 2px 2px 0 0 ${alpha(ink, 0.14)},
    inset -2px -2px 0 0 ${alpha(shadow, dark ? 0.45 : 0.18)},
    0 3px 0 0 ${shade(c.background, dark ? -0.45 : -0.2)} !important;
}

.mc-cube-btn.neutral:hover {
  background: ${shade(c.button, dark ? 0.1 : -0.05)} !important;
  color: ${ink} !important;
  outline-color: ${alpha(ink, 0.6)} !important;
}

/* Просмотр мода и сервера: полноэкранный оверлей с шапкой и вкладками. */
.mod-viewer-overlay,
.mod-viewer-container,
.mod-viewer-content {
  background: ${c.background} !important;
  color: ${ink} !important;
}

.mod-viewer-header,
.mod-viewer-tabs {
  background: ${c.card} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
}

.mod-viewer-header h1 { color: ${ink} !important; }

/* Плитки галереи и строки версий заданы инлайном — перекрываем цветом темы. */
.mod-viewer-content .hover-scale-btn {
  background: ${shade(c.card, dark ? -0.03 : 0)} !important;
  border-color: ${c.border} !important;
}

.mod-version-row {
  background: ${shade(c.card, dark ? -0.02 : 0)} !important;
  border-bottom-color: ${c.border} !important;
  color: ${ink} !important;
}

.mod-version-row:nth-child(even) {
  background: ${shade(c.card, dark ? 0.02 : -0.01)} !important;
}

/* ИИ-чат: панель, карточки плана и история. */
.ai-chat {
  background: ${c.panel} !important;
  border-color: ${c.border} !important;
  box-shadow: 0 12px 34px ${alpha(shadow, light ? 0.28 : 0.6)} !important;
}

.ai-chat-head { border-bottom-color: ${c.border} !important; }
.ai-chat-ctx { color: ${c.muted} !important; }
.ai-chat-hint, .ai-plan-summary, .ai-plan-count,
.ai-group-count, .ai-history-meta { color: ${c.muted} !important; }

.ai-chat-icon-btn, .ai-chat-close { color: ${c.muted} !important; }

.ai-chat-icon-btn:hover, .ai-chat-close:hover {
  color: ${ink} !important;
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
}

.ai-chat-icon-btn[aria-pressed='true'] {
  color: ${c.accent} !important;
  background: ${alpha(c.accent, dark ? 0.14 : 0.1)} !important;
  border-color: ${alpha(c.accent, 0.4)} !important;
}

.ai-msg { border-color: ${c.border} !important; }

.ai-msg-user {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
}

.ai-msg-thinking, .ai-msg-plan {
  background: ${shade(c.card, dark ? -0.05 : 0)} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

.ai-plan-tag {
  background: ${shade(c.card, dark ? -0.35 : -0.03)} !important;
  border-color: ${c.border} !important;
  color: ${c.accent} !important;
}

.ai-group, .ai-history-item {
  background: ${shade(c.card, dark ? 0.02 : -0.02)} !important;
  border-color: ${c.border} !important;
}

.ai-mod:hover, .ai-history-open:hover, .ai-history-delete:hover {
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
}

.ai-mod-blank { background: ${shade(c.card, dark ? -0.06 : -0.03)} !important; }
.ai-mod-title { color: ${ink} !important; }

.ai-history-delete {
  color: ${c.muted} !important;
  border-left-color: ${c.border} !important;
}

.ai-chat-input {
  background: ${shade(c.panel, dark ? 0.05 : -0.02)} !important;
  border-top-color: ${c.border} !important;
}

/* Подсветка перетаскивания модов. */
.mods-drop-overlay {
  background: ${alpha(c.background, 0.82)} !important;
  border-color: ${c.accent} !important;
}

.mods-drop-overlay-inner {
  color: ${c.accent} !important;
  text-shadow: none !important;
}

/* Кнопка скачивания в карточке каталога: заливка и наведение из акцента. */
.mc-card-btn {
  background: ${c.accent} !important;
  color: ${readableOn(c.accent)} !important;
  border-color: ${shade(c.accent, -0.6)} !important;
  box-shadow:
    inset 0 2px 0 ${alpha('#ffffff', 0.32)},
    inset 0 -2px 0 ${shade(c.accent, -0.3)},
    0 4px 0 0 ${shade(c.accent, -0.68)} !important;
}

.mc-card-btn:hover:not(:disabled),
.mc-card-btn:focus-visible:not(:disabled) {
  background: ${shade(c.accent, dark ? 0.12 : -0.06)} !important;
  color: ${readableOn(c.accent)} !important;
}

.mc-card-btn.ghost {
  background: ${c.button} !important;
  border-color: ${c.border} !important;
  color: ${ink} !important;
  box-shadow: none !important;
}

.mc-card-btn.ghost:hover:not(:disabled) {
  background: ${shade(c.button, dark ? 0.1 : -0.05)} !important;
  color: ${ink} !important;
}

/* Мелкие подписи и кнопки карточек: авторы, теги версии, «...». */
.mc-card-author,
.mc-card-meta,
.mc-card-facts,
.mc-card-fact { color: ${c.muted} !important; }

.mc-card-loader { color: ${c.accent} !important; }

.mc-card-more {
  background: ${c.button} !important;
  color: ${c.muted} !important;
  border-color: ${c.border} !important;
}

.mc-card-more:hover {
  background: ${shade(c.button, dark ? 0.1 : -0.05)} !important;
  color: ${ink} !important;
}

.mc-custom-select-option:hover:not(.selected) { border-color: ${c.border} !important; }

.accounts-card-del {
  background: ${c.button} !important;
  border-color: ${c.border} !important;
  color: ${c.muted} !important;
}

/* Старый список аккаунтов в модальном окне. */
.mc-acc-list-item:hover {
  background: ${shade(c.card, dark ? 0.08 : -0.04)} !important;
  border-color: ${c.border} !important;
}

/* --- Плотность -------------------------------------------------------- */
.mods-list { gap: var(--pg-row-gap) !important; }
.settings-check { padding: ${theme.density === 'compact' ? '6px 2px' : theme.density === 'comfortable' ? '12px 2px' : '9px 2px'} !important; }

/* --- Отключение эффектов --------------------------------------------- */
.pg-no-anim *, .pg-no-anim *::before, .pg-no-anim *::after {
  animation: none !important;
  transition: none !important;
}

.pg-no-blur * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.pg-no-effects .jl-main.has-wallpaper::after,
.pg-no-effects .mc-card-shine {
  display: none !important;
}

.pg-no-effects * {
  text-shadow: none !important;
}

.pg-no-effects .mc-card:hover,
.pg-no-effects .mods-row:hover {
  transform: none !important;
  box-shadow: none !important;
}

/* Тени-«паразиты» от старых правил в светлой теме выглядят грязно. В тёмной
   ничего не перекрываем: родные тени и фаски должны остаться как были. */
${light ? `
.mods-row, .settings-card, .mc-card { box-shadow: 0 1px 0 ${alpha(shadow, 0.35)} !important; }
` : ''}
`
}

/** Применить тему к странице. Идемпотентно: можно звать на каждое изменение. */
export function applyTheme(theme: ThemeConfig) {
  const id = 'pg-theme-style'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = themeCss(theme)

  const root = document.documentElement
  root.dataset.pgMode = theme.mode
  root.dataset.pgDensity = theme.density
  root.classList.toggle('pg-no-anim', !theme.animations)
  root.classList.toggle('pg-no-blur', !theme.blur)
  root.classList.toggle('pg-no-effects', !theme.effects)

  // Масштаб интерфейса — родной зум webview: он меняет и раскладку, и шрифты,
  // в отличие от transform, после которого интерфейс пришлось бы подгонять.
}
