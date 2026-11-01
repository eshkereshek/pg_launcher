use serde_json::Value;
use std::time::Duration;

fn format_uuid(raw: &str) -> String {
    if raw.len() == 32 && !raw.contains('-') {
        format!(
            "{}-{}-{}-{}-{}",
            &raw[0..8],
            &raw[8..12],
            &raw[12..16],
            &raw[16..20],
            &raw[20..32]
        )
    } else {
        raw.to_string()
    }
}

#[tauri::command]
pub async fn auth_elyby(email: String, password: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "agent": { "name": "Minecraft", "version": 1 },
        "username": email,
        "password": password,
        "requestUser": true
    });

    let resp = client
        .post("https://authserver.ely.by/auth/authenticate")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Сервер Ely.by недоступен: {}", e))?;

    if !resp.status().is_success() {
        if resp.status().as_u16() == 401 || resp.status().as_u16() == 403 {
            return Err("Неверный логин или пароль".to_string());
        }
        return Err(format!("Ошибка ответа сервера Ely.by ({})", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let profile_name = data["selectedProfile"]["name"]
        .as_str()
        .unwrap_or("Player")
        .to_string();
    let raw_uuid = data["selectedProfile"]["id"].as_str().unwrap_or("");
    let formatted_uuid = format_uuid(raw_uuid);
    let access_token = data["accessToken"].as_str().unwrap_or("").to_string();
    let client_token = data["clientToken"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "type": "elyby",
        "username": profile_name,
        "uuid": formatted_uuid,
        "token": access_token,
        "clientToken": client_token,
        "skinUrl": format!("https://skinsystem.ely.by/skins/{}.png", profile_name)
    }))
}

#[tauri::command]
pub async fn auth_microsoft() -> Result<Value, String> {
    // Microsoft Xbox Live OAuth flow
    // Device code authentication or local loopback listener
    Err(
        "Авторизация Microsoft через браузер настраивается. Используйте офлайн или Ely.by аккаунт."
            .to_string(),
    )
}
/// Проверка, что токен Ely.by ещё действителен.
///
/// Yggdrasil-сервер отвечает 204 на живой токен и 403 на протухший. Без этой
/// проверки игра получала старый токен, и сервер друзей отбивал вход с
/// «Недействительная сессия».
#[tauri::command]
pub async fn auth_elyby_validate(access_token: String) -> Result<bool, String> {
    if access_token.trim().is_empty() {
        return Ok(false);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://authserver.ely.by/auth/validate")
        .json(&serde_json::json!({ "accessToken": access_token }))
        .send()
        .await
        .map_err(|e| format!("Сервер Ely.by недоступен: {}", e))?;

    match resp.status().as_u16() {
        204 | 200 => Ok(true),
        403 | 401 => Ok(false),
        code => Err(format!("Ely.by ответил {}", code)),
    }
}

/// Обновление токена Ely.by по старому.
///
/// Протухший accessToken ещё можно обменять на новый: игроку не нужно заново
/// вводить пароль. Если сервер отказал — аккаунт придётся добавить заново.
#[tauri::command]
pub async fn auth_elyby_refresh(
    access_token: String,
    client_token: String,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "accessToken": access_token,
        "clientToken": client_token,
        "requestUser": true
    });

    let resp = client
        .post("https://authserver.ely.by/auth/refresh")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Сервер Ely.by недоступен: {}", e))?;

    if !resp.status().is_success() {
        return Err("Сессия Ely.by истекла, войдите в аккаунт заново".to_string());
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "token": data["accessToken"].as_str().unwrap_or(""),
        "clientToken": data["clientToken"]
            .as_str()
            .map(|v| v.to_string())
            .unwrap_or(client_token),
    }))
}
