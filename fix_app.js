const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf8');

// The messed up area starts at `<div className="titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>`
// And ends at `{showDownloadsDropdown && (`
const startStr = `<div className="titlebar-right">`;
const newBlock = `        <div className="titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
          >
            <div onClick={() => setShowDownloadsDropdown(!showDownloadsDropdown)}>
              <span style={{ fontSize: 10, color: activeDownloads.length > 0 ? 'var(--pg-yellow)' : 'inherit' }}>■</span> {t("app.downloads")} {activeDownloads.length > 0 && \`(\${activeDownloads.length})\`}
            </div>
            
            {showDownloadsDropdown && (`;

// Since it's messed up, let's just do a string replacement of the whole top bar right side.
// First, find the exact content in App.tsx right now.
fs.writeFileSync('fix_app.js', 'console.log("Use regex to fix")');
