//! Распознавание папки сборки на диске.
//!
//! Лаунчеры хранят сборки по-разному: часть держит `mods` прямо в папке сборки,
//! CurseForge — во вложенной `minecraft`, а некоторые (MILIDA, TLauncher и др.)
//! копируют структуру игры в `.minecraft`. Поэтому проверяем три варианта.

use std::path::{Path, PathBuf};

/// Каталоги, которые не могут быть сборкой: служебные и наши собственные.
pub const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".git",
    "packages",
    "temp",
    "tmp",
    "cache",
    "webview2",
    "pagrysha-launcher",
    "pagrysha-launcher-data",
    ".minecraft",
    "microsoft",
];

/// Глубина поиска сборок внутри чужих каталогов: `Launcher\instances\Pack`.
pub const MAX_DEPTH: usize = 4;

/// Сколько каталогов готовы просмотреть за один скан, чтобы не подвешивать UI.
pub const MAX_DIRS: usize = 4000;

/// Возвращает каталог игры внутри папки сборки: `path`, `path/minecraft` или
/// `path/.minecraft` — тот, где есть `mods` или `config`.
pub fn game_dir(path: &Path) -> Option<PathBuf> {
    for sub in ["", "minecraft", ".minecraft"] {
        let dir = if sub.is_empty() {
            path.to_path_buf()
        } else {
            path.join(sub)
        };
        if dir.join("mods").is_dir() {
            return Some(dir);
        }
    }
    None
}

/// Похожа ли папка на сборку (есть папка mods).
pub fn is_instance(path: &Path) -> bool {
    game_dir(path).is_some()
}

/// Версия игры и загрузчик, вычитанные из метаданных чужого лаунчера.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PackMeta {
    pub game_version: String,
    pub loader: String,
    pub loader_version: String,
}

/// MILIDA: у каждой сборки в `profiles/<имя>` лежит `millida-settings.json`,
/// где записаны `version`, `loader` и `loaderVersion`.
pub fn parse_millida_settings(text: &str) -> Option<PackMeta> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let meta = PackMeta {
        game_version: value["version"].as_str().unwrap_or_default().to_string(),
        loader: value["loader"]
            .as_str()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        loader_version: value["loaderVersion"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    };
    if meta.game_version.is_empty() {
        None
    } else {
        Some(meta)
    }
}

