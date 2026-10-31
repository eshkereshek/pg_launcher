use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::paths::*;
use crate::utils::release;
use crate::utils::versions;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Версии Java, которые лаунчер умеет скачивать сам.
pub const JAVA_VERSIONS: [&str; 4] = ["8", "17", "21", "25"];

pub fn find_java_binary(base_dir: &Path) -> Option<PathBuf> {
    if !base_dir.exists() {
        return None;
    }
    let is_win = cfg!(target_os = "windows");
    let exe_name = if is_win { "javaw.exe" } else { "java" };
    let fallback_exe = if is_win { "java.exe" } else { "java" };

    // Direct bin folder
    let direct = base_dir.join("bin").join(exe_name);
    if direct.exists() {
        return Some(direct);
    }
    let direct_fallback = base_dir.join("bin").join(fallback_exe);
    if direct_fallback.exists() {
        return Some(direct_fallback);
    }

    // Subdirectories (Adoptium puts jdk in jdk-21.0.1+12 folder)
    if let Ok(entries) = fs::read_dir(base_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let sub = entry.path().join("bin").join(exe_name);
                if sub.exists() {
                    return Some(sub);
                }
                let sub_fb = entry.path().join("bin").join(fallback_exe);
                if sub_fb.exists() {
                    return Some(sub_fb);
                }
                // macOS Contents/Home/bin
                let mac_bin = entry
                    .path()
                    .join("Contents")
                    .join("Home")
                    .join("bin")
                    .join(exe_name);
                if mac_bin.exists() {
                    return Some(mac_bin);
                }
            }
        }
    }
    None
}

pub fn find_installed_java(version: &str) -> Option<PathBuf> {
    let java_dir = get_app_data_dir().join(format!("java-runtime-{}", version));
    if let Some(bin) = find_java_binary(&java_dir) {
        return Some(bin);
    }

    // Also check standard runtime directory
    let runtime_dir = get_java_dir().join(format!("java-{}", version));
    if let Some(bin) = find_java_binary(&runtime_dir) {
        return Some(bin);
    }

    None
}

#[tauri::command]
pub fn get_installed_javas() -> Value {
    let mut map = serde_json::Map::new();

    for v in JAVA_VERSIONS {
        let p = find_installed_java(v);
        map.insert(
            v.to_string(),
            serde_json::json!({
                "installed": p.is_some(),
                "path": p.map(|path| path.to_string_lossy().to_string())
            }),
        );
    }

    Value::Object(map)
}

/// Реальная версия Java, на которую указывает путь.
///
/// Проверять надо не название папки, а сам файл: `java-runtime-21` мог быть
/// установлен вручную, а произвольный путь в настройках вообще ни о чём не
/// говорит. У `javaw.exe` нет консоли, поэтому версию спрашиваем у соседнего
/// `java.exe`; если запустить не вышло — читаем файл `release`, который
/// Adoptium кладёт в корень рантайма.
/// Версия из имени папки бандл-рантайма: `java-runtime-17`, `java-runtime-21`.
fn major_from_runtime_path(java: &Path) -> Option<u32> {
    let text = java.to_string_lossy().to_ascii_lowercase();
    let start = text.find("java-runtime-")? + "java-runtime-".len();
    let digits: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse::<u32>().ok()
}

pub fn java_major_version(java: &Path) -> Option<u32> {
    // Кеш на время работы процесса: раньше `java -version` запускался
    // отдельным процессом несколько раз за один запуск игры (проверка
    // версии + выбор аргументов JVM), это 0.2–0.5 с впустую.
    static CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, u32>>> =
        std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));

    if let Some(known) = cache.lock().ok().and_then(|c| c.get(java).copied()) {
        return Some(known);
    }

    // Бандл-рантаймы лежат в `java-runtime-17`, `java-runtime-21` — версия
    // видна из пути, и запускать `java -version` не нужно вовсе.
    if let Some(major) = major_from_runtime_path(java) {
        if let Ok(mut c) = cache.lock() {
            c.insert(java.to_path_buf(), major);
        }
        return Some(major);
    }

    let exe = if java.file_name().and_then(|n| n.to_str()) == Some("javaw.exe") {
        java.with_file_name("java.exe")
    } else {
        java.to_path_buf()
    };

    if let Ok(out) = std::process::Command::new(&exe).arg("-version").output() {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        if let Some(major) = versions::parse_java_version(&text) {
            if let Ok(mut c) = cache.lock() {
                c.insert(java.to_path_buf(), major);
            }
            return Some(major);
        }
    }

    // java.exe рядом мог отсутствовать — пробуем release в корне рантайма.
    let home = java.parent()?.parent()?;
    let release = fs::read_to_string(home.join("release")).ok()?;
    let major = versions::parse_java_version(&release)?;
    if let Ok(mut c) = cache.lock() {
        c.insert(java.to_path_buf(), major);
    }
    Some(major)
}

