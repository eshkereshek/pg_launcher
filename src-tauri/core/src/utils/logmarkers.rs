//! Признаки в логе игры, по которым лаунчер понимает, что окно уже создано.
//!
//! Процесс Java стартует за доли секунды, а окно у сборок с модами появляется
//! через 5–20 с: всё это время игра молча загружает классы и моды. Лаунчер
//! раньше считал запуск завершённым сразу после `spawn`, и ожидание выглядело
//! как «нажал — ничего не происходит». Поэтому «запущено» подтверждает сама
//! игра — строками, которые печатает уже после создания окна.
//!
//! Модуль не зависит от Tauri: так его тесты запускаются обычным
//! `cargo test -p pagrysha-core`.

/// Строки, которые игра пишет, когда окно уже есть.
///
/// `Setting user` и `Backend library` есть у ванильного клиента и у всех
/// загрузчиков (Forge, NeoForge, Fabric, Quilt). Звук поднимается позже всех
/// и годится последним рубежом.
///
/// Ранний сплэш Forge (`EARLYDISPLAY`) сюда намеренно не входит: это
/// картинка-заставка, а не окно игры, и запуск на ней не заканчивается.
const WINDOW_READY_MARKERS: [&str; 4] = [
    "Setting user:",
    "Backend library: LWJGL",
    "OpenAL initialized",
    "Sound engine started",
];

/// Похожа ли строка лога на «окно игры создано».
pub fn is_window_ready(line: &str) -> bool {
    WINDOW_READY_MARKERS
        .iter()
        .any(|marker| line.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::is_window_ready;

    #[test]
    fn recognises_window_lines() {
        // Реальные строки из логов: Forge 1.20.1 и Fabric-сборка.
        assert!(is_window_ready(
            "[30окт.2026 14:04:52.813] [Render thread/INFO] [net.minecraft.client.Minecraft/]: Setting user: Eshkereshek"
        ));
        assert!(is_window_ready(
            "[15:29:16] [Render thread/INFO]: Backend library: LWJGL version 3.3.1 SNAPSHOT"
        ));
        assert!(is_window_ready(
            "[15:28:40] [Render thread/INFO]: Sound engine started"
        ));
    }

    #[test]
    fn ignores_loader_noise() {
        // Сплэш Forge и строки загрузчика — ещё не окно игры.
        assert!(!is_window_ready(
            "[14:04:43.199] [EARLYDISPLAY/]: Trying GL version 4.6"
        ));
        assert!(!is_window_ready(
            "[15:28:55] [main/INFO]: Loading Minecraft 1.20.1 with Fabric Loader 0.20.1"
        ));
    }
}
