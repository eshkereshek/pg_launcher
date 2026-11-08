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

use super::mods::{get_installed_mods, search_modrinth};

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
    let content = cloudflare_raw(
        json!([
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]),
        None,
    )
    .await?;
    parse_json_reply(&content)
}

/// Низкий уровень: отправляет произвольный список сообщений и возвращает текст
/// ответа. Нужен чату, которому важно передать историю диалога.
async fn cloudflare_raw(messages: Value, max_tokens: Option<u32>) -> Result<String, String> {
    let token = cloudflare_token();
    let account = cloudflare_account();
    if token.is_empty() || account.is_empty() {
        return Err("Cloudflare не настроен: нужны токен и Account ID".into());
    }

    let model = runtime_config()["cloudflareModel"]
        .as_str()
        .unwrap_or("@cf/meta/llama-3.3-70b-instruct-fp8-fast")
        .to_string();

    // Сто с лишним модов планом — это тысячи токенов JSON; 4096 хватало лишь
    // старым коротким сборкам. Лимит можно поднять/понизить в ai.json.
    let max_tokens = max_tokens.unwrap_or_else(|| {
        runtime_config()["maxTokens"]
            .as_u64()
            .unwrap_or(8192)
            .clamp(1024, 32768) as u32
    });

    let body = json!({
        "max_tokens": max_tokens,
        "messages": messages
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

    Ok(content.to_string())
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

/// Ищет моды пачками по 6 запросов: сотня модов подряд по одному — это минута
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
/// Предел модов в сборке: игрок просил «от ста и больше», поэтому потолок —
/// 160, а не бывшие шестьдесят; установка больших сборок идёт с прогрессом.
const MAX_MODS: u32 = 160;

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
{\"name\":\"короткое название сборки по-английски, 2-4 слова латиницей, без кавычек и эмодзи\",\"summary\":\"одно предложение о сборке по-русски\",\
\"loader\":\"fabric|forge|neoforge|quilt\",\"gameVersion\":\"например 1.20.1\",\
\"mods\":[{\"query\":\"название мода для поиска в Modrinth\",\"role\":\"зачем он нужен\"}]}. \
В query указывай реально существующие популярные моды, названия как в Modrinth \
(например Create, JEI, AE2, Farmer's Delight), а не описания. \
Следуй теме запроса строго: узкий запрос (оптимизация, \
производительность, только техника и т. п.) собирай только из модов этой \
темы и нужных им библиотек — контентные моды ради объёма не добавляй. \
Для обычных сборок держи базу: несколько модов на оптимизацию (Sodium/Embeddium, Lithium, FerriteCore), \
обязательные библиотеки (Architectury API, Cloth Config, GeckoLib — если они нужны), \
затем контент по теме запроса. Шейдеры и ресурспаки не включай. \
Количество — не самоцель: лучше вернуть 50 точных существующих проектов, \
чем 150 с выдуманными или малоизвестными названиями. \
Загрузчик и моды должны сходиться: Sodium, Lithium, Fabric API, Origins — только Fabric; \
Embeddium, Thermal Expansion, Immersive Engineering, EnderIO, IndustrialCraft, Thaumcraft, \
Better Questing, Waila — только Forge. Не предлагай мод, если не уверен, что он есть в Modrinth \
под выбранные версию и загрузчик; лучше возьми другой.";

    // Модель ошибается в названиях, и часть запросов не находится, поэтому просим
    // с запасом: до цели доберём вторым проходом.
    let ask_first = ((target as f32 * 1.25).ceil() as usize).min(MAX_MODS as usize);
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
    let user = format!(
        "Запрос игрока: {request}\n{target_line}\n\
         Цель — большая сборка, около {ask_first} модов, если тема широкая. \
         Для узкой темы верни столько реальных модов, сколько по ней существует: \
         выдумывать названия и брать моды не своей темы нельзя."
    );

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
    // Для больших сборок (100+) одного захода мало: добираем до пятью заходами
    // по 30 модов за раз.
    let mut rounds = 0;
    while resolved.len() < target && rounds < 5 {
        rounds += 1;
        let need = (target - resolved.len()).min(30);
        let have: Vec<String> = resolved
            .iter()
            .filter_map(|m| m["title"].as_str().map(str::to_string))
            .collect();
        let refill_user = format!(
            "Запрос игрока: {request}\nВерсия игры: {game_version}. Загрузчик: {loader}.\n\
Уже выбраны: {}.\n\
Предложи ещё {need} других модов под ту же тему. Правила: не повторяй выбранные, \
не добавляй к названиям суффиксы вроде ': Quests', 'Expansion', 'Enhanced' — \
пиши точные названия существующих проектов Modrinth, которые есть под {loader} {game_version}. \
Если модов этой темы больше не знаешь — верни короткий список или пустой массив mods, \
выдумывать названия нельзя.",
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
        let before = resolved.len();
        let results = resolve_batch(items, loader.clone(), game_version.clone()).await;
        push_results(results, &mut resolved, &mut unresolved, &mut seen);
        plan["name"] = more["name"].clone();

        // Качество важнее количества: если заход принёс почти одни ненайденные
        // названия — реальные моды этой темы кончились, дальше будет только
        // «не найдено» в копилку.
        if resolved.len() - before < need.min(6) {
            break;
        }
    }

    if resolved.is_empty() {
        return Err(
            "Не удалось подобрать ни одного мода — попробуйте переформулировать запрос".into(),
        );
    }

    // Перебор не нужен: лишние сверх запроса моды только удлиняют установку.
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

/// Чат на вкладке сборок: либо обычный ответ на вопрос, либо заказ сборки.
/// Однословные темы («оптимизация», «техно», …) считаем заказом без похода
/// в модель — так игрок получает сборку сразу и не жжёт токены.
#[tauri::command]
pub async fn ai_assistant(
    message: String,
    history: Option<Vec<Value>>,
    pack: Option<Value>,
) -> Result<Value, String> {
    let text = message.trim().to_string();
    if text.is_empty() {
        return Err("Пустое сообщение".into());
    }

    // Контекст последней сборки этого чата: имя, загрузчик, версия и моды.
    let pack_name = pack
        .as_ref()
        .and_then(|p| p["name"].as_str())
        .unwrap_or("")
        .to_string();
    let pack_loader = pack
        .as_ref()
        .and_then(|p| p["loader"].as_str())
        .unwrap_or("fabric")
        .to_string();
    let pack_version = pack
        .as_ref()
        .and_then(|p| p["version"].as_str())
        .unwrap_or("")
        .to_string();
    let pack_titles: Vec<String> = pack
        .as_ref()
        .and_then(|p| p["mods"].as_array())
        .map(|list| {
            list.iter()
                .filter_map(|mod_item| mod_item["title"].as_str())
                .map(|title| title.to_string())
                .collect()
        })
        .unwrap_or_default();

    if looks_like_pack_request(&text) {
        return Ok(json!({ "kind": "pack" }));
    }

    let mut system = String::from(
        "Ты — помощник лаунчера Minecraft «Pagrysha». Игрок пишет в чат на вкладке сборок. \
Реши, что он хочет, и ответь СТРОГО одним JSON-объектом без markdown: \
{\"kind\":\"pack\"} — если просит собрать новую сборку (в том числе одной темой: оптимизация, \
производительность, техно, магия, RPG, выживание, приключение, декор, фермерство, мобы, квесты); \
{\"kind\":\"chat\",\"answer\":\"ответ по-русски, до 700 символов, без markdown\"} — на любой другой вопрос. \
Вопросы (как, что, почему, можно ли, какой мод лучше, что ты умеешь) — это chat, даже если в них есть тема. \
На «какие моды для …» отвечай как chat: назови 3–6 реально существующих модов и предложи собрать сборку.",
    );
    if !pack_name.is_empty() {
        system.push_str(&format!(
            "\n\nУ игрока уже есть сборка «{pack_name}» ({pack_loader} {pack_version}), в ней {count} модов: {list}. \
Если сообщение просит ИЗМЕНИТЬ эту сборку (добавь, убери, замени, сделай легче или тяжелее, без магии и т. п.) — \
верни {{\"kind\":\"edit\",\"add\":[\"названия реальных модов Modrinth для добавления\"],\"remove\":[\"точные названия из списка, которые убрать\"]}}. \
В remove бери только названия из списка выше; в add — до 8 существующих модов. \
Если просит совсем другую сборку — {{\"kind\":\"pack\"}}.",
            count = pack_titles.len(),
            list = pack_titles.iter().take(60).cloned().collect::<Vec<_>>().join(", ")
        ));
    }

    let mut messages: Vec<Value> = vec![json!({ "role": "system", "content": system })];
    let history = history.unwrap_or_default();
    let start = history.len().saturating_sub(6);
    for item in &history[start..] {
        let role = item["role"].as_str().unwrap_or("user");
        let content = item["content"].as_str().unwrap_or("").trim();
        if content.is_empty() || (role != "user" && role != "assistant") {
            continue;
        }
        let short: String = content.chars().take(600).collect();
        messages.push(json!({ "role": role, "content": short }));
    }
    messages.push(json!({ "role": "user", "content": text }));

    let content = cloudflare_raw(Value::Array(messages), Some(1024)).await?;
    // Модель может проигнорировать формат — тогда это просто текстовый ответ.
    match parse_json_reply(&content) {
        Ok(reply) if reply["kind"].as_str() == Some("edit") && !pack_name.is_empty() => {
            let collect = |value: &Value| -> Vec<String> {
                value
                    .as_array()
                    .map(|list| {
                        list.iter()
                            .filter_map(|item| item.as_str())
                            .map(|name| name.trim().to_string())
                            .filter(|name| !name.is_empty())
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let add_names = collect(&reply["add"]);
            let remove_names = collect(&reply["remove"]);

            // Новые моды превращаем в реальные проекты Modrinth, иначе
            // кнопка «Применить» не знала бы, что скачивать.
            let items: Vec<(String, String)> = add_names
                .iter()
                .take(8)
                .map(|query| (query.clone(), "добавление в сборку".to_string()))
                .collect();
            let results = if items.is_empty() {
                Vec::new()
            } else {
                resolve_batch(items, pack_loader.clone(), pack_version.clone()).await
            };
            let mut add: Vec<Value> = Vec::new();
            let mut unresolved: Vec<String> = Vec::new();
            for result in results {
                match result {
                    Ok(mod_card) => add.push(mod_card),
                    Err(query) => unresolved.push(query),
                }
            }

            Ok(json!({
                "kind": "edit",
                "name": pack_name,
                "add": add,
                "remove": remove_names,
                "unresolved": unresolved,
            }))
        }
        Ok(reply) if reply["kind"].as_str() == Some("pack") => Ok(json!({ "kind": "pack" })),
        Ok(reply) => {
            let answer = reply["answer"].as_str().unwrap_or("").trim().to_string();
            Ok(json!({
                "kind": "chat",
                "answer": if answer.is_empty() { content } else { answer }
            }))
        }
        Err(_) => Ok(json!({ "kind": "chat", "answer": content })),
    }
}

/// Короткий отзыв модели о готовой сборке — его игрок видит после установки.
#[tauri::command]
pub async fn ai_pack_comment(pack: Value) -> Result<Value, String> {
    let name = pack["name"].as_str().unwrap_or("сборка");
    let loader = pack["loader"].as_str().unwrap_or("");
    let version = pack["version"].as_str().unwrap_or("");
    let titles: Vec<String> = pack["mods"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|mod_item| mod_item["title"].as_str())
                .map(|title| title.to_string())
                .collect()
        })
        .unwrap_or_default();
    if titles.is_empty() {
        return Err("В сборке нет модов".into());
    }

    let system = "Ты — помощник лаунчера Minecraft. Напиши короткий отзыв о собранной сборке модов: \
3–4 предложения по-русски, без markdown, до 600 символов, по делу — что это за сборка, на чём она держится, \
кому подойдёт, на что обратить внимание. Не перечисляй все моды подряд.";
    let user = format!(
        "Сборка «{name}», {loader} {version}, {count} модов: {list}",
        count = titles.len(),
        list = titles.iter().take(70).cloned().collect::<Vec<_>>().join(", ")
    );
    let content = cloudflare_raw(
        json!([
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]),
        Some(512),
    )
    .await?;

    Ok(json!({ "comment": content.trim() }))
}

/// «оптимизация», «сборка на магию», «собери техно» — это заказы сборки,
/// а «как поставить шейдеры?» — вопрос. Вопросы не перехватываем.
fn looks_like_pack_request(text: &str) -> bool {
    const THEMES: [&str; 20] = [
        "оптимизация",
        "оптимизацию",
        "производительность",
        "техно",
        "техномагия",
        "магия",
        "магию",
        "rpg",
        "рпг",
        "выживание",
        "приключение",
        "декор",
        "строительство",
        "фермерство",
        "мобы",
        "квесты",
        "индустрия",
        "техника",
        "технику",
        "сборка",
    ];
    let low = text.to_lowercase();
    let words: Vec<&str> = low.split_whitespace().collect();

    // Короткая тема без вопроса: «оптимизация», «сборка на магию».
    if words.len() <= 3 && !low.contains('?') {
        let joined = words.join(" ");
        let mut stripped = joined.as_str();
        for prefix in ["сборка ", "сборку ", "сборке ", "на ", "для ", "по "] {
            stripped = stripped.trim_start_matches(prefix);
        }
        if THEMES
            .iter()
            .any(|theme| stripped == *theme || stripped.starts_with(&format!("{theme} ")))
        {
            return true;
        }
    }

    // Явная просьба собрать (императив), но не вопрос о сборке.
    let explicit = [
        "собери",
        "соберите",
        "подбери моды",
        "сделай сборку",
        "создай сборку",
        "собери сборку",
    ];
    explicit.iter().any(|prefix| low.starts_with(prefix))
}

/// Лог краша для модели: шапка (описание и первый стек) важнее хвоста, но и
/// последние строки нужны. Режем по символам — в UTF-8 байты рвут слова.
fn trim_crash_log(log: &str, limit: usize) -> String {
    if log.chars().count() <= limit {
        return log.to_string();
    }
    let head: String = log.chars().take(limit * 3 / 5).collect();
    let tail_rev: String = log.chars().rev().take(limit * 2 / 5).collect();
    let tail: String = tail_rev.chars().rev().collect();
    format!("{head}\n... [середина лога вырезана] ...\n{tail}")
}

/// Ключ сравнения названий: «Sodium 0.5.8.jar» → «sodium 0 5 8».
fn name_key(name: &str) -> String {
    let base = name
        .trim()
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar");
    base.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Мод из списка сборки, на который указывает модель. Сначала точное
/// совпадение имени/файла, затем вхождение в обе стороны.
fn find_installed(files: &[(String, String)], hint: &str) -> Option<(String, String)> {
    let key = name_key(hint);
    if key.is_empty() {
        return None;
    }
    if let Some((file, title)) = files
        .iter()
        .find(|(file, title)| name_key(file) == key || name_key(title) == key)
    {
        return Some((file.clone(), title.clone()));
    }
    files
        .iter()
        .find(|(file, title)| {
            let f = name_key(file);
            let t = name_key(title);
            let file_hits = !f.is_empty() && (f.contains(&key) || key.contains(&f));
            file_hits || (!t.is_empty() && t.contains(&key))
        })
        .map(|(file, title)| (file.clone(), title.clone()))
}

/// Куски в кавычках: `Mod 'a' requires mod 'b'` → ["a", "b"].
fn quoted_tokens(line: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find('\'') {
        let after = &rest[start + 1..];
        match after.find('\'') {
            Some(end) => {
                out.push(after[..end].to_string());
                rest = &after[end + 1..];
            }
            None => break,
        }
    }
    out
}

fn push_unique(list: &mut Vec<String>, name: String) {
    let key = name_key(&name);
    if key.is_empty() || key == "minecraft" || key == "java" {
        return;
    }
    if !list.iter().any(|existing| name_key(existing) == key) {
        list.push(name);
    }
}

/// Названия недостающих модов прямо из текста краша — это надёжнее модели.
/// Fabric: «Mod ID: 'fabric-api', Requested by: ...» под заголовком
/// «Missing or unsupported mandatory dependencies»;
/// Fabric/Quilt: «... requires any version of mod 'x', which is missing!»;
/// Forge: «Mod file ... requires modid y, which is missing».
fn missing_from_log(log: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_old_section = false;
    let mut in_solution = false;
    for line in log.lines().take(400) {
        let low = line.to_lowercase();

        // Fabric: готовый список «- Install fabric-api, any version.»
        if low.contains("potential solution") {
            in_solution = true;
            continue;
        }
        if in_solution {
            let text = line.trim();
            if text.is_empty() {
                in_solution = false;
            } else if let Some(pos) = text.to_lowercase().find("install ") {
                let after = &text[pos + "install ".len()..];
                let name = after.split(',').next().unwrap_or("").trim().trim_matches('\'');
                if !name.is_empty() {
                    push_unique(&mut out, name.to_string());
                }
            }
            continue;
        }

        // Старый блок Fabric/Quilt: «Mod ID: 'fabric-api', Requested by: ...»
        if low.contains("missing or unsupported mandatory dependencies") {
            in_old_section = true;
            continue;
        }
        if in_old_section {
            if let Some(pos) = low.find("mod id:") {
                if let Some(name) = quoted_tokens(&line[pos..]).into_iter().next() {
                    push_unique(&mut out, name);
                }
            }
            if line.trim().is_empty() {
                in_old_section = false;
            }
            continue;
        }

        if low.contains("which is missing") {
            let before = &line[..low.find("which is missing").unwrap_or(0)];
            let before = before.trim_end_matches(|c: char| c == ',' || c == '!' || c.is_whitespace());
            if before.ends_with('\'') {
                // «... of mod 'fabric-api', which is missing!»
                if let Some(open) = before[..before.len() - 1].rfind('\'') {
                    let name = &before[open + 1..before.len() - 1];
                    push_unique(&mut out, name.to_string());
                }
            } else if let Some(of_pos) = before.rfind(" of ") {
                // Fabric 0.19+: «... or later of geckolib, which is missing!»
                let name = before[of_pos + 4..].trim();
                if !name.is_empty() && !name.contains(' ') && name.len() < 64 {
                    push_unique(&mut out, name.to_string());
                }
            }
        } else if let Some(pos) = low.find("requires modid ") {
            let tail = line[pos + "requires modid ".len()..].trim();
            let name = tail
                .split(|c: char| c == ',' || c.is_whitespace())
                .next()
                .unwrap_or("");
            if !name.is_empty() {
                push_unique(&mut out, name.to_string());
            }
        }
    }
    out.truncate(3);
    out
}

/// Моды сборки для подсказки модели: файл и человеческое название.
fn installed_mod_files(instance_id: &str) -> Vec<(String, String)> {
    get_installed_mods(instance_id.to_string())
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["type"].as_str().unwrap_or("mod") == "mod")
                .filter_map(|item| {
                    let file = item["id"].as_str()?.to_string();
                    let title = item["title"].as_str().unwrap_or(&file).to_string();
                    Some((file, title))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Разбор краша: модель получает лог и список модов сборки и называет
/// виноватого. Кнопки «удалить/отключить/установить» на экране краша делает
/// фронтенд — сюда он приходит за вердиктом и `project_id` для зависимости.
#[tauri::command]
pub async fn ai_diagnose_crash(
    crash_log: String,
    instance_id: Option<String>,
    game_version: String,
    loader: String,
) -> Result<Value, String> {
    if crash_log.trim().is_empty() {
        return Err("Лог краша пуст — разбирать нечего".into());
    }

    let files: Vec<(String, String)> = instance_id
        .as_deref()
        .map(installed_mod_files)
        .unwrap_or_default();

    let mut mod_lines = String::new();
    for (file, title) in &files {
        mod_lines.push_str(&format!("- {title} ({file})\n"));
    }
    if mod_lines.is_empty() {
        mod_lines.push_str("- (модов нет)\n");
    }

    let system = "Ты диагностируешь краш Minecraft Java Edition. \
Ответь строго одним JSON-объектом без markdown и пояснений: \
{\"mod\":\"имя или файл виноватого мода из списка (точно как в списке) или пустая строка\",\
\"reason\":\"почему виноват, по-русски, 1–2 предложения\",\
\"action\":\"remove|disable|install|other\",\
\"deps\":[\"названия модов/библиотек, которых не хватает в сборке, — даже если action не install (пустой массив, если недостающих нет)\"],\
\"explain\":\"короткий совет игроку по-русски, до 200 символов\"}. \
Правила: action=remove — мод сам ломает игру (несовместимость, баг); \
action=disable — конфликт двух модов, достаточно выключить виноватого; \
action=install — не хватает зависимости или библиотеки; \
action=other — виноват не мод (Java, память, кривой мир, драйверы). \
Не выдумывай модов вне списка: если виноватого в списке нет — action=other. \
Если виноватых несколько — назови главного.";

    let user = format!(
        "Версия игры: {}. Загрузчик: {}.\nМоды сборки:\n{}\nЛог краша (может быть обрезан):\n{}",
        if game_version.trim().is_empty() { "неизвестно" } else { game_version.as_str() },
        if loader.trim().is_empty() { "неизвестен" } else { loader.as_str() },
        mod_lines,
        trim_crash_log(&crash_log, 9000)
    );

    let answer = ask_model(system, &user).await?;

    let hint = answer["mod"].as_str().unwrap_or("").trim().to_string();
    let reason = answer["reason"].as_str().unwrap_or("").trim().to_string();
    let explain = answer["explain"].as_str().unwrap_or("").trim().to_string();
    let mut action = answer["action"]
        .as_str()
        .unwrap_or("other")
        .to_lowercase();

    let matched = find_installed(&files, &hint);
    // Модель назвала мод, которого в сборке нет: кнопка удаления сломала бы
    // доверие, поэтому это просто совет.
    if matched.is_none() && (action == "remove" || action == "disable") {
        action = "other".to_string();
    }

    // Зависимости собираем из двух источников: ответ модели и текст самого
    // лога. Лог надёжнее — Fabric/Forge пишут недостающий мод явно, даже если
    // модель выбрала action=remove и назвала только виновника.
    let mut deps: Vec<String> = Vec::new();
    if let Some(list) = answer["deps"].as_array() {
        for item in list {
            if let Some(name) = item.as_str() {
                push_unique(&mut deps, name.trim().to_string());
            }
        }
    }
    for name in missing_from_log(&crash_log) {
        if deps.len() >= 3 {
            break;
        }
        push_unique(&mut deps, name);
    }
    deps.truncate(3);

    // Каждую зависимость превращаем в карточку Modrinth: кнопке «Установить»
    // нужен project_id и иконка. Не нашлась — фронт дотянет её поиском.
    let mut missing: Vec<Value> = Vec::new();
    for name in &deps {
        let mut card = resolve_one(
            name.clone(),
            "зависимость из краша".to_string(),
            loader.clone(),
            game_version.clone(),
        )
        .await
        .unwrap_or_else(|_| json!({}));
        if let Some(obj) = card.as_object_mut() {
            obj.insert("query".to_string(), json!(name));
            if !obj.contains_key("title") {
                obj.insert("title".to_string(), json!(name));
            }
        }
        missing.push(card);
    }
    if action == "other" && !missing.is_empty() {
        action = "install".to_string();
    }

    let (file, title) = match matched {
        Some((file, title)) => (json!(file), json!(title)),
        None => (Value::Null, Value::Null),
    };

    Ok(json!({
        "action": action,
        "file": file,
        "title": title,
        "reason": reason,
        "explain": explain,
        "missing": missing,
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
