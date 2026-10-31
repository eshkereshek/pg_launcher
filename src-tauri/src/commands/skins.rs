use crate::utils::guard;
use crate::utils::paths::get_skins_dir;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub fn get_skins() -> Value {
    let skins_dir = get_skins_dir();
    let _ = fs::create_dir_all(&skins_dir);

    let mut skins = Vec::new();
    if let Ok(entries) = fs::read_dir(&skins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // Расширение сравниваем без учёта регистра: `Skin.PNG` — такой же
            // скин, как `skin.png`, и не должен пропадать из списка.
            let is_png = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("png"))
                .unwrap_or(false);
            if is_png {
                let filename = entry.file_name().to_string_lossy().to_string();
                // Имя без расширения: `replace(".png", "")` не трогал `.PNG`
                // и оставлял расширение в подписи скина.
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| filename.clone());
                skins.push(serde_json::json!({
                    "id": filename,
                    "name": name,
                    "path": path.to_string_lossy().to_string()
                }));
            }
        }
    }
    // Порядок из файловой системы нестабилен, а список в интерфейсе не должен
    // прыгать при каждом обновлении — сортируем по имени.
    skins.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or("")
            .cmp(b["name"].as_str().unwrap_or(""))
    });
    serde_json::json!(skins)
}

#[tauri::command]
pub fn save_skin(file_path: String) -> Result<Value, String> {
    let skins_dir = get_skins_dir();
    let _ = fs::create_dir_all(&skins_dir);

    let src = Path::new(&file_path);
    let filename = src
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "skin.png".to_string());

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let new_id = format!("{}_{}", timestamp, filename);
    let dest = skins_dir.join(&new_id);

    fs::copy(src, &dest).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "success",
        "id": new_id,
        "path": dest.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn delete_skin(skin_id: String) -> Result<Value, String> {
    let target = guard::skins_entry(&skin_id)?;
    if target.exists() {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "status": "success" }))
}

#[tauri::command]
pub fn select_skin_file() -> Option<String> {
    let file = rfd::FileDialog::new()
        .add_filter("Skin PNG", &["png"])
        .pick_file()?;
    Some(file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn select_icon_file() -> Option<String> {
    let file = rfd::FileDialog::new()
        .add_filter("Image", &["png", "jpg", "jpeg", "webp"])
        .pick_file()?;

    let bytes = fs::read(&file).ok()?;
    let encoded = BASE64.encode(&bytes);
    let ext = file
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = if ext == "png" {
        "image/png"
    } else {
        "image/jpeg"
    };
    Some(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
pub fn read_local_image(file_path: String) -> Option<String> {
    // Читаем только картинки: расширение, размер и сигнатура проверяются в
    // guard, иначе команда превращается в чтение любого файла на диске.
    let (bytes, mime) = guard::read_image_file(&file_path).ok()?;
    Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

#[tauri::command]
pub async fn fetch_image_data(url: String) -> Result<String, String> {
    // Адрес приходит из интерфейса, поэтому тянем только https с публичного
    // хоста и только картинку: иначе это SSRF-туннель в локальную сеть.
    guard::remote_image_url(&url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Status {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !content_type.starts_with("image/") {
        return Err("Ссылка ведёт не на картинку".to_string());
    }

    if let Some(len) = resp.content_length() {
        if len > guard::MAX_REMOTE_IMAGE_BYTES {
            return Err("Картинка слишком большая".to_string());
        }
    }

    let mut resp = resp;
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() as u64 + chunk.len() as u64 > guard::MAX_REMOTE_IMAGE_BYTES {
            return Err("Картинка слишком большая".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    let b64 = BASE64.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}

#[tauri::command]
pub async fn get_elyby_skin(username: String) -> Result<Value, String> {
    let url = format!("https://skinsystem.ely.by/textures/{}", username);
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let val: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(val)
    } else {
        Err(format!("Status {}", resp.status()))
    }
}

#[tauri::command]
pub fn log_skin_debug(msg: String) {
    println!("[SKIN DEBUG] {}", msg);
}

#[tauri::command]
pub fn equip_elyby_skin(_skin_path: String, _token: String) -> Value {
    serde_json::json!({
        "status": "not_implemented",
        "fallback": "open_browser"
    })
}
