use crate::utils::archive;
use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::paths::*;
use futures_util::stream::{self, StreamExt};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

pub fn should_include_library(lib: &Value) -> bool {
    let current_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };

    let current_arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        "x86"
    };

    // 1. Check rules if present
    if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
        let mut action = false;
        for rule in rules {
            let rule_action = rule["action"].as_str() == Some("allow");
            if let Some(os) = rule.get("os") {
                let mut os_match = true;
                if let Some(name) = os.get("name").and_then(|n| n.as_str()) {
                    if name != current_os {
                        os_match = false;
                    }
                }
                if let Some(arch) = os.get("arch").and_then(|a| a.as_str()) {
                    let arch_match = match arch {
                        "arm64" | "aarch64" => current_arch == "arm64",
                        "x64" | "x86_64" => current_arch == "x86_64",
                        "x86" => current_arch == "x86",
                        _ => false,
                    };
                    if !arch_match {
                        os_match = false;
                    }
                }
                if os_match {
                    action = rule_action;
                }
            } else {
                action = rule_action;
            }
        }
        if !action {
            return false;
        }
    }

    // 2. Reject architecture mismatches based on path / name (critical for LWJGL 3.4+ / Snapshots)
    let path_str = lib
        .get("downloads")
        .and_then(|d| d.get("artifact"))
        .and_then(|a| a.get("path"))
        .and_then(|p| p.as_str())
        .unwrap_or("");
    let name_str = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");

    let is_arm64 = path_str.contains("arm64")
        || path_str.contains("aarch64")
        || name_str.contains("arm64")
        || name_str.contains("aarch64");
    let is_x86_32 = path_str.contains("-x86.")
        || path_str.contains("natives-windows-x86")
        || name_str.contains("natives-windows-x86");

    if current_arch == "x86_64" {
        if is_arm64 || is_x86_32 {
            return false;
        }
    } else if current_arch == "arm64" {
        if !is_arm64 && (path_str.contains("natives-") || name_str.contains("natives-")) {
            return false;
        }
    }

    true
}

pub async fn ensure_client_jar(
    app: &AppHandle,
    version_id: &str,
    version_json: &Value,
) -> Result<PathBuf, String> {
    let root = get_minecraft_root();
    // version_id приходит из интерфейса и становится именем папки: без проверки
    // `..\..` уводит и папку, и файл клиента куда угодно.
    let safe_id = crate::utils::guard::folder_name(version_id)?;
    let version_dir = root.join("versions").join(&safe_id);
    let client_jar = version_dir.join(format!("{}.jar", safe_id));

    let client = version_json.get("downloads").and_then(|d| d.get("client"));
    let client_url = client.and_then(|c| c.get("url")).and_then(|u| u.as_str());
    // Размер рядом с хешем: по нему клиент проверяется без чтения 20+ МБ.
    let client_size = client.and_then(|c| c.get("size")).and_then(|v| v.as_u64());
    let client_sum = client
        .and_then(|c| c.get("sha1"))
        .and_then(|s| s.as_str())
        .and_then(Sum::sha1)
        .map(|s| s.with_size(client_size));

    match client_url {
        Some(url) => {
            // Текст про скачивание — только когда файла действительно нет.
            if !client_jar.is_file() {
                let _ = app.emit(
                    "launch-progress",
                    format!("Скачивание клиента Minecraft {}...", safe_id),
                );
            }
            ensure_file(url, &client_jar, client_sum).await?;
        }
        // Без ссылки скачивать нечего: молча вернуть несуществующий путь —
        // значит уронить игру позже и с непонятной ошибкой.
        None if !client_jar.is_file() => {
            return Err(format!(
                "В манифесте версии {} нет ссылки на клиент",
                safe_id
            ));
        }
        None => {}
    }

    Ok(client_jar)
}

/// Классификатор natives для текущей ОС (например `natives-windows-64`).
fn natives_classifier(lib: &Value) -> Option<String> {
    let os_key = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    let raw = lib.get("natives")?.get(os_key)?.as_str()?;
    let arch = if cfg!(target_arch = "x86") {
        "32"
    } else {
        "64"
    };
    Some(raw.replace("${arch}", arch))
}

/// Какой jar с natives нужен этой библиотеке.
///
/// Обычно он назван в поле `natives`, но встречаются манифесты, где поля нет,
/// а natives лежат в `downloads.classifiers` под привычным ключом ОС.
fn native_jar_classifier(lib: &Value, native_key: &str) -> Option<String> {
    if let Some(classifier) = natives_classifier(lib) {
        return Some(classifier);
    }
    lib.get("downloads")
        .and_then(|d| d.get("classifiers"))
        .and_then(|c| c.get(native_key))
        .map(|_| native_key.to_string())
}

/// Сколько библиотек качаем одновременно. Сотня соединений упрётся в лимиты
/// сервера, а восемь уже убирают основную часть ожидания.
const LIBRARY_DOWNLOAD_CONCURRENCY: usize = 8;

