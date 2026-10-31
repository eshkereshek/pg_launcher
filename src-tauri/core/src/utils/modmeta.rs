//! Название и иконка мода из его jar.
//!
//! В списке установленных модов до этого показывалось имя файла
//! (`worldedit-mod-7.2.15.jar`) и первая буква вместо иконки. Настоящие данные
//! лежат внутри jar, в манифесте загрузчика, и у каждого он свой:
//! `fabric.mod.json`, `quilt.mod.json`, `META-INF/mods.toml` (Forge/NeoForge)
//! или `mcmod.info` (1.12 и раньше).
//!
//! Архив мода — чужой файл, поэтому читаются только конкретные записи с
//! ограничением размера, а иконка отдаётся лишь если похожа на картинку.

use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek};
use std::path::Path;

/// Больше этого логотип мода не читаем: это иконка в списке, а не обложка.
const MAX_ICON_BYTES: u64 = 256 * 1024;
/// Манифест мода — это килобайты; больше читать незачем.
const MAX_META_BYTES: u64 = 512 * 1024;
/// Название пака в списке — одна строка: длинное описание обрезаем.
const MAX_PACK_NAME_CHARS: usize = 60;

/// Логотип мода и его MIME-тип.
pub struct ModIcon {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// Что удалось вытащить из jar.
#[derive(Default)]
pub struct ModMeta {
    /// Человеческое название («WorldEdit»), а не имя файла.
    pub name: Option<String>,
    pub mod_id: Option<String>,
    pub version: Option<String>,
    pub icon: Option<ModIcon>,
}

/// Прочитать метаданные мода. `None` — файл не похож на мод или не читается.
pub fn read_mod_meta(jar: &Path) -> Option<ModMeta> {
    let file = File::open(jar).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    if let Some(meta) = from_fabric(&mut archive) {
        return Some(meta);
    }
    if let Some(meta) = from_quilt(&mut archive) {
        return Some(meta);
    }
    for manifest in ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"] {
        if let Some(meta) = from_toml(&mut archive, manifest) {
            return Some(meta);
        }
    }
    from_mcmod_info(&mut archive)
}

/// Прочитать запись архива по имени (регистр и `\` в пути не важны).
fn read_entry(archive: &mut zip::ZipArchive<File>, wanted: &str, cap: u64) -> Option<Vec<u8>> {
    let index = entry_index(archive, wanted)?;
    let entry = archive.by_index(index).ok()?;
    if entry.size() > cap {
        return None;
    }
    let mut bytes = Vec::new();
    entry.take(cap).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

fn entry_index(archive: &mut zip::ZipArchive<File>, wanted: &str) -> Option<usize> {
    let wanted = wanted.replace('\\', "/");
    for index in 0..archive.len() {
        let Ok(entry) = archive.by_index_raw(index) else {
            continue;
        };
        let name = entry.name().replace('\\', "/");
        if name.eq_ignore_ascii_case(&wanted) {
            return Some(index);
        }
    }
    None
}

fn icon_from_json(icon: &Value) -> Option<String> {
    match icon {
        // Обычная строка: путь к картинке внутри jar.
        Value::String(path) => Some(path.clone()),
        // Fabric разрешает набор размеров: берём самый крупный.
        Value::Object(map) => {
            let mut best: Option<(u64, String)> = None;
            for (key, value) in map {
                if let (Ok(size), Some(path)) = (key.parse::<u64>(), value.as_str()) {
                    if best.as_ref().map(|(s, _)| size > *s).unwrap_or(true) {
                        best = Some((size, path.to_string()));
                    }
                }
            }
            best.map(|(_, path)| path)
        }
        _ => None,
    }
}

fn with_icon(archive: &mut zip::ZipArchive<File>, path: Option<String>) -> Option<ModIcon> {
    let path = path?;
    let bytes = read_entry(archive, &path, MAX_ICON_BYTES)?;
    let mime = sniff_image(&bytes)?;
    Some(ModIcon { mime, bytes })
}

/// Тип картинки по первым байтам: расширению из jar верить нельзя.
fn sniff_image(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg".to_string());
    }
    if bytes.starts_with(b"GIF8") {
        return Some("image/gif".to_string());
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    // SVG как иконка встречается редко, но браузер его покажет.
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(256)]).to_lowercase();
    if head.contains("<svg") {
        return Some("image/svg+xml".to_string());
    }
    None
}

