# Discord Translation Bot (EN <-> RO)

Script path: `scripts/discord-translate-bot.mjs`

## What it does

- If a message is English, bot replies in Romanian.
- If a message is Romanian, bot replies in English.
- Works in server channel mode (`DISCORD_CHANNEL_ID`) or private DM mode (`DISCORD_TARGET_USER_ID`).
- Optional runtime chat commands in channel: `!bot help`, `!bot start`, `!bot stop`, `!bot status`, `!bot set ...`.

## Requirements

- Node.js 18+
- Discord bot token
- OpenAI API key

## Required environment variables

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- One of:
  - `DISCORD_CHANNEL_ID`
  - `DISCORD_TARGET_USER_ID`

## Optional environment variables

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (default: `2500`)
- `POLL_LIMIT` (default: `50`)
- `DISCORD_ALLOWED_USER_IDS`
- `BOT_COMMAND_PREFIX` (default: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `DELETE_ORIGINAL_RO_TO_EN` (`true`/`false`)
- `DELETE_ORIGINAL_USER_IDS`
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS`
- `STOP_COMMANDS`
- `STATUS_COMMANDS`

## Run (channel mode)

```bash
DISCORD_BOT_TOKEN=... \
OPENAI_API_KEY=... \
DISCORD_CHANNEL_ID=... \
DISCORD_ALLOWED_USER_IDS="YOUR_USER_ID,OTHER_USER_ID" \
node scripts/discord-translate-bot.mjs
```

## Run (DM mode)

```bash
DISCORD_BOT_TOKEN=... \
OPENAI_API_KEY=... \
DISCORD_TARGET_USER_ID=... \
DISCORD_ALLOWED_USER_IDS="YOUR_USER_ID,OTHER_USER_ID" \
node scripts/discord-translate-bot.mjs
```

## Notes

- For deleting original messages, the bot needs `Manage Messages` permission.
- Rotate/revoke keys immediately if exposed.
