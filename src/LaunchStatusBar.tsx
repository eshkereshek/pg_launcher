/**
 * Тонкая полоса прогресса запуска внизу главного экрана.
 *
 * Ни рамки, ни подложки, ни текста — только линия: этапы запуска и так видны
 * по происходящему, а полоса нужна лишь как индикатор «что-то идёт».
 * Если процент известен (установка Java), линия заполняется по нему,
 * иначе бежит бесконечная анимация.
 */
export default function LaunchStatusBar({
  visible,
  error = false,
  percent = null
}: {
  visible: boolean
  error?: boolean
  percent?: number | null
}) {
  if (!visible) return null

  const hasPercent = typeof percent === 'number' && Number.isFinite(percent)
  const width = hasPercent ? Math.max(2, Math.min(100, percent as number)) : 0

  return (
    <div
      className={`launch-statusbar${hasPercent ? '' : ' indeterminate'}${error ? ' is-error' : ''}`}
      role="progressbar"
      aria-hidden={!visible}
    >
      <div className="launch-statusbar-fill" style={hasPercent ? { width: `${width}%` } : undefined} />
    </div>
  )
}
