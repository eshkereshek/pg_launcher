use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::release;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn check_updates() -> Result<Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/eshkereshek/pg_launcher/releases/latest")
        .header(
            "User-Agent",
            concat!("PagryshaLauncher/", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(serde_json::json!({ "hasUpdate": false }));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag_name = data["tag_name"].as_str().unwrap_or("").replace('v', "");
    // Версию берём из Cargo.toml: хардкод отставал от реальных сборок.
    let current_version = env!("CARGO_PKG_VERSION");

    if is_newer_version(&tag_name, current_version) {
        if let Some(assets) = data["assets"].as_array() {
            // Обновление запускается как exe, поэтому ассет без sha256
            // (поле `digest`) не предлагаем: скачать его всё равно не дадим,
            // а тупик в интерфейсе выглядит как поломка лаунчера. Формат .msi
            // тоже не подходит — его нельзя просто запустить.
            let exe_assets: Vec<&Value> = assets
                .iter()
                .filter(|a| {
                    let is_exe = a["name"]
                        .as_str()
                        .map(|n| n.to_lowercase().ends_with(".exe"))
                        .unwrap_or(false);
                    is_exe && release::asset_sha256(a).is_some()
                })
                .collect();

            // Сначала ищем установщик: он ставит обновление сам.
            let asset = exe_assets
                .iter()
                .find(|a| {
                    a["name"]
                        .as_str()
                        .map(|n| {
                            let n = n.to_lowercase();
                            n.contains("setup") || n.contains("installer")
                        })
                        .unwrap_or(false)
                })
                .copied()
                .or_else(|| exe_assets.first().copied());

            if let Some(asset) = asset {
                if let Some(url) = asset["browser_download_url"].as_str() {
                    return Ok(serde_json::json!({
                        "hasUpdate": true,
                        "version": tag_name,
                        "downloadUrl": url,
                        "body": data["body"].as_str().unwrap_or("")
                    }));
                }
            }

            // Обновление есть, но запустить его нечем: пусть интерфейс скажет
            // об этом прямо, а не будет ждать вечно.
            return Ok(serde_json::json!({
                "hasUpdate": false,
                "unsupportedAsset": true
            }));
        }
    }

    Ok(serde_json::json!({ "hasUpdate": false }))
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let latest_parts: Vec<u32> = latest.split('.').filter_map(|p| p.parse().ok()).collect();
    let current_parts: Vec<u32> = current.split('.').filter_map(|p| p.parse().ok()).collect();

    for i in 0..std::cmp::max(latest_parts.len(), current_parts.len()) {
        let l = latest_parts.get(i).copied().unwrap_or(0);
        let c = current_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn download_and_run_update(app: AppHandle, url: String) -> Result<bool, String> {
    // Ссылку присылает интерфейс, а он показывает чужой текст: обновление
    // запускается как exe, поэтому адрес проверяем здесь, а не в UI.
    guard::update_url(&url)?;

    // `spawn` запускает файл как программу, поэтому обновление обязано быть
    // .exe: архив или msi так не откроется, и игрок останется без обновления.
    let ext = url
        .split('?')
        .next()
        .map(std::path::Path::new)
        .and_then(|p| p.extension())
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "exe" {
        return Err("Обновление можно запустить только из .exe-файла".into());
    }

    // Хеш берём из ответа GitHub, а не из интерфейса: подменённый в UI хеш
    // ничего не проверяет. Сверяем именно тот ассет, на который указывает
    // ссылка, и без хеша файл не запускаем.
    let client = reqwest::Client::new();
    let release_json: Value = client
        .get("https://api.github.com/repos/eshkereshek/pg_launcher/releases/latest")
        .header(
            "User-Agent",
            concat!("PagryshaLauncher/", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|e| format!("Не удалось проверить обновление: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Не удалось прочитать ответ GitHub: {}", e))?;

    let asset = release::asset_by_url(&release_json, &url)
        .ok_or("Файл обновления не найден в последнем релизе")?;
    let sha256 = release::asset_sha256(asset)
        .ok_or("У файла обновления нет контрольной суммы sha256 — запускать небезопасно")?;
    let sum = Sum::sha256(&sha256).ok_or("Некорректная контрольная сумма обновления")?;

    let temp_exe = std::env::temp_dir().join(format!(
        "Pagrysha_Update_{}.exe",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));

    let app_handle = app.clone();
    ensure_file_with_progress(&client, &url, &temp_exe, Some(sum), move |cur, total| {
        let pct = if total > 0 { (cur * 100) / total } else { 0 };
        let _ = app_handle.emit(
            "download-update",
            serde_json::json!({
                "id": "app_update",
                "name": "Обновление лаунчера",
                "text": format!("Загружено {}%", pct),
                "progress": pct
            }),
        );
    })
    .await?;

    let _ = app.emit("download-finish", "app_update");

    // Spawn updater
    #[cfg(target_os = "windows")]
    {
        // Если установщик не запустился, процесс лаунчера не завершаем:
        // игрок должен увидеть ошибку, а не молча остаться без лаунчера.
        std::process::Command::new(&temp_exe)
            .spawn()
            .map_err(|e| format!("Не удалось запустить обновление: {}", e))?;
        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(&temp_exe).map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn is_installer(window: tauri::Window) -> bool {
    let args: Vec<String> = std::env::args().collect();
    let exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_default();

    // Признаки установщика живут в guard: там же, где проверки удаления, и
    // без догадок про «путь установки по умолчанию».
    let is_inst = guard::is_installer_run(&args, &exe_name);

    if is_inst {
        let size = tauri::Size::Logical(tauri::LogicalSize {
            width: 800.0,
            height: 500.0,
        });
        let _ = window.set_min_size(Some(size));
        let _ = window.set_max_size(Some(size));
        let _ = window.set_size(size);
        let _ = window.center();
    }

    is_inst
}

/// Перезапуск лаунчера — нужен после переноса данных на другой диск.
#[tauri::command]
pub fn restart_launcher(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn select_folder(default_path: Option<String>) -> Option<String> {
    let mut dialog =
        rfd::FileDialog::new().set_title("Выберите папку для установки Pagrysha Launcher");
    if let Some(p) = default_path {
        dialog = dialog.set_directory(&p);
    }
    dialog
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_default_install_path() -> String {
    let local = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    local
        .join("Programs")
        .join("Pagrysha Launcher")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn check_is_installed(target_path: String) -> bool {
    if target_path.trim().is_empty() {
        return false;
    }
    let p = std::path::Path::new(target_path.trim());
    if !p.join("Pagrysha Launcher.exe").exists() {
        return false;
    }
    if guard::has_install_marker(p) {
        return true;
    }
    // Установки прошлых версий маркера не имеют: их узнаём по имени папки,
    // иначе игрок после обновления увидит предложение установить лаунчер снова.
    p.file_name()
        .map(|n| n.to_string_lossy().to_lowercase().contains("pagrysha"))
        .unwrap_or(false)
}

#[tauri::command]
pub fn install_app(target_path: String) -> Result<Value, String> {
    // Путь выбирает игрок, но приходит он из веб-вью: проверяем, что это
    // обычная папка установки, а не системный каталог.
    let dest_dir = guard::install_target(&target_path)?;
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Не удалось создать папку установки: {}", e))?;

    let current_exe =
        std::env::current_exe().map_err(|e| format!("Не удалось определить текущий exe: {}", e))?;
    let target_exe = dest_dir.join("Pagrysha Launcher.exe");

    std::fs::copy(&current_exe, &target_exe)
        .map_err(|e| format!("Не удалось скопировать файл: {}", e))?;

    if let Some(parent) = current_exe.parent() {
        let loader_dll = parent.join("WebView2Loader.dll");
        if loader_dll.exists() {
            let target_dll = dest_dir.join("WebView2Loader.dll");
            let _ = std::fs::copy(&loader_dll, &target_dll);
        }
    }

    // Маркер установки: по нему лаунчер узнаёт свою папку, даже если игрок
    // назвал её как угодно, и разрешает её удалить при удалении.
    let installed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let marker = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "installedAt": installed_at
    });
    std::fs::write(dest_dir.join(guard::INSTALL_MARKER), marker.to_string())
        .map_err(|e| format!("Не удалось записать маркер установки: {}", e))?;

    // ── Где хранить данные (версии, миры, логи) ────────────────────────
    // Свежая установка в нестандартную папку получает <папка установки>\data,
    // и лаунчер читает этот путь из data-dir.txt рядом с exe. Если у игрока
    // уже есть библиотека в AppData — ничего не переносим: иначе версии
    // пришлось бы качать заново.
    let default_dir = default_data_dir();
    let appdata_has_data = default_dir.join("minecraft_data").is_dir();
    let is_default_target =
        dest_dir.to_string_lossy().to_lowercase() == get_default_install_path().to_lowercase();

    let data_dir = if let Some((_, existing_data)) = read_install_state() {
        // Обновление: путь данных не меняем ни при каких условиях.
        std::path::PathBuf::from(existing_data)
    } else if !is_default_target && !appdata_has_data {
        dest_dir.join("data")
    } else {
        default_dir.clone()
    };

    if data_dir != default_dir {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Не удалось создать папку данных: {}", e))?;
        std::fs::write(
            dest_dir.join("data-dir.txt"),
            data_dir.to_string_lossy().to_string(),
        )
        .map_err(|e| format!("Не удалось записать путь данных: {}", e))?;
    } else {
        // Данные в AppData — маркер не нужен и только путал бы.
        let _ = std::fs::remove_file(dest_dir.join("data-dir.txt"));
    }

    // Где установлено: по этому файлу новый установщик узнаёт, что идёт
    // обновление, и не показывает мастер установки повторно.
    let state = serde_json::json!({
        "installDir": dest_dir.to_string_lossy(),
        "dataDir": data_dir.to_string_lossy(),
        "version": env!("CARGO_PKG_VERSION"),
    });
    let _ = std::fs::create_dir_all(&default_dir);
    std::fs::write(install_state_path(), state.to_string())
        .map_err(|e| format!("Не удалось записать состояние установки: {}", e))?;

    Ok(serde_json::json!({
        "status": "ok",
        "installDir": dest_dir.to_string_lossy(),
        "dataDir": data_dir.to_string_lossy(),
    }))
}

/// Каталог данных по умолчанию (AppData), без учёта data-dir.txt.
fn default_data_dir() -> std::path::PathBuf {
    dirs::data_dir()
        .or_else(dirs::config_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pagrysha-launcher")
}

fn install_state_path() -> std::path::PathBuf {
    default_data_dir().join("install.json")
}

/// (папка установки, папка данных) прошлой установки, если она ещё на месте.
fn read_install_state() -> Option<(String, String)> {
    let text = std::fs::read_to_string(install_state_path()).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let install_dir = value["installDir"].as_str()?.to_string();
    let data_dir = value["dataDir"]
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| default_data_dir().to_string_lossy().to_string());
    if !std::path::Path::new(&install_dir)
        .join("Pagrysha Launcher.exe")
        .is_file()
    {
        return None;
    }
    Some((install_dir, data_dir))
}

/// Существующая установка — установщик запускает тихое обновление и сразу
/// открывает лаунчер, вместо мастера установки.
#[tauri::command]
pub fn get_existing_install() -> Option<serde_json::Value> {
    read_install_state().map(|(install_dir, data_dir)| {
        serde_json::json!({ "installDir": install_dir, "dataDir": data_dir })
    })
}

#[tauri::command]
pub fn create_shortcuts(
    target_path: String,
    desktop: Option<bool>,
    start_menu: Option<bool>,
) -> Result<Value, String> {
    let target_exe = std::path::Path::new(&target_path).join("Pagrysha Launcher.exe");
    if !target_exe.exists() {
        return Err("Исполняемый файл не найден".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let do_desktop = desktop.unwrap_or(true);
        let do_start_menu = start_menu.unwrap_or(true);

        // PowerShell берёт строки в одинарные кавычки: путь с апострофом
        // (например, «C:\Users\O'Brien») ломал бы скрипт, поэтому удваиваем их.
        let ps_path = |p: &std::path::Path| p.display().to_string().replace('\'', "''");

        let mut script_parts = Vec::new();
        script_parts.push("$ws = New-Object -COM WScript.Shell;".to_string());

        if do_desktop {
            let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
            let desktop_shortcut = desktop_dir.join("Pagrysha Launcher.lnk");
            script_parts.push(format!(
                "$s = $ws.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.IconLocation = '{},0'; $s.Description = 'Minecraft Launcher'; $s.Save();",
                ps_path(&desktop_shortcut),
                ps_path(&target_exe),
                ps_path(&target_exe)
            ));
        }

        if do_start_menu {
            let appdata = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
            let start_menu_dir = appdata
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            let _ = std::fs::create_dir_all(&start_menu_dir);
            let start_shortcut = start_menu_dir.join("Pagrysha Launcher.lnk");
            script_parts.push(format!(
                "$s = $ws.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.IconLocation = '{},0'; $s.Description = 'Minecraft Launcher'; $s.Save();",
                ps_path(&start_shortcut),
                ps_path(&target_exe),
                ps_path(&target_exe)
            ));
        }

        if script_parts.len() > 1 {
            let script = script_parts.join(" ");
            let output = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    &script,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("Не удалось запустить PowerShell для ярлыков: {}", e))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Не удалось создать ярлыки: {}", stderr.trim()));
            }
        }
    }

    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn launch_installed(target_path: String) -> Result<Value, String> {
    let target_exe = std::path::Path::new(&target_path).join("Pagrysha Launcher.exe");
    if target_exe.exists() {
        let _ = std::process::Command::new(&target_exe).spawn();
        std::process::exit(0);
    }
    Err("Файл не найден".to_string())
}

#[tauri::command]
pub fn uninstall_app(target_path: String) -> Result<Value, String> {
    let p = std::path::Path::new(target_path.trim());
    // «Чистая установка» зовёт удаление и на пустой папке: убирать нечего —
    // это не ошибка. Непустую чужую папку по-прежнему трогать нельзя.
    if !p.exists() {
        return Ok(serde_json::json!({ "status": "ok" }));
    }
    let empty = std::fs::read_dir(p)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    if empty {
        return Ok(serde_json::json!({ "status": "ok" }));
    }
    // Проверка до любых удалений: если папка не наша, ярлыки тоже не трогаем.
    let dir = guard::uninstall_target(&target_path)?;

    #[cfg(target_os = "windows")]
    {
        if let Some(desktop) = dirs::desktop_dir() {
            let _ = std::fs::remove_file(desktop.join("Pagrysha Launcher.lnk"));
        }
        if let Some(appdata) = dirs::data_dir() {
            let start_menu = appdata
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs");
            let _ = std::fs::remove_file(start_menu.join("Pagrysha Launcher.lnk"));
        }
    }

    std::fs::remove_dir_all(&dir).map_err(|e| format!("Не удалось удалить папку: {}", e))?;

    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn update_discord_presence(_presence: Value) {}
