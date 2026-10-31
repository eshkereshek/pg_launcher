//! Каталог серверов Modrinth.
//!
//! Отдельного серверного эндпоинта у Modrinth нет: сервер — такой же проект,
//! просто с типом `minecraft_java_server`. Поэтому каталог берётся тем же
//! `/v2/search` с фасетом по типу проекта, а карточка — `/v2/project/{slug}`.
//!
//! В выдаче нет ни адреса, ни онлайна: адрес серверы пишут текстом в описании
//! или в теле проекта. Его вытаскивает `utils::serveraddr` и отдаёт полем
//! `server_address` — по нему работает кнопка «IP».

use crate::utils::serveraddr::extract_address;
use serde_json::{json, Value};

/// Тип проекта Modrinth для серверов.
const SERVER_PROJECT_TYPE: &str = "minecraft_java_server";

/// Собирает фасеты поиска: тип проекта + категория + версия игры.
fn facets(category: &str, version: &str) -> String {
    let mut parts = vec![format!("[\"project_type:{}\"]", SERVER_PROJECT_TYPE)];
    if category != "all" && !category.is_empty() {
        parts.push(format!(
            "[\"categories:{}\"]",
            urlencoding::encode(category)
        ));
    }
    if version != "all" && !version.is_empty() {
        parts.push(format!("[\"versions:{}\"]", urlencoding::encode(version)));
    }
    format!("[{}]", parts.join(","))
}

async fn get_json(url: &str) -> Result<Value, String> {
    let resp = reqwest::Client::new()
        .get(url)
        // Без собственного User-Agent Modrinth блокирует трафик клиента.
        .header(
            "User-Agent",
            "PagryshaLauncher/7.2 (github.com/pagrysha-launcher)",
        )
        .send()
        .await
        .map_err(|e| format!("Modrinth недоступен: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth ответил {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

/// Каталог серверов: поиск с фильтрами и подгрузкой по смещению.
#[tauri::command]
pub async fn search_modrinth_servers(
    query: String,
    offset: u32,
    category: String,
    version: String,
    sort: String,
) -> Result<Value, String> {
    let url = format!(
        "https://api.modrinth.com/v2/search?query={}&limit=20&offset={}&index={}&facets={}",
        urlencoding::encode(&query),
        offset,
        urlencoding::encode(&sort),
        urlencoding::encode(&facets(&category, &version)),
    );

    let data = get_json(&url).await?;
    let hits = data
        .get("hits")
        .and_then(|h| h.as_array())
        .cloned()
        .unwrap_or_default();

    // Адрес ищем в описании каждой карточки: отдельный запрос на сервер
    // упёрся бы в лимит 300 запросов в минуту на IP.
    let enriched: Vec<Value> = hits
        .iter()
        .map(|hit| {
            let mut item = hit.clone();
            let address = hit
                .get("description")
                .and_then(|d| d.as_str())
                .and_then(extract_address);
            if let Some(object) = item.as_object_mut() {
                object.insert("server_address".to_string(), json!(address));
            }
            item
        })
        .collect();

    Ok(json!({
        "hits": enriched,
        "total_hits": data.get("total_hits").cloned().unwrap_or(json!(0)),
        "offset": offset,
    }))
}

/// Карточка сервера целиком: описание, галерея и адрес из тела проекта.
#[tauri::command]
pub async fn get_modrinth_server(slug: String) -> Result<Value, String> {
    // slug приходит из интерфейса и уходит в URL: пускаем только безопасные
    // символы, чтобы туда нельзя было подставить `../`.
    if slug.is_empty()
        || !slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Некорректный идентификатор сервера".to_string());
    }

    let url = format!("https://api.modrinth.com/v2/project/{}", slug);
    let project = get_json(&url).await?;

    let description = project
        .get("description")
        .and_then(|d| d.as_str())
        .unwrap_or("");
    let body = project.get("body").and_then(|b| b.as_str()).unwrap_or("");
    // В описании адрес пишут чаще, поэтому оно идёт первым.
    let address = extract_address(description).or_else(|| extract_address(body));

    let mut result = project;
    if let Some(object) = result.as_object_mut() {
        object.insert("server_address".to_string(), json!(address));
    }
    Ok(result)
}
