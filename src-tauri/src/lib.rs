pub mod commands;
pub mod minecraft;
pub mod utils;

use commands::ai::*;
use commands::auth::*;
use commands::config::*;
use commands::curseforge::*;
use commands::java::*;
use commands::loaders::*;
use commands::mods::*;
use commands::servers::*;
use commands::skins::*;
use commands::translate::*;
use commands::updater::*;
use commands::window::*;
use minecraft::launcher::*;
use minecraft::manifest::*;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let exe_name = std::env::current_exe()
                .ok()
                .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                .unwrap_or_default();
            // Те же признаки установщика, что и в командах: одна проверка на
            // весь лаунчер, без догадок про путь установки.
            let is_inst = crate::utils::guard::is_installer_run(&args, &exe_name);

            if is_inst {
                if let Some(window) = app.get_webview_window("main") {
                    let size = tauri::Size::Logical(tauri::LogicalSize {
                        width: 800.0,
                        height: 500.0,
                    });
                    let _ = window.set_min_size(Some(size));
                    let _ = window.set_max_size(Some(size));
                    let _ = window.set_size(size);
                    let _ = window.center();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window controls
            window_minimize,
            window_maximize,
            window_close,
            window_hide,
            window_show,
            open_external,
            // Configuration & Persistence
            get_settings,
            read_game_options,
            save_settings,
            reset_settings,
            get_accounts,
            save_accounts,
            get_modpacks,
            save_modpacks,
            open_folder,
            clear_cache,
            get_system_info,
            // Skins
            get_skins,
            save_skin,
            delete_skin,
            select_skin_file,
            select_icon_file,
            read_local_image,
            fetch_image_data,
            get_elyby_skin,
            log_skin_debug,
            equip_elyby_skin,
            // Servers
            search_modrinth_servers,
            get_modrinth_server,
            // Authentication
            auth_elyby,
            auth_elyby_validate,
            auth_elyby_refresh,
            auth_microsoft,
            // Mods & Modpacks
            get_installed_mods,
            list_loader_versions,
            get_mods_metadata,
            toggle_mod,
            uninstall_mod,
            delete_modpack_folder,
            rename_modpack_folder,
            import_mod_file,
            import_mod_paths,
            search_mods,
            get_popular_mods,
            get_popular_modpacks,
            search_modpacks,
            download_mod,
            install_optifine,
            install_modpack,
            // CurseForge
            cf_search,
            cf_categories,
            cf_versions,
            cf_project,
            cf_install_content,
            cf_install_modpack,
            cf_detect_packs,
            cf_import_pack,
            // ИИ-сборщик
            ai_status,
            ai_plan,
            ai_history_load,
            ai_history_save,
            // Перевод описаний
            translate_text,
            // Java Runtime
            get_installed_javas,
            install_java,
            clean_uninstall_java,
            // Updater & Installer
            check_updates,
            download_and_run_update,
            is_installer,
            select_folder,
            get_default_install_path,
            install_app,
            create_shortcuts,
            launch_installed,
            check_is_installed,
            uninstall_app,
            update_discord_presence,
            // Minecraft Core
            get_versions,
            launch_game,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
