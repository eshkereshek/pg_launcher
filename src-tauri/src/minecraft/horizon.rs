//! Horizon — «Minecraft на Rust» (Java Edition 26.3, переписанная на Rust).
//!
//! Игра берётся из GitHub-релизов форка `tr4m0ryp/Minecraft-rust`; если там
//! релизов нет (форк пока их не публикует), берётся та же сборка из апстрима
//! `horizon-rust/horizon`: код игры в форке не изменён, а «свободный» запуск
//! без Microsoft держит наш лаунчер — `horizon-client` запускается офлайн с
//! `--name`, проверка владельца есть только в официальном лаунчере Horizon.
//!
//! Установка: `%APPDATA%/pagrysha-launcher/horizon/versions/<тег>/` —
//! распакованный архив сборки (`horizon-client.exe`, `horizon-prepare.exe`,
//! `research-lock.json`, `exporters/`). Ресурсы игра читает из
//! `<тег>/.local/horizon-client/<версии>/`, их готовит `horizon-prepare` из
//! установленных в лаунчере файлов Minecraft версии, закреплённой в
//! `research-lock.json`.

use crate::commands::java::ensure_java_for;
use crate::minecraft::assets::download_assets;
use crate::minecraft::libraries::{download_version_libraries, ensure_client_jar};
use crate::minecraft::manifest::fetch_version_manifest;
use crate::minecraft::models::LaunchOptions;
use crate::utils::download::{
    ensure_file, ensure_file_with_progress, extract_zip_archive, file_hash, http_client, part_path,
    Algo, Sum,
};
use crate::utils::guard;
use crate::utils::logmarkers::is_window_ready;
use crate::utils::options::write_options;
use crate::utils::paths::*;
use serde_json::Value;
use std::collections::VecDeque;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::time::{Duration};

/// Сначала форк из запроса пользователя, затем апстрим с теми же бинарниками.
const HORIZON_REPOS: [&'static str; 2] = ["tr4m0ryp/Minecraft-rust", "horizon-rust/horizon"];

/// Короткое превращение любой ошибки файловой сети/диска в строку Tauri.
trait ToStringErr<T, E: std::fmt::Display> {
    fn map_err_to_string(self) -> Result<T, String>;
}
impl<T, E: std::fmt::Display> ToStringErr<T, E> for Result<T, E> {
    fn map_err_to_string(self) -> Result<T, String> {
        self.map_err(|e| e.to_string())
    }
}

static HOR_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn is_horizon_running() -> bool {
    HOR_RUNNING.load(Ordering::SeqCst)
}

/// Имя архива сборки игры для текущей платформы. Подготовка и запуск описаны
/// для Windows x64 (zip); на других ОС пусть пока играет официальный лаунчер.
fn game_asset_name() -> Option<&'static str> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("horizon-windows-x64.zip")
    } else {
        None
    }
}

fn client_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "horizon-client.exe"
    } else {
        "horizon-client"
    }
}

fn prepare_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "horizon-prepare.exe"
    } else {
        "horizon-prepare"
    }
}

fn horizon_root() -> PathBuf {
    get_app_data_dir().join("horizon")
}

fn horizon_versions_dir() -> PathBuf {
    horizon_root().join("versions")
}

/// Игровая папка Horizon: свои `saves`, `options.txt` и т. п. — формат
/// ванильный, миры из Java-версий переносятся сюда простым копированием.
fn horizon_game_dir() -> PathBuf {
    get_minecraft_root().join("horizon")
}

fn emit(app: &AppHandle, text: impl Into<String>) {
    let _ = app.emit("launch-progress", text.into());
}

/// Общий ограничитель текста загрузки: строка прогресса — раз в ~5 МБ, чтобы
/// не топить интерфейс тысячами событий. Атомики внутри — замыкание остаётся
/// `Fn` и им можно пользоваться дважды (прямая ссылка, потом API).
struct Progress {
    app: AppHandle,
    last: AtomicU64,
}

impl Progress {
    fn new(app: &AppHandle) -> Self {
        Progress {
            app: app.clone(),
            last: AtomicU64::new(0),
        }
    }

