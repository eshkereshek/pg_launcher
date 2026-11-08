//! Память и бэкапы: сколько ОЗУ ест лаунчер, чем занят диск и как
//! сохранить/восстановить миры сборки.
//!
//! ОЗУ читаем штатными средствами Windows через WinAPI (без новых зависимостей):
//! `GlobalMemoryStatusEx` — системная память, `K32GetProcessMemoryInfo` — RSS
//! текущего процесса лаунчера. Размеры папок считаем рекурсивно в blocking-пуле.

use crate::utils::download::extract_zip_archive;
use crate::utils::guard;
use crate::utils::paths::{get_app_data_dir, get_minecraft_root};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// (всего ОЗУ, свободно ОЗУ, RSS лаунчера) в мегабайтах.
/// sysinfo уже в зависимостях проекта — свой FFI не нужен, и работает не только
/// на Windows.
fn memory_snapshot() -> (u64, u64, u64) {
    let system = sysinfo::System::new_all();
    let total = system.total_memory() / 1024 / 1024;
    let available = system.available_memory() / 1024 / 1024;
    let rss = sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| system.process(pid))
        .map(|process| process.memory() / 1024 / 1024)
        .unwrap_or(0);
    (total, available, rss)
}

/// Размер папки в мегабайтах, рекурсивно; ошибки доступа пропускаем.
fn dir_size_mb(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let mut stack: Vec<PathBuf> = vec![path.to_path_buf()];
    let mut guard_count = 0u32;
    while let Some(current) = stack.pop() {
        // Предохранитель от гигантских деревьев (миллион файлов в assets).
        guard_count += 1;
        if guard_count > 400_000 {
            break;
        }
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total / 1024 / 1024
}

fn backups_dir() -> PathBuf {
    get_app_data_dir().join("backups")
}

/// Список бэкапов: имя файла, размер, время.
fn read_backups() -> Vec<Value> {
    let dir = backups_dir();
    let mut list: Vec<Value> = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return list,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("zip") {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let created = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        list.push(json!({
            "name": name,
            "sizeMb": (meta.len() / 1024 / 1024).max(1),
            "created": created,
        }));
    }
    list.sort_by(|a, b| b["created"].as_u64().cmp(&a["created"].as_u64()));
    list
}

/// Байты всех файлов папки (для проверки копии и прогресса).
fn dir_bytes(path: &Path) -> u64 {
    let mut total: u64 = 0;
    let mut stack: Vec<PathBuf> = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

/// Рекурсивное копирование с отчётом о скопированных байтах.
fn copy_dir(src: &Path, dst: &Path, copied: &mut u64, report: &dyn Fn(u64)) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Не удалось создать {}: {e}", dst.display()))?;
    let entries = fs::read_dir(src).map_err(|e| format!("Не удалось прочитать {}: {e}", src.display()))?;
    for entry in entries.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_dir() {
            copy_dir(&from, &to, copied, report)?;
        } else if meta.is_file() {
            fs::copy(&from, &to).map_err(|e| format!("Не удалось скопировать {}: {e}", from.display()))?;
            *copied += meta.len();
            report(*copied);
        }
    }
    Ok(())
}

