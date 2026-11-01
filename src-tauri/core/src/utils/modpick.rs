//! Подбор проекта под запрос модели.
//!
//! Модель называет моды по памяти: часть названий неточные (`Ice and Fire:
//! Dragons` вместо `Ice and Fire`), часть относится к другому загрузчику.
//! Поэтому запрос пробуется в нескольких вариантах, а из выдачи берётся проект
//! с наибольшим совпадением слов и, при равенстве, самый скачиваемый.

use serde_json::Value;

use crate::utils::matchmod::{query_variants, score_query, MIN_SCORE};

/// Больше десяти хитов смотреть смысла нет: релевантность уже отсортирована.
const SCAN_LIMIT: usize = 10;

/// Ниже этого числа скачиваний проект почти всегда чужой форк или аддон.
const POPULAR_DOWNLOADS: u64 = 1000;

fn downloads(hit: &Value) -> u64 {
    hit["downloads"].as_u64().unwrap_or(0)
}

/// Лучший проект из выдачи по запросу: сначала точность названия, потом
/// популярность. Проекты без единого общего слова отбрасываются.
pub fn pick_hit(hits: &Value, query: &str) -> Option<Value> {
    let list = hits["hits"].as_array()?;

    let mut best: Option<(i32, u64, &Value)> = None;
    let mut best_popular: Option<(i32, u64, &Value)> = None;

    for hit in list.iter().take(SCAN_LIMIT) {
        let score = score_query(
            query,
            hit["title"].as_str().unwrap_or(""),
            hit["slug"].as_str().unwrap_or(""),
        );
        if score < MIN_SCORE {
            continue;
        }
        // f32 не годится для сравнения кортежей, переводим в целые проценты.
        let key = (score * 100.0).round() as i32;
        let dl = downloads(hit);

        if best.map(|(s, d, _)| (key, dl) > (s, d)).unwrap_or(true) {
            best = Some((key, dl, hit));
        }
        if dl >= POPULAR_DOWNLOADS
            && best_popular
                .map(|(s, d, _)| (key, dl) > (s, d))
                .unwrap_or(true)
        {
            best_popular = Some((key, dl, hit));
        }
    }

    // Популярный вариант предпочтительнее: так отсекаются аддоны с похожим
    // названием и парой сотен скачиваний.
    best_popular.or(best).map(|(_, _, hit)| hit.clone())
}

/// Варианты запроса для повторного поиска, если первый ничего не дал.
pub fn variants(query: &str) -> Vec<String> {
    query_variants(query)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn hit(title: &str, slug: &str, downloads: u64) -> Value {
        json!({
            "project_id": format!("id-{slug}"),
            "title": title,
            "slug": slug,
            "downloads": downloads,
        })
    }

    #[test]
    fn prefers_matching_title_over_first_hit() {
        let hits = json!({ "hits": [
            hit("Extra Terrestrial", "extra-terrestrial", 900000),
            hit("Terrestria", "terrestria", 4000),
        ]});

        let picked = pick_hit(&hits, "Terrestria").expect("должен найтись");
        assert_eq!(picked["slug"], "terrestria");
    }

    #[test]
    fn popular_mod_wins_over_addon() {
        let hits = json!({ "hits": [
            hit("MrCrayfish's Furniture Mod Tools", "furniture-tools", 50000),
            hit("MrCrayfish's Furniture Mod", "furniture", 7000000),
        ]});

        let picked = pick_hit(&hits, "furniture").expect("должен найтись");
        assert_eq!(picked["slug"], "furniture");
    }

    #[test]
    fn nothing_matching_returns_none() {
        let hits = json!({ "hits": [hit("Dungeons and Taverns", "dungeons", 100000)] });
        assert!(pick_hit(&hits, "Lazy Dungeon Builder").is_none());
    }

    #[test]
    fn partial_query_still_finds_mod() {
        let hits = json!({ "hits": [hit("Ice and Fire", "ice-and-fire", 3000000)] });
        assert!(pick_hit(&hits, "Ice and Fire: Dragons").is_some());
    }
}
