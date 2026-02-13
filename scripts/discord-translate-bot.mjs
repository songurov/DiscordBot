#!/usr/bin/env node

const DISCORD_API_BASE = "https://discord.com/api/v10";
const OPENAI_API_BASE = "https://api.openai.com/v1";

const DISCORD_BOT_TOKEN = requiredEnv("DISCORD_BOT_TOKEN");
const DISCORD_CHANNEL_ID = String(process.env.DISCORD_CHANNEL_ID || "").trim();
const DISCORD_CHANNEL_IDS = String(process.env.DISCORD_CHANNEL_IDS || "").trim();
const DISCORD_TARGET_USER_ID = String(process.env.DISCORD_TARGET_USER_ID || "").trim();
const OPENAI_API_KEY = requiredEnv("OPENAI_API_KEY");

let openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
let pollIntervalMs = parsePositiveInt(process.env.POLL_INTERVAL_MS, 2500);
let pollLimit = parsePositiveInt(process.env.POLL_LIMIT, 50);
let allowedUserIds = parseAllowedUserIds(process.env.DISCORD_ALLOWED_USER_IDS);
let replyWithQuote = parseBoolean(process.env.REPLY_WITH_QUOTE, false);

const legacyDeleteFlag = parseBoolean(process.env.DELETE_ORIGINAL_RO_TO_EN, false);
let deleteOriginalOnTranslation = parseBoolean(
  process.env.DELETE_ORIGINAL_ON_TRANSLATION,
  legacyDeleteFlag,
);
let deleteOriginalUserIds = parseAllowedUserIds(process.env.DELETE_ORIGINAL_USER_IDS);
let deleteOriginalSourceLanguages = parseLanguageList(
  process.env.DELETE_ORIGINAL_SOURCE_LANGUAGES || (legacyDeleteFlag ? "ro" : ""),
);

let languagePairs = parseLanguagePairs(process.env.LANGUAGE_PAIRS || "en:ro,ro:en");
let defaultTargetLanguage = normalizeLanguageToken(process.env.DEFAULT_TARGET_LANGUAGE || "");
let userTargetLanguages = parseUserTargetLanguages(process.env.DISCORD_USER_TARGET_LANGUAGES);

let requireStartCommand = parseBoolean(process.env.REQUIRE_START_COMMAND, false);
let startCommands = parseCommandList(process.env.START_COMMANDS || "start,/start,!start");
let stopCommands = parseCommandList(process.env.STOP_COMMANDS || "stop,/stop,!stop");
let statusCommands = parseCommandList(process.env.STATUS_COMMANDS || "status,/status,!status");
const BOT_COMMAND_PREFIX = normalizeCommand(process.env.BOT_COMMAND_PREFIX || "!bot");

let botUserId = null;
let monitoredChannelIds = [];
const channelLastSeenMessageIds = new Map();
let controlChannelId = null;
let translationEnabled = !requireStartCommand;

const systemPrompt = [
  "You are a strict translation router.",
  "Return ONLY valid JSON (no markdown) with this exact schema:",
  '{"detected_language":"string","target_language":"string","translated_text":"string","should_reply":true|false}',
  "Rules:",
  "1) Detect input language and return a concise lowercase language token (for example: en, ro, ru, fr, de, es, pt-br).",
  "2) Read routing_config from user message JSON. Priority: forced_target_language first; if empty then use language_pairs[detected_language].",
  '3) If target language cannot be resolved, set should_reply=false and translated_text="".',
  '4) If detected_language equals target_language, set should_reply=false and translated_text="".',
  "5) If should_reply=true, translate naturally into target_language.",
  "6) Keep links, names, numbers, and formatting intent.",
].join(" ");

