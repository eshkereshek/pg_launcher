//! Проверка, что найденный проект соответствует запросу.
//!
//! Поиск Modrinth отдаёт «что-то похожее», а не точное совпадение: на запрос
//! `Terrestria` (мод только для Fabric) в facets для Forge прилетает
//! `Extra Terrestrial`. Ставить такое нельзя, поэтому сверяем значимые слова
//! запроса с названием и slug и всё несовпавшее помечаем как ненайденное.

/// Слова, которые не помогают опознать мод.
const STOPWORDS: &[&str] = &[
    "the", "and", "for", "with", "mod", "mods", "api", "addon", "addons", "edition", "version",
];

/// Порог, ниже которого проект считаем чужим: две трети слов запроса.
pub const MIN_SCORE: f32 = 0.66;

fn normalize(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect()
}

fn tokens(text: &str) -> Vec<String> {
    normalize(text)
        .split_whitespace()
        .filter(|w| w.len() >= 3 && !STOPWORDS.contains(w))
        .map(str::to_string)
        .collect()
}

fn singular(word: &str) -> &str {
    word.strip_suffix('s').unwrap_or(word)
}

/// Доля значимых слов запроса, найденных в названии или slug.
///
/// Строгое «все слова» отсекает лишнее, но и хорошие моды тоже: модель пишет
/// `Ice and Fire: Dragons`, а проект называется `Ice and Fire`. Поэтому считаем
/// долю совпадений, а порог задаёт вызывающий код.
pub fn score_query(query: &str, title: &str, slug: &str) -> f32 {
    let wanted = tokens(query);
    if wanted.is_empty() {
        return 1.0;
    }

    let haystack = tokens(&format!("{} {}", title, slug));
    let found = wanted
        .iter()
        .filter(|word| {
            haystack
                .iter()
                .any(|have| have == *word || singular(have) == singular(word))
        })
        .count();
    found as f32 / wanted.len() as f32
}

/// Совпадает ли проект с запросом: все значимые слова запроса должны быть
/// отдельными словами названия или slug. Сравнение по словам, а не по подстроке:
/// иначе `Terrestria` совпадает с `Terrestrial`. Пустой запрос считаем
/// совпадающим.
pub fn matches_query(query: &str, title: &str, slug: &str) -> bool {
    score_query(query, title, slug) >= 1.0
}

/// Варианты запроса на случай, если модель написала название с лишними словами.
///
/// Первый вариант — исходный. Дальше убираем хвосты в скобках и служебные слова
/// (`Mod`, `Port`, `Unofficial`): `Ice and Fire: Dragons (Forge)` ищется и как
/// `Ice and Fire: Dragons`, и как `Ice and Fire`.
pub fn query_variants(query: &str) -> Vec<String> {
    const NOISE: [&str; 8] = [
        "mod",
        "mods",
        "port",
        "unofficial",
        "continued",
        "fork",
        "edition",
        "compat",
    ];

    let mut variants = vec![query.trim().to_string()];

    let cut = query.find(['(', '[']).map(|i| &query[..i]).unwrap_or(query);
    let cut = cut.trim().trim_end_matches(':').trim();
    if !cut.is_empty() && cut != query.trim() {
        variants.push(cut.to_string());
    }

    let words: Vec<&str> = cut.split_whitespace().collect();
    let without_noise: Vec<&str> = words
        .iter()
        .copied()
        .filter(|w| !NOISE.contains(&w.to_lowercase().as_str()))
        .collect();
    if !without_noise.is_empty() && without_noise.len() != words.len() {
        variants.push(without_noise.join(" "));
    }

    // Короткий вариант из первых двух слов: «Better Combat Additions» → «Better Combat».
    if without_noise.len() > 2 {
        variants.push(without_noise[..2].join(" "));
    }

    let mut seen = std::collections::HashSet::new();
    variants.retain(|v| !v.is_empty() && seen.insert(v.to_lowercase()));
    variants.truncate(3);
    variants
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_title_matches() {
        assert!(matches_query("Create", "Create", "create"));
        assert!(matches_query(
            "Nature's Compass",
            "Nature's Compass",
            "natures-compass"
        ));
    }

    #[test]
    fn substring_in_longer_title_matches() {
        assert!(matches_query(
            "Blockus",
            "Block Plus (Blockus Reforged)",
            "blockus"
        ));
        assert!(matches_query(
            "Connected Textures",
            "Fusion (Connected Textures)",
            "fusion"
        ));
    }

    #[test]
    fn unrelated_project_is_rejected() {
        // Именно этот случай ломал сборку: Terrestria есть только под Fabric.
        assert!(!matches_query(
            "Terrestria",
            "Extra Terrestrial",
            "extra-terrestrial"
        ));
        assert!(!matches_query(
            "Lazy Dungeon Builder",
            "Dungeons and Taverns",
            "dungeons-and-taverns"
        ));
    }

    #[test]
    fn stopwords_do_not_block_match() {
        assert!(matches_query("Create mod", "Create", "create"));
    }

    #[test]
    fn partial_title_still_scores_high() {
        // Модель добавляет уточнение, которого нет в названии проекта.
        assert!(score_query("Ice and Fire: Dragons", "Ice and Fire", "ice-and-fire") >= MIN_SCORE);
        assert!(score_query("JourneyMap", "JourneyMap", "journeymap") >= 1.0);
    }

    #[test]
    fn unrelated_mod_scores_low() {
        assert!(score_query("Terrestria", "Extra Terrestrial", "extra-terrestrial") < MIN_SCORE);
        assert!(score_query("Lazy Dungeon Builder", "Dungeons and Taverns", "x") < MIN_SCORE);
    }

    #[test]
    fn variants_strip_noise_and_brackets() {
        let variants = query_variants("Ice and Fire: Dragons (Forge)");
        assert_eq!(variants[0], "Ice and Fire: Dragons (Forge)");
        assert_eq!(variants[1], "Ice and Fire: Dragons");
        assert!(query_variants("Create Mod Port").contains(&"Create".to_string()));
    }
}
