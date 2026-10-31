//! Что лежит в папках сборки: моды, ресурспаки и шейдеры.
//!
//! Раньше список установленного читал только `mods/*.jar`, поэтому
//! ресурспаки и шейдеры туда не попадали вовсе — они лежат в соседних
//! папках и с другим расширением. Здесь собрано всё, что нужно, чтобы
//! перечислить содержимое, не думая о том, как оно называется.
//!
//! Паки бывают и папками: игроки распаковывают zip рядом с архивом, и
//! игра такие папки читает. Раньше они тоже пропадали из списка.

use std::fs;
use std::path::{Path, PathBuf};

/// Папки сборки и тип того, что в них лежит.
pub const CONTENT_DIRS: [(&str, &str); 3] = [
    ("mods", "mod"),
    ("resourcepacks", "resourcepack"),
    ("shaderpacks", "shader"),
];

/// Выключенный файл лежит как `name.jar.disabled`.
const DISABLED: &str = ".disabled";

/// Один элемент списка установленного.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentEntry {
    /// Имя на диске, включая хвост `.disabled`.
    pub file_name: String,
    /// Имя без хвоста `.disabled` — его видит игрок.
    pub title: String,
    /// `mod` / `resourcepack` / `shader`.
    pub kind: &'static str,
    /// Папка сборки, в которой лежит элемент.
    pub folder: &'static str,
    pub is_dir: bool,
    pub is_enabled: bool,
    pub path: PathBuf,
}

/// Имя без хвоста `.disabled`, регистр сохраняется.
pub fn strip_disabled(name: &str) -> &str {
    if name.len() > DISABLED.len() && name.to_lowercase().ends_with(DISABLED) {
        &name[..name.len() - DISABLED.len()]
    } else {
        name
    }
}

/// Подходит ли имя папке: моды — `jar`, паки — `zip`.
///
/// Папка внутри `resourcepacks`/`shaderpacks` — распакованный пак, игра его
/// читает так же, как архив. В `mods` папки не разбираются: там лежат jar.
pub fn matches_kind(kind: &str, name: &str, is_dir: bool) -> bool {
    let base = strip_disabled(name).to_lowercase();
    if is_dir {
        // Служебные каталоги вроде `.cache` игроку не показываем.
        return kind != "mod" && !base.starts_with('.');
    }
    if kind == "mod" {
        base.ends_with(".jar")
    } else {
        base.ends_with(".zip")
    }
}

fn entry_from(
    root: &Path,
    folder: &'static str,
    kind: &'static str,
    name: String,
    is_dir: bool,
) -> Option<ContentEntry> {
    if !matches_kind(kind, &name, is_dir) {
        return None;
    }
    let is_enabled = !name.to_lowercase().ends_with(DISABLED);
    let title = strip_disabled(&name).to_string();
    Some(ContentEntry {
        path: root.join(folder).join(&name),
        file_name: name,
        title,
        kind,
        folder,
        is_dir,
        is_enabled,
    })
}

/// Все моды, ресурспаки и шейдеры сборки. Порядок — по названию.
pub fn scan_instance(instance: &Path) -> Vec<ContentEntry> {
    let mut items: Vec<ContentEntry> = Vec::new();
    for (folder, kind) in CONTENT_DIRS {
        let Ok(entries) = fs::read_dir(instance.join(folder)) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if let Some(item) = entry_from(instance, folder, kind, name, is_dir) {
                items.push(item);
            }
        }
    }
    items.sort_by(|a, b| {
        a.kind
            .cmp(b.kind)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    items
}

/// Найти элемент по имени файла из интерфейса.
///
/// Имя приходит из вебвью, поэтому путь собирается только внутри папок
/// сборки: `..` и разделители отбрасываются заранее.
pub fn find_entry(instance: &Path, file_name: &str) -> Option<ContentEntry> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return None;
    }
    for (folder, kind) in CONTENT_DIRS {
        let path = instance.join(folder).join(file_name);
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        let is_dir = meta.is_dir();
        if let Some(item) = entry_from(instance, folder, kind, file_name.to_string(), is_dir) {
            return Some(item);
        }
    }
    None
}

/// Найти элемент по названию, как его показывает список (без `.disabled`).
pub fn find_by_title(instance: &Path, title: &str) -> Option<ContentEntry> {
    scan_instance(instance)
        .into_iter()
        .find(|item| item.title.eq_ignore_ascii_case(title))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pg-content-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut file = fs::File::create(path).unwrap();
        file.write_all(b"x").unwrap();
    }

    #[test]
    fn scans_all_three_folders() {
        let root = tmp("scan");
        touch(&root.join("mods").join("sodium.jar"));
        touch(&root.join("resourcepacks").join("Soft Light.zip"));
        touch(&root.join("shaderpacks").join("BSL.zip"));
        touch(&root.join("shaderpacks").join("borked.zip.txt"));

        let items = scan_instance(&root);
        // Порядок: сначала моды, потом ресурспаки, потом шейдеры.
        let names: Vec<&str> = items.iter().map(|i| i.title.as_str()).collect();
        assert_eq!(names, vec!["sodium.jar", "Soft Light.zip", "BSL.zip"]);

        let kinds: Vec<&str> = items.iter().map(|i| i.kind).collect();
        assert_eq!(kinds, vec!["mod", "resourcepack", "shader"]);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn disabled_file_keeps_its_extension() {
        let root = tmp("disabled");
        touch(&root.join("mods").join("jei.jar.disabled"));
        touch(&root.join("resourcepacks").join("Stay_True.zip.disabled"));
        touch(&root.join("shaderpacks").join("Complementary.zip"));

        let items = scan_instance(&root);
        assert_eq!(items.len(), 3);
        let jei = items.iter().find(|i| i.title == "jei.jar").unwrap();
        assert!(!jei.is_enabled);
        assert_eq!(jei.file_name, "jei.jar.disabled");
        let stay = items.iter().find(|i| i.kind == "resourcepack").unwrap();
        assert!(!stay.is_enabled);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn unpacked_pack_folder_is_listed() {
        let root = tmp("folder");
        // Распакованный шейдер и распакованный ресурспак — оба видны.
        fs::create_dir_all(
            root.join("shaderpacks")
                .join("HandheldCameraShader")
                .join("shaders"),
        )
        .unwrap();
        fs::create_dir_all(root.join("resourcepacks").join("MyPack")).unwrap();
        // Служебный каталог показывать не нужно.
        fs::create_dir_all(root.join("resourcepacks").join(".cache")).unwrap();

        let items = scan_instance(&root);
        assert_eq!(items.len(), 2);
        let shader = items.iter().find(|i| i.kind == "shader").unwrap();
        assert_eq!(shader.title, "HandheldCameraShader");
        assert!(shader.is_dir);
        assert!(items.iter().any(|i| i.title == "MyPack"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn find_entry_rejects_paths_outside_instance() {
        let root = tmp("guard");
        touch(&root.join("mods").join("ok.jar"));

        assert!(find_entry(&root, "ok.jar").is_some());
        assert!(find_entry(&root, "../ok.jar").is_none());
        assert!(find_entry(&root, "sub/ok.jar").is_none());
        assert!(find_entry(&root, "").is_none());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn folder_kind_follows_its_folder() {
        let root = tmp("kind");
        // Один и тот же zip в разных папках — разные типы.
        touch(&root.join("resourcepacks").join("same.zip"));
        let entry = find_entry(&root, "same.zip").unwrap();
        assert_eq!(entry.kind, "resourcepack");
        assert_eq!(entry.folder, "resourcepacks");
        let _ = fs::remove_dir_all(&root);
    }
}
