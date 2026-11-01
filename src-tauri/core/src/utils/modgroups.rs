//! Группы модов для предпросмотра сборки.
//!
//! Modrinth отдаёт у каждого проекта список категорий, но они идут вперемешку
//! (`adventure`, `decoration`, `library`). Для человека полезнее порядок:
//! сначала то, что не добавляет контент (оптимизация, библиотеки), потом мир,
//! постройки, мобы, магия, техника, приключения и утилиты.

/// Идентификаторы групп в том порядке, в котором их показываем.
pub const ORDER: [&str; 10] = [
    "optimization",
    "library",
    "world",
    "building",
    "mobs",
    "magic",
    "tech",
    "adventure",
    "utility",
    "other",
];

fn has(categories: &[String], name: &str) -> bool {
    categories.iter().any(|c| c.eq_ignore_ascii_case(name))
}

/// Определяет группу по категориям Modrinth; если категорий нет — по названию.
pub fn group_of(categories: &[String], title: &str) -> &'static str {
    if has(categories, "optimization") {
        return "optimization";
    }
    if has(categories, "library") {
        return "library";
    }
    if has(categories, "worldgen") || has(categories, "biomes") || has(categories, "dimensions") {
        return "world";
    }
    if has(categories, "decoration") || has(categories, "building") {
        return "building";
    }
    if has(categories, "mobs") || has(categories, "mobs-and-entities") {
        return "mobs";
    }
    if has(categories, "magic") {
        return "magic";
    }
    if has(categories, "technology") || has(categories, "automation") || has(categories, "energy") {
        return "tech";
    }
    if has(categories, "adventure") || has(categories, "equipment") || has(categories, "combat") {
        return "adventure";
    }
    if has(categories, "utility")
        || has(categories, "management")
        || has(categories, "transportation")
    {
        return "utility";
    }

    // У сборок и старых проектов категорий может не быть: спасает название.
    let t = title.to_lowercase();
    if t.contains("api") || t.contains("library") || t.contains("config") {
        return "library";
    }
    if t.contains("optimiz") || t.contains("fps") || t.contains("performance") {
        return "optimization";
    }
    "other"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cats(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn optimization_and_library_come_first() {
        // У Sodium бывает и optimization, и utility: приоритет у оптимизации.
        assert_eq!(
            group_of(&cats(&["optimization", "utility"]), "Sodium"),
            "optimization"
        );
        assert_eq!(
            group_of(&cats(&["library", "adventure"]), "Architectury API"),
            "library"
        );
    }

    #[test]
    fn content_categories_map_to_groups() {
        assert_eq!(group_of(&cats(&["worldgen"]), "Terralith"), "world");
        assert_eq!(
            group_of(&cats(&["decoration"]), "Macaw's Bridges"),
            "building"
        );
        assert_eq!(group_of(&cats(&["mobs"]), "Alex's Mobs"), "mobs");
        assert_eq!(group_of(&cats(&["magic"]), "Ars Nouveau"), "magic");
        assert_eq!(group_of(&cats(&["technology"]), "Create"), "tech");
        assert_eq!(
            group_of(&cats(&["adventure"]), "YUNG's Better Mineshafts"),
            "adventure"
        );
    }

    #[test]
    fn empty_categories_fall_back_to_title() {
        assert_eq!(group_of(&[], "Cloth Config API"), "library");
        assert_eq!(group_of(&[], "Embeddium"), "other");
    }

    #[test]
    fn every_group_is_in_order_list() {
        assert_eq!(ORDER.len(), 10);
        assert_eq!(ORDER[0], "optimization");
        assert_eq!(ORDER[9], "other");
    }
}
