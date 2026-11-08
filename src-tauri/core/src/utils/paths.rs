use std::path::PathBuf;

/// Папка данных, выбранная при установке: установщик кладёт рядом с exe файл
/// `data-dir.txt` с абсолютным путём. Так игрок, поставивший лаунчер на D:,
/// получает версии и миры на том же диске, а не в AppData.
fn install_data_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let marker = exe.parent()?.join("data-dir.txt");
    let text = std::fs::read_to_string(marker).ok()?;
    let path = PathBuf::from(text.trim());
    // Только абсолютный путь: относительный зависел бы от текущего каталога.
    if path.is_absolute() {
        Some(path)
    } else {
        None
    }
}

pub fn get_app_data_dir() -> PathBuf {
    // 1. Переопределение для отладки и переносимой сборки.
    if let Ok(dir) = std::env::var("PG_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir.trim());
        }
    }
    // 2. Выбор установщика: данные рядом с установленным лаунчером.
    if let Some(dir) = install_data_dir() {
        return dir;
    }
    // 3. Обычный путь Windows.
    let base = dirs::data_dir()
        .or_else(dirs::config_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("pagrysha-launcher")
}

pub fn get_minecraft_root() -> PathBuf {
    get_app_data_dir().join("minecraft_data")
}

pub fn get_settings_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

pub fn get_accounts_path() -> PathBuf {
    get_app_data_dir().join("accounts.json")
}

pub fn get_modpacks_path() -> PathBuf {
    get_app_data_dir().join("modpacks.json")
}

pub fn get_skins_dir() -> PathBuf {
    get_app_data_dir().join("skins")
}

pub fn get_java_dir() -> PathBuf {
    get_app_data_dir().join("runtime")
}

pub fn get_log_path() -> PathBuf {
    get_app_data_dir().join("minecraft_launcher.log")
}