    fn report(&self, cur: u64, total: u64) {
        if cur.saturating_sub(self.last.load(Ordering::Relaxed)) >= 5_242_880
            || (total > 0 && cur == total)
        {
            self.last.store(cur, Ordering::Relaxed);
            let text = if total > 0 {
                format!(
                    "Horizon: скачивание сборки... {:.0} из {:.0} МБ",
                    cur as f64 / 1_048_576.0,
                    total as f64 / 1_048_576.0
                )
            } else {
                format!("Horizon: скачивание сборки... {:.0} МБ", cur as f64 / 1_048_576.0)
            };
            let _ = self.app.emit("launch-progress", text);
        }
    }
}

/// Версия Minecraft, мажор Java и признаваемые sha1 профиль-файла из
/// `research-lock.json` распакованной сборки.
fn lock_info(install_dir: &Path) -> Option<(String, u32, Vec<String>)> {
    let text = fs::read_to_string(install_dir.join("research-lock.json")).ok()?;
    let lock: Value = serde_json::from_str(&text).ok()?;
    let mc = lock.get("minecraft")?;
    let version = mc.get("version")?.as_str()?.to_string();
    let java_major = mc
        .get("java_major")
        .and_then(Value::as_u64)
        .unwrap_or(25) as u32;
    let mut sums: Vec<String> = Vec::new();
    if let Some(pin) = mc.get("manifest_sha1").and_then(Value::as_str) {
        sums.push(pin.to_string());
    }
    if let Some(list) = mc.get("accepted_manifest_sha1").and_then(Value::as_array) {
        for item in list {
            if let Some(s) = item.as_str() {
                sums.push(s.to_string());
            }
        }
    }
    Some((version, java_major, sums))
}

/// Уже распакованная сборка: папка с маркером COMPLETE и клиентским exe.
/// Подготовка ресуров — отдельная проверка (`prepared_resources`).
fn find_installed() -> Option<(String, PathBuf)> {
    let dir = horizon_versions_dir();
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.join("COMPLETE").is_file() && path.join(client_exe_name()).is_file() {
                found.push((entry.file_name().to_string_lossy().to_string(), path));
            }
        }
    }
    // Тег — имя папки: свежие v-релизы и nightly оказываются первыми.
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().next()
}

/// Папка подготовленных ресуров: `<тег>/.local/horizon-client/<версии>/`
/// с `horizon-resources.json` внутри.
fn prepared_resources(install_dir: &Path) -> Option<PathBuf> {
    let base = install_dir.join(".local").join("horizon-client");
    let entries = fs::read_dir(&base).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.join("horizon-resources.json").is_file() {
            return Some(path);
        }
    }
    None
}

/// Найденный релиз: тег, прямая ссылка CDN и ссылка эндпоинта API (она же
/// запасной путь загрузки, когда `github.com` не отвечает).
struct ReleasePick {
    tag: String,
    browser_url: String,
    api_url: String,
    size: u64,
}

/// Свежайший релиз с нужным архивом: GitHub отдаёт список сверху вниз по
/// дате, берём первое совпадение. Первый репозиторий — форк.
async fn latest_release(asset: &str) -> Result<ReleasePick, String> {
    let client = http_client();
    let mut last_err = String::from("Horizon не найден среди релизов GitHub");
    for repo in HORIZON_REPOS {
        let url = format!("https://api.github.com/repos/{}/releases?per_page=100", repo);
        let resp = match client
            .get(&url)
            .header("User-Agent", "PagryshaLauncher/7.2")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("Не удалось получить релизы {}: {}", repo, e);
                continue;
            }
        };
        if !resp.status().is_success() {
            last_err = format!(
                "GitHub отдал {} для релизов {}",
                resp.status().as_u16(),
                repo
            );
            continue;
        }
        let releases: Vec<Value> = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                last_err = format!("Не удалось разобрать релизы {}: {}", repo, e);
                continue;
            }
        };
        for release in releases {
            let assets = match release.get("assets").and_then(Value::as_array) {
                Some(a) => a,
                None => continue,
            };
            for item in assets {
                if item.get("name").and_then(Value::as_str) != Some(asset) {
                    continue;
                }
                let dl = match item.get("browser_download_url").and_then(Value::as_str) {
                    Some(u) if u.starts_with("https://") => u,
                    _ => continue,
                };
                let tag = release
                    .get("tag_name")
                    .and_then(Value::as_str)
                    .unwrap_or("nightly");
                let api_url = item.get("url").and_then(Value::as_str).unwrap_or("").to_string();
                let size = item.get("size").and_then(Value::as_u64).unwrap_or(0);
                return Ok(ReleasePick {
                    tag: tag.to_string(),
                    browser_url: dl.to_string(),
                    api_url,
                    size,
                });
            }
        }
    }
    Err(last_err)
}