/// Java нужной версии: найденная на диске или скачанная.
///
/// Нужна перед запуском игры: если выбранная в настройках Java старше, чем
/// требует версия игры, она падает с `UnsupportedClassVersionError` ещё до
/// создания окна. Ставим недостающую сами — иначе пользователю пришлось бы
/// угадывать версию по ошибке в логе.
pub async fn ensure_java_for(app: &AppHandle, required: u32) -> Result<PathBuf, String> {
    // Требование игры нормализуем к рантайму, который лаунчер умеет ставить.
    let Some(required) = versions::supported_java(required) else {
        return Err(
            "Эта версия игры требует Java новее 25, которую лаунчер пока не устанавливает автоматически"
                .to_string(),
        );
    };
    let version = required.to_string();
    if let Some(bin) = find_installed_java(&version) {
        return Ok(bin);
    }
    if !JAVA_VERSIONS.contains(&version.as_str()) {
        return Err(format!(
            "Игре нужна Java {}, а лаунчер умеет ставить только {}. Установите её вручную в настройках.",
            required,
            JAVA_VERSIONS.join(", ")
        ));
    }

    let _ = app.emit(
        "launch-progress",
        format!("Скачивание Java {} для этой версии игры...", required),
    );
    install_java(app.clone(), version.clone()).await?;

    find_installed_java(&version).ok_or_else(|| {
        format!(
            "Java {} скачалась, но не нашлась в папке лаунчера — проверьте настройки",
            version
        )
    })
}

/// Ссылка и sha256 пакета Adoptium для нужной версии, ОС и архитектуры.
///
/// `image_type` — `jre` или `jdk`: JRE собирают не для всех версий, тогда
/// нужен JDK. Возвращаем только тот пакет, для которого API дал хеш.
async fn adoptium_package(
    client: &reqwest::Client,
    version: &str,
    image_type: &str,
    os_name: &str,
    arch_name: &str,
) -> Option<(String, String)> {
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{}/hotspot?architecture={}&image_type={}&os={}&vendor=eclipse",
        version, arch_name, image_type, os_name
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: Value = resp.json().await.ok()?;
    release::adoptium_package(&json)
}

