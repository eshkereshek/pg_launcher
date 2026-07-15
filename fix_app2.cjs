const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  `  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)`,
  `  const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [isUpdating, setIsUpdating] = useState(false)`
);

code = code.replace(
  `  const handleUpdate = () => {
    if (updateInfo.downloadUrl) {
      setUpdateProgress(0)
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }`,
  `  const handleUpdate = () => {
    if (isUpdating) return;
    if (updateInfo.downloadUrl) {
      setIsUpdating(true);
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }`
);

const oldTopRight = `        <div className="titlebar-right">
          <div 
            className="titlebar-downloads" 
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}
          >
            {updateInfo.hasUpdate && (
              <div 
                className="update-banner"
                onClick={(e) => { e.stopPropagation(); handleUpdate(); }}
                style={{
                  background: 'var(--pg-primary)',
                  color: 'white',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  animation: 'pulse 2s infinite',
                  boxShadow: '0 0 10px rgba(255, 122, 0, 0.5)'
                }}
              >
                {updateProgress !== null ? \`Обновление: \${updateProgress}%\` : \`Доступно обновление: v\${updateInfo.version}\`}
              </div>
            )}
            
            <div onClick={() => setShowDownloadsDropdown(!showDownloadsDropdown)}>
              <span style={{ fontSize: 10, color: activeDownloads.length > 0 ? 'var(--pg-yellow)' : 'inherit' }}>■</span> {t("app.downloads")} {activeDownloads.length > 0 && \`(\${activeDownloads.length})\`}
            </div>`;

const newTopRight = `        <div className="titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {updateInfo.hasUpdate && (
            <div 
              className="update-banner"
              onClick={(e) => { e.stopPropagation(); handleUpdate(); }}
              style={{
                background: 'var(--pg-primary)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                animation: 'pulse 2s infinite',
                boxShadow: '0 0 10px rgba(255, 122, 0, 0.5)',
                cursor: isUpdating ? 'default' : 'pointer',
                opacity: isUpdating ? 0.7 : 1
              }}
            >
              {isUpdating ? 'Загрузка...' : \`Доступно обновление: v\${updateInfo.version}\`}
            </div>
          )}
          
          <div 
            className="titlebar-downloads" 
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={() => setShowDownloadsDropdown(!showDownloadsDropdown)}
          >
            <div>
              <span style={{ fontSize: 10, color: activeDownloads.length > 0 ? 'var(--pg-yellow)' : 'inherit' }}>■</span> {t("app.downloads")} {activeDownloads.length > 0 && \`(\${activeDownloads.length})\`}
            </div>`;

// Use replace but avoid regex syntax to ensure literal string replacement works.
code = code.split(oldTopRight).join(newTopRight);

fs.writeFileSync('src/App.tsx', code, 'utf8');
