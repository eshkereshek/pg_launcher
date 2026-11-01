//! ИИ-сборщик: модель составляет план, лаунчер подбирает реальные моды.
//!
//! Модель нельзя просить «скажи id модов» — она выдумает несуществующие. Поэтому
//! она возвращает только план (названия/роли и критерии), а конкретные проекты
//! ищутся в Modrinth и попадают в ответ уже с реальными `project_id` и иконками.
//!
//! Ключи провайдеров: сначала `ai.json` в папке лаунчера (игрок может подставить
//! свой), затем зашитый при сборке из `.keys.local` (см. `build.rs`).

use serde_json::{json, Value};

use crate::utils::modgroups::{group_of, ORDER as GROUP_ORDER};
use crate::utils::modpick::{pick_hit, variants};

use super::mods::search_modrinth;

/// Ключ из `ai.json` в папке лаунчера: им можно перекрыть зашитый.
fn runtime_config() -> Value {
    let dir = crate::utils::paths::get_app_data_dir();
    let path = dir.join("ai.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

fn key_from(name: &str, embedded: Option<&'static str>) -> String {
    if let Some(v) = runtime_config()[name].as_str() {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    embedded.unwrap_or_default().trim().to_string()
}

fn cloudflare_token() -> String {
    key_from("cloudflareToken", option_env!("CLOUDFLARE_API_TOKEN"))
}

fn cloudflare_account() -> String {
    key_from("cloudflareAccountId", option_env!("CLOUDFLARE_ACCOUNT_ID"))
}

/// Какие провайдеры готовы к работе — для настроек и понятной ошибки.
#[tauri::command]
pub fn ai_status() -> Value {
    json!({
        "cloudflare": !cloudflare_token().is_empty() && !cloudflare_account().is_empty(),
        "model": runtime_config()["cloudflareModel"]
            .as_str()
            .unwrap_or("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),

    })
}

async fn ask_cloudflare(system: &str, user: &str) -> Result<Value, String> {
    let token = cloudflare_token();
    let account = cloudflare_account();
    if token.is_empty() || account.is_empty() {
        return Err("Cloudflare не настроен: нужны токен и Account ID".into());
    }

    let model = runtime_config()["cloudflareModel"]
        .as_str()
        .unwrap_or("@cf/meta/llama-3.3-70b-instruct-fp8-fast")
        .to_string();

    let body = json!({
        "max_tokens": 4096,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });

    let url = format!("https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}");
    let resp = reqwest::Client::new()
        .post(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Cloudflare недоступен: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let short: String = text.chars().take(200).collect();
        return Err(format!("Cloudflare вернул {}: {}", status.as_u16(), short));
    }

    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Разбор ответа: {e}"))?;
    // gpt-oss кладёт рассуждения в reasoning_content и оставляет content пустым,
    // поэтому берём то поле, где действительно есть текст.
    let message = &parsed["result"]["choices"][0]["message"];
    let content = message["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| message["reasoning_content"].as_str())
        .ok_or("В ответе Cloudflare нет текста")?;

    parse_json_reply(content)
}

/// Модели любят добавлять ```json и пояснения — берём первый объект в ответе.
fn parse_json_reply(content: &str) -> Result<Value, String> {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```");
    if let Ok(v) = serde_json::from_str(cleaned.trim()) {
        return Ok(v);
    }
    let start = content.find('{').ok_or("Модель вернула не JSON")?;
    let body = &content[start..];

    // Ответ мог обрезаться по лимиту токенов: у модели не хватило места
    // закрыть массив. Тогда отбрасываем хвост до последнего целого объекта и
    // закрываем скобки сами — лучше часть плана, чем ошибка.
    if let Some(repaired) = repair_truncated(body) {
        return Ok(repaired);
    }

    let end = content.rfind('}').ok_or("Модель вернула не JSON")?;
    serde_json::from_str(&content[start..=end]).map_err(|e| format!("Модель вернула не JSON: {e}"))
}

/// Достраивает обрезанный JSON: ищет последний завершённый объект и закрывает
/// массив с внешним объектом.
fn repair_truncated(body: &str) -> Option<Value> {
    let mut end = body.len();
    while end > 0 {
        let cut = body[..end].rfind('}')?;
        let candidate = format!("{}]}}", &body[..=cut]);
        if let Ok(value) = serde_json::from_str::<Value>(&candidate) {
            // Пустой массив модов бесполезен — считаем, что не починили.
            if value["mods"]
                .as_array()
                .map(|m| !m.is_empty())
                .unwrap_or(false)
            {
                return Some(value);
            }
            return None;
        }
        end = cut;
    }
    None
}

/// Единственный провайдер — Cloudflare Workers AI.
async fn ask_model(system: &str, user: &str) -> Result<Value, String> {
    ask_cloudflare(system, user).await
}
/// Из плана достаём пары «запрос — зачем»: остальное приходит из Modrinth.
fn plan_items(plan: &Value) -> Vec<(String, String)> {
    plan["mods"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let query = item["query"].as_str().unwrap_or("").trim().to_string();
                    if query.is_empty() {
                        return None;
                    }
                    let role = item["role"].as_str().unwrap_or("").to_string();
                    Some((query, role))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Ключ сравнения названий: `Better Questing: Quests` → `better questing`.
fn base_name(query: &str) -> String {
    query
        .split(':')
        .next()
        .unwrap_or(query)
        .trim()
        .to_lowercase()
}

/// Один проект из выдачи: категории дают группу, `why` — пояснение модели.
fn hit_to_mod(hit: &Value, role: &str) -> Value {
    let categories = hit["categories"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|c| c.as_str().map(str::to_string))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    let title = hit["title"].as_str().unwrap_or("");
    json!({
        "project_id": hit["project_id"],
        "title": hit["title"],
        "icon_url": hit["icon_url"],
        "description": hit["description"],
        "downloads": hit["downloads"],
        "why": role,
        "group": group_of(&categories, title),
    })
}

/// Ищет один мод, пробуя варианты запроса: точное название, затем без скобок и
/// служебных слов. Модель часто добавляет уточнения, которых нет в названии.
async fn resolve_one(
    query: String,
    role: String,
    loader: String,
    version: String,
) -> Result<Value, String> {
    for variant in variants(&query) {
        let hits = search_modrinth(&variant, &loader, &version, 0, "mod", "relevance", "").await;
        if let Ok(hits) = hits {
            if let Some(hit) = pick_hit(&hits, &variant) {
                return Ok(hit_to_mod(&hit, &role));
            }
        }
    }
    Err(query)
}

/// Ищет моды пачками по 6 запросов: сорок модов подряд по одному — это минута
/// ожидания, хотя поиск друг от друга не зависит.
async fn resolve_batch(
    items: Vec<(String, String)>,
    loader: String,
    game_version: String,
) -> Vec<Result<Value, String>> {
    use futures_util::stream::{self, StreamExt};

    let mut results: Vec<(usize, Result<Value, String>)> =
        stream::iter(items.into_iter().enumerate())
            .map(|(index, (query, role))| {
                let loader = loader.clone();
                let game_version = game_version.clone();
                async move {
                    let result = resolve_one(query, role, loader, game_version).await;
                    (index, result)
                }
            })
            .buffer_unordered(6)
            .collect()
            .await;

    // buffer_unordered отдаёт в порядке готовности — возвращаем порядок плана.
    results.sort_by_key(|(index, _)| *index);
    results.into_iter().map(|(_, result)| result).collect()
}

/// Загрузчик из ответа модели: свободный текст сводим к четырём известным.
fn normalize_loader(value: &str) -> String {
    let lower = value.to_lowercase();
    if lower.contains("neo") {
        "neoforge".into()
    } else if lower.contains("quilt") {
        "quilt".into()
    } else if lower.contains("fabric") {
        "fabric".into()
    } else if lower.contains("forge") {
        "forge".into()
    } else {
        "fabric".into()
    }
}

/// Версия вида `1.20.1`; всё остальное считаем невалидным ответом модели.
fn normalize_version(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let parts: Vec<&str> = trimmed.split('.').collect();
    let shaped = parts.len() == 2 || parts.len() == 3;
    if shaped
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}
/// Предел модов в сборке: больше — и установка превращается в марафон.
const MAX_MODS: u32 = 60;

/// Составляет план сборки и подбирает под него реальные моды Modrinth.
#[tauri::command]
pub async fn ai_plan(
    request: String,
    game_version: String,
    loader: String,
    count: u32,
) -> Result<Value, String> {
    let target = count.clamp(5, MAX_MODS) as usize;
    // Версию и загрузчик модель выбирает сама, если её не ограничили фильтрами.
    let auto_version = game_version.trim().is_empty() || game_version.eq_ignore_ascii_case("auto");
    let auto_loader = loader.trim().is_empty() || loader.eq_ignore_ascii_case("auto");

    let system = "Ты помощник лаунчера Minecraft и составляешь сборки модов. \
Отвечай строго одним JSON-объектом без пояснений и markdown. Схема: \
{\"name\":\"короткое название сборки\",\"summary\":\"одно предложение о сборке\",\
\"loader\":\"fabric|forge|neoforge|quilt\",\"gameVersion\":\"например 1.20.1\",\
\"mods\":[{\"query\":\"название мода для поиска в Modrinth\",\"role\":\"зачем он нужен\"}]}. \
В query указывай реально существующие популярные моды, названия как в Modrinth \
(например Create, JEI, AE2, Farmer's Delight), а не описания. \
Сборка должна быть полной: несколько модов на оптимизацию (Sodium/Embeddium, Lithium, FerriteCore), \
обязательные библиотеки (Architectury API, Cloth Config, GeckoLib — если они нужны), \
затем контент по теме запроса. Шейдеры и ресурспаки не включай. \
Загрузчик и моды должны сходиться: Sodium, Lithium, Fabric API, Origins — только Fabric; \
Embeddium, Thermal Expansion, Immersive Engineering, EnderIO, IndustrialCraft, Thaumcraft, \
Better Questing, Waila — только Forge. Не предлагай мод, если не уверен, что он есть в Modrinth \
под выбранные версию и загрузчик; лучше возьми другой.";

    // Модель ошибается в названиях, и часть запросов не находится, поэтому просим
    // с запасом: до цели доберём вторым проходом.
    let ask_first = ((target as f32 * 1.2).ceil() as usize).min(60);
    let target_line = match (auto_version, auto_loader) {
        (true, true) => "Версию игры и загрузчик выбери сам — те, под которые есть \
нужные моды (для техники и квестов это обычно Forge, для оптимизации и лёгких сборок — Fabric). \
Верни их в полях gameVersion и loader."
            .to_string(),
        _ => format!(
            "Версия игры: {game_version}. Загрузчик: {loader}. Все моды должны \
поддерживать эту версию и загрузчик."
        ),
    };
    let user = format!("Запрос игрока: {request}\n{target_line}\nНужно {ask_first} модов.");

    let mut plan = ask_model(system, &user).await?;

    // Дальше работаем только с проверенными значениями: модель может вернуть
    // «Forge 1.20» или пустоту.
    let chosen_version = if auto_version {
        normalize_version(plan["gameVersion"].as_str().unwrap_or(""))
            .unwrap_or_else(|| "1.20.1".into())
    } else {
        game_version.clone()
    };
    let chosen_loader = if auto_loader {
        normalize_loader(plan["loader"].as_str().unwrap_or(""))
    } else {
        loader.clone()
    };
    let (game_version, mut loader) = (chosen_version, chosen_loader);

    let mut resolved: Vec<Value> = Vec::new();
    let mut unresolved: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let push_results = |results: Vec<Result<Value, String>>,
                        resolved: &mut Vec<Value>,
                        unresolved: &mut Vec<String>,
                        seen: &mut std::collections::HashSet<String>| {
        for result in results {
            match result {
                Ok(mod_info) => {
                    let id = mod_info["project_id"].as_str().unwrap_or("").to_string();
                    if id.is_empty() || !seen.insert(id) {
                        continue;
                    }
                    resolved.push(mod_info);
                }
                // Модель любит повторять неудачное название с разными хвостами
                // (`X`, `X: Quests`): в списке ненайденного оставляем одно.
                Err(query) => {
                    let key = base_name(&query);
                    if !unresolved.iter().any(|u| base_name(u) == key) {
                        unresolved.push(query);
                    }
                }
            }
        }
    };

    let items = plan_items(&plan);

    // Модель часто называет моды «чужого» загрузчика (Immersive Engineering под
    // Fabric): по названиям не угадать, зато видно по результату. Поэтому при
    // авто-выборе ищем под обоими загрузчиками сразу и оставляем тот, где
    // нашлось больше модов — так сборка не теряет половину состава.
    let results = if auto_loader {
        let alternative = if loader == "fabric" {
            "forge".to_string()
        } else {
            "fabric".to_string()
        };
        let (primary, secondary) = tokio::join!(
            resolve_batch(items.clone(), loader.clone(), game_version.clone()),
            resolve_batch(items.clone(), alternative.clone(), game_version.clone()),
        );
        let primary_ok = primary.iter().filter(|r| r.is_ok()).count();
        let secondary_ok = secondary.iter().filter(|r| r.is_ok()).count();
        if secondary_ok > primary_ok {
            loader = alternative;
            secondary
        } else {
            primary
        }
    } else {
        resolve_batch(items.clone(), loader.clone(), game_version.clone()).await
    };
    push_results(results, &mut resolved, &mut unresolved, &mut seen);

    // Второй проход: просим именно тех модов, которых не хватает до цели.
    let mut rounds = 0;
    while resolved.len() < target && rounds < 2 {
        rounds += 1;
        let need = (target - resolved.len()).min(12);
        let have: Vec<String> = resolved
            .iter()
            .filter_map(|m| m["title"].as_str().map(str::to_string))
            .collect();
        let refill_user = format!(
            "Запрос игрока: {request}\nВерсия игры: {game_version}. Загрузчик: {loader}.\n\
Уже выбраны: {}.\n\
Предложи ещё {need} других модов под ту же тему. Правила: не повторяй выбранные, \
не добавляй к названиям суффиксы вроде ': Quests', 'Expansion', 'Enhanced' — \
пиши точные названия существующих проектов Modrinth, которые есть под {loader} {game_version}.",
            have.join(", ")
        );
        let more = match ask_model(system, &refill_user).await {
            Ok(value) => value,
            // Второй проход — необязательный: без него сборка просто меньше.
            Err(_) => break,
        };
        // Отбрасываем то, что уже не нашлось: иначе модель гоняет те же имена
        // по кругу и раздувает список ненайденного.
        let failed: Vec<String> = unresolved.iter().map(|u| base_name(u)).collect();
        let taken: Vec<String> = resolved
            .iter()
            .filter_map(|m| m["title"].as_str().map(|t| t.to_lowercase()))
            .collect();
        let items: Vec<(String, String)> = plan_items(&more)
            .into_iter()
            .filter(|(query, _)| {
                let key = base_name(query);
                !failed.contains(&key) && !taken.iter().any(|t| t.contains(&key))
            })
            .collect();
        if items.is_empty() {
            break;
        }
        let results = resolve_batch(items, loader.clone(), game_version.clone()).await;
        push_results(results, &mut resolved, &mut unresolved, &mut seen);
        plan["name"] = more["name"].clone();
    }

    if resolved.is_empty() {
        return Err(
            "Не удалось подобрать ни одного мода — попробуйте переформулировать запрос".into(),
        );
    }

    // Перебор не нужен: игрок просил сорок, лишние двадцать только удлиняют установку.
    resolved.truncate((target + 8).min(MAX_MODS as usize));

    // Держим порядок групп, а внутри — по популярности: так предпросмотр читается.
    resolved.sort_by_key(|m| {
        let group = m["group"].as_str().unwrap_or("other");
        let index = group_order(group);
        (
            index,
            std::cmp::Reverse(m["downloads"].as_u64().unwrap_or(0)),
        )
    });

    Ok(json!({
        "name": plan["name"],
        "summary": plan["summary"],
        "loader": loader,
        "gameVersion": game_version,
        "mods": resolved,
        "unresolved": unresolved,
    }))
}

/// Порядок групп в предпросмотре: оптимизация и библиотеки идут первыми.
fn group_order(group: &str) -> usize {
    GROUP_ORDER
        .iter()
        .position(|name| *name == group)
        .unwrap_or(GROUP_ORDER.len())
}

/// История чатов лежит рядом с настройками лаунчера, а не в localStorage:
/// так она переживает очистку кэша webview.
fn history_path() -> std::path::PathBuf {
    crate::utils::paths::get_app_data_dir().join("ai-chats.json")
}

#[tauri::command]
pub fn ai_history_load() -> Value {
    std::fs::read_to_string(history_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!([]))
}

#[tauri::command]
pub fn ai_history_save(chats: Value) -> Result<(), String> {
    let dir = crate::utils::paths::get_app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Не удалось создать папку: {e}"))?;
    let text = serde_json::to_string_pretty(&chats).map_err(|e| e.to_string())?;
    std::fs::write(history_path(), text).map_err(|e| format!("Не удалось сохранить историю: {e}"))
}
