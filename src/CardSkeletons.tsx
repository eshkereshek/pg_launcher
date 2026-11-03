/**
 * Заглушки карточек каталога на время загрузки.
 *
 * Раньше на месте сетки стояла одна строка «Загрузка»: экран прыгал, когда
 * приходили настоящие карточки. Заглушки повторяют их геометрию, поэтому
 * подгрузка выглядит как плавная замена, а не как рывок.
 */
export default function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="mc-card mc-skeleton-card" aria-hidden="true">
          <span className="mc-skeleton-art" />
          <div className="mc-card-body">
            <div className="mc-card-header">
              <span className="mc-skeleton-icon" />
              <div className="mc-card-title-area">
                <span className="mc-skeleton-line" />
                <span className="mc-skeleton-line tiny" />
              </div>
            </div>
            <span className="mc-skeleton-line short" />
            <span className="mc-skeleton-line" />
            <div className="mc-card-footer">
              <span className="mc-skeleton-line tiny" />
              <span className="mc-skeleton-btn" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