#[tauri::command]
pub async fn install_java(app: AppHandle, version: String) -> Result<Value, String> {
    if !JAVA_VERSIONS.contains(&version.as_str()) {
        return Err(format!("Неподдерживаемая версия Java: {}", version));
    }

    let app_data = get_app_data_dir();
    let java_dir = app_data.join(format!("java-runtime-{}", version));
    let new_dir = app_data.join(format!("java-runtime-{}.new", version));
    let old_dir = app_data.join(format!("java-runtime-{}.old", version));

    // Скачиваем и распаковываем в отдельную папку `.new`, а старую установку
    // трогаем только после успеха: иначе при обрыве сети рабочая Java
    // пропадала вместе с папкой.
    let _ = fs::remove_dir_all(&new_dir);

    let is_win = cfg!(target_os = "windows");
    let is_mac = cfg!(target_os = "macos");
    let os_name = if is_win {
        "windows"
    } else if is_mac {
        "mac"
    } else {
        "linux"
    };
    let arch_name = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    };

    // Ссылку и хеш берём из API Adoptium. Архив распаковывается в java.exe,
    // который лаунчер потом запускает, поэтому без контрольной суммы качать
    // его нельзя. JRE собирают не для всех версий — тогда берём JDK.
    let client = reqwest::Client::new();
    let mut package = None;
    for image_type in ["jre", "jdk"] {
        if let Some(found) =
            adoptium_package(&client, &version, image_type, os_name, arch_name).await
        {
            package = Some(found);
            break;
        }
    }
    let (link, checksum) = package.ok_or_else(|| {
        format!(
            "Не удалось получить ссылку и контрольную сумму Java {} от Adoptium",
            version
        )
    })?;
    // Ссылка приходит из ответа API и ведёт на GitHub: проверяем, что это
    // действительно релиз Adoptium, а не что-то ещё.
    guard::adoptium_url(&link)?;
    let sum = Sum::sha256(&checksum).ok_or("Некорректная контрольная сумма архива Java")?;

    // Папку `.new` создаём только теперь, когда пакет уже найден: ранние
    // ошибки не должны оставлять после себя мусорные папки.
    fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;
    let archive_path = new_dir.join(if is_win { "java.zip" } else { "java.tar.gz" });

    let app_handle = app.clone();
    let ver = version.clone();
    let _ = app.emit(
        "java-install-progress",
        serde_json::json!({
            "version": &ver,
            "status": format!("Скачивание Java {}...", ver),
            "progress": 10
        }),
    );

    let download_result = ensure_file_with_progress(
        &client,
        &link,
        &archive_path,
        Some(sum),
        move |cur, total| {
            let pct = if total > 0 {
                10 + ((cur * 80) / total) as u32
            } else {
                50
            };
            let _ = app_handle.emit(
            "java-install-progress",
            serde_json::json!({
                "version": &ver,
                "status": format!("Скачивание Java {}... ({:.1} МБ)", ver, cur as f64 / 1048576.0),
                "progress": pct
            }),
        );
        },
    )
    .await;

    if let Err(e) = download_result {
        // Обрыв загрузки не должен трогать уже установленную Java: чистим
        // только недокачанную папку `.new`.
        let _ = fs::remove_dir_all(&new_dir);
        return Err(format!("Не удалось скачать Java {}: {}", version, e));
    }

    let _ = app.emit(
        "java-install-progress",
        serde_json::json!({
            "version": &version,
            "status": format!("Распаковка Java {}...", version),
            "progress": 92
        }),
    );

    // Распаковываем в `.new`: при ошибке чистим только её, старая установка
    // остаётся рабочей.
    if is_win {
        if let Err(e) = extract_zip_archive(&archive_path, &new_dir) {
            let _ = fs::remove_file(&archive_path);
            let _ = fs::remove_dir_all(&new_dir);
            return Err(format!("Не удалось распаковать Java {}: {}", version, e));
        }
    }
    let _ = fs::remove_file(&archive_path);

    // Без исполняемого файла подменять рабочую установку нельзя.
    if find_java_binary(&new_dir).is_none() {
        let _ = fs::remove_dir_all(&new_dir);
        return Err(format!(
            "В скачанном архиве Java {} не найден исполняемый файл",
            version
        ));
    }

    // Подмена: рабочую папку уводим в `.old`, на её место ставим `.new`, и
    // только после успеха удаляем `.old`.
    let _ = fs::remove_dir_all(&old_dir);
    if java_dir.exists() {
        if let Err(e) = fs::rename(&java_dir, &old_dir) {
            let _ = fs::remove_dir_all(&new_dir);
            return Err(format!("Не удалось заменить установленную Java: {}", e));
        }
    }
    if let Err(e) = fs::rename(&new_dir, &java_dir) {
        // Возвращаем старую установку на место, чтобы не остаться без Java.
        if old_dir.exists() {
            let _ = fs::rename(&old_dir, &java_dir);
        }
        let _ = fs::remove_dir_all(&new_dir);
        return Err(format!("Не удалось заменить установленную Java: {}", e));
    }
    let _ = fs::remove_dir_all(&old_dir);

    let bin = find_java_binary(&java_dir).ok_or("Не найден исполняемый файл Java")?;

    let _ = app.emit(
        "java-install-progress",
        serde_json::json!({
            "version": &version,
            "status": format!("Java {} успешно установлена!", version),
            "progress": 100
        }),
    );

    Ok(serde_json::json!({
        "success": true,
        "path": bin.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn clean_uninstall_java() -> Result<Value, String> {
    let app_data = get_app_data_dir();
    if let Ok(entries) = fs::read_dir(&app_data) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("java-runtime-") {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok(serde_json::json!({ "status": "ok" }))
}