async function main() {
  const bot = await discordRequest("GET", "/users/@me");
  botUserId = bot.id;

  if (DISCORD_CHANNEL_IDS) {
    setMonitoredChannels(parseDiscordIdListStrict(DISCORD_CHANNEL_IDS));
  } else if (DISCORD_CHANNEL_ID) {
    setMonitoredChannels([DISCORD_CHANNEL_ID]);
  } else {
    if (!isDiscordId(DISCORD_TARGET_USER_ID)) {
      console.error(
        "[discord-translate-bot] provide DISCORD_CHANNEL_ID, DISCORD_CHANNEL_IDS, or a valid DISCORD_TARGET_USER_ID",
      );
      process.exit(1);
    }
    const dmChannelId = await ensureDmChannel(DISCORD_TARGET_USER_ID);
    setMonitoredChannels([dmChannelId]);
  }

  for (const channelId of monitoredChannelIds) {
    const latest = await fetchMessagesAfter(channelId, null);
    if (latest.length > 0) {
      channelLastSeenMessageIds.set(channelId, latest[0].id);
    }
  }

  console.log(
    `[discord-translate-bot] connected as ${bot.username} (${bot.id}), channels=${channelIdsToCsv(monitoredChannelIds)}, model=${openAiModel}`,
  );
  console.log(
    `[discord-translate-bot] routing default_target=${defaultTargetLanguage || "-"}, language_pairs=${languagePairsToCsv(languagePairs) || "-"}, user_targets=${userTargetsToCsv(userTargetLanguages) || "-"}`,
  );

  if (allowedUserIds.size > 0) {
    console.log(
      `[discord-translate-bot] strict-user-mode enabled, allowed_users=${Array.from(allowedUserIds).join(",")}`,
    );
  }
  if (replyWithQuote) {
    console.log("[discord-translate-bot] reply-with-quote enabled");
  }
  if (deleteOriginalOnTranslation) {
    const userScope =
      deleteOriginalUserIds.size > 0
        ? Array.from(deleteOriginalUserIds).join(",")
        : "all matched users";
    const langScope =
      deleteOriginalSourceLanguages.size > 0
        ? Array.from(deleteOriginalSourceLanguages).join(",")
        : "all source languages";
    console.log(
      `[discord-translate-bot] delete-original enabled, users=${userScope}, source_languages=${langScope}`,
    );
  }
  if (requireStartCommand) {
    console.log(
      `[discord-translate-bot] start-command mode enabled, active=false, commands=${Array.from(startCommands).join(",")}`,
    );
  }

  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      console.error(`[discord-translate-bot] poll error: ${error.message}`);
    }
    await sleep(pollIntervalMs);
  }
}

async function pollOnce() {
  for (const channelId of monitoredChannelIds) {
    const messages = await fetchMessagesAfter(channelId, channelLastSeenMessageIds.get(channelId) || null);
    if (messages.length === 0) continue;

    messages.sort((a, b) => compareSnowflakes(a.id, b.id));

    for (const message of messages) {
      const lastSeen = channelLastSeenMessageIds.get(channelId) || null;
      if (lastSeen === null || compareSnowflakes(message.id, lastSeen) > 0) {
        channelLastSeenMessageIds.set(channelId, message.id);
      }
      await handleMessage(message, channelId);
    }
  }
}

async function handleMessage(message, channelId) {
  if (!message || message.type !== 0) return;
  if (!message.content || !message.content.trim()) return;
  if (message.author?.bot || message.author?.id === botUserId) return;
  if (allowedUserIds.size > 0 && !allowedUserIds.has(message.author?.id || "")) return;

  const originalText = message.content.trim();
  if (await maybeHandleControlCommand(message, originalText, channelId)) return;
  if (!translationEnabled) return;

  const forcedTargetLanguage = resolveForcedTargetLanguage(message.author?.id || "");
  const translated = await translateText(originalText, forcedTargetLanguage);

  if (!translated.should_reply) return;
  if (!translated.translated_text) return;

  const output = translated.translated_text.slice(0, 1900);

  const payload = {
    content: output,
    allowed_mentions: {
      parse: [],
      replied_user: false,
    },
  };
  if (replyWithQuote) {
    payload.message_reference = {
      message_id: message.id,
      channel_id: channelId,
    };
  }

  await discordRequest("POST", `/channels/${channelId}/messages`, payload);

  if (shouldDeleteOriginalMessage(message, translated.detected_language)) {
    await deleteOriginalMessageSafe(channelId, message.id);
  }
}

