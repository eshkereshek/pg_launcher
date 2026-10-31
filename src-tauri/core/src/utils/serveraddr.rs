//! Поиск адреса Minecraft-сервера в свободном тексте.
//!
//! В API Modrinth у сервера нет поля с адресом: серверы пишут `IP: play.x.net`
//! в описании или в теле проекта. Модуль вытаскивает адрес оттуда, чтобы
//! карточка каталога могла предложить кнопку «IP» вместо ссылки на сайт.
//!
//! Живёт в `pagrysha-core`, потому что тестовый бинарник лаунчера с Tauri на
//! Windows не запускается (нет манифеста comctl32), и тесты там отключены.

use regex::Regex;
use std::sync::OnceLock;

/// Домены, которые встречаются в описаниях, но адресом сервера не являются.
const NOT_A_SERVER: [&str; 26] = [
    "modrinth.com",
    "modrinth.gg",
    "curseforge.com",
    "planetminecraft.com",
    "minecraft-mp.com",
    "minecraft.net",
    "mojang.com",
    "spigotmc.org",
    "discord.com",
    "discord.gg",
    "youtube.com",
    "youtube-nocookie.com",
    "youtu.be",
    "twitch.tv",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "github.com",
    "gitlab.com",
    "patreon.com",
    "ko-fi.com",
    "buymeacoffee.com",
    "reddit.com",
    "t.me",
    "namemc.com",
    "imgur.com",
];

/// Первая часть домена, которая почти никогда не бывает игровым адресом:
/// магазины, файлохранилища, панели, зеркала и встраиваемые плееры.
const SERVICE_PREFIXES: [&str; 28] = [
    "www", "store", "shop", "files", "file", "cdn", "static", "img", "images", "assets", "wiki",
    "map", "maps", "stats", "status", "api", "docs", "blog", "news", "forum", "forums", "support",
    "help", "panel", "billing", "account", "mail", "download",
];

/// Домен или `домен:порт`.
///
/// Список TLD ограничен намеренно: без него под шаблон попадали бы версии
/// (`1.21.1`), имена файлов (`mods.toml`) и прочий текст из описаний.
fn host_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(concat!(
            r"(?i)\b(?:[a-z0-9][a-z0-9-]{0,62}\.)+",
            r"(?:net|com|org|io|gg|me|ru|su|xyz|mc|dev|fr|de|es|eu|us|co|tv|top|club|site|",
            r"online|pro|world|fun|games|cc|to|info|link|network|host|space|tech|app|shop|",
            r"store|live|one|uk|pl|cz|by|kz|ua|nl|se|fi|no|it|pt|br|ca|au|jp|kr|cn|in|tr|",
            r"lt|lv|ee|ro|bg|hu|gr|ch|at|be|dk|cloud|game|zone|page)\b(?::\d{2,5})?"
        ))
        .expect("корректное выражение для хоста")
    })
}

fn is_blocked_host(host: &str) -> bool {
    if NOT_A_SERVER
        .iter()
        .any(|blocked| host == *blocked || host.ends_with(&format!(".{}", blocked)))
    {
        return true;
    }
    // `store.play.net` — магазин, а не адрес входа.
    match host.split('.').next() {
        Some(prefix) => SERVICE_PREFIXES.contains(&prefix),
        None => true,
    }
}

/// Адрес сервера из свободного текста.
///
/// Сначала ищем совпадение рядом со словом «ip/address/адрес» — так отсекаются
/// ссылки на соцсети в том же описании. Если подсказки нет, берём первое
/// подходящее доменное имя.
pub fn extract_address(text: &str) -> Option<String> {
    let mut best: Option<(i32, usize, String)> = None;

    for found in host_re().find_iter(text) {
        let raw = found
            .as_str()
            .trim_end_matches(['.', ',', ')', ']', ';', '!']);
        let host = raw.split(':').next().unwrap_or(raw).to_lowercase();
        if is_blocked_host(&host) {
            continue;
        }
        // Почта и упоминания вида `@nick.name` адресом не считаются.
        if text[..found.start()].ends_with('@') {
            continue;
        }

        // Контекст перед совпадением: слово-подсказка весит больше.
        let context: String = text[..found.start()]
            .chars()
            .rev()
            .take(40)
            .collect::<String>()
            .to_lowercase();
        let score = if context.contains("ip")
            || context.contains("адрес")
            || context.contains("address")
            || context.contains("айпи")
        {
            10
        } else {
            0
        };

        let better = match &best {
            None => true,
            Some((best_score, best_pos, _)) => {
                score > *best_score || (score == *best_score && found.start() < *best_pos)
            }
        };
        if better {
            best = Some((score, found.start(), raw.to_string()));
        }
    }

    best.map(|(_, _, address)| address)
}

#[cfg(test)]
mod tests {
    use super::extract_address;

    #[test]
    fn finds_address_after_label() {
        assert_eq!(
            extract_address("Java 1.21.1, IP modrinth.mc-complex.com. All 18 gyms").as_deref(),
            Some("modrinth.mc-complex.com")
        );
        assert_eq!(
            extract_address("Адрес сервера: play.example.net:25566").as_deref(),
            Some("play.example.net:25566")
        );
    }

    #[test]
    fn skips_links_and_emails() {
        assert_eq!(extract_address("Сборка на modrinth.com/modpack/xyz"), None);
        assert_eq!(extract_address("Пишите на support@example.net"), None);
        assert_eq!(
            extract_address("Discord: discord.gg/abc, играть: my.server.gg").as_deref(),
            Some("my.server.gg")
        );
    }

    #[test]
    fn ignores_versions_and_files() {
        assert_eq!(extract_address("Сборка для 1.20.1 и 1.21.1"), None);
        assert_eq!(extract_address("Файлы mods.toml и fabric.mod.json"), None);
    }

    #[test]
    fn skips_service_subdomains() {
        // В телах проектов часто попадаются встраиваемые видео и магазины.
        assert_eq!(
            extract_address("https://www.youtube-nocookie.com/embed/abc"),
            None
        );
        assert_eq!(extract_address("Поддержка: store.example.gg"), None);
        assert_eq!(extract_address("Файлы на files.example.gg"), None);
        // Игровые поддомены при этом остаются адресами.
        assert_eq!(
            extract_address("play.example.gg и mc.example.gg").as_deref(),
            Some("play.example.gg")
        );
    }
}
