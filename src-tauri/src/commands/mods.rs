use crate::utils::content::{self, ContentEntry};
use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::modmeta;
use crate::utils::paths::*;
use crate::utils::search;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

fn get_instance_dir(instance_id: &str) -> PathBuf {
    get_minecraft_root().join("versions").join(instance_id)
}

/// Папка сборки по имени из интерфейса.
///
/// Без проверки имени `..\..` превращает любую команду — удаление, переименование,
/// запись мода — в действие над произвольным каталогом.
fn instance_dir(instance_id: &str) -> Result<PathBuf, String> {
    let name = guard::folder_name(instance_id)?;
    Ok(get_instance_dir(&name))
}

/// Найти файл сборки по имени из интерфейса: список присылает название без
/// хвоста `.disabled`, а на диске выключенный элемент лежит с ним.
///
/// Папки сборки (`mods`, `resourcepacks`, `shaderpacks`) перебирает
/// `content::find_entry`: по имени отличить шейдер от ресурспака нельзя.
fn locate(instance: &std::path::Path, name: &str) -> Option<ContentEntry> {
    content::find_entry(instance, name)
        .or_else(|| content::find_entry(instance, &format!("{}.disabled", name)))
}

#[tauri::command]
pub fn get_installed_mods(instance_id: String) -> Value {
    let Ok(instance) = instance_dir(&instance_id) else {
        return serde_json::json!([]);
    };

    // Тип берётся из папки, в которой лежит файл, — это единственный надёжный
    // источник: по имени отличить шейдер от ресурспака нельзя.
    let items: Vec<Value> = content::scan_instance(&instance)
        .into_iter()
        .map(|entry| {
            serde_json::json!({
                "id": entry.file_name,
                "title": entry.title,
                "type": entry.kind,
                "isLocal": true,
                "isEnabled": entry.is_enabled
            })
        })
        .collect();
    serde_json::json!(items)
}

