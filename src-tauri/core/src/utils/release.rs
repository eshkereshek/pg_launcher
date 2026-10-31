//! Разбор метаданных релизов: откуда берутся ссылки и контрольные суммы.
//!
//! Обновление лаунчера и архив Java — это файлы, которые потом исполняются.
//! Поэтому хеш нельзя брать из интерфейса: он приходит из ответа GitHub или
//! Adoptium вместе со ссылкой, и здесь мы проверяем, что он вообще есть и
//! имеет правильный вид. Ссылку на сам файл отдельно проверяет `guard`.

use serde_json::Value;

/// Длина sha256 в hex-символах.
const SHA256_HEX_LEN: usize = 64;

/// sha256 из поля `digest` ассета GitHub — формат `sha256:<hex>`.
///
/// `None`, если хеша нет, он другого алгоритма или это не hex. Отсутствие
/// хеша означает «запускать нельзя», а не «проверять нечем».
pub fn asset_sha256(asset: &Value) -> Option<String> {
    let digest = asset["digest"].as_str()?.trim();
    let hex = digest.strip_prefix("sha256:")?.trim();
    is_sha256(hex).then(|| hex.to_ascii_lowercase())
}

fn is_sha256(value: &str) -> bool {
    value.len() == SHA256_HEX_LEN && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Найти в релизе ассет с точным адресом скачивания.
///
/// Сопоставление по адресу, а не по имени: имя ассета из ответа API — это
/// подпись, а адрес — то, что интерфейс передал обратно в команду.
pub fn asset_by_url<'a>(release: &'a Value, url: &str) -> Option<&'a Value> {
    release["assets"]
        .as_array()?
        .iter()
        .find(|asset| asset["browser_download_url"].as_str() == Some(url))
}

/// Ссылка и sha256 пакета из ответа Adoptium `/v3/assets/latest`.
///
/// Ответ — массив релизов; берём первый, как это делает официальный API для
/// «latest». Если массива нет или в нём нет хеша, возвращаем `None` — качать
/// JRE без сверки нельзя.
pub fn adoptium_package(releases: &Value) -> Option<(String, String)> {
    let package = &releases.as_array()?.first()?["binary"]["package"];
    let link = package["link"].as_str()?.trim().to_string();
    let checksum = package["checksum"].as_str()?.trim();
    if !is_sha256(checksum) {
        return None;
    }
    Some((link, checksum.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_digest_is_read_only_as_sha256() {
        let asset = serde_json::json!({
            "browser_download_url": "https://github.com/x/y/releases/download/v1/app.exe",
            "digest": "sha256:daf83219b01b804157d6a4233fcf62dd0e53dd1eee978f2d57891fc13850d862"
        });
        assert_eq!(
            asset_sha256(&asset).as_deref(),
            Some("daf83219b01b804157d6a4233fcf62dd0e53dd1eee978f2d57891fc13850d862")
        );

        // Верхний регистр — тот же хеш.
        let upper = serde_json::json!({ "digest": format!("sha256:{}", "A".repeat(64)) });
        assert_eq!(asset_sha256(&upper), Some("a".repeat(64)));
    }

    #[test]
    fn missing_or_foreign_digest_is_not_a_hash() {
        assert_eq!(asset_sha256(&serde_json::json!({})), None);
        assert_eq!(asset_sha256(&serde_json::json!({ "digest": null })), None);
        assert_eq!(
            asset_sha256(&serde_json::json!({ "digest": "sha1:abc" })),
            None,
            "sha1 для exe не подходит"
        );
        assert_eq!(
            asset_sha256(&serde_json::json!({ "digest": "sha256:xyz" })),
            None
        );
        assert_eq!(
            asset_sha256(&serde_json::json!({ "digest": format!("sha256:{}", "a".repeat(63)) })),
            None
        );
    }

    #[test]
    fn asset_is_found_by_exact_url() {
        let release = serde_json::json!({
            "assets": [
                {"browser_download_url": "https://github.com/x/y/releases/download/v1/app.exe", "name": "app.exe"},
                {"browser_download_url": "https://github.com/x/y/releases/download/v1/other.exe", "name": "other.exe"}
            ]
        });
        let found = asset_by_url(
            &release,
            "https://github.com/x/y/releases/download/v1/app.exe",
        )
        .unwrap();
        assert_eq!(found["name"], "app.exe");
        assert!(asset_by_url(&release, "https://example.com/app.exe").is_none());
    }

    #[test]
    fn adoptium_link_and_checksum_are_taken_together() {
        let response = serde_json::json!([{
            "release_name": "jdk-21.0.12.1+1",
            "binary": {
                "package": {
                    "name": "OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip",
                    "link": "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip",
                    "checksum": "D35F31E712F0FCF6AC5A093EDC90204FBFF22F720BA3950BD09D331D5E621636"
                }
            }
        }]);
        let (link, checksum) = adoptium_package(&response).unwrap();
        assert!(link.starts_with("https://github.com/adoptium/"));
        assert_eq!(checksum, checksum.to_ascii_lowercase());
        assert_eq!(checksum.len(), 64);
    }

    #[test]
    fn adoptium_without_checksum_is_rejected() {
        assert_eq!(adoptium_package(&serde_json::json!([])), None);
        let no_checksum = serde_json::json!([{
            "binary": {"package": {"link": "https://github.com/adoptium/x.zip"}}
        }]);
        assert_eq!(adoptium_package(&no_checksum), None);
    }
}
