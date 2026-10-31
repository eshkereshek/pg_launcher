//! Фасеты поиска Modrinth.
//!
//! Каждый фасет — отдельная группа в одном массиве: группы объединяются по
//! «И», значения внутри группы — по «ИЛИ». Формат отдаётся строкой, чтобы
//! команда просто склеила его в URL.
//!
//! Загрузчик (`categories:forge`) есть только у модов и сборок. У шейдеров и
//! ресурспаков Modrinth хранит в этом поле другое (`iris`, `optifine`,
//! `minecraft`), поэтому фасет загрузчика отсекал все результаты: каталог
//! шейдеров и ресурспаков открывался пустым.

/// Процентное кодирование значения фасета.
///
/// Пробел кодируется как `%20`, а не `+`: фасет — это JSON внутри параметра,
/// и лишняя трактовка плюса как пробела там только мешает.
fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// Группы фасетов для поиска. Пустая строка и `all` значат «любой».
///
/// `project_type` — `mod`, `modpack`, `resourcepack`, `shader` или `all`.
pub fn modrinth_facets(
    project_type: &str,
    loader: &str,
    version: &str,
    category: &str,
) -> Vec<String> {
    let mut facets = Vec::new();

    if !project_type.is_empty() && project_type != "all" {
        facets.push(format!("[\"project_type:{}\"]", encode(project_type)));
    }

    // Загрузчик относится только к тому, что от него зависит.
    let loader_matters = matches!(project_type, "mod" | "modpack" | "all");
    if loader_matters && !loader.is_empty() && loader != "all" {
        facets.push(format!("[\"categories:{}\"]", encode(loader)));
    }

    if !version.is_empty() && version != "all" {
        facets.push(format!("[\"versions:{}\"]", encode(version)));
    }

    if !category.is_empty() && category != "all" {
        facets.push(format!("[\"categories:{}\"]", encode(category)));
    }

    facets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shader_search_ignores_loader() {
        let facets = modrinth_facets("shader", "forge", "1.20.1", "all");
        assert_eq!(
            facets,
            vec!["[\"project_type:shader\"]", "[\"versions:1.20.1\"]"]
        );
    }

    #[test]
    fn resourcepack_search_ignores_loader() {
        let facets = modrinth_facets("resourcepack", "forge", "1.20.1", "");
        assert_eq!(
            facets,
            vec!["[\"project_type:resourcepack\"]", "[\"versions:1.20.1\"]"]
        );
    }

    #[test]
    fn mod_search_keeps_loader() {
        let facets = modrinth_facets("mod", "forge", "1.20.1", "all");
        assert_eq!(
            facets,
            vec![
                "[\"project_type:mod\"]",
                "[\"categories:forge\"]",
                "[\"versions:1.20.1\"]"
            ]
        );
    }

    #[test]
    fn modpack_category_is_added_and_encoded() {
        let facets = modrinth_facets("modpack", "all", "1.20.1", "adventure and rpg");
        assert_eq!(
            facets,
            vec![
                "[\"project_type:modpack\"]",
                "[\"versions:1.20.1\"]",
                "[\"categories:adventure%20and%20rpg\"]"
            ]
        );
    }

    #[test]
    fn all_types_keep_loader_and_skip_empty_version() {
        let facets = modrinth_facets("all", "fabric", "", "");
        assert_eq!(facets, vec!["[\"categories:fabric\"]"]);
    }
}
