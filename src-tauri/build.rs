use std::path::Path;

/// Ключи провайдеров ИИ берутся из `.keys.local` рядом с крейтом и попадают в
/// бинарник через `cargo:rustc-env`. Файл в .gitignore, поэтому в репозиторий
/// и в историю коммитов ключи не попадают; в CI файл создаётся из секретов.
fn load_local_keys() {
    let path = Path::new(".keys.local");
    println!("cargo:rerun-if-changed=.keys.local");
    println!("cargo:rerun-if-changed=../.keys.local");

    for candidate in [path, Path::new("../.keys.local")] {
        let Ok(text) = std::fs::read_to_string(candidate) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let (key, value) = (key.trim(), value.trim());
            if key.is_empty() || value.is_empty() {
                continue;
            }
            println!("cargo:rustc-env={key}={value}");
        }
        break;
    }
}

fn main() {
    load_local_keys();
    tauri_build::build();
}
