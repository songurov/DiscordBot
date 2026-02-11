#!/usr/bin/env node

const DISCORD_API_BASE = "https://discord.com/api/v10";
const OPENAI_API_BASE = "https://api.openai.com/v1";

const DISCORD_BOT_TOKEN = requiredEnv("DISCORD_BOT_TOKEN");
const DISCORD_CHANNEL_ID = String(process.env.DISCORD_CHANNEL_ID || "").trim();
const DISCORD_TARGET_USER_ID = String(process.env.DISCORD_TARGET_USER_ID || "").trim();
const OPENAI_API_KEY = requiredEnv("OPENAI_API_KEY");

let openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
let pollIntervalMs = parsePositiveInt(process.env.POLL_INTERVAL_MS, 2500);
let pollLimit = parsePositiveInt(process.env.POLL_LIMIT, 50);
let allowedUserIds = parseAllowedUserIds(process.env.DISCORD_ALLOWED_USER_IDS);
let replyWithQuote = parseBoolean(process.env.REPLY_WITH_QUOTE, false);
let deleteOriginalRoToEn = parseBoolean(process.env.DELETE_ORIGINAL_RO_TO_EN, false);
let deleteOriginalUserIds = parseAllowedUserIds(process.env.DELETE_ORIGINAL_USER_IDS);
let requireStartCommand = parseBoolean(process.env.REQUIRE_START_COMMAND, false);
let startCommands = parseCommandList(process.env.START_COMMANDS || "start,/start,!start");
let stopCommands = parseCommandList(process.env.STOP_COMMANDS || "stop,/stop,!stop");
let statusCommands = parseCommandList(process.env.STATUS_COMMANDS || "status,/status,!status");
const BOT_COMMAND_PREFIX = normalizeCommand(process.env.BOT_COMMAND_PREFIX || "!bot");

let botUserId = null;
let lastSeenMessageId = null;
let activeChannelId = DISCORD_CHANNEL_ID;
let translationEnabled = !requireStartCommand;

const systemPrompt = [
  "You are a strict translation router.",
  "Return ONLY valid JSON (no markdown) with this exact schema:",
  '{"source_language":"en|ro|other","translated_text":"string","should_reply":true|false}',
  "Rules:",
  "1) If input is mostly English, translate to Romanian (source_language=en, should_reply=true).",
  "2) If input is mostly Romanian, rewrite/translate to natural English (source_language=ro, should_reply=true).",
  "3) If language is unclear/other, set source_language=other, should_reply=false, translated_text=\"\".",
  "4) Keep links, names, numbers, and formatting intent.",
  "5) Do not add explanations.",
].join(" ");

async function main() {
  const bot = await discordRequest("GET", "/users/@me");
  botUserId = bot.id;

  if (!activeChannelId) {
    if (!isDiscordId(DISCORD_TARGET_USER_ID)) {
      console.error(
        "[discord-translate-bot] provide DISCORD_CHANNEL_ID or a valid DISCORD_TARGET_USER_ID",
      );
      process.exit(1);
    }
    activeChannelId = await ensureDmChannel(DISCORD_TARGET_USER_ID);
  }

  const latest = await fetchMessagesAfter(null);
  if (latest.length > 0) {
    lastSeenMessageId = latest[0].id;
  }

  console.log(
    `[discord-translate-bot] connected as ${bot.username} (${bot.id}), channel=${activeChannelId}, model=${openAiModel}`,
  );
  if (allowedUserIds.size > 0) {
    console.log(
      `[discord-translate-bot] strict-user-mode enabled, allowed_users=${Array.from(allowedUserIds).join(",")}`,
    );
  }
  if (replyWithQuote) {
    console.log("[discord-translate-bot] reply-with-quote enabled");
  }
  if (deleteOriginalRoToEn) {
    const scope =
      deleteOriginalUserIds.size > 0
        ? Array.from(deleteOriginalUserIds).join(",")
        : "all matched users";
    console.log(`[discord-translate-bot] delete-original enabled for RO->EN, users=${scope}`);
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
  const messages = await fetchMessagesAfter(lastSeenMessageId);
  if (messages.length === 0) return;

  messages.sort((a, b) => compareSnowflakes(a.id, b.id));

  for (const message of messages) {
    if (lastSeenMessageId === null || compareSnowflakes(message.id, lastSeenMessageId) > 0) {
      lastSeenMessageId = message.id;
    }
    await handleMessage(message);
  }
}

async function handleMessage(message) {
  if (!message || message.type !== 0) return;
  if (!message.content || !message.content.trim()) return;
  if (message.author?.bot || message.author?.id === botUserId) return;
  if (allowedUserIds.size > 0 && !allowedUserIds.has(message.author?.id || "")) return;

  const originalText = message.content.trim();
  if (await maybeHandleControlCommand(message, originalText)) return;
  if (!translationEnabled) return;

  const translated = await translateText(originalText);

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
      channel_id: activeChannelId,
    };
  }

  await discordRequest("POST", `/channels/${activeChannelId}/messages`, payload);

  if (shouldDeleteOriginalMessage(message, translated.source_language)) {
    await deleteOriginalMessageSafe(message.id);
  }
}

