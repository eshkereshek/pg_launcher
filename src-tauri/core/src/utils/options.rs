//! Разбор и слияние `options.txt` — файла настроек игры.
//!
//! Игра хранит настройки игрока в текстовых парах `ключ:значение`. Лаунчеру
//! нужно точечно поправить несколько ключей, не трогая остальные: иначе вместе
//! с языком слетают бинды и чувствительность мыши. Логика вынесена в чистую
//! функцию, чтобы её можно было проверить тестом без Tauri.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

/// Настройки игрока, которые лаунчер умеет переносить в сборку. Имена — ровно
/// те ключи, которые использует игра в options.txt.
pub const PLAYER_KEYS: [&str; 3] = ["lang", "guiScale", "narrator"];

/// Меняет и/или добавляет пары `ключ:значение` в тексте options.txt.
///
/// Порядок существующих строк сохраняется, незнакомые строки остаются как
/// были, стиль переводов строк (CRLF/LF) берётся из файла, и файл всегда
/// заканчивается переводом строки — так его перечитывает игра и так же его
/// пишет сама.
pub fn merge_options_text(content: &str, values: &[(&str, &str)]) -> String {
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    let mut lines: Vec<String> = content
        .split('\n')
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect();
    // Файл обычно обрывается переводом строки — пустой хвост не настоящая
    // запись, убираем, чтобы не копить пустые строки.
    if matches!(lines.last().map(|line| line.is_empty()), Some(true)) {
        lines.pop();
    }

    for (key, value) in values {
        let prefix = format!("{key}:");
        match lines.iter_mut().find(|line| line.starts_with(&prefix)) {
            Some(line) => *line = format!("{key}:{value}"),
            None => lines.push(format!("{key}:{value}")),
        }
    }

    let mut out = lines.join(eol);
    if !out.is_empty() {
        out.push_str(eol);
    }
    out
}

/// Значения ключей из текста options.txt.
pub fn parse_options_text(content: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in content.lines() {
        if let Some((key, value)) = line.trim().split_once(':') {
            map.insert(key.to_string(), value.to_string());
        }
    }
    map
}

/// Пишет значения в `<game_dir>/options.txt`. Файла ещё нет — создаётся.
pub fn write_options(game_dir: &Path, values: &[(&str, &str)]) -> io::Result<()> {
    if values.is_empty() {
        return Ok(());
    }

    let path = game_dir.join("options.txt");
    let content = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e),
    };

    let merged = merge_options_text(&content, values);
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)?;
    file.write_all(merged.as_bytes())
}

/// Читает `PLAYER_KEYS` из `<game_dir>/options.txt`; чего нет — того нет.
pub fn read_player_options(game_dir: &Path) -> BTreeMap<String, String> {
    let content = fs::read_to_string(game_dir.join("options.txt")).unwrap_or_default();
    let all = parse_options_text(&content);
    PLAYER_KEYS
        .iter()
        .filter_map(|key| {
            all.get(*key)
                .map(|value| ((*key).to_string(), value.clone()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_key_is_replaced_in_place() {
        let content = "lang:en_us\nguiScale:0\nrenderDistance:12\n";
        let merged = merge_options_text(content, &[("lang", "ru_ru")]);
        assert_eq!(merged, "lang:ru_ru\nguiScale:0\nrenderDistance:12\n");
    }

    #[test]
    fn missing_key_is_appended() {
        let content = "lang:en_us\n";
        let merged = merge_options_text(content, &[("narrator", "0")]);
        assert_eq!(merged, "lang:en_us\nnarrator:0\n");
    }

    #[test]
    fn crlf_style_is_preserved() {
        let content = "lang:en_us\r\nguiScale:0\r\n";
        let merged = merge_options_text(content, &[("lang", "ru_ru"), ("guiScale", "2")]);
        assert_eq!(merged, "lang:ru_ru\r\nguiScale:2\r\n");
    }

    #[test]
    fn empty_file_gets_keys_and_trailing_newline() {
        let merged = merge_options_text("", &[("lang", "de_de")]);
        assert_eq!(merged, "lang:de_de\n");
    }

    #[test]
    fn file_without_trailing_newline_stays_valid() {
        let merged = merge_options_text("lang:en_us", &[("guiScale", "3")]);
        assert_eq!(merged, "lang:en_us\nguiScale:3\n");
    }

    #[test]
    fn key_is_not_duplicated() {
        let content = "lang:en_us\n";
        let merged = merge_options_text(content, &[("lang", "fr_fr"), ("lang", "pl_pl")]);
        assert_eq!(merged, "lang:pl_pl\n");
        assert_eq!(merged.matches("lang:").count(), 1);
    }

    #[test]
    fn parse_reads_known_values() {
        let map =
            parse_options_text("lang:ru_ru\nguiScale:2\nnarrator:0\nkey_forward:key.wasd.w\n");
        assert_eq!(map.get("lang").map(|s| s.as_str()), Some("ru_ru"));
        assert_eq!(map.get("guiScale").map(|s| s.as_str()), Some("2"));
        assert_eq!(map.get("narrator").map(|s| s.as_str()), Some("0"));
    }
}
