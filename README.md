# Discord Translation Bot - Quick Start

Full docs by language:
- English: `README.en.md`
- Romanian: `README.ro.md`
- Russian: `README.ru.md`

## 1. Requirements

- Node.js 18+
- Discord bot token
- OpenAI API key

## 2. Initialize CLI config

From repo root:

```bash
cp .trans.env.example .trans.env
```

## 3. Set keys and core values (CLI)

You can set everything directly from CLI (no manual export needed):

```bash
./trans set discord-token YOUR_DISCORD_BOT_TOKEN
./trans set openai-key YOUR_OPENAI_API_KEY
./trans set channel YOUR_CHANNEL_ID
./trans set users 653582557711040513,938846694286704680
./trans set lang-in ro
./trans set lang-out en
```

Notes:
- `openai-key` writes `OPENAI_API_KEY` into `.trans.env`.
- `discord-token` writes `DISCORD_BOT_TOKEN` into `.trans.env`.
- Use `./trans show` to verify loaded values (masked).

## 4. Start / Stop / Restart

```bash
./trans start
./trans status
./trans stop
./trans restart
./trans logs 100
```

## 4.1 Important runtime notes

- If you run `trans set channel <id>` (or change other routing values), run `trans restart` to apply new config to the running process.
- If `REQUIRE_START_COMMAND=true`, translation stays OFF until you send `start` in the target channel.
- Bot can appear Offline in Discord member list (REST polling mode). Check real state with `trans status` and `trans logs`.

## 5. Global command in system

### Linux

```bash
mkdir -p ~/.local/bin
ln -sf "$(pwd)/trans" ~/.local/bin/trans
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

If you use zsh, replace `.bashrc` with `.zshrc`.

### macOS

```bash
ln -sf "$(pwd)/trans" /usr/local/bin/trans
```

If `/usr/local/bin` needs admin rights:

```bash
sudo ln -sf "$(pwd)/trans" /usr/local/bin/trans
```

### Windows (CMD/PowerShell)

1. Add repo folder to system/user `PATH`.
2. Use command from any terminal:

```bat
trans.cmd start
trans.cmd stop
trans.cmd restart
trans.cmd status
```

## 6. Supported CLI commands

```bash
trans start|stop|restart|status|show|logs
trans set lang-in <code>
trans set lang-out <code>
trans set users <id1,id2,...>
trans set channel <channel_id>
trans set target-user <user_id>
trans set language-pairs <src:dst,src:dst,...|clear>
trans set default-target <code|clear>
trans set user-targets <userId:lang,userId:lang|clear>
trans set openai-key <api_key>
trans set discord-token <bot_token>
```

## 7. Project scope

- Dedicated Discord text translation bot for two people
- Configurable any-language -> any-language routing
- Optimized for private server channels

## 8. Voice Call Bot (real-time call translation)

New script:
- `scripts/discord-voice-translate-bot.mjs`

### 8.1 Install dependencies

```bash
npm install
```

### 8.2 Prepare voice config

```bash
trans voice init
```

Set core values directly from CLI:

```bash
trans voice set discord-token YOUR_DISCORD_BOT_TOKEN
trans voice set openai-key YOUR_OPENAI_API_KEY
trans voice set channel YOUR_VOICE_CHANNEL_ID
trans voice set control-channel YOUR_TEXT_CHANNEL_ID
trans voice set users 653582557711040513,938846694286704680
trans voice set lang-in ro
trans voice set lang-out en
```

Check current voice config:

```bash
trans voice show
```

### 8.3 Start voice bot

```bash
trans voice start
trans voice status
trans voice logs 80
```

### 8.4 How it works in call

1. Bot joins the configured voice channel.
2. It listens to allowed users.
3. It transcribes speech -> translates -> plays translated voice in the same call.
4. If `REQUIRE_START_COMMAND=true`, send `start` (or `!start`) in control text channel first.

### 8.5 Voice commands in text channel

- `start` / `stop` / `status`
- `!vbot help`
- `!vbot start`
- `!vbot stop`
- `!vbot status`
- `!vbot join`
- `!vbot leave`
- `!vbot set language_pairs ro:en,en:ro`
- `!vbot set default_target_language en`
- `!vbot set user_target_languages 653582557711040513:en,938846694286704680:ro`

### 8.6 Voice commands in CLI (`trans`)

```bash
trans voice init
trans voice start|stop|restart|status|show|logs
trans voice set channel <voice_channel_id>
trans voice set control-channel <text_channel_id|clear>
trans voice set users <id1,id2,...>
trans voice set lang-in <code>
trans voice set lang-out <code>
trans voice set language-pairs <src:dst,src:dst,...|clear>
trans voice set default-target <code|clear>
trans voice set user-targets <userId:lang,userId:lang|clear>
trans voice set openai-key <api_key>
trans voice set discord-token <bot_token>
```

### 8.7 Discord permissions/intents required

- `Message Content Intent` enabled in Discord Developer Portal.
- In server/channel permissions bot needs:
- `View Channels`
- `Send Messages`
- `Read Message History`
- `Connect`
- `Speak`
- `Use Voice Activity`
