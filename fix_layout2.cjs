const fs = require('fs');
let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
lines[529] = '        <div className="titlebar-right">\n          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>';
fs.writeFileSync('src/App.tsx', lines.join('\n'), 'utf8');