fn from_fabric(archive: &mut zip::ZipArchive<File>) -> Option<ModMeta> {
    let bytes = read_entry(archive, "fabric.mod.json", MAX_META_BYTES)?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    let icon_path = icon_from_json(&json["icon"]);
    Some(ModMeta {
        name: json["name"].as_str().map(str::to_string),
        mod_id: json["id"].as_str().map(str::to_string),
        version: json["version"].as_str().map(str::to_string),
        icon: with_icon(archive, icon_path),
    })
}

fn from_quilt(archive: &mut zip::ZipArchive<File>) -> Option<ModMeta> {
    let bytes = read_entry(archive, "quilt.mod.json", MAX_META_BYTES)?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    let loader = &json["quilt_loader"];
    let metadata = &json["metadata"];
    let icon_path = metadata["icon"]
        .as_str()
        .map(str::to_string)
        .or_else(|| icon_from_json(&metadata["icon"]));
    let name = metadata["name"]
        .as_str()
        .map(str::to_string)
        .or_else(|| loader["id"].as_str().map(str::to_string));
    Some(ModMeta {
        name,
        mod_id: loader["id"].as_str().map(str::to_string),
        version: loader["version"].as_str().map(str::to_string),
        icon: with_icon(archive, icon_path),
    })
}

fn from_mcmod_info(archive: &mut zip::ZipArchive<File>) -> Option<ModMeta> {
    let bytes = read_entry(archive, "mcmod.info", MAX_META_BYTES)?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    // До 1.12 это массив, в промежуточных версиях — объект с `modList`.
    let first = json
        .as_array()
        .and_then(|a| a.first())
        .or_else(|| json["modList"].as_array().and_then(|a| a.first()))?;
    let icon_path = first["logoFile"].as_str().map(str::to_string);
    Some(ModMeta {
        name: first["name"].as_str().map(str::to_string),
        mod_id: first["modid"].as_str().map(str::to_string),
        version: first["version"].as_str().map(str::to_string),
        icon: with_icon(archive, icon_path),
    })
}

fn from_toml(archive: &mut zip::ZipArchive<File>, manifest: &str) -> Option<ModMeta> {
    let bytes = read_entry(archive, manifest, MAX_META_BYTES)?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    let fields = first_toml_mod(&text);
    // Манифест есть, но `[[mods]]` в нём не нашлось: пусть сработает следующий
    // формат, а не пустая запись.
    if fields.is_empty() {
        return None;
    }

    let name = fields
        .get("displayName")
        .cloned()
        // В старых манифестах displayName может отсутствовать — тогда modId.
        .or_else(|| fields.get("modId").cloned());
    let icon_path = fields.get("logoFile").cloned();
    Some(ModMeta {
        name,
        mod_id: fields.get("modId").cloned(),
        version: fields.get("version").cloned(),
        icon: with_icon(archive, icon_path),
    })
}

/// Поля первой секции `[[mods]]` из mods.toml.
///
/// Полноценный TOML-парсер здесь не нужен: манифест Forge/NeoForge — это
/// набор простых `ключ = "значение"` внутри `[[mods]]`, а вторая секция
/// описывает зависимости. Ограничиваемся ими, чтобы не тянуть зависимость.
fn first_toml_mod(text: &str) -> HashMap<String, String> {
    let mut fields = HashMap::new();
    let mut inside = false;
    let mut seen = false;

    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("[[") {
            if inside {
                break;
            }
            inside = line.eq_ignore_ascii_case("[[mods]]");
            seen |= inside;
            continue;
        }
        if line.starts_with('[') {
            // Обычная секция внутри [[mods]] (например [mods.dependencies]).
            if inside {
                break;
            }
            continue;
        }
        if !inside || line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !matches!(key, "modId" | "displayName" | "version" | "logoFile") {
            continue;
        }
        if let Some(parsed) = toml_string(value) {
            fields.entry(key.to_string()).or_insert(parsed);
        }
    }

    if seen {
        fields
    } else {
        HashMap::new()
    }
}