/// Запасной путь загрузки: asset-эндпоинт `api.github.com` с
/// `Accept: application/octet-stream`. Когда `github.com` лежит (504 на
/// редиректы релизов — бывает часами), API-путь обычно жив: проверка на
/// живой сети это и подтвердила.
async fn download_via_api_asset(api_url: &str, dest: &Path, prog: &Progress) -> Result<(), String> {
    let part = part_path(dest);
    let mut resp = http_client()
        .get(api_url)
        .header("User-Agent", "PagryshaLauncher/7.2")
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("api.github.com не ответил: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("api.github.com отдал {}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = fs::File::create(&part).map_err_to_string()?;
    let mut written: u64 = 0;
    while let Some(chunk) = resp.chunk().await.map_err_to_string()? {
        file.write_all(&chunk).map_err_to_string()?;
        written += chunk.len() as u64;
        prog.report(written, total);
    }
    file.flush().map_err_to_string()?;
    drop(file);
    if total > 0 && written != total {
        let _ = fs::remove_file(&part);
        return Err(format!("через API докачалось {} из {} байт", written, total));
    }
    fs::rename(&part, dest).map_err_to_string()?;
    Ok(())
}

/// Размер лежащего архива против обещанного GitHub: страница ошибки шлюза
/// (504, ~92 байта) тоже скачивается байтами — целым архивом она стать не
/// должна, как и оборванный на середине кусок.
fn zip_is_whole(zip_path: &Path, size: u64) -> bool {
    if size == 0 {
        return zip_path.is_file();
    }
    fs::metadata(zip_path).map(|m| m.len() == size).unwrap_or(false)
}

/// Скачать архив сборки и распаковать в `horizon/versions/<тег>`.
async fn download_build(app: &AppHandle, asset: &str) -> Result<(String, PathBuf), String> {
    let pick = latest_release(asset).await?;
    let tag = pick.tag.clone();
    let size = pick.size;
    let safe_tag = guard::folder_name(&tag)?;
    let install_dir = horizon_versions_dir().join(&safe_tag);
    let cache = horizon_root().join("cache");
    fs::create_dir_all(&cache).map_err_to_string()?;

    let zip_path = cache.join(asset);
    emit(app, "Horizon: скачивание сборки игры...");
    let prog = Progress::new(app);

    // Сначала прямая ссылка релиза: обычно она быстрее и не тратит лимит API.
    let direct = ensure_file_with_progress(
        &http_client(),
        &pick.browser_url,
        &zip_path,
        None,
        |cur, total| prog.report(cur, total),
    )
    .await;

    // Прямая ссылка не дала целый архив (504, обрыв, огрызок в кэше) —
    // качаем через asset-эндпоинт API.
    if direct.is_err() || !zip_is_whole(&zip_path, size) {
        if !zip_is_whole(&zip_path, size) {
            let _ = fs::remove_file(&zip_path);
        }
        let why = match &direct {
            Err(e) => format!("github.com: {}", e),
            Ok(_) => "github.com вернул неполный архив".to_string(),
        };
        emit(app, format!("Horizon: {} — пробую api.github.com...", why));
        download_via_api_asset(&pick.api_url, &zip_path, &prog)
            .await
            .map_err(|e| format!("Не удалось скачать сборку Horizon ({}; через API: {})", why, e))?;
    }
    if !zip_is_whole(&zip_path, size) {
        let _ = fs::remove_file(&zip_path);
        return Err("Сборка Horizon докачалась не целиком — попробуйте ещё раз".to_string());
    }

    // Распаковка во временную папку: COMPLETE ставим только когда клиент на
    // месте, иначе недо-установленная папка выглядела бы готовой.
    let tmp = horizon_root().join("tmp").join(&safe_tag);
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err_to_string()?;
    if let Err(e) = extract_zip_archive(&zip_path, &tmp) {
        // Оборванный архив: убираем и zip, и огрызки, следующая попытка качает заново.
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_dir_all(&tmp);
        return Err(format!("Архив Horizon повреждён — попробуйте ещё раз: {}", e));
    }

    // В релизах Horizon архив несёт одну верхнюю папку с horizon-client.exe;
    // на всякий случай принимаем и файлы прямо в корне архива.
    let source = if tmp.join(client_exe_name()).is_file() {
        tmp.clone()
    } else {
        let mut found: Option<PathBuf> = None;
        if let Ok(entries) = fs::read_dir(&tmp) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() && p.join(client_exe_name()).is_file() {
                    found = Some(p);
                    break;
                }
            }
        }
        found.ok_or_else(|| "В архиве Horizon нет файла игры".to_string())?
    };

    let _ = fs::remove_dir_all(&install_dir);
    fs::create_dir_all(horizon_versions_dir()).map_err_to_string()?;
    // Тот же диск (весь каталог лаунчера) — rename не трогает содержимое.
    if let Err(e) = fs::rename(&source, &install_dir) {
        copy_dir_all(&source, &install_dir).map_err(|e2| {
            format!("Не удалось разложить сборку Horizon на места: {} / {}", e, e2)
        })?;
    }
    let _ = fs::remove_dir_all(horizon_root().join("tmp"));
    if !install_dir.join(client_exe_name()).is_file() {
        return Err("После распаковки не нашёлся horizon-client".to_string());
    }
    let _ = fs::write(install_dir.join("COMPLETE"), tag.as_bytes());
    Ok((safe_tag, install_dir))
}

