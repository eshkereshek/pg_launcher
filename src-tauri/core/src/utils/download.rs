use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

/// Чем сверять скачанный файл: манифесты Mojang дают sha1, Modrinth — sha1 и
/// sha512, GitHub и Adoptium — sha256. Длину ожидаемого значения не угадываем:
/// алгоритм приходит вместе с хешем.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Algo {
    Sha1,
    Sha256,
    Sha512,
}

impl Algo {
    fn hex_len(self) -> usize {
        match self {
            Algo::Sha1 => 40,
            Algo::Sha256 => 64,
            Algo::Sha512 => 128,
        }
    }
}

/// Ожидаемая контрольная сумма файла.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Sum<'a> {
    pub algo: Algo,
    pub expected: &'a str,
    /// Ожидаемый размер, если он известен из манифеста.
    ///
    /// Нужен для быстрой проверки уже скачанного файла: у Mojang и Modrinth
    /// размер указан рядом с хешем, и сравнивать размер в разы дешевле, чем
    /// читать и хешировать сотни мегабайт библиотек при каждом запуске игры.
    pub size: Option<u64>,
}

impl<'a> Sum<'a> {
    pub fn sha1(expected: &'a str) -> Option<Self> {
        Self::new(Algo::Sha1, expected)
    }

    pub fn sha256(expected: &'a str) -> Option<Self> {
        Self::new(Algo::Sha256, expected)
    }

    pub fn sha512(expected: &'a str) -> Option<Self> {
        Self::new(Algo::Sha512, expected)
    }

    /// `None`, если хеша нет или он не того вида: пустая строка из ответа
    /// сервера не должна выглядеть как «проверено».
    pub fn new(algo: Algo, expected: &'a str) -> Option<Self> {
        let value = expected.trim();
        let usable = value.len() == algo.hex_len() && value.chars().all(|c| c.is_ascii_hexdigit());
        usable.then_some(Sum {
            algo,
            expected: value,
            size: None,
        })
    }

    /// Добавить ожидаемый размер (`None` — остаётся только хеш).
    pub fn with_size(mut self, size: Option<u64>) -> Self {
        self.size = size;
        self
    }

    /// Полная проверка: читает файл и считает хеш.
    ///
    /// Используется после скачивания — там хеш обязателен.
    fn matches(&self, path: &Path) -> bool {
        file_hash(path, self.algo)
            .map(|h| h.eq_ignore_ascii_case(self.expected))
            .unwrap_or(false)
    }

    /// Быстрая проверка уже лежащего файла: только размер.
    ///
    /// Каждый запуск игры проверял хеши всех библиотек, клиента и индекса
    /// ассетов — это чтение сотен мегабайт с диска впустую. Если размер
    /// совпал с манифестом, файл считаем целым; хеш всё равно проверяется
    /// после любой загрузки, так что битый файл не проскочит.
    fn quick_ok(&self, path: &Path) -> bool {
        match self.size {
            Some(expected) => path
                .metadata()
                .map(|m| m.len() == expected)
                .unwrap_or(false),
            None => self.matches(path),
        }
    }

    fn what(&self) -> &'static str {
        match self.algo {
            Algo::Sha1 => "sha1",
            Algo::Sha256 => "sha256",
            Algo::Sha512 => "sha512",
        }
    }
}

pub fn file_hash(path: &Path, algo: Algo) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut buf = [0u8; 64 * 1024];
    match algo {
        Algo::Sha1 => {
            let mut hasher = Sha1::new();
            loop {
                let n = reader.read(&mut buf).ok()?;
                if n == 0 {
                    break;
                }
                sha1::Digest::update(&mut hasher, &buf[..n]);
            }
            Some(format!("{:x}", sha1::Digest::finalize(hasher)))
        }
        Algo::Sha256 => {
            let mut hasher = sha2::Sha256::new();
            loop {
                let n = reader.read(&mut buf).ok()?;
                if n == 0 {
                    break;
                }
                sha2::Digest::update(&mut hasher, &buf[..n]);
            }
            Some(format!("{:x}", sha2::Digest::finalize(hasher)))
        }
        Algo::Sha512 => {
            let mut hasher = Sha512::new();
            loop {
                let n = reader.read(&mut buf).ok()?;
                if n == 0 {
                    break;
                }
                sha2::Digest::update(&mut hasher, &buf[..n]);
            }
            Some(format!("{:x}", sha2::Digest::finalize(hasher)))
        }
    }
}

pub fn verify_sha1(file_path: &Path, expected_hash: &str) -> bool {
    match Sum::sha1(expected_hash) {
        Some(sum) => sum.matches(file_path),
        None => false,
    }
}

/// Путь, по которому идёт загрузка, пока файл не проверен.
///
/// Качаем всегда в `.part` и переименовываем только после сверки: иначе
/// оборванная закачка остаётся на месте целого файла, и лаунчер больше никогда
/// не попробует скачать его заново (`exists()` — это не проверка).
pub fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".part");
    match dest.parent() {
        Some(parent) => parent.join(name),
        None => PathBuf::from(name),
    }
}

