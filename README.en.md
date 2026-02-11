# Discord Translation Bot (EN <-> RO) - Dedicated for Two People

Main script: `scripts/discord-translate-bot.mjs`

This bot is designed for text communication between two people:
- Romanian message -> English reply
- English message -> Romanian reply

Important:
- This bot translates text messages only, not voice calls/live audio.
- The bot must be a member of the server/channel where you want translation.
- For a private two-person workflow, use a private server channel (recommended).

## 1. Requirements

- Node.js 18+
- Discord bot token
- Active OpenAI API key

## 2. Discord Developer Setup (Step by Step)

Official portal:
- `https://discord.com/developers/applications`

### 2.1 Create the application

1. Open the URL above.
2. Click `New Application`.
3. Enter a name (example: `Transale`).

### 2.2 Create the bot user

1. Open your app and go to the `Bot` tab.
2. Click `Add Bot`.
3. In `Token`, click `Reset Token` and `Copy`.
4. Use this value as `DISCORD_BOT_TOKEN`.

### 2.3 Enable required intent

In `Bot` tab, enable:
- `Message Content Intent` = ON

Without this intent, the bot cannot read message content.

### 2.4 Generate bot invite URL

1. Go to `OAuth2` -> `URL Generator`.
2. In `Scopes`, check:
- `bot`
3. In `Bot Permissions`, check at minimum:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. If you want original-message deletion, also check:
- `Manage Messages`
5. Open the generated URL and add the bot to your server.

Notes:
- `Client Secret` is not used by this bot.
- Redirect URI is not required for this setup.

## 3. Discord Server Setup for Two People

1. Create a private text channel (example: `#boom-text-comunication`).
2. Add only:
- You
- The second person
- The bot
3. Ensure bot channel permissions:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (only if deletion is enabled)

If the bot is in the server but not visible/working in the channel, it is usually a channel permission issue.

## 4. How to Get IDs (Channel + User)

1. Discord -> `User Settings` -> `Advanced` -> enable `Developer Mode`.
2. Channel ID: right click channel -> `Copy Channel ID`.
3. User ID: right click user -> `Copy User ID`.

Example IDs (your setup):
- your user ID: `653582557711040513`
- second user ID: `938846694286704680`
- example channel ID: `1471169419605708938`

## 5. How to Get OpenAI API Key

Key management:
- `https://platform.openai.com/api-keys`

Billing/quota:
- `https://platform.openai.com/settings/organization/billing`

If you get `insufficient_quota`, your key may be valid but billing/quota is not active.

## 6. Environment Variables

### 6.1 Required

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- one of:
- `DISCORD_CHANNEL_ID` (server channel mode)
- `DISCORD_TARGET_USER_ID` (DM-with-bot mode)

### 6.2 Optional

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (default: `2500`)
- `POLL_LIMIT` (default: `50`)
- `DISCORD_ALLOWED_USER_IDS` (comma-separated user IDs)
- `BOT_COMMAND_PREFIX` (default: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `DELETE_ORIGINAL_RO_TO_EN` (`true`/`false`)
- `DELETE_ORIGINAL_USER_IDS` (who can trigger RO->EN original delete)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (default: `start,/start,!start`)
- `STOP_COMMANDS` (default: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (default: `status,/status,!status`)

## 7. Recommended `.env.bot` for Two People

Create `.env.bot` in project root:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY

# Server channel mode (recommended)
DISCORD_CHANNEL_ID=1471169419605708938

# Restrict processing to your 2 users
DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Behavior
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true
DELETE_ORIGINAL_RO_TO_EN=false
# Optional: only your own RO messages get deleted
# DELETE_ORIGINAL_USER_IDS=653582557711040513

OPENAI_MODEL=gpt-4.1-mini
POLL_INTERVAL_MS=2500
POLL_LIMIT=50
```

## 8. Start the Bot

```bash
set -a
source .env.bot
set +a
node scripts/discord-translate-bot.mjs
```

## 9. Chat Commands (No Terminal Exports Needed After Start)

Simple commands:
- `start`
- `stop`
- `status`

Advanced commands (default prefix `!bot`):
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

## 10. Recommended Usage Flow

1. Start bot in terminal.
2. In Discord channel, send `start` (if `REQUIRE_START_COMMAND=true`).
3. Talk normally:
- Romanian -> bot replies English
- English -> bot replies Romanian
4. Send `stop` when needed.
5. Send `!bot params` to check active runtime settings.

## 11. Troubleshooting

### 11.1 `[discord-translate-bot] missing required env var: DISCORD_BOT_TOKEN`

Cause: variable not set in current shell.
Fix:

```bash
set -a
source .env.bot
set +a
```

### 11.2 Discord `403 Missing Access`

Cause:
- bot has no access to `DISCORD_CHANNEL_ID`
- wrong channel ID

Fix:
- verify channel ID
- add bot to that private channel
- verify channel permissions

### 11.3 OpenAI `429 insufficient_quota`

Cause: no active credit/quota.
Fix: check OpenAI billing/quota settings.

### 11.4 Bot is online but does not reply

Check:
- `Message Content Intent` enabled
- both users are in `DISCORD_ALLOWED_USER_IDS`
- you sent `start` when `REQUIRE_START_COMMAND=true`
- `DISCORD_CHANNEL_ID` matches the actual channel

## 12. Security (Mandatory)

- Do not publish tokens/API keys in chat, screenshots, or Git.
- If exposed, rotate immediately:
- Discord: `Bot` -> `Reset Token`
- OpenAI: revoke exposed key and create a new one

## 13. Project Scope

This project is optimized for dedicated two-person communication in a private Discord text channel, with bidirectional EN <-> RO translation.