/// Медленный запасной путь, если `rename` не сработал (другой том и т. п.).
fn copy_dir_all(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err_to_string()?;
    for entry in fs::read_dir(from).map_err_to_string()?.flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err_to_string()?;
        }
    }
    Ok(())
}

/// Добывает в игровой папке лаунчера файлы vanilla-Minecraft, из которых
/// `horizon-prepare` собирает ресурсы: version JSON байт-в-байт Моjang (они
/// проверяются по sha1 — переписанный другим лаунчером файл prepare отвергает,
/// поэтому свежий оригинал кладём поверх), клиентский jar, библиотеки, ассеты
/// и server jar в кэш Horizon.
async fn ensure_vanilla_files(
    app: &AppHandle,
    version: &str,
    accepted_manifest_sums: &[String],
) -> Result<PathBuf, String> {
    let root = get_minecraft_root();
    let safe_version = guard::folder_name(version)?;
    let version_dir = root.join("versions").join(&safe_version);
    let json_path = version_dir.join(format!("{}.json", safe_version));

    // 1. Профиль версии: сначала проверяем лежащий файл, потом качаем оригинал.
    let on_disk_sum = file_hash(&json_path, Algo::Sha1).unwrap_or_default();
    if !accepted_manifest_sums.contains(&on_disk_sum) {
        let manifest = fetch_version_manifest().await?;
        let info = manifest
            .versions
            .iter()
            .find(|v| v.id == safe_version)
            .ok_or_else(|| format!("Версия {} не найдена в манифесте Mojang", safe_version))?;
        emit(app, "Horizon: скачиваю оригинальный профиль Mojang...");
        let resp = http_client()
            .get(&info.url)
            .header("User-Agent", "PagryshaLauncher/7.2")
            .send()
            .await
            .map_err(|e| format!("Не удалось скачать профиль {}: {}", safe_version, e))?;
        let resp = resp
            .error_for_status()
            .map_err(|e| format!("Mojang не отдал профиль {}: {}", safe_version, e))?;
        let text = resp.text().await.map_err_to_string()?;
        fs::create_dir_all(&version_dir).map_err_to_string()?;
        // Пишем сырые байты Моjang: их sha1 признаёт horizon-prepare, а
        // обычным Java-запускам оригинал не мешает.
        fs::write(&json_path, text).map_err(|e| format!("Не удалось сохранить профиль: {}", e))?;
    }

    let json_str = fs::read_to_string(&json_path)
        .map_err(|e| format!("Не удалось прочитать профиль {}: {}", safe_version, e))?;
    let version_json: Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Профиль Mojang повреждён: {}", e))?;

    // 2. Клиентский jar, библиотеки, ассеты — те же скачки, что у Java-запуска.
    ensure_client_jar(app, &safe_version, &version_json).await?;
    let natives_dir = version_dir.join("natives");
    download_version_libraries(app, &version_json, &natives_dir).await?;
    download_assets(app, &version_json).await?;

    // 3. Server jar: prepare требует ровно закреплённый, ссылка — из его же json.
    let server = version_json
        .get("downloads")
        .and_then(|d| d.get("server"))
        .ok_or_else(|| "В профиле нет ссылки на server.jar".to_string())?;
    let server_url = server
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "В профиле нет ссылки на server.jar".to_string())?;
    let server_sum = server
        .get("sha1")
        .and_then(Value::as_str)
        .and_then(Sum::sha1)
        .map(|s| s.with_size(server.get("size").and_then(Value::as_u64)));
    let server_path = horizon_root()
        .join("cache")
        .join(format!("server-{}.jar", safe_version));
    fs::create_dir_all(horizon_root().join("cache")).map_err_to_string()?;
    if !server_path.is_file() {
        emit(app, "Horizon: скачивание server.jar для подготовки...");
    }
    ensure_file(server_url, &server_path, server_sum).await?;
    Ok(server_path)
}

