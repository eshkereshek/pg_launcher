const fs = require('fs');
const path = require('path');

let code = fs.readFileSync('electron/main.ts', 'utf8');

const newUpdater = `ipcMain.handle('download-and-run-update', async (event, url: string) => {
    try {
      const tempExePath = path.join(app.getPath('temp'), \`Pagrysha_Update_\${Date.now()}.exe\`);
      
      const res = await fetch(url);
      if (!res.ok) throw new Error(\`Failed to download: \${res.statusText}\`);
      
      const totalSize = parseInt(res.headers.get('content-length') || '0', 10);
      let downloadedSize = 0;
      
      event.sender.send('download-update', { id: 'app_update', name: 'Обновление', text: 'Загрузка...', progress: 0 });
      
      if (res.body) {
        const fileStream = fs.createWriteStream(tempExePath);
        // @ts-ignore
        for await (const chunk of res.body) {
          fileStream.write(chunk);
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const progress = Math.round((downloadedSize / totalSize) * 100);
            event.sender.send('download-update', { id: 'app_update', name: 'Обновление', text: \`Загружено \${progress}%\`, progress });
          }
        }
        fileStream.end();
        await new Promise<void>((resolve) => fileStream.on('close', () => resolve()));
        
        event.sender.send('download-finish', 'app_update');
  
        const env = { ...process.env };
        delete env.PORTABLE_EXECUTABLE_DIR;
  
        // Run the downloaded exe
        spawn(tempExePath, [], { detached: true, stdio: 'ignore', env }).unref();
        setTimeout(() => app.quit(), 500);
        return true;
      } else {
        throw new Error("No body in response");
      }
    } catch (e: any) {
      console.error('Download update failed:', e);
      event.sender.send('download-finish', 'app_update');
      throw new Error('Ошибка скачивания: ' + e.message);
    }
  });`;

code = code.replace(/ipcMain\.handle\('download-and-run-update'[\s\S]*?\}\);/g, newUpdater);
// There might be a duplicate from the previously failed attempt
code = code.replace(/event\.sender\.send\('download-update', \{ id: 'app_update', name: 'Обновление', text: 'Загрузка\.\.\.', progress: 0 \}\);\n\s+if \(res\.body\) \{[\s\S]*?event\.sender\.send\('download-finish', 'app_update'\);\n\s+const env = \{ \.\.\.process\.env \};\n\s+delete env\.PORTABLE_EXECUTABLE_DIR;\n\s+\/\/ Run the downloaded exe\n\s+spawn\(tempExePath, \[\], \{ detached: true, stdio: 'ignore', env \}\)\.unref\(\);\n\s+setTimeout\(\(\) => app\.quit\(\), 500\);\n\s+return true;\n\s+\} else \{/g, 'if (res.body) {');

fs.writeFileSync('electron/main.ts', code, 'utf8');
console.log('Fixed main.ts');
