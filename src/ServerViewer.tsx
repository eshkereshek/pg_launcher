import {
  useEffect,
  useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { useTranslation } from './i18n'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Users,
  X,
} from 'lucide-react'
import { descriptionSchema } from './ModViewer'
import './ModViewer.css'
import { Clock, Tag, Check } from './PixelIcons'

/**
 * Подробная карточка сервера — тот же формат, что у модов (`ModViewer`):
 * полноэкранная панель, шапка с иконкой и статистикой, вкладки и контент.
 *
 * Данные берутся из `/v2/project/{slug}` через бэкенд: в отличие от модов,
 * у сервера нет версий и файлов, зато есть адрес и ссылки на сообщество.
 * Описание — markdown от автора сервера, поэтому рендерится через тот же
 * санитайз, что и у модов.
 */

const serverCache = new Map<string, any>()

const linkButton = (url: string) => {
  // @ts-ignore
  window.electronAPI.openExternal(url)
}

const formatDate = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU')
}

export default function ServerViewer({
  server,
  onClose,
}: {
  server: any
  onClose: () => void
}) {
  const { t } = useTranslation()
  const slug = server?.slug || server?.project_id
  const [details, setDetails] = useState<any>(() => (slug ? serverCache.get(slug) || null : null))
  const [loading, setLoading] = useState(!serverCache.has(slug))
  const [tab, setTab] = useState<'overview' | 'gallery' | 'info'>('overview')
  const [copied, setCopied] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    if (!slug || serverCache.has(slug)) return
    setLoading(true)
    // @ts-ignore
    window.electronAPI
      .getServer(slug)
      .then((data: any) => {
        serverCache.set(slug, data)
        setDetails(data)
      })
      .catch((e: any) => console.error(t('servers.loadFailed'), e))
      .finally(() => setLoading(false))
  }, [slug])

  // Escape закрывает просмотр (как в карточке мода).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightbox !== null) {
          setLightbox(null)
        } else {
          onClose()
        }
      }
      if (lightbox !== null) {
        if (event.key === 'ArrowLeft') setLightbox((i) => (i === null ? null : (i - 1 + images.length) % images.length))
        if (event.key === 'ArrowRight') setLightbox((i) => (i === null ? null : (i + 1) % images.length))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!server) return null

  const data = details || server
  const title = data.title || server.title || t('servers.titleFallback')
  const author = data.organization || server.author || 'Modrinth'
  const description = data.description || server.description || ''
  const body = data.body || ''
  const address: string = data.server_address || server.server_address || ''
  const followers = data.followers ?? server.follows ?? 0
  const categories: string[] = data.categories || []
  const versions: string[] = data.game_versions || data.versions || server.versions || []

  const images: { url: string; title?: string }[] = (data.gallery || server.gallery || [])
    .map((item: any) => ({
      url: typeof item === 'string' ? item : item.url || item.raw_url || '',
      title: typeof item === 'string' ? '' : item.title,
    }))
    .filter((item: any) => !!item.url && !/(youtube\.com|youtu\.be|vimeo\.com)/.test(item.url))

  const copyAddress = () => {
    if (!address) return
    try {
      navigator.clipboard?.writeText(address)?.catch(() => {})
    } catch (e) {
      console.error(e)
    }
    // Просто подтверждение: цвет кнопки и шрифта не меняем.
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const tabs = [
    { id: 'overview' as const, label: t('servers.tabOverview') },
    { id: 'gallery' as const, label: t('servers.tabGallery'), count: images.length },
    { id: 'info' as const, label: t('servers.tabInfo') },
  ]

  return (
    <div
      className="mod-viewer-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--pg-dark)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="mod-viewer-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--pg-dark)',
          color: 'var(--pg-text)',
        }}
      >
        {/* Шапка */}
        <div
          className="mod-viewer-header"
          style={{
            padding: '60px 40px 20px 40px',
            display: 'flex',
            gap: '30px',
            borderBottom: '1px solid var(--pg-dark3)',
            alignItems: 'center',
            position: 'relative',
            background: 'var(--pg-dark2)',
            boxSizing: 'border-box',
          }}
        >
          <button
            onClick={onClose}
            className="mc-btn-primary"
            style={{
              position: 'absolute',
              top: '15px',
              left: '15px',
              padding: '6px 12px',
              background: 'var(--pg-dark3)',
              border: 'none',
              color: 'var(--pg-text-muted)',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderRadius: '0',
              zIndex: 10,
            }}
            title={t('ui.back')}
          >
            <ArrowLeft size={20} />
          </button>

          <div
            style={{
              width: '136px',
              height: '136px',
              backgroundImage: "url('./mapp.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                width: '120px',
                height: '120px',
                background: '#fff',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                aspectRatio: '1/1',
              }}
            >
              <img
                src={data.icon_url || server.icon_url || './iconsblocks/Grass_Block_(inventory)_MCE.png'}
                alt={title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', color: 'var(--pg-text)', fontWeight: 'bold' }}>{title}</h1>
            <div style={{ color: 'var(--pg-text-muted)', fontSize: '16px', marginBottom: '15px', display: 'flex', gap: '8px' }}>
              {t('servers.authorLabel')}: <span style={{ color: 'var(--pg-yellow)', fontWeight: 'bold' }}>{author}</span>
            </div>
            {/* Счётчик заходов у сервера ничего не значит: показываем версию
                Minecraft, подписчиков и дату обновления. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', color: 'var(--pg-text-muted)', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={18} /> Minecraft {versions.slice(0, 3).join(', ') || '—'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} /> {Number(followers).toLocaleString()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} /> {formatDate(data.updated || server.date_modified)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginRight: '20px', flexShrink: 0 }}>
            {address ? (
              <button
                className="mc-btn-primary"
                onClick={copyAddress}
                style={{ fontSize: '18px', padding: '15px 30px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
                {copied ? t('ui.copied') : t('servers.copyIp')}
              </button>
            ) : (
              <button
                className="mc-btn-primary"
                onClick={() => linkButton(`https://modrinth.com/server/${slug}`)}
                style={{ fontSize: '18px', padding: '15px 30px', fontWeight: 'bold' }}
              >
                {t('servers.openOnModrinth')}
              </button>
            )}
            {address && (
              <button
                className="mc-btn-primary"
                onClick={() => linkButton(`https://modrinth.com/server/${slug}`)}
                style={{
                  fontSize: '13px',
                  padding: '8px 16px',
                  background: 'var(--pg-dark2)',
                  border: '1px solid var(--pg-dark3)',
                  color: 'var(--pg-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <ExternalLink size={14} /> {t('servers.openOnModrinth')}
              </button>
            )}
          </div>
        </div>

        {/* Вкладки */}
        <div
          className="mod-viewer-tabs"
          style={{
            display: 'flex',
            padding: '0 40px',
            borderBottom: '1px solid var(--pg-dark3)',
            gap: '24px',
            background: 'var(--pg-dark2)',
          }}
        >
          {tabs.map((item) => (
            <div
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                padding: '10px 0',
                cursor: 'pointer',
                color: tab === item.id ? 'var(--pg-yellow)' : 'var(--pg-text-muted)',
                borderBottom: tab === item.id ? '2px solid var(--pg-yellow)' : '2px solid transparent',
                fontWeight: tab === item.id ? 'bold' : 'normal',
                fontSize: '14px',
                fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
              }}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    background: tab === item.id ? 'var(--pg-accent-line)' : 'rgba(255,255,255,0.06)',
                    color: tab === item.id ? 'var(--pg-yellow)' : 'var(--pg-text-muted)',
                    border: tab === item.id ? '1px solid var(--pg-yellow)' : '1px solid #333',
                  }}
                >
                  {item.count}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Контент */}
        <div
          className="mod-viewer-content"
          style={{ flex: 1, overflowY: 'auto', background: 'var(--pg-dark)' }}
        >
          {tab === 'overview' && (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
              {loading && !body ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: '16px' }}>
                  <Loader2 size={36} className="mc-spin" style={{ color: 'var(--pg-yellow)' }} />
                  <span style={{ color: 'var(--pg-text-muted)', fontSize: '16px', fontFamily: '"Blocks", sans-serif' }}>
                    {t('servers.loadingDescription')}
                  </span>
                </div>
              ) : (
                <div
                  className="markdown-body"
                  style={{ padding: '40px', color: 'var(--pg-text)', lineHeight: 1.6, width: '100%', maxWidth: '100%', margin: '0 auto', fontSize: '15px', boxSizing: 'border-box' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, [rehypeSanitize, descriptionSchema]]}
                  >
                    {body || description || t('servers.noDescription')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {tab === 'gallery' && (
            <div style={{ padding: '30px 40px', width: '100%', boxSizing: 'border-box' }}>
              {images.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '20px', width: '100%' }}>
                  {images.map((img, idx) => (
                    <div
                      key={img.url + idx}
                      onClick={() => setLightbox(idx)}
                      className="hover-scale-btn"
                      style={{
                        background: 'var(--pg-dark)',
                        border: '2px solid var(--pg-dark3)',
                        boxShadow: 'inset -2px -2px 0 0 rgba(0,0,0,0.4), inset 2px 2px 0 0 rgba(255,255,255,0.06), 0 4px 8px rgba(0,0,0,0.5)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ width: '100%', aspectRatio: '16 / 10', background: 'var(--pg-dark)', overflow: 'hidden', position: 'relative' }}>
                        <img src={img.url} alt={img.title || t('servers.screenshot', { p1: idx + 1 })} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '6px',
                            right: '6px',
                            background: 'rgba(0,0,0,0.75)',
                            border: '1px solid var(--pg-dark3)',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                            color: 'var(--pg-yellow)',
                            pointerEvents: 'none',
                          }}
                        >
                          #{idx + 1}
                        </div>
                      </div>
                      {img.title && (
                        <div
                          style={{
                            padding: '8px 10px',
                            color: 'var(--pg-text)',
                            fontSize: '13px',
                            fontFamily: '"Blocks", sans-serif',
                            textAlign: 'center',
                            background: 'var(--pg-dark)',
                            borderTop: '1px solid var(--pg-dark3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {img.title}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', color: 'var(--pg-text-muted)', gap: '14px' }}>
                  <ImageIcon size={48} color="#444" />
                  <span style={{ fontSize: '16px', fontFamily: '"Blocks", sans-serif' }}>{t('servers.noScreenshots')}</span>
                </div>
              )}
            </div>
          )}

          {tab === 'info' && (
            <div style={{ padding: '30px 40px', maxWidth: '900px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <InfoRow label={t('servers.address')} value={address || t('servers.notSpecified')} highlight={!!address} mono />
                <InfoRow label={t('servers.gameVersions')} value={versions.join(', ') || '—'} />
                <InfoRow label={t('servers.categories')} value={categories.map((c) => c.replace(/-/g, ' ')).join(', ') || '—'} />
                <InfoRow label={t('servers.loader')} value={(data.loaders || []).join(', ') || '—'} />
                <InfoRow label={t('servers.subscribers')} value={Number(followers).toLocaleString()} />
                <InfoRow label={t('servers.published')} value={formatDate(data.published || server.date_created)} />
                <InfoRow label={t('servers.updated')} value={formatDate(data.updated || server.date_modified)} />
                <InfoRow label={t('app.license')} value={data.license?.name || data.license?.id || '—'} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '24px' }}>
                {address && (
                  <button className="mc-btn-primary" onClick={copyAddress} style={{ fontSize: '13px', padding: '10px 18px' }}>
                    {copied ? t('ui.copied') : t('servers.copyIp')}
                  </button>
                )}
                {data.discord_url && (
                  <button className="mc-btn-primary" onClick={() => linkButton(data.discord_url)} style={{ fontSize: '13px', padding: '10px 18px', background: 'var(--pg-dark2)', border: '1px solid var(--pg-dark3)', color: 'var(--pg-text-muted)' }}>
                    Discord
                  </button>
                )}
                {data.source_url && (
                  <button className="mc-btn-primary" onClick={() => linkButton(data.source_url)} style={{ fontSize: '13px', padding: '10px 18px', background: 'var(--pg-dark2)', border: '1px solid var(--pg-dark3)', color: 'var(--pg-text-muted)' }}>
                    {t('servers.sources')}
                  </button>
                )}
                {data.wiki_url && (
                  <button className="mc-btn-primary" onClick={() => linkButton(data.wiki_url)} style={{ fontSize: '13px', padding: '10px 18px', background: 'var(--pg-dark2)', border: '1px solid var(--pg-dark3)', color: 'var(--pg-text-muted)' }}>
                    Wiki
                  </button>
                )}
                <button
                  className="mc-btn-primary"
                  onClick={() => linkButton(`https://modrinth.com/server/${slug}`)}
                  style={{ fontSize: '13px', padding: '10px 18px', background: 'var(--pg-dark2)', border: '1px solid var(--pg-dark3)', color: 'var(--pg-text-muted)' }}
                >
                  {t('servers.modrinthPage')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Просмотр скриншота */}
      {lightbox !== null && images[lightbox] && (
        <div
          onClick={(e) => {
            // Клик по фону закрывает только просмотр: без stopPropagation
            // событие всплывало до оверлея карточки и закрывало сам сервер.
            e.stopPropagation()
            setLightbox(null)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 4, 4, 0.96)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 80px',
            boxSizing: 'border-box',
          }}
        >
          <img
            src={images[lightbox].url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '2px solid #000', boxShadow: '0 12px 48px rgba(0,0,0,0.95)' }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(null)
            }}
            style={{
              position: 'absolute',
              top: '15px',
              right: '20px',
              width: '32px',
              height: '32px',
              background: 'var(--pg-dark3)',
              border: '1px solid #3a3a3a',
              color: '#aaa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('servers.closeEsc')}
          >
            <X size={18} />
          </button>
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox((i) => (i === null ? null : (i - 1 + images.length) % images.length))
                }}
                style={{ position: 'absolute', left: '16px', top: 'calc(50% - 26px)', width: '52px', height: '52px', background: 'rgba(26,26,26,0.92)', border: '2px solid #000', color: 'var(--pg-yellow)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronLeft size={30} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox((i) => (i === null ? null : (i + 1) % images.length))
                }}
                style={{ position: 'absolute', right: '16px', top: 'calc(50% - 26px)', width: '52px', height: '52px', background: 'rgba(26,26,26,0.92)', border: '2px solid #000', color: 'var(--pg-yellow)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronRight size={30} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: '16px',
        padding: '12px 16px',
        borderBottom: '1px solid #232323',
        fontSize: '14px',
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--pg-text-muted)', fontFamily: '"MinecraftTen", "Blocks", sans-serif', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.6px' }}>
        {label}
      </span>
      <span
        style={{
          color: highlight ? 'var(--pg-yellow)' : 'var(--pg-text)',
          fontFamily: mono ? 'monospace' : '"Blocks", sans-serif',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
    </div>
  )
}
