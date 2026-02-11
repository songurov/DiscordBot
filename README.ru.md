# Discord Translation Bot (Любой язык -> Любой язык) - Для общения двух людей

Основной скрипт: `scripts/discord-translate-bot.mjs`

Бот сделан для текстовой коммуникации двух людей в Discord.
Теперь поддерживается перевод между любыми языками, а не только EN <-> RO.

Важно:
- Только текстовые сообщения (без voice-call/live audio).
- Бот должен быть добавлен в сервер/канал, где нужен перевод.
- Рекомендуемый сценарий: приватный канал сервера с 2 пользователями + бот.

## 1. Требования

- Node.js 18+
- Discord bot token
- Активный OpenAI API key

## 2. Настройка Discord Developer (пошагово)

Официальный портал:
- `https://discord.com/developers/applications`

### 2.1 Создать приложение

1. Откройте портал.
2. Нажмите `New Application`.
3. Укажите имя приложения.

### 2.2 Создать bot user

1. Откройте вкладку `Bot`.
2. Нажмите `Add Bot`.
3. В секции `Token` нажмите `Reset Token` + `Copy`.
4. Это значение используйте как `DISCORD_BOT_TOKEN`.

### 2.3 Включить обязательный intent

Во вкладке `Bot` включите:
- `Message Content Intent` = ON

### 2.4 Сгенерировать ссылку приглашения

1. Перейдите `OAuth2` -> `URL Generator`.
2. В `Scopes` отметьте:
- `bot`
3. В `Bot Permissions` минимум:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. Для удаления исходных сообщений дополнительно:
- `Manage Messages`
5. Откройте сгенерированную ссылку и добавьте бота на сервер.

Примечания:
- `Client Secret` этому боту не нужен.
- Redirect URI в этом сценарии не требуется.

## 3. Настройка сервера для 2 людей

1. Создайте приватный текстовый канал (пример: `#boom-text-comunication`).
2. Добавьте только:
- вас
- второго человека
- бота
3. Проверьте права бота в канале:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (если используете delete)

## 4. Как получить ID

1. Discord -> `User Settings` -> `Advanced` -> включите `Developer Mode`.
2. Channel ID: правый клик по каналу -> `Copy Channel ID`.
3. User ID: правый клик по пользователю -> `Copy User ID`.

Примеры (ваш setup):
- ваш user ID: `653582557711040513`
- второй user ID: `938846694286704680`
- пример channel ID: `1471169419605708938`

## 5. OpenAI API key

- Keys: `https://platform.openai.com/api-keys`
- Billing/quota: `https://platform.openai.com/settings/organization/billing`

Если появляется `insufficient_quota`, ключ может быть валидным, но без активной квоты.

## 6. Переменные окружения

### 6.1 Обязательные

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- один из параметров:
- `DISCORD_CHANNEL_ID` (режим канала сервера)
- `DISCORD_TARGET_USER_ID` (режим DM с ботом)

### 6.2 Опциональные (маршрутизация языков)

- `LANGUAGE_PAIRS` (по умолчанию: `en:ro,ro:en`)
- `DEFAULT_TARGET_LANGUAGE` (глобальный целевой язык)
- `DISCORD_USER_TARGET_LANGUAGES` (карта целевого языка по user)

Приоритет маршрутизации:
1. `DISCORD_USER_TARGET_LANGUAGES`
2. `DEFAULT_TARGET_LANGUAGE`
3. `LANGUAGE_PAIRS` по определенному исходному языку

Если подходящий маршрут не найден, бот не отвечает.

### 6.3 Опциональные (поведение)

