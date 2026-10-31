//! Границы для команд, которые веб-вью вызывает напрямую.
//!
//! Лаунчер показывает чужой текст (описания модов с Modrinth и CurseForge) и
//! грузит чужие картинки. Если такой текст когда-нибудь протащит скрипт,
//! единственной защитой останутся эти проверки: команда, которой передали
//! адрес или путь, обязана сама решить, допустим ли он. Проверять на стороне
//! интерфейса бессмысленно — оттуда и приходит враждебное значение.

use crate::utils::paths::{get_app_data_dir, get_minecraft_root};
use std::net::IpAddr;
use std::path::{Component, Path, PathBuf};

/// Репозиторий, с которого лаунчер имеет право брать обновления.
const UPDATE_HOST: &str = "github.com";
const UPDATE_PATH: &str = "/eshkereshek/pg_launcher/releases/download/";

/// Сколько байт вообще может весить картинка, которую мы читаем.
pub const MAX_LOCAL_IMAGE_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_REMOTE_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

/// Имя файла, по которому папка опознаётся как установленный лаунчер.
const INSTALLED_EXE: &str = "Pagrysha Launcher.exe";

/// Маркер установки: файл в папке лаунчера, который создаёт `install_app`.
///
/// Имя папки игрок может выбрать любым, поэтому «свою» установку опознаём по
/// этому файлу, а не только по названию каталога.
pub const INSTALL_MARKER: &str = ".pagrysha-install";

/// Есть ли в папке маркер установки, оставленный `install_app`.
pub fn has_install_marker(dir: &Path) -> bool {
    dir.join(INSTALL_MARKER).is_file()
}

/// Запущен ли текущий процесс как установщик.
///
/// Признаки ровно два: явный флаг в аргументах и имя exe. Догадки про путь
/// установки здесь не нужны: они путали обычный запуск с установкой.
pub fn is_installer_run(args: &[String], exe_name: &str) -> bool {
    if args
        .iter()
        .any(|a| a == "--is-installer" || a == "--installer")
    {
        return true;
    }
    let name = exe_name.to_lowercase();
    name.contains("setup") || name.contains("installer")
}

