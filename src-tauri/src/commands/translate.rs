//! Машинный перевод описаний проектов.
//!
//! Описания на Modrinth и CurseForge почти всегда английские, а читать их в
//! лаунчере нужно по-русски. Ключей ни у кого нет, поэтому провайдеры —
//! публичные веб-эндпоинты переводчиков: основной — веб-эндпоинт Google
//! (`translate_a`, тот же, что у веб-переводчика), запасной — MyMemory. Оба без
//! ключей и без гарантий, отсюда правила ниже.
//!
//! Что сделано, чтобы перевод не портил описание:
//!  * блоки кода не переводятся вообще — за это отвечает `utils::translate`
//!    в `pagrysha-core` (там же тесты): Google переводит строки внутри ```...```
//!    и портит сам маркер блока;
//!  * куски переводятся параллельно — длинное описание ждётся в разы быстрее,
//!    чем по одному запросу подряд;
//!  * сбой одного провайдера не рвёт перевод: второй провайдер и повторные
//!    попытки с паузой;
//!  * результат кладётся на диск, поэтому повторный просмотр той же сборки
//!    мгновенный и не тратит лимиты;
//!  * прогресс уходит событием `translate-progress`, чтобы кнопка не выглядела
//!    зависшей на длинном тексте.
//!
//! Перевод делает Rust, а не страница: `connect-src` в CSP разрешает вебвью
//! только api.modrinth.com и skinsystem.ely.by, так что fetch переводчика из
//! интерфейса всё равно был бы заблокирован, а HTTP из процесса лаунчера CSP не
//! касается.

use crate::utils::paths::get_app_data_dir;
use crate::utils::translate::{cyrillic_share, parse_google_response, plan_translation, Piece};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const USER_AGENT: &str = "PagryshaLauncher/7.2 (github.com/pagrysha-launcher)";

/// Один кусок текста на запрос: у веб-эндпоинтов есть лимит на длину строки
/// запроса, а длинный текст переводчики отрезают молча.
const CHUNK_CHARS: usize = 1200;

/// Всего переводим не больше. Описание может быть на сотни тысяч символов —
/// такой объём упрётся в дневные лимиты провайдера, а хвост всё равно никто не
/// читает. Остаток помечаем в интерфейсе.
const MAX_CHARS: usize = 20_000;

/// Сколько кусков переводится одновременно. Больше — выше шанс упереться в
/// лимит запросов провайдера.
const CONCURRENCY: usize = 3;

/// Попыток на один кусок. Внутри попытки перебираются все провайдеры, а
/// непереведённое потом добирается вторым проходом — трёх кругов не нужно.
const ATTEMPTS: usize = 2;

/// Сколько файлов перевода держим на диске.
const CACHE_FILES: usize = 300;

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn cache_dir() -> PathBuf {
    get_app_data_dir().join("cache").join("translations")
}

/// Ключ кэша — хэш от текста и языка: тот же текст переводим один раз.
fn cache_key(text: &str, target: &str) -> String {
    let mut hasher = DefaultHasher::default();
    text.hash(&mut hasher);
    target.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn cache_read(key: &str) -> Option<Value> {
    let raw = fs::read_to_string(cache_dir().join(format!("{key}.json"))).ok()?;
    serde_json::from_str(&raw).ok()
}

fn cache_write(key: &str, value: &Value) {
    let dir = cache_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let _ = fs::write(dir.join(format!("{key}.json")), value.to_string());
    prune_cache(&dir);
}

/// Кэш не должен разрастаться: оставляем самые свежие файлы.
fn prune_cache(dir: &PathBuf) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()?.to_str()? != "json" {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, path))
        })
        .collect();

    let extra = files.len().saturating_sub(CACHE_FILES);
    if extra == 0 {
        return;
    }

    files.sort_by(|a, b| a.0.cmp(&b.0));
    for (_, path) in files.into_iter().take(extra) {
        let _ = fs::remove_file(path);
    }
}

/// Адреса веб-переводчика Google.
///
/// Основной (`translate_a/single`, как у веб-переводчика) на всплесках отвечает
/// 429 — тогда идём на второй хост с другим клиентом. Именно из-за 429 перевод
/// описания молча не появлялся: запасной MyMemory на куске в 1200 символов
/// всегда упирается в свой лимит и тоже падает.
const GOOGLE_ENDPOINTS: [&str; 2] = [
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&dj=1&tl={target}&q={text}",
    "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl={target}&q={text}",
];