/// Прогнать `horizon-prepare` (подготовку или звуки), показывая его лог
/// полосой прогресса; при провале — последние строки в текст ошибки.
async fn run_prepare(
    app: &AppHandle,
    install_dir: &Path,
    args: &[&str],
    java_home: Option<&Path>,
    stage: &str,
) -> Result<(), String> {
    emit(app, stage);
    let exe = install_dir.join(prepare_exe_name());
    if !exe.is_file() {
        return Err("В сборке Horizon нет horizon-prepare — переустановите её".to_string());
    }
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(args)
        .current_dir(install_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // JAVA_HOME — первое, что спрашивает prepare; так он берёт нашу Java,
    // даже если в системе стоит другая или не стоит вовсе.
    if let Some(home) = java_home {
        cmd.env("JAVA_HOME", home);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить horizon-prepare: {}", e))?;

    let tail: Arc<tokio::sync::Mutex<VecDeque<String>>> =
        Arc::new(tokio::sync::Mutex::new(VecDeque::new()));
    let mut readers = Vec::new();
    if let Some(out) = child.stdout.take() {
        let app_log = app.clone();
        let tail = tail.clone();
        readers.push(tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                {
                    let mut t = tail.lock().await;
                    if t.len() >= 40 {
                        t.pop_front();
                    }
                    t.push_back(trimmed.clone());
                }
                // Полоса запуска показывает последние строки подготовки.
                let _ = app_log.emit("launch-progress", format!("Horizon: {}", trimmed));
            }
        }));
    }
    if let Some(err) = child.stderr.take() {
        let tail = tail.clone();
        readers.push(tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                let mut t = tail.lock().await;
                if t.len() >= 40 {
                    t.pop_front();
                }
                t.push_back(trimmed);
            }
        }));
    }
    let status = child.wait().await.map_err_to_string()?;
    for r in readers {
        let _ = r.await;
    }
    if !status.success() {
        let t = tail.lock().await;
        let mut text = String::new();
        for line in t.iter() {
            text.push_str(line);
            text.push('\n');
        }
        return Err(format!(
            "horizon-prepare завершился с ошибкой (код {:?}):\n{}",
            status.code(),
            text
        ));
    }
    Ok(())
}

