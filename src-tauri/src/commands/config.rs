use crate::utils::guard;
use crate::utils::paths::*;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::System;

/// Записать JSON через временный файл и переименование.
///
/// Прямая запись оставляет на диске обрезанный файл, если лаунчер закрыли
/// посреди сохранения, — а это и настройки, и аккаунты. Поэтому сначала
/// пишем `<path>.tmp` и только потом подменяем целевой файл.
fn write_json_atomic(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Не удалось создать папку данных: {}", e))?;
    }

    let tmp = PathBuf::from(format!("{}.tmp", path.display()));
    // Если запись временного файла сорвалась на середине, огрызок не оставляем:
    // иначе следующий запуск может принять его за данные.
    if let Err(e) = fs::write(&tmp, text) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Не удалось записать временный файл: {}", e));
    }

    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            // На Windows rename поверх существующего файла может не пройти:
            // убираем цель и пробуем ещё раз, уже без старого файла.
            let _ = fs::remove_file(path);
            fs::rename(&tmp, path).map_err(|e| {
                let _ = fs::remove_file(&tmp);
                format!("Не удалось сохранить файл: {}", e)
            })
        }
    }
}

/// Настройки игрока из options.txt выбранной сборки: язык, размер интерфейса,
/// нарратор. Нужны, чтобы перенести уже выставленные в игре значения в профиль
/// лаунчера и не настраивать каждую новую сборку руками.
#[tauri::command]
pub fn read_game_options(instance_id: Option<String>) -> Value {
    let root = get_minecraft_root();
    let dir = match instance_id.as_deref() {
        Some(name) => match guard::folder_name(name) {
            Ok(safe) => root.join("versions").join(safe),
            Err(_) => root,
        },
        None => root,
    };

    let values = crate::utils::options::read_player_options(&dir);
    serde_json::json!({
        "lang": values.get("lang"),
        "guiScale": values.get("guiScale"),
        "narrator": values.get("narrator")
    })
}

#[tauri::command]
pub fn get_settings() -> Option<Value> {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(val) = serde_json::from_str(&content) {
                return Some(val);
            }
        }
    }
    None
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Result<Value, String> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut existing: Value = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if let (Some(existing_obj), Some(new_obj)) = (existing.as_object_mut(), settings.as_object()) {
        for (k, v) in new_obj {
            existing_obj.insert(k.clone(), v.clone());
        }
    } else {
        existing = settings;
    }

    let formatted = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    write_json_atomic(&path, &formatted)?;
    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn reset_settings() -> Result<Value, String> {
    let settings = get_settings_path();
    let accounts = get_accounts_path();
    if settings.exists() {
        let _ = fs::remove_file(settings);
    }
    if accounts.exists() {
        let _ = fs::remove_file(accounts);
    }
    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn get_accounts() -> Value {
    let path = get_accounts_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(val) = serde_json::from_str(&content) {
                return val;
            }
        }
    }
    serde_json::json!([])
}

#[tauri::command]
pub fn save_accounts(accounts: Value) -> Result<Value, String> {
    let path = get_accounts_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let formatted = serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())?;
    write_json_atomic(&path, &formatted)?;
    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn get_modpacks() -> Value {
    let path = get_modpacks_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(val) = serde_json::from_str(&content) {
                return val;
            }
        }
    }
    serde_json::json!([])
}

#[tauri::command]
pub fn save_modpacks(modpacks: Value) -> Result<Value, String> {
    let path = get_modpacks_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let formatted = serde_json::to_string_pretty(&modpacks).map_err(|e| e.to_string())?;
    write_json_atomic(&path, &formatted)?;
    Ok(serde_json::json!({ "status": "ok" }))
}

#[tauri::command]
pub fn open_folder(instance_id: Option<String>) -> Result<(), String> {
    // Имя сборки приходит из интерфейса: собираем путь через guard, чтобы «..»
    // не открывал (и не создавал) папку за пределами versions.
    let root = match instance_id {
        Some(id) if !id.trim().is_empty() => {
            let name = guard::folder_name(&id)?;
            get_minecraft_root().join("versions").join(name)
        }
        _ => get_minecraft_root(),
    };
    fs::create_dir_all(&root).map_err(|e| format!("Не удалось создать папку: {}", e))?;
    open::that(&root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_cache() -> Result<Value, String> {
    let temp_dir = std::env::temp_dir();
    let mut failures: Vec<String> = Vec::new();

    match fs::read_dir(&temp_dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("mrpack_")
                    || name.starts_with("Pagrysha_")
                    || name.starts_with("pagrysha-")
                    || name.starts_with("optifine")
                {
                    // Заранее неизвестно, файл это или папка: старый код звал
                    // обе функции подряд и молча терял ошибки.
                    let path = entry.path();
                    let result = if path.is_dir() {
                        fs::remove_dir_all(&path)
                    } else {
                        fs::remove_file(&path)
                    };
                    if let Err(e) = result {
                        failures.push(format!("{}: {}", name, e));
                    }
                }
            }
        }
        Err(e) => failures.push(format!("{}: {}", temp_dir.display(), e)),
    }

    if failures.is_empty() {
        Ok(serde_json::json!({ "status": "ok" }))
    } else {
        Ok(serde_json::json!({
            "status": "error",
            "error": format!("Не удалось удалить: {}", failures.join("; "))
        }))
    }
}

#[tauri::command]
pub fn get_system_info() -> Value {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let free_ram_mb = sys.available_memory() / (1024 * 1024);
    let cpu_count = sys.cpus().len();

    serde_json::json!({
        "totalRam": total_ram_mb,
        // Интерфейс читает именно это поле; totalRam оставлен для старых мест.
        "totalMemoryMB": total_ram_mb,
        "freeRam": free_ram_mb,
        "cpuCount": cpu_count,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    })
}