async fn google_chunk(http: &reqwest::Client, text: &str, target: &str) -> Result<String, String> {
    let mut last = "Google не ответил".to_string();

    for endpoint in GOOGLE_ENDPOINTS {
        let url = endpoint
            .replace("{target}", &urlencoding::encode(target))
            .replace("{text}", &urlencoding::encode(text));

        let resp = match http.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                last = format!("Google не ответил ({})", e);
                continue;
            }
        };
        let status = resp.status();
        if !status.is_success() {
            last = format!("Google ответил {}", status);
            continue;
        }

        let data: Value = match resp.json().await {
            Ok(data) => data,
            Err(e) => {
                last = format!("Google прислал непонятное ({})", e);
                continue;
            }
        };

        match parse_google_response(&data) {
            Some(text) => return Ok(text),
            None => last = "Google вернул пустой перевод".to_string(),
        }
    }

    Err(last)
}

async fn mymemory_chunk(
    http: &reqwest::Client,
    text: &str,
    target: &str,
) -> Result<String, String> {
    // У MyMemory автоопределения языка нет, а описания на Modrinth английские.
    // Запрос у него ограничен несколькими сотнями байт, поэтому кусок режется
    // на части: раньше сюда приходил текст на 1200 символов, API отвечал
    // ошибкой, и запасного провайдера фактически не было.
    let mut out = String::new();
    for part in split_by_bytes(text, MYMEMORY_PART_BYTES) {
        let url = format!(
            "https://api.mymemory.translated.net/get?q={}&langpair=en|{}",
            urlencoding::encode(&part),
            urlencoding::encode(target)
        );

        let resp = http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("MyMemory не ответил ({})", e))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("MyMemory ответил {}", status));
        }

        let data: Value = resp
            .json()
            .await
            .map_err(|e| format!("MyMemory прислал непонятное ({})", e))?;
        let translated = data
            .get("response_data")
            .and_then(|d| d.get("translated_text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        if translated.is_empty() {
            return Err("MyMemory вернул пустой перевод".to_string());
        }
        out.push_str(&translated);
    }

    Ok(out)
}

/// Сколько байт отдаём MyMemory за один запрос: у него лимит на длину `q`.
const MYMEMORY_PART_BYTES: usize = 400;

/// Порезать текст на части не длиннее `limit` байт по границам слов.
///
/// Режем по пробелам: переводчик иначе рвёт слово посередине и в тексте
/// появляется склейка из двух половин.
fn split_by_bytes(text: &str, limit: usize) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();

    for word in text.split_inclusive(' ') {
        if !current.is_empty() && current.len() + word.len() > limit {
            parts.push(std::mem::take(&mut current));
        }
        // Слово длиннее предела режем по символам, иначе часть не влезет никогда.
        if word.len() > limit {
            for ch in word.chars() {
                if current.len() + ch.len_utf8() > limit {
                    parts.push(std::mem::take(&mut current));
                }
                current.push(ch);
            }
            continue;
        }
        current.push_str(word);
    }

    if !current.is_empty() {
        parts.push(current);
    }
    if parts.is_empty() {
        parts.push(text.to_string());
    }
    parts
}

/// Кусок текста через оба провайдера с повторами. Отдаёт перевод и имя
/// провайдера — по нему видно, кто сейчас жив.
async fn translate_chunk(
    http: &reqwest::Client,
    text: &str,
    target: &str,
) -> Result<(String, &'static str), String> {
    let mut last = "провайдеры не ответили".to_string();

    for attempt in 0..ATTEMPTS {
        match google_chunk(http, text, target).await {
            Ok(text) => return Ok((text, "google")),
            Err(google_error) => match mymemory_chunk(http, text, target).await {
                // Запасной провайдер жив — его и пишем в результат.
                Ok(text) => return Ok((text, "mymemory")),
                // Оба молчали: в ошибку идут оба объяснения, иначе по одному
                // слову «ошибка» ничего не поймать.
                Err(memory_error) => {
                    last = format!("Google: {}; MyMemory: {}", google_error, memory_error);
                }
            },
        }

        if attempt + 1 < ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(400 * (attempt as u64 + 1))).await;
        }
    }

    Err(last)
}