async function maybeHandleControlCommand(message, text, channelId) {
  const command = normalizeCommand(text);
  const isControlUser = allowedUserIds.size === 0 || allowedUserIds.has(message.author?.id || "");

  if (command.startsWith(`${BOT_COMMAND_PREFIX} `) || command === BOT_COMMAND_PREFIX) {
    if (!isControlUser) return true;
    await handleBotPrefixedCommand(command.slice(BOT_COMMAND_PREFIX.length).trim(), channelId);
    return true;
  }

  if (!isControlUser) return false;

  if (startCommands.has(command)) {
    translationEnabled = true;
    await sendControlMessage("Translation started.", channelId);
    return true;
  }
  if (stopCommands.has(command)) {
    translationEnabled = false;
    await sendControlMessage("Translation stopped.", channelId);
    return true;
  }
  if (statusCommands.has(command)) {
    await sendControlMessage(`Translation status: ${translationEnabled ? "ON" : "OFF"}.`, channelId);
    return true;
  }

  return false;
}

async function handleBotPrefixedCommand(rawArgs, channelId) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const action = normalizeCommand(args[0] || "help");

  if (action === "help") {
    await sendControlMessage(
      `Commands: ${BOT_COMMAND_PREFIX} help | ${BOT_COMMAND_PREFIX} params | ${BOT_COMMAND_PREFIX} start | ${BOT_COMMAND_PREFIX} stop | ${BOT_COMMAND_PREFIX} status | ${BOT_COMMAND_PREFIX} set <key> <value>`,
      channelId,
    );
    return;
  }

  if (action === "start") {
    translationEnabled = true;
    await sendControlMessage("Translation started.", channelId);
    return;
  }

  if (action === "stop") {
    translationEnabled = false;
    await sendControlMessage("Translation stopped.", channelId);
    return;
  }

  if (action === "status" || action === "params") {
    await sendControlMessage(renderConfigStatus(), channelId);
    return;
  }

  if (action === "set") {
    const key = normalizeCommand(args[1] || "");
    const value = args.slice(2).join(" ").trim();
    if (!key || !value) {
      await sendControlMessage(
        `Usage: ${BOT_COMMAND_PREFIX} set <key> <value>. Example: ${BOT_COMMAND_PREFIX} set language_pairs ro:en,en:ro`,
        channelId,
      );
      return;
    }
    const result = applyRuntimeSetting(key, value);
    if (!result.ok) {
      await sendControlMessage(`Invalid setting: ${result.error}`, channelId);
      return;
    }
    await sendControlMessage(`Updated ${key} = ${result.value}`, channelId);
    return;
  }

  await sendControlMessage(`Unknown command. Use ${BOT_COMMAND_PREFIX} help`, channelId);
}

async function sendControlMessage(text, channelId = controlChannelId) {
  if (!channelId) return;
  await discordRequest("POST", `/channels/${channelId}/messages`, {
    content: text.slice(0, 1900),
    allowed_mentions: {
      parse: [],
    },
  });
}

function renderConfigStatus() {
  return [
    `Translation: ${translationEnabled ? "ON" : "OFF"}`,
    `model=${openAiModel}`,
    `poll_interval_ms=${pollIntervalMs}`,
    `poll_limit=${pollLimit}`,
    `channel_ids=${channelIdsToCsv(monitoredChannelIds) || "-"}`,
    `default_target_language=${defaultTargetLanguage || "-"}`,
    `language_pairs=${languagePairsToCsv(languagePairs) || "-"}`,
    `user_target_languages=${userTargetsToCsv(userTargetLanguages) || "-"}`,
    `reply_with_quote=${replyWithQuote}`,
    `delete_original_on_translation=${deleteOriginalOnTranslation}`,
    `delete_original_source_languages=${setToCsv(deleteOriginalSourceLanguages) || "-"}`,
    `require_start_command=${requireStartCommand}`,
    `allowed_user_ids=${setToCsv(allowedUserIds) || "-"}`,
    `delete_original_user_ids=${setToCsv(deleteOriginalUserIds) || "-"}`,
    `start_commands=${setToCsv(startCommands)}`,
    `stop_commands=${setToCsv(stopCommands)}`,
    `status_commands=${setToCsv(statusCommands)}`,
  ].join(" | ");
}

