//! Список версий загрузчика для интерфейса.
//!
//! Запрос идёт из Rust: CSP webview разрешает только Modrinth, поэтому
//! meta.fabricmc.net и BMCLAPI недоступны из интерфейса напрямую.

use crate::minecraft::loaders;

#[tauri::command]
pub async fn list_loader_versions(
    loader: String,
    game_version: String,
) -> Result<Vec<String>, String> {
    loaders::list_loader_versions(&loader, &game_version).await
}
