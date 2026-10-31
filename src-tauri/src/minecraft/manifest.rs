use crate::minecraft::models::*;
use crate::utils::paths::*;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

/// Сетевой запрос манифеста версий Mojang.
///
/// Вынесено отдельно: `fetch_version_manifest` должен уметь отличить ошибку
/// сети от ошибки разбора, чтобы потом вернуть исходную причину.
async fn fetch_manifest_text() -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://launchermeta.mojang.com/mc/game/version_manifest.json")
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.text().await.map_err(|e| e.to_string())
}

pub async fn fetch_version_manifest() -> Result<VersionManifest, String> {
    let cache_path = get_minecraft_root().join("version_manifest_cache.json");

    // Сначала сеть: кэш нужен только тогда, когда Mojang недоступен.
    let original_error = match fetch_manifest_text().await {
        Ok(text) => match serde_json::from_str::<VersionManifest>(&text) {
            Ok(manifest) => {
                // Кэш обновляем молча: без него офлайн-список версий не
                // заработает, но из-за ошибки записи запуск ломать незачем.
                let _ = fs::write(&cache_path, &text);
                return Ok(manifest);
            }
            Err(e) => format!("Не удалось разобрать манифест версий: {}", e),
        },
        Err(e) => e,
    };

    // Сеть недоступна или ответ битый — берём последний удачный манифест,
    // чтобы лаунчер показывал список версий и без интернета.
    if let Ok(cached) = fs::read_to_string(&cache_path) {
        if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&cached) {
            return Ok(manifest);
        }
    }

    Err(original_error)
}

pub fn get_installed_versions() -> Vec<String> {
    let mut installed = Vec::new();
    let versions_dir = get_minecraft_root().join("versions");
    if let Ok(entries) = fs::read_dir(versions_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                installed.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }
    installed
}

pub fn get_version_json_path(version_id: &str) -> PathBuf {
    get_minecraft_root()
        .join("versions")
        .join(version_id)
        .join(format!("{}.json", version_id))
}

pub async fn load_or_fetch_version_json(version_id: &str) -> Result<Value, String> {
    // version_id приходит из интерфейса и становится именем папки и файла.
    let version_id = crate::utils::guard::folder_name(version_id)?;
    let version_id = version_id.as_str();
    let json_path = get_version_json_path(version_id);
    if json_path.exists() {
        if let Ok(content) = fs::read_to_string(&json_path) {
            if let Ok(val) = serde_json::from_str(&content) {
                return Ok(val);
            }
        }
    }

    let root = get_minecraft_root();
    // Check fallback locations for Forge or custom versions
    let fallbacks = [
        root.join("versions").join(version_id).join("version.json"),
        root.join("forge").join(version_id).join("version.json"),
        root.join("forge")
            .join(format!("forge-{}-installer", version_id))
            .join("version.json"),
    ];

    for fb in &fallbacks {
        if fb.exists() {
            if let Ok(content) = fs::read_to_string(fb) {
                if let Ok(val) = serde_json::from_str(&content) {
                    return Ok(val);
                }
            }
        }
    }

    let manifest = fetch_version_manifest().await?;
    let info = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Версия {} не найдена в манифесте Mojang", version_id))?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&info.url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let val: Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(parent) = json_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Не удалось создать папку версии: {}", e))?;
    }
    let pretty = serde_json::to_string_pretty(&val)
        .map_err(|e| format!("Не удалось сохранить манифест версии: {}", e))?;
    fs::write(&json_path, pretty)
        .map_err(|e| format!("Не удалось сохранить манифест версии: {}", e))?;

    Ok(val)
}

#[tauri::command]
pub async fn get_versions() -> Result<Value, String> {
    // Отсутствие сети не должно превращаться в ошибку команды: интерфейс
    // получает установленные версии и признак офлайн-режима.
    match fetch_version_manifest().await {
        Ok(manifest) => Ok(serde_json::json!({
            "releases": manifest.versions,
            "installed": get_installed_versions(),
            "offline": false
        })),
        Err(_) => Ok(serde_json::json!({
            "releases": [],
            "installed": get_installed_versions(),
            "offline": true
        })),
    }
}