async function maybeHandleControlCommand(message, text) {
  const command = normalizeCommand(text);
  const isControlUser = allowedUserIds.size === 0 || allowedUserIds.has(message.author?.id || "");

  if (command.startsWith(`${BOT_COMMAND_PREFIX} `) || command === BOT_COMMAND_PREFIX) {
    if (!isControlUser) return true;
    await handleBotPrefixedCommand(command.slice(BOT_COMMAND_PREFIX.length).trim());
    return true;
  }

  if (!isControlUser) return false;

  if (startCommands.has(command)) {
    translationEnabled = true;
    await sendControlMessage("Translation started.");
    return true;
  }
  if (stopCommands.has(command)) {
    translationEnabled = false;
    await sendControlMessage("Translation stopped.");
    return true;
  }
  if (statusCommands.has(command)) {
    await sendControlMessage(
      `Translation status: ${translationEnabled ? "ON" : "OFF"}.`,
    );
    return true;
  }

  return false;
}

async function handleBotPrefixedCommand(rawArgs) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const action = normalizeCommand(args[0] || "help");

  if (action === "help") {
    await sendControlMessage(
      `Commands: ${BOT_COMMAND_PREFIX} help | ${BOT_COMMAND_PREFIX} params | ${BOT_COMMAND_PREFIX} start | ${BOT_COMMAND_PREFIX} stop | ${BOT_COMMAND_PREFIX} status | ${BOT_COMMAND_PREFIX} set <key> <value>`,
    );
    return;
  }

  if (action === "start") {
    translationEnabled = true;
    await sendControlMessage("Translation started.");
    return;
  }

  if (action === "stop") {
    translationEnabled = false;
    await sendControlMessage("Translation stopped.");
    return;
  }

  if (action === "status" || action === "params") {
    await sendControlMessage(renderConfigStatus());
    return;
  }

  if (action === "set") {
    const key = normalizeCommand(args[1] || "");
    const value = args.slice(2).join(" ").trim();
    if (!key || !value) {
      await sendControlMessage(
        `Usage: ${BOT_COMMAND_PREFIX} set <key> <value>. Example: ${BOT_COMMAND_PREFIX} set reply_with_quote true`,
      );
      return;
    }
    const result = applyRuntimeSetting(key, value);
    if (!result.ok) {
      await sendControlMessage(`Invalid setting: ${result.error}`);
      return;
    }
    await sendControlMessage(`Updated ${key} = ${result.value}`);
    return;
  }

  await sendControlMessage(`Unknown command. Use ${BOT_COMMAND_PREFIX} help`);
}

async function sendControlMessage(text) {
  await discordRequest("POST", `/channels/${activeChannelId}/messages`, {
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
    `reply_with_quote=${replyWithQuote}`,
    `delete_original_ro_to_en=${deleteOriginalRoToEn}`,
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
      case "reply_with_quote":
        replyWithQuote = parseBooleanStrict(value);
        return { ok: true, value: String(replyWithQuote) };
      case "delete_original_ro_to_en":
        deleteOriginalRoToEn = parseBooleanStrict(value);
        return { ok: true, value: String(deleteOriginalRoToEn) };
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
            "key not supported. Use: openai_model, poll_interval_ms, poll_limit, reply_with_quote, delete_original_ro_to_en, require_start_command, allowed_user_ids, delete_original_user_ids, start_commands, stop_commands, status_commands",
        };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function translateText(text) {
  const response = await openAiRequest("POST", "/chat/completions", {
    model: openAiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
  });

  const content = response?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonPayload(content);

  const sourceLanguage = normalizeSourceLanguage(parsed.source_language);
  const translatedText =
    typeof parsed.translated_text === "string" ? parsed.translated_text.trim() : "";
  const shouldReply = Boolean(parsed.should_reply) && (sourceLanguage === "en" || sourceLanguage === "ro");

  return {
    source_language: sourceLanguage,
    translated_text: translatedText,
    should_reply: shouldReply,
  };
}

function parseJsonPayload(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { source_language: "other", translated_text: "", should_reply: false };
  }

  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    return { source_language: "other", translated_text: "", should_reply: false };
  }
}

function normalizeSourceLanguage(value) {
  if (value === "en") return "en";
  if (value === "ro") return "ro";
  return "other";
}

async function fetchMessagesAfter(afterId) {
  const query = new URLSearchParams({ limit: String(pollLimit) });
  if (afterId) query.set("after", afterId);
  const path = `/channels/${activeChannelId}/messages?${query.toString()}`;
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

async function deleteOriginalMessageSafe(messageId) {
  try {
    await discordRequest("DELETE", `/channels/${activeChannelId}/messages/${messageId}`);
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

function parseCommandList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((v) => normalizeCommand(v))
      .filter(Boolean),
  );
}

function normalizeCommand(value) {
  return String(value || "").trim().toLowerCase();
}

function setToCsv(set) {
  return Array.from(set || []).join(",");
}

function shouldDeleteOriginalMessage(message, sourceLanguage) {
  if (!deleteOriginalRoToEn) return false;
  if (sourceLanguage !== "ro") return false;
  const authorId = message?.author?.id || "";
  if (deleteOriginalUserIds.size === 0) return true;
  return deleteOriginalUserIds.has(authorId);
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
