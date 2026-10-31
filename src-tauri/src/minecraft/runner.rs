use crate::commands::java::*;
use crate::minecraft::assets::*;
use crate::minecraft::libraries::*;
use crate::minecraft::loaders::*;
use crate::minecraft::manifest::*;
use crate::minecraft::models::*;
use crate::utils::args;
use crate::utils::download::*;
use crate::utils::guard;
use crate::utils::logmarkers::is_window_ready;
use crate::utils::paths::*;
use crate::utils::versions;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

static IS_RUNNING: AtomicBool = AtomicBool::new(false);
/// Окно игры уже создано.
///
/// Процесс Java стартует за доли секунды, а окно у загрузчиков с модами
/// появляется через 5–20 с. Раньше лаунчер объявлял «Игра запущена» сразу
/// после `spawn`, и все эти секунды игрок смотрел в пустой экран.
static GAME_READY: AtomicBool = AtomicBool::new(false);

fn parse_ram(val: Option<&Value>) -> u32 {
    let raw = match val {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(2048) as u32,
        Some(Value::String(s)) => {
            let num_str: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
            num_str.parse().unwrap_or(2048)
        }
        _ => 2048,
    };
    // `-Xmx0M` или абсурдно большой размер роняют JVM ещё до старта игры.
    raw.clamp(512, 65536)
}

fn parse_args_from_json(args_val: Option<&Value>, vars: &HashMap<&str, String>) -> Vec<String> {
    let mut result = Vec::new();
    let arr = match args_val.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return result,
    };

    let current_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };

    let current_arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        "x86"
    };

    for item in arr {
        if let Some(s) = item.as_str() {
            result.push(args::substitute(s, vars));
        } else if let Some(obj) = item.as_object() {
            let allowed = if let Some(rules) = obj.get("rules").and_then(|r| r.as_array()) {
                let mut allow = false;
                for rule in rules {
                    let rule_action = rule["action"].as_str() == Some("allow");
                    if let Some(os) = rule.get("os") {
                        let mut os_match = true;
                        if let Some(name) = os.get("name").and_then(|n| n.as_str()) {
                            if name != current_os {
                                os_match = false;
                            }
                        }
                        if let Some(arch) = os.get("arch").and_then(|a| a.as_str()) {
                            let arch_match = match arch {
                                "arm64" | "aarch64" => current_arch == "arm64",
                                "x64" | "x86_64" => current_arch == "x86_64",
                                "x86" => current_arch == "x86",
                                _ => false,
                            };
                            if !arch_match {
                                os_match = false;
                            }
                        }
                        if os_match {
                            allow = rule_action;
                        }
                    } else if rule.get("features").is_some() {
                        // Skip optional feature triggers like is_demo_user
                        continue;
                    } else {
                        allow = rule_action;
                    }
                }
                allow
            } else {
                true
            };

            if allowed {
                if let Some(val) = obj.get("value") {
                    if let Some(s) = val.as_str() {
                        result.push(args::substitute(s, vars));
                    } else if let Some(val_arr) = val.as_array() {
                        for sub_item in val_arr {
                            if let Some(s) = sub_item.as_str() {
                                result.push(args::substitute(s, vars));
                            }
                        }
                    }
                }
            }
        }
    }
    result
}

