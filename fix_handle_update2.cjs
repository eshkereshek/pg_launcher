const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const find1 = `const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)`;

const replace1 = `const [updateInfo, setUpdateInfo] = useState<{hasUpdate: boolean, version?: string, downloadUrl?: string}>({hasUpdate: false})
  const [isUpdating, setIsUpdating] = useState(false)`;

const find2 = `  const handleUpdate = () => {
    if (updateInfo.downloadUrl) {
      setUpdateProgress(0)
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }`;

const replace2 = `  const handleUpdate = () => {
    if (isUpdating) return;
    if (updateInfo.downloadUrl) {
      setIsUpdating(true)
      // @ts-ignore
      window.electronAPI.downloadAndRunUpdate(updateInfo.downloadUrl)
    }
  }`;

code = code.split(find1).join(replace1);
code = code.split(find2).join(replace2);

fs.writeFileSync('src/App.tsx', code, 'utf8');
console.log('Fixed completely');