/// Jar с natives, который надо распаковать после загрузки.
struct NativeJar {
    path: PathBuf,
    /// Имя классификатора — только для текста ошибки.
    label: String,
}

/// Результат обработки одной библиотеки.
struct LibraryOutcome {
    /// Место в `libraries`: по нему восстанавливается порядок classpath.
    index: usize,
    classpath: Vec<PathBuf>,
    natives: Vec<NativeJar>,
}

fn current_native_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "natives-windows"
    } else if cfg!(target_os = "macos") {
        "natives-osx"
    } else {
        "natives-linux"
    }
}

pub async fn download_version_libraries(
    _app: &AppHandle,
    version_json: &Value,
    natives_dir: &Path,
) -> Result<Vec<PathBuf>, String> {
    let root = get_minecraft_root();
    let libraries_dir = root.join("libraries");
    fs::create_dir_all(&libraries_dir)
        .map_err(|e| format!("Не удалось создать папку libraries: {}", e))?;

    let libraries = match version_json.get("libraries").and_then(|l| l.as_array()) {
        Some(l) => l,
        None => return Ok(Vec::new()),
    };

    // Один клиент на все загрузки: общий пул соединений вместо нового на файл.
    let client = reqwest::Client::new();
    let native_key = current_native_key();

    // Библиотеки клонируем заранее: async-блок с заимствованным `&Value`
    // ломает вывод временем жизни в обёртке Tauri (`FnOnce is not general
    // enough`), а манифест небольшой.
    let items: Vec<(usize, Value)> = libraries
        .iter()
        .enumerate()
        .filter(|(_, lib)| should_include_library(lib))
        .map(|(index, lib)| (index, lib.clone()))
        .collect();

    let mut tasks = stream::iter(items)
        .map(|(index, lib)| {
            let client = &client;
            let libraries_dir = &libraries_dir;
            async move {
                let label = lib
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("без имени");
                download_one_library(client, &lib, libraries_dir, native_key, index)
                    .await
                    .map_err(|e| format!("Библиотека {}: {}", label, e))
            }
        })
        .buffer_unordered(LIBRARY_DOWNLOAD_CONCURRENCY);

    let mut outcomes = Vec::new();
    let mut errors = Vec::new();
    while let Some(result) = tasks.next().await {
        match result {
            Ok(outcome) => outcomes.push(outcome),
            // Одну ошибку не прячем за другими: сразу показываем все, иначе
            // пользователь чинит библиотеки по одной.
            Err(e) => errors.push(e),
        }
    }
    if !errors.is_empty() {
        return Err(errors.join("; "));
    }

    // `buffer_unordered` отдаёт готовые результаты в произвольном порядке,
    // а classpath должен совпадать с манифестом.
    outcomes.sort_by_key(|o| o.index);

    let mut classpath = Vec::new();
    let mut natives: Vec<NativeJar> = Vec::new();
    for outcome in outcomes {
        classpath.extend(outcome.classpath);
        natives.extend(outcome.natives);
    }

    // Распаковываем natives только когда набор jar-ов изменился.
    //
    // Раньше DLL-ки распаковывались заново на каждый запуск: сотни мелких
    // файлов на диск впустую (и лишняя работа антивирусу). Отпечаток —
    // имена и размеры jar-ов — лежит рядом с natives.
    let stamp = natives_stamp(&natives);
    let stamp_file = natives_dir.join(".natives-stamp");
    let already_extracted = fs::read_to_string(&stamp_file)
        .map(|s| s == stamp)
        .unwrap_or(false);

    if !already_extracted {
        // Natives распаковываем последовательно: в разных jar-ах бывают
        // одноимённые DLL, и параллельная запись дала бы случайный результат.
        for native in &natives {
            archive::extract_natives(&native.path, natives_dir)
                .map_err(|e| format!("Не удалось распаковать natives {}: {}", native.label, e))?;
        }
        let _ = fs::write(&stamp_file, &stamp);
    }

    Ok(classpath)
}

/// Отпечаток набора natives: имя и размер каждого jar-а.
///
/// Если он совпал с сохранённым, содержимое папки natives можно не трогать.
fn natives_stamp(natives: &[NativeJar]) -> String {
    let mut parts: Vec<String> = natives
        .iter()
        .map(|native| {
            let size = native.path.metadata().map(|m| m.len()).unwrap_or(0);
            format!(
                "{}:{}",
                native
                    .path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                size
            )
        })
        .collect();
    parts.sort();
    parts.join("|")
}