pub async fn launch_minecraft(app: AppHandle, options: LaunchOptions) -> Result<(), String> {
    if IS_RUNNING.load(Ordering::SeqCst) {
        return Err(
            "Minecraft уже запущен! Закройте открытую игру перед новым запуском.".to_string(),
        );
    }

    GAME_READY.store(false, Ordering::SeqCst);
    // Настройки окна снимаем до того, как поля options разойдутся по аргументам.
    let want_fullscreen = options.fullscreen.unwrap_or(false);
    let minimize_launcher = options.minimize_launcher.unwrap_or(false);
    let _ = app.emit("launch-progress", "Проверка параметров запуска...");

    // Normalize version and loader
    // Версию загрузчика выбирает человек при создании сборки; пустая —
    // значит «любая свежая», то есть прежнее поведение.
    let loader_version = options.loader_version.clone();
    let (raw_version, loader_type) = if options.version.ends_with(" Forge") {
        (
            options.version.replace(" Forge", "").trim().to_string(),
            Some("forge".to_string()),
        )
    } else {
        (options.version.clone(), options.loader.clone())
    };

    // 1. Initial Java resolution
    let mut java_bin = if let Some(custom_java) = &options.java_path {
        let p = std::path::PathBuf::from(custom_java);
        if p.exists() {
            p
        } else {
            find_installed_java("25")
                .or_else(|| find_installed_java("21"))
                .or_else(|| find_installed_java("17"))
                .or_else(|| find_installed_java("8"))
                .unwrap_or_else(|| std::path::PathBuf::from("java"))
        }
    } else {
        find_installed_java("25")
            .or_else(|| find_installed_java("21"))
            .or_else(|| find_installed_java("17"))
            .or_else(|| find_installed_java("8"))
            .unwrap_or_else(|| std::path::PathBuf::from("java"))
    };

    let _ = app.emit(
        "launch-progress",
        "Проверка версии игры и загрузчика модов...",
    );

    // 2. Mod loader resolution
    //
    // Java для установщика здесь больше не ищется: она нужна только когда
    // загрузчик действительно ставится, и `ensure_forge`/`ensure_neoforge`
    // разрешают её сами. Иначе каждый запуск тратил время на поиск JDK и
    // `java -version` в отдельном процессе, хотя Forge уже установлен.
    // id версии приходит из интерфейса и становится папкой в versions/.
    let mut version_id = guard::folder_name(&raw_version)?;
    if let Some(loader) = &loader_type {
        let l = loader.to_lowercase();
        if l == "fabric" {
            version_id = ensure_fabric(&app, &raw_version, loader_version.as_deref()).await?;
        } else if l == "quilt" {
            version_id = ensure_quilt(&app, &raw_version, loader_version.as_deref()).await?;
        } else if l == "forge" {
            version_id = ensure_forge(&app, &raw_version, loader_version.as_deref()).await?;
        } else if l == "neoforge" {
            version_id = ensure_neoforge(&app, &raw_version, loader_version.as_deref()).await?;
        }
    }

    // 3. Load version JSON
    let mut version_json = load_or_fetch_version_json(&version_id).await?;

    // 3.1. Профиль, собранный ForgeWrapper.
    //
    // Его mainClass — установщик, который ищет `forge-*-installer.jar` в
    // classpath. Мы собираем classpath из `libraries/`, установщика там нет, и
    // JVM падала с «Unable to detect the forge installer!» вместо игры. Такой
    // профиль ставим заново обычным установщиком Forge; если версия игры
    // неизвестна (профиль выбран как готовая версия) — говорим прямо, что делать.
    if versions::is_forgewrapper_json(&version_json) {
        let known_loader = loader_type.as_deref().map(|l| l.to_ascii_lowercase());
        let reinstalled = match known_loader.as_deref() {
            Some("forge") => {
                Some(ensure_forge(&app, &raw_version, loader_version.as_deref()).await?)
            }
            Some("neoforge") => {
                Some(ensure_neoforge(&app, &raw_version, loader_version.as_deref()).await?)
            }
            _ => None,
        };
        if let Some(new_id) = reinstalled {
            let _ = app.emit(
                "launch-progress",
                "Профиль собран через ForgeWrapper — переустановил загрузчик обычным установщиком...",
            );
            version_id = new_id;
            version_json = load_or_fetch_version_json(&version_id).await?;
        }
        if versions::is_forgewrapper_json(&version_json) {
            return Err(format!(
                "Версия «{}» собрана через ForgeWrapper (другим лаунчером): в её профиле нет установщика Forge, поэтому игра не запускается. Установите загрузчик заново — выберите эту версию игры и нажмите «Играть».",
                version_id
            ));
        }
    }

    let parent_json_opt: Option<(String, Value)> =
        if let Some(inherits_from) = version_json["inheritsFrom"].as_str() {
            let p_json = load_or_fetch_version_json(inherits_from).await?;
            Some((inherits_from.to_string(), p_json))
        } else {
            None
        };

    // Refine Java based on version requirements if java_path is auto
    if options.java_path.is_none()
        || !std::path::PathBuf::from(options.java_path.as_ref().unwrap()).exists()
    {
        // Требование игры нормализуем к тому рантайму, который лаунчер умеет
        // ставить. Если версия слишком новая и `supported_java` вернул None,
        // оставляем уже выбранную Java — падать из-за этого незачем.
        if let Some(target_ver) = versions::java_requirement(
            &version_json,
            parent_json_opt.as_ref().map(|(_, p)| p),
            &raw_version,
        )
        .and_then(versions::supported_java)
        {
            if let Some(bin) = find_installed_java(&target_ver.to_string()) {
                java_bin = bin;
            }
        }
    }

    // 3.5. Проверка совместимости Java.
    //
    // Если в настройках выбран слишком старый рантайм, игра падает с
    // UnsupportedClassVersionError ещё до создания окна, а лаунчер при этом
    // успевает отрапортовать «Игра запущена». Поэтому выбранную Java сверяем с
    // требованием версии и при нехватке берём/скачиваем подходящую.
    // Требование нормализуем: ставим только 8/17/21/25. Если версия новее 25
    // (supported_java вернул None), ничего не устанавливаем и оставляем
    // выбранную Java, чтобы не ломать запуск.
    if let Some(supported) = versions::java_requirement(
        &version_json,
        parent_json_opt.as_ref().map(|(_, p)| p),
        &raw_version,
    )
    .and_then(versions::supported_java)
    {
        if let Some(actual) = java_major_version(&java_bin) {
            if actual < supported {
                let _ = app.emit(
                    "launch-progress",
                    format!(
                        "Версии {} нужна Java {}, а выбрана {} — переключаюсь на {}",
                        raw_version, supported, actual, supported
                    ),
                );
                java_bin = ensure_java_for(&app, supported).await?;
            }
        }
    }

    // 4. Assets
    let _ = app.emit("launch-progress", "Проверка ресурсов игры...");
    if let Some((_, parent_json)) = &parent_json_opt {
        download_assets(&app, parent_json).await?;
    } else {
        download_assets(&app, &version_json).await?;
    }

    // 5. Libraries & Client Jar
    // Файлы обычно уже на месте, и это проверка, а не загрузка: старый текст
    // «Загрузка библиотек...» выглядел как долгая скачка на ровном месте.
    let _ = app.emit("launch-progress", "Проверка файлов игры...");
    let root = get_minecraft_root();
    let libraries_dir = root.join("libraries");
    let version_dir = root.join("versions").join(&version_id);
    let natives_dir = version_dir.join("natives");
    fs::create_dir_all(&natives_dir)
        .map_err(|e| format!("Не удалось создать папку natives: {}", e))?;

    let mut classpath: Vec<std::path::PathBuf> = Vec::new();

    // Download child libraries
    let child_libs = download_version_libraries(&app, &version_json, &natives_dir).await?;
    classpath.extend(child_libs);

    // Download parent libraries and client jar if inheritsFrom
    let client_jar = if let Some((parent_id, parent_json)) = &parent_json_opt {
        let parent_libs = download_version_libraries(&app, parent_json, &natives_dir).await?;
        classpath.extend(parent_libs);

        if version_json
            .get("downloads")
            .and_then(|d| d.get("client"))
            .is_some()
        {
            ensure_client_jar(&app, &version_id, &version_json).await?
        } else {
            ensure_client_jar(&app, parent_id, parent_json).await?
        }
    } else {
        ensure_client_jar(&app, &version_id, &version_json).await?
    };

    // Forge/NeoForge ищут клиентский jar по имени версии.
    //
    // В профиле загрузчика есть `-DignoreList=...,${version_name}.jar`, и
    // BootstrapLauncher не поднимает этот файл как модуль. Если на classpath
    // лежит jar родительской версии (`1.20.1.jar`), он становится
    // автоматическим модулем `_1._20._1` и запуск падает с
    //
    //   ResolutionException: Module minecraft contains package
    //   net.minecraft.server, module _1._20._1 exports package
    //   net.minecraft.server to minecraft
    //
    // Поэтому копируем клиент под именем версии — ровно так же, как это делает
    // официальный лаунчер и Prism. Признак того, что профиль этого ждёт, —
    // `${version_name}.jar` в его jvm-аргументах.
    let wants_own_client_jar = version_json
        .get("arguments")
        .and_then(|a| a.get("jvm"))
        .map(|jvm| jvm.to_string().contains("${version_name}.jar"))
        .unwrap_or(false);

    let client_jar = if wants_own_client_jar {
        let own_jar = version_dir.join(format!("{}.jar", version_id));
        if own_jar != client_jar {
            // Жёсткая ссылка не тратит место; если файловая система её не
            // умеет (другой том, FAT), остаётся обычное копирование.
            if !own_jar.is_file() {
                if fs::hard_link(&client_jar, &own_jar).is_err() {
                    fs::copy(&client_jar, &own_jar).map_err(|e| {
                        format!(
                            "Не удалось подготовить клиентский jar версии {}: {}",
                            version_id, e
                        )
                    })?;
                }
            }
            own_jar
        } else {
            client_jar
        }
    } else {
        client_jar
    };

    if client_jar.exists() {
        classpath.push(client_jar);
    }

    let cp_separator = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let cp_string = classpath
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(cp_separator);

    // 6. Main class
    let main_class = version_json["mainClass"]
        .as_str()
        .or_else(|| {
            parent_json_opt
                .as_ref()
                .and_then(|(_, p)| p["mainClass"].as_str())
        })
        .unwrap_or("net.minecraft.client.main.Main");

    // 7. Game directories
    let game_dir = if let Some(instance) = &options.instance_id {
        let instance = guard::folder_name(instance)?;
        root.join("versions").join(instance)
    } else {
        root.clone()
    };
    fs::create_dir_all(&game_dir).map_err(|e| format!("Не удалось создать папку игры: {}", e))?;

    let assets_dir = root.join("assets");
    let asset_index = version_json["assetIndex"]["id"]
        .as_str()
        .or_else(|| {
            parent_json_opt
                .as_ref()
                .and_then(|(_, p)| p["assetIndex"]["id"].as_str())
        })
        .unwrap_or("legacy");

    // 8. Auth parameters
    let username = options.username.unwrap_or_else(|| "Player".to_string());
    let uuid = options
        .uuid
        .unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string());
    let token = options.token.unwrap_or_else(|| "0".to_string());

    // 9. Build Arguments Substitution Map
    let mut vars = HashMap::new();
    vars.insert("auth_player_name", username.clone());
    vars.insert("version_name", version_id.clone());
    vars.insert("game_directory", game_dir.to_string_lossy().to_string());
    vars.insert("assets_root", assets_dir.to_string_lossy().to_string());
    vars.insert("assets_index_name", asset_index.to_string());
    vars.insert("auth_uuid", uuid.clone());
    vars.insert("auth_access_token", token.clone());
    let client_id_str = options.client_token.clone().unwrap_or_else(|| uuid.clone());
    vars.insert("clientid", client_id_str.clone());
    vars.insert("auth_xuid", uuid.clone());
    vars.insert("user_type", "mojang".to_string());
    vars.insert("version_type", "release".to_string());
    vars.insert(
        "natives_directory",
        natives_dir.to_string_lossy().to_string(),
    );
    vars.insert("launcher_name", "PagryshaLauncher".to_string());
    vars.insert("launcher_version", "7.2".to_string());
    vars.insert("classpath", cp_string.clone());
    vars.insert("classpath_separator", cp_separator.to_string());
    vars.insert(
        "library_directory",
        libraries_dir.to_string_lossy().to_string(),
    );

    // 10. Build JVM arguments
    let ram = parse_ram(options.max_ram.as_ref());
    // Версию рантайма спрашиваем один раз: она нужна и для флагов GC, и для
    // `--enable-native-access`, а каждый вызов — либо чтение кеша, либо
    // отдельный процесс `java -version`.
    let java_major = java_major_version(&java_bin);

    // Стартовая куча равна максимальной. С `-Xms512M` сборка на 150+ модов по
    // ходу загрузки несколько раз расширяет heap, и каждый шаг — полный GC
    // ещё до появления окна. `AlwaysPreTouch` не включаем: он, наоборот,
    // заранее трогает все страницы и отодвигает старт.
    let mut jvm_args = vec![
        format!("-Xmx{}M", ram),
        format!("-Xms{}M", ram),
        "-Dfile.encoding=UTF-8".to_string(),
        "-Dsun.jnu.encoding=UTF-8".to_string(),
        format!(
            "-Dorg.lwjgl.system.SharedLibraryExtractPath={}",
            natives_dir.to_string_lossy()
        ),
        format!("-Djna.tmpdir={}", natives_dir.to_string_lossy()),
        format!(
            "-Dio.netty.native.workdir={}",
            natives_dir.to_string_lossy()
        ),
    ];

    // Тюнинг G1 (набор Aikar's без `AlwaysPreTouch`).
    //
    // Часть опций в старых JDK помечена экспериментальными, поэтому сначала
    // `UnlockExperimentalVMOptions`: без него Java 11 откажется стартовать с
    // «VM option ... is experimental». Java 8 не понимает половину набора,
    // так что ниже 11 его не подмешиваем вовсе.
    if let Some(major) = java_major {
        if major >= 11 {
            for flag in [
                "-XX:+UnlockExperimentalVMOptions",
                "-XX:+UseG1GC",
                "-XX:+ParallelRefProcEnabled",
                "-XX:MaxGCPauseMillis=50",
                "-XX:+DisableExplicitGC",
                "-XX:G1NewSizePercent=20",
                "-XX:G1MaxNewSizePercent=40",
                "-XX:G1HeapRegionSize=8M",
                "-XX:G1ReservePercent=20",
                "-XX:G1HeapWastePercent=5",
                "-XX:G1MixedGCCountTarget=4",
                "-XX:InitiatingHeapOccupancyPercent=15",
                "-XX:G1MixedGCLiveThresholdPercent=90",
                "-XX:G1RSetUpdatingPauseTimePercent=5",
                "-XX:SurvivorRatio=32",
                "-XX:MaxTenuringThreshold=1",
                "-XX:+PerfDisableSharedMem",
            ] {
                jvm_args.push(flag.to_string());
            }
        }
    }

    // `--enable-native-access` появился только в Java 17, а Java 8 падает на
    // нём с "Unrecognized option" ещё до старта игры. Поэтому флаг добавляем
    // лишь тогда, когда реально знаем версию выбранного рантайма и она его
    // поддерживает.
    if let Some(major) = java_major {
        if versions::native_access_supported(major) {
            jvm_args.push("--enable-native-access=ALL-UNNAMED".to_string());
        }
    }

    // Authlib injector нужен только Ely.by
    if let Some(auth_type) = &options.auth_type {
        if auth_type == "elyby" {
            let injector_path = root.join("authlib-injector.jar");
            if !injector_path.is_file() {
                let _ = app.emit("launch-progress", "Загрузка authlib-injector...");
                // Хеша у этой ссылки нет — только проверка самой загрузки.
                // Раньше ошибка проглатывалась, и игра стартовала без агента
                // авторизации, то есть вход всё равно бы не сработал.
                ensure_file(
                    "https://authlib-injector.yushi.moe/artifact/latest/authlib-injector.jar",
                    &injector_path,
                    None,
                )
                .await
                .map_err(|e| format!("Не удалось скачать authlib-injector: {}", e))?;
            }
            if injector_path.exists() {
                let yggdrasil = "ely.by";
                jvm_args.push(format!(
                    "-javaagent:{}={}",
                    injector_path.to_string_lossy(),
                    yggdrasil
                ));
                jvm_args.push("-Dauthlibinjector.side=client".to_string());
            }
        }
    }

    if let Some(custom) = options.custom_args {
        jvm_args.extend(custom);
    }

    // Parse JSON JVM arguments from child & parent
    let mut parsed_jvm = Vec::new();
    if let Some((_, parent_json)) = &parent_json_opt {
        parsed_jvm.extend(parse_args_from_json(
            parent_json.get("arguments").and_then(|a| a.get("jvm")),
            &vars,
        ));
    }
    parsed_jvm.extend(parse_args_from_json(
        version_json.get("arguments").and_then(|a| a.get("jvm")),
        &vars,
    ));

    let mut cp_included = false;
    for arg in parsed_jvm {
        if arg.contains("-Djava.library.path=") {
            jvm_args.push(format!(
                "-Djava.library.path={}",
                natives_dir.to_string_lossy()
            ));
        } else if arg == "-cp" || arg == "-classpath" {
            cp_included = true;
            jvm_args.push(arg);
        } else {
            if arg == cp_string {
                cp_included = true;
            }
            jvm_args.push(arg);
        }
    }

    if !cp_included {
        jvm_args.push(format!(
            "-Djava.library.path={}",
            natives_dir.to_string_lossy()
        ));
        jvm_args.push("-cp".to_string());
        jvm_args.push(cp_string);
    }

    jvm_args.push(main_class.to_string());

    // 11. Build Game arguments
    let mut game_args = Vec::new();

    // Check arguments.game from child and parent
    let mut parsed_game = Vec::new();
    if let Some((_, parent_json)) = &parent_json_opt {
        parsed_game.extend(parse_args_from_json(
            parent_json.get("arguments").and_then(|a| a.get("game")),
            &vars,
        ));
    }
    parsed_game.extend(parse_args_from_json(
        version_json.get("arguments").and_then(|a| a.get("game")),
        &vars,
    ));

    if !parsed_game.is_empty() {
        game_args.extend(parsed_game);
    } else {
        // Check minecraftArguments (1.12.2 and older)
        let legacy_args = version_json
            .get("minecraftArguments")
            .or_else(|| {
                parent_json_opt
                    .as_ref()
                    .and_then(|(_, p)| p.get("minecraftArguments"))
            })
            .and_then(|v| v.as_str());

        if let Some(mca) = legacy_args {
            // Разбиение — внутри split_legacy: сначала пробелы, потом значения.
            game_args.extend(args::split_legacy(mca, &vars));
        } else {
            // Default game arguments
            game_args.extend(vec![
                "--username".to_string(),
                username,
                "--version".to_string(),
                raw_version,
                "--gameDir".to_string(),
                game_dir.to_string_lossy().to_string(),
                "--assetsDir".to_string(),
                assets_dir.to_string_lossy().to_string(),
                "--assetIndex".to_string(),
                asset_index.to_string(),
                "--uuid".to_string(),
                uuid,
                "--accessToken".to_string(),
                token,
                "--userType".to_string(),
                "mojang".to_string(),
                "--versionType".to_string(),
                "release".to_string(),
            ]);
        }
    }

    // Полный экран ставим в options.txt: в аргументах версии такого параметра
    // нет, а вот сама игра читает эту опцию при старте. У инстансов своя
    // папка, поэтому правим файл именно той сборки, которую запускаем.
    let mut option_values: Vec<(&str, String)> = Vec::new();
    if want_fullscreen {
        option_values.push(("fullscreen", "true".to_string()));
    }
    if let Some(player) = &options.player_options {
        if let Some(lang) = player
            .lang
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            option_values.push(("lang", lang.to_lowercase()));
        }
        if let Some(scale) = player
            .gui_scale
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            option_values.push(("guiScale", scale.to_string()));
        }
        if let Some(narrator) = player
            .narrator
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            option_values.push(("narrator", narrator.to_string()));
        }
    }
    if !option_values.is_empty() {
        let pairs: Vec<(&str, &str)> = option_values
            .iter()
            .map(|(k, v)| (*k, v.as_str()))
            .collect();
        if let Err(e) = crate::utils::options::write_options(&game_dir, &pairs) {
            eprintln!("[LAUNCH] не удалось применить настройки игры: {}", e);
        }
    }

    let log_path = get_log_path();
    let _ = fs::write(&log_path, "--- Minecraft Launch ---\n");

    let _ = app.emit("launch-progress", "Запуск процесса игры Minecraft...");

    let mut cmd = Command::new(&java_bin);
    cmd.args(&jvm_args);
    cmd.args(&game_args);
    cmd.current_dir(&game_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить Java: {}", e))?;
    IS_RUNNING.store(true, Ordering::SeqCst);

    // Процесс только-только стартовал: окно появится через несколько секунд,
    // и до этого полоса прогресса должна оставаться на экране.
    let _ = app.emit("launch-progress", "Игра запускается...");

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Лог пишем через буфер: сборка на 150 модов выдаёт тысячи строк, и без
    // буфера это тысячи мелких записей на диск — заметно даже на SSD.
    let log_file = Arc::new(tokio::sync::Mutex::new(BufWriter::new(
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| e.to_string())?,
    )));

    let ready_app = app.clone();
    let log_out = log_file.clone();
    let out_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            // Единственный признак, что окно реально создано: сама игра
            // пишет об этом в лог. Сообщаем один раз — полосе прогресса
            // больше нечего ждать.
            if !GAME_READY.load(Ordering::SeqCst) && is_window_ready(&line) {
                GAME_READY.store(true, Ordering::SeqCst);
                let _ = ready_app.emit("game-ready", ());
                // Лаунчер уходит с глаз только когда окно игры действительно
                // создано: до этого полоса прогресса ещё нужна человеку.
                if minimize_launcher {
                    if let Some(window) = ready_app.get_webview_window("main") {
                        let _ = window.minimize();
                    }
                }
            }
            println!("[MC] {}", line);
            let mut f = log_out.lock().await;
            let _ = writeln!(f, "[STDOUT] {}", line);
        }
    });

    let log_err = log_file.clone();
    let err_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            eprintln!("[MC-ERR] {}", line);
            let mut f = log_err.lock().await;
            let _ = writeln!(f, "[STDERR] {}", line);
        }
    });

    let app_handle = app.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        IS_RUNNING.store(false, Ordering::SeqCst);

        // Процесс завершился, но задачи чтения stdout/stderr могли ещё не
        // дописать хвост лога. Без ожидания стектрейс краша терялся, и в
        // интерфейс уходил пустой лог.
        let _ = out_handle.await;
        let _ = err_handle.await;

        // Буфер лога сбрасываем до чтения: иначе последние строки (а в них
        // чаще всего и лежит причина краха) остались бы в памяти.
        {
            let mut f = log_file.lock().await;
            let _ = f.flush();
        }

        let code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);
        if code != 0 {
            let log_text = fs::read_to_string(&log_path).unwrap_or_default();
            let _ = app_handle.emit("game-crashed", log_text);
        } else {
            let _ = app_handle.emit("game-closed", ());
        }
    });

    Ok(())
}
