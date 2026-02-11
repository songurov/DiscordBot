# Discord Translation Bot (EN <-> RO) - Для общения двух людей

Основной скрипт: `scripts/discord-translate-bot.mjs`

Этот бот сделан для текстового общения между двумя людьми:
- сообщение на румынском -> ответ на английском
- сообщение на английском -> ответ на румынском

Важно:
- Бот переводит только текстовые сообщения, не голосовые звонки.
- Бот должен быть добавлен на сервер/в канал, где нужна перевод.
- Для приватного сценария на двоих используйте приватный канал сервера (рекомендуется).

## 1. Требования

- Node.js 18+
- Токен Discord-бота
- Активный OpenAI API key

## 2. Настройка Discord Developer (пошагово)

Официальный портал:
- `https://discord.com/developers/applications`

### 2.1 Создать приложение

1. Откройте URL выше.
2. Нажмите `New Application`.
3. Укажите имя (пример: `Transale`).

### 2.2 Создать бота

1. Откройте ваше приложение и перейдите во вкладку `Bot`.
2. Нажмите `Add Bot`.
3. В секции `Token` нажмите `Reset Token` и `Copy`.
4. Это значение используйте как `DISCORD_BOT_TOKEN`.

### 2.3 Включить обязательный intent

Во вкладке `Bot` включите:
- `Message Content Intent` = ON

Без этого intent бот не сможет читать текст сообщений.

### 2.4 Сгенерировать ссылку приглашения бота

1. Перейдите `OAuth2` -> `URL Generator`.
2. В `Scopes` отметьте:
- `bot`
3. В `Bot Permissions` минимум отметьте:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. Если нужно удалять исходные сообщения, дополнительно:
- `Manage Messages`
5. Откройте сгенерированную ссылку и добавьте бота на ваш сервер.

Примечания:
- `Client Secret` этому боту не нужен.
- Redirect URI для данного сценария не требуется.

## 3. Настройка Discord-сервера для 2 людей

1. Создайте приватный текстовый канал (например: `#boom-text-comunication`).
2. Добавьте только:
- вас
- второго человека
- бота
3. Проверьте права бота в канале:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (только если включено удаление)

Если бот есть на сервере, но не работает в канале, обычно проблема в правах канала.

## 4. Как получить ID (канал + пользователь)

1. Discord -> `User Settings` -> `Advanced` -> включите `Developer Mode`.
2. Channel ID: правый клик по каналу -> `Copy Channel ID`.
3. User ID: правый клик по пользователю -> `Copy User ID`.

Пример (ваш сценарий):
- ваш user ID: `653582557711040513`
- второй user ID: `938846694286704680`
- пример channel ID: `1471169419605708938`

## 5. Как получить OpenAI API key

Ключи:
- `https://platform.openai.com/api-keys`

Биллинг/квота:
- `https://platform.openai.com/settings/organization/billing`

Если видите `insufficient_quota`, ключ может быть валидным, но квота/биллинг не активны.

## 6. Переменные окружения

### 6.1 Обязательные

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- один из параметров:
- `DISCORD_CHANNEL_ID` (режим канала сервера)
- `DISCORD_TARGET_USER_ID` (режим DM с ботом)

### 6.2 Опциональные

- `OPENAI_MODEL` (по умолчанию: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (по умолчанию: `2500`)
- `POLL_LIMIT` (по умолчанию: `50`)
- `DISCORD_ALLOWED_USER_IDS` (ID через запятую)
- `BOT_COMMAND_PREFIX` (по умолчанию: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `DELETE_ORIGINAL_RO_TO_EN` (`true`/`false`)
- `DELETE_ORIGINAL_USER_IDS` (кто может включать удаление исходного RO->EN)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (по умолчанию: `start,/start,!start`)
- `STOP_COMMANDS` (по умолчанию: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (по умолчанию: `status,/status,!status`)

## 7. Рекомендуемый `.env.bot` для 2 людей

Создайте `.env.bot` в корне проекта:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY

# Режим канала сервера (рекомендуется)
DISCORD_CHANNEL_ID=1471169419605708938

# Ограничение только на 2 пользователей
DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Поведение
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true
DELETE_ORIGINAL_RO_TO_EN=false
# Опционально: удалять только ваши сообщения на RO->EN
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

## 9. Команды в чате (без постоянного экспорта в терминале)

Простые команды:
- `start`
- `stop`
- `status`

Расширенные команды (префикс по умолчанию `!bot`):
- `!bot help`
- `!bot params`
- `!bot start`
- `!bot stop`
- `!bot status`
- `!bot set openai_model gpt-4.1-mini`
- `!bot set poll_interval_ms 2000`
- `!bot set poll_limit 50`
- `!bot set reply_with_quote true`
- `!bot set delete_original_ro_to_en true`
- `!bot set delete_original_user_ids 653582557711040513`
- `!bot set allowed_user_ids 653582557711040513,938846694286704680`
- `!bot set require_start_command true`
- `!bot set start_commands start,/start,!start`
- `!bot set stop_commands stop,/stop,!stop`
- `!bot set status_commands status,/status,!status`

## 10. Рекомендуемый рабочий поток

1. Запустите бота в терминале.
2. В канале отправьте `start` (если `REQUIRE_START_COMMAND=true`).
3. Общайтесь обычно:
- румынский -> бот отвечает на английском
- английский -> бот отвечает на румынском
4. Для паузы отправьте `stop`.
5. Для проверки настроек отправьте `!bot params`.

## 11. Диагностика проблем

### 11.1 `[discord-translate-bot] missing required env var: DISCORD_BOT_TOKEN`

Причина: переменная не установлена в текущем shell.
Решение:

```bash
set -a
source .env.bot
set +a
```

### 11.2 Discord `403 Missing Access`

Причина:
- у бота нет доступа к `DISCORD_CHANNEL_ID`
- неверный channel ID

Решение:
- проверьте channel ID
- добавьте бота в приватный канал
- проверьте права канала

### 11.3 OpenAI `429 insufficient_quota`

Причина: нет активной квоты/кредита.
Решение: проверьте биллинг и квоты OpenAI.

### 11.4 Бот онлайн, но не отвечает

Проверьте:
- включен `Message Content Intent`
- оба user ID есть в `DISCORD_ALLOWED_USER_IDS`
- вы отправили `start`, если `REQUIRE_START_COMMAND=true`
- `DISCORD_CHANNEL_ID` совпадает с реальным каналом

## 12. Безопасность (обязательно)

- Не публикуйте токены/API keys в чате, скриншотах и Git.
- Если токен/ключ раскрыт, сразу сделайте ротацию:
- Discord: `Bot` -> `Reset Token`
- OpenAI: отозвать ключ и создать новый

## 13. Scope проекта

Проект оптимизирован для приватной текстовой коммуникации между двумя людьми в Discord-канале с двусторонним переводом EN <-> RO.