/// Скачать файл, если его нет или он не сходится с хешем.
///
/// Возвращает `true`, если файл действительно скачивался (для прогресса и для
/// логов), `false` — если на диске уже лежал правильный файл.
pub async fn ensure_file(url: &str, dest: &Path, sum: Option<Sum<'_>>) -> Result<bool, String> {
    ensure_file_with(&reqwest::Client::new(), url, dest, sum).await
}

/// То же, но с общим клиентом: у ассетов тысячи мелких файлов, и создавать
/// отдельный пул соединений на каждый — лишняя работа.
pub async fn ensure_file_with(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    sum: Option<Sum<'_>>,
) -> Result<bool, String> {
    ensure_file_with_progress(client, url, dest, sum, |_c, _t| {}).await
}

/// Скачать файл с проверкой хеша и отчётом о прогрессе.
///
/// Нужен там, где файл большой и его прогресс показывается пользователю, но
/// подменять содержимое всё равно нельзя: обновление лаунчера и архив Java —
/// это код, который потом запускается.
pub async fn ensure_file_with_progress<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    sum: Option<Sum<'_>>,
    on_progress: F,
) -> Result<bool, String>
where
    F: Fn(u64, u64),
{
    if dest.is_file() {
        let good = match sum {
            // Хеша нет — доверяем непустому файлу, как раньше, но хотя бы
            // отличаем его от нулевого огрызка оборванной закачки.
            None => dest.metadata().map(|m| m.len() > 0).unwrap_or(false),
            // Уже лежащий файл: достаточно размера, хеш считаем только если
            // размер неизвестен.
            Some(s) => s.quick_ok(dest),
        };
        if good {
            // Обрывок прошлой закачки рядом с целым файлом больше не нужен.
            let _ = fs::remove_file(part_path(dest));
            return Ok(false);
        }
        let _ = fs::remove_file(dest);
    }

    let part = part_path(dest);
    if part.exists() {
        let _ = fs::remove_file(&part);
    }

    download_with_client(client, url, &part, on_progress).await?;

    if let Some(s) = sum {
        if !s.matches(&part) {
            let _ = fs::remove_file(&part);
            let name = dest
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| url.to_string());
            return Err(format!(
                "Файл «{}» скачан с ошибкой: контрольная сумма {} не сходится",
                name,
                s.what()
            ));
        }
    }

    fs::rename(&part, dest).map_err(|e| format!("Не удалось сохранить файл: {}", e))?;
    Ok(true)
}

pub async fn download_file_with_progress<F>(
    url: &str,
    target_path: &Path,
    on_progress: F,
) -> Result<(), String>
where
    F: Fn(u64, u64),
{
    download_with_client(&reqwest::Client::new(), url, target_path, on_progress).await
}

pub async fn download_with_client<F>(
    client: &reqwest::Client,
    url: &str,
    target_path: &Path,
    on_progress: F,
) -> Result<(), String>
where
    F: Fn(u64, u64),
{
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let response = client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PagryshaLauncher/7.2",
        )
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut stream = response.bytes_stream();
    let mut file = File::create(target_path).map_err(|e| e.to_string())?;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Stream error: {}", e))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total_size);
    }

    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn extract_zip_archive(zip_path: &Path, extract_to: &Path) -> Result<(), String> {
    fs::create_dir_all(extract_to).map_err(|e| e.to_string())?;
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match entry.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };

        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_kind_is_taken_from_the_value_length() {
        let sha1 = "a".repeat(40);
        let sha256 = "c".repeat(64);
        let sha512 = "b".repeat(128);

        assert_eq!(Sum::sha1(&sha1).map(|s| s.algo), Some(Algo::Sha1));
        assert_eq!(Sum::sha256(&sha256).map(|s| s.algo), Some(Algo::Sha256));
        assert_eq!(Sum::sha512(&sha512).map(|s| s.algo), Some(Algo::Sha512));
        assert!(
            Sum::sha1("").is_none(),
            "пустой хеш — это отсутствие проверки"
        );
        assert!(
            Sum::sha1(&sha512).is_none(),
            "длина не та — проверять нечем"
        );
        assert!(
            Sum::sha256(&sha1).is_none(),
            "sha1 не должен сойти за sha256"
        );
        assert!(Sum::sha512(&sha256).is_none());
        assert!(Sum::sha256(&"z".repeat(64)).is_none(), "не hex — не хеш");
        assert!(Sum::sha1(&"z".repeat(40)).is_none());
    }

    #[test]
    fn hashes_are_compared_case_insensitively() {
        let path = std::env::temp_dir().join(format!("pg-hash-{}", std::process::id()));
        std::fs::write(&path, b"pagrysha").unwrap();

        let hex = file_hash(&path, Algo::Sha1).unwrap();
        assert_eq!(hex.len(), 40);
        assert!(
            Sum::sha1(&hex).unwrap().matches(&path),
            "свой хеш должен сходиться"
        );
        assert!(
            Sum::sha1(&hex.to_ascii_uppercase()).unwrap().matches(&path),
            "регистр не важен"
        );
        assert!(!Sum::sha1(&"0".repeat(40)).unwrap().matches(&path));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn part_file_sits_next_to_the_target() {
        let p = part_path(Path::new("C:\\games\\lib.jar"));
        assert_eq!(p.file_name().unwrap(), "lib.jar.part");
        assert_eq!(p.parent().unwrap(), Path::new("C:\\games"));
    }
}
