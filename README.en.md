# Discord Translation Bot (Any Language -> Any Language) - Dedicated for Two People

Main script: `scripts/discord-translate-bot.mjs`

This bot is designed for text communication between two people on Discord.
It can now translate between any languages, not only EN <-> RO.

Important:
- Text messages only (no voice-call/live audio translation).
- Bot must be a member of the server/channel where translation happens.
- Recommended setup: private server text channel with exactly 2 users + bot.

## 1. Requirements

- Node.js 18+
- Discord bot token
- Active OpenAI API key

## 2. Discord Developer Setup (Step by Step)

Official portal:
- `https://discord.com/developers/applications`

### 2.1 Create application

1. Open the portal.
2. Click `New Application`.
3. Enter app name.

### 2.2 Create bot user

1. Open `Bot` tab.
2. Click `Add Bot`.
3. In `Token`, click `Reset Token` + `Copy`.
4. Use this value as `DISCORD_BOT_TOKEN`.

### 2.3 Enable required intent

In `Bot` tab, enable:
- `Message Content Intent` = ON

### 2.4 Generate invite URL

1. Open `OAuth2` -> `URL Generator`.
2. In `Scopes`, check:
- `bot`
3. In `Bot Permissions`, check minimum:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. If you want original-message deletion, also check:
- `Manage Messages`
5. Open generated URL and add bot to your server.

Notes:
- `Client Secret` is not used by this bot.
- Redirect URI is not required for this setup.

## 3. Server Setup for Two People

1. Create a private text channel (example: `#boom-text-comunication`).
2. Add only:
- You
- Second person
- Bot
3. Ensure bot permissions in that channel:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (only if deletion enabled)

## 4. How to Get IDs

1. Discord -> `User Settings` -> `Advanced` -> enable `Developer Mode`.
2. Channel ID: right click channel -> `Copy Channel ID`.
3. User ID: right click user -> `Copy User ID`.

Example IDs (your setup):
- your user ID: `653582557711040513`
- second user ID: `938846694286704680`
- channel example: `1471169419605708938`

## 5. OpenAI API Key

- Keys: `https://platform.openai.com/api-keys`
- Billing/quota: `https://platform.openai.com/settings/organization/billing`

If you see `insufficient_quota`, key may be valid but quota is not active.

## 6. Environment Variables

### 6.1 Required

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- one of:
- `DISCORD_CHANNEL_IDS` (multi-channel server mode)
- `DISCORD_CHANNEL_ID` (server channel mode)
- `DISCORD_TARGET_USER_ID` (DM-with-bot mode)

### 6.2 Optional (core routing)

- `LANGUAGE_PAIRS` (default: `en:ro,ro:en`)
- `DEFAULT_TARGET_LANGUAGE` (optional global forced target)
- `DISCORD_USER_TARGET_LANGUAGES` (per-user target language map)

Routing priority:
1. Per-user target (`DISCORD_USER_TARGET_LANGUAGES`)
2. `DEFAULT_TARGET_LANGUAGE`
3. `LANGUAGE_PAIRS` based on detected source language

If no route matches, bot does not reply.

