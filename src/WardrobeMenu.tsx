import { useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n';
import { SkinViewer, WalkingAnimation } from 'skinview3d';
import { Upload, Trash2 } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: 'offline' | 'elyby' | 'microsoft' | 'pgsync';
  token?: string;
}

export default function WardrobeMenu({ 
  account, 
  opacity = 95, 
  onSkinChange 
}: { 
  account: Account, 
  opacity?: number, 
  onSkinChange?: () => void 
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skinViewerRef = useRef<SkinViewer | null>(null);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const skinUrl = account.type === 'elyby'
    ? `https://skinsystem.ely.by/skins/${account.name}.png`
    : `https://pg-sync-server.onrender.com/api/cosmetics/${account.name}/skin.png`;
  const capeUrl = account.type === 'elyby'
    ? `https://skinsystem.ely.by/cloaks/${account.name}.png`
    : `https://pg-sync-server.onrender.com/api/cosmetics/${account.name}/cape.png`;
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    if (!canvasRef.current) return;

    let isCancelled = false;
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 300,
      height: 380
    });

    viewer.animation = new WalkingAnimation();
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.5;
    skinViewerRef.current = viewer;

    const loadSkinData = async () => {
      try {
        if (account.type === 'elyby') {
          // @ts-ignore
          if (window.electronAPI && typeof window.electronAPI.getElybySkin === 'function') {
            try {
              // @ts-ignore
              const res = await window.electronAPI.getElybySkin(account.name);
              if (res && res.skinBase64) {
                const img = new Image();
                img.onload = () => {
                  if (!isCancelled && skinViewerRef.current) {
                    skinViewerRef.current.loadSkin(img, { model: res.model || 'auto-detect' });
                  }
                };
                img.src = res.skinBase64;
                if (res.capeBase64) {
                  const capeImg = new Image();
                  capeImg.onload = () => {
                    if (!isCancelled && skinViewerRef.current) {
                      skinViewerRef.current.loadCape(capeImg);
                    }
                  };
                  capeImg.src = res.capeBase64;
                }
                return;
              }
            } catch {}
          }

          // Try Vite proxy
          try {
            const proxyRes = await fetch(`/api-elyby-textures/textures/${encodeURIComponent(account.name)}`);
            if (proxyRes.ok) {
              const texData: any = await proxyRes.json();
              if (texData?.SKIN?.url) {
                const storagePath = texData.SKIN.url.replace(/^https?:\/\/ely\.by\//, '/api-elyby-storage/');
                const imgRes = await fetch(storagePath);
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const img = new Image();
                  const model = texData.SKIN.metadata?.model === 'slim' ? 'slim' : 'default';
                  img.onload = () => {
                    if (!isCancelled && skinViewerRef.current) {
                      skinViewerRef.current.loadSkin(img, { model });
                    }
                  };
                  img.src = blobUrl;
                  if (texData?.CAPE?.url) {
                    const capePath = texData.CAPE.url.replace(/^https?:\/\/ely\.by\//, '/api-elyby-storage/');
                    const capeRes = await fetch(capePath);
                    if (capeRes.ok) {
                      const capeBlob = await capeRes.blob();
                      const capeImg = new Image();
                      capeImg.onload = () => {
                        if (!isCancelled && skinViewerRef.current) {
                          skinViewerRef.current.loadCape(capeImg);
                        }
                      };
                      capeImg.src = URL.createObjectURL(capeBlob);
                    }
                  }
                  return;
                }
              }
            }
          } catch {}

          let targetSkin = `https://skinsystem.ely.by/skins/${encodeURIComponent(account.name)}.png`;
          let model: 'slim' | 'default' | 'auto-detect' = 'auto-detect';
          let targetCape: string | null = null;
          try {
            const texRes = await fetch(`https://skinsystem.ely.by/textures/${encodeURIComponent(account.name)}`);
            if (texRes.ok) {
              const texData: any = await texRes.json();
              if (texData?.SKIN?.url) {
                targetSkin = texData.SKIN.url.replace(/^http:\/\//, 'https://');
                if (texData.SKIN.metadata?.model === 'slim') model = 'slim';
                else if (texData.SKIN.metadata?.model === 'default') model = 'default';
              }
              if (texData?.CAPE?.url) {
                targetCape = texData.CAPE.url.replace(/^http:\/\//, 'https://');
              }
            }
          } catch {}

          let skinLoaded = false;
          // @ts-ignore
          if (window.electronAPI?.fetchImageData) {
            try {
              // @ts-ignore
              const b64 = await window.electronAPI.fetchImageData(targetSkin);
              if (b64) {
                const img = new Image();
                img.onload = () => {
                  if (!isCancelled && skinViewerRef.current) {
                    skinViewerRef.current.loadSkin(img, { model });
                  }
                };
                img.src = b64;
                skinLoaded = true;
              }
            } catch {}
          }
          if (!skinLoaded) {
            try {
              const res = await fetch(targetSkin);
              if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                  if (!isCancelled && skinViewerRef.current) {
                    skinViewerRef.current.loadSkin(img, { model });
                  }
                };
                img.src = blobUrl;
                skinLoaded = true;
              }
            } catch {}
          }

          if (targetCape) {
            // @ts-ignore
            if (window.electronAPI?.fetchImageData) {
              // @ts-ignore
              const capeB64 = await window.electronAPI.fetchImageData(targetCape);
              if (capeB64) {
                const img = new Image();
                img.onload = () => {
                  if (!isCancelled && skinViewerRef.current) {
                    skinViewerRef.current.loadCape(img);
                  }
                };
                img.src = capeB64;
              }
            }
          }
        } else {
          viewer.loadSkin(`${skinUrl}?t=${timestamp}`).catch(() => {
            viewer.loadSkin(`https://minotar.net/skin/${account.name}`).catch(() => {
              viewer.loadSkin('https://minotar.net/skin/Steve');
            });
          });
          viewer.loadCape(`${capeUrl}?t=${timestamp}`).catch(() => {});
        }
      } catch (err) {
        console.warn('[WardrobeMenu] Skin load error:', err);
      }
    };

    loadSkinData();

    return () => {
      isCancelled = true;
      if (skinViewerRef.current) {
        skinViewerRef.current.dispose();
      }
    };
  }, [skinUrl, capeUrl, timestamp, account.name, account.type]);

  const handleUpload = async (type: 'skin' | 'cape', file: File) => {
    setLoading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append(type, file);

      const res = await fetch(`https://pg-sync-server.onrender.com/api/cosmetics/${type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.token}`
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Unknown error');
      }

      setMessage(t('wardrobe.success') as string);
      const newTs = Date.now();
      setTimestamp(newTs);
      if (onSkinChange) onSkinChange();
    } catch (e: any) {
      setMessage(`${t('wardrobe.error')} ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type: 'skin' | 'cape') => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`https://pg-sync-server.onrender.com/api/cosmetics/${type}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${account.token}`
        }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Unknown error');
      }

      setMessage(t('wardrobe.success') as string);
      const newTs = Date.now();
      setTimestamp(newTs);
      if (onSkinChange) onSkinChange();
    } catch (e: any) {
      setMessage(`${t('wardrobe.error')} ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = (id: string) => {
    document.getElementById(id)?.click();
  };

  const frameBgStyle: React.CSSProperties = {
    background: `color-mix(in srgb, var(--pg-dark) ${opacity}%, transparent)`,
    border: '3px solid #111',
    boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #111',
    backdropFilter: 'blur(8px)',
  };

  return (
    <div style={{ padding: '25px', color: 'white', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <h1 style={{ fontFamily: '"Blocks", sans-serif', textTransform: 'uppercase', margin: '0 0 15px 0', fontSize: '24px', letterSpacing: '1px' }}>{t('wardrobe.title') as string}</h1>
      
      <div style={{ display: 'flex', gap: '25px', flex: 1, minHeight: 0 }}>
        {/* 3D Model Frame */}
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          alignSelf: 'stretch',
          width: '260px',
          flexShrink: 0,
          padding: '15px',
          ...frameBgStyle
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
          </div>
          <div style={{ marginTop: '15px', color: '#aaa', fontSize: '11px', textAlign: 'center', lineHeight: '1.4' }}>
            {t('skins.previewHint') as string}
          </div>
        </div>

        {/* Action Cards Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
          {message && (
            <div style={{ 
              padding: '12px 16px', 
              background: message.includes('error') || message.includes('Ошибка') ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)', 
              border: `2px solid ${message.includes('error') || message.includes('Ошибка') ? '#e74c3c' : '#2ecc71'}`,
              color: message.includes('error') || message.includes('Ошибка') ? '#ff6b6b' : '#2ecc71',
              fontFamily: '"MinecraftTen", "Blocks", sans-serif',
              fontSize: '13px'
            }}>
              {message}
            </div>
          )}

          {/* Skin Card */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 25px', ...frameBgStyle }}>
            <h3 style={{ fontFamily: '"Blocks", sans-serif', margin: '0 0 6px 0', fontSize: '18px', color: '#ffffff', letterSpacing: '1px' }}>Скин</h3>
            <p style={{ color: '#888888', fontSize: '12px', marginBottom: '20px', marginTop: 0 }}>Формат PNG, размер 64x64 или 64x32</p>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', flexWrap: 'wrap' }}>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ 
                  padding: '10px 22px', 
                  fontSize: '13px', 
                  fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                  letterSpacing: '1px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => triggerFileInput('skin-upload')}
                disabled={loading}
              >
                <Upload size={16} />
                {t('wardrobe.uploadSkin') as string}
              </button>
              
              <button 
                className="mc-btn-danger" 
                style={{ 
                  padding: '10px 20px', 
                  fontSize: '13px', 
                  letterSpacing: '1px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => handleDelete('skin')}
                disabled={loading}
              >
                <Trash2 size={16} />
                {t('wardrobe.deleteSkin') as string}
              </button>

              <input 
                type="file" 
                id="skin-upload" 
                accept=".png" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload('skin', e.target.files[0]);
                  }
                }}
              />
            </div>
          </div>

          {/* Cape Card */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 25px', ...frameBgStyle }}>
            <h3 style={{ fontFamily: '"Blocks", sans-serif', margin: '0 0 6px 0', fontSize: '18px', color: '#ffffff', letterSpacing: '1px' }}>Плащ</h3>
            <p style={{ color: '#888888', fontSize: '12px', marginBottom: '20px', marginTop: 0 }}>Формат PNG, размер 64x32</p>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', flexWrap: 'wrap' }}>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ 
                  padding: '10px 22px', 
                  fontSize: '13px', 
                  fontFamily: '"MinecraftTen", "Blocks", sans-serif',
                  letterSpacing: '1px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => triggerFileInput('cape-upload')}
                disabled={loading}
              >
                <Upload size={16} />
                {t('wardrobe.uploadCape') as string}
              </button>

              <button 
                className="mc-btn-danger" 
                style={{ 
                  padding: '10px 20px', 
                  fontSize: '13px', 
                  letterSpacing: '1px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => handleDelete('cape')}
                disabled={loading}
              >
                <Trash2 size={16} />
                {t('wardrobe.deleteCape') as string}
              </button>

              <input 
                type="file" 
                id="cape-upload" 
                accept=".png" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload('cape', e.target.files[0]);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
