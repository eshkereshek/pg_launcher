use tauri::Window;

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_maximize(window: Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn window_hide(window: Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn window_show(window: Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    // open::that запускает и файлы, и обработчики протоколов: мимо http/https
    // ссылка из интерфейса проходить не должна.
    crate::utils::guard::external_url(&url)?;
    open::that(url).map_err(|e| e.to_string())
}
