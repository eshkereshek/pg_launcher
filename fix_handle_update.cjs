const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
  /const handleUpdate = \(\) => \{\n\s*if \(updateInfo\.downloadUrl\) \{\n\s*setUpdateProgress\(0\)\n\s*\/\/ @ts-ignore\n\s*window\.electronAPI\.downloadAndRunUpdate\(updateInfo\.downloadUrl\)\n\s*\}\n\s*\}/g,
  `const handleUpdate = () => {
    if (isUpdating) return;
    if (updateInfo.downloadUrl) {
      setIsUpdating(true);
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }`
);
fs.writeFileSync('src/App.tsx', code, 'utf8');
console.log('Fixed handleUpdate');
