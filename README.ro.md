# Discord Translation Bot (Orice limba -> Orice limba) - dedicat pentru 2 persoane

Script principal: `scripts/discord-translate-bot.mjs`

Acest bot este facut pentru comunicare text intre 2 persoane pe Discord.
Acum poate traduce intre orice limbi, nu doar EN <-> RO.

Important:
- Traducere doar pentru mesaje text (nu voice call/live audio).
- Botul trebuie sa fie membru in server/canalul unde vrei traducerea.
- Setup recomandat: canal privat de server cu exact 2 useri + bot.

## 1. Cerinte

- Node.js 18+
- Discord bot token
- OpenAI API key activ

## 2. Configurare Discord Developer (pas cu pas)

Portal oficial:
- `https://discord.com/developers/applications`

### 2.1 Creeaza aplicatia

1. Intra pe portal.
2. Click `New Application`.
3. Introdu numele aplicatiei.

### 2.2 Creeaza bot user

1. Intra in tab `Bot`.
2. Click `Add Bot`.
3. In `Token`, apasa `Reset Token` + `Copy`.
4. Aceasta valoare devine `DISCORD_BOT_TOKEN`.

### 2.3 Activeaza intent obligatoriu

In tab `Bot`, activeaza:
- `Message Content Intent` = ON

### 2.4 Genereaza URL de invitare bot

1. Intra la `OAuth2` -> `URL Generator`.
2. La `Scopes`, bifeaza:
- `bot`
3. La `Bot Permissions`, minim:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. Daca vrei stergere mesaj original, bifeaza si:
- `Manage Messages`
5. Deschide URL-ul generat si adauga botul pe server.

Note:
- `Client Secret` nu este folosit de acest bot.
- Redirect URI nu este necesar in acest setup.

## 3. Configurare server pentru 2 persoane

1. Creeaza un canal text privat (ex: `#boom-text-comunication`).
2. Adauga doar:
- tu
- a doua persoana
- botul
3. Verifica permisiuni bot pe canal:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (doar daca folosesti delete)

## 4. Cum obtii ID-urile

1. Discord -> `User Settings` -> `Advanced` -> activeaza `Developer Mode`.
2. Channel ID: click dreapta pe canal -> `Copy Channel ID`.
3. User ID: click dreapta pe user -> `Copy User ID`.

Exemple (setup-ul tau):
- userul tau: `653582557711040513`
- userul 2: `938846694286704680`
- canal exemplu: `1471169419605708938`

## 5. OpenAI API key

- Keys: `https://platform.openai.com/api-keys`
- Billing/quota: `https://platform.openai.com/settings/organization/billing`

Daca vezi `insufficient_quota`, cheia poate fi valida dar fara quota activa.

## 6. Variabile de mediu

### 6.1 Obligatorii

- `DISCORD_BOT_TOKEN`
- `OPENAI_API_KEY`
- una dintre:
- `DISCORD_CHANNEL_IDS` (mod multi-canal server)
- `DISCORD_CHANNEL_ID` (mod canal server)
- `DISCORD_TARGET_USER_ID` (mod DM cu botul)

### 6.2 Optionale (rutare limbi)

- `LANGUAGE_PAIRS` (default: `en:ro,ro:en`)
- `DEFAULT_TARGET_LANGUAGE` (target global fortat, optional)
- `DISCORD_USER_TARGET_LANGUAGES` (mapare per user)

Prioritatea rutarii:
1. mapare per user (`DISCORD_USER_TARGET_LANGUAGES`)
2. `DEFAULT_TARGET_LANGUAGE`
3. `LANGUAGE_PAIRS` pe baza limbii detectate

Daca nu exista ruta valida, botul nu raspunde.