/// Компоненты пути без корня, в нижнем регистре: диск входит в список, чтобы
/// `C:\Games` и `D:\Games` не считались одним и тем же.
///
/// `..` и `.` — отказ, а не нормализация: команда не должна уметь выйти за
/// пределы папки, даже если её об этом попросили.
fn normalized_components(path: &Path) -> Option<Vec<String>> {
    let mut out = Vec::new();
    if !path.is_absolute() {
        return None;
    }
    for part in path.components() {
        match part {
            Component::Prefix(prefix) => {
                out.push(prefix.as_os_str().to_string_lossy().to_lowercase())
            }
            Component::RootDir => {}
            Component::CurDir | Component::ParentDir => return None,
            Component::Normal(name) => out.push(name.to_string_lossy().to_lowercase()),
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn is_within(path: &Path, root: &Path) -> bool {
    match (normalized_components(path), normalized_components(root)) {
        (Some(p), Some(r)) => r.len() <= p.len() && r.iter().zip(p.iter()).all(|(a, b)| a == b),
        _ => false,
    }
}

fn is_same(path: &Path, root: &Path) -> bool {
    match (normalized_components(path), normalized_components(root)) {
        (Some(p), Some(r)) => p == r,
        _ => false,
    }
}

fn env_dir(key: &str) -> Option<PathBuf> {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
}

/// Куда ставить и откуда удалять нельзя: системные каталоги и наши же данные.
fn is_forbidden_dir(path: &Path) -> bool {
    let windows = env_dir("WINDIR").or_else(|| env_dir("SystemRoot"));
    if let Some(windir) = windows {
        let system32 = windir.join("System32");
        if is_within(path, &windir) || is_within(path, &system32) {
            return true;
        }
    }

    let ours = [get_app_data_dir(), get_minecraft_root()];
    if ours.iter().any(|root| is_within(path, root)) {
        return true;
    }

    // Ровно эти каталоги удалять нельзя, но ставить в подпапку — можно.
    let mut exact = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "ProgramData"] {
        if let Some(dir) = env_dir(key) {
            exact.push(dir);
        }
    }
    if let Some(home) = dirs::home_dir() {
        exact.push(home);
    }
    if let Some(local) = dirs::data_local_dir() {
        exact.push(local);
    }
    exact.iter().any(|root| is_same(path, root))
}

/// Папка, в которую разрешено установить лаунчер.
///
/// Требования: абсолютный путь без `..`, не системный каталог и не наша папка
/// данных. Глубина — хотя бы «диск + папка», чтобы `D:\` или `C:\Games` не
/// превращались в каталог установки по ошибке или по чужому замыслу.
pub fn install_target(raw: &str) -> Result<PathBuf, String> {
    let path = check_install_shape(raw)?;
    Ok(path)
}

fn check_install_shape(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Не указана папка установки".into());
    }
    let path = PathBuf::from(trimmed);
    let parts = normalized_components(&path)
        .ok_or_else(|| "Некорректная папка установки: нужен полный путь без «..»".to_string())?;
    if parts.len() < 2 {
        return Err("Папка установки слишком высоко: выберите папку внутри диска".into());
    }
    if is_forbidden_dir(&path) {
        return Err("В эту папку устанавливать нельзя: выберите другую".into());
    }
    Ok(path)
}

/// Папка, которую разрешено удалить при удалении лаунчера.
///
/// Удаление — самая опасная команда в лаунчере, поэтому проверок больше:
/// путь существует, внутри лежит наш exe, папка похожа на нашу установку
/// (маркер или имя) и это не системный каталог. Папку с фотографиями игрока
/// так не удалить, даже если интерфейс попросит.
pub fn uninstall_target(raw: &str) -> Result<PathBuf, String> {
    let path = check_install_shape(raw)?;
    let real =
        std::fs::canonicalize(&path).map_err(|_| "Папка установки не найдена".to_string())?;
    if !real.is_dir() {
        return Err("Указанный путь не является папкой".into());
    }
    if is_forbidden_dir(&real) {
        return Err("Эту папку удалять нельзя".into());
    }
    if !real.join(INSTALLED_EXE).is_file() {
        return Err(format!(
            "В папке нет файла «{}» — похоже, лаунчер установлен не сюда",
            INSTALLED_EXE
        ));
    }

    // Папку с нашим exe ещё нельзя считать нашей: копия exe могла оказаться
    // где угодно. Нужен маркер установки или хотя бы «наше» имя каталога.
    let name_is_ours = real
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase().contains("pagrysha"))
        .unwrap_or(false);
    if !has_install_marker(&real) && !name_is_ours {
        return Err("Удаление отменено: папка не похожа на установку Pagrysha Launcher".into());
    }

    Ok(real)
}

/// Ссылка, по которой разрешено скачать обновление.
///
/// Хост и путь фиксированы: обновление — это исполняемый файл, который мы
/// запустим. Ссылку присылает интерфейс, а интерфейс показывает чужой текст,
/// поэтому адрес проверяется здесь, а не там.
pub fn update_url(raw: &str) -> Result<(), String> {
    let url = parse_https(raw)?;
    if url.port().is_some() {
        return Err("Нестандартный порт в ссылке обновления".into());
    }
    if url
        .host_str()
        .map(|h| !h.eq_ignore_ascii_case(UPDATE_HOST))
        .unwrap_or(true)
    {
        return Err("Ссылка обновления ведёт не на GitHub".into());
    }
    if !url.path().starts_with(UPDATE_PATH) {
        return Err("Ссылка обновления ведёт не в тот репозиторий".into());
    }
    Ok(())
}

