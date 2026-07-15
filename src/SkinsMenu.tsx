import { useState, useEffect, useRef } from 'react'
import { SkinViewer, IdleAnimation } from 'skinview3d'
import { Plus, Trash, ExternalLink, Eye, PenTool } from 'lucide-react'
import { useTranslation } from './i18n'

interface Skin {
  id: string
  name: string
  path: string
  isElyby?: boolean
}

interface SkinsMenuProps {
  currentAccount: any
}

export default function SkinsMenu({ currentAccount }: SkinsMenuProps) {
  const { t } = useTranslation()
  const [skins, setSkins] = useState<Skin[]>([])
  const [selectedSkin, setSelectedSkin] = useState<Skin | null>(null)
  const [equipStatus, setEquipStatus] = useState<string>('')
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const canvasAddedRef = useRef(false)

  useEffect(() => {
    loadSkins()
  }, [])

  const loadSkins = async () => {
    try {
      // @ts-ignore
      const loadedSkins = await window.electronAPI.getSkins()
      
      let allSkins = loadedSkins
      
      // Add current Ely.by skin as the first tile
      if (currentAccount && currentAccount.type === 'elyby' && currentAccount.name) {
        const elybySkin: Skin = {
          id: 'elyby_current',
          name: currentAccount.name + ' (Ely.by)',
          path: `http://skinsystem.ely.by/skins/${currentAccount.name}.png`,
          isElyby: true
        }
        allSkins = [elybySkin, ...loadedSkins]
      }
      
      setSkins(allSkins)
      if (allSkins.length > 0 && !selectedSkin) {
        setSelectedSkin(allSkins[0])
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Initialize 3D viewer once
  useEffect(() => {
    if (!viewerContainerRef.current || viewerRef.current) return

    const viewer = new SkinViewer({
      canvas: document.createElement('canvas'),
      width: 260,
      height: 320,
    })
    viewer.animation = new IdleAnimation()
    // Align camera properly
    viewer.camera.position.x = 0;
    viewer.camera.position.y = -10;
    viewer.canvas.style.display = 'block';
    viewer.canvas.style.margin = '0 auto';
    viewerRef.current = viewer

    if (!canvasAddedRef.current) {
      viewerContainerRef.current.appendChild(viewer.canvas)
      canvasAddedRef.current = true
    }

    // Load current account skin as default
    if (currentAccount && currentAccount.type === 'elyby' && currentAccount.name) {
      viewer.loadSkin(`http://skinsystem.ely.by/skins/${currentAccount.name}.png`).catch(() => {
        viewer.loadSkin('https://minotar.net/skin/Steve.png')
      })
    } else {
      viewer.loadSkin('https://minotar.net/skin/Steve.png')
    }

    return () => {
      viewer.dispose()
      viewerRef.current = null
      canvasAddedRef.current = false
    }
  }, [])

  // Update skin when selection changes
  useEffect(() => {
    if (!viewerRef.current) return

    if (selectedSkin) {
      if (selectedSkin.isElyby) {
        viewerRef.current.loadSkin(selectedSkin.path).catch(() => {
          viewerRef.current?.loadSkin('https://minotar.net/skin/Steve.png')
        })
      } else {
        // @ts-ignore
        window.electronAPI.readLocalImage(selectedSkin.path).then((dataUrl: string | null) => {
          if (dataUrl && viewerRef.current) {
            viewerRef.current.loadSkin(dataUrl)
          }
        })
      }
    } else if (currentAccount && currentAccount.type === 'elyby' && currentAccount.name) {
      viewerRef.current.loadSkin(`http://skinsystem.ely.by/skins/${currentAccount.name}.png`).catch(() => {
        viewerRef.current?.loadSkin('https://minotar.net/skin/Steve.png')
      })
    }
  }, [selectedSkin])

  const handleAddSkin = async () => {
    // @ts-ignore
    const filePath = await window.electronAPI.selectSkinFile()
    if (filePath) {
      // @ts-ignore
      const res = await window.electronAPI.saveSkin(filePath)
      if (res.status === 'success') {
        await loadSkins()
        // @ts-ignore
        const newSkins = await window.electronAPI.getSkins() as Skin[]
        const newSkin = newSkins.find((s: Skin) => s.id === res.id)
        if (newSkin) setSelectedSkin(newSkin)
      } else {
        setEquipStatus('❌ ' + (res.error || 'Error'))
        setTimeout(() => setEquipStatus(''), 4000)
      }
    }
  }

  const handleDeleteSkin = async (e: React.MouseEvent, skinId: string) => {
    e.stopPropagation()
    // @ts-ignore
    const res = await window.electronAPI.deleteSkin(skinId)
    if (res.status === 'success') {
      if (selectedSkin?.id === skinId) setSelectedSkin(null)
      loadSkins()
    }
  }

  const handleDrawSkin = () => {
    // @ts-ignore
    window.electronAPI.openExternal('https://www.minecraftskins.com/skin-editor/')
  }

  const handleEquip = async () => {
    // Open Ely.by skin change page in browser
    // @ts-ignore
    await window.electronAPI.openExternal('https://ely.by/skins')
    setEquipStatus(t('skins.elybyRedirect'))
    setTimeout(() => setEquipStatus(''), 6000)
  }

  return (
    <div className="jl-content" style={{ display: 'flex', gap: '24px', padding: '24px', height: '100%', boxSizing: 'border-box' }}>
      
      {/* 3D Viewer Side */}
      <div style={{ 
        width: '300px', 
        minWidth: '300px',
        background: 'rgba(26,26,26,0.95)', 
        border: '3px solid #111', 
        boxShadow: 'inset 0 3px 0 0 #444, inset 3px 0 0 0 #333, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #222',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
        position: 'relative'
      }}>
        <h2 style={{ color: 'white', margin: '0 0 12px 0', fontFamily: '"Blocks", sans-serif', fontSize: '16px', zIndex: 2 }}>
          {t('skins.viewer')}
        </h2>
        
        {/* Current account info */}
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '8px', 
          background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '4px', 
          width: '100%', boxSizing: 'border-box', marginBottom: '8px'
        }}>
          <img 
            src={`http://skinsystem.ely.by/skins/${currentAccount?.name || 'Steve'}.png`} 
            style={{ width: 20, height: 20, imageRendering: 'pixelated' }} 
            onError={(e) => (e.currentTarget.src = 'https://minotar.net/skin/Steve.png')}
          />
          <span style={{ color: '#ccc', fontSize: '13px', fontFamily: '"Inter", sans-serif' }}>
            {currentAccount?.name || 'Player'}
          </span>
          <span style={{ color: '#666', fontSize: '11px', marginLeft: 'auto' }}>Ely.by</span>
        </div>

        <div ref={viewerContainerRef} style={{ 
          flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', 
          width: '100%', overflow: 'hidden', minHeight: 0
        }}></div>

        {/* Equip button — opens ely.by */}
        <button 
          onClick={handleEquip}
          className="mod-btn install" 
          style={{ 
            width: '100%', marginTop: '12px', padding: '12px', 
            display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <ExternalLink size={18} /> {t('skins.equipElyby')}
        </button>

        {/* Status message */}
        {equipStatus && (
          <div style={{ 
            marginTop: '8px', padding: '6px 10px', background: 'rgba(249,202,36,0.1)', 
            border: '1px solid rgba(249,202,36,0.3)', borderRadius: '4px',
            color: '#f9ca24', fontSize: '12px', textAlign: 'center', width: '100%', boxSizing: 'border-box'
          }}>
            {equipStatus}
          </div>
        )}
      </div>

      {/* Library Side */}
      <div style={{ 
        flex: 1,
        background: 'rgba(26,26,26,0.95)', 
        border: '3px solid #111', 
        boxShadow: 'inset 0 3px 0 0 #444, inset 3px 0 0 0 #333, inset 0 -6px 0 0 #000, inset -3px 0 0 0 #222',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'white', margin: 0, fontFamily: '"Blocks", sans-serif', fontSize: '16px' }}>{t('skins.library')}</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="mod-btn install" onClick={handleDrawSkin} style={{ padding: '6px 12px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', background: '#3498db', borderColor: '#2980b9' }}>
              <PenTool size={14} /> {t('skins.draw')}
            </button>
            <button className="mod-btn settings" onClick={handleAddSkin} style={{ padding: '6px 12px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' }}>
              <Plus size={14} /> {t('skins.add')}
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          background: 'rgba(249,202,36,0.08)', border: '1px solid rgba(249,202,36,0.2)', borderRadius: '4px',
          padding: '8px 12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Eye size={14} color="#f9ca24" />
          <span style={{ color: '#aaa', fontSize: '12px', fontFamily: '"Inter", sans-serif' }}>
            {t('skins.previewHint')}
          </span>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
          gap: '16px',
          overflowY: 'auto',
          flex: 1,
          alignContent: 'flex-start',
          paddingRight: '6px'
        }}>
          {skins.length === 0 ? (
             <div style={{ color: '#888', gridColumn: '1 / -1', textAlign: 'center', marginTop: '50px', fontFamily: '"Inter", sans-serif' }}>
               {t('skins.empty')}
             </div>
          ) : (
             skins.map(skin => (
               <div 
                 key={skin.id}
                 onClick={() => setSelectedSkin(skin)}
                 className="mod-card"
                 style={{
                   borderColor: selectedSkin?.id === skin.id ? 'var(--pg-yellow)' : 'transparent',
                   boxShadow: selectedSkin?.id === skin.id ? '0 0 10px rgba(249, 202, 36, 0.3)' : 'none',
                   display: 'flex',
                   flexDirection: 'column',
                   alignItems: 'center',
                   cursor: 'pointer',
                   position: 'relative',
                   padding: '12px',
                   transition: 'border-color 0.2s, box-shadow 0.2s'
                 }}
               >
                 <SkinPreview path={skin.path} />
                 <span style={{ 
                   color: selectedSkin?.id === skin.id ? 'white' : '#bbb', 
                   fontSize: '12px', 
                   marginTop: '10px', 
                   overflow: 'hidden', 
                   textOverflow: 'ellipsis', 
                   whiteSpace: 'nowrap', 
                   maxWidth: '100%',
                   fontWeight: selectedSkin?.id === skin.id ? 'bold' : 'normal',
                   fontFamily: '"Inter", sans-serif',
                   transition: 'color 0.2s'
                 }}>
                   {skin.name}
                 </span>
                 
                 {!skin.isElyby && (
                   <button 
                     onClick={(e) => handleDeleteSkin(e, skin.id)}
                     className="skin-delete-btn"
                     style={{
                       position: 'absolute',
                       top: '6px',
                       right: '6px',
                       background: 'rgba(231, 76, 60, 0.85)',
                       border: 'none',
                       color: 'white',
                       width: '24px',
                       height: '24px',
                       borderRadius: '4px',
                       display: 'flex',
                       justifyContent: 'center',
                       alignItems: 'center',
                       cursor: 'pointer',
                       opacity: 0,
                       transition: 'opacity 0.15s',
                     }}
                   >
                     <Trash size={12} />
                   </button>
                 )}
               </div>
             ))
          )}
        </div>
      </div>

      <style>{`
        .mod-card:hover .skin-delete-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}

function SkinPreview({ path }: { path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (path.startsWith('http')) {
      setDataUrl(path)
    } else {
      // @ts-ignore
      window.electronAPI.readLocalImage(path).then(setDataUrl)
    }
  }, [path])

  return (
    <div style={{ width: '64px', height: '64px', imageRendering: 'pixelated', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
       {dataUrl && <img src={dataUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
    </div>
  )
}