/// Скачать всё, что нужно одной библиотеке.
///
/// Natives здесь только скачиваются: распаковка идёт после, в порядке
/// манифеста.
async fn download_one_library(
    client: &reqwest::Client,
    lib: &Value,
    libraries_dir: &Path,
    native_key: &str,
    index: usize,
) -> Result<LibraryOutcome, String> {
    let mut outcome = LibraryOutcome {
        index,
        classpath: Vec::new(),
        natives: Vec::new(),
    };
    let mut found = false;

    // 1. downloads.artifact
    if let Some(downloads) = lib.get("downloads") {
        if let Some(artifact) = downloads.get("artifact") {
            let rel_path = artifact["path"].as_str().unwrap_or("");
            let url = artifact["url"].as_str().unwrap_or("");
            let sum = Sum::sha1(artifact["sha1"].as_str().unwrap_or(""))
                .map(|s| s.with_size(artifact["size"].as_u64()));

            if !rel_path.is_empty() {
                // Путь библиотеки — относительный и обязан оставаться внутри
                // libraries: манифесты приходят и от сторонних загрузчиков.
                let rel = guard::relative_under(rel_path)?;
                let lib_path = libraries_dir.join(&rel);
                if !url.is_empty() {
                    ensure_file_with(client, url, &lib_path, sum).await?;
                }
                if lib_path.is_file() {
                    outcome.classpath.push(lib_path);
                    found = true;
                }
            }
        }

        // 2. Natives: их не кладут в classpath, а распаковывают на диск —
        // LWJGL 2 (1.12.2 и старше) ищет DLL по java.library.path.
        if let Some(classifier) = native_jar_classifier(lib, native_key) {
            if let Some(nat_art) = downloads
                .get("classifiers")
                .and_then(|c| c.get(&classifier).or_else(|| c.get(native_key)))
            {
                let rel_path = nat_art["path"].as_str().unwrap_or("");
                let url = nat_art["url"].as_str().unwrap_or("");
                let sum = Sum::sha1(nat_art["sha1"].as_str().unwrap_or(""))
                    .map(|s| s.with_size(nat_art["size"].as_u64()));
                if !rel_path.is_empty() {
                    let rel = guard::relative_under(rel_path)?;
                    let lib_path = libraries_dir.join(&rel);
                    if !url.is_empty() {
                        ensure_file_with(client, url, &lib_path, sum).await?;
                    }
                    if lib_path.is_file() {
                        outcome.natives.push(NativeJar {
                            path: lib_path,
                            label: classifier,
                        });
                        // Библиотека обработана: maven-fallback ниже ей уже
                        // не нужен, иначе тот же jar попадёт в classpath.
                        found = true;
                    }
                }
            }
        }
    }

    // 3. Maven coordinates fallback (Fabric / Forge / Quilt и старые
    // манифесты без downloads)
    if !found {
        if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
            let parts: Vec<&str> = name.split(':').collect();
            if parts.len() >= 3 {
                let group_path = parts[0].replace('.', "/");
                let artifact_id = parts[1];
                let version = parts[2];

                // У старых версий natives заданы только полем `natives`:
                // в имени артефакта классификатора нет, его надо добавить,
                // иначе скачается обычный jar без единой DLL.
                let native_cls = natives_classifier(lib);
                let explicit_cls = parts.get(3).map(|c| c.to_string());
                let (classifier, is_native) = match (explicit_cls, native_cls) {
                    (Some(explicit), Some(native)) => {
                        let is_native = explicit == native;
                        (format!("-{}", explicit), is_native)
                    }
                    (Some(explicit), None) => (format!("-{}", explicit), false),
                    (None, Some(native)) => (format!("-{}", native), true),
                    (None, None) => (String::new(), false),
                };

                let jar_name = format!("{}-{}{}.jar", artifact_id, version, classifier);
                let rel_path = format!("{}/{}/{}/{}", group_path, artifact_id, version, jar_name);
                // Координаты maven собираются из строки `name` чужого
                // манифеста: `..` в ней не должен стать выходом из libraries.
                let rel = guard::relative_under(&rel_path)?;
                let lib_path = libraries_dir.join(&rel);

                if let Some(url_base) = lib.get("url").and_then(|u| u.as_str()) {
                    let dl_url = format!("{}/{}", url_base.trim_end_matches('/'), rel_path);
                    // У maven-координат хеша нет — сверять нечем, но ошибку
                    // загрузки больше не проглатываем.
                    ensure_file_with(client, &dl_url, &lib_path, None).await?;
                }

                if lib_path.is_file() {
                    if is_native {
                        outcome.natives.push(NativeJar {
                            path: lib_path,
                            label: jar_name,
                        });
                    } else {
                        outcome.classpath.push(lib_path);
                    }
                }
            }
        }
    }

    Ok(outcome)
}

pub async fn download_libraries_and_client(
    app: &AppHandle,
    version_id: &str,
    version_json: &Value,
) -> Result<(Vec<PathBuf>, PathBuf, PathBuf), String> {
    let root = get_minecraft_root();
    let safe_id = guard::folder_name(version_id)?;
    let version_dir = root.join("versions").join(&safe_id);
    let natives_dir = version_dir.join("natives");
    fs::create_dir_all(&natives_dir)
        .map_err(|e| format!("Не удалось создать папку natives: {}", e))?;

    let client_jar = ensure_client_jar(app, version_id, version_json).await?;
    let classpath = download_version_libraries(app, version_json, &natives_dir).await?;

    Ok((classpath, client_jar, natives_dir))
}
