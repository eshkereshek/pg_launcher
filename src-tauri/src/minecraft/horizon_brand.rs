//! «Ванильный» вид окна Horizon: заголовок и иконка как у обычного Minecraft.
//!
//! Horizon жёстко ставит окну титул `"Horizon"` и свою иконку (game.rs в
//! апстриме), флагов на это нет. Поэтому после запуска лаунчер сам находит
//! окно дочернего процесса и перекрашивает его: `SetWindowTextW` +
//! `WM_SETICON` (межпроцессная установка иконок — проверенный годами приём,
//! пользовательские скрипты AHK делают ровно так). Иконку берём настоящую
//! minecraft-овскую: те же `icons/icon_*x*.png`, из которых ставит иконку
//! Java-версия (в jar 26.x их больше нет — они живут в `assets/objects/`).
//! Заголовок — `Minecraft`: единственная строка-титул в ванильном
//! `Minecraft.class`.

use crate::utils::paths::get_minecraft_root;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const ICON_NAMES: [&str; 5] = [
    "icons/icon_16x16.png",
    "icons/icon_32x32.png",
    "icons/icon_48x48.png",
    "icons/icon_128x128.png",
    "icons/icon_256x256.png",
];

/// Собирает многоразмерный `minecraft.ico` из объектов ассетов. Готовый файл
/// не пересобираем. Возвращает None, если ассеты ещё не скачаны — тогда
/// ограничимся одним заголовком.
pub fn build_vanilla_ico(out_dir: &Path) -> Option<PathBuf> {
    let ico_path = out_dir.join("minecraft.ico");
    if ico_path.is_file() {
        return Some(ico_path);
    }
    let root = get_minecraft_root();
    let idx_dir = root.join("assets").join("indexes");
    let mut indexes: Vec<PathBuf> = fs::read_dir(&idx_dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|e| e == "json").unwrap_or(false))
        .collect();
    indexes.sort();
    indexes.reverse(); // свежие индексы предпочтительнее старых
    for idx in indexes {
        let text = fs::read_to_string(&idx).ok()?;
        let data: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let objects = match data.get("objects").and_then(Value::as_object) {
            Some(o) => o,
            None => continue,
        };
        let mut blobs: Vec<Vec<u8>> = Vec::new();
        let mut ready = true;
        for name in ICON_NAMES {
            let hash = objects
                .get(name)
                .and_then(|o| o.get("hash"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if hash.len() < 4 {
                ready = false;
                break;
            }
            let obj = root
                .join("assets")
                .join("objects")
                .join(&hash[0..2])
                .join(hash);
            match fs::read(&obj) {
                Ok(b) if b.len() > 24 => blobs.push(b),
                _ => {
                    ready = false;
                    break;
                }
            }
        }
        if !ready {
            continue;
        }
        let ico = match build_ico(&blobs) {
            Some(v) => v,
            None => continue,
        };
        let _ = fs::create_dir_all(out_dir);
        if fs::write(&ico_path, ico).is_ok() {
            return Some(ico_path);
        }
    }
    None
}

/// Размер PNG из IHDR (big-endian на смещениях 16 и 20).
fn png_size(blob: &[u8]) -> Option<(u32, u32)> {
    if blob.len() < 24 || &blob[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes([blob[16], blob[17], blob[18], blob[19]]);
    let h = u32::from_be_bytes([blob[20], blob[21], blob[22], blob[23]]);
    Some((w, h))
}

/// ICO-контейнер с PNG-картинками внутри — формат понимают Vista и новее,
/// `LoadImageW` грузит его как есть.
fn build_ico(blobs: &[Vec<u8>]) -> Option<Vec<u8>> {
    let count = blobs.len();
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&[0u8, 0, 1, 0]); // reserved, тип 1 = иконка
    out.extend_from_slice(&(count as u16).to_le_bytes());
    let mut offset = (6 + 16 * count) as u32;
    for blob in blobs {
        let (w, h) = png_size(blob)?;
        out.push(if w >= 256 { 0u8 } else { w as u8 });
        out.push(if h >= 256 { 0u8 } else { h as u8 });
        out.push(0); // палитра
        out.push(0); // резерв
        out.extend_from_slice(&1u16.to_le_bytes()); // planes
        out.extend_from_slice(&32u16.to_le_bytes()); // bitCount
        out.extend_from_slice(&(blob.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += blob.len() as u32;
    }
    for blob in blobs {
        out.extend_from_slice(blob);
    }
    Some(out)
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;

    type Hwnd = *mut c_void;
    type LParam = isize;
    type WParam = usize;
    type DWord = u32;
    type Bool = i32;

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            callback: Option<unsafe extern "system" fn(Hwnd, LParam) -> Bool>,
            state: LParam,
        ) -> Bool;
        fn IsWindowVisible(window: Hwnd) -> Bool;
        fn GetWindowTextLengthW(window: Hwnd) -> DWord;
        fn SetWindowTextW(window: Hwnd, text: *const u16) -> Bool;
        fn SendMessageTimeoutW(
            window: Hwnd,
            message: DWord,
            w_param: WParam,
            l_param: LParam,
            flags: DWord,
            timeout: DWord,
            result: *mut usize,
        ) -> usize;
        fn LoadImageW(
            instance: *mut c_void,
            name: *const u16,
            image_type: DWord,
            width: DWord,
            height: DWord,
            load: DWord,
        ) -> *mut c_void;
        fn DestroyIcon(icon: *mut c_void) -> Bool;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetWindowThreadProcessId(window: Hwnd, process_id: *mut DWord) -> DWord;
    }

    const WM_SETICON: DWord = 0x0080;
    const ICON_SMALL: WParam = 0;
    const ICON_BIG: WParam = 1;
    const IMAGE_ICON: DWord = 1;
    const LR_LOADFROMFILE: DWord = 0x0010;

    struct Hunt {
        pid: DWord,
        found: Hwnd,
    }

    unsafe extern "system" fn probe(window: Hwnd, state: LParam) -> Bool {
        let hunt = &mut *(state as *mut Hunt);
        let mut pid: DWord = 0;
        GetWindowThreadProcessId(window, &mut pid);
        // Нужен видимый верхний уровень с заголовком — не служебный оверлей.
        if pid == hunt.pid && IsWindowVisible(window) != 0 && GetWindowTextLengthW(window) > 0 {
            hunt.found = window;
            return 0;
        }
        1
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0u16)).collect()
    }

    pub fn rebrand_thread(pid: u32, title: String, ico: Option<PathBuf>) {
        let title_w = wide(&title);
        let ico_w = ico.as_ref().map(|p| wide(&p.to_string_lossy()));
        thread::spawn(move || {
            // Окно может создаваться несколько секунд (шейдеры, миры).
            let mut found: Hwnd = std::ptr::null_mut();
            for _try in 0..300 {
                let mut hunt = Hunt {
                    pid,
                    found: std::ptr::null_mut(),
                };
                let hunt_ptr = &mut hunt as *mut Hunt as LParam;
                unsafe {
                    EnumWindows(Some(probe), hunt_ptr);
                }
                if !hunt.found.is_null() {
                    found = hunt.found;
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if found.is_null() {
                return;
            }
            let null = std::ptr::null_mut();
            let small = ico_w
                .as_ref()
                .map(|w| unsafe { LoadImageW(null, w.as_ptr(), IMAGE_ICON, 16, 16, LR_LOADFROMFILE) })
                .unwrap_or(null);
            let big = ico_w
                .as_ref()
                .map(|w| unsafe { LoadImageW(null, w.as_ptr(), IMAGE_ICON, 32, 32, LR_LOADFROMFILE) })
                .unwrap_or(null);
            // Несколько раундов на случай, если игра допишет своё сразу после
            // создания окна; обычно достаточно первого (Horizon титул не меняет).
            for _round in 0..5 {
                unsafe {
                    SetWindowTextW(found, title_w.as_ptr());
                    let mut answer: usize = 0;
                    if !small.is_null() {
                        SendMessageTimeoutW(
                            found,
                            WM_SETICON,
                            ICON_SMALL,
                            small as LParam,
                            0,
                            1000,
                            &mut answer,
                        );
                    }
                    if !big.is_null() {
                        SendMessageTimeoutW(
                            found,
                            WM_SETICON,
                            ICON_BIG,
                            big as LParam,
                            0,
                            1000,
                            &mut answer,
                        );
                    }
                }
                thread::sleep(Duration::from_millis(600));
            }
            unsafe {
                if !small.is_null() {
                    DestroyIcon(small);
                }
                if !big.is_null() {
                    DestroyIcon(big);
                }
            }
        });
    }
}

/// Точка входа: на Windows находит окно игры и ставит ему ванильные титул и
/// иконку; на других платформах ничего не делает.
pub fn spawn_window_rebrand(pid: u32, title: String, ico: Option<PathBuf>) {
    #[cfg(windows)]
    win::rebrand_thread(pid, title, ico);
    #[cfg(not(windows))]
    let _ = (pid, title, ico);
}
