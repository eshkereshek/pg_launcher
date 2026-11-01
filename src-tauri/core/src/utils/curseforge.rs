//! Разбор ответов CurseForge без сетевого слоя.
//!
//! Здесь только чистая логика: соответствие «тип контента → classId → папка
//! сборки», типы загрузчиков, нормализация проекта и файла в форму Modrinth и
//! выбор подходящего файла. Сеть и запись на диск живут в Tauri-командах, а эта
//! часть тестируется без Tauri.

use serde_json::{json, Value};

/// Префикс идентификаторов CurseForge в общей модели проектов.
pub const ID_PREFIX: &str = "cf-";

/// `mods` — моды (6), `modpack` — сборки (4471), `resourcepack` — 12,
/// `shader` — шейдеры (6552).
pub fn class_id(kind: &str) -> u32 {
    match kind {
        "modpack" => 4471,
        "resourcepack" => 12,
        "shader" => 6552,
        _ => 6,
    }
}

/// Папка внутри сборки, куда кладётся скачанный файл.
pub fn kind_folder(kind: &str) -> &'static str {
    match kind {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        _ => "mods",
    }
}

/// CurseForge: 1 Forge, 4 Fabric, 5 Quilt, 6 NeoForge.
pub fn loader_type(loader: &str) -> Option<u32> {
    match loader.to_ascii_lowercase().as_str() {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

/// Обратное преобразование: в карточках загрузчик показывается строкой.
pub fn loader_name(kind: u32) -> Option<&'static str> {
    match kind {
        1 => Some("forge"),
        4 => Some("fabric"),
        5 => Some("quilt"),
        6 => Some("neoforge"),
        _ => None,
    }
}

/// Поле сортировки CurseForge: 2 популярность, 3 обновление, 6 скачивания.
pub fn sort_field(sort: &str) -> u32 {
    match sort {
        "downloads" => 6,
        "newest" | "updated" => 3,
        _ => 2,
    }
}

pub fn strip_id(id: &str) -> &str {
    id.strip_prefix(ID_PREFIX).unwrap_or(id)
}

/// Карточка проекта в форме Modrinth: её понимают существующие компоненты.
pub fn normalize_project(p: &Value) -> Value {
    let id = p["id"].as_i64().unwrap_or(0);

    let loader = p["latestFilesIndexes"]
        .as_array()
        .and_then(|a| a.iter().find_map(|f| f["modLoader"].as_u64()))
        .and_then(|l| loader_name(l as u32))
        .map(|s| s.to_string());

    let mut versions: Vec<String> = p["latestFilesIndexes"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|f| f["gameVersion"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    versions.dedup();

    let mut categories: Vec<String> = Vec::new();
    if let Some(loader) = &loader {
        categories.push(loader.clone());
    }
    if let Some(list) = p["categories"].as_array() {
        for c in list.iter().take(4) {
            if let Some(slug) = c["slug"].as_str() {
                if !categories.iter().any(|x| x == slug) {
                    categories.push(slug.to_string());
                }
            }
        }
    }

    let author = p["authors"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a["name"].as_str())
        .unwrap_or("CurseForge");

    let icon = p["logo"]["thumbnailUrl"]
        .as_str()
        .or_else(|| p["logo"]["url"].as_str())
        .map(|s| s.to_string());

    json!({
        "project_id": format!("{}{}", ID_PREFIX, id),
        "slug": p["slug"],
        "title": p["name"],
        "description": p["summary"],
        "author": author,
        "icon_url": icon,
        "downloads": p["downloadCount"].as_i64().unwrap_or(0),
        // Карточки показывают дату обновления; без неё подставлялся 01.01.2023.
        "date_modified": p["dateModified"],
        "date_created": p["dateCreated"],
        "follows": 0,
        "categories": categories,
        "versions": versions,
        "source": "curseforge",
        "page_url": p["links"]["websiteUrl"],
    })
}

/// Файл в форме версии Modrinth: `id`, `game_versions`, `loaders`, `files`.
pub fn normalize_file(f: &Value) -> Value {
    let sha1 = f["hashes"]
        .as_array()
        .and_then(|a| a.iter().find(|h| h["algo"].as_u64() == Some(1)))
        .and_then(|h| h["value"].as_str())
        .unwrap_or("");

    let mut game_versions: Vec<String> = f["gameVersions"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter(|v| {
                    v.chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                })
                .map(|v| v.to_string())
                .collect()
        })
        .unwrap_or_default();
    game_versions.dedup();

    let loaders: Vec<String> = f["gameVersions"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter_map(loader_type)
                .filter_map(loader_name)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    json!({
        "id": f["id"].as_i64().unwrap_or(0).to_string(),
        "name": f["displayName"],
        "version_number": f["displayName"],
        "game_versions": game_versions,
        "loaders": loaders,
        "files": [{
            "url": f["downloadUrl"],
            "filename": f["fileName"],
            "primary": true,
            "hashes": { "sha1": sha1 }
        }]
    })
}

/// Первый файл, который подходит под версию игры и загрузчик и доступен
/// для скачивания. Файлы без `downloadUrl` автор закрыл — их не берём.
pub fn pick_file<'a>(files: &'a [Value], game_version: &str, loader: &str) -> Option<&'a Value> {
    let want_gv = !game_version.is_empty() && game_version != "all";
    let want_loader = loader_type(loader);

    files
        .iter()
        .filter(|f| {
            f["downloadUrl"]
                .as_str()
                .map(|u| !u.is_empty())
                .unwrap_or(false)
        })
        .find(|f| {
            let gv = !want_gv
                || f["gameVersions"]
                    .as_array()
                    .map(|a| {
                        a.iter().any(|v| {
                            v.as_str()
                                .map(|s| s.eq_ignore_ascii_case(game_version))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);
            let lv = match want_loader {
                None => true,
                Some(want) => f["gameVersions"]
                    .as_array()
                    .map(|a| {
                        a.iter().any(|v| {
                            v.as_str()
                                .and_then(loader_type)
                                .map(|t| t == want)
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false),
            };
            gv && lv
        })
}

/// Описание с CurseForge приходит HTML-ом, а просмотрщик показывает текст.
/// Разметку убираем, но сохраняем абзацы и переносы — иначе описание слипнется
/// в одну строку.
pub fn html_to_text(html: &str) -> String {
    let mut text = String::with_capacity(html.len());
    let mut tag = String::new();
    let mut in_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' => {
                in_tag = false;
                let name = tag
                    .trim_start_matches('/')
                    .split(|c: char| c.is_whitespace() || c == '/')
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                // Блочные теги превращаем в переводы строк, строчные — в пробел.
                match name.as_str() {
                    "br" | "p" | "li" | "ul" | "ol" | "div" | "h1" | "h2" | "h3" | "h4" | "h5"
                    | "h6" | "tr" => text.push('\n'),
                    "td" | "th" => text.push(' '),
                    _ => {}
                }
            }
            _ if in_tag => tag.push(ch),
            _ => text.push(ch),
        }
    }

    let decoded = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");

    // Схлопываем пустые строки: в HTML их бывает по три-четыре подряд.
    let mut out = String::with_capacity(decoded.len());
    let mut blank = 0;
    for line in decoded.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn html_description_becomes_readable_text() {
        // Форма описания с CurseForge: заголовки, списки, ссылки и сущности.
        let html = "<h2>RLCraft</h2><p>Survival &amp; RPG experience.</p>\
                    <ul><li>Dragons</li><li>Dungeons</li></ul>\
                    <p>Смотрите <a href=\"https://example.com\">сайт</a>.</p><br><br><br>\
                    <p>&quot;Хардкор&quot;</p>";
        let text = html_to_text(html);
        assert!(text.contains("RLCraft"));
        assert!(text.contains("Survival & RPG experience."));
        assert!(text.contains("Dragons"));
        assert!(text.contains("сайт"));
        assert!(text.contains("\"Хардкор\""));
        // Теги вырезаны, лишние пустые строки схлопнуты.
        assert!(!text.contains('<'));
        assert!(!text.contains("</"));
        assert!(!text.contains("\n\n\n"));
    }
    #[test]
    fn class_ids_match_curseforge_catalog() {
        assert_eq!(class_id("mod"), 6);
        assert_eq!(class_id("modpack"), 4471);
        assert_eq!(class_id("resourcepack"), 12);
        assert_eq!(class_id("shader"), 6552);
    }

    #[test]
    fn content_goes_into_matching_folder() {
        assert_eq!(kind_folder("mod"), "mods");
        assert_eq!(kind_folder("resourcepack"), "resourcepacks");
        assert_eq!(kind_folder("shader"), "shaderpacks");
    }

    #[test]
    fn loader_types_are_bidirectional() {
        for name in ["forge", "fabric", "quilt", "neoforge"] {
            let t = loader_type(name).expect(name);
            assert_eq!(loader_name(t), Some(name));
        }
        assert_eq!(loader_type("all"), None);
        assert_eq!(loader_type("FABRIC"), Some(4));
    }

    #[test]
    fn sorting_maps_to_curseforge_fields() {
        assert_eq!(sort_field("downloads"), 6);
        assert_eq!(sort_field("newest"), 3);
        assert_eq!(sort_field("relevance"), 2);
    }

    #[test]
    fn project_id_prefix_is_optional() {
        assert_eq!(strip_id("cf-123"), "123");
        assert_eq!(strip_id("123"), "123");
    }

    #[test]
    fn normalize_project_keeps_modrinth_shape() {
        let raw = json!({
            "id": 42,
            "name": "Test Pack",
            "slug": "test-pack",
            "summary": "desc",
            "downloadCount": 1234,
            "authors": [{"name": "Author"}],
            "logo": {"thumbnailUrl": "https://example.com/i.png"},
            "latestFilesIndexes": [
                {"gameVersion": "1.20.1", "modLoader": 1},
                {"gameVersion": "1.20.1", "modLoader": 1}
            ],
            "categories": [{"slug": "adventure"}]
        });
        let out = normalize_project(&raw);
        assert_eq!(out["project_id"], "cf-42");
        assert_eq!(out["title"], "Test Pack");
        assert_eq!(out["source"], "curseforge");
        assert_eq!(out["categories"][0], "forge");
        assert_eq!(out["versions"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn normalize_file_splits_versions_and_loaders() {
        let raw = json!({
            "id": 900,
            "displayName": "1.0.0",
            "fileName": "mod-1.0.0.jar",
            "downloadUrl": "https://example.com/mod.jar",
            "gameVersions": ["1.20.1", "Forge", "Client"],
            "hashes": [{"value": "abc", "algo": 1}]
        });
        let out = normalize_file(&raw);
        assert_eq!(out["id"], "900");
        assert_eq!(out["game_versions"], json!(["1.20.1"]));
        assert_eq!(out["loaders"], json!(["forge"]));
        assert_eq!(out["files"][0]["hashes"]["sha1"], "abc");
    }

    #[test]
    fn body_from_live_api_normalizes() {
        // Форма ответа, снятая с api.curseforge.com для RLCraft (id 285109).
        let pack = json!({
            "id": 285109,
            "name": "RLCraft",
            "slug": "rlcraft",
            "summary": "Survival, RPG, realism",
            "downloadCount": 30498445,
            "dateModified": "2024-06-12T09:15:00Z",
            "authors": [{"name": "Shivaxi"}],
            "logo": {"thumbnailUrl": "https://media.forgecdn.net/avatars/thumbnails/285/109/256/256.jpeg"},
            "links": {"websiteUrl": "https://www.curseforge.com/minecraft/modpacks/rlcraft"},
            "latestFilesIndexes": [{"gameVersion": "1.12.2", "modLoader": null}],
            "categories": [{"slug": "adventure-and-rpg"}]
        });
        let out = normalize_project(&pack);
        assert_eq!(out["project_id"], "cf-285109");
        assert_eq!(out["title"], "RLCraft");
        assert_eq!(out["author"], "Shivaxi");
        assert_eq!(out["date_modified"], "2024-06-12T09:15:00Z");
        assert_eq!(out["versions"], json!(["1.12.2"]));
        assert_eq!(out["categories"], json!(["adventure-and-rpg"]));
        assert_eq!(
            out["page_url"],
            "https://www.curseforge.com/minecraft/modpacks/rlcraft"
        );

        // Файл сборки: имя архива, sha1 и версия игры без строк загрузчика.
        let file = json!({
            "id": 4612979,
            "displayName": "RLCraft 1.12.2 - Release v2.9.3",
            "fileName": "RLCraft 1.12.2 - Release v2.9.3.zip",
            "downloadUrl": "https://edge.forgecdn.net/files/4612/979/RLCraft.zip",
            "gameVersions": ["1.12.2", "Forge"],
            "hashes": [{"value": "9b2f1d", "algo": 1}]
        });
        let v = normalize_file(&file);
        assert_eq!(v["id"], "4612979");
        assert_eq!(v["game_versions"], json!(["1.12.2"]));
        assert_eq!(v["loaders"], json!(["forge"]));
        assert_eq!(
            v["files"][0]["filename"],
            "RLCraft 1.12.2 - Release v2.9.3.zip"
        );
        assert!(pick_file(&[file], "1.12.2", "forge").is_some());
    }

    #[test]
    fn pick_file_skips_locked_and_wrong_loader() {
        let files = vec![
            json!({"downloadUrl": null, "gameVersions": ["1.20.1", "Forge"]}),
            json!({"downloadUrl": "https://x/1.jar", "gameVersions": ["1.19.2", "Forge"]}),
            json!({"downloadUrl": "https://x/2.jar", "gameVersions": ["1.20.1", "Fabric"]}),
            json!({"downloadUrl": "https://x/3.jar", "gameVersions": ["1.20.1", "Forge"]}),
        ];
        let picked = pick_file(&files, "1.20.1", "forge").unwrap();
        assert_eq!(picked["downloadUrl"], "https://x/3.jar");

        // Без фильтров берётся первый доступный файл.
        assert_eq!(
            pick_file(&files, "all", "all").unwrap()["downloadUrl"],
            "https://x/1.jar"
        );
        // Неподходящая версия игры — ничего не выбираем.
        assert!(pick_file(&files, "1.21.1", "forge").is_none());
    }
}
