# Discord Translation Bot (EN <-> RO) - dedicat pentru 2 persoane

Script principal: `scripts/discord-translate-bot.mjs`

Acest bot este facut pentru conversatii text intre 2 persoane:
- mesaj in romana -> raspuns in engleza
- mesaj in engleza -> raspuns in romana

Important:
- botul functioneaza pentru text (mesaje), nu pentru voice call/live audio
- botul trebuie sa fie membru in server/canalul unde vrei traducerea
- pentru discutii private intre 2 persoane, recomandat este un canal privat de server (nu DM direct intre utilizatori)

## 1. Cerinte

- Node.js 18+
- Token de bot Discord
- OpenAI API key activ

## 2. Configurare Discord Developer (pas cu pas)

Portal oficial:
- `https://discord.com/developers/applications`

### 2.1 Creeaza aplicatia

1. Intra pe URL-ul de mai sus
2. Click `New Application`
3. Pune un nume (ex: `Transale`)

### 2.2 Creeaza bot user

1. In aplicatia ta, intra la tab `Bot`
2. Click `Add Bot`
3. In sectiunea `Token` -> `Reset Token` / `Copy`
4. Tokenul copiat este valoarea pentru `DISCORD_BOT_TOKEN`

### 2.3 Activeaza intent necesar

In tab `Bot`, activeaza:
- `Message Content Intent` = ON

Fara acest intent, botul nu poate citi continutul mesajelor.

### 2.4 Genereaza URL de invitatie bot

1. Mergi la tab `OAuth2` -> `URL Generator`
2. La `Scopes`, bifeaza:
- `bot`
3. La `Bot Permissions`, bifeaza minim:
- `View Channels`
- `Read Message History`
- `Send Messages`
4. Daca vrei sa poata sterge mesajul original, mai bifeaza:
- `Manage Messages`
5. Deschide `Generated URL` si adauga botul pe serverul tau

Nota:
- `Client Secret` NU este folosit de acest bot.
- Redirect URI nu este necesar pentru acest flow simplu.

## 3. Configurare server Discord pentru 2 persoane

1. Creeaza un canal text privat (ex: `#boom-text-comunication`)
2. In canal adauga doar:
- tu
- persoana a doua
- botul
3. Verifica permisiunile botului in acel canal:
- `View Channel`
- `Read Message History`
- `Send Messages`
- `Manage Messages` (doar daca activezi stergere mesaj original)

Daca botul este invitat pe server dar nu il vezi in canal, cauza este aproape mereu permisiune lipsa pe canal.

## 4. Cum obtii ID-urile (channel + user)

1. Discord -> `User Settings` -> `Advanced` -> activeaza `Developer Mode`
2. Channel ID: click dreapta pe canal -> `Copy Channel ID`
3. User ID: click dreapta pe user -> `Copy User ID`

Exemplu (setup-ul tau):
- user personal: `653582557711040513`
- user partener discutie: `938846694286704680`
- channel exemplu: `1471169419605708938`

## 5. Cum obtii OpenAI API key

URL:
- `https://platform.openai.com/api-keys`

Billing/quota:
- `https://platform.openai.com/settings/organization/billing`

Daca vezi eroarea `insufficient_quota`, cheia poate fi valida, dar fara credit activ.

## 6. Variabile de mediu

### 6.1 Obligatorii

- `DISCORD_BOT_TOKEN` - tokenul botului din Discord Developer Portal
- `OPENAI_API_KEY` - cheia OpenAI
- unul dintre:
- `DISCORD_CHANNEL_ID` (mod server channel)
- `DISCORD_TARGET_USER_ID` (mod DM direct cu botul)

