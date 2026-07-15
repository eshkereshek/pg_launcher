const fs = require('fs');
let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

const newCode = `        <div className="titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
            <div>`.split('\n');

lines.splice(532, 25, ...newCode);

fs.writeFileSync('src/App.tsx', lines.join('\n'), 'utf8');
console.log('App.tsx spliced correctly');
