import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Download, Clock, Tag, ArrowLeft } from 'lucide-react';
import { useTranslation } from './i18n';
import './ModViewer.css';

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
  const [projectDetails, setProjectDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const projectId = mod.project_id || mod.id;
        
        // Fetch project details
        const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProjectDetails(data);
        }

        // Fetch versions
        const verRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
        if (verRes.ok) {
          const vData = await verRes.json();
          setVersions(vData);
        }

        // Fetch dependencies
        const depRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/dependencies`);
        if (depRes.ok) {
          const dData = await depRes.json();
          setDependencies(dData.projects || []);
        }

      } catch (err) {
        console.error("Failed to fetch mod details:", err);
      }
      setLoading(false);
    };

    if (mod) {
      fetchDetails();
    }
  }, [mod]);

  if (!mod) return null;

  const getModIcon = (m: any) => m.icon_url || m.logo_url || './iconsblocks/Grass_Block.png';
  const getModTitle = (m: any) => m.title || m.name || 'Unknown Mod';

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
          
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', color: '#fff', fontWeight: 'bold' }}>{getModTitle(mod)}</h1>
            <div style={{ color: '#aaa', fontSize: '16px', marginBottom: '15px', display: 'flex', gap: '8px' }}>
              Автор: <span style={{ color: 'var(--pg-yellow)', fontWeight: 'bold' }}>{mod.author || projectDetails?.organization || 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', gap: '30px', color: '#aaa', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} /> {((projectDetails?.downloads || mod.downloads) || 0).toLocaleString()}
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

        {/* Tabs Navigation */}
        <div className="mod-viewer-tabs" style={{
          display: 'flex',
          padding: '0 40px',
          borderBottom: '1px solid var(--pg-dark3)',
          gap: '30px',
          background: 'var(--pg-dark2)'
        }}>
          {[
            { id: 'overview', label: 'Обзор' },
            { id: 'gallery', label: 'Картинки' },
            { id: 'versions', label: 'Версии' },
            { id: 'dependencies', label: 'Зависимости' }
          ].map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '20px 0',
                cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--pg-yellow)' : '#aaa',
                borderBottom: activeTab === tab.id ? '3px solid var(--pg-yellow)' : '3px solid transparent',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                fontSize: '16px',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
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
          {loading ? (
            <div style={{ textAlign: 'center', color: '#aaa', marginTop: '50px', fontSize: '18px' }}>Загрузка деталей...</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="markdown-body" style={{ padding: '40px', color: '#ddd', lineHeight: 1.6, width: '100%', maxWidth: '100%', margin: '0 auto', fontSize: '15px', boxSizing: 'border-box' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {projectDetails?.body || mod.description || "Описание отсутствует."}
                  </ReactMarkdown>
                </div>
              )}

              {activeTab === 'gallery' && (
                <div style={{ padding: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
                  {projectDetails?.gallery?.length > 0 ? projectDetails.gallery.map((img: any, idx: number) => (
                    <a key={idx} href={img.url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                      <img src={img.url} alt={img.title || 'Screenshot'} style={{
                        width: '100%', height: 'auto', objectFit: 'contain',
                        border: '1px solid var(--pg-dark3)'
                      }} />
                      {img.title && <div style={{ color: '#aaa', marginTop: '10px', textAlign: 'center', fontSize: '14px' }}>{img.title}</div>}
                    </a>
                  )) : (
                    <div style={{ color: '#aaa', textAlign: 'center', gridColumn: '1 / -1', marginTop: '50px', fontSize: '18px' }}>Нет скриншотов</div>
                  )}
                </div>
              )}

              {activeTab === 'versions' && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', margin: '0' }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr', gap: '10px',
                    padding: '15px 20px', background: 'var(--pg-yellow)', color: 'black', fontWeight: 'bold',
                    fontSize: '14px', borderBottom: '1px solid rgba(0,0,0,0.1)',
                    position: 'sticky', top: 0, zIndex: 10
                  }}>
                    <div>Дата обновления</div>
                    <div>Версия</div>
                    <div>Тип загрузчика</div>
                    <div>Зрелость версии</div>
                    <div>Версия игры</div>
                    <div style={{ textAlign: 'center' }}>Операция</div>
                  </div>
                  {/* Table Body */}
                  {versions.length > 0 ? versions.map((v: any, idx: number) => {
                    const isCompatible = activeModpack && 
                      v.game_versions?.includes(activeModpack.version) && 
                      v.loaders?.some((l: string) => l.toLowerCase() === activeModpack.loader.toLowerCase());
                    
                    return (
                      <div key={idx} style={{
                        display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr', gap: '10px',
                        padding: '15px 20px', borderBottom: '1px solid var(--pg-dark3)',
                        alignItems: 'center', fontSize: '14px', color: '#ccc',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.2)'
                      }}>
                        <div>{new Date(v.date_published).toLocaleDateString()}</div>
                        <div style={{ color: '#fff' }}>{v.name}</div>
                        <div>{v.loaders?.join(', ')}</div>
                        <div>{v.version_type || 'release'}</div>
                        <div>{v.game_versions?.join(', ')}</div>
                        <div style={{ textAlign: 'center' }}>
                          <button 
                            disabled={!isCompatible}
                            onClick={() => isCompatible && onInstall(mod)}
                            title={isCompatible ? 'Скачать совместимую версию' : 'Версия несовместима'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: isCompatible ? '#2ecc71' : '#555',
                              cursor: isCompatible ? 'pointer' : 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '5px'
                            }}
                          >
                            <Download size={20} />
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ color: '#aaa', textAlign: 'center', marginTop: '50px', fontSize: '18px' }}>Нет доступных версий</div>
                  )}
                </div>
              )}

              {activeTab === 'dependencies' && (
                <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
                  {dependencies.length > 0 ? dependencies.map((dep: any, idx: number) => (
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
                  )) : (
                    <div style={{ color: '#aaa', textAlign: 'center', marginTop: '50px', fontSize: '18px' }}>Нет зависимостей</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
