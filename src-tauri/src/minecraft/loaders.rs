use crate::minecraft::libraries::ensure_client_jar;
use crate::minecraft::manifest::load_or_fetch_version_json;
use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::paths::*;
use crate::utils::versions::{self, InstalledVersion, LoaderKind};
use serde_json::Value;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

/// Прочитать json установленной версии.
///
/// Сначала `versions/<name>/<name>.json`, затем `version.json` — так лежат
/// профили старых установок Forge.
fn read_version_json(versions_dir: &Path, name: &str) -> Option<Value> {
    for file in [format!("{}.json", name), "version.json".to_string()] {
        let path = versions_dir.join(name).join(file);
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(value) = serde_json::from_str::<Value>(&content) {
            return Some(value);
        }
    }
    None
}

fn installed_versions(versions_dir: &Path) -> Vec<InstalledVersion> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(versions_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let json = read_version_json(versions_dir, &name);
        out.push(InstalledVersion {
            inherits_from: json
                .as_ref()
                .and_then(|v| v["inheritsFrom"].as_str())
                .map(|s| s.to_string()),
            id: json
                .as_ref()
                .and_then(|v| v["id"].as_str())
                .map(|s| s.to_string()),
            // Такой профиль поставлен другим лаунчером и у нас не запускается —
            // `pick_loader` его пропустит, и Forge встанет установщиком.
            forgewrapper: json
                .as_ref()
                .map(versions::is_forgewrapper_json)
                .unwrap_or(false),
            name,
        });
    }
    out
}

/// Найти установленную версию загрузчика для этой версии игры.
fn find_loader(
    versions_dir: &Path,
    kind: LoaderKind,
    game_version: &str,
    loader_version: Option<&str>,
) -> Option<String> {
    versions::pick_loader(
        &installed_versions(versions_dir),
        kind,
        game_version,
        loader_version,
    )
}

/// Версия с таким id уже лежит в `versions/` и её можно запустить.
///
/// Профиль ForgeWrapper не считается: установщик его перезаписывает, и если
/// json остался «обёрткой», значит установка не удалась — возвращать такой id
/// нельзя, иначе ошибка вылезет только у игрока при запуске.
fn exact_version_exists(versions_dir: &Path, id: &str) -> bool {
    read_version_json(versions_dir, id)
        .map(|json| !versions::is_forgewrapper_json(&json))
        .unwrap_or(false)
}

pub async fn ensure_fabric(
    app: &AppHandle,
    game_version: &str,
    loader_version: Option<&str>,
) -> Result<String, String> {
    let _ = app.emit(
        "launch-progress",
        format!("Проверка Fabric для {}...", game_version),
    );
    // Сначала локальная проверка: сеть нужна только для установки, а не для
    // каждого запуска. Раньше здесь всегда шёл запрос к meta.fabricmc.net,
    // и запуск любой Fabric-сборки ждал ответа (в РФ это 0.3–2 с).
    let versions_dir = get_minecraft_root().join("versions");
    if let Some(name) = find_loader(
        &versions_dir,
        LoaderKind::Fabric,
        game_version,
        loader_version,
    ) {
        let _ = app.emit("launch-progress", "Fabric уже установлен!");
        return Ok(name);
    }

    let client = reqwest::Client::new();
    let loaders: Value = client
        .get("https://meta.fabricmc.net/v2/versions/loader")
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    // Версию мог выбрать пользователь в интерфейсе; без выбора берём
    // самую свежую из меты — ровно как раньше.
    let latest_loader = match loader_version {
        Some(wanted) => wanted,
        None => loaders
            .as_array()
            .and_then(|a| a.first())
            .and_then(|l| l["version"].as_str())
            .ok_or("Failed to get Fabric loader version")?,
    };

    let custom_id =
        guard::folder_name(&format!("fabric-loader-{}-{}", latest_loader, game_version))?;
    let version_dir = get_minecraft_root().join("versions").join(&custom_id);
    let json_path = version_dir.join(format!("{}.json", custom_id));

    if json_path.exists() {
        let _ = app.emit("launch-progress", "Fabric уже установлен!");
        return Ok(custom_id);
    }

    let _ = app.emit(
        "launch-progress",
        format!("Загрузка Fabric {}...", latest_loader),
    );
    let profile_url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        game_version, latest_loader
    );
    let profile_res = client
        .get(&profile_url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Запрошенный профиль может не существовать: например, выбранная версия
    // загрузчика не выходила для этой версии игры — говорим прямо, что просили.
    if !profile_res.status().is_success() {
        return Err(format!(
            "Загрузчик {} не подходит для Minecraft {} (мета ответила {})",
            latest_loader,
            game_version,
            profile_res.status()
        ));
    }

    let profile_json: Value = profile_res.json().await.map_err(|e| e.to_string())?;

    fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Не удалось создать папку версии: {}", e))?;
    let profile_text = serde_json::to_string_pretty(&profile_json)
        .map_err(|e| format!("Не удалось сохранить профиль загрузчика: {}", e))?;
    fs::write(json_path, profile_text)
        .map_err(|e| format!("Не удалось сохранить профиль загрузчика: {}", e))?;

    let _ = app.emit("launch-progress", "Fabric успешно установлен!");
    Ok(custom_id)
}