function applyRuntimeSetting(key, value) {
  try {
    switch (key) {
      case "openai_model":
        openAiModel = value.trim();
        return { ok: true, value: openAiModel };
      case "poll_interval_ms":
        pollIntervalMs = parsePositiveIntStrict(value);
        return { ok: true, value: String(pollIntervalMs) };
      case "poll_limit":
        pollLimit = parsePositiveIntStrict(value);
        return { ok: true, value: String(pollLimit) };
      case "channel_ids":
        setMonitoredChannels(parseDiscordIdListStrict(value));
        return { ok: true, value: channelIdsToCsv(monitoredChannelIds) || "-" };
      case "default_target_language":
        defaultTargetLanguage = parseLanguageTokenStrict(value, true);
        return { ok: true, value: defaultTargetLanguage || "-" };
      case "language_pairs":
        languagePairs = parseLanguagePairsStrict(value, true);
        return { ok: true, value: languagePairsToCsv(languagePairs) || "-" };
      case "user_target_languages":
        userTargetLanguages = parseUserTargetLanguagesStrict(value, true);
        return { ok: true, value: userTargetsToCsv(userTargetLanguages) || "-" };
      case "reply_with_quote":
        replyWithQuote = parseBooleanStrict(value);
        return { ok: true, value: String(replyWithQuote) };
      case "delete_original_on_translation":
        deleteOriginalOnTranslation = parseBooleanStrict(value);
        return { ok: true, value: String(deleteOriginalOnTranslation) };
      case "delete_original_source_languages":
        deleteOriginalSourceLanguages = parseLanguageListStrict(value, true);
        return { ok: true, value: setToCsv(deleteOriginalSourceLanguages) || "-" };
      case "delete_original_ro_to_en":
        deleteOriginalOnTranslation = parseBooleanStrict(value);
        if (deleteOriginalOnTranslation && deleteOriginalSourceLanguages.size === 0) {
          deleteOriginalSourceLanguages = new Set(["ro"]);
        }
        return { ok: true, value: String(deleteOriginalOnTranslation) };
      case "require_start_command":
        requireStartCommand = parseBooleanStrict(value);
        if (requireStartCommand) translationEnabled = false;
        return { ok: true, value: String(requireStartCommand) };
      case "allowed_user_ids":
        allowedUserIds = parseAllowedUserIds(value);
        return { ok: true, value: setToCsv(allowedUserIds) || "-" };
      case "delete_original_user_ids":
        deleteOriginalUserIds = parseAllowedUserIds(value);
        return { ok: true, value: setToCsv(deleteOriginalUserIds) || "-" };
      case "start_commands":
        startCommands = parseCommandList(value);
        return { ok: true, value: setToCsv(startCommands) };
      case "stop_commands":
        stopCommands = parseCommandList(value);
        return { ok: true, value: setToCsv(stopCommands) };
      case "status_commands":
        statusCommands = parseCommandList(value);
        return { ok: true, value: setToCsv(statusCommands) };
      default:
        return {
          ok: false,
          error:
            "key not supported. Use: openai_model, poll_interval_ms, poll_limit, channel_ids, default_target_language, language_pairs, user_target_languages, reply_with_quote, delete_original_on_translation, delete_original_source_languages, delete_original_ro_to_en, require_start_command, allowed_user_ids, delete_original_user_ids, start_commands, stop_commands, status_commands",
        };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function translateText(text, forcedTargetLanguage) {
  const response = await openAiRequest("POST", "/chat/completions", {
    model: openAiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          routing_config: {
            forced_target_language: forcedTargetLanguage || "",
            language_pairs: Object.fromEntries(languagePairs),
          },
          text,
        }),
      },
    ],
  });

  const content = response?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonPayload(content);

  const detectedLanguage = normalizeDetectedLanguage(parsed.detected_language);
  const targetLanguage = resolveTargetLanguage(detectedLanguage, forcedTargetLanguage);
  const translatedText =
    typeof parsed.translated_text === "string" ? parsed.translated_text.trim() : "";

  const shouldReply =
    Boolean(parsed.should_reply) &&
    Boolean(translatedText) &&
    Boolean(targetLanguage) &&
    detectedLanguage !== "unknown" &&
    detectedLanguage !== targetLanguage;

  return {
    detected_language: detectedLanguage,
    target_language: targetLanguage,
    translated_text: translatedText,
    should_reply: shouldReply,
  };
}