/// Ресурсы готовы? Если нет — скачивает vanilla-файлы, Java и прогоняет
/// `horizon-prepare` (плюс звуки: без них игра молчит).
async fn ensure_prepared(app: &AppHandle, install_dir: &Path) -> Result<PathBuf, String> {
    if let Some(res) = prepared_resources(install_dir) {
        return Ok(res);
    }
    let (version, java_major, manifest_sums) = lock_info(install_dir).ok_or_else(|| {
        "Сборка Horizon повреждена: нет research-lock.json — переустановите её".to_string()
    })?;
    emit(app, "Horizon: проверка файлов Minecraft для подготовки...");
    let server_jar = ensure_vanilla_files(app, &version, &manifest_sums).await?;
    let java_bin = ensure_java_for(app, java_major).await?;
    let java_home = java_bin.parent().and_then(Path::parent);

    let mc_root = get_minecraft_root();
    let root_text = install_dir.to_string_lossy().to_string();
    let jar_text = server_jar.to_string_lossy().to_string();
    let mc_text = mc_root.to_string_lossy().to_string();
    run_prepare(
        app,
        install_dir,
        &[
            "--prepare",
            "--server-jar",
            &jar_text,
            "--minecraft-dir",
            &mc_text,
            "--root",
            &root_text,
        ],
        java_home,
        "Horizon: подготовка ресурсов игры — один раз, это долго...",
    )
    .await?;
    run_prepare(
        app,
        install_dir,
        &["sounds", "--minecraft-dir", &mc_text, "--root", &root_text],
        None,
        "Horizon: копирование звуков (~380 МБ)...",
    )
    .await?;
    prepared_resources(install_dir).ok_or_else(|| {
        "Подготовка завершилась, но ресурсов не видно — попробуйте ещё раз".to_string()
    })
}

/// Всё для запуска: установленная и подготовленная сборка.
async fn resolve_horizon(app: &AppHandle) -> Result<(String, PathBuf, PathBuf), String> {
    let asset = game_asset_name().ok_or_else(|| "Horizon пока доступен только на Windows x64".to_string())?;
    let (tag, install_dir) = match find_installed() {
        Some(found) => found,
        None => {
            emit(app, "Horizon: первой установки нет — ищу свежий релиз...");
            download_build(app, asset).await?
        }
    };
    let resources = ensure_prepared(app, &install_dir).await?;
    Ok((tag, install_dir, resources))
}

#[tauri::command]
pub fn horizon_status() -> Value {
    let installed = find_installed();
    let (tag, prepared, version) = match &installed {
        Some((tag, dir)) => (
            Some(tag.clone()),
            prepared_resources(dir).is_some(),
            lock_info(dir).map(|l| l.0),
        ),
        None => (None, false, None),
    };
    serde_json::json!({
        "installed": installed.is_some(),
        "prepared": prepared,
        "tag": tag,
        "gameVersion": version,
        "running": is_horizon_running(),
    })
}

