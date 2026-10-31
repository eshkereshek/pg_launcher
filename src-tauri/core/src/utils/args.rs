//! Подстановка переменных в аргументы запуска игры.

use std::collections::HashMap;

/// Заменить `${name}` на значение. Незнакомые подстановки остаются текстом —
/// так же ведёт себя официальный лаунчер, а ругаться на них смысла нет:
/// манифесты разных версий используют разный набор переменных.
pub fn substitute(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut res = arg.to_string();
    for (k, v) in vars {
        res = res.replace(&format!("${{{}}}", k), v);
    }
    res
}

/// Разобрать legacy-строку `minecraftArguments` (1.12.2 и старше).
///
/// Сначала делим по пробелам и только потом подставляем значения. Наоборот
/// нельзя: `${game_directory}` с пробелами в пути (`C:\Users\Иван Петров\...`)
/// после подстановки развалился бы на несколько аргументов, и игра не нашла бы
/// ни папку, ни профиль.
pub fn split_legacy(template: &str, vars: &HashMap<&str, String>) -> Vec<String> {
    template
        .split_whitespace()
        .map(|part| substitute(part, vars))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars() -> HashMap<&'static str, String> {
        let mut vars = HashMap::new();
        vars.insert("auth_player_name", "Иван".to_string());
        vars.insert(
            "game_directory",
            r"C:\Users\Иван Петров\.minecraft".to_string(),
        );
        vars
    }

    #[test]
    fn legacy_args_keep_paths_with_spaces_whole() {
        let args = split_legacy(
            "--username ${auth_player_name} --gameDir ${game_directory} --version 1.12.2",
            &vars(),
        );
        assert_eq!(
            args,
            vec![
                "--username",
                "Иван",
                "--gameDir",
                r"C:\Users\Иван Петров\.minecraft",
                "--version",
                "1.12.2",
            ]
        );
    }

    #[test]
    fn unknown_variables_stay_as_text() {
        let empty = HashMap::new();
        assert_eq!(substitute("--x ${unknown}", &empty), "--x ${unknown}");
    }

    #[test]
    fn json_args_are_substituted_one_by_one() {
        // Аргумент из JSON — уже готовый элемент массива, дробить его нельзя.
        let mut map = HashMap::new();
        map.insert("assets_root", r"D:\Игры\Minecraft\assets".to_string());
        assert_eq!(
            substitute("${assets_root}", &map),
            r"D:\Игры\Minecraft\assets"
        );
    }
}
