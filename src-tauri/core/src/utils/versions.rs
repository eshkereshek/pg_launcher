//! Разбор уже установленных версий: какой загрузчик стоит для какой игры.
//!
//! Раньше здесь было `name.contains(game_version)`, и запрос «1.8» подхватывал
//! уже установленный «1.8.9-forge-11.15.1.2318». Сравнивать надо либо
//! `inheritsFrom` из json версии (он есть у Forge/NeoForge), либо имя целиком,
//! по границам токенов, а не по подстроке.

use serde_json::Value;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LoaderKind {
    Forge,
    NeoForge,
    Fabric,
    Quilt,
}

impl LoaderKind {
    /// Папка в `versions/` относится к этому загрузчику.
    pub fn is_loader_dir(self, name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        match self {
            // «neoforge» тоже содержит «forge», поэтому его отсекаем отдельно.
            LoaderKind::Forge => lower.contains("forge") && !lower.contains("neoforge"),
            LoaderKind::NeoForge => lower.contains("neoforge"),
            LoaderKind::Fabric => lower.contains("fabric"),
            LoaderKind::Quilt => lower.contains("quilt"),
        }
    }
}

/// Установленная версия в том виде, в каком она нужна для выбора.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstalledVersion {
    /// Имя папки в `versions/`.
    pub name: String,
    /// Поле `inheritsFrom` из json — авторитетный признак базовой версии.
    pub inherits_from: Option<String>,
    /// Поле `id` из json (может отсутствовать в старых установках).
    pub id: Option<String>,
    /// Профиль собран через ForgeWrapper (см. `is_forgewrapper_json`).
    pub forgewrapper: bool,
}

/// Профиль собран через ForgeWrapper, а не установщиком Forge.
///
/// Такой json пишут другие лаунчеры (Prism, MultiMC): `mainClass` у него —
/// `io.github.zekerzhayard.forgewrapper.installer.Main`, то есть установщик,
/// который сам ищет `forge-*-installer.jar` в classpath. Наш лаунчер собирает
/// classpath только из `libraries/`, установщика там нет, поэтому Java падает
/// с «Unable to detect the forge installer!» ещё до старта игры.
pub fn is_forgewrapper_json(json: &Value) -> bool {
    json.get("mainClass")
        .and_then(|m| m.as_str())
        .map(|m| m.to_ascii_lowercase().contains("forgewrapper"))
        .unwrap_or(false)
}

/// Упоминает ли идентификатор версию игры целиком.
///
/// `1.8` не совпадает с `1.8.9-forge-...`, а `1.20.1` — с `1.20.10`.
pub fn mentions_version(id: &str, game_version: &str) -> bool {
    let gv = game_version.trim();
    if gv.is_empty() {
        return false;
    }
    if id.trim().eq_ignore_ascii_case(gv) {
        return true;
    }
    id.split(|c: char| c == '-' || c == '_' || c == '+' || c == ' ')
        .any(|part| part.eq_ignore_ascii_case(gv))
}

/// Выбрать установленную версию загрузчика для этой версии игры.
///
/// `loader_version` сужает выбор до конкретной версии загрузчика — нужно сразу
/// после работы установщика, чтобы вернуть именно то, что он поставил.
pub fn pick_loader(
    installed: &[InstalledVersion],
    kind: LoaderKind,
    game_version: &str,
    loader_version: Option<&str>,
) -> Option<String> {
    let mut matched: Vec<&InstalledVersion> = installed
        .iter()
        .filter(|v| {
            // Профиль ForgeWrapper для нас не «установленный загрузчик»: он
            // падает при запуске, а значит `ensure_forge` должен поставить
            // Forge обычным установщиком, а не возвращать эту папку.
            if v.forgewrapper {
                return false;
            }
            if !kind.is_loader_dir(&v.name) {
                return false;
            }

            let same_game = match v.inherits_from.as_deref() {
                Some(parent) if !parent.trim().is_empty() => {
                    parent.trim().eq_ignore_ascii_case(game_version.trim())
                }
                // Старые установки без inheritsFrom: сравниваем имя и id.
                _ => {
                    mentions_version(&v.name, game_version)
                        || v.id
                            .as_deref()
                            .map(|id| mentions_version(id, game_version))
                            .unwrap_or(false)
                }
            };
            if !same_game {
                return false;
            }

            match loader_version {
                Some(ver) => {
                    v.name.contains(ver)
                        || v.id.as_deref().map(|id| id.contains(ver)).unwrap_or(false)
                }
                None => true,
            }
        })
        .collect();

    // Детерминированный выбор: одна и та же установка при каждом запуске.
    matched.sort_by(|a, b| a.name.cmp(&b.name));
    matched.last().map(|v| v.name.clone())
}