/// Запуск Horizon: при необходимости скачивает сборку и готовит ресурсы,
/// затем стартует нативный клиент офлайн с именем активного аккаунта.
#[tauri::command]
pub async fn launch_horizon(app: AppHandle, options: LaunchOptions) -> Result<(), String> {
    if is_horizon_running() {
        return Err("Horizon уже запущен! Закройте открытую игру перед новым запуском.".to_string());
    }
    if crate::minecraft::runner::is_java_game_running() {
        return Err(
            "Minecraft уже запущен! Закройте открытую игру перед новым запуском.".to_string(),
        );
    }

    let (_tag, install_dir, resources) = resolve_horizon(&app).await?;
    let minimize_launcher = options.minimize_launcher.unwrap_or(false);
    let want_fullscreen = options.fullscreen.unwrap_or(false);

    let game_dir = horizon_game_dir();
    fs::create_dir_all(&game_dir).map_err(|e| format!("Не удалось создать папку игры: {}", e))?;

    // Настройки игрока переезжают в options.txt: Horizon читает их сам, как
    // и Java-версия — язык, размер интерфейса и нарратор те же ключи.
    let mut option_values: Vec<(&str, String)> = Vec::new();
    if want_fullscreen {
        option_values.push(("fullscreen", "true".to_string()));
    }
    if let Some(player) = &options.player_options {
        if let Some(lang) = player.lang.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            option_values.push(("lang", lang.to_lowercase()));
        }
        if let Some(scale) = player.gui_scale.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            option_values.push(("guiScale", scale.to_string()));
        }
        if let Some(narrator) = player.narrator.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            option_values.push(("narrator", narrator.to_string()));
        }
    }
    if !option_values.is_empty() {
        let pairs: Vec<(&str, &str)> =
            option_values.iter().map(|(k, v)| (*k, v.as_str())).collect();
        if let Err(e) = write_options(&game_dir, &pairs) {
            eprintln!("[HORIZON] не удалось применить настройки игры: {}", e);
        }
    }

    let mut args: Vec<String> = vec![
        "--resources".to_string(),
        resources.to_string_lossy().to_string(),
        "--game-dir".to_string(),
        game_dir.to_string_lossy().to_string(),
        "--home".to_string(),
        game_dir.to_string_lossy().to_string(),
    ];
    let mut username = options.username.unwrap_or_else(|| "Player".to_string());
    username = username.trim().to_string();
    args.push("--name".to_string());
    args.push(if username.is_empty() { "Player".to_string() } else { username });
    if want_fullscreen {
        args.push("--fullscreen".to_string());
    }
    // Пользовательские аргументы из настроек запуска: у клиента есть
    // --world/--seed/--creative/--server и т. п.
    if let Some(custom) = options.custom_args {
        for a in custom {
            let a = a.trim();
            if !a.is_empty() {
                args.push(a.to_string());
            }
        }
    }

    let log_path = get_app_data_dir().join("horizon_launcher.log");
    let _ = fs::write(&log_path, "--- Horizon Launch ---\n");

    let exe = install_dir.join(client_exe_name());
    emit(&app, "Horizon: запуск игры...");

    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(&args)
        .current_dir(&game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить Horizon: {}", e))?;
    HOR_RUNNING.store(true, Ordering::SeqCst);

    // Ванильный вид окна: Horizon жёстко пишет себе титул «Horizon» и свою
    // иконку, поэтому сразу после появления окна переставляем их на
    // «Minecraft» и настоящую иконку из ассетов (поток сам ждёт окно).
    if let Some(pid) = child.id() {
        let ico = crate::minecraft::horizon_brand::build_vanilla_ico(&horizon_root().join("cache"));
        crate::minecraft::horizon_brand::spawn_window_rebrand(pid, "Minecraft".to_string(), ico);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let log_file: Arc<tokio::sync::Mutex<BufWriter<std::fs::File>>> = Arc::new(
        tokio::sync::Mutex::new(BufWriter::new(
            fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .map_err_to_string()?,
        )),
    );

    if let Some(err) = stderr {
        let log_err = log_file.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[HORIZON-ERR] {}", line);
                let mut f = log_err.lock().await;
                let _ = writeln!(f, "[STDERR] {}", line);
            }
        });
    }

    let app_wait = app.clone();
    tokio::spawn(async move {
        let mut ready = false;
        if let Some(out) = stdout {
            let mut lines = BufReader::new(out).lines();
            // «Окно создано»: Horizon пишет лог, похожий на vanilla, а если
            // молчит — нативный клиент поднимает окно быстро: ждём 10 с.
            loop {
                match tokio::time::timeout(Duration::from_secs(10), lines.next_line()).await {
                    Ok(Ok(Some(line))) => {
                        println!("[HORIZON] {}", line);
                        let _ = writeln!(log_file.lock().await, "[STDOUT] {}", line);
                        if is_window_ready(&line) {
                            ready = true;
                            break;
                        }
                    }
                    Ok(Ok(None)) | Ok(Err(_)) => break,
                    Err(_) => {
                        ready = true;
                        break;
                    }
                }
            }
            if !ready {
                // Лог кончился раньше признака окна: судить будем по коду выхода.
            } else {
                let _ = app_wait.emit("game-ready", ());
                if minimize_launcher {
                    if let Some(window) = app_wait.get_webview_window("main") {
                        let _ = window.minimize();
                    }
                }
            }
            while let Ok(Some(line)) = lines.next_line().await {
                println!("[HORIZON] {}", line);
                let _ = writeln!(log_file.lock().await, "[STDOUT] {}", line);
            }
        }

        let status = child.wait().await;
        HOR_RUNNING.store(false, Ordering::SeqCst);
        {
            let mut f = log_file.lock().await;
            let _ = f.flush();
        }
        let code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);
        if code != 0 {
            let log_text = fs::read_to_string(&log_path).unwrap_or_default();
            let _ = app_wait.emit("game-crashed", log_text);
        } else {
            let _ = app_wait.emit("game-closed", ());
        }
    });

    Ok(())
}