function resolveForcedTargetLanguage(authorId) {
  const perUserTarget = userTargetLanguages.get(authorId);
  if (perUserTarget) return perUserTarget;
  if (defaultTargetLanguage) return defaultTargetLanguage;
  return "";
}

function resolveTargetLanguage(detectedLanguage, forcedTargetLanguage) {
  if (forcedTargetLanguage) return forcedTargetLanguage;
  if (detectedLanguage !== "unknown" && languagePairs.has(detectedLanguage)) {
    return languagePairs.get(detectedLanguage) || "";
  }
  return "";
}

function parseJsonPayload(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return {
      detected_language: "unknown",
      target_language: "",
      translated_text: "",
      should_reply: false,
    };
  }

  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    return {
      detected_language: "unknown",
      target_language: "",
      translated_text: "",
      should_reply: false,
    };
  }
}

function normalizeDetectedLanguage(value) {
  const normalized = normalizeLanguageToken(value);
  if (!normalized) return "unknown";
  return normalized;
}

async function fetchMessagesAfter(channelId, afterId) {
  const query = new URLSearchParams({ limit: String(pollLimit) });
  if (afterId) query.set("after", afterId);
  const path = `/channels/${channelId}/messages?${query.toString()}`;
  const data = await discordRequest("GET", path);
  return Array.isArray(data) ? data : [];
}

async function ensureDmChannel(targetUserId) {
  const channel = await discordRequest("POST", "/users/@me/channels", {
    recipient_id: targetUserId,
  });
  if (!channel?.id) {
    throw new Error("could not resolve DM channel for target user");
  }
  return channel.id;
}

async function deleteOriginalMessageSafe(channelId, messageId) {
  try {
    await discordRequest("DELETE", `/channels/${channelId}/messages/${messageId}`);
  } catch (error) {
    console.warn(`[discord-translate-bot] could not delete original message: ${error.message}`);
  }
}

async function discordRequest(method, path, body, retries = 2) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 429 && retries > 0) {
    const rate = await safeJson(response);
    const waitMs = Math.ceil((Number(rate?.retry_after) || 1) * 1000);
    await sleep(waitMs);
    return discordRequest(method, path, body, retries - 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord API ${method} ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return safeJson(response);
}

async function openAiRequest(method, path, body) {
  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return safeJson(response);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[discord-translate-bot] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveIntStrict(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("value must be a positive integer");
  }
  return parsed;
}

function parseBoolean(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseBooleanStrict(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error("value must be true/false");
}

function parseAllowedUserIds(value) {
  const ids = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const valid = ids.filter((id) => /^\d{10,25}$/.test(id));
  return new Set(valid);
}

function parseDiscordIdListStrict(value) {
  const ids = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("value must contain one or more Discord channel IDs separated by comma");
  }

  for (const id of ids) {
    if (!isDiscordId(id)) {
      throw new Error("invalid Discord channel ID list (use id1,id2,...)");
    }
  }

  return deduplicateDiscordIds(ids);
}

function deduplicateDiscordIds(ids) {
  const unique = [];
  const seen = new Set();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return unique;
}

function parseCommandList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((v) => normalizeCommand(v))
      .filter(Boolean),
  );
}

function parseLanguagePairs(value) {
  const map = new Map();
  const items = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  for (const item of items) {
    const [sourceRaw, targetRaw] = item.split(":", 2).map((v) => String(v || "").trim());
    const source = normalizeLanguageToken(sourceRaw);
    const target = normalizeLanguageToken(targetRaw);
    if (!source || !target || source === target) continue;
    map.set(source, target);
  }

  return map;
}

