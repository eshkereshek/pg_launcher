import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { 
  Clock, Tag, ArrowLeft, ChevronLeft, ChevronRight, X, 
  Image as ImageIcon, ZoomIn, ZoomOut, Check, Loader2 
} from 'lucide-react';
import { useTranslation } from './i18n';
import './ModViewer.css';

export const PixelDownloadIcon = ({ size = 20, color = "#000000", opacity = 1, style }: { size?: number, color?: string, opacity?: number, style?: React.CSSProperties }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    style={{ display: 'block', flexShrink: 0, opacity, ...style }}
  >
    <path fill={color} d="M13.09 4h-2.18v7.273H8.726v2.182h2.182v2.181h2.182v-2.181h2.182v-2.182H13.09zM17.455 9.09h-2.182v2.183h2.182z" />
    <path fill={color} d="M8.727 9.09H6.545v2.183h2.182zM6.182 17.818h11.636v-2.182H20V20H4v-4.364h2.182z" />
    <path stroke="#000000" strokeOpacity={color === '#000000' ? 0.25 : 0.4} d="M13.59 4v-.5h-3.18v7.273H9.226V8.59H6.045v3.182h2.182v2.181h2.182v2.182h3.182v-2.181h2.182v-2.182h2.181V8.59h-3.181v2.182H13.59zm4.228 11.136h-.5v2.182H6.682v-2.182H3.5V20.5h17v-5.364h-2.682Z" />
  </svg>
);

// In-memory session cache for fast instant rendering (0ms latency)
const projectDetailsCache = new Map<string, any>();
const versionsCache = new Map<string, any[]>();
const dependenciesCache = new Map<string, any[]>();

interface ModViewerProps {
  mod: any;
  activeModpack?: any;
  onClose: () => void;
  onInstall: (mod: any) => void;
  isInstalled: boolean;
  isDownloading: boolean;
}

