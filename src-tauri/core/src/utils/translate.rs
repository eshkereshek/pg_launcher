//! Разбор текста описаний для машинного перевода.
//!
//! Переводчик не понимает markdown: он переводит текст внутри ```блоков кода```,
//! теряет обратные кавычки и склеивает строки. Поэтому текст сначала режется на
//! сегменты «код» и «не код», а переводится только «не код». Код возвращается
//! дословно.
//!
//! Главный инвариант, который проверяют тесты: склейка всех кусков даёт исходный
//! текст без потерь и без дублей — иначе переводился бы текст с съеденными
//! переводами строк.

/// Кусок текста: переводить или оставить как есть.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub text: String,
    pub code: bool,
}

/// Что делать с куском после нарезки по абзацам.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    /// Отдаём переводчику.
    Translate(String),
    /// Выводим дословно (блоки кода).
    Literal(String),
}

fn fence_marker(line: &str) -> Option<&'static str> {
    let trimmed = line.trim_start();
    if trimmed.starts_with("```") {
        Some("```")
    } else if trimmed.starts_with("~~~") {
        Some("~~~")
    } else {
        None
    }
}

fn push_text(out: &mut Vec<Segment>, text: String, code: bool) {
    if !text.is_empty() {
        out.push(Segment { text, code });
    }
}

/// Делит текст на сегменты кода и обычного текста по fenced-блокам
/// (``` и ~~~). Незакрытый блок считается кодом до конца: переводить код хуже,
/// чем потерять форматирование в хвосте кривого описания.
pub fn split_code_segments(text: &str) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    let mut prose = String::new();
    let mut code = String::new();
    let mut open_fence: Option<&'static str> = None;

    for line in text.split_inclusive('\n') {
        let marker = fence_marker(line);

        match open_fence {
            None => {
                if let Some(m) = marker {
                    push_text(&mut out, std::mem::take(&mut prose), false);
                    open_fence = Some(m);
                    code.push_str(line);
                } else {
                    prose.push_str(line);
                }
            }
            Some(open) => {
                code.push_str(line);
                if marker == Some(open) {
                    open_fence = None;
                    push_text(&mut out, std::mem::take(&mut code), true);
                }
            }
        }
    }

    push_text(&mut out, code, true);
    push_text(&mut out, prose, false);
    out
}

