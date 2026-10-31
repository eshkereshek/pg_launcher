//! Распаковка архивов, содержимое которых приходит извне.
//!
//! Обычная распаковка «как есть» здесь не годится: natives-архивы качаются с
//! чужих maven-серверов, а `entry.name()` в zip — это строка, которую пишет
//! автор архива. Поэтому путь каждого файла проверяется через
//! `enclosed_name()`, а распаковываются только библиотеки, а не что угодно.

use std::fs::{self, File};
use std::io;
use std::path::Path;

/// Больше этого не может весить один файл из natives-архива.
const MAX_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
/// И весь архив целиком — иначе один jar может забить диск.
const MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;

/// Нативные библиотеки, которые JVM ищет на диске: `.dll`, `.so`, `.dylib`,
/// `.jnilib`. Всё остальное из архива (манифесты, `.pdb`, скрипты) не нужно.
fn is_native_library(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".dll", ".so", ".dylib", ".jnilib"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

/// Распаковать natives-архив в папку версии.
///
/// Возвращает число извлечённых файлов. Если в архиве нечего извлекать, это не
/// ошибка: некоторые библиотеки кладут natives только в отдельный classifier,
/// который сюда не попал.
pub fn extract_natives(jar_path: &Path, dir: &Path) -> Result<usize, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Не удалось создать папку natives: {}", e))?;

    let file = File::open(jar_path)
        .map_err(|e| format!("Не удалось открыть архив natives {:?}: {}", jar_path, e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Повреждённый архив natives: {}", e))?;

    let mut extracted = 0usize;
    let mut total_bytes = 0u64;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Не удалось прочитать архив natives: {}", e))?;
        if entry.is_dir() {
            continue;
        }

        let entry_name = entry.name().to_string();
        if !is_native_library(&entry_name) {
            continue;
        }

        // `../` и абсолютные пути в имени записи отбрасываем целиком.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };

        let size = entry.size();
        if size > MAX_ENTRY_BYTES {
            return Err(format!(
                "Файл {} в архиве natives слишком большой ({} МБ)",
                entry_name,
                size / 1024 / 1024
            ));
        }
        total_bytes += size;
        if total_bytes > MAX_TOTAL_BYTES {
            return Err("Архив natives слишком большой".to_string());
        }

        let out_path = dir.join(relative);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Не удалось создать папку для natives: {}", e))?;
        }

        let mut out_file = File::create(&out_path)
            .map_err(|e| format!("Не удалось записать natives {:?}: {}", out_path, e))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("Не удалось распаковать natives {:?}: {}", out_path, e))?;
        extracted += 1;
    }

    Ok(extracted)
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

    #[test]
    fn extracts_only_native_libraries() {
        let dir = std::env::temp_dir().join(format!("pg-natives-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let jar = dir.join("natives.jar");
        make_jar(
            &jar,
            &[
                ("lwjgl.dll", b"dll"),
                ("openal.dll", b"dll"),
                ("META-INF/MANIFEST.MF", b"manifest"),
                ("README.txt", b"text"),
                ("run.bat", b"evil"),
            ],
        );

        let out = dir.join("out");
        assert_eq!(extract_natives(&jar, &out).unwrap(), 2);
        assert!(out.join("lwjgl.dll").is_file());
        assert!(out.join("openal.dll").is_file());
        assert!(
            !out.join("run.bat").exists(),
            "скрипты из архива не распаковываем"
        );
        assert!(!out.join("README.txt").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_to_escape_the_target_folder() {
        let dir = std::env::temp_dir().join(format!("pg-natives-escape-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let jar = dir.join("evil.jar");
        make_jar(&jar, &[("../../evil.dll", b"dll"), ("ok.dll", b"dll")]);

        let out = dir.join("out");
        // Запись с `..` просто пропускается, нормальная — извлекается.
        assert_eq!(extract_natives(&jar, &out).unwrap(), 1);
        assert!(out.join("ok.dll").is_file());
        assert!(!dir.parent().unwrap().join("evil.dll").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