### 6.2 Optionale

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `POLL_INTERVAL_MS` (default: `2500`)
- `POLL_LIMIT` (default: `50`)
- `DISCORD_ALLOWED_USER_IDS` (lista user IDs separate prin virgula)
- `BOT_COMMAND_PREFIX` (default: `!bot`)
- `REPLY_WITH_QUOTE` (`true`/`false`)
- `DELETE_ORIGINAL_RO_TO_EN` (`true`/`false`)
- `DELETE_ORIGINAL_USER_IDS` (cine are voie la auto-delete pe RO->EN)
- `REQUIRE_START_COMMAND` (`true`/`false`)
- `START_COMMANDS` (default: `start,/start,!start`)
- `STOP_COMMANDS` (default: `stop,/stop,!stop`)
- `STATUS_COMMANDS` (default: `status,/status,!status`)

## 7. Config recomandat pentru 2 persoane (fara export manual repetat)

Creeaza fisier local `.env.bot` in radacina proiectului:

```bash
DISCORD_BOT_TOKEN=PASTE_DISCORD_BOT_TOKEN
OPENAI_API_KEY=PASTE_OPENAI_API_KEY

# Mod canal de server (recomandat)
DISCORD_CHANNEL_ID=1471169419605708938

# Restrange procesarea la cei 2 useri
DISCORD_ALLOWED_USER_IDS=653582557711040513,938846694286704680

# Comportament
REQUIRE_START_COMMAND=true
BOT_COMMAND_PREFIX=!bot
REPLY_WITH_QUOTE=true
DELETE_ORIGINAL_RO_TO_EN=false
# optional: daca vrei delete doar pentru userul tau
# DELETE_ORIGINAL_USER_IDS=653582557711040513

OPENAI_MODEL=gpt-4.1-mini
POLL_INTERVAL_MS=2500
POLL_LIMIT=50
```

Ruleaza botul:

```bash
set -a
source .env.bot
set +a
node scripts/discord-translate-bot.mjs
```

## 8. Comenzi in chat (fara terminal)

Botul nu foloseste slash commands Discord native (`/comanda` din API registration).
Botul foloseste comenzi text in canal:

Comenzi simple:
- `start`
- `stop`
- `status`

Comenzi avansate (prefix default `!bot`):
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

## 9. Flux recomandat de utilizare

1. Pornesti botul in terminal
2. In canal scrii `start` (daca ai `REQUIRE_START_COMMAND=true`)
3. Discutia curge normal:
- tu scrii in romana -> bot raspunde in engleza
- cealalta persoana scrie in engleza -> bot raspunde in romana
4. Daca vrei pauza, scrii `stop`
5. Pentru verificare setari, scrii `!bot params`

## 10. Troubleshooting

### 10.1 `[discord-translate-bot] missing required env var: DISCORD_BOT_TOKEN`

Cauza: variabila nu este setata in shell curent.
Solutie:
- verifica `.env.bot`
- ruleaza exact:

```bash
set -a
source .env.bot
set +a
```

### 10.2 Discord `403 Missing Access`

Cauza:
- botul nu are acces la canalul setat in `DISCORD_CHANNEL_ID`
- ID canal gresit

Solutie:
- verifica channel ID
- adauga botul in canalul privat
- verifica permisiuni canal

### 10.3 OpenAI `429 insufficient_quota`

Cauza: fara credit/quota activa pe contul OpenAI.
Solutie:
- verifica billing/quota in OpenAI dashboard

### 10.4 Botul pare online, dar nu raspunde

Verifica:
- `Message Content Intent` activ
- `DISCORD_ALLOWED_USER_IDS` include ambii useri
- ai dat `start` daca `REQUIRE_START_COMMAND=true`
- canalul din `DISCORD_CHANNEL_ID` este exact cel unde scrii

## 11. Securitate (obligatoriu)

- Nu publica tokenuri/API keys in chat, screenshot sau git
- Daca ai expus token/cheie, fa imediat rotate/revoke:
- Discord bot token: `Bot -> Reset Token`
- OpenAI key: sterge cheia expusa si creeaza una noua

## 12. Scope-ul acestui proiect

Acest proiect este optimizat pentru comunicare dedicata intre 2 persoane intr-un canal privat Discord, cu traducere bidirectionala EN <-> RO pentru mesaje text.