### 6.3 Optional (behavior)

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (default: `2500`)
- `POLL_LIMIT` (default: `50`)
- `DISCORD_ALLOWED_USER_IDS` (comma-separated user IDs)
- `BOT_COMMAND_PREFIX` (default: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (default: `start,/start,!start`)
- `STOP_COMMANDS` (default: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (default: `status,/status,!status`)

Deletion controls:
- `DELETE_ORIGINAL_ON_TRANSLATION` (`true`/`false`)
- `DELETE_ORIGINAL_SOURCE_LANGUAGES` (comma-separated source languages)
- `DELETE_ORIGINAL_USER_IDS` (who can trigger deletion)
- Legacy alias still supported: `DELETE_ORIGINAL_RO_TO_EN`

## 7. Recommended `.env.bot` for Two People

Create `.env.bot` in project root:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY
# DISCORD_CHANNEL_IDS=1471169419605708938,1471169419605708940
DISCORD_CHANNEL_ID=1471169419605708938

DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Routing options
LANGUAGE_PAIRS=ro:en,en:ro,ru:en,en:ru
# Optional global forced target (if set, pairs are ignored)
# DEFAULT_TARGET_LANGUAGE=en
# Optional per-user target language (highest priority)
# DISCORD_USER_TARGET_LANGUAGES=653582557711040513:en,938846694286704680:ro

# Behavior
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true

# Optional deletion
DELETE_ORIGINAL_ON_TRANSLATION=false
# DELETE_ORIGINAL_SOURCE_LANGUAGES=ro
# DELETE_ORIGINAL_USER_IDS=653582557711040513

OPENAI_MODEL=gpt-4.1-mini
POLL_INTERVAL_MS=2500
POLL_LIMIT=50
```

## 8. Start Bot

```bash
set -a
source .env.bot
set +a
node scripts/discord-translate-bot.mjs
```

## 9. Chat Commands

Basic:
- `start`
- `stop`
- `status`

Advanced (`!bot` by default):
- `!bot help`
- `!bot params`
- `!bot start`
- `!bot stop`
- `!bot status`

Runtime language routing:
- `!bot set language_pairs ro:en,en:ro,ru:en,en:ru`
- `!bot set default_target_language en`
- `!bot set user_target_languages 653582557711040513:en,938846694286704680:ro`

Clear runtime routing values:
- `!bot set default_target_language clear`
- `!bot set language_pairs clear`
- `!bot set user_target_languages clear`

Other runtime settings:
- `!bot set openai_model gpt-4.1-mini`
- `!bot set poll_interval_ms 2000`
- `!bot set poll_limit 50`
- `!bot set channel_ids 1471169419605708938,1471169419605708940`
- `!bot set reply_with_quote true`
- `!bot set delete_original_on_translation true`
- `!bot set delete_original_source_languages ro,ru`
- `!bot set delete_original_user_ids 653582557711040513`
- `!bot set allowed_user_ids 653582557711040513,938846694286704680`
- `!bot set require_start_command true`

## 10. Troubleshooting

### 10.1 `missing required env var`

Cause: required variable not loaded in current shell.

Fix:

```bash
set -a
source .env.bot
set +a
```

### 10.2 Discord `403 Missing Access`

Cause:
- bot has no access to target channel
- wrong channel ID

Fix:
- verify channel ID
- add bot to channel
- verify channel permissions

### 10.3 OpenAI `429 insufficient_quota`

Cause: no active credit/quota.

Fix:
- check OpenAI billing/quota

### 10.4 Bot online but no replies

Check:
- `Message Content Intent` is ON
- user IDs are correct in `DISCORD_ALLOWED_USER_IDS`
- if `REQUIRE_START_COMMAND=true`, you sent `start`
- routing is configured (`language_pairs`, `default_target_language`, or `user_target_languages`)
- after `trans set channel <id>` / `trans set channels <id1,id2,...>` (or route changes), run `trans restart` so the running process loads new config
- if bot appears Offline in Discord member list, verify with `trans status` and `trans logs` (REST polling mode may not show online presence)

## 11. Security

- Never post tokens/API keys in chat/screenshots/git.
- If exposed, rotate immediately:
- Discord token: `Bot` -> `Reset Token`
- OpenAI key: revoke and recreate

## 12. Project Scope

This project is optimized for dedicated two-person communication in a private Discord text channel, with configurable any-language-to-any-language translation.

## 13. `trans` CLI (Linux, macOS, Windows)

The repository includes a cross-platform CLI engine:
- `trans.mjs`

Launchers:
- Linux/macOS: `trans`
- Windows CMD/PowerShell: `trans.cmd` (also `trans.ps1`)

Create local config:
- `cp .trans.env.example .trans.env`
- edit `.trans.env` with real keys

Run locally:
- Linux/macOS: `./trans start`
- Linux/macOS: `./trans stop`
- Linux/macOS: `./trans restart`
- Linux/macOS: `./trans status`
- Windows: `trans.cmd start`
- Windows: `trans.cmd stop`
- Windows: `trans.cmd restart`
- Windows: `trans.cmd status`

Quick config updates:
- `./trans set lang-in ro` (Windows: `trans.cmd set lang-in ro`)
- `./trans set lang-out en` (Windows: `trans.cmd set lang-out en`)
- `./trans set users 653582557711040513,938846694286704680`
- `./trans set channels 1471169419605708938,1471169419605708940`

Global command setup:
- Linux:
- `mkdir -p ~/.local/bin && ln -sf "$(pwd)/trans" ~/.local/bin/trans`
- add to shell profile: `export PATH="$HOME/.local/bin:$PATH"`
- macOS:
- `ln -sf "$(pwd)/trans" /usr/local/bin/trans`
- Windows:
- add repo folder to `PATH`
- then run `trans.cmd start` from any terminal

After PATH setup you can use `trans start`, `trans stop`, `trans restart` directly on Linux/macOS.
