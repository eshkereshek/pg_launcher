//! CurseForge: каталог, файлы, установка и импорт сторонних сборок.
//!
//! Ответы CurseForge приводятся к той же форме, что у Modrinth (`project_id`,
//! `title`, `icon_url`, `versions`, `files`), чтобы карточки работали без второй
//! ветки отрисовки. Идентификаторы помечаются префиксом `cf-`, по нему видно
//! источник. Чистый разбор ответов лежит в `pagrysha_core::utils::curseforge` —
//! там его можно протестировать без Tauri.

use crate::utils::curseforge::{
    class_id, html_to_text, kind_folder, loader_name, loader_type, normalize_file,
    normalize_project, pick_file, sort_field, strip_id,
};
use crate::utils::download::{ensure_file, extract_zip_archive, Sum};
use crate::utils::guard;
use crate::utils::packscan;
use crate::utils::paths::*;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const CF_API: &str = "https://api.curseforge.com/v1";
const CF_GAME_ID: u32 = 432; // Minecraft

/// Ключ по умолчанию. Переменная окружения `CURSEFORGE_API_KEY` важнее:
/// так ключ можно подменить без пересборки.
const CF_KEY_FALLBACK: &str = "$2a$10$4om2sueao6C0s/mIqlWWpulb/YN1S19mBgzHOS12blq5B6RDDY1j.";

fn cf_key() -> String {
    std::env::var("CURSEFORGE_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
        .unwrap_or_else(|| CF_KEY_FALLBACK.to_string())
}

async fn cf_get(
    client: &reqwest::Client,
    path: &str,
    query: &[(String, String)],
) -> Result<Value, String> {
    // CurseForge отвечает 403 и при неверном ключе, и при слишком частых
    // запросах (каталог грузит по 20 карточек, лимит легко задеть). Поэтому
    // 403/429 повторяем с паузой: иначе пачка запросов выглядит как отказ.
    let mut last_error = String::new();

    for attempt in 1..=3u64 {
        let resp = client
            .get(format!("{}{}", CF_API, path))
            .header("x-api-key", cf_key())
            .header("Accept", "application/json")
            .header("User-Agent", "PagryshaLauncher/7.2")
            .query(query)
            .send()
            .await
            .map_err(|e| format!("CurseForge недоступен: {}", e))?;

        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;

        if status.is_success() {
            return serde_json::from_str(&body)
                .map_err(|e| format!("Некорректный ответ CurseForge: {}", e));
        }

        let short: String = body.chars().take(200).collect();
        last_error = format!("CurseForge вернул ошибку {}: {}", status.as_u16(), short);

        let retryable = matches!(status.as_u16(), 403 | 429) || status.is_server_error();
        if !retryable || attempt == 3 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(400 * attempt)).await;
    }

    Err(last_error)
}