- `OPENAI_MODEL` (по умолчанию: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (по умолчанию: `2500`)
- `POLL_LIMIT` (по умолчанию: `50`)
- `DISCORD_ALLOWED_USER_IDS` (ID через запятую)
- `BOT_COMMAND_PREFIX` (по умолчанию: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (по умолчанию: `start,/start,!start`)
- `STOP_COMMANDS` (по умолчанию: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (по умолчанию: `status,/status,!status`)

Управление удалением:
- `DELETE_ORIGINAL_ON_TRANSLATION` (`true`/`false`)
- `DELETE_ORIGINAL_SOURCE_LANGUAGES` (исходные языки через запятую)
- `DELETE_ORIGINAL_USER_IDS` (кто может запускать delete)
- Старый alias поддерживается: `DELETE_ORIGINAL_RO_TO_EN`

## 7. Рекомендуемый `.env.bot` для 2 людей

Создайте `.env.bot` в корне проекта:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY
DISCORD_CHANNEL_ID=1471169419605708938

DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Маршрутизация языков
LANGUAGE_PAIRS=ro:en,en:ro,ru:en,en:ru
# Опционально: глобальный целевой язык (если задан, пары игнорируются)
# DEFAULT_TARGET_LANGUAGE=en
# Опционально: целевой язык по user (наивысший приоритет)
# DISCORD_USER_TARGET_LANGUAGES=653582557711040513:en,938846694286704680:ro

# Поведение
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true

# Опциональное удаление
DELETE_ORIGINAL_ON_TRANSLATION=false
# DELETE_ORIGINAL_SOURCE_LANGUAGES=ro
# DELETE_ORIGINAL_USER_IDS=653582557711040513

OPENAI_MODEL=gpt-4.1-mini
POLL_INTERVAL_MS=2500
POLL_LIMIT=50
```

## 8. Запуск бота

```bash
set -a
source .env.bot
set +a
node scripts/discord-translate-bot.mjs
```

## 9. Команды в чате

Базовые:
- `start`
- `stop`
- `status`

Расширенные (`!bot` по умолчанию):
- `!bot help`
- `!bot params`
- `!bot start`
- `!bot stop`
- `!bot status`

Runtime настройка языков:
- `!bot set language_pairs ro:en,en:ro,ru:en,en:ru`
- `!bot set default_target_language en`
- `!bot set user_target_languages 653582557711040513:en,938846694286704680:ro`

Сброс runtime значений:
- `!bot set default_target_language clear`
- `!bot set language_pairs clear`
- `!bot set user_target_languages clear`

Другие runtime настройки:
- `!bot set openai_model gpt-4.1-mini`
- `!bot set poll_interval_ms 2000`
- `!bot set poll_limit 50`
- `!bot set reply_with_quote true`
- `!bot set delete_original_on_translation true`
- `!bot set delete_original_source_languages ro,ru`
- `!bot set delete_original_user_ids 653582557711040513`
- `!bot set allowed_user_ids 653582557711040513,938846694286704680`
- `!bot set require_start_command true`

## 10. Troubleshooting

### 10.1 `missing required env var`

Причина: обязательная переменная не загружена в текущий shell.

Решение:

```bash
set -a
source .env.bot
set +a
```

### 10.2 Discord `403 Missing Access`

Причина:
- у бота нет доступа к каналу
- неверный channel ID

Решение:
- проверьте channel ID
- добавьте бота в канал
- проверьте права на канал

### 10.3 OpenAI `429 insufficient_quota`

Причина: нет активной квоты/кредита.

Решение:
- проверьте billing/quota OpenAI

### 10.4 Бот онлайн, но не отвечает

Проверьте:
- `Message Content Intent` включен
- корректные user ID в `DISCORD_ALLOWED_USER_IDS`
- если `REQUIRE_START_COMMAND=true`, отправлена команда `start`
- маршрутизация настроена (`language_pairs`, `default_target_language` или `user_target_languages`)

## 11. Безопасность

- Не публикуйте токены/API keys в чатах, скриншотах и Git.
- При утечке сразу выполните ротацию:
- Discord token: `Bot` -> `Reset Token`
- OpenAI key: revoke + создать новый

## 12. Scope проекта

Проект оптимизирован для приватной коммуникации двух людей в Discord text channel, с настраиваемым переводом из любого языка в любой язык.

## 13. CLI `trans` (Linux, macOS, Windows)

В репозитории есть cross-platform CLI engine:
- `trans.mjs`

Лаунчеры:
- Linux/macOS: `trans`
- Windows CMD/PowerShell: `trans.cmd` (также `trans.ps1`)

Создайте локальный конфиг:
- `cp .trans.env.example .trans.env`
- заполните `.trans.env` реальными ключами

Локальный запуск:
- Linux/macOS: `./trans start`
- Linux/macOS: `./trans stop`
- Linux/macOS: `./trans restart`
- Linux/macOS: `./trans status`
- Windows: `trans.cmd start`
- Windows: `trans.cmd stop`
- Windows: `trans.cmd restart`
- Windows: `trans.cmd status`

Быстрая настройка:
- `./trans set lang-in ro` (Windows: `trans.cmd set lang-in ro`)
- `./trans set lang-out en` (Windows: `trans.cmd set lang-out en`)
- `./trans set users 653582557711040513,938846694286704680`

Глобальная команда:
- Linux:
- `mkdir -p ~/.local/bin && ln -sf "$(pwd)/trans" ~/.local/bin/trans`
- добавьте в shell profile: `export PATH="$HOME/.local/bin:$PATH"`
- macOS:
- `ln -sf "$(pwd)/trans" /usr/local/bin/trans`
- Windows:
- добавьте папку репозитория в `PATH`
- после этого запускайте `trans.cmd start` из любого терминала

После настройки PATH на Linux/macOS можно использовать `trans start`, `trans stop`, `trans restart` напрямую.