/// Какая Java нужна этой версии игры.
///
/// Авторитетный ответ — поле `javaVersion.majorVersion` в json версии: Mojang
/// проставляет его для каждой версии, и для снапшотов оно тоже есть. У
/// Forge/NeoForge поле лежит в родительском json. Если поля нет (очень старые
/// манифесты), остаётся прикидка по номеру версии.
pub fn java_requirement(
    version_json: &Value,
    parent_json: Option<&Value>,
    version_name: &str,
) -> Option<u32> {
    let declared = version_json
        .get("javaVersion")
        .or_else(|| parent_json.and_then(|p| p.get("javaVersion")))
        .and_then(|j| j.get("majorVersion"))
        .and_then(|m| m.as_u64());
    if let Some(major) = declared {
        return u32::try_from(major).ok();
    }
    guess_java_major(version_name)
}

/// Прикидка по имени версии — на случай json без `javaVersion`.
fn guess_java_major(version_name: &str) -> Option<u32> {
    let name = version_name.trim();
    if name.starts_with("26.") || name.contains("25w") || name.contains("26w") {
        return Some(25);
    }
    if name.starts_with("1.21")
        || name.starts_with("1.20.5")
        || name.starts_with("1.20.6")
        || name.contains("1.21")
    {
        return Some(21);
    }
    if ["1.17", "1.18", "1.19", "1.20"]
        .iter()
        .any(|v| name.starts_with(v))
    {
        return Some(17);
    }
    if name.starts_with("1.") || name.starts_with("b1.") || name.starts_with("a1.") {
        return Some(8);
    }
    None
}

/// Нормализовать требование версии игры к рантайму, который умеет ставить лаунчер.
///
/// Java ставится только целыми «линейками» (8, 17, 21, 25), а манифест может
/// требовать, например, 23 или 26. Более новую линию берём с запасом, а для
/// версий новее 25 возвращаем `None` — такую Java лаунчер не знает.
pub fn supported_java(required: u32) -> Option<u32> {
    match required {
        0..=8 => Some(8),
        9..=17 => Some(17),
        18..=21 => Some(21),
        22..=25 => Some(25),
        _ => None,
    }
}

/// Поддерживает ли эта Java флаг `--enable-native-access`.
///
/// Флаг появился в Java 17, а на Java 8 JVM падает с «Unrecognized option»
/// ещё до старта игры.
pub fn native_access_supported(major: u32) -> bool {
    major >= 17
}

/// Номер версии из вывода `java -version` или из файла `release`.
///
/// Java 8 до сих пор представляется как `1.8.0_402`, поэтому после ведущей
/// единицы берём следующее число.
pub fn parse_java_version(text: &str) -> Option<u32> {
    let after_quotes = text.split("version \"").nth(1);
    let raw = match after_quotes {
        Some(rest) => rest.split('"').next().unwrap_or(""),
        None => text
            .split(|c: char| c == '"' || c.is_whitespace() || c == '=')
            .find(|part| part.chars().next().is_some_and(|c| c.is_ascii_digit()))?,
    };
    let mut parts = raw.split(|c: char| c == '.' || c == '_' || c == '+' || c == '-');
    let first: u32 = parts.next()?.parse().ok()?;
    if first == 1 {
        return parts.next()?.parse().ok();
    }
    Some(first)
}