pub async fn ensure_quilt(
    app: &AppHandle,
    game_version: &str,
    loader_version: Option<&str>,
) -> Result<String, String> {
    let _ = app.emit(
        "launch-progress",
        format!("Проверка Quilt для {}...", game_version),
    );
    // Локальная проверка до сети — как у Fabric: запуск не должен зависеть
    // от доступности meta.quiltmc.org.
    let versions_dir = get_minecraft_root().join("versions");
    if let Some(name) = find_loader(
        &versions_dir,
        LoaderKind::Quilt,
        game_version,
        loader_version,
    ) {
        let _ = app.emit("launch-progress", "Quilt уже установлен!");
        return Ok(name);
    }

    let client = reqwest::Client::new();
    let loaders: Value = client
        .get("https://meta.quiltmc.org/v3/versions/loader")
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    // Версию мог выбрать пользователь в интерфейсе; без выбора берём
    // самую свежую из меты — ровно как раньше.
    let latest_loader = match loader_version {
        Some(wanted) => wanted,
        None => loaders
            .as_array()
            .and_then(|a| a.first())
            .and_then(|l| l["version"].as_str())
            .ok_or("Failed to get Quilt loader version")?,
    };

    let custom_id =
        guard::folder_name(&format!("quilt-loader-{}-{}", latest_loader, game_version))?;
    let version_dir = get_minecraft_root().join("versions").join(&custom_id);
    let json_path = version_dir.join(format!("{}.json", custom_id));

    if json_path.exists() {
        let _ = app.emit("launch-progress", "Quilt уже установлен!");
        return Ok(custom_id);
    }

    let profile_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
        game_version, latest_loader
    );
    let profile_res = client
        .get(&profile_url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Запрошенный профиль может не существовать: например, выбранная версия
    // загрузчика не выходила для этой версии игры — говорим прямо, что просили.
    if !profile_res.status().is_success() {
        return Err(format!(
            "Загрузчик {} не подходит для Minecraft {} (мета ответила {})",
            latest_loader,
            game_version,
            profile_res.status()
        ));
    }

    let profile_json: Value = profile_res.json().await.map_err(|e| e.to_string())?;

    fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Не удалось создать папку версии: {}", e))?;
    let profile_text = serde_json::to_string_pretty(&profile_json)
        .map_err(|e| format!("Не удалось сохранить профиль загрузчика: {}", e))?;
    fs::write(json_path, profile_text)
        .map_err(|e| format!("Не удалось сохранить профиль загрузчика: {}", e))?;

    let _ = app.emit("launch-progress", "Quilt успешно установлен!");
    Ok(custom_id)
}

