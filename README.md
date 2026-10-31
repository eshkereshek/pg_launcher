# Pagrysha Launcher (Tauri Edition) 🚀

Полноценный перенос **Pagrysha Launcher** с Electron на **Tauri v2 + Rust**.

---

## Архитектура

### 1. Frontend (`src/`)
- **React 19 + TypeScript + Vite**
- Модуль [`src/api/tauriBridge.ts`](src/api/tauriBridge.ts) прозрачно связывает вызовы `window.electronAPI` с IPC командами и событиями Tauri (`@tauri-apps/api/core` и `@tauri-apps/api/event`).
- Весь исходный UI (`App.tsx`, `ModsMenu.tsx`, `ModpacksMenu.tsx`, `ServersMenu.tsx`, `WardrobeMenu.tsx`, `InstallerApp.tsx` и др.) сохранен на 100% без потери функционала.

### 2. Backend (`src-tauri/`)
Написан на **Rust**:
- **Ядро без Tauri:** проверки путей и адресов, скачивание с проверкой хеша, разбор версий и аргументов, распаковка нативов ([`src-tauri/core`](src-tauri/core)). Отдельный крейт нужен, чтобы эти модули можно было покрыть тестами без окна.
- **Управление окном:** Сворачивание, разворачивание, закрытие, скрытие, фокус, открытие внешних ссылок ([`commands/window.rs`](src-tauri/src/commands/window.rs)).
- **Конфигурация и данные:** Хранение настроек, аккаунтов, локальных модпаков, открытие папок и системная информация ([`commands/config.rs`](src-tauri/src/commands/config.rs)).
- **Скины и аватары:** Локальное хранилище скинов, выбор файлов, загрузка текстур с Ely.by и кодирование в Base64 ([`commands/skins.rs`](src-tauri/src/commands/skins.rs)).
- **Парсинг серверов:** Парсинг мониторинга `minecraft-mp.com` через HTML scraper ([`commands/servers.rs`](src-tauri/src/commands/servers.rs)).
- **Аутентификация:** Ely.by, PGSync / Yggdrasil, Offline ([`commands/auth.rs`](src-tauri/src/commands/auth.rs)).
- **Моды и модпаки:** Поиск по Modrinth, скачивание модов и зависимостей, переключение (.disabled), установка OptiFine и распаковка .mrpack модпаков ([`commands/mods.rs`](src-tauri/src/commands/mods.rs)).
- **Java Runtime Manager:** Автоматическое определение установленных версий (8, 17, 21), скачивание и распаковка Adoptium OpenJDK ([`commands/java.rs`](src-tauri/src/commands/java.rs)).
- **Запуск Minecraft (Core):**
  - Загрузка официального манифеста версий Mojang ([`minecraft/manifest.rs`](src-tauri/src/minecraft/manifest.rs)).
  - Поддержка загрузчиков Fabric, Quilt, Forge и NeoForge ([`minecraft/loaders.rs`](src-tauri/src/minecraft/loaders.rs)).
  - Параллельное асинхронное скачивание ассетов ([`minecraft/assets.rs`](src-tauri/src/minecraft/assets.rs)).
  - Разрешение библиотек, нативов и формирование classpath ([`minecraft/libraries.rs`](src-tauri/src/minecraft/libraries.rs)).
  - Инъекция authlib-injector для поддержки скинов Ely.by и PGSync.
  - Асинхронный запуск Java-процесса через Tokio с перехватом потоков вывода в лог ([`minecraft/runner.rs`](src-tauri/src/minecraft/runner.rs)).

---

## Требования для сборки и запуска

1. **Node.js** 22 (Vite 8 требует 20.19+ или 22.12+) и **npm**
2. **Rust & Cargo** (1.78+)
3. На Windows: установленный [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) или WebView2 Runtime.

---

## Команды запуска

```bash
# 1. Установка зависимостей фронтенда
npm install

# 2. Запуск в режиме разработки (Vite + Tauri окно)
npm run tauri:dev

# 3. Сборка релизного бинарника / установщика (.exe / .msi)
npm run tauri:build
```

---

## Тесты

Логика без Tauri — скачивание с проверкой хеша, пути, проверки путей и
адресов, разбор версий и аргументов — вынесена в отдельный крейт
[`src-tauri/core`](src-tauri/core). Там же лежат все тесты:

```bash
cd src-tauri
cargo test --workspace
```

Тестовые цели самого приложения в `Cargo.toml` выключены (`test = false`): на
Windows тестовый бинарник с Tauri не получает манифест comctl32 v6 и падает с
`STATUS_ENTRYPOINT_NOT_FOUND` ещё до запуска, поэтому проверять там нечего.

Остальные проверки, которые прогоняет CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
cd src-tauri
cargo fmt --all --check
cargo check --all-targets
```

---

## Сборка установщика

```bash
npm run build:setup
```

Скрипт собирает приложение, кладёт рядом `Pagrysha_Launcher_Setup.exe` и
`WebView2Loader.dll` (они нужны как ресурсы) и упаковывает всё в один файл
`Pagrysha_Setup.exe`. Все эти артефакты — результаты сборки, в репозиторий они
не попадают (см. [`.gitignore`](.gitignore)).

Исходный GIF утерян, поэтому кадры остаются на диске единственным способом
пересобрать анимацию (`process_gif.ps1` + `encode_swim_gif.cjs`); в репозиторий
они не коммитятся из-за размера (79 МБ).