/// Числовые части версии. Лексикографически `47.2.0` кажется новее
/// `47.10.0`, поэтому списки версий сравнивают части, а не строку.
pub fn version_parts(value: &str) -> Vec<u64> {
    value
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(name: &str, inherits: Option<&str>) -> InstalledVersion {
        InstalledVersion {
            name: name.to_string(),
            inherits_from: inherits.map(|s| s.to_string()),
            id: Some(name.to_string()),
            forgewrapper: false,
        }
    }

    fn wrapper(name: &str, inherits: Option<&str>) -> InstalledVersion {
        InstalledVersion {
            forgewrapper: true,
            ..v(name, inherits)
        }
    }

    #[test]
    fn forgewrapper_profiles_are_not_counted_as_installed() {
        // Папка от Prism/MultiMC лежит рядом, но запускать её нельзя — значит
        // установщик Forge должен поставить свою версию поверх.
        let installed = vec![wrapper("1.20.1-forge-47.4.10", Some("1.20.1"))];
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.20.1", None),
            None
        );

        // Рядом обычная установка — выбирается именно она, а не обёртка.
        let installed = vec![
            wrapper("1.20.1-forge-47.4.10", Some("1.20.1")),
            v("1.20.1-forge-47.2.0", Some("1.20.1")),
        ];
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.20.1", None),
            Some("1.20.1-forge-47.2.0".to_string())
        );
    }

    #[test]
    fn forgewrapper_is_detected_by_main_class() {
        assert!(is_forgewrapper_json(&serde_json::json!({
            "mainClass": "io.github.zekerzhayard.forgewrapper.installer.Main"
        })));
        assert!(is_forgewrapper_json(&serde_json::json!({
            "mainClass": "io.github.zekerzhayard.forgewrapper.Main"
        })));
        assert!(!is_forgewrapper_json(&serde_json::json!({
            "mainClass": "cpw.mods.bootstraplauncher.BootstrapLauncher"
        })));
        assert!(!is_forgewrapper_json(&serde_json::json!({})));
    }

    #[test]
    fn patch_version_does_not_match_its_prefix() {
        assert!(!mentions_version("1.8.9-forge-11.15.1.2318", "1.8"));
        assert!(mentions_version("1.8.9-forge-11.15.1.2318", "1.8.9"));
        assert!(mentions_version("forge-1.12.2-14.23.5.2860", "1.12.2"));
        assert!(!mentions_version("1.12.2-forge-14.23.5.2860", "1.12"));
        assert!(!mentions_version("1.20.10-neoforge-1.0", "1.20.1"));
    }

    #[test]
    fn inherits_from_wins_over_the_folder_name() {
        let installed = vec![
            v("1.8.9-forge-11.15.1.2318", Some("1.8.9")),
            v("custom-forge-profile", Some("1.12.2")),
        ];
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.12.2", None),
            Some("custom-forge-profile".to_string())
        );
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.8", None),
            None
        );
    }

    #[test]
    fn neoforge_is_not_forge() {
        let installed = vec![
            v("1.20.1-forge-47.2.0", Some("1.20.1")),
            v("1.20.1-neoforge-47.1.0", Some("1.20.1")),
        ];
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.20.1", None),
            Some("1.20.1-forge-47.2.0".to_string())
        );
        assert_eq!(
            pick_loader(&installed, LoaderKind::NeoForge, "1.20.1", None),
            Some("1.20.1-neoforge-47.1.0".to_string())
        );
    }

    #[test]
    fn loader_version_narrows_the_choice() {
        let installed = vec![
            v("1.12.2-forge-14.23.5.2859", Some("1.12.2")),
            v("1.12.2-forge-14.23.5.2860", Some("1.12.2")),
        ];
        assert_eq!(
            pick_loader(
                &installed,
                LoaderKind::Forge,
                "1.12.2",
                Some("14.23.5.2859")
            ),
            Some("1.12.2-forge-14.23.5.2859".to_string())
        );
    }

    #[test]
    fn old_installations_without_inherits_use_the_name() {
        let installed = vec![InstalledVersion {
            name: "1.7.10-Forge10.13.4.1614-1.7.10".to_string(),
            inherits_from: None,
            id: None,
            forgewrapper: false,
        }];
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.7.10", None),
            Some("1.7.10-Forge10.13.4.1614-1.7.10".to_string())
        );
        assert_eq!(
            pick_loader(&installed, LoaderKind::Forge, "1.7", None),
            None
        );
    }

    #[test]
    fn java_requirement_comes_from_the_version_json() {
        let snapshot = serde_json::json!({
            "id": "26.4-snapshot-5",
            "javaVersion": { "component": "java-runtime-epsilon", "majorVersion": 25 }
        });
        assert_eq!(
            java_requirement(&snapshot, None, "26.4-snapshot-5"),
            Some(25)
        );

        let release = serde_json::json!({ "javaVersion": { "majorVersion": 21 } });
        assert_eq!(java_requirement(&release, None, "1.21.1"), Some(21));

        // У загрузчика поле лежит в родительском json.
        let child = serde_json::json!({ "inheritsFrom": "1.21.1" });
        let parent = serde_json::json!({ "javaVersion": { "majorVersion": 21 } });
        assert_eq!(java_requirement(&child, Some(&parent), "fabric"), Some(21));
    }

    #[test]
    fn java_requirement_falls_back_to_the_version_name() {
        assert_eq!(
            java_requirement(&serde_json::json!({}), None, "1.12.2"),
            Some(8)
        );
        assert_eq!(
            java_requirement(&serde_json::json!({}), None, "1.20.1"),
            Some(17)
        );
        assert_eq!(
            java_requirement(&serde_json::json!({}), None, "1.21.11"),
            Some(21)
        );
        assert_eq!(
            java_requirement(&serde_json::json!({}), None, "25w14a"),
            Some(25)
        );
        assert_eq!(
            java_requirement(&serde_json::json!({}), None, "странная-версия"),
            None
        );
    }

    #[test]
    fn java_requirement_is_normalized_to_supported_runtimes() {
        assert_eq!(supported_java(8), Some(8));
        assert_eq!(supported_java(7), Some(8));
        assert_eq!(supported_java(16), Some(17));
        assert_eq!(supported_java(17), Some(17));
        assert_eq!(supported_java(18), Some(21));
        assert_eq!(supported_java(21), Some(21));
        assert_eq!(supported_java(23), Some(25));
        assert_eq!(supported_java(25), Some(25));
        // Java новее 25 лаунчер пока не ставит.
        assert_eq!(supported_java(26), None);
    }

    #[test]
    fn native_access_is_only_enabled_from_java_17() {
        assert!(!native_access_supported(8));
        assert!(native_access_supported(17));
        assert!(native_access_supported(25));
    }

    #[test]
    fn java_version_is_read_from_the_command_output() {
        assert_eq!(
            parse_java_version("openjdk version \"25.0.4\" 2026-01-20"),
            Some(25)
        );
        assert_eq!(
            parse_java_version("java version \"1.8.0_402\"\nJava(TM) SE Runtime"),
            Some(8)
        );
        assert_eq!(
            parse_java_version(
                "openjdk version \"21.0.12\" 2025-07-15\nOpenJDK Runtime Environment"
            ),
            Some(21)
        );
        // Файл release пишет просто значение в кавычках.
        assert_eq!(parse_java_version("JAVA_VERSION=\"17.0.9\""), Some(17));
        assert_eq!(parse_java_version("мусор без версии"), None);
    }

    #[test]
    fn version_parts_ignore_letters() {
        assert_eq!(version_parts("47.2.0"), vec![47u64, 2, 0]);
        assert_eq!(version_parts("20.4.2-beta"), vec![20u64, 4, 2]);
        assert!(version_parts("beta").is_empty());
    }

    #[test]
    fn parts_sort_double_digits_newer() {
        let mut list = vec!["47.2.0", "47.10.0", "47.9.0"];
        list.sort_by(|a, b| version_parts(b).cmp(&version_parts(a)));
        assert_eq!(list.join(" "), "47.10.0 47.9.0 47.2.0");
    }
}