/// Ссылка, по которой разрешено скачать архив Java от Adoptium.
///
/// Ссылку отдаёт их API, и она ведёт на GitHub в организацию `adoptium`.
/// Архив потом распаковывается как исполняемый файл `java.exe`, поэтому адрес
/// проверяем так же строго, как обновление: https, без порта и логина, только
/// релизные ассеты официальной организации.
pub fn adoptium_url(raw: &str) -> Result<(), String> {
    let url = parse_https(raw)?;
    if url.port().is_some() {
        return Err("Нестандартный порт в ссылке на Java".into());
    }
    if url
        .host_str()
        .map(|h| !h.eq_ignore_ascii_case(UPDATE_HOST))
        .unwrap_or(true)
    {
        return Err("Ссылка на Java ведёт не на GitHub".into());
    }
    let path = url.path();
    if !path.starts_with("/adoptium/") || !path.contains("/releases/download/") {
        return Err("Ссылка на Java ведёт не в релизы Adoptium".into());
    }
    Ok(())
}

/// Ссылка, которую можно отдать системе через `open`.
///
/// `open` умеет запускать файлы и обработчики протоколов, поэтому мимо
/// http/https не пропускаем ничего.
pub fn external_url(raw: &str) -> Result<(), String> {
    let url = url::Url::parse(raw.trim()).map_err(|_| "Некорректная ссылка".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(()),
        _ => Err("Открывать можно только ссылки http и https".into()),
    }
}

fn parse_https(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw.trim()).map_err(|_| "Некорректная ссылка".to_string())?;
    if url.scheme() != "https" {
        return Err("Ссылка должна быть https".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Ссылка содержит логин или пароль".into());
    }
    Ok(url)
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_loopback()
                || v4.is_unspecified()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_documentation()
                || o[0] == 0
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 192 && o[1] == 0 && o[2] == 0)
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19)))
        }
        IpAddr::V6(v6) => {
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            let seg = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (seg[0] & 0xfe00) == 0xfc00
                || (seg[0] & 0xffc0) == 0xfe80)
        }
    }
}

/// Адрес картинки, которую разрешено тянуть из интернета.
///
/// Только https и только публичный хост: иначе команда превращается в способ
/// постучаться во внутреннюю сеть игрока или в его же локальные сервисы.
pub fn remote_image_url(raw: &str) -> Result<(), String> {
    let url = parse_https(raw)?;
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() {
        return Err("В ссылке нет адреса".into());
    }
    if url.port().is_some() {
        return Err("Нестандартный порт в ссылке на картинку".into());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            return Err("Ссылка ведёт на локальный адрес".into());
        }
        return Ok(());
    }
    let local_names = ["localhost", "local", "internal", "lan", "home.arpa"];
    if !host.contains('.')
        || local_names
            .iter()
            .any(|s| host == *s || host.ends_with(&format!(".{}", s)))
    {
        return Err("Ссылка ведёт на локальный адрес".into());
    }
    Ok(())
}

fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}

/// Прочитать локальный файл как картинку.
///
/// Команда задумана для фона и аватарок, а не для чтения файлов вообще:
/// расширение из белого списка, ограничение размера и проверка сигнатуры,
/// чтобы `accounts.json`, переименованный в `.png`, не уехал наружу.
pub fn read_image_file(raw: &str) -> Result<(Vec<u8>, &'static str), String> {
    let path = Path::new(raw.trim());
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp"
    ) {
        return Err("Это не файл картинки".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "Файл не найден".to_string())?;
    if !meta.is_file() {
        return Err("Это не файл картинки".into());
    }
    if meta.len() == 0 || meta.len() > MAX_LOCAL_IMAGE_BYTES {
        return Err("Неподходящий размер картинки".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "Не удалось прочитать файл".to_string())?;
    let mime = sniff_image(&bytes).ok_or_else(|| "Файл не похож на картинку".to_string())?;
    Ok((bytes, mime))
}

/// Имя файла внутри папки скинов — без выхода в другие каталоги.
pub fn skins_entry(id: &str) -> Result<PathBuf, String> {
    if id.trim().is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Некорректное имя скина".into());
    }
    Ok(crate::utils::paths::get_skins_dir().join(id))
}

