import { useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n';
import { SkinViewer, WalkingAnimation } from 'skinview3d';

interface Account {
  id: string;
  name: string;
  type: 'offline' | 'elyby' | 'microsoft' | 'pgsync';
  token?: string;
}

export default function WardrobeMenu({ account, onSkinChange }: { account: Account, onSkinChange?: () => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skinViewerRef = useRef<SkinViewer | null>(null);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const skinUrl = `https://pg-sync-server.onrender.com/api/cosmetics/${account.name}/skin.png`;
  const capeUrl = `https://pg-sync-server.onrender.com/api/cosmetics/${account.name}/cape.png`;
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    if (canvasRef.current) {
      const viewer = new SkinViewer({
        canvas: canvasRef.current,
        width: 300,
        height: 380,
        skin: `${skinUrl}?t=${timestamp}`
      });

      viewer.animation = new WalkingAnimation();
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.5;

      // Load cape if available
      viewer.loadCape(`${capeUrl}?t=${timestamp}`).catch(() => {
        // Ignore if cape doesn't exist
      });

      skinViewerRef.current = viewer;

      // Handle fallback if skin doesn't exist (e.g. 404)
      viewer.loadSkin(`${skinUrl}?t=${timestamp}`).catch(() => {
        viewer.loadSkin(`https://minotar.net/skin/${account.name}`).catch(() => {
          // If still fails, load Steve
          viewer.loadSkin('https://minotar.net/skin/Steve');
        });
      });
    }
    return () => {
      if (skinViewerRef.current) {
        skinViewerRef.current.dispose();
      }
    };
  }, [skinUrl, capeUrl, timestamp, account.name]);

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

  return (
    <div style={{ padding: '25px', color: 'white', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <h1 style={{ fontFamily: '"Blocks", sans-serif', textTransform: 'uppercase', margin: '0 0 15px 0', fontSize: '24px' }}>{t('wardrobe.title') as string}</h1>
      
      <div style={{ display: 'flex', gap: '30px', flex: 1, minHeight: 0 }}>
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          alignSelf: 'stretch',
          width: '240px',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.5)', 
          padding: '15px', 
          border: '3px solid #111', 
          boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #111'
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
          </div>
          <div style={{ marginTop: '15px', color: '#aaa', fontSize: '11px', textAlign: 'center', lineHeight: '1.4' }}>
            {t('skins.previewHint') as string}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
          {message && (
            <div style={{ 
              padding: '10px', 
              background: message.includes('error') || message.includes('Ошибка') ? 'rgba(255,50,50,0.2)' : 'rgba(50,255,50,0.2)', 
              border: `2px solid ${message.includes('error') || message.includes('Ошибка') ? '#ff4444' : '#44ff44'}`,
              borderRadius: '4px'
            }}>
              {message}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.5)', padding: '15px', border: '3px solid #111', boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #111' }}>
            <h3 style={{ fontFamily: '"Blocks", sans-serif', margin: '0 0 5px 0', fontSize: '16px' }}>Скин</h3>
            <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px', marginTop: 0 }}>Формат PNG, размер 64x64 или 64x32</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ flex: 1 }}
                onClick={() => triggerFileInput('skin-upload')}
                disabled={loading}
              >
                {t('wardrobe.uploadSkin') as string}
              </button>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ flex: 1 }}
                onClick={() => handleDelete('skin')}
                disabled={loading}
              >
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

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.5)', padding: '15px', border: '3px solid #111', boxShadow: 'inset 0 3px 0 0 #333, inset 3px 0 0 0 #222, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #111' }}>
            <h3 style={{ fontFamily: '"Blocks", sans-serif', margin: '0 0 5px 0', fontSize: '16px' }}>Плащ</h3>
            <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px', marginTop: 0 }}>Формат PNG, размер 64x32</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ flex: 1 }}
                onClick={() => triggerFileInput('cape-upload')}
                disabled={loading}
              >
                {t('wardrobe.uploadCape') as string}
              </button>
              <button 
                className="mc-btn-primary hover-scale-btn" 
                style={{ flex: 1 }}
                onClick={() => handleDelete('cape')}
                disabled={loading}
              >
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
