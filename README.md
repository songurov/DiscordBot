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
