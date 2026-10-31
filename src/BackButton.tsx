import { ArrowLeft } from 'lucide-react'
import { useTranslation } from './i18n'
import './BackButton.css'

interface BackButtonProps {
  onClick: () => void
  disabled?: boolean
  /** Куда кнопка встаёт на экране, решает хозяин экрана: в карточках мода и
      сборки она приклеена к левому верхнему углу, на создании сборки стоит
      внутри рельса. Вид же у неё один. */
  style?: React.CSSProperties
  className?: string
}

export default function BackButton({ onClick, disabled = false, style, className }: BackButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={className ? `pg-back-btn ${className}` : 'pg-back-btn'}
      onClick={onClick}
      disabled={disabled}
      title={t('mods.back')}
      style={style}
    >
      <ArrowLeft size={15} />
      {t('mods.back')}
    </button>
  )
}
