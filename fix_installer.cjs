const fs = require('fs');
let code = fs.readFileSync('src/InstallerApp.tsx', 'utf8');

code = code.replace(
  `        if (installed) {
          setInstallMode('update')
        }`,
  `        if (installed) {
          setInstallMode('update')
          setTimeout(() => {
            const btn = document.getElementById('auto-install-btn');
            if (btn) btn.click();
          }, 100);
        }`
);

code = code.replace(
  `              {step === 2 && (
                <button 
                  onClick={handleInstall}`,
  `              {step === 2 && (
                <button 
                  id="auto-install-btn"
                  onClick={handleInstall}`
);

// We need to make sure step 0 and step 1 are skipped if auto-updating
// Actually, if we just set step to 2 when installed, it will render the button and auto-click it!
code = code.replace(
  `        if (installed) {
          setInstallMode('update')
          setTimeout(() => {`,
  `        if (installed) {
          setInstallMode('update')
          setStep(2);
          setTimeout(() => {`
);

fs.writeFileSync('src/InstallerApp.tsx', code, 'utf8');
console.log('Fixed InstallerApp.tsx');