/// Перевод текста описания.
///
/// Отвечает `{ text, provider, truncated, partial, already_target }`.
/// Если переводятся не все куски, неотданные остаются оригиналом и приходит
/// `partial: true` — половину текста пользователь всё равно получает, а не
/// ошибку вместо всего описания.
/// Ядро перевода без Tauri.
///
/// `app` нужен только для события прогресса, поэтому его можно не передавать:
/// так перевод проверяется отдельным бинарником без поднятия окна.
pub async fn translate_document(
    app: Option<&AppHandle>,
    text: String,
    target: String,
) -> Result<Value, String> {
    let target = {
        let trimmed = target.trim().to_lowercase();
        if trimmed.is_empty() {
            "ru".to_string()
        } else {
            trimmed
        }
    };
    let source = text.trim().to_string();
    if source.is_empty() {
        return Err("Пустое описание — переводить нечего.".to_string());
    }

    // Русское описание переводить незачем: Google вернул бы его же, только
    // кривее, а лимит запросов был бы потрачен зря.
    if target == "ru" && cyrillic_share(&source) > 0.6 {
        return Ok(json!({
            "text": source,
            "provider": "none",
            "truncated": false,
            "partial": false,
            "already_target": true
        }));
    }

    let key = cache_key(&source, &target);
    if let Some(mut cached) = cache_read(&key) {
        if let Some(obj) = cached.as_object_mut() {
            obj.insert("cached".to_string(), json!(true));
        }
        return Ok(cached);
    }

    let mut limited = String::new();
    let mut truncated = false;
    for (index, ch) in source.chars().enumerate() {
        if index >= MAX_CHARS {
            truncated = true;
            break;
        }
        limited.push(ch);
    }

    let plan = plan_translation(&limited, CHUNK_CHARS);
    let mut slots: Vec<Option<String>> = vec![None; plan.len()];
    let mut jobs: Vec<(usize, String)> = Vec::new();
    // Оригинал каждого куска нужен, чтобы кусок без перевода не пропал.
    let mut originals: HashMap<usize, String> = HashMap::new();

    for (index, piece) in plan.iter().enumerate() {
        match piece {
            Piece::Literal(text) => slots[index] = Some(text.clone()),
            Piece::Translate(text) => {
                originals.insert(index, text.clone());
                jobs.push((index, text.clone()));
            }
        }
    }

    if jobs.is_empty() {
        // Всё описание — код. Переводить нечего, возвращаем как есть.
        return Ok(json!({
            "text": limited,
            "provider": "none",
            "truncated": truncated,
            "partial": false,
            "already_target": false
        }));
    }

    let http = client()?;
    let total = jobs.len();
    let mut done = 0usize;
    let mut provider = String::new();
    let mut first_error: Option<String> = None;

    let mut stream = futures_util::stream::iter(jobs.into_iter().map(|(index, chunk)| {
        let http = http.clone();
        let target = target.clone();
        async move {
            let result = translate_chunk(&http, &chunk, &target).await;
            (index, result)
        }
    }))
    .buffer_unordered(CONCURRENCY);

    while let Some((index, result)) = stream.next().await {
        match result {
            Ok((piece, name)) => {
                if provider.is_empty() {
                    provider = name.to_string();
                }
                slots[index] = Some(piece);
            }
            Err(e) => {
                // Куски не считаем здесь: их число нужно уже после повторов.
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
        }

        done += 1;
        if let Some(app) = app {
            let _ = app.emit(
                "translate-progress",
                json!({ "done": done, "total": total }),
            );
        }
    }

    // Второй проход по кускам, которые не перевелись с первого раза.
    //
    // Провайдеры отвечают через раз: пара неудачных кусков оставляла английские
    // абзацы посреди русского текста, и описание выглядело «непереведённым».
    // Здесь идём по одному куску за раз — параллельные повторы снова упираются
    // в тот же лимит, из-за которого первый проход и сорвался.
    let missing: Vec<usize> = slots
        .iter()
        .enumerate()
        .filter(|(_, slot)| slot.is_none())
        .map(|(index, _)| index)
        .collect();

    for index in missing {
        let Some(chunk) = originals.get(&index).cloned() else {
            continue;
        };
        tokio::time::sleep(Duration::from_millis(300)).await;
        if let Ok((piece, name)) = translate_chunk(&http, &chunk, &target).await {
            if provider.is_empty() {
                provider = name.to_string();
            }
            slots[index] = Some(piece);
            done += 1;
            if let Some(app) = app {
                let _ = app.emit(
                    "translate-progress",
                    json!({ "done": done, "total": total }),
                );
            }
        }
    }

    // Сколько кусков так и осталось на английском — по этому числу решаем,
    // отдавать ошибку, помечать перевод неполным или класть его в кэш.
    let failed = slots.iter().filter(|slot| slot.is_none()).count();

    if failed == total {
        return Err(format!(
            "Переводчики молчат: {}",
            first_error.unwrap_or("провайдеры не ответили".to_string())
        ));
    }

    for index in 0..slots.len() {
        if slots[index].is_none() {
            if let Some(original) = originals.get(&index) {
                slots[index] = Some(original.clone());
            }
        }
    }

    let translated: String = slots
        .into_iter()
        .map(|slot| slot.unwrap_or_default())
        .collect();
    if translated.trim().is_empty() {
        return Err("Переводчики вернули пустой текст.".to_string());
    }

    let result = json!({
        "text": translated,
        "provider": provider,
        "truncated": truncated,
        "partial": failed > 0,
        "already_target": false
    });
    // Неполный перевод на диск не кладём: при следующем открытии должен
    // быть ещё один шанс дотянуть куски.
    if failed == 0 {
        cache_write(&key, &result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn translate_text(app: AppHandle, text: String, target: String) -> Result<Value, String> {
    translate_document(Some(&app), text, target).await
}
