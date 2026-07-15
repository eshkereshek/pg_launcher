import { useState, useEffect, useRef } from 'react'
import { useTranslation } from './i18n'
import { Copy, Users, Tag, Network } from 'lucide-react'

import { McSelect } from './McSelect'

export function ServersMenu({ opacity = 95, blur = true }: { opacity?: number, blur?: boolean }) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [region, setRegion] = useState('russia');
  const [copied, setCopied] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(() => localStorage.getItem('mc_sec_bg_data'));
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem('mc_sec_bg_data')) {
      // @ts-ignore
      window.electronAPI.readLocalImage('C:\\Users\\Kiirr12il\\Pictures\\servbcg.jpg')
        .then((dataUrl: string) => { if (dataUrl) setBgImage(dataUrl) })
        .catch(console.error)
    }
  }, [])

  useEffect(() => {
    fetchServers(page, region);
  }, [page, region]);

  const fetchServers = async (p: number, r: string) => {
    if (loading) return;
    setLoading(true);
    try {
      // @ts-ignore
      const result = await window.electronAPI.searchServers(p, r);
      if (p === 1) {
        setServers(result);
      } else {
        setServers(prev => [...prev, ...result]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 100 && !loading) {
      setPage(p => p + 1);
    }
  };

  const copyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopied(ip);
    setTimeout(() => setCopied(null), 2000);
  };

  const bgStyle: React.CSSProperties = {
    flex: 1, 
    display: 'flex', 
    flexDirection: 'column', 
    backgroundColor: 'var(--pg-black)', 
    backgroundImage: bgImage ? `url("${bgImage}")` : 'none', 
    backgroundSize: 'cover', 
    backgroundPosition: 'center', 
    backgroundRepeat: 'no-repeat', 
    overflow: 'hidden'
  };

  return (
    <div className="mods-menu" style={bgStyle}>
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }} onScroll={handleScroll} ref={scrollRef}>
        <div className="mc-menu-header" style={{ marginBottom: '1rem', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={28} />
            {t('app.servers') || 'Servers'}
          </h2>
          <McSelect 
            value={region} 
            onChange={(val) => {
              setRegion(val);
              setPage(1);
              setServers([]);
            }}
            options={[
              { value: 'russia', label: 'Русские сервера' },
              { value: 'global', label: 'Мировой топ' }
            ]}
            style={{ width: '200px' }}
          />
        </div>

        <div className="mc-menu-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {servers.length === 0 && !loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
              No servers found.
            </div>
          ) : (
            <div className="mc-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {servers.map((s, idx) => (
                <div key={idx} className="mc-card" style={{ display: 'flex', flexDirection: 'column', background: `rgba(20, 20, 20, ${opacity / 100})`, backdropFilter: blur ? 'blur(10px)' : 'none', WebkitBackdropFilter: blur ? 'blur(10px)' : 'none' }}>
                  {s.banner && s.banner.endsWith('.mp4') ? (
                    <video 
                      src={s.banner} 
                      autoPlay 
                      loop 
                      muted 
                      playsInline 
                      style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px' }} 
                    />
                  ) : s.banner ? (
                    <div style={{ width: '100%', height: '80px', backgroundImage: `url(${s.banner})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '4px' }}></div>
                  ) : (
                    <div style={{ width: '100%', height: '80px', backgroundColor: '#333', borderRadius: '4px' }}></div>
                  )}
                  
                  <div className="mc-card-header" style={{ marginTop: '0.5rem' }}>
                    <h3 className="mc-card-title">{s.name}</h3>
                  </div>

                  <div className="mc-card-stats" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#aaa', marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} />
                      <span>{s.players}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag size={14} />
                      <span>{s.version}</span>
                    </div>
                  </div>

                  <div className="mc-card-footer" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                    <button 
                      className="mc-button" 
                      onClick={() => copyIp(s.ip)}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: copied === s.ip ? '#2E7D32' : '' }}
                    >
                      <Copy size={16} />
                      {copied === s.ip ? 'Copied!' : s.ip}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
              <div className="mc-spinner" style={{ margin: '0 auto 1rem' }}></div>
              Loading servers...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