/// Одно имя — папка сборки или файл.
///
/// Имена приходят из интерфейса и из ответов Modrinth, а `join` с `..` или
/// `C:` уводит запись куда угодно. Заодно отсекаем имена, которые Windows
/// молча обрезает (точка и пробел в конце) и зарезервированные устройства.
pub fn folder_name(raw: &str) -> Result<String, String> {
    // Не обрезаем пробелы молча: имя папки — это ещё и идентификатор сборки,
    // по которому её потом ищут и удаляют. Лучше явная ошибка, чем запись в
    // папку с другим именем, чем ожидал интерфейс.
    let name = raw;
    if name.is_empty() || name == "." || name == ".." {
        return Err("Некорректное имя папки".into());
    }
    if name.trim() != name {
        return Err("В имени папки лишние пробелы по краям".into());
    }
    if name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.chars().any(|c| c.is_control())
    {
        return Err("В имени папки есть недопустимые символы".into());
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err("Имя папки не может заканчиваться точкой или пробелом".into());
    }
    if name.chars().count() > 100 {
        return Err("Слишком длинное имя папки".into());
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        return Err("Зарезервированное системное имя".into());
    }
    Ok(name.to_string())
}

/// Имя файла внутри `mods/`, `resourcepacks/` и т. п.
pub fn file_name(raw: &str) -> Result<String, String> {
    folder_name(raw).map_err(|_| "Некорректное имя файла".to_string())
}

