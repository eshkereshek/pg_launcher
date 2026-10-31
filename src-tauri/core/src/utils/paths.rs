use std::path::PathBuf;

pub fn get_app_data_dir() -> PathBuf {
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
