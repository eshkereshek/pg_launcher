/**
 * Плашка главной кнопки «Играть».
 *
 * Раньше это была картинка `play_empty.png` (жёлтая плитка), теперь — инлайн-SVG:
 * грань, контур, ступенчатые уголки и нижняя фаска. Все цвета приходят из
 * CSS-переменных `--pb-*`, которые задаёт тема (theme.ts), поэтому кнопка
 * перекрашивается вместе с лаунчером. Значения в fallback — исходный белый
 * макет: до применения темы плитка выглядит как в макете, а не прозрачной.
 */
export default function PlayButton() {
  return (
    <svg
      className="pg-play-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 300"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="pgpb-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--pb-face-top, #fff)' }} />
          <stop offset="0.12" style={{ stopColor: 'var(--pb-face-1, #fafafa)' }} />
          <stop offset="0.82" style={{ stopColor: 'var(--pb-face-2, #f5f5f5)' }} />
          <stop offset="1" style={{ stopColor: 'var(--pb-face-3, #eaeaea)' }} />
        </linearGradient>
        <g
          id="pgpb-corner"
          fill="none"
          style={{ stroke: 'var(--pb-corner, #bcbcbc)' }}
          strokeWidth="9"
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          <path d="M55 145 V58 H73 V76 H55 M55 94 H89 V58 H129" />
          <path d="M146 58 H147" />
        </g>
      </defs>

      {/* Контур и грань */}
      <path
        d="M37 22 H963 V41 H981 V270 H963 V289 H37 V270 H19 V41 H37 Z"
        fill="url(#pgpb-face)"
        style={{ stroke: 'var(--pb-line, #080808)' }}
        strokeWidth="10"
        strokeLinejoin="miter"
      />
      {/* Верхняя подсветка и боковые кромки */}
      <path d="M43 29 H957 V46 H43 Z" style={{ fill: 'var(--pb-shine, #fff)' }} />
      <path d="M26 47 H43 V248 H26 Z M957 47 H974 V248 H957 Z" style={{ fill: 'var(--pb-side, #fff)' }} />
      <path d="M43 46 H957 V248 H43 Z" style={{ fill: 'var(--pb-soft, #fafafa)' }} opacity=".7" />
      {/* Нижняя фаска */}
      <path d="M26 248 H974 V265 H26 Z" style={{ fill: 'var(--pb-lip, #fff)' }} />
      <path d="M43 265 H957 V283 H43 Z" style={{ fill: 'var(--pb-bevel, #c5c5c5)' }} />
      <path d="M43 265 H957 V271 H43 Z" style={{ fill: 'var(--pb-bevel-hi, #d5d5d5)' }} opacity=".6" />

      {/* Уголки-ступеньки во всех четырёх углах */}
      <use href="#pgpb-corner" />
      <use href="#pgpb-corner" transform="translate(1000 0) scale(-1 1)" />
      <use href="#pgpb-corner" transform="translate(0 293) scale(1 -1)" />
      <use href="#pgpb-corner" transform="translate(1000 293) scale(-1 -1)" />
    </svg>
  )
}