/// Перенос всех данных лаунчера (включая AppData) на другой диск.
/// Порядок безопасный: копия → сверка объёма → переключение `data-dir.txt`
/// → удаление старой папки. При любом расхождении старая папка остаётся.
#[tauri::command]
pub async fn move_data_dir(app: tauri::AppHandle, target: String) -> Result<Value, String> {
    use tauri::Emitter;

    let target_path = PathBuf::from(target.trim());
    if target.trim().is_empty() || !target_path.is_absolute() {
        return Err("Выберите папку назначения (абсолютный путь)".to_string());
    }
    let current = get_app_data_dir();
    if target_path == current {
        return Err("Данные уже лежат в этой папке".to_string());
    }
    if target_path.starts_with(&current) || current.starts_with(&target_path) {
        return Err("Папки не должны быть вложены друг в друга".to_string());
    }
    if !current.is_dir() {
        return Err("Текущая папка данных не найдена".to_string());
    }

    let total = dir_bytes(&current);
    let total_mb = (total / 1024 / 1024).max(1);
    let current_display = current.to_string_lossy().to_string();
    let target_display = target_path.to_string_lossy().to_string();
    let app_for_task = app.clone();

    let (copied, removed) = tokio::task::spawn_blocking(move || -> Result<(u64, bool), String> {
        let mut copied: u64 = 0;
        // Cell, а не mut: замыкание остаётся `Fn`, как требует copy_dir.
        let last_report = std::cell::Cell::new(0u64);
        // Не чаще, чем раз в ~64 МБ, чтобы не топить интерфейс событиями.
        copy_dir(&current, &target_path, &mut copied, &|done: u64| {
            if done.saturating_sub(last_report.get()) >= 64 * 1024 * 1024 {
                last_report.set(done);
                let progress = if total > 0 { ((done as f64 / total as f64) * 100.0).min(100.0) as u64 } else { 0 };
                let _ = app_for_task.emit(
                    "data-move-progress",
                    serde_json::json!({
                        "copiedMb": done / 1024 / 1024,
                        "totalMb": total_mb,
                        "progress": progress,
                    }),
                );
            }
        })?;

        // Сверка: копия не должна быть меньше оригинала.
        let copied_total = dir_bytes(&target_path);
        if copied_total < total {
            return Err(format!(
                "Копия неполная: {} из {} байт. Данные не удалялись, можно повторить.",
                copied_total, total
            ));
        }

        // Переключаем лаунчер на новую папку.
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let marker = exe
            .parent()
            .ok_or("Не удалось определить папку лаунчера")?
            .join("data-dir.txt");
        fs::write(&marker, target_path.to_string_lossy().to_string())
            .map_err(|e| format!("Не удалось записать путь данных: {e}"))?;

        // install.json переехал вместе с данными — правим путь уже в копии.
        let state_path = target_path.join("install.json");
        if let Ok(text) = fs::read_to_string(&state_path) {
            if let Ok(mut value) = serde_json::from_str::<Value>(&text) {
                if let Some(obj) = value.as_object_mut() {
                    obj.insert("dataDir".to_string(), serde_json::json!(target_path.to_string_lossy()));
                    let _ = fs::write(&state_path, value.to_string());
                }
            }
        }

        // Старую папку убираем только после успешной сверки.
        let removed = fs::remove_dir_all(&current).is_ok();
        Ok((copied, removed))
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(json!({
        "dataDir": target_display,
        "movedMb": copied / 1024 / 1024,
        "removedOld": removed,
        "oldDir": current_display,
    }))
}

/// Всё, что лежит в `versions/`: ванильные версии и сборки. Панель бэкапов
/// показывает этот список, а не только сборки — миры бывают и у ванили.
#[tauri::command]
pub fn list_instances() -> Result<Value, String> {
    let root = get_minecraft_root().join("versions");
    let mut out: Vec<Value> = Vec::new();
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            // Ванильная версия — есть свой jar или профиль; всё остальное сборка.
            let is_version = path.join(format!("{name}.jar")).is_file()
                || path.join(format!("{name}.json")).is_file();
            out.push(json!({
                "name": name,
                "kind": if is_version { "version" } else { "pack" },
                "hasSaves": path.join("saves").is_dir(),
            }));
        }
    }
    out.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    Ok(Value::Array(out))
}