/// Строковое значение TOML в кавычках (обычных или одинарных).
fn toml_string(value: &str) -> Option<String> {
    let value = value.trim();
    let quote = value.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let rest = &value[1..];
    let end = rest.find(quote)?;
    Some(rest[..end].replace("\\\"", "\""))
}

/// Что лежит в zip: шейдеры или ресурспак.
///
/// Различать по имени файла нельзя: игроки переименовывают паки как хотят.
/// Шейдеры всегда держат внутри папку `shaders/`, у ресурспака есть `pack.mcmeta`.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PackKind {
    Shader,
    ResourcePack,
}

/// Есть ли в архиве папка `shaders/`.
fn has_shader_folder<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> bool {
    for index in 0..archive.len() {
        let Ok(entry) = archive.by_index_raw(index) else {
            continue;
        };
        let name = entry.name().replace('\\', "/").to_lowercase();
        if name.starts_with("shaders/") {
            return true;
        }
    }
    false
}

/// Тип пака по файлу на диске. `None` — файл не читается как zip.
pub fn detect_pack_kind(path: &Path) -> Option<PackKind> {
    let file = File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    Some(if has_shader_folder(&mut archive) {
        PackKind::Shader
    } else {
        PackKind::ResourcePack
    })
}

/// Тип пака по его содержимому: файл приходит из вебвью байтами.
pub fn detect_pack_kind_bytes(bytes: &[u8]) -> Option<PackKind> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).ok()?;
    Some(if has_shader_folder(&mut archive) {
        PackKind::Shader
    } else {
        PackKind::ResourcePack
    })
}

/// Описание пака из `pack.mcmeta`. В разных версиях это либо строка, либо
/// текстовый компонент, либо их список — поддерживаем все три вида.
fn pack_description(bytes: &[u8]) -> Option<String> {
    let json: Value = serde_json::from_slice(bytes).ok()?;
    let description = &json["pack"]["description"];
    let text = match description {
        Value::String(text) => text.clone(),
        Value::Object(map) => map.get("text")?.as_str()?.to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(|text| text.as_str()))
            .collect::<String>(),
        _ => return None,
    };
    // В описаниях встречаются цветовые коды вида `§a` и переводы строк: в
    // списке они лишние, а абзац текста не помещается в строку названия.
    let cleaned = strip_color_codes(&text);
    let squashed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if squashed.is_empty() {
        return None;
    }
    Some(truncate_chars(&squashed, MAX_PACK_NAME_CHARS))
}

/// Обрезать строку по символам (не по байтам: кириллица и эмодзи).
fn truncate_chars(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut out: String = text.chars().take(limit.saturating_sub(1)).collect();
    out.push('…');
    out
}

/// Убирает `§x`-пары, которыми размечены цвет и форматирование текста.
fn strip_color_codes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        if ch == '\u{a7}' {
            chars.next();
            continue;
        }
        out.push(ch);
    }
    out
}

/// Название и картинка ресурспака или шейдерпака из его zip.
///
/// Шейдеры обычно без `pack.mcmeta` — тогда остаётся только картинка,
/// если автор её положил. `None` — в архиве нет ничего полезного.
pub fn read_pack_meta(zip: &Path) -> Option<ModMeta> {
    let file = File::open(zip).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    let name = read_entry(&mut archive, "pack.mcmeta", MAX_META_BYTES)
        .and_then(|bytes| pack_description(&bytes));
    let icon = with_icon(&mut archive, Some("pack.png".to_string()));

    if name.is_none() && icon.is_none() {
        return None;
    }
    Some(ModMeta {
        name,
        mod_id: None,
        version: None,
        icon,
    })
}