#[tauri::command]
pub fn toggle_mod(filename: String, instance_id: String, enable: bool) -> Result<(), String> {
    let instance = instance_dir(&instance_id)?;
    let clean_name = guard::file_name(&filename.replace(".disabled", ""))?;

    // Ресурспак и шейдер включаются так же, как мод, но лежат в своей папке:
    // раньше переключатель искал файл только в `mods` и молча ничего не делал.
    let entry = locate(&instance, &clean_name)
        .ok_or_else(|| format!("Файл {} не найден в сборке", clean_name))?;

    let enabled_path = instance.join(entry.folder).join(&entry.title);
    let disabled_path = instance
        .join(entry.folder)
        .join(format!("{}.disabled", entry.title));

    if enable {
        if disabled_path.exists() {
            fs::rename(&disabled_path, &enabled_path).map_err(|e| e.to_string())?;
        }
    } else if enabled_path.exists() {
        fs::rename(&enabled_path, &disabled_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn uninstall_mod(filename: String, instance_id: String) -> Result<Value, String> {
    let instance = instance_dir(&instance_id)?;
    let name = guard::file_name(&filename)?;
    let Some(entry) = locate(&instance, &name) else {
        return Ok(serde_json::json!({ "status": "not_found" }));
    };

    // Распакованный пак — папка, её удаляют целиком.
    if entry.is_dir {
        fs::remove_dir_all(&entry.path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&entry.path).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub fn delete_modpack_folder(instance_id: String) -> Result<Value, String> {
    // Имя — одна папка внутри versions: `..` сюда не проходит, а значит
    // удалить чужой каталог этой командой нельзя.
    let path = instance_dir(&instance_id)?;
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("Не удалось удалить папку сборки: {}", e))?;
    }
    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub fn rename_modpack_folder(old_name: String, new_name: String) -> Result<Value, String> {
    let old_path = instance_dir(&old_name)?;
    let new_path = instance_dir(&new_name)?;

    // Папки может ещё не быть: сборка создаётся записью в modpacks.json, а
    // каталог в versions/ появляется только при установке мода или запуске.
    // Переименовывать в этом случае нечего, но это не ошибка — иначе смена
    // названия свежесозданной сборки не сохранялась бы вовсе.
    if !old_path.exists() {
        return Ok(serde_json::json!({ "status": "success" }));
    }
    if new_path.exists() {
        return Err("Папка уже существует".to_string());
    }
    fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub fn import_mod_file(
    file_name: String,
    buffer: Vec<u8>,
    instance_id: Option<String>,
) -> Result<Value, String> {
    let id = match instance_id {
        Some(id) => guard::folder_name(&id)?,
        None => "default".to_string(),
    };

    // Берём только имя без пути: `..` в исходном имени увёл бы запись наружу,
    // за пределы папки сборки.
    let bare = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Некорректное имя файла".to_string())?;
    let name = guard::file_name(bare)?;

    // `.zip` — это пак, а не мод: в `mods/` его не видит ни один список,
    // поэтому раскладываем по папкам, которые игра действительно читает.
    // Шейдер отличается содержимым (папка `shaders/`), а не именем файла.
    let folder = if name.to_lowercase().ends_with(".zip") {
        match modmeta::detect_pack_kind_bytes(&buffer) {
            Some(modmeta::PackKind::Shader) => "shaderpacks",
            _ => "resourcepacks",
        }
    } else {
        "mods"
    };
    let target_dir = get_instance_dir(&id).join(folder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let target = target_dir.join(&name);
    fs::write(target, buffer).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "status": "ok" }))
}

/// Названия и иконки модов, лежащих в папке сборки.
///
/// Имя файла (`worldedit-mod-7.2.15.jar`) игроку ничего не говорит, поэтому
/// список берёт данные из манифеста внутри jar: человеческое название, версия
/// и логотип. Иконки отдаём data-URL — их немного и они мелкие, а отдельный
/// протокол для картинок в CSP лаунчера не открыт.
///
/// `files` — список имён файлов для разбора. Фронтенд просит их пачками:
/// разбор сотни jar за один вызов подвешивал окно на несколько секунд, а так
/// список наполняется по мере готовности и интерфейс не блокируется.
/// Если список не передан, разбирается вся папка (прежнее поведение).
#[tauri::command]
pub fn get_mods_metadata(instance_id: String, files: Option<Vec<String>>) -> Result<Value, String> {
    let id = guard::folder_name(&instance_id)?;
    let instance = get_instance_dir(&id);

    let mut items: Vec<Value> = Vec::new();
    // Предел на иконки в одном ответе: даже пачка не должна раздуваться.
    let mut icon_budget: usize = 2 * 1024 * 1024;

    let targets: Vec<String> = match files {
        Some(list) => list,
        None => content::scan_instance(&instance)
            .into_iter()
            .map(|entry| entry.file_name)
            .collect(),
    };

    for file in targets {
        // Имя пришло из вебвью: `content::find_entry` пускает только «голое»
        // имя, иначе `..` увёл бы чтение за пределы папки сборки.
        let Some(entry) = locate(&instance, &file) else {
            continue;
        };

        // У ресурспака и шейдерпака нет манифеста загрузчика: название берём
        // из `pack.mcmeta`, иконку — из `pack.png`. Распакованный пак читается
        // из папки теми же двумя файлами.
        let meta = if entry.kind == "mod" {
            modmeta::read_mod_meta(&entry.path)
        } else if entry.is_dir {
            modmeta::read_pack_meta_dir(&entry.path)
        } else {
            modmeta::read_pack_meta(&entry.path)
        };
        let Some(meta) = meta else {
            continue;
        };

        let icon = meta
            .icon
            .filter(|icon| icon.bytes.len() <= icon_budget)
            .map(|icon| {
                icon_budget = icon_budget.saturating_sub(icon.bytes.len());
                format!("data:{};base64,{}", icon.mime, BASE64.encode(&icon.bytes))
            });

        items.push(serde_json::json!({
            "file": file,
            "name": meta.name,
            "modId": meta.mod_id,
            "version": meta.version,
            "icon": icon,
            "type": entry.kind
        }));
    }

    Ok(serde_json::json!({ "items": items }))
}

/// Импорт файлов, перетащенных в окно.
///
/// WebView2 не отдаёт странице файловые `drop`-события — их перехватывает
/// Tauri и присылает только пути. Гонять содержимое jar через IPC массивом
/// байтов (как `import_mod_file`) для 10–50 МБ бессмысленно, поэтому файл
/// копируется на месте, а во фронтенд уходит лишь результат.
#[tauri::command]
pub fn import_mod_paths(paths: Vec<String>, instance_id: String) -> Result<Value, String> {
    let id = guard::folder_name(&instance_id)?;
    let instance = get_instance_dir(&id);

    let mut imported: Vec<String> = Vec::new();
    let mut rejected: Vec<String> = Vec::new();

    for raw in paths {
        let source = std::path::Path::new(&raw);
        // Имя берём только как имя: путь из внешней программы может содержать
        // что угодно, а попадает оно в папку сборки.
        let Some(raw_name) = source.file_name().and_then(|n| n.to_str()) else {
            rejected.push(raw.clone());
            continue;
        };
        let lower = raw_name.to_lowercase();
        if !source.is_file() || !(lower.ends_with(".jar") || lower.ends_with(".zip")) {
            rejected.push(raw_name.to_string());
            continue;
        }

        let name = guard::file_name(raw_name)?;
        // Та же раскладка, что и у `import_mod_file`: zip — пак, и шейдер
        // отличается содержимым, а не именем файла.
        let folder = if name.to_lowercase().ends_with(".zip") {
            match modmeta::detect_pack_kind(source) {
                Some(modmeta::PackKind::Shader) => "shaderpacks",
                _ => "resourcepacks",
            }
        } else {
            "mods"
        };
        let target_dir = instance.join(folder);
        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Не удалось создать папку {}: {}", target_dir.display(), e))?;

        fs::copy(source, target_dir.join(&name))
            .map_err(|e| format!("Не удалось скопировать {}: {}", name, e))?;
        imported.push(name);
    }

    Ok(serde_json::json!({
        "status": "ok",
        "imported": imported,
        "rejected": rejected
    }))
}

/// Общий поиск Modrinth. Категория — отдельный необязательный фасет: её
/// передают только списки сборок, поэтому у команды `search_mods` она пустая.
async fn search_modrinth(
    query: &str,
    loader: &str,
    version: &str,
    offset: u32,
    project_type: &str,
    sort: &str,
    category: &str,
) -> Result<Value, String> {
    let client = reqwest::Client::new();
    // Фасеты собирает `search::modrinth_facets`: загрузчик относится только к
    // модам и сборкам, иначе каталог шейдеров и ресурспаков остаётся пустым.
    let facets = search::modrinth_facets(project_type, loader, version, category);

    let facets_query = if facets.is_empty() {
        "".to_string()
    } else {
        format!("&facets=[{}]", facets.join(","))
    };

    let url = format!(
        "https://api.modrinth.com/v2/search?query={}&limit=20&offset={}&index={}{}",
        urlencoding::encode(query),
        offset,
        sort,
        facets_query
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn search_mods(
    query: String,
    loader: String,
    version: String,
    offset: u32,
    project_type: String,
    sort: String,
) -> Result<Value, String> {
    search_modrinth(&query, &loader, &version, offset, &project_type, &sort, "").await
}

#[tauri::command]
pub async fn get_popular_mods(
    loader: String,
    version: String,
    offset: u32,
) -> Result<Value, String> {
    search_mods(
        "".to_string(),
        loader,
        version,
        offset,
        "mod".to_string(),
        "downloads".to_string(),
    )
    .await
}

#[tauri::command]
pub async fn get_popular_modpacks(
    version: Option<String>,
    offset: u32,
    category: String,
    loader: String,
    sort: String,
) -> Result<Value, String> {
    search_modrinth(
        "",
        &loader,
        &version.unwrap_or_default(),
        offset,
        "modpack",
        &sort,
        &category,
    )
    .await
}

#[tauri::command]
pub async fn search_modpacks(
    query: String,
    version: Option<String>,
    offset: u32,
    category: String,
    loader: String,
    sort: String,
) -> Result<Value, String> {
    search_modrinth(
        &query,
        &loader,
        &version.unwrap_or_default(),
        offset,
        "modpack",
        &sort,
        &category,
    )
    .await
}

/// Одна версия мода с Modrinth: выбор подходящей версии, проверка имени/хеша и
/// скачивание файла. Возвращает имя установленного файла и обязательные
/// зависимости в виде `(project_id, version_id)`.
async fn install_mod_version(
    client: &reqwest::Client,
    project_id: &str,
    version_id: Option<&str>,
    game_version: &str,
    loader: &str,
    p_type: &str,
    instance: &std::path::Path,
    folder: &str,
) -> Result<(String, Vec<(String, Option<String>)>), String> {
    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
    let resp = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let versions: Value = resp.json().await.map_err(|e| e.to_string())?;
    let versions_arr = versions
        .as_array()
        .ok_or("Некорректный ответ Modrinth со списком версий")?;

    let target_ver = if let Some(want_id) = version_id {
        // Версию выбрал игрок: ставим именно её, фасеты здесь не применяем.
        versions_arr
            .iter()
            .find(|v| v["id"].as_str() == Some(want_id))
            .ok_or_else(|| "Выбранная версия мода не найдена в Modrinth".to_string())?
    } else {
        // `all` и пустая строка — это отсутствие фильтра по признаку.
        let want_version = !game_version.is_empty() && game_version != "all";
        // Загрузчик есть только у модов: у шейдеров и ресурспаков его нет.
        let want_loader = p_type == "mod" && !loader.is_empty() && loader != "all";

        versions_arr
            .iter()
            .find(|v| {
                let game_ver_match = !want_version
                    || v["game_versions"]
                        .as_array()
                        .map(|arr| {
                            arr.iter().any(|g| {
                                g.as_str()
                                    .map(|s| s.eq_ignore_ascii_case(game_version))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                let loader_match = !want_loader
                    || v["loaders"]
                        .as_array()
                        .map(|arr| {
                            arr.iter().any(|l| {
                                l.as_str()
                                    .map(|s| s.eq_ignore_ascii_case(loader))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                game_ver_match && loader_match
            })
            .ok_or_else(|| {
                let mut wanted = format!("Minecraft {}", game_version);
                if want_loader {
                    wanted.push_str(&format!(" и загрузчиком {}", loader));
                }
                format!("Нет версии мода, совместимой с {}", wanted)
            })?
    };

    let files = target_ver["files"]
        .as_array()
        .filter(|f| !f.is_empty())
        .ok_or("В файлах версии мода нет загрузок")?;
    // Основной файл помечен primary; если метки нет — берём первый, но только
    // когда список действительно не пустой.
    let file_info = files
        .iter()
        .find(|f| f["primary"].as_bool().unwrap_or(false))
        .unwrap_or(&files[0]);

    let download_url = file_info["url"]
        .as_str()
        .ok_or("В файле версии мода нет ссылки")?;
    let filename = file_info["filename"]
        .as_str()
        .ok_or("В файле версии мода нет имени")?;

    let name = guard::file_name(filename)?;
    let dest = instance.join(folder).join(&name);

    // Modrinth отдаёт хеши рядом со ссылкой: сверяем, иначе подменённый или
    // недокачанный файл попадёт в игру как обычный мод.
    let hashes = &file_info["hashes"];
    let sum = Sum::sha512(hashes["sha512"].as_str().unwrap_or(""))
        .or_else(|| Sum::sha1(hashes["sha1"].as_str().unwrap_or("")));

    ensure_file_with(client, download_url, &dest, sum).await?;

    let mut deps = Vec::new();
    if let Some(list) = target_ver["dependencies"].as_array() {
        for dep in list {
            if dep["dependency_type"].as_str() != Some("required") {
                continue;
            }
            if let Some(dep_id) = dep["project_id"].as_str() {
                let dep_ver = dep["version_id"].as_str().map(|s| s.to_string());
                deps.push((dep_id.to_string(), dep_ver));
            }
        }
    }

    Ok((name, deps))
}

#[tauri::command]
pub async fn download_mod(
    app: AppHandle,
    project_id: String,
    version: String,
    loader: String,
    instance_id: String,
    project_type: Option<String>,
    version_id: Option<String>,
) -> Result<Value, String> {
    let p_type = project_type.unwrap_or_else(|| "mod".to_string());
    let _ = app.emit(
        "download-update",
        serde_json::json!({
            "id": format!("mod_{}", project_id),
            "name": &project_id,
            "text": format!("Скачивание {}...", p_type),
            "progress": 20
        }),
    );

    let folder = if p_type == "resourcepack" {
        "resourcepacks"
    } else if p_type == "shader" {
        "shaderpacks"
    } else {
        "mods"
    };

    let instance = instance_dir(&instance_id)?;
    let client = reqwest::Client::new();

    // Основной файл: его ошибка отменяет установку целиком.
    let (main_file, deps) = install_mod_version(
        &client,
        &project_id,
        version_id.as_deref(),
        &version,
        &loader,
        &p_type,
        &instance,
        folder,
    )
    .await?;

    let mut filenames = vec![main_file];
    let mut warnings = Vec::new();

    // Обязательные зависимости ставим тем же способом, но их ошибки только
    // собираем в warnings: сам мод уже установлен.
    let mut visited = HashSet::new();
    visited.insert(project_id.clone());
    let mut pending: Vec<(String, Option<String>, u32)> =
        deps.into_iter().map(|(id, ver)| (id, ver, 1u32)).collect();

    while let Some((dep_id, dep_ver, depth)) = pending.pop() {
        // Глубже третьего уровня не идём, повторно один проект не качаем —
        // иначе циклические зависимости крутят установку бесконечно.
        if depth > 3 || !visited.insert(dep_id.clone()) {
            continue;
        }
        let _ = app.emit(
            "download-update",
            serde_json::json!({
                "id": format!("mod_{}", project_id),
                "name": &project_id,
                "text": format!("Установка зависимости {}...", dep_id),
                "progress": 40
            }),
        );

        match install_mod_version(
            &client,
            &dep_id,
            dep_ver.as_deref(),
            &version,
            &loader,
            "mod",
            &instance,
            "mods",
        )
        .await
        {
            Ok((file, sub_deps)) => {
                filenames.push(file);
                for (id, ver) in sub_deps {
                    pending.push((id, ver, depth + 1));
                }
            }
            Err(e) => warnings.push(format!("Зависимость «{}» не установлена: {}", dep_id, e)),
        }
    }

    let _ = app.emit(
        "download-update",
        serde_json::json!({
            "id": format!("mod_{}", project_id),
            "name": &project_id,
            "text": "Установка завершена",
            "progress": 100
        }),
    );
    let _ = app.emit("download-finish", format!("mod_{}", project_id));

    Ok(serde_json::json!({
        "status": "success",
        "filenames": filenames,
        "warnings": warnings
    }))
}

#[tauri::command]
pub async fn install_optifine(
    app: AppHandle,
    game_version: String,
    instance_id: String,
) -> Result<Value, String> {
    let _ = app.emit("launch-progress", "Поиск OptiFine...");
    let client = reqwest::Client::new();
    let res = client
        .get("https://bmclapi2.bangbang93.com/optifine/versionList")
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let list: Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(arr) = list.as_array() {
            let compatible: Vec<&Value> = arr
                .iter()
                .filter(|v| v["mcversion"].as_str() == Some(&game_version))
                .collect();
            if let Some(target) = compatible.last() {
                let filename = target["filename"]
                    .as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("OptiFine_{}.jar", game_version));
                let dl_url = format!(
                    "https://bmclapi2.bangbang93.com/optifine/{}/{}/{}",
                    target["mcversion"].as_str().unwrap_or(&game_version),
                    target["type"].as_str().unwrap_or("HD_U"),
                    target["patch"].as_str().unwrap_or("G5")
                );

                let instance = instance_dir(&instance_id)?;
                let name = guard::file_name(&filename)
                    .unwrap_or_else(|_| format!("OptiFine_{}.jar", game_version));
                let dest = instance.join("mods").join(&name);
                // У BMCLAPI в списке версий хешей нет, поэтому только сама
                // загрузка: ошибку больше не глотаем.
                ensure_file(&dl_url, &dest, None).await?;

                let _ = app.emit("launch-progress", "OptiFine установлен!");
                // Путь инстанса проверен в instance_dir, имя файла — в
                // guard::file_name выше; отдаём оба поля: filename и filenames.
                return Ok(serde_json::json!({
                    "status": "success",
                    "filename": name,
                    "filenames": [name]
                }));
            }
        }
    }

    Err("Подходящая версия OptiFine не найдена".to_string())
}

#[tauri::command]
pub async fn install_modpack(
    app: AppHandle,
    project_id: String,
    game_version: String,
    loader: String,
    modpack_name: String,
    // Конкретный релиз из вкладки «Версии». Пусто — брать по версии игры и
    // загрузчику, как раньше. Нужен, чтобы можно было поставить старую сборку.
    version_id: Option<String>,
) -> Result<Value, String> {
    let _ = app.emit(
        "launch-progress",
        format!("Получение версий сборок {}...", project_id),
    );
    let client = reqwest::Client::new();
    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
    let resp = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let versions: Value = resp.json().await.map_err(|e| e.to_string())?;
    let versions_arr = versions.as_array().ok_or("Invalid versions")?;

    // `all` и пустая строка — «не фильтровать по этому признаку».
    let want_gv = !game_version.is_empty() && game_version != "all";
    let want_loader = !loader.is_empty() && loader != "all";

    // Версия по id из карточки сборки важнее фильтров: игрок явно выбрал релиз.
    let wanted_version = version_id
        .as_deref()
        .map(str::trim)
        .filter(|v: &&str| !v.is_empty() && *v != "all");

    let matched = match wanted_version {
        Some(id) => versions_arr
            .iter()
            .find(|v| v["id"].as_str().map(|s| s == id).unwrap_or(false)),
        None => versions_arr.iter().find(|v| {
            let gv = !want_gv
                || v["game_versions"]
                    .as_array()
                    .map(|a| {
                        a.iter().any(|g| {
                            g.as_str()
                                .map(|s| s.eq_ignore_ascii_case(&game_version))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);
            let lv = !want_loader
                || v["loaders"]
                    .as_array()
                    .map(|a| {
                        a.iter().any(|l| {
                            l.as_str()
                                .map(|s| s.eq_ignore_ascii_case(&loader))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);
            gv && lv
        }),
    };

    // Первую попавшуюся версию не подставляем: сборка под другую версию игры
    // скачается молча и просто не запустится.
    let target_ver = matched.ok_or_else(|| {
        if let Some(id) = wanted_version {
            return format!("Не нашлась версия сборки {} на Modrinth", id);
        }
        let mut wanted = Vec::new();
        if want_gv {
            wanted.push(format!("Minecraft {}", game_version));
        }
        if want_loader {
            wanted.push(format!("загрузчик {}", loader));
        }
        if wanted.is_empty() {
            "В проекте нет ни одной версии сборки".to_string()
        } else {
            format!("Нет сборки, совместимой с {}", wanted.join(" и "))
        }
    })?;

    let files = target_ver["files"]
        .as_array()
        .filter(|f| !f.is_empty())
        .ok_or("В версии сборки нет файлов для скачивания")?;
    let file = files
        .iter()
        .find(|f| f["primary"].as_bool().unwrap_or(false))
        .unwrap_or(&files[0]);
    let mrpack_url = file["url"].as_str().ok_or("В файле сборки нет ссылки")?;

    // Имя сборки — это имя папки внутри versions, поэтому проверяем его до
    // того, как что-то создавать: `..` или `C:` увели бы установку в сторону.
    let pack_dir_name = guard::folder_name(&modpack_name)?;

    // Хеш архива Modrinth присылает вместе со ссылкой. Без сверки подменённый
    // архив распаковывается прямо в папку игры.
    let pack_hash = &file["hashes"];
    let pack_sum = Sum::sha512(pack_hash["sha512"].as_str().unwrap_or(""))
        .or_else(|| Sum::sha1(pack_hash["sha1"].as_str().unwrap_or("")));

    let temp_dir = std::env::temp_dir().join(format!(
        "mrpack_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    let mrpack_path = temp_dir.join("modpack.mrpack");

    let _ = app.emit("launch-progress", "Скачивание архива модпака...");
    ensure_file(mrpack_url, &mrpack_path, pack_sum).await?;

    let _ = app.emit("launch-progress", "Распаковка модпака...");
    extract_zip_archive(&mrpack_path, &temp_dir)?;

    let index_path = temp_dir.join("modrinth.index.json");
    if !index_path.exists() {
        return Err(
            "Неверный формат Modrinth модпака: отсутствует modrinth.index.json".to_string(),
        );
    }

    let index_content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index_data: Value = serde_json::from_str(&index_content).map_err(|e| e.to_string())?;

    let instance_path = instance_dir(&pack_dir_name)?;

    // Переустановка сборки в ту же папку: старые `mods` и `config` удаляем,
    // иначе рядом с новыми файлами останутся прежние jar (две версии одного
    // мода сразу), а конфиги прошлой версии могут не подойти новой.
    if instance_path.join("mods").exists() {
        for stale in ["mods", "config"] {
            let path = instance_path.join(stale);
            if path.exists() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Не удалось удалить старую папку «{}»: {}", stale, e))?;
            }
        }
    }

    fs::create_dir_all(&instance_path)
        .map_err(|e| format!("Не удалось создать папку сборки «{}»: {}", pack_dir_name, e))?;

    if let Some(files_to_download) = index_data["files"].as_array() {
        let total = files_to_download.len();
        for (idx, f) in files_to_download.iter().enumerate() {
            // Серверная часть мода в клиенте не работает и может ломать запуск,
            // поэтому файлы с `env.client == "unsupported"` не качаем. Если
            // блока `env` нет, автор ограничений не указал — ставим как обычно.
            if f["env"]["client"].as_str() == Some("unsupported") {
                continue;
            }
            if let Some(downloads) = f["downloads"].as_array() {
                if let Some(dl_url) = downloads.first().and_then(|u| u.as_str()) {
                    // Путь в модпаке пишет автор сборки, а не мы: `../` в нём
                    // означал бы запись за пределы папки сборки.
                    let rel = guard::relative_under(f["path"].as_str().unwrap_or(""))?;
                    let dest = instance_path.join(&rel);

                    // sha1/sha512 лежат рядом со ссылкой в modrinth.index.json.
                    let hashes = &f["hashes"];
                    let sum = Sum::sha512(hashes["sha512"].as_str().unwrap_or(""))
                        .or_else(|| Sum::sha1(hashes["sha1"].as_str().unwrap_or("")));

                    let progress = ((idx + 1) * 100) / total;
                    let _ = app.emit(
                        "download-update",
                        serde_json::json!({
                            "id": format!("modpack_{}", modpack_name),
                            "name": &modpack_name,
                            "text": format!("Файл {} из {}", idx + 1, total),
                            "progress": progress
                        }),
                    );

                    ensure_file(dl_url, &dest, sum).await?;
                }
            }
        }
    }

    // Copy overrides
    for override_dir in ["overrides", "client-overrides"] {
        let src = temp_dir.join(override_dir);
        if src.exists() {
            copy_dir_all(&src, &instance_path)
                .map_err(|e| format!("Не удалось скопировать файлы сборки: {}", e))?;
        }
    }

    let _ = fs::remove_dir_all(&temp_dir);
    let _ = app.emit("download-finish", format!("modpack_{}", modpack_name));
    let _ = app.emit("launch-progress", "Установка модпака завершена!");

    // Итоговые версия игры и загрузчик: в приоритете `dependencies` из
    // modrinth.index.json — именно по ним лаунчер собирает запуск сборки.
    // Поля версии проекта берём, только если индекс об этом молчит.
    let index_deps = index_data["dependencies"].as_object();
    let dep_str = |key: &str| -> Option<String> {
        index_deps
            .and_then(|m| m.get(key))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };

    // В индексе загрузчики записаны как `fabric-loader`/`quilt-loader`,
    // а лаунчер ждёт имена `fabric`/`quilt`.
    let loader_from_index = [
        ("fabric-loader", "fabric"),
        ("quilt-loader", "quilt"),
        ("neoforge", "neoforge"),
        ("forge", "forge"),
    ]
    .into_iter()
    .find_map(|(key, name)| dep_str(key).map(|_| name.to_string()));

    let actual_gv = dep_str("minecraft").unwrap_or_else(|| {
        target_ver["game_versions"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .unwrap_or(&game_version)
            .to_string()
    });
    let actual_loader = loader_from_index.unwrap_or_else(|| {
        target_ver["loaders"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .unwrap_or(&loader)
            .to_string()
    });

    Ok(serde_json::json!({
        "status": "success",
        "gameVersion": actual_gv,
        "actualLoader": actual_loader
    }))
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}