function parseLanguagePairsStrict(value, allowClear) {
  if (allowClear && isClearValue(value)) return new Map();

  const map = new Map();
  const items = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error("value must contain at least one pair: source:target");
  }

  for (const item of items) {
    const parts = item.split(":", 2);
    if (parts.length !== 2) {
      throw new Error("pair format must be source:target,source:target");
    }
    const source = parseLanguageTokenStrict(parts[0]);
    const target = parseLanguageTokenStrict(parts[1]);
    if (source === target) {
      throw new Error("source and target language must be different");
    }
    map.set(source, target);
  }

  return map;
}

function parseLanguageList(value) {
  const set = new Set();
  const items = String(value || "")
    .split(",")
    .map((v) => normalizeLanguageToken(v))
    .filter(Boolean);

  for (const item of items) {
    set.add(item);
  }

  return set;
}

function parseLanguageListStrict(value, allowClear) {
  if (allowClear && isClearValue(value)) return new Set();
  const items = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error("value must contain one or more languages separated by comma");
  }

  const set = new Set();
  for (const item of items) {
    set.add(parseLanguageTokenStrict(item));
  }

  return set;
}

function parseUserTargetLanguages(value) {
  const map = new Map();
  const items = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  for (const item of items) {
    const [userIdRaw, languageRaw] = item.split(":", 2).map((v) => String(v || "").trim());
    if (!isDiscordId(userIdRaw)) continue;
    const language = normalizeLanguageToken(languageRaw);
    if (!language) continue;
    map.set(userIdRaw, language);
  }

  return map;
}

function parseUserTargetLanguagesStrict(value, allowClear) {
  if (allowClear && isClearValue(value)) return new Map();

  const map = new Map();
  const items = String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error("value must contain one or more entries: userId:language");
  }

  for (const item of items) {
    const parts = item.split(":", 2);
    if (parts.length !== 2) {
      throw new Error("value format must be userId:language,userId:language");
    }

    const userId = String(parts[0] || "").trim();
    const language = parseLanguageTokenStrict(parts[1]);

    if (!isDiscordId(userId)) {
      throw new Error("invalid Discord user id");
    }

    map.set(userId, language);
  }

  return map;
}

function parseLanguageTokenStrict(value, allowClear) {
  if (allowClear && isClearValue(value)) return "";
  const normalized = normalizeLanguageToken(value);
  if (!normalized) {
    throw new Error("language must use letters/numbers/hyphen, example: en, ro, ru, pt-br");
  }
  return normalized;
}

function normalizeLanguageToken(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (!normalized) return "";
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(normalized)) return "";
  return normalized;
}

function normalizeCommand(value) {
  return String(value || "").trim().toLowerCase();
}

function channelIdsToCsv(channelIds) {
  return Array.from(channelIds || []).join(",");
}

function setToCsv(set) {
  return Array.from(set || []).join(",");
}

function languagePairsToCsv(map) {
  return Array.from(map.entries())
    .map(([source, target]) => `${source}:${target}`)
    .join(",");
}

function userTargetsToCsv(map) {
  return Array.from(map.entries())
    .map(([userId, language]) => `${userId}:${language}`)
    .join(",");
}

function isClearValue(value) {
  const normalized = normalizeCommand(value);
  return normalized === "" || normalized === "-" || normalized === "none" || normalized === "clear";
}

function shouldDeleteOriginalMessage(message, sourceLanguage) {
  if (!deleteOriginalOnTranslation) return false;
  if (deleteOriginalSourceLanguages.size > 0 && !deleteOriginalSourceLanguages.has(sourceLanguage)) {
    return false;
  }

  const authorId = message?.author?.id || "";
  if (deleteOriginalUserIds.size === 0) return true;
  return deleteOriginalUserIds.has(authorId);
}

function setMonitoredChannels(channelIds) {
  monitoredChannelIds = deduplicateDiscordIds((channelIds || []).filter((id) => isDiscordId(id)));
  controlChannelId = monitoredChannelIds[0] || null;
  channelLastSeenMessageIds.clear();
  for (const channelId of monitoredChannelIds) {
    channelLastSeenMessageIds.set(channelId, null);
  }
}

function compareSnowflakes(a, b) {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function isDiscordId(value) {
  return /^\d{10,25}$/.test(String(value || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[discord-translate-bot] fatal: ${error.message}`);
  process.exit(1);
});
