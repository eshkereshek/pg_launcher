use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::paths::*;
use futures_util::stream::{self, StreamExt};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub async fn download_assets(app: &AppHandle, version_json: &Value) -> Result<(), String> {
    let asset_index = match version_json.get("assetIndex") {
        Some(ai) => ai,
        None => return Ok(()),
    };

    // id индекса становится именем файла: без проверки `..\` уводит запись из
    // папки indexes.
    let index_id = guard::folder_name(asset_index["id"].as_str().unwrap_or("legacy"))?;
    let index_url = asset_index["url"].as_str().ok_or("No assetIndex url")?;
    let index_sum = asset_index["sha1"]
        .as_str()
        .and_then(Sum::sha1)
        .map(|s| s.with_size(asset_index["size"].as_u64()));

    let root = get_minecraft_root();
    let indexes_dir = root.join("assets").join("indexes");
    let objects_dir = root.join("assets").join("objects");
    let index_file = indexes_dir.join(format!("{}.json", index_id));

    fs::create_dir_all(&indexes_dir)
        .map_err(|e| format!("Не удалось создать папку indexes: {}", e))?;
    fs::create_dir_all(&objects_dir)
        .map_err(|e| format!("Не удалось создать папку objects: {}", e))?;

    // Индекс проверяем по хешу из манифеста: в нём лежат хеши всех ассетов,
    // поэтому подменённый индекс означает подмену всей игры.
    if !index_file.is_file() {
        let _ = app.emit("launch-progress", "Загрузка индекса ассетов...");
    }
    ensure_file(index_url, &index_file, index_sum).await?;

    let index_str = fs::read_to_string(&index_file).map_err(|e| e.to_string())?;
    let index_data: Value = serde_json::from_str(&index_str).map_err(|e| e.to_string())?;

    let objects = match index_data.get("objects").and_then(|o| o.as_object()) {
        Some(o) => o,
        None => return Ok(()),
    };

    let mut to_download: Vec<(String, PathBuf, String)> = Vec::new();

    for (_name, info) in objects {
        // Хеш — это и имя файла, и то, чем проверяем загрузку. Запись без
        // нормального sha1 пропускаем: проверить её нечем, а `&hash[0..2]` на
        // короткой строке вообще паникует.
        let Some(hash) = info["hash"].as_str().and_then(Sum::sha1) else {
            continue;
        };
        let hex = hash.expected;
        let subhash = &hex[0..2];
        let target_path = objects_dir.join(subhash).join(hex);

        // Размер есть в самом индексе: если он совпадает, файл не перекачиваем,
        // но скачанное всё равно сверяем по sha1 ниже.
        let size_matches = info["size"]
            .as_u64()
            .map(|size| {
                fs::metadata(&target_path)
                    .map(|m| m.len() == size)
                    .unwrap_or(false)
            })
            .unwrap_or(false);
        if size_matches {
            continue;
        }

        let url = format!(
            "https://resources.download.minecraft.net/{}/{}",
            subhash, hex
        );
        to_download.push((url, target_path, hex.to_string()));
    }

    let missing_count = to_download.len();
    if missing_count == 0 {
        return Ok(());
    }

    let _ = app.emit(
        "launch-progress",
        format!("Проверка ассетов: скачивание {} файлов...", missing_count),
    );

    let counter = Arc::new(AtomicUsize::new(0));
    let concurrency = 16;
    let client = reqwest::Client::new();

    // Замыкания ниже клонируют AppHandle на каждую загрузку, поэтому отдельный
    // клон для финального события берём заранее.
    let finish_app = app.clone();

    let stream = stream::iter(to_download).map(|(url, target, hex)| {
        let cl = client.clone();
        let cnt = counter.clone();
        let app_handle = app.clone();

        async move {
            let sum = Sum::sha1(&hex);
            let result = ensure_file_with(&cl, &url, &target, sum).await;

            let cur = cnt.fetch_add(1, Ordering::Relaxed) + 1;
            if cur % 20 == 0 || cur == missing_count {
                let pct = (cur * 100) / missing_count;
                let _ = app_handle.emit(
                    "download-update",
                    serde_json::json!({
                        "id": "game_launch",
                        "name": "Minecraft Assets",
                        "text": format!("Загрузка ассетов ({}/{})", cur, missing_count),
                        "progress": pct
                    }),
                );
            }

            result
        }
    });

    let results = stream
        .buffer_unordered(concurrency)
        .collect::<Vec<Result<bool, String>>>()
        .await;

    let failures: Vec<String> = results.into_iter().filter_map(|r| r.err()).collect();
    if let Some(first) = failures.first() {
        return Err(format!(
            "Не удалось загрузить {} файлов ассетов. Первая ошибка: {}",
            failures.len(),
            first
        ));
    }

    let _ = app.emit("launch-progress", "Ассеты успешно проверены!");

    // Без этого события запись «Minecraft Assets» остаётся в списке загрузок
    // даже после того, как все файлы уже скачаны.
    let _ = finish_app.emit("download-finish", "game_launch");

    Ok(())
}