### 6.3 Optionale (comportament)

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (default: `2500`)
- `POLL_LIMIT` (default: `50`)
- `DISCORD_ALLOWED_USER_IDS` (user IDs separate prin virgula)
- `BOT_COMMAND_PREFIX` (default: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (default: `start,/start,!start`)
- `STOP_COMMANDS` (default: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (default: `status,/status,!status`)

Control delete:
- `DELETE_ORIGINAL_ON_TRANSLATION` (`true`/`false`)
- `DELETE_ORIGINAL_SOURCE_LANGUAGES` (limbi sursa, separate prin virgula)
- `DELETE_ORIGINAL_USER_IDS` (ce useri pot declansa delete)
- Alias vechi suportat: `DELETE_ORIGINAL_RO_TO_EN`

## 7. `.env.bot` recomandat pentru 2 persoane

Creeaza `.env.bot` in radacina proiectului:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY
# DISCORD_CHANNEL_IDS=1471169419605708938,1471169419605708940
DISCORD_CHANNEL_ID=1471169419605708938

DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Rutare limbi
LANGUAGE_PAIRS=ro:en,en:ro,ru:en,en:ru
# Optional target global fortat (daca il setezi, pair-urile sunt ignorate)
# DEFAULT_TARGET_LANGUAGE=en
# Optional mapare per user (prioritate maxima)
# DISCORD_USER_TARGET_LANGUAGES=653582557711040513:en,938846694286704680:ro

# Comportament
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true

# Delete optional
DELETE_ORIGINAL_ON_TRANSLATION=false
# DELETE_ORIGINAL_SOURCE_LANGUAGES=ro
# DELETE_ORIGINAL_USER_IDS=653582557711040513

OPENAI_MODEL=gpt-4.1-mini
POLL_INTERVAL_MS=2500
POLL_LIMIT=50
```

## 8. Start bot

```bash
set -a
source .env.bot
set +a
node scripts/discord-translate-bot.mjs
```

## 9. Comenzi in chat

Comenzi de baza:
- `start`
- `stop`
- `status`

Comenzi avansate (`!bot` implicit):
- `!bot help`
- `!bot params`
- `!bot start`
- `!bot stop`
- `!bot status`
- `!bot purge all` (sterge toate mesajele din canalul curent)
- `!bot purge today` / `!bot purge azi` (sterge mesajele de azi)
- `!bot purge yesterday` / `!bot purge ieri` (sterge mesajele de ieri)

Setari runtime pentru limbi:
- `!bot set language_pairs ro:en,en:ro,ru:en,en:ru`
- `!bot set default_target_language en`
- `!bot set user_target_languages 653582557711040513:en,938846694286704680:ro`

Resetare runtime:
- `!bot set default_target_language clear`
- `!bot set language_pairs clear`
- `!bot set user_target_languages clear`

Alte setari runtime:
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

Cauza: variabila necesara nu e incarcata in shell-ul curent.

Fix:

```bash
set -a
source .env.bot
set +a
```

### 10.2 Discord `403 Missing Access`

Cauza:
- botul nu are acces la canal
- channel ID gresit

Fix:
- verifica channel ID
- adauga botul in canal
- verifica permisiunile pe canal

### 10.3 OpenAI `429 insufficient_quota`

Cauza: fara quota/credit activ.

Fix:
- verifica billing/quota in OpenAI

### 10.4 Botul e online dar nu raspunde

Verifica:
- `Message Content Intent` = ON
- user IDs corecte in `DISCORD_ALLOWED_USER_IDS`
- daca `REQUIRE_START_COMMAND=true`, ai trimis `start`
- rutarea limbilor este configurata (`language_pairs`, `default_target_language` sau `user_target_languages`)
- dupa `trans set channel <id>` / `trans set channels <id1,id2,...>` (sau alte schimbari de rutare), ruleaza `trans restart` ca procesul pornit sa incarce noua configuratie
- daca botul apare Offline in lista de membri Discord, verifica starea reala cu `trans status` si `trans logs` (modul REST polling poate sa nu afiseze prezenta online)

## 11. Securitate

- Nu publica tokenuri/API keys in chat, screenshot sau git.
- Daca au fost expuse, fa rotate imediat:
- Discord token: `Bot` -> `Reset Token`
- OpenAI key: revoke + key nou

## 12. Scope proiect

Acest proiect este optimizat pentru comunicare dedicata intre 2 persoane intr-un canal privat Discord, cu traducere configurabila din orice limba in orice limba.

## 13. CLI `trans` (Linux, macOS, Windows)

Repo-ul include un engine CLI cross-platform:
- `trans.mjs`

Launchere:
- Linux/macOS: `trans`
- Windows CMD/PowerShell: `trans.cmd` (si `trans.ps1`)

Creeaza config local:
- `cp .trans.env.example .trans.env`
- editeaza `.trans.env` cu cheile reale

Rulare locala:
- Linux/macOS: `./trans start`
- Linux/macOS: `./trans stop`
- Linux/macOS: `./trans restart`
- Linux/macOS: `./trans status`
- Windows: `trans.cmd start`
- Windows: `trans.cmd stop`
- Windows: `trans.cmd restart`
- Windows: `trans.cmd status`

Actualizare rapida configurare:
- `./trans set lang-in ro` (Windows: `trans.cmd set lang-in ro`)
- `./trans set lang-out en` (Windows: `trans.cmd set lang-out en`)
- `./trans set users 653582557711040513,938846694286704680`
- `./trans set channels 1471169419605708938,1471169419605708940`

Comanda globala:
- Linux:
- `mkdir -p ~/.local/bin && ln -sf "$(pwd)/trans" ~/.local/bin/trans`
- adauga in profil shell: `export PATH="$HOME/.local/bin:$PATH"`
- macOS:
- `ln -sf "$(pwd)/trans" /usr/local/bin/trans`
- alternativa fara sudo (recomandat):
- `mkdir -p ~/.local/bin && ln -sf "$(pwd)/trans" ~/.local/bin/trans`
- adauga in `~/.zshrc`: `export PATH="$HOME/.local/bin:$PATH"`
- Windows:
- adauga folderul repo in `PATH`
- apoi ruleaza `trans.cmd start` din orice terminal

Dupa configurarea PATH, poti folosi direct `trans start`, `trans stop`, `trans restart` pe Linux/macOS.

Autostart macOS (dupa login user):
- `mkdir -p ~/Library/LaunchAgents`
- `cp launchd/com.songurov.discordbot.trans.plist ~/Library/LaunchAgents/com.songurov.discordbot.trans.plist`
- `launchctl bootout gui/$(id -u)/com.songurov.discordbot.trans 2>/dev/null || true`
- `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.songurov.discordbot.trans.plist`
- `launchctl kickstart -k gui/$(id -u)/com.songurov.discordbot.trans`

Autostart macOS (dupa reboot, fara login - system daemon):
- `sudo cp launchd/com.songurov.discordbot.trans.daemon.plist /Library/LaunchDaemons/com.songurov.discordbot.trans.daemon.plist`
- `sudo chown root:wheel /Library/LaunchDaemons/com.songurov.discordbot.trans.daemon.plist`
- `sudo chmod 644 /Library/LaunchDaemons/com.songurov.discordbot.trans.daemon.plist`
- `sudo launchctl bootout system/com.songurov.discordbot.trans.daemon 2>/dev/null || true`
- `sudo launchctl bootstrap system /Library/LaunchDaemons/com.songurov.discordbot.trans.daemon.plist`
- `sudo launchctl kickstart -k system/com.songurov.discordbot.trans.daemon`

Verificare:
- `trans status`

Nota sleep:
- daca Mac-ul intra in sleep, botul nu mai proceseaza mesaje pana la wake; pentru uptime 24/7 real foloseste VPS.

Autostart Linux (systemd user service):
- ruleaza: `./scripts/install-autostart-linux.sh`

Comenzi utile:
- `systemctl --user status discord-trans.service`
- `systemctl --user restart discord-trans.service`
- `systemctl --user stop discord-trans.service`
- `systemctl --user disable discord-trans.service`

Pornire dupa reboot fara login interactiv:
- `sudo loginctl enable-linger $USER`

Autostart Windows (Task Scheduler):
- ruleaza din PowerShell:
- `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart-windows.ps1`

Task name custom:
- `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart-windows.ps1 -TaskName "DiscordTransBot"`

Verificare task:
- `schtasks /Query /TN "DiscordTransBot" /V /FO LIST`