/// Длинный кусок дорезаем по границам строк, а длинную строку — по символам.
/// Каждая часть держит свой перевод строки, поэтому `parts.join("")` обязан
/// давать исходный текст.
pub fn hard_split(block: &str, limit: usize) -> Vec<String> {
    if block.chars().count() <= limit {
        return vec![block.to_string()];
    }

    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();

    for line in block.split_inclusive('\n') {
        if line.chars().count() > limit {
            if !buf.is_empty() {
                out.push(std::mem::take(&mut buf));
            }
            let mut rest = line;
            while rest.chars().count() > limit {
                let cut = rest
                    .char_indices()
                    .nth(limit)
                    .map(|(i, _)| i)
                    .unwrap_or(rest.len());
                out.push(rest[..cut].to_string());
                rest = &rest[cut..];
            }
            buf.push_str(rest);
            continue;
        }

        if !buf.is_empty() && buf.chars().count() + line.chars().count() > limit {
            out.push(std::mem::take(&mut buf));
        }
        buf.push_str(line);
    }

    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

/// Куски по абзацам. Границы держим на пустых строках: переводчик получает
/// законченные блоки, и заголовки со списками не съезжают.
///
/// Пустая строка между абзацами прикрепляется к предыдущему куску — иначе после
/// перевода куски склеились бы в одну строку и разметка поехала.
pub fn split_chunks(text: &str, chunk_chars: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    let blocks: Vec<&str> = text.split("\n\n").collect();

    for (index, block) in blocks.iter().enumerate() {
        let mut pieces = hard_split(block, chunk_chars);
        if index + 1 < blocks.len() {
            if let Some(last) = pieces.last_mut() {
                last.push_str("\n\n");
            }
        }

        for piece in pieces {
            if !current.is_empty() && current.chars().count() + piece.chars().count() > chunk_chars
            {
                chunks.push(std::mem::take(&mut current));
            }
            current.push_str(&piece);
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

/// План перевода: то, что отдаём переводчику, и то, что возвращаем как есть, —
/// в исходном порядке.
pub fn plan_translation(text: &str, chunk_chars: usize) -> Vec<Piece> {
    let mut pieces: Vec<Piece> = Vec::new();
    for segment in split_code_segments(text) {
        if segment.code {
            pieces.push(Piece::Literal(segment.text));
            continue;
        }
        for chunk in split_chunks(&segment.text, chunk_chars) {
            pieces.push(Piece::Translate(chunk));
        }
    }
    pieces
}

fn is_cyrillic(ch: char) -> bool {
    matches!(ch as u32, 0x0400..=0x04ff)
}

/// Доля кириллицы среди букв — по ней решаем, переводить ли вообще.
pub fn cyrillic_share(text: &str) -> f32 {
    let mut letters = 0usize;
    let mut cyrillic = 0usize;
    for ch in text.chars() {
        if !ch.is_alphabetic() {
            continue;
        }
        letters += 1;
        if is_cyrillic(ch) {
            cyrillic += 1;
        }
    }
    if letters == 0 {
        0.0
    } else {
        cyrillic as f32 / letters as f32
    }
}

/// Разобрать ответ веб-переводчика Google.
///
/// Формы ответа разные и зависят только от эндпоинта:
///  * `{"sentences":[{"trans":…}]}` — `translate_a/single` с `dj=1`;
///  * `[[["перевод","оригинал",…],…],null,"en"]` — `translate_a/single` без `dj`;
///  * `[["перевод","en"]]` — `translate_a/t` (он же `dict-chrome-ex`).
///
/// Раньше разбирались только первые две, а третью (её отдаёт запасной хост)
/// склеивали вместе с кодом языка — в описание попадало лишнее «en».
pub fn parse_google_response(data: &serde_json::Value) -> Option<String> {
    if let Some(sentences) = data.get("sentences").and_then(|s| s.as_array()) {
        let mut out = String::new();
        for sentence in sentences {
            if let Some(part) = sentence.get("trans").and_then(|t| t.as_str()) {
                out.push_str(part);
            }
        }
        if !out.trim().is_empty() {
            return Some(out);
        }
    }

    let first = data.as_array()?.first()?.as_array()?;
    // `[["перевод","en"]]`: первый элемент — строка, второй — код языка.
    if let Some(text) = first.first().and_then(|value| value.as_str()) {
        return if text.trim().is_empty() {
            None
        } else {
            Some(text.to_string())
        };
    }

    // `[[["перевод","оригинал",…],…],…]`: у каждой пары берём первый элемент.
    let mut out = String::new();
    for pair in first {
        if let Some(text) = pair
            .as_array()
            .and_then(|p| p.first())
            .and_then(|v| v.as_str())
        {
            out.push_str(text);
        }
    }
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn join(pieces: &[Piece]) -> String {
        pieces
            .iter()
            .map(|p| match p {
                Piece::Translate(s) | Piece::Literal(s) => s.as_str(),
            })
            .collect()
    }

    #[test]
    fn plan_loses_nothing() {
        let text = "# Title\n\nSome long **markdown** description here.\n\n```rust\nfn main() {}\n```\n\n- item one\n- item two\n";
        assert_eq!(join(&plan_translation(text, 120)), text);
    }

    #[test]
    fn plan_loses_nothing_when_everything_is_cut_to_pieces() {
        // Короткий лимит — и абзацы, и строки режутся на много кусков.
        let text = (0..40)
            .map(|i| format!("Строка {}: описание возможностей мода.\n", i))
            .collect::<String>()
            + "\n\n"
            + &(0..20)
                .map(|i| format!("line {i} of a long english paragraph; "))
                .collect::<String>();
        let joined = join(&plan_translation(&text, 48));
        assert_eq!(joined, text);
    }

    #[test]
    fn fenced_block_stays_literal() {
        let text = "Intro text.\n\n```java\nSystem.out.println(\"meow\");\n```\n\nOutro text.";
        let pieces = plan_translation(text, 400);
        assert!(
            pieces
                .iter()
                .any(|p| matches!(p, Piece::Literal(s) if s.contains("System.out.println"))),
            "блок кода должен остаться дословным: {pieces:?}"
        );
        assert!(
            !pieces
                .iter()
                .any(|p| matches!(p, Piece::Translate(s) if s.contains("System.out.println"))),
            "код нельзя отдавать переводчику"
        );
    }

    #[test]
    fn tilde_fence_is_code_too() {
        let pieces = plan_translation("~~~\nraw()\n~~~\nprose", 400);
        assert!(matches!(&pieces[0], Piece::Literal(s) if s.starts_with("~~~")));
    }

    #[test]
    fn unclosed_fence_is_treated_as_code() {
        let pieces = plan_translation("before\n```\nnever closed", 400);
        assert!(matches!(&pieces[1], Piece::Literal(s) if s.contains("never closed")));
    }

    #[test]
    fn inline_backticks_stay_with_the_sentence() {
        // Одиночные кавычки внутри строки — не блок кода: предложение рвать нельзя.
        let pieces = plan_translation("Config at `.config/mod.toml` lives here.", 400);
        assert!(matches!(&pieces[0], Piece::Translate(s) if s.contains(".config/mod.toml")));
    }

    #[test]
    fn chunks_concatenate_back_to_the_source() {
        let text = "x".repeat(50) + "\n\n" + &"y".repeat(50) + "\n\n" + &"z".repeat(10);
        let chunks = split_chunks(&text, 60);
        assert_eq!(chunks.join(""), text);
        assert!(chunks.len() > 1);
    }

    #[test]
    fn long_single_line_is_cut_without_losing_characters() {
        let line = "word ".repeat(200);
        let line = line.trim_end();
        let parts = hard_split(line, 100);
        assert!(parts.len() > 1);
        assert!(parts.iter().all(|p| p.chars().count() <= 100));
        assert_eq!(parts.join(""), line);
    }

    #[test]
    fn multiline_block_keeps_newlines_between_pieces() {
        let block = (0..30)
            .map(|i| format!("строка номер {}", i))
            .collect::<Vec<String>>()
            .join("\n");
        let parts = hard_split(&block, 40);
        assert!(parts.len() > 1);
        assert_eq!(parts.join(""), block);
        assert_eq!(parts.join("").lines().count(), 30);
    }

    #[test]
    fn cyrillic_share_detects_russian() {
        assert!(cyrillic_share("Это описание мода на русском языке") > 0.9);
        assert!(cyrillic_share("This is an English mod description") < 0.05);
        assert_eq!(cyrillic_share("12345 ... !!!"), 0.0);
    }

    #[test]
    fn empty_text_yields_no_pieces() {
        assert!(plan_translation("", 100).is_empty());
    }

    #[test]
    fn google_answers_in_all_three_shapes_are_understood() {
        let dj = serde_json::json!({
            "sentences": [{ "trans": "Привет" }, { "trans": ", мир" }]
        });
        assert_eq!(parse_google_response(&dj).as_deref(), Some("Привет, мир"));

        let single = serde_json::json!([[["Привет", "Hello", null, null, 10]], null, "en"]);
        assert_eq!(parse_google_response(&single).as_deref(), Some("Привет"));

        // `translate_a/t` отдаёт пару «перевод, язык»: язык в текст не идёт.
        let short = serde_json::json!([["Привет, мир", "en"]]);
        assert_eq!(
            parse_google_response(&short).as_deref(),
            Some("Привет, мир")
        );

        assert_eq!(
            parse_google_response(&serde_json::json!([["", "en"]])),
            None
        );
        assert_eq!(parse_google_response(&serde_json::json!("мусор")), None);
    }
}