pub async fn ensure_forge(
    app: &AppHandle,
    game_version: &str,
    loader_version: Option<&str>,
) -> Result<String, String> {
    let root = get_minecraft_root();
    let versions_dir = root.join("versions");

    // 1. Уже установленный Forge для этой версии игры. Смотрим на
    // `inheritsFrom`, а не на подстроку: иначе «1.8» подхватил бы «1.8.9».
    if let Some(name) = find_loader(
        &versions_dir,
        LoaderKind::Forge,
        game_version,
        loader_version,
    ) {
        let _ = app.emit("launch-progress", "Forge уже установлен!");
        return Ok(name);
    }

    // 2. Check if a pre-existing Forge installation exists in forge/ folder (from older launcher versions)
    let forge_dir = root.join("forge");
    if let Ok(entries) = fs::read_dir(&forge_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !LoaderKind::Forge.is_loader_dir(&name)
                || !versions::mentions_version(&name, game_version)
            {
                continue;
            }
            let vjson = entry.path().join("version.json");
            if vjson.exists() {
                if let Ok(content) = fs::read_to_string(&vjson) {
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        // Старые версии лаунчера ставили Forge через ForgeWrapper
                        // и складывали его json сюда. Копировать такую «обёртку»
                        // обратно в versions/ нельзя: игра падает с «Unable to
                        // detect the forge installer!». Такой профиль забываем и
                        // идём ставить Forge обычным установщиком.
                        if versions::is_forgewrapper_json(&val) {
                            continue;
                        }
                        if let Some(id) = val["id"].as_str() {
                            let id = guard::folder_name(id)?;
                            let target_dir = versions_dir.join(&id);
                            let target_json = target_dir.join(format!("{}.json", id));
                            fs::create_dir_all(&target_dir).map_err(|e| {
                                format!("Не удалось создать папку версии {}: {}", id, e)
                            })?;
                            fs::write(&target_json, content).map_err(|e| {
                                format!("Не удалось сохранить версию {}: {}", id, e)
                            })?;
                            let _ = app.emit("launch-progress", "Forge обнаружен и настроен!");
                            return Ok(id);
                        }
                    }
                }
            }
        }
    }

    // 3. Needs installation: make sure vanilla version client jar and json exist
    let _ = app.emit(
        "launch-progress",
        format!("Подготовка базовой версии Minecraft {}...", game_version),
    );
    let vanilla_json = load_or_fetch_version_json(game_version).await?;
    let _ = ensure_client_jar(app, game_version, &vanilla_json).await?;

    let client = reqwest::Client::new();
    // Версию Forge мог выбрать пользователь. Искать её в сети нужно только
    // когда выбор оставлен лаунчеру.
    let mut forge_ver: Option<String> = loader_version.map(str::to_string);

    if forge_ver.is_none() {
        let _ = app.emit(
            "launch-progress",
            format!("Поиск версии Forge для {}...", game_version),
        );
        let promo_res = client
            .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
            .header("User-Agent", "PagryshaLauncher/7.2")
            .send()
            .await;

        if let Ok(res) = promo_res {
            if let Ok(val) = res.json::<Value>().await {
                if let Some(promos) = val.get("promos").and_then(|p| p.as_object()) {
                    let rec_key = format!("{}-recommended", game_version);
                    let lat_key = format!("{}-latest", game_version);
                    if let Some(v) = promos.get(&rec_key).and_then(|v| v.as_str()) {
                        forge_ver = Some(v.to_string());
                    } else if let Some(v) = promos.get(&lat_key).and_then(|v| v.as_str()) {
                        forge_ver = Some(v.to_string());
                    }
                }
            }
        }

        // Fallback to BMCLAPI if promotions_slim didn't yield a result
        if forge_ver.is_none() {
            let bmcl_url = format!(
                "https://bmclapi2.bangbang93.com/forge/minecraft/{}",
                game_version
            );
            if let Ok(res) = client
                .get(&bmcl_url)
                .header("User-Agent", "PagryshaLauncher/7.2")
                .send()
                .await
            {
                if let Ok(list) = res.json::<Value>().await {
                    if let Some(arr) = list.as_array() {
                        if let Some(first) = arr.first() {
                            if let Some(v) = first["version"].as_str() {
                                forge_ver = Some(v.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let fver = forge_ver.ok_or_else(|| {
        format!(
            "Не удалось найти подходящую версию Forge для Minecraft {}",
            game_version
        )
    })?;
    // Версия приходит из ответа Forge/BMCLAPI и попадает в имя файла: без
    // проверки `../` в ней означал бы запись мимо кэша установщиков.
    let fver = guard::folder_name(&fver)?;
    // id версии собирается из двух строк и потом становится папкой в versions.
    let full_version = guard::folder_name(&format!("{}-{}", game_version, fver))?;

    // У старых Forge (1.7.10, 1.8.9) рекомендуемая сборка в maven лежит с
    // хвостом из версии игры: `1.8.9-11.15.1.2318-1.8.9`, хотя promotions
    // отдают только `11.15.1.2318`. Пробуем оба написания, прежде чем идти
    // на BMCLAPI.
    let mut maven_ids = vec![full_version.clone()];
    let suffixed = format!("{}-{}-{}", game_version, fver, game_version);
    if suffixed != full_version {
        maven_ids.push(suffixed);
    }

    let fallback_url = format!(
        "https://bmclapi2.bangbang93.com/forge/download?mcversion={}&version={}&category=installer",
        game_version, fver
    );

    let installers_cache = get_app_data_dir().join("forge-installers");
    fs::create_dir_all(&installers_cache)
        .map_err(|e| format!("Не удалось создать папку установщиков Forge: {}", e))?;
    let installer_name = guard::file_name(&format!("forge-{}-installer.jar", full_version))?;
    let installer_path = installers_cache.join(installer_name);

    let _ = app.emit(
        "launch-progress",
        format!("Скачивание установщика Forge {}...", fver),
    );
    // У maven рядом с jar лежит `<url>.sha1`. У BMCLAPI такой побочной ссылки
    // нет, поэтому запасной источник проверяется только фактом загрузки.
    let mut maven_error = String::new();
    let mut maven_ok = false;
    for maven_id in &maven_ids {
        let url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}/forge-{0}-installer.jar",
            maven_id
        );
        let maven_sum = fetch_sidecar_sha1(&client, &url).await;
        match ensure_file(
            &url,
            &installer_path,
            maven_sum.as_deref().and_then(Sum::sha1),
        )
        .await
        {
            Ok(_) => {
                maven_ok = true;
                break;
            }
            Err(e) => maven_error = e,
        }
    }
    if !maven_ok {
        ensure_file(&fallback_url, &installer_path, None)
            .await
            .map_err(|e| {
                format!(
                    "Не удалось скачать установщик Forge: {} (maven: {})",
                    e, maven_error
                )
            })?;
    }

    // Ensure launcher_profiles.json in minecraft_root
    let lp = root.join("launcher_profiles.json");
    if !lp.exists() {
        fs::write(&lp, "{\"profiles\":{}}")
            .map_err(|e| format!("Не удалось создать launcher_profiles.json: {}", e))?;
    }

    let _ = app.emit(
        "launch-progress",
        format!("Установка Forge {} (это займет 1-2 минуты)...", fver),
    );

    // Java нужна только установщику: разрешаем её здесь, а не на каждом
    // запуске игры. Forge 1.12.2 требует Java 8, современные — 17/21,
    // поэтому версию берём из требования игры.
    let required =
        crate::utils::versions::java_requirement(&serde_json::json!({}), None, game_version)
            .and_then(crate::utils::versions::supported_java)
            .unwrap_or(8);
    let installer_java = crate::commands::java::ensure_java_for(app, required).await?;

    let output = tokio::process::Command::new(&installer_java)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(&root)
        .output()
        .await
        .map_err(|e| format!("Не удалось запустить установщик Forge: {}", e))?;

    if !output.status.success() {
        let err_text = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ошибка при установке Forge: {}", err_text));
    }

    // Имя версии выбирает сам установщик: `1.12.2-forge-14.23.5.2860`,
    // `1.7.10-Forge10.13.4.1614-1.7.10` и т.п. Поэтому ищем по `inheritsFrom`
    // и номеру загрузчика, а канонический id проверяем отдельно.
    if let Some(name) = find_loader(&versions_dir, LoaderKind::Forge, game_version, Some(&fver)) {
        let _ = app.emit("launch-progress", "Forge успешно установлен!");
        return Ok(name);
    }

    let canonical_id = format!("{}-forge-{}", game_version, fver);
    if exact_version_exists(&versions_dir, &canonical_id) {
        let _ = app.emit("launch-progress", "Forge успешно установлен!");
        return Ok(canonical_id);
    }

    // Возвращать несуществующий id нельзя: ошибка всплыла бы только при
    // запуске, уже после «успешной» установки.
    Err(format!(
        "Установщик Forge {} завершился, но версия не появилась в versions/",
        fver
    ))
}

/// Хеш установщика берём из побочного файла `<url>.sha1`, который maven
/// отдаёт рядом с артефактом. Если файла нет или он не похож на sha1 —
/// возвращаем `None`: установщик всё равно скачается, но без сверки.
async fn fetch_sidecar_sha1(client: &reqwest::Client, url: &str) -> Option<String> {
    let res = client
        .get(format!("{}.sha1", url))
        .header("User-Agent", "PagryshaLauncher/7.2")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let text = res.text().await.ok()?;
    let hex = text.split_whitespace().next()?.trim();
    Sum::sha1(hex).map(|_| hex.to_string())
}

pub async fn ensure_neoforge(
    app: &AppHandle,
    game_version: &str,
    loader_version: Option<&str>,
) -> Result<String, String> {
    let root = get_minecraft_root();
    let versions_dir = root.join("versions");

    // 1. Уже установленный NeoForge для этой версии игры (точное совпадение
    // по `inheritsFrom`, а не по подстроке).
    if let Some(name) = find_loader(
        &versions_dir,
        LoaderKind::NeoForge,
        game_version,
        loader_version,
    ) {
        let _ = app.emit("launch-progress", "NeoForge уже установлен!");
        return Ok(name);
    }

    // 2. Prepare vanilla
    let _ = app.emit(
        "launch-progress",
        format!("Подготовка базовой версии Minecraft {}...", game_version),
    );
    let vanilla_json = load_or_fetch_version_json(game_version).await?;
    let _ = ensure_client_jar(app, game_version, &vanilla_json).await?;

    let client = reqwest::Client::new();
    // Версию NeoForge мог выбрать пользователь в интерфейсе.
    let mut neoforge_ver: Option<String> = loader_version.map(str::to_string);

    if neoforge_ver.is_none() {
        let _ = app.emit(
            "launch-progress",
            format!("Поиск NeoForge для {}...", game_version),
        );
        let bmcl_url = format!(
            "https://bmclapi2.bangbang93.com/neoforge/list/{}",
            game_version
        );

        if let Ok(res) = client
            .get(&bmcl_url)
            .header("User-Agent", "PagryshaLauncher/7.2")
            .send()
            .await
        {
            if let Ok(list) = res.json::<Value>().await {
                if let Some(arr) = list.as_array() {
                    if let Some(first) = arr.first() {
                        if let Some(v) = first["version"].as_str() {
                            neoforge_ver = Some(v.to_string());
                        }
                    }
                }
            }
        }
    }

    let nver = neoforge_ver
        .ok_or_else(|| format!("Версия NeoForge для Minecraft {} не найдена", game_version))?;
    // Версия из ответа BMCLAPI становится именем файла в кэше.
    let nver = guard::folder_name(&nver)?;
    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{0}/neoforge-{0}-installer.jar",
        nver
    );
    let fallback_url = format!(
        "https://bmclapi2.bangbang93.com/neoforge/version/{}/download/installer.jar",
        nver
    );

    let installers_cache = get_app_data_dir().join("neoforge-installers");
    fs::create_dir_all(&installers_cache)
        .map_err(|e| format!("Не удалось создать папку установщиков NeoForge: {}", e))?;
    let installer_name = guard::file_name(&format!("neoforge-{}-installer.jar", nver))?;
    let installer_path = installers_cache.join(installer_name);

    let _ = app.emit(
        "launch-progress",
        format!("Скачивание установщика NeoForge {}...", nver),
    );
    let maven_sum = fetch_sidecar_sha1(&client, &installer_url).await;
    let downloaded = match ensure_file(
        &installer_url,
        &installer_path,
        maven_sum.as_deref().and_then(Sum::sha1),
    )
    .await
    {
        Ok(v) => Ok(v),
        Err(_) => ensure_file(&fallback_url, &installer_path, None).await,
    };
    downloaded.map_err(|e| format!("Не удалось скачать установщик NeoForge: {}", e))?;

    let lp = root.join("launcher_profiles.json");
    if !lp.exists() {
        fs::write(&lp, "{\"profiles\":{}}")
            .map_err(|e| format!("Не удалось создать launcher_profiles.json: {}", e))?;
    }

    let _ = app.emit("launch-progress", format!("Установка NeoForge {}...", nver));
    // Как и у Forge: Java разрешается только в момент установки.
    let required =
        crate::utils::versions::java_requirement(&serde_json::json!({}), None, game_version)
            .and_then(crate::utils::versions::supported_java)
            .unwrap_or(21);
    let installer_java = crate::commands::java::ensure_java_for(app, required).await?;

    let output = tokio::process::Command::new(&installer_java)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(&root)
        .output()
        .await
        .map_err(|e| format!("Не удалось запустить установщик NeoForge: {}", e))?;

    if !output.status.success() {
        let err_text = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ошибка при установке NeoForge: {}", err_text));
    }

    // Имя папки зависит от версии установщика: `neoforge-21.1.80` для новых
    // и `1.20.1-neoforge-47.1.0` для 1.20.1.
    if let Some(name) = find_loader(
        &versions_dir,
        LoaderKind::NeoForge,
        game_version,
        Some(&nver),
    ) {
        let _ = app.emit("launch-progress", "NeoForge успешно установлен!");
        return Ok(name);
    }

    for canonical_id in [
        format!("neoforge-{}", nver),
        format!("{}-neoforge-{}", game_version, nver),
    ] {
        if exact_version_exists(&versions_dir, &canonical_id) {
            let _ = app.emit("launch-progress", "NeoForge успешно установлен!");
            return Ok(canonical_id);
        }
    }

    // Несуществующий id не возвращаем — иначе ошибка вылезет при запуске.
    Err(format!(
        "Установщик NeoForge {} завершился, но версия не появилась в versions/",
        nver
    ))
}
/// Сколько версий загрузчика отдавать интерфейсу: у Forge для 1.20.1 их
/// больше ста, и такой список никто не пролистывает.
const LIST_LIMIT: usize = 60;

/// Список версий загрузчика для версии игры.
///
/// Источник тот же, откуда лаунчер ставит загрузчик: meta.fabricmc.net и
/// meta.quiltmc.org отдают списки по версии игры, Forge и NeoForge — BMCLAPI,
/// чьи ответы лаунчер и так использует как запасной канал установки.
pub async fn list_loader_versions(loader: &str, game_version: &str) -> Result<Vec<String>, String> {
    let url = match loader.to_ascii_lowercase().as_str() {
        "fabric" => format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}",
            game_version
        ),
        "quilt" => format!(
            "https://meta.quiltmc.org/v3/versions/loader/{}",
            game_version
        ),
        "forge" => format!(
            "https://bmclapi2.bangbang93.com/forge/minecraft/{}",
            game_version
        ),
        "neoforge" => format!(
            "https://bmclapi2.bangbang93.com/neoforge/list/{}",
            game_version
        ),
        other => return Err(format!("Неизвестный загрузчик: {}", other)),
    };

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Сервис загрузчиков ответил {}", response.status()));
    }

    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    let mut items: Vec<String> = Vec::new();
    if let Some(list) = body.as_array() {
        for entry in list {
            // Fabric и Quilt прячут версию в объект `loader`, у Forge и
            // NeoForge она лежит в корне.
            let found = entry["loader"]["version"]
                .as_str()
                .or_else(|| entry["version"].as_str());
            if let Some(version) = found {
                items.push(version.to_string());
            }
        }
    }

    items.sort_by(|a, b| versions::version_parts(b).cmp(&versions::version_parts(a)));
    items.dedup();
    items.truncate(LIST_LIMIT);
    Ok(items)
}
