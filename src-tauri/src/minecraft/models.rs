use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchOptions {
    pub version: String,
    pub loader: Option<String>,
    pub username: Option<String>,
    pub uuid: Option<String>,
    pub token: Option<String>,
    #[serde(rename = "clientToken")]
    pub client_token: Option<String>,
    #[serde(rename = "authType")]
    pub auth_type: Option<String>,
    #[serde(rename = "maxRam")]
    pub max_ram: Option<Value>,
    #[serde(rename = "javaPath")]
    pub java_path: Option<String>,
    #[serde(rename = "instanceId")]
    pub instance_id: Option<String>,
    #[serde(rename = "modpackName")]
    pub modpack_name: Option<String>,
    // Версия загрузчика, выбранная при создании сборки. Без неё лаунчер
    // берёт самую свежую — как делал всегда.
    #[serde(rename = "loaderVersion")]
    pub loader_version: Option<String>,
    #[serde(rename = "customArgs")]
    pub custom_args: Option<Vec<String>>,
    /// Полный экран игры. Ставится не аргументом командной строки (в
    /// аргументах версии такого параметра нет), а значением в options.txt
    /// запускаемой сборки — его игра читает сама при старте.
    pub fullscreen: Option<bool>,
    /// Свернуть окно лаунчера, как только окно игры появилось.
    #[serde(rename = "minimizeLauncher")]
    pub minimize_launcher: Option<bool>,
    /// Профиль настроек игрока: язык, размер интерфейса, нарратор.
    #[serde(rename = "playerOptions")]
    pub player_options: Option<PlayerOptions>,
}

/// Настройки, которые лаунчер переносит в запускаемую сборку, чтобы в каждой
/// новой сборке не выставлять язык, интерфейс и нарратор заново. Значения
/// храним ровно в том виде, в котором их держит options.txt.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerOptions {
    pub lang: Option<String>,
    #[serde(rename = "guiScale")]
    pub gui_scale: Option<String>,
    pub narrator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionReleaseInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionReleaseInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub release_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}