export default function ModViewer({ mod, activeModpack, onClose, onInstall, isInstalled, isDownloading }: ModViewerProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'gallery' | 'versions' | 'dependencies'>('overview');
  
  const projectId = mod?.project_id || mod?.id;

  const [projectDetails, setProjectDetails] = useState<any>(() => (projectId ? projectDetailsCache.get(projectId) || null : null));
  const [loadingProject, setLoadingProject] = useState(!projectDetailsCache.has(projectId));

  const [versions, setVersions] = useState<any[]>(() => (projectId ? versionsCache.get(projectId) || [] : []));
  const [loadingVersions, setLoadingVersions] = useState(!versionsCache.has(projectId));

  const [dependencies, setDependencies] = useState<any[]>(() => (projectId ? dependenciesCache.get(projectId) || [] : []));
  const [loadingDependencies, setLoadingDependencies] = useState(!dependenciesCache.has(projectId));

  // Gallery state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Versions pagination limit for buttery smooth DOM performance
  const [visibleCount, setVisibleCount] = useState(40);

  const galleryImages: { url: string; title: string; description?: string }[] = (
    projectDetails?.gallery || mod?.gallery || mod?.screenshots || []
  ).map((img: any) => {
    if (typeof img === 'string') return { url: img, title: '' };
    return {
      url: img.url || img.raw_url || '',
      title: img.title || '',
      description: img.description || ''
    };
  }).filter((img: any) => !!img.url);

  const handlePrevImage = () => {
    if (galleryImages.length <= 1) return;
    setIsZoomed(false);
    setCurrentImageIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  const handleNextImage = () => {
    if (galleryImages.length <= 1) return;
    setIsZoomed(false);
    setCurrentImageIndex(prev => (prev + 1) % galleryImages.length);
  };

  useEffect(() => {
    setCurrentImageIndex(0);
    setIsLightboxOpen(false);
    setIsZoomed(false);
    setVisibleCount(40);
  }, [projectId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'gallery' || galleryImages.length === 0) return;

      if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'Escape') {
        if (isLightboxOpen) {
          setIsLightboxOpen(false);
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, galleryImages.length, isLightboxOpen]);

  // Fast concurrent fetching & caching
  useEffect(() => {
    if (!projectId) return;

    // 1. Project details
    if (projectDetailsCache.has(projectId)) {
      setProjectDetails(projectDetailsCache.get(projectId));
      setLoadingProject(false);
    } else {
      setLoadingProject(true);
      fetch(`https://api.modrinth.com/v2/project/${projectId}`)
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            projectDetailsCache.set(projectId, data);
            setProjectDetails(data);
          }
        })
        .catch(err => console.error("Failed to fetch project details:", err))
        .finally(() => setLoadingProject(false));
    }

    // 2. Versions (fetched in parallel!)
    if (versionsCache.has(projectId)) {
      setVersions(versionsCache.get(projectId)!);
      setLoadingVersions(false);
    } else {
      setLoadingVersions(true);
      fetch(`https://api.modrinth.com/v2/project/${projectId}/version`)
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            versionsCache.set(projectId, data);
            setVersions(data);
          }
        })
        .catch(err => console.error("Failed to fetch versions:", err))
        .finally(() => setLoadingVersions(false));
    }

    // 3. Dependencies (fetched in parallel!)
    if (dependenciesCache.has(projectId)) {
      setDependencies(dependenciesCache.get(projectId)!);
      setLoadingDependencies(false);
    } else {
      setLoadingDependencies(true);
      fetch(`https://api.modrinth.com/v2/project/${projectId}/dependencies`)
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            const deps = data.projects || [];
            dependenciesCache.set(projectId, deps);
            setDependencies(deps);
          }
        })
        .catch(err => console.error("Failed to fetch dependencies:", err))
        .finally(() => setLoadingDependencies(false));
    }
  }, [projectId]);

  if (!mod) return null;

  const getModIcon = (m: any) => m?.icon_url || m?.logo_url || './iconsblocks/Grass_Block.png';
  const getModTitle = (m: any) => m?.title || m?.name || 'Unknown Mod';

  return (
    <div className="mod-viewer-overlay" onClick={onClose} style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--pg-dark)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className="mod-viewer-container" onClick={e => e.stopPropagation()} style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--pg-dark)',
        color: 'var(--pg-text)'
      }}>
        {/* Header */}
        <div className="mod-viewer-header" style={{
          padding: '60px 40px 20px 40px',
          display: 'flex',
          gap: '30px',
          borderBottom: '1px solid var(--pg-dark3)',
          alignItems: 'center',
          position: 'relative',
          background: 'var(--pg-dark2)',
          boxSizing: 'border-box'
        }}>
          <button
            onClick={onClose}
            className="mc-btn-primary"
            style={{
              position: 'absolute',
              top: '15px', left: '15px',
              padding: '6px 12px',
              background: '#222',
              border: 'none',
              color: '#aaa',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderRadius: '0',
              zIndex: 10
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{
            width: '136px', height: '136px',
            backgroundImage: "url('./mapp.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
          }}>
            <div style={{
              width: '120px', height: '120px',
              borderRadius: '0',
              background: '#fff',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              overflow: 'hidden',
              aspectRatio: '1/1'
            }}>
              <img src={getModIcon(projectDetails || mod)} alt={getModTitle(mod)} style={{
                width: '100%', height: '100%',
                objectFit: 'cover'
              }} />
            </div>
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', color: '#fff', fontWeight: 'bold' }}>{getModTitle(mod)}</h1>
            <div style={{ color: '#aaa', fontSize: '16px', marginBottom: '15px', display: 'flex', gap: '8px' }}>
              Автор: <span style={{ color: 'var(--pg-yellow)', fontWeight: 'bold' }}>{mod.author || projectDetails?.organization || 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', color: '#aaa', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PixelDownloadIcon size={18} color="currentColor" style={{ display: 'inline-block' }} /> {((projectDetails?.downloads || mod.downloads) || 0).toLocaleString()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} /> {new Date(projectDetails?.updated || mod.date_modified || Date.now()).toLocaleDateString()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={18} /> Последняя: {mod.versions ? mod.versions[mod.versions.length - 1] : projectDetails?.versions?.[projectDetails.versions.length - 1] || '?'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginRight: '20px', flexShrink: 0 }}>
            {isInstalled ? (
              <button className="mc-btn-primary" style={{ background: '#27ae60', borderColor: '#2ecc71', fontSize: '18px', padding: '15px 30px', fontWeight: 'bold' }}>
                {t("mods.isInstalled") || "Установлено"}
              </button>
            ) : isDownloading ? (
              <button className="mc-btn-primary" disabled style={{ fontSize: '18px', padding: '15px 30px', fontWeight: 'bold' }}>
                Загрузка...
              </button>
            ) : (
              <button className="mc-btn-primary" onClick={() => onInstall(mod)} style={{ fontSize: '18px', padding: '15px 30px', fontWeight: 'bold' }}>
                {t("mods.install") || "Установить"}
              </button>
            )}
          </div>
        </div>

        {/* Tabs Navigation (Narrower height) */}
        <div className="mod-viewer-tabs" style={{
          display: 'flex',
          padding: '0 40px',
          borderBottom: '1px solid var(--pg-dark3)',
          gap: '24px',
          background: 'var(--pg-dark2)'
        }}>
          {[
            { id: 'overview', label: 'Обзор' },
            { id: 'gallery', label: 'Картинки', count: galleryImages.length },
            { id: 'versions', label: 'Версии', count: versions.length },
            { id: 'dependencies', label: 'Зависимости', count: dependencies.length }
          ].map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '10px 0',
                cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--pg-yellow)' : '#aaa',
                borderBottom: activeTab === tab.id ? '2px solid var(--pg-yellow)' : '2px solid transparent',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                fontSize: '14px',
                fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '7px'
              }}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  background: activeTab === tab.id ? 'rgba(241, 196, 15, 0.2)' : 'rgba(255,255,255,0.06)',
                  color: activeTab === tab.id ? 'var(--pg-yellow)' : '#888',
                  border: activeTab === tab.id ? '1px solid var(--pg-yellow)' : '1px solid #333'
                }}>
                  {tab.count}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="mod-viewer-content" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0',
          boxSizing: 'border-box',
          background: 'var(--pg-dark)'
        }}>
          {activeTab === 'overview' && (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
              {loadingProject && !projectDetails?.body && !mod.description ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '80px 20px',
                  gap: '16px'
                }}>
                  <Loader2 size={36} className="mc-spin" style={{ color: 'var(--pg-yellow)' }} />
                  <span style={{ color: '#aaa', fontSize: '16px', fontFamily: '"Blocks", sans-serif' }}>
                    Загрузка описания...
                  </span>
                </div>
              ) : (
                <div className="markdown-body" style={{ padding: '40px', color: '#ddd', lineHeight: 1.6, width: '100%', maxWidth: '100%', margin: '0 auto', fontSize: '15px', boxSizing: 'border-box' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {projectDetails?.body || mod.description || "Описание отсутствует."}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gallery' && (
            <div style={{
              padding: '30px 40px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {galleryImages.length > 0 ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: '20px',
                  width: '100%'
                }}>
                  {galleryImages.map((img: any, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setCurrentImageIndex(idx);
                        setIsLightboxOpen(true);
                      }}
                      className="hover-scale-btn"
                      style={{
                        background: '#141414',
                        border: '2px solid #000',
                        borderRadius: '0px',
                        boxShadow: 'inset -2px -2px 0 0 rgba(0,0,0,0.4), inset 2px 2px 0 0 rgba(255,255,255,0.06), 0 4px 8px rgba(0,0,0,0.5)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.outline = '2px solid var(--pg-yellow)';
                        e.currentTarget.style.outlineOffset = '2px';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.outline = 'none';
                      }}
                      title="Нажмите, чтобы увеличить"
                    >
                      <div style={{
                        width: '100%',
                        aspectRatio: '16 / 10',
                        background: '#0a0a0a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        <img
                          src={img.url}
                          alt={img.title || `Скриншот ${idx + 1}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                            transition: 'transform 0.2s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: '6px',
                          right: '6px',
                          background: 'rgba(0,0,0,0.75)',
                          border: '1px solid #333',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                          color: 'var(--pg-yellow)',
                          pointerEvents: 'none'
                        }}>
                          #{idx + 1}
                        </div>
                      </div>
                      {img.title && (
                        <div style={{
                          padding: '8px 10px',
                          color: '#ddd',
                          fontSize: '13px',
                          fontFamily: '"Blocks", sans-serif',
                          textAlign: 'center',
                          background: '#181818',
                          borderTop: '1px solid #282828',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {img.title}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '80px 20px',
                  color: '#777',
                  gap: '14px'
                }}>
                  <ImageIcon size={48} color="#444" />
                  <span style={{ fontSize: '16px', fontFamily: '"Blocks", sans-serif' }}>
                    У этого мода нет скриншотов в галерее
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'versions' && (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '300px' }}>
              {/* Table Body or Loading State */}
              {loadingVersions ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '90px 20px',
                  gap: '16px'
                }}>
                  <Loader2 size={36} className="mc-spin" style={{ color: 'var(--pg-yellow)' }} />
                  <span style={{
                    fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                    color: '#ddd',
                    fontSize: '16px'
                  }}>
                    Загрузка версий с Modrinth...
                  </span>
                  <span style={{ color: '#777', fontSize: '13px', fontFamily: '"Blocks", sans-serif' }}>
                    Получение списка релизов
                  </span>
                </div>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  {/* Table Header: Removed Status/Channel, Clean Layout */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '120px minmax(220px, 1fr) 150px 150px 90px',
                    gap: '12px',
                    padding: '10px 24px',
                    background: '#161616',
                    color: 'var(--pg-yellow)',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    borderBottom: '2px solid var(--pg-yellow)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    alignItems: 'center',
                    minWidth: '700px'
                  }}>
                    <div>Дата</div>
                    <div>Версия</div>
                    <div>Загрузчик</div>
                    <div>Minecraft</div>
                    <div style={{ textAlign: 'center' }}>Действие</div>
                  </div>

                  {/* Rows */}
                  {versions.length > 0 ? (
                    <>
                      {versions.slice(0, visibleCount).map((v: any, idx: number) => {
                        const isCompatible = activeModpack && 
                          v.game_versions?.includes(activeModpack.version) && 
                          v.loaders?.some((l: string) => l.toLowerCase() === activeModpack.loader.toLowerCase());
                        
                        return (
                          <div
                            key={v.id || idx}
                            className="mod-version-row"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '120px minmax(220px, 1fr) 150px 150px 90px',
                              gap: '12px',
                              padding: '10px 24px',
                              borderBottom: '1px solid #232323',
                              borderLeft: isCompatible ? '3px solid #2ecc71' : '3px solid transparent',
                              alignItems: 'center',
                              fontSize: '13px',
                              color: '#ccc',
                              background: idx % 2 === 0 ? '#131313' : '#171717',
                              minWidth: '700px'
                            }}
                          >
                            {/* Date */}
                            <div style={{
                              color: '#999',
                              fontSize: '12px',
                              fontFamily: '"Blocks", sans-serif'
                            }}>
                              {v.date_published ? new Date(v.date_published).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                            </div>

                            {/* Version Name & Subtitle */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, overflow: 'hidden' }}>
                              <div style={{
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '13px',
                                fontFamily: '"Blocks", sans-serif',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }} title={v.name || v.version_number}>
                                {v.name || v.version_number}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '11px', color: '#777' }}>
                                {v.version_number && v.version_number !== v.name && (
                                  <span style={{
                                    fontFamily: 'monospace',
                                    color: 'var(--pg-yellow)',
                                    background: 'rgba(241, 196, 15, 0.08)',
                                    border: '1px solid rgba(241, 196, 15, 0.2)',
                                    padding: '1px 5px'
                                  }}>
                                    {v.version_number}
                                  </span>
                                )}
                                {typeof v.downloads === 'number' && v.downloads > 0 && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#666' }}>
                                    <PixelDownloadIcon size={12} color="currentColor" style={{ display: 'inline-block' }} /> {v.downloads.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Loaders */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                              {v.loaders && v.loaders.length > 0 ? (
                                v.loaders.map((ldr: string) => {
                                  const key = ldr.toLowerCase();
                                  let color = '#38bdf8';
                                  let bg = 'rgba(56, 189, 248, 0.12)';
                                  let border = 'rgba(56, 189, 248, 0.35)';
                                  let label = ldr;
                                  if (key === 'fabric') { color = '#38bdf8'; bg = 'rgba(56, 189, 248, 0.12)'; border = 'rgba(56, 189, 248, 0.35)'; label = 'Fabric'; }
                                  else if (key === 'forge') { color = '#fb923c'; bg = 'rgba(251, 146, 60, 0.12)'; border = 'rgba(251, 146, 60, 0.35)'; label = 'Forge'; }
                                  else if (key === 'neoforge') { color = '#c084fc'; bg = 'rgba(192, 132, 252, 0.12)'; border = 'rgba(192, 132, 252, 0.35)'; label = 'NeoForge'; }
                                  else if (key === 'quilt') { color = '#f472b6'; bg = 'rgba(244, 114, 182, 0.12)'; border = 'rgba(244, 114, 182, 0.35)'; label = 'Quilt'; }
                                  
                                  return (
                                    <span key={ldr} style={{
                                      fontSize: '11px',
                                      fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                                      color,
                                      background: bg,
                                      border: `1px solid ${border}`,
                                      padding: '2px 7px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {label}
                                    </span>
                                  );
                                })
                              ) : (
                                <span style={{ color: '#666', fontSize: '12px' }}>-</span>
                              )}
                            </div>

                            {/* Game Versions */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }} title={v.game_versions?.join(', ')}>
                              {v.game_versions && v.game_versions.length > 0 ? (
                                <>
                                  {v.game_versions.slice(0, 2).map((gv: string) => (
                                    <span key={gv} style={{
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      color: '#eee',
                                      background: '#232323',
                                      border: '1px solid #3d3d3d',
                                      padding: '2px 6px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {gv}
                                    </span>
                                  ))}
                                  {v.game_versions.length > 2 && (
                                    <span style={{
                                      fontSize: '10px',
                                      color: '#888',
                                      background: '#1a1a1a',
                                      border: '1px solid #333',
                                      padding: '2px 5px',
                                      whiteSpace: 'nowrap',
                                      cursor: 'default'
                                    }}>
                                      +{v.game_versions.length - 2}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#666', fontSize: '12px' }}>-</span>
                              )}
                            </div>

                            {/* Action - ONLY LOGO WITHOUT TEXT */}
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              {isInstalled && isCompatible ? (
                                <div
                                  className="mod-action-badge"
                                  title={t("mods.isInstalled") || "Установлен"}
                                  style={{
                                    background: 'rgba(46, 204, 113, 0.15)',
                                    border: '1px solid rgba(46, 204, 113, 0.4)',
                                    color: '#2ecc71',
                                    boxShadow: 'inset 0 0 4px rgba(46, 204, 113, 0.2)'
                                  }}
                                >
                                  <Check size={20} strokeWidth={2.5} color="#2ecc71" />
                                </div>
                              ) : isDownloading ? (
                                <div
                                  className="mod-action-badge"
                                  title="Загрузка..."
                                  style={{
                                    background: 'rgba(241, 196, 15, 0.12)',
                                    border: '1px solid rgba(241, 196, 15, 0.3)',
                                    color: 'var(--pg-yellow)'
                                  }}
                                >
                                  <Loader2 size={20} className="mc-spin" color="var(--pg-yellow)" />
                                </div>
                              ) : isCompatible ? (
                                <button
                                  type="button"
                                  className="mod-install-btn"
                                  onClick={() => onInstall(mod)}
                                  title={t("mods.install") || "Установить"}
                                >
                                  <PixelDownloadIcon size={20} color="#000000" />
                                </button>
                              ) : (
                                <div
                                  className="mod-action-badge"
                                  title={`Не подходит для текущей сборки (${activeModpack ? activeModpack.loader + ' ' + activeModpack.version : 'нет сборки'})`}
                                  style={{
                                    color: '#555'
                                  }}
                                >
                                  <PixelDownloadIcon size={18} color="#555555" opacity={0.35} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination Controls */}
                      {versions.length > visibleCount && (
                        <div style={{
                          padding: '14px',
                          display: 'flex',
                          justifyContent: 'center',
                          gap: '12px',
                          background: '#111',
                          borderTop: '1px solid #222'
                        }}>
                          <button
                            onClick={() => setVisibleCount(prev => prev + 40)}
                            className="mc-btn-primary hover-scale-btn"
                            style={{
                              padding: '8px 20px',
                              fontSize: '12px',
                              background: '#202020',
                              border: '1px solid #444',
                              color: '#fff',
                              cursor: 'pointer',
                              fontFamily: '"MinecraftTen", "Blocks", sans-serif'
                            }}
                          >
                            Показать ещё 40 версий (осталось {versions.length - visibleCount})
                          </button>
                          <button
                            onClick={() => setVisibleCount(versions.length)}
                            className="mc-btn-primary hover-scale-btn"
                            style={{
                              padding: '8px 20px',
                              fontSize: '12px',
                              background: '#181818',
                              border: '1px solid #333',
                              color: 'var(--pg-yellow)',
                              cursor: 'pointer',
                              fontFamily: '"MinecraftTen", "Blocks", sans-serif'
                            }}
                          >
                            Показать все ({versions.length})
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '80px 20px',
                      color: '#777',
                      gap: '14px'
                    }}>
                      <span style={{ fontSize: '15px', fontFamily: '"Blocks", sans-serif', color: '#bbb' }}>
                        Нет доступных версий
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
              {loadingDependencies ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '80px 20px',
                  gap: '16px'
                }}>
                  <Loader2 size={36} className="mc-spin" style={{ color: 'var(--pg-yellow)' }} />
                  <span style={{ color: '#aaa', fontSize: '16px', fontFamily: '"Blocks", sans-serif' }}>
                    Загрузка зависимостей...
                  </span>
                </div>
              ) : dependencies.length > 0 ? (
                dependencies.map((dep: any, idx: number) => (
                  <div key={idx} style={{
                    padding: '20px', background: 'var(--pg-dark2)', borderRadius: '0',
                    display: 'flex', alignItems: 'center', gap: '20px',
                    border: '1px solid var(--pg-dark3)'
                  }}>
                    <img src={dep.icon_url || './iconsblocks/Grass_Block.png'} alt="icon" style={{ width: '60px', height: '60px', borderRadius: '0', background: '#fff' }} />
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '18px', marginBottom: '5px' }}>{dep.title}</div>
                      <div style={{ color: '#aaa', fontSize: '14px', lineHeight: 1.4 }}>{dep.description}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#aaa', textAlign: 'center', marginTop: '50px', fontSize: '18px', fontFamily: '"Blocks", sans-serif' }}>Нет зависимостей</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Scaled / Fullscreen Viewing */}
      {isLightboxOpen && galleryImages.length > 0 && (
        <div
          onClick={() => {
            if (isZoomed) {
              setIsZoomed(false);
            } else {
              setIsLightboxOpen(false);
            }
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(4, 4, 4, 0.96)',
            backdropFilter: 'blur(10px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            userSelect: 'none'
          }}
        >
          {/* Top Floating Bar */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '15px',
              left: '20px',
              right: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 30,
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                fontSize: '15px',
                color: 'var(--pg-yellow)',
                background: '#181818',
                padding: '6px 14px',
                border: '1px solid #333'
              }}>
                {currentImageIndex + 1} / {galleryImages.length}
              </span>
              {galleryImages[currentImageIndex]?.title && (
                <span style={{
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  fontFamily: '"Blocks", sans-serif',
                  background: 'rgba(20,20,20,0.7)',
                  padding: '4px 10px',
                  border: '1px solid #333'
                }}>
                  {galleryImages[currentImageIndex].title}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Zoom Button */}
              <button
                type="button"
                className="hover-scale-btn"
                onClick={() => setIsZoomed(prev => !prev)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  background: isZoomed ? 'var(--pg-yellow)' : '#222222',
                  border: '1px solid #3a3a3a',
                  borderRadius: '0px',
                  color: isZoomed ? '#000' : '#aaa',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontFamily: '"Blocks", sans-serif',
                  transition: 'all 0.15s ease'
                }}
                title={isZoomed ? "Обычный размер" : "Приблизить (1.4x)"}
              >
                {isZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                <span>{isZoomed ? "1.4x" : "1x"}</span>
              </button>

              {/* Square Close Button */}
              <button
                type="button"
                className="hover-scale-btn"
                onClick={() => {
                  setIsZoomed(false);
                  setIsLightboxOpen(false);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  background: '#222222',
                  border: '1px solid #3a3a3a',
                  borderRadius: '0px',
                  color: '#aaa',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#530e0a';
                  e.currentTarget.style.borderColor = '#8a1c14';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#222222';
                  e.currentTarget.style.borderColor = '#3a3a3a';
                  e.currentTarget.style.color = '#aaa';
                }}
                title="Закрыть (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Left Flip Arrow */}
          {galleryImages.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handlePrevImage();
              }}
              style={{
                position: 'absolute',
                left: '16px',
                top: 'calc(50% - 26px)',
                width: '52px',
                height: '52px',
                background: 'rgba(26, 26, 26, 0.92)',
                border: '2px solid #000',
                borderRadius: '0px',
                color: 'var(--pg-yellow)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset -2px -2px 0 0 rgba(0,0,0,0.5), inset 2px 2px 0 0 rgba(255,255,255,0.2), 0 4px 0 0 #000',
                transition: 'background 0.15s ease, color 0.15s ease, outline 0.15s ease',
                zIndex: 25,
                transform: 'none'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--pg-yellow)';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.outline = '2px solid #fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(26, 26, 26, 0.92)';
                e.currentTarget.style.color = 'var(--pg-yellow)';
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.transform = 'none';
              }}
              onMouseDown={e => {
                e.currentTarget.style.transform = 'translateY(2px)';
              }}
              onMouseUp={e => {
                e.currentTarget.style.transform = 'none';
              }}
              title="Предыдущая (←)"
            >
              <ChevronLeft size={32} />
            </button>
          )}

          {/* Scaled Image Container */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 80px 40px 80px',
              boxSizing: 'border-box',
              overflow: isZoomed ? 'auto' : 'hidden'
            }}
          >
            <img
              src={galleryImages[currentImageIndex]?.url}
              alt={galleryImages[currentImageIndex]?.title || 'Скриншот'}
              onClick={() => setIsZoomed(prev => !prev)}
              style={{
                width: '100%',
                height: '100%',
                maxWidth: isZoomed ? '135vw' : 'calc(100vw - 160px)',
                maxHeight: isZoomed ? '135vh' : 'calc(100vh - 100px)',
                objectFit: 'contain',
                border: '2px solid #000',
                boxShadow: '0 12px 48px rgba(0,0,0,0.95)',
                cursor: isZoomed ? 'zoom-out' : 'zoom-in',
                transform: isZoomed ? 'scale(1.4)' : 'scale(1)',
                transformOrigin: 'center center',
                transition: 'transform 0.25s ease',
                userSelect: 'none'
              }}
              title={isZoomed ? "Кликните для уменьшения" : "Кликните для приближения (1.4x)"}
            />
          </div>

          {/* Right Flip Arrow */}
          {galleryImages.length > 1 && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleNextImage();
              }}
              style={{
                position: 'absolute',
                right: '16px',
                top: 'calc(50% - 26px)',
                width: '52px',
                height: '52px',
                background: 'rgba(26, 26, 26, 0.92)',
                border: '2px solid #000',
                borderRadius: '0px',
                color: 'var(--pg-yellow)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset -2px -2px 0 0 rgba(0,0,0,0.5), inset 2px 2px 0 0 rgba(255,255,255,0.2), 0 4px 0 0 #000',
                transition: 'background 0.15s ease, color 0.15s ease, outline 0.15s ease',
                zIndex: 25,
                transform: 'none'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--pg-yellow)';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.outline = '2px solid #fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(26, 26, 26, 0.92)';
                e.currentTarget.style.color = 'var(--pg-yellow)';
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.transform = 'none';
              }}
              onMouseDown={e => {
                e.currentTarget.style.transform = 'translateY(2px)';
              }}
              onMouseUp={e => {
                e.currentTarget.style.transform = 'none';
              }}
              title="Следующая (→)"
            >
              <ChevronRight size={32} />
            </button>
          )}

          {/* Bottom Footer / Description */}
          {galleryImages[currentImageIndex]?.description && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(18, 18, 18, 0.85)',
                border: '1px solid #333',
                padding: '6px 18px',
                color: '#bbb',
                fontSize: '13px',
                fontFamily: '"Blocks", sans-serif',
                textAlign: 'center',
                maxWidth: '70vw',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                zIndex: 20
              }}
            >
              {galleryImages[currentImageIndex].description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