/// Прочитать файл, если он не больше предела. `None` — файла нет или он
/// подозрительно большой для метаданных пака.
fn read_capped(path: &Path, cap: u64) -> Option<Vec<u8>> {
    let size = std::fs::metadata(path).ok()?.len();
    if size > cap {
        return None;
    }
    std::fs::read(path).ok()
}

/// Название и картинка пака, распакованного в папку.
///
/// Распакованные паки игра читает наравне с zip, но список установленного их
/// не видел: файла-архива нет, а папку никто не разбирал.
pub fn read_pack_meta_dir(dir: &Path) -> Option<ModMeta> {
    let name = read_capped(&dir.join("pack.mcmeta"), MAX_META_BYTES)
        .and_then(|bytes| pack_description(&bytes));
    let icon = read_capped(&dir.join("pack.png"), MAX_ICON_BYTES).and_then(|bytes| {
        let mime = sniff_image(&bytes)?;
        Some(ModIcon { mime, bytes })
    });

    if name.is_none() && icon.is_none() {
        return None;
    }
    Some(ModMeta {
        name,
        mod_id: None,
        version: None,
        icon,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn make_jar(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
    }

    fn tmp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("pg-modmeta-{}-{}", std::process::id(), name))
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];

    #[test]
    fn fabric_manifest_gives_name_and_icon() {
        let jar = tmp("fabric.jar");
        let manifest =
            br#"{"id":"sodium","name":"Sodium","version":"0.5.8","icon":"assets/sodium/icon.png"}"#;
        make_jar(
            &jar,
            &[
                ("fabric.mod.json", manifest),
                ("assets/sodium/icon.png", PNG),
            ],
        );

        let meta = read_mod_meta(&jar).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Sodium"));
        assert_eq!(meta.mod_id.as_deref(), Some("sodium"));
        assert_eq!(meta.version.as_deref(), Some("0.5.8"));
        assert_eq!(meta.icon.unwrap().mime, "image/png");

        let _ = std::fs::remove_file(&jar);
    }

    #[test]
    fn forge_manifest_gives_name_and_logo() {
        let jar = tmp("forge.jar");
        let manifest = br#"
modLoader="javafml"
loaderVersion="[47,)"

[[mods]]
modId="worldedit"
version="7.2.15"
displayName="WorldEdit"
logoFile="logo.png"
description='''
multi
line
'''

[[dependencies.worldedit]]
modId="forge"
"#;
        make_jar(&jar, &[("META-INF/mods.toml", manifest), ("logo.png", PNG)]);

        let meta = read_mod_meta(&jar).unwrap();
        assert_eq!(meta.name.as_deref(), Some("WorldEdit"));
        assert_eq!(meta.mod_id.as_deref(), Some("worldedit"));
        assert_eq!(meta.version.as_deref(), Some("7.2.15"));
        assert!(meta.icon.is_some());

        let _ = std::fs::remove_file(&jar);
    }

    #[test]
    fn legacy_mcmod_info_is_understood() {
        let jar = tmp("legacy.jar");
        let manifest = br#"[{"modid":"jei","name":"Just Enough Items","version":"4.16"}]"#;
        make_jar(&jar, &[("mcmod.info", manifest)]);

        let meta = read_mod_meta(&jar).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Just Enough Items"));
        assert!(meta.icon.is_none());

        let _ = std::fs::remove_file(&jar);
    }

    #[test]
    fn jar_without_manifest_is_skipped() {
        let jar = tmp("plain.jar");
        make_jar(&jar, &[("README.txt", b"nothing")]);
        assert!(read_mod_meta(&jar).is_none());
        let _ = std::fs::remove_file(&jar);
    }

    #[test]
    fn icon_that_is_not_an_image_is_ignored() {
        let jar = tmp("badicon.jar");
        let manifest = br#"{"id":"x","name":"X","icon":"icon.png"}"#;
        make_jar(
            &jar,
            &[
                ("fabric.mod.json", manifest),
                ("icon.png", b"<html>not an image</html>"),
            ],
        );
        let meta = read_mod_meta(&jar).unwrap();
        assert!(meta.icon.is_none());
        let _ = std::fs::remove_file(&jar);
    }

    #[test]
    fn pack_meta_gives_description_and_icon() {
        let zip = tmp("pack.zip");
        let meta_json =
            "{\"pack\":{\"pack_format\":15,\"description\":\"\u{a7}7Soft Light\"}}".as_bytes();
        make_jar(&zip, &[("pack.mcmeta", meta_json), ("pack.png", PNG)]);

        let meta = read_pack_meta(&zip).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Soft Light"));
        assert_eq!(meta.icon.unwrap().mime, "image/png");
        let _ = std::fs::remove_file(&zip);
    }

    #[test]
    fn pack_description_object_and_array_are_understood() {
        let zip = tmp("pack-object.zip");
        let meta_json = br#"{"pack":{"description":{"text":"Night Sky"}}}"#;
        make_jar(&zip, &[("pack.mcmeta", meta_json)]);
        let meta = read_pack_meta(&zip).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Night Sky"));
        let _ = std::fs::remove_file(&zip);

        let zip = tmp("pack-array.zip");
        let meta_json = br#"{"pack":{"description":[{"text":"Old "},{"text":"School"}]}}"#;
        make_jar(&zip, &[("pack.mcmeta", meta_json)]);
        let meta = read_pack_meta(&zip).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Old School"));
        let _ = std::fs::remove_file(&zip);
    }

    #[test]
    fn shader_folder_is_detected() {
        let zip = tmp("shader.zip");
        make_jar(
            &zip,
            &[("shaders/world0/gbuffers_terrain.fsh", b"// shader")],
        );
        assert_eq!(detect_pack_kind(&zip), Some(PackKind::Shader));
        let _ = std::fs::remove_file(&zip);

        let zip = tmp("resource.zip");
        make_jar(&zip, &[("pack.mcmeta", br#"{"pack":{"description":"x"}}"#)]);
        assert_eq!(detect_pack_kind(&zip), Some(PackKind::ResourcePack));
        let _ = std::fs::remove_file(&zip);
    }

    #[test]
    fn zip_without_pack_files_is_skipped() {
        let zip = tmp("empty.zip");
        make_jar(&zip, &[("readme.txt", b"nothing")]);
        assert!(read_pack_meta(&zip).is_none());
        let _ = std::fs::remove_file(&zip);
    }

    #[test]
    fn pack_description_is_one_short_line() {
        let zip = tmp("pack-long.zip");
        let meta_json = r#"{"pack":{"description":"3D   Animated\nTorches! By someone with a very long name indeed, longer than sixty characters"}}"#;
        make_jar(&zip, &[("pack.mcmeta", meta_json.as_bytes())]);

        let meta = read_pack_meta(&zip).unwrap();
        let name = meta.name.unwrap();
        assert!(!name.contains('\n'));
        assert!(!name.contains("  "));
        assert_eq!(name.chars().count(), MAX_PACK_NAME_CHARS);
        assert!(name.ends_with('…'));
        let _ = std::fs::remove_file(&zip);
    }

    #[test]
    fn unpacked_pack_folder_gives_name_and_icon() {
        let dir = tmp("unpacked");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("pack.mcmeta"),
            br#"{"pack":{"description":"Folder Pack"}}"#,
        )
        .unwrap();
        std::fs::write(dir.join("pack.png"), PNG).unwrap();

        let meta = read_pack_meta_dir(&dir).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Folder Pack"));
        assert_eq!(meta.icon.unwrap().mime, "image/png");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_without_pack_files_is_skipped() {
        let dir = tmp("unpacked-empty");
        std::fs::create_dir_all(&dir).unwrap();
        assert!(read_pack_meta_dir(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
