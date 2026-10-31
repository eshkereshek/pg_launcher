use crate::minecraft::models::LaunchOptions;
use crate::minecraft::runner::launch_minecraft;
use tauri::AppHandle;

#[tauri::command]
pub async fn launch_game(app: AppHandle, options: LaunchOptions) -> Result<(), String> {
    launch_minecraft(app, options).await
}