fn q(pairs: &[(&str, String)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

/// Каталог: поиск и популярное в одном вызове, как у Modrinth.
#[tauri::command]
pub async fn cf_search(
    kind: String,
    query: String,
    game_version: String,
    loader: String,
    offset: u32,
    sort: String,
    category: String,
) -> Result<Value, String> {
    let client = reqwest::Client::new();

    let mut params: Vec<(&str, String)> = vec![
        ("gameId", CF_GAME_ID.to_string()),
        ("classId", class_id(&kind).to_string()),
        ("index", offset.to_string()),
        ("pageSize", "20".to_string()),
        ("sortField", sort_field(&sort).to_string()),
        ("sortOrder", "desc".to_string()),
    ];
    if !query.trim().is_empty() {
        params.push(("searchFilter", query.trim().to_string()));
    }
    if !game_version.is_empty() && game_version != "all" {
        params.push(("gameVersion", game_version.clone()));
    }
    if let Some(lt) = loader_type(&loader) {
        params.push(("modLoaderType", lt.to_string()));
    }
    if !category.is_empty() && category != "all" {
        params.push(("categoryId", category.clone()));
    }

    let data = cf_get(&client, "/mods/search", &q(&params)).await?;
    let hits: Vec<Value> = data["data"]
        .as_array()
        .map(|a| a.iter().map(normalize_project).collect())
        .unwrap_or_default();

    Ok(json!({ "hits": hits, "total": data["pagination"]["totalCount"] }))
}

/// Категории выбранного типа проекта — для фильтра в интерфейсе.
#[tauri::command]
pub async fn cf_categories(kind: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let params = q(&[
        ("gameId", CF_GAME_ID.to_string()),
        ("classId", class_id(&kind).to_string()),
    ]);
    let data = cf_get(&client, "/categories", &params).await?;
    let wanted = class_id(&kind) as u64;
    let list: Vec<Value> = data["data"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|c| c["classId"].as_u64() == Some(wanted))
                .filter_map(|c| {
                    Some(json!({
                        "id": c["id"].as_i64()?.to_string(),
                        "name": c["name"],
                        "slug": c["slug"],
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!(list))
}

/// Описание проекта для просмотрщика: заголовок, текст, скриншоты, автор.
/// Форма та же, что у Modrinth, поэтому карточка рисуется без второй ветки.
#[tauri::command]
pub async fn cf_project(project_id: String) -> Result<Value, String> {
    let id = strip_id(&project_id).to_string();
    let client = reqwest::Client::new();
    let data = cf_get(&client, &format!("/mods/{}", id), &[]).await?;
    let p = &data["data"];

    let gallery: Vec<String> = p["screenshots"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| {
                    s["thumbnailUrl"]
                        .as_str()
                        .or_else(|| s["url"].as_str())
                        .map(|u| u.to_string())
                })
                .collect()
        })
        .unwrap_or_default();

    let mut game_versions: Vec<String> = p["latestFilesIndexes"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|f| f["gameVersion"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    game_versions.dedup();

    let categories: Vec<String> = p["categories"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|c| c["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let author = p["authors"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a["name"].as_str())
        .unwrap_or("CurseForge");

    // Полное описание живёт отдельным эндпоинтом: в объекте мода его больше нет,
    // поэтому раньше в «Обзор» попадало краткое summary.
    let mut html = p["description"].as_str().unwrap_or("").to_string();
    if html.trim().is_empty() {
        if let Ok(detail) = cf_get(&client, &format!("/mods/{}/description", id), &[]).await {
            html = detail["data"].as_str().unwrap_or("").to_string();
        }
    }
    let description = html_to_text(&html);
    let summary = p["summary"].as_str().unwrap_or("");
    let body = if description.trim().is_empty() {
        summary.to_string()
    } else {
        description
    };

    Ok(json!({
        "id": format!("cf-{}", p["id"].as_i64().unwrap_or(0)),
        "title": p["name"],
        "description": summary,
        "body": body,
        "icon_url": p["logo"]["thumbnailUrl"].as_str().or_else(|| p["logo"]["url"].as_str()),
        "downloads": p["downloadCount"].as_i64().unwrap_or(0),
        "followers": 0,
        "updated": p["dateModified"],
        "published": p["dateCreated"],
        "game_versions": game_versions,
        "categories": categories,
        "organization": author,
        "gallery": gallery,
        "source": "curseforge",
        "page_url": p["links"]["websiteUrl"],
    }))
}
/// Версии проекта в форме Modrinth — для просмотрщика и выбора релиза.
#[tauri::command]
pub async fn cf_versions(
    project_id: String,
    game_version: String,
    loader: String,
) -> Result<Value, String> {
    let id = strip_id(&project_id).to_string();
    let client = reqwest::Client::new();

    let mut params: Vec<(&str, String)> = vec![("pageSize", "50".to_string())];
    if !game_version.is_empty() && game_version != "all" {
        params.push(("gameVersion", game_version));
    }
    if let Some(lt) = loader_type(&loader) {
        params.push(("modLoaderType", lt.to_string()));
    }

    let data = cf_get(&client, &format!("/mods/{}/files", id), &q(&params)).await?;
    let list: Vec<Value> = data["data"]
        .as_array()
        .map(|a| a.iter().map(normalize_file).collect())
        .unwrap_or_default();
    Ok(json!(list))
}

/// Установка одного мода, ресурспака или шейдера в сборку.
#[tauri::command]
pub async fn cf_install_content(
    app: AppHandle,
    project_id: String,
    kind: String,
    game_version: String,
    loader: String,
    instance_id: String,
    version_id: Option<String>,
) -> Result<Value, String> {
    let id = strip_id(&project_id).to_string();
    let instance = instance_dir(&instance_id)?;
    let client = reqwest::Client::new();

    let file = match version_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(fid) => {
            let data = cf_get(&client, &format!("/mods/{}/files/{}", id, fid), &[]).await?;
            data["data"].clone()
        }
        None => {
            let data = cf_get(
                &client,
                &format!("/mods/{}/files", id),
                &q(&[("pageSize", "50".to_string())]),
            )
            .await?;
            let list = data["data"].as_array().cloned().unwrap_or_default();
            pick_file(&list, &game_version, &loader)
                .cloned()
                .ok_or_else(|| "Нет файла, совместимого с этой версией игры".to_string())?
        }
    };

    let url = file["downloadUrl"]
        .as_str()
        .filter(|u| !u.is_empty())
        .ok_or("Автор запретил скачивание через API")?;
    let file_name = file["fileName"]
        .as_str()
        .ok_or("В файле нет имени")?
        .to_string();
    let safe_name = guard::folder_name(&file_name)?;

    let folder = kind_folder(&kind);
    let dest_dir = instance.join(folder);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(&safe_name);

    let sha1 = file["hashes"]
        .as_array()
        .and_then(|a| a.iter().find(|h| h["algo"].as_u64() == Some(1)))
        .and_then(|h| h["value"].as_str())
        .unwrap_or("");

    let _ = app.emit("launch-progress", format!("Скачивание {}", file_name));
    ensure_file(url, &dest, Sum::sha1(sha1)).await?;

    Ok(json!({ "status": "success", "fileName": safe_name, "folder": folder }))
}

/// Установка сборки: архив с manifest.json, файлы тянутся по projectID/fileID.
#[tauri::command]
pub async fn cf_install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
    pack_name: String,
    game_version: String,
    loader: String,
) -> Result<Value, String> {
    let id = strip_id(&project_id).to_string();
    let client = reqwest::Client::new();

    let file = match version_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(fid) => {
            let data = cf_get(&client, &format!("/mods/{}/files/{}", id, fid), &[]).await?;
            data["data"].clone()
        }
        None => {
            let data = cf_get(
                &client,
                &format!("/mods/{}/files", id),
                &q(&[("pageSize", "50".to_string())]),
            )
            .await?;
            let list = data["data"].as_array().cloned().unwrap_or_default();
            pick_file(&list, &game_version, &loader)
                .cloned()
                .ok_or_else(|| "Нет версии сборки под выбранную игру".to_string())?
        }
    };

    let url = file["downloadUrl"]
        .as_str()
        .filter(|u| !u.is_empty())
        .ok_or("Автор запретил скачивание сборки через API")?;

    let pack_dir_name = guard::folder_name(&pack_name)?;
    let temp_dir = std::env::temp_dir().join(format!(
        "cfpack_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let zip_path = temp_dir.join("modpack.zip");

    let _ = app.emit("launch-progress", "Скачивание архива сборки...");
    ensure_file(url, &zip_path, None).await?;

    let _ = app.emit("launch-progress", "Распаковка сборки...");
    extract_zip_archive(&zip_path, &temp_dir)?;

    let manifest_path = temp_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err("Неверный формат сборки CurseForge: нет manifest.json".to_string());
    }
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Некорректный manifest.json: {}", e))?;

    let instance_path = instance_dir(&pack_dir_name)?;
    if instance_path.join("mods").exists() {
        for stale in ["mods", "config"] {
            let path = instance_path.join(stale);
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
            }
        }
    }
    fs::create_dir_all(&instance_path).map_err(|e| e.to_string())?;

    let files = manifest["files"].as_array().cloned().unwrap_or_default();
    let total = files.len().max(1);

    for (idx, f) in files.iter().enumerate() {
        let (Some(pid), Some(fid)) = (f["projectID"].as_i64(), f["fileID"].as_i64()) else {
            continue;
        };
        // Необязательные файлы часто серверные — в клиент их не ставим.
        if f["required"].as_bool() == Some(false) {
            continue;
        }
        let meta = cf_get(&client, &format!("/mods/{}/files/{}", pid, fid), &[]).await?;
        let item = &meta["data"];
        let Some(dl) = item["downloadUrl"].as_str().filter(|u| !u.is_empty()) else {
            continue;
        };
        let name = item["fileName"].as_str().unwrap_or("file.jar");
        let safe = guard::folder_name(name)?;
        let dest = instance_path.join("mods").join(&safe);
        let sha1 = item["hashes"]
            .as_array()
            .and_then(|a| a.iter().find(|h| h["algo"].as_u64() == Some(1)))
            .and_then(|h| h["value"].as_str())
            .unwrap_or("");

        let _ = app.emit(
            "download-update",
            json!({
                "id": format!("modpack_{}", pack_name),
                "name": &pack_name,
                "text": format!("Файл {} из {}", idx + 1, total),
                "progress": ((idx + 1) * 100) / total
            }),
        );
        ensure_file(dl, &dest, Sum::sha1(sha1)).await?;
    }

    // overrides — конфиги и прочие файлы сборки поверх модов.
    let overrides = manifest["overrides"].as_str().unwrap_or("overrides");
    let overrides_dir = temp_dir.join(guard::relative_under(overrides)?);
    if overrides_dir.exists() {
        copy_dir_all(&overrides_dir, &instance_path)?;
    }

    let _ = fs::remove_dir_all(&temp_dir);
    let _ = app.emit("download-finish", format!("modpack_{}", pack_name));

    let actual_gv = manifest["minecraft"]["version"]
        .as_str()
        .unwrap_or(&game_version)
        .to_string();
    let loader_id = manifest["minecraft"]["modLoaders"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|m| m["id"].as_str())
        .unwrap_or("");
    let actual_loader = ["neoforge", "forge", "fabric", "quilt"]
        .into_iter()
        .find(|name| loader_id.to_ascii_lowercase().starts_with(name))
        .unwrap_or(&loader)
        .to_string();

    Ok(json!({
        "status": "success",
        "gameVersion": actual_gv,
        "actualLoader": actual_loader
    }))
}

/// Сборки, найденные у сторонних лаунчеров. Только чтение: ничего не копируем,
/// пока игрок не нажмёт «Импортировать».
#[tauri::command]
pub fn cf_detect_packs(extra_paths: Option<Vec<String>>) -> Value {
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();

    // 1. Известные каталоги конкретных лаунчеров.
    for (root, source) in third_party_roots() {
        let Ok(read) = fs::read_dir(&root) else {
            continue;
        };
        for entry in read.flatten() {
            let path = entry.path();
            if path.is_dir() {
                candidates.push((path, source.to_string()));
            }
        }
    }

    // 2. Общий поиск по каталогам приложений: так находятся лаунчеры, которых
    //    нет в списке выше (MILIDA, TLauncher и прочие).
    for root in generic_roots() {
        for (path, source) in packscan::find_instances(&root) {
            candidates.push((path, source));
        }
    }

    // 3. Папки, которые игрок указал вручную.
    for raw in extra_paths.unwrap_or_default() {
        let dir = PathBuf::from(raw);
        if !dir.is_dir() {
            continue;
        }
        if packscan::is_instance(&dir) {
            let source = packscan::launcher_name(&dir);
            candidates.push((dir, source));
        } else {
            for (path, source) in packscan::find_instances(&dir) {
                candidates.push((path, source));
            }
        }
    }

    let mut found: Vec<Value> = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();
    let mut seen_names = std::collections::HashSet::new();

    for (path, source) in candidates {
        // Один и тот же путь не показываем дважды, даже если он найден и в
        // списке лаунчеров, и общим поиском.
        let key = fs::canonicalize(&path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());
        if !seen_paths.insert(key) {
            continue;
        }
        let Some(pack) = probe_instance(&path, &source) else {
            continue;
        };
        // Одинаковые по имени и версии сборки из разных лаунчеров — дубли.
        let name_key = format!(
            "{}|{}",
            pack["name"].as_str().unwrap_or("").to_lowercase(),
            pack["gameVersion"].as_str().unwrap_or("")
        );
        if !seen_names.insert(name_key) {
            continue;
        }
        found.push(pack);
    }

    json!({ "packs": found })
}

/// Копирование найденной сборки в папку лаунчера. Моды, конфиги и ресурспаки
/// переносятся как есть; исходная сборка остаётся на месте.
#[tauri::command]
pub fn cf_import_pack(
    source_path: String,
    name: String,
    game_version: String,
    loader: String,
) -> Result<Value, String> {
    let src = PathBuf::from(&source_path);
    if !src.is_dir() {
        return Err("Папка сборки не найдена".to_string());
    }

    // Игровые файлы лежат либо в корне сборки, либо во вложенной `minecraft`,
    // либо в `.minecraft` — как у MILIDA и похожих лаунчеров.
    let game_dir = packscan::game_dir(&src).ok_or("В папке нет файлов сборки")?;

    let target_name = guard::folder_name(&name)?;
    let dest = instance_dir(&target_name)?;
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let mut copied = 0usize;
    for sub in [
        "mods",
        "config",
        "resourcepacks",
        "shaderpacks",
        "defaultconfigs",
    ] {
        let from = game_dir.join(sub);
        if from.is_dir() {
            copy_dir_all(&from, &dest.join(sub))?;
            copied += 1;
        }
    }
    let options = game_dir.join("options.txt");
    if options.is_file() {
        let _ = fs::copy(&options, dest.join("options.txt"));
    }

    let mods = fs::read_dir(dest.join("mods"))
        .map(|d| d.flatten().filter(|e| e.path().is_file()).count())
        .unwrap_or(0);

    Ok(json!({
        "status": "success",
        "name": target_name,
        "gameVersion": game_version,
        "loader": loader,
        "mods": mods,
        "foldersCopied": copied
    }))
}

fn instance_dir(instance_id: &str) -> Result<PathBuf, String> {
    let name = guard::folder_name(instance_id)?;
    Ok(get_minecraft_root().join("versions").join(name))
}

/// Известные каталоги сборок сторонних лаунчеров.
fn third_party_roots() -> Vec<(PathBuf, &'static str)> {
    let mut roots: Vec<(PathBuf, &'static str)> = Vec::new();

    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let userprofile = std::env::var_os("USERPROFILE").map(PathBuf::from);

    if let Some(base) = &appdata {
        for (dir, source) in [
            ("PrismLauncher\\instances", "PrismLauncher"),
            ("MultiMC\\instances", "MultiMC"),
            ("PolyMC\\instances", "PolyMC"),
            ("ATLauncher\\instances", "ATLauncher"),
            (".technic\\modpacks", "Technic"),
            ("gdlauncher_next\\instances", "GDLauncher"),
            ("gdlauncher\\instances", "GDLauncher"),
            ("ModrinthApp\\profiles", "Modrinth App"),
            // MILIDA и похожие лаунчеры кладут сборки в собственные папки;
            // точное имя зависит от версии, поэтому пробуем частые варианты.
            ("net.millida.launcher\\minecraft\\profiles", "MILIDA"),
            (".justlauncher\\installations", "JustLauncher"),
            ("MILIDA Launcher\\instances", "MILIDA Launcher"),
            ("MILIDA\\instances", "MILIDA Launcher"),
            (".milida\\instances", "MILIDA Launcher"),
            ("TLauncher\\instances", "TLauncher"),
            ("SKLauncher\\instances", "SKLauncher"),
        ] {
            roots.push((base.join(dir), source));
        }
    }
    if let Some(base) = &userprofile {
        roots.push((
            base.join("curseforge").join("minecraft").join("Instances"),
            "CurseForge",
        ));
        roots.push((
            base.join("Documents")
                .join("curseforge")
                .join("minecraft")
                .join("Instances"),
            "CurseForge",
        ));
    }

    roots
}

/// Каталоги, которые просматриваются целиком: чужие лаунчеры называют папки
/// по-своему, и списком их не покрыть.
fn generic_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(base) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(base));
    }
    if let Some(base) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(base));
    }
    roots
}

/// Метаданные одной папки-сборки. Если версию или загрузчик определить нельзя,
/// поля остаются пустыми — интерфейс попросит выбрать их вручную.
fn probe_instance(path: &Path, source: &str) -> Option<Value> {
    // Папка игры: сама сборка, вложенная `minecraft` (CurseForge) или
    // `.minecraft` (MILIDA, TLauncher и похожие).
    let game_dir = packscan::game_dir(path)?;

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Без названия")
        .to_string();

    let mut game_version = String::new();
    let mut loader = String::new();
    let mut loader_version = String::new();

    // Prism/MultiMC: mmc-pack.json с компонентами.
    if let Ok(text) = fs::read_to_string(path.join("mmc-pack.json")) {
        if let Ok(meta) = serde_json::from_str::<Value>(&text) {
            if let Some(components) = meta["components"].as_array() {
                for c in components {
                    let uid = c["uid"].as_str().unwrap_or("");
                    let ver = c["version"].as_str().unwrap_or("").to_string();
                    match uid {
                        "net.minecraft" => game_version = ver,
                        "net.fabricmc.fabric-loader" => {
                            loader = "fabric".into();
                            loader_version = ver;
                        }
                        "org.quiltmc.quilt-loader" => {
                            loader = "quilt".into();
                            loader_version = ver;
                        }
                        "net.minecraftforge" => {
                            loader = "forge".into();
                            loader_version = ver;
                        }
                        "net.neoforged" => {
                            loader = "neoforge".into();
                            loader_version = ver;
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // CurseForge: minecraftinstance.json.
    if game_version.is_empty() {
        if let Ok(text) = fs::read_to_string(path.join("minecraftinstance.json")) {
            if let Ok(meta) = serde_json::from_str::<Value>(&text) {
                game_version = meta["gameVersion"].as_str().unwrap_or("").to_string();
                let base = meta["baseModLoader"]["name"].as_str().unwrap_or("");
                let lower = base.to_ascii_lowercase();
                for known in ["neoforge", "forge", "fabric", "quilt"] {
                    if lower.starts_with(known) {
                        loader = known.to_string();
                        loader_version = lower.split('-').next_back().unwrap_or("").to_string();
                        break;
                    }
                }
            }
        }
    }

    // ATLauncher и похожие: instance.json с вложенной version.
    if game_version.is_empty() {
        for meta_name in ["instance.json", "instance.cfg.json", "modpack.json"] {
            let Ok(text) = fs::read_to_string(path.join(meta_name)) else {
                continue;
            };
            let Ok(meta) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            if let Some(v) = meta["version"]["minecraft"].as_str() {
                game_version = v.to_string();
            } else if let Some(v) = meta["minecraft"]["version"].as_str() {
                game_version = v.to_string();
            }
            if let Some(l) = meta["version"]["loader"].as_str() {
                loader = l.to_ascii_lowercase();
                loader_version = meta["version"]["loaderVersion"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
            }
            if !game_version.is_empty() {
                break;
            }
        }
    }

    // MILIDA: у каждой сборки свой `millida-settings.json`.
    if game_version.is_empty() {
        if let Ok(text) = fs::read_to_string(path.join("millida-settings.json")) {
            if let Some(meta) = packscan::parse_millida_settings(&text) {
                game_version = meta.game_version;
                loader = meta.loader;
                loader_version = meta.loader_version;
            }
        }
    }

    // JustLauncher: список установок лежит на уровень выше папки сборки.
    if game_version.is_empty() {
        let folder = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        let installs_json = path
            .parent()
            .and_then(|instances| instances.parent())
            .map(|base| base.join("installations.json"));
        if let Some(meta_path) = installs_json {
            if let Ok(text) = fs::read_to_string(meta_path) {
                let meta = packscan::parse_justlauncher_installations(&text)
                    .into_iter()
                    .find(|(id, _)| id == &folder)
                    .map(|(_, meta)| meta);
                if let Some(meta) = meta {
                    game_version = meta.game_version;
                    loader = meta.loader;
                    loader_version = meta.loader_version;
                }
            }
        }
    }

    let mods = fs::read_dir(game_dir.join("mods"))
        .map(|d| {
            d.flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .map(|x| x.eq_ignore_ascii_case("jar") || x == "disabled")
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0);

    let _ = loader_name(1); // держим импорт в связке с остальными карточками

    Some(json!({
        "source": source,
        "path": path.to_string_lossy(),
        "name": name,
        "gameVersion": game_version,
        "loader": loader,
        "loaderVersion": loader_version,
        "mods": mods
    }))
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