/// Путь из архива сборки (`modrinth.index.json`), приведённый к безопасному
/// относительному виду.
///
/// Абсолютные пути, `..` и буквы диска отклоняются целиком: файл сборки обязан
/// лежать внутри своей папки, даже если автор архива считает иначе.
pub fn relative_under(raw: &str) -> Result<PathBuf, String> {
    let normalized = raw.replace('\\', "/");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Err("Пустой путь в описании сборки".into());
    }
    if trimmed.starts_with('/') || trimmed.contains(':') {
        return Err(format!("Абсолютный путь в сборке отклонён: {}", raw));
    }
    let mut out = PathBuf::new();
    for part in trimmed.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(format!("Выход за папку сборки отклонён: {}", raw));
        }
        if part.chars().any(|c| c.is_control()) {
            return Err(format!("Недопустимые символы в пути сборки: {}", raw));
        }
        out.push(part);
    }
    if out.as_os_str().is_empty() {
        return Err("Пустой путь в описании сборки".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_links_only_from_our_repository() {
        let good = "https://github.com/eshkereshek/pg_launcher/releases/download/v7.2.2/Pagrysha_Setup.exe";
        assert_eq!(
            update_url(good),
            Ok(()),
            "штатная ссылка релиза должна проходить"
        );

        for bad in [
            "http://github.com/eshkereshek/pg_launcher/releases/download/v7.2.2/x.exe",
            "https://github.com.evil.com/eshkereshek/pg_launcher/releases/download/v7.2.2/x.exe",
            "https://github.com/other/repo/releases/download/v1/x.exe",
            "https://github.com/eshkereshek/pg_launcher/releases/download/../../other/x.exe",
            "https://raw.githubusercontent.com/eshkereshek/x.exe",
            "file:///C:/Windows/System32/cmd.exe",
            "javascript:alert(1)",
            "",
        ] {
            assert!(update_url(bad).is_err(), "должна быть отклонена: {}", bad);
        }
    }

    #[test]
    fn update_links_reject_credentials_and_ports() {
        assert!(update_url(
            "https://user:pass@github.com/eshkereshek/pg_launcher/releases/download/v1/x.exe"
        )
        .is_err());
        assert!(update_url(
            "https://github.com:8443/eshkereshek/pg_launcher/releases/download/v1/x.exe"
        )
        .is_err());
    }

    #[test]
    fn java_archives_only_from_adoptium_releases() {
        let good = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip";
        assert_eq!(
            adoptium_url(good),
            Ok(()),
            "штатная ссылка Adoptium должна проходить"
        );

        for bad in [
            "http://github.com/adoptium/temurin21-binaries/releases/download/x/java.zip",
            "https://github.com.evil.com/adoptium/temurin21-binaries/releases/download/x/java.zip",
            "https://raw.githubusercontent.com/adoptium/temurin21-binaries/main/java.zip",
            "https://github.com/other/temurin21-binaries/releases/download/x/java.zip",
            "https://github.com/adoptium/temurin21-binaries/archive/java.zip",
            "file:///C:/Windows/System32/cmd.exe",
            "",
        ] {
            assert!(adoptium_url(bad).is_err(), "должна быть отклонена: {}", bad);
        }
        assert!(adoptium_url(
            "https://github.com:8443/adoptium/temurin21-binaries/releases/download/x/java.zip"
        )
        .is_err());
    }

    #[test]
    fn external_links_are_web_only() {
        assert!(external_url("https://modrinth.com/mod/sodium").is_ok());
        assert!(external_url("http://optifine.net/home").is_ok());
        for bad in [
            "file:///C:/Windows/System32/cmd.exe",
            "ms-msdt:/id",
            "javascript:alert(1)",
        ] {
            assert!(external_url(bad).is_err(), "должна быть отклонена: {}", bad);
        }
    }

    #[test]
    fn install_folder_must_be_a_real_folder() {
        assert!(install_target("C:\\Games\\Pagrysha").is_ok());
        for bad in [
            "",
            "Pagrysha",
            "C:\\",
            "C:\\Windows\\Temp\\Pagrysha",
            "C:\\Users\\..\\..\\Windows\\Pagrysha",
            "C:\\Program Files",
        ] {
            assert!(
                install_target(bad).is_err(),
                "должна быть отклонена: {}",
                bad
            );
        }
    }

    #[test]
    fn uninstall_requires_our_exe_inside() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("pg-guard-{}-{}", std::process::id(), stamp));
        let target = dir.join("Pagrysha Launcher");
        let _ = std::fs::create_dir_all(&target);
        let raw = target.to_string_lossy().to_string();

        assert!(
            uninstall_target(&raw).is_err(),
            "пустую папку удалять нельзя"
        );

        std::fs::write(target.join(INSTALLED_EXE), b"stub").unwrap();
        assert!(
            uninstall_target(&raw).is_ok(),
            "папку со своим exe удалять можно"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_reader_refuses_foreign_files() {
        let dir = std::env::temp_dir().join(format!("pg-img-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);

        let png = dir.join("ok.png");
        std::fs::write(&png, [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).unwrap();
        assert_eq!(
            read_image_file(&png.to_string_lossy()).unwrap().1,
            "image/png"
        );

        let fake = dir.join("secret.png");
        std::fs::write(&fake, br#"{"token":"x"}"#).unwrap();
        assert!(
            read_image_file(&fake.to_string_lossy()).is_err(),
            "json под видом png читать нельзя"
        );

        let json = dir.join("accounts.json");
        std::fs::write(&json, b"{}").unwrap();
        assert!(
            read_image_file(&json.to_string_lossy()).is_err(),
            "не картинку по расширению не читаем"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remote_images_only_from_the_public_web() {
        for good in [
            "https://cdn.modrinth.com/data/abc/icon.png",
            "https://skinsystem.ely.by/skins/Notch.png",
        ] {
            assert!(remote_image_url(good).is_ok(), "должна проходить: {}", good);
        }
        for bad in [
            "http://cdn.modrinth.com/x.png",
            "https://127.0.0.1/x.png",
            "https://localhost/x.png",
            "https://[::1]/x.png",
            "https://192.168.1.10/x.png",
            "https://169.254.169.254/latest/meta-data",
            "https://intranet/x.png",
            "https://cdn.modrinth.com:8443/x.png",
        ] {
            assert!(
                remote_image_url(bad).is_err(),
                "должна быть отклонена: {}",
                bad
            );
        }
    }

    #[test]
    fn skin_ids_cannot_escape_the_folder() {
        assert!(skins_entry("123_skin.png").is_ok());
        for bad in ["../accounts.json", "..\\accounts.json", "a/b.png", ""] {
            assert!(skins_entry(bad).is_err(), "должно быть отклонено: {}", bad);
        }
    }

    #[test]
    fn instance_names_are_single_safe_components() {
        for good in ["Выживание", "1.20.1-forge-47.2.0", "My Pack"] {
            assert_eq!(
                folder_name(good).as_deref(),
                Ok(good),
                "должно проходить: {}",
                good
            );
        }
        for bad in [
            "..",
            ".",
            "",
            "../..",
            "..\\Windows",
            "C:\\Windows",
            "a/b",
            "pack.",
            "pack ",
            "CON",
            "lpt1",
            "bad\u{0}name",
        ] {
            assert!(folder_name(bad).is_err(), "должно быть отклонено: {}", bad);
        }
    }

    #[test]
    fn modpack_paths_stay_inside_the_instance() {
        assert_eq!(
            relative_under("mods/jei.jar"),
            Ok(PathBuf::from("mods").join("jei.jar"))
        );
        assert_eq!(
            relative_under("config\\x\\y.toml"),
            Ok(PathBuf::from("config").join("x").join("y.toml")),
            "обратные слэши из чужих архивов тоже нормализуются"
        );
        assert!(
            relative_under("../outside.jar").is_err(),
            "выход за папку сборки запрещён"
        );
    }

    #[test]
    fn installer_run_is_detected_only_by_flag_or_name() {
        assert!(is_installer_run(
            &["--is-installer".to_string()],
            "pagrysha-launcher.exe"
        ));
        assert!(is_installer_run(
            &["--installer".to_string()],
            "pagrysha-launcher.exe"
        ));
        assert!(is_installer_run(&[], "Pagrysha_Setup.exe"));
        assert!(is_installer_run(&[], "pagrysha-installer.exe"));
        assert!(
            !is_installer_run(&[], "pagrysha-launcher.exe"),
            "обычный запуск установщиком не считается"
        );
    }

    #[test]
    fn uninstall_needs_marker_or_our_name() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("pg-guard-{}-{}", std::process::id(), stamp));

        // Папка с «нашим» именем: маркер не нужен.
        let named = dir.join("Pagrysha Launcher test");
        std::fs::create_dir_all(&named).unwrap();
        std::fs::write(named.join(INSTALLED_EXE), b"stub").unwrap();
        assert!(
            uninstall_target(&named.to_string_lossy()).is_ok(),
            "папку с именем pagrysha удалять можно"
        );
        assert!(
            !has_install_marker(&named),
            "маркера в такой папке нет, но имя её спасает"
        );

        // Случайное имя без маркера: удаление отменяется.
        let random = dir.join("Мои документы");
        std::fs::create_dir_all(&random).unwrap();
        std::fs::write(random.join(INSTALLED_EXE), b"stub").unwrap();
        let err = uninstall_target(&random.to_string_lossy())
            .expect_err("случайную папку удалять нельзя");
        assert!(
            err.contains("Удаление отменено"),
            "ожидалась понятная причина, получено: {}",
            err
        );

        // Тот же каталог с маркером установки — уже наш.
        std::fs::write(random.join(INSTALL_MARKER), br#"{"version":"0.0.0"}"#).unwrap();
        assert!(has_install_marker(&random));
        assert!(
            uninstall_target(&random.to_string_lossy()).is_ok(),
            "папку с маркером удалять можно"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn uninstall_refuses_disk_roots_and_plain_folders() {
        // Даже если в такой папке окажется наш exe, без маркера и без «нашего»
        // имени удаление запрещено; корень диска отсекается ещё по глубине.
        for bad in ["C:\\", "C:\\Games", "D:\\", "D:\\Games"] {
            assert!(
                uninstall_target(bad).is_err(),
                "корень диска и обычную папку удалять нельзя: {}",
                bad
            );
        }
    }
}