/// JustLauncher: `installations.json` со списком установок. Ключ — `id`,
/// он же имя папки внутри `installations`.
pub fn parse_justlauncher_installations(text: &str) -> Vec<(String, PackMeta)> {
    let value: serde_json::Value = serde_json::from_str(text).unwrap_or(serde_json::Value::Null);
    value["installations"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item["id"].as_str()?.to_string();
                    Some((
                        id,
                        PackMeta {
                            game_version: item["version"].as_str().unwrap_or_default().to_string(),
                            loader: item["modloader"]["type"]
                                .as_str()
                                .unwrap_or_default()
                                .to_ascii_lowercase(),
                            loader_version: item["modloader"]["version"]
                                .as_str()
                                .unwrap_or_default()
                                .to_string(),
                        },
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}
/// Имя чужого лаунчера по пути: ближайший каталог над сборкой. Для
/// `%APPDATA%\MILIDA Launcher\instances\MyPack` это будет `MILIDA Launcher`.
pub fn launcher_name(path: &Path) -> String {
    let mut current = path.parent();
    while let Some(dir) = current {
        let name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if !name.is_empty() && !name.eq_ignore_ascii_case("instances") {
            return name;
        }
        current = dir.parent();
    }
    "Другой лаунчер".to_string()
}

/// Пропускаем служебные каталоги, чтобы скан не проваливался в кэши.
pub fn should_skip(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SKIP_DIRS.iter().any(|s| lower == *s)
}

/// Сборки, найденные рекурсивно под `root`. `source` — имя лаунчера, взятое из
/// первого уровня вложенности (например, `MILIDA Launcher`).
pub fn find_instances(root: &Path) -> Vec<(PathBuf, String)> {
    let mut found = Vec::new();
    let mut budget = MAX_DIRS;

    let Ok(entries) = std::fs::read_dir(root) else {
        return found;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }

        // Сборка может лежать прямо в первом уровне: `...\MyPack`.
        if is_instance(&path) {
            found.push((path, name.clone()));
            continue;
        }

        walk(&path, MAX_DEPTH - 1, &name, &mut budget, &mut found);
        if budget == 0 {
            break;
        }
    }

    found
}

fn walk(
    dir: &Path,
    depth: usize,
    source: &str,
    budget: &mut usize,
    found: &mut Vec<(PathBuf, String)>,
) {
    if depth == 0 || *budget == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if *budget == 0 {
            return;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }

        *budget -= 1;

        if is_instance(&path) {
            found.push((path, source.to_string()));
            continue;
        }
        walk(&path, depth - 1, source, budget, found);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "packscan_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_game_dir_in_three_layouts() {
        let root = temp_root("layouts");

        // Плоский вариант: mods прямо в папке сборки.
        let flat = root.join("Flat");
        fs::create_dir_all(flat.join("mods")).unwrap();
        assert_eq!(game_dir(&flat).unwrap(), flat);

        // CurseForge: вложенная minecraft.
        let cf = root.join("CFPack");
        fs::create_dir_all(cf.join("minecraft").join("mods")).unwrap();
        assert_eq!(game_dir(&cf).unwrap(), cf.join("minecraft"));

        // MILIDA и подобные: структура игры целиком в .minecraft.
        let milida = root.join("MilidaPack");
        fs::create_dir_all(milida.join(".minecraft").join("mods")).unwrap();
        assert_eq!(game_dir(&milida).unwrap(), milida.join(".minecraft"));

        // Пустая папка сборкой не считается.
        let empty = root.join("Empty");
        fs::create_dir_all(&empty).unwrap();
        assert!(!is_instance(&empty));

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn recursive_scan_finds_nested_instances() {
        let root = temp_root("nested");
        let launcher = root.join("MILIDA Launcher").join("instances");
        fs::create_dir_all(launcher.join("Survival").join("mods")).unwrap();
        fs::create_dir_all(launcher.join("Skyblock").join(".minecraft").join("mods")).unwrap();
        // Служебная папка не должна попадать в выдачу.
        fs::create_dir_all(root.join("node_modules").join("junk").join("mods")).unwrap();

        let found = find_instances(&root);
        let names: Vec<String> = found
            .iter()
            .map(|(p, _)| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(names.contains(&"Survival".to_string()), "{:?}", names);
        assert!(names.contains(&"Skyblock".to_string()), "{:?}", names);
        assert!(!names.contains(&"junk".to_string()), "{:?}", names);
        assert!(found.iter().all(|(_, source)| source == "MILIDA Launcher"));

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn parses_millida_profile_settings() {
        // Форма millida-settings.json из сборки The Last of Us 0.7.6.
        let text = r#"{
            "name": "The Last of Us 0.7.6",
            "version": "1.20.1",
            "loader": "forge",
            "loaderVersion": "47.4.10",
            "catalogPackSlug": "tlou",
            "catalogPackVersion": "0.7.6-fix1"
        }"#;
        let meta = parse_millida_settings(text).unwrap();
        assert_eq!(meta.game_version, "1.20.1");
        assert_eq!(meta.loader, "forge");
        assert_eq!(meta.loader_version, "47.4.10");

        // Без версии игры сборка бесполезна для импорта.
        assert!(parse_millida_settings(r#"{"loader": "fabric"}"#).is_none());
    }

    #[test]
    fn parses_justlauncher_installations() {
        // Форма installations.json: vanilla без modloader и Forge с версией.
        let text = r#"{
            "installations": [
                {"id": "26.3", "name": "26.3", "version": "26.3", "modloader": null},
                {"id": "26.3 (1)", "name": "26.3", "version": "1.20.1",
                 "modloader": {"type": "Forge", "version": "66.0.10"}}
            ]
        }"#;
        let list = parse_justlauncher_installations(text);
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].0, "26.3 (1)");
        assert_eq!(list[1].1.game_version, "1.20.1");
        assert_eq!(list[1].1.loader, "forge");
        assert_eq!(list[1].1.loader_version, "66.0.10");
        // Без modloader загрузчик остаётся пустым, но установка видна.
        assert_eq!(list[0].1.loader, "");
    }

    #[test]
    fn launcher_name_skips_instances_folder() {
        let path = Path::new("/home/u/AppData/Roaming/MILIDA Launcher/instances/Pack");
        assert_eq!(launcher_name(path), "MILIDA Launcher");
    }

    #[test]
    fn service_folders_are_skipped() {
        assert!(should_skip("node_modules"));
        assert!(should_skip("Cache"));
        assert!(should_skip("pagrysha-launcher"));
        assert!(!should_skip("MILIDA Launcher"));
    }
}