/// Общая статистика: ОЗУ системы, память лаунчера и разбивка диска.
#[tauri::command]
pub async fn memory_stats() -> Result<Value, String> {
    tokio::task::spawn_blocking(|| {
        let (total, free, rss) = memory_snapshot();
        let root = get_minecraft_root();
        let app = get_app_data_dir();

        let disk = json!({
            "versions": dir_size_mb(&root.join("versions")),
            "assets": dir_size_mb(&root.join("assets")),
            "libraries": dir_size_mb(&root.join("libraries")),
            "logs": dir_size_mb(&root.join("logs")),
            "backups": dir_size_mb(&backups_dir()),
            "launcher": dir_size_mb(&app),
        });

        Ok(json!({
            "systemTotalMb": total,
            "systemFreeMb": free,
            "launcherRssMb": rss,
            // Где сейчас лежат данные: показываем игроку в «Управлении памятью».
            "dataDir": get_app_data_dir().to_string_lossy(),
            "disk": disk,
            "backups": read_backups(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Создать zip с мирами сборки: `saves` + настройки/серверы.
/// `keep` — сколько последних копий оставить (старые удаляются).
#[tauri::command]
pub async fn create_backup(instance_id: String, keep: Option<u32>) -> Result<Value, String> {
    let keep = keep.unwrap_or(3).clamp(1, 20);
    let safe = guard::folder_name(&instance_id)?;
    let instance = get_minecraft_root().join("versions").join(&safe);
    let sources: Vec<(&str, PathBuf)> = vec![
        ("saves", instance.join("saves")),
        ("options.txt", instance.join("options.txt")),
        ("servers.dat", instance.join("servers.dat")),
    ];
    if !sources.iter().any(|(_, path)| path.exists()) {
        return Err("У сборки пока нет миров — бэкапить нечего".to_string());
    }

    let name = format!(
        "{}-{}.zip",
        safe,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0)
    );
    let dir = backups_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(&name);

    let target_for_task = target.clone();
    let sources_for_task = sources.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = fs::File::create(&target_for_task).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for (root_name, path) in sources_for_task {
            if !path.exists() {
                continue;
            }
            if path.is_file() {
                writer
                    .start_file(root_name.to_string(), options)
                    .map_err(|e| e.to_string())?;
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                writer.write_all(&bytes).map_err(|e| e.to_string())?;
                continue;
            }
            let mut stack = vec![path.clone()];
            while let Some(current) = stack.pop() {
                let entries = fs::read_dir(&current).map_err(|e| e.to_string())?;
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    let meta = entry.metadata().map_err(|e| e.to_string())?;
                    // Путь внутри архива: «saves/…» с прямыми слэшами.
                    let rel = entry_path
                        .strip_prefix(&instance) 
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    if meta.is_dir() {
                        stack.push(entry_path);
                    } else if meta.is_file() {
                        writer
                            .start_file(rel, options)
                            .map_err(|e| e.to_string())?;
                        let bytes = fs::read(&entry_path).map_err(|e| e.to_string())?;
                        writer.write_all(&bytes).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        writer.finish().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Ротация: оставляем `keep` свежих копий этой сборки.
    let mut ours: Vec<(u64, PathBuf)> = read_backups_meta(&dir, &safe);
    ours.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in ours.into_iter().skip(keep as usize) {
        let _ = fs::remove_file(path);
    }

    Ok(json!({ "name": name, "backups": read_backups() }))
}

/// (время, путь) всех бэкапов конкретной сборки.
fn read_backups_meta(dir: &Path, prefix: &str) -> Vec<(u64, PathBuf)> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with(prefix) || !name.ends_with(".zip") {
                continue;
            }
            let created = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            out.push((created, entry.path()));
        }
    }
    out
}

/// Восстановить миры из бэкапа поверх сборки.
#[tauri::command]
pub async fn restore_backup(name: String, instance_id: String) -> Result<(), String> {
    let safe = guard::folder_name(&instance_id)?;
    let instance = get_minecraft_root().join("versions").join(&safe);
    let archive = backups_dir().join(guard::folder_name(&name)?);
    if !archive.is_file() {
        return Err("Бэкап не найден".to_string());
    }
    fs::create_dir_all(&instance).map_err(|e| e.to_string())?;
    extract_zip_archive(&archive, &instance)
}

/// Удалить файл бэкапа.
#[tauri::command]
pub fn delete_backup(name: String) -> Result<Value, String> {
    let path = backups_dir().join(guard::folder_name(&name)?);
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "backups": read_backups() }))
}
