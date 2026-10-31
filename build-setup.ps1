$env:PATH = "$env:LOCALAPPDATA\Programs\nodejs;$env:APPDATA\npm;$env:USERPROFILE\.cargo\bin;$env:LOCALAPPDATA\Programs\w64devkit\bin;$env:PATH"

Stop-Process -Name Pagrysha_Setup, Pagrysha_Launcher_Setup -Force -ErrorAction SilentlyContinue

Write-Host "1. Building Tauri application..." -ForegroundColor Cyan
npx tauri build --no-bundle

Write-Host "2. Copying binaries..." -ForegroundColor Cyan
Copy-Item "src-tauri\target\release\pagrysha-launcher.exe" "Pagrysha_Launcher_Setup.exe" -Force
Copy-Item "src-tauri\target\release\WebView2Loader.dll" "WebView2Loader.dll" -Force

Write-Host "3. Compiling standalone single-file installer..." -ForegroundColor Cyan
windres.exe -i installer.rc -o installer_res.o
gcc.exe -O2 -mwindows installer_main.c installer_res.o -o "Pagrysha_Setup.exe"
Remove-Item -Force installer_res.o

Write-Host "DONE! Created Pagrysha_Setup.exe" -ForegroundColor Green
Get-Item "Pagrysha_Setup.exe" | Select-Object Name, @{Name="SizeMB";Expression={[math]::Round($_.Length / 1MB, 2)}}
