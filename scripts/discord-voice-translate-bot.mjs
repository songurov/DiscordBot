#!/usr/bin/env node

import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import prism from "prism-media";

const OPENAI_API_BASE = "https://api.openai.com/v1";

const DISCORD_BOT_TOKEN = requiredEnv("DISCORD_BOT_TOKEN");
const OPENAI_API_KEY = requiredEnv("OPENAI_API_KEY");
const DISCORD_VOICE_CHANNEL_ID = requiredEnv("DISCORD_VOICE_CHANNEL_ID");
const DISCORD_CONTROL_CHANNEL_ID = String(process.env.DISCORD_CONTROL_CHANNEL_ID || "").trim();

let openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
let transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
let ttsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
let ttsVoice = process.env.OPENAI_TTS_VOICE || "alloy";
let ttsFormat = normalizeCommand(process.env.OPENAI_TTS_FORMAT || "opus");

let languagePairs = parseLanguagePairs(process.env.LANGUAGE_PAIRS || "en:ro,ro:en");
let defaultTargetLanguage = normalizeLanguageToken(process.env.DEFAULT_TARGET_LANGUAGE || "");
let userTargetLanguages = parseUserTargetLanguages(process.env.DISCORD_USER_TARGET_LANGUAGES);
let allowedUserIds = parseAllowedUserIds(process.env.VOICE_ALLOWED_USER_IDS);
let requireStartCommand = parseBoolean(process.env.REQUIRE_START_COMMAND, false);
let translationEnabled = !requireStartCommand;

let speechSilenceMs = parsePositiveInt(process.env.SPEECH_SILENCE_MS, 1200);
let voiceMinPcmBytes = parsePositiveInt(process.env.VOICE_MIN_PCM_BYTES, 96000);
let voiceMaxPcmBytes = parsePositiveInt(process.env.VOICE_MAX_PCM_BYTES, 9600000);
let textFeedbackEnabled = parseBoolean(process.env.VOICE_TEXT_FEEDBACK, false);

let startCommands = parseCommandList(process.env.START_COMMANDS || "start,/start,!start");
let stopCommands = parseCommandList(process.env.STOP_COMMANDS || "stop,/stop,!stop");
let statusCommands = parseCommandList(process.env.STATUS_COMMANDS || "status,/status,!status");
const BOT_COMMAND_PREFIX = normalizeCommand(process.env.BOT_COMMAND_PREFIX || "!vbot");

const audioPlayer = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Pause,
  },
});

const playbackQueue = [];
const activeSpeakers = new Set();

let client = null;
let voiceConnection = null;
let isPlaying = false;

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
  "6) Keep names, numbers and meaning intact.",
].join(" ");

audioPlayer.on(AudioPlayerStatus.Idle, () => {
  isPlaying = false;
  playNext();
});

audioPlayer.on("error", (error) => {
  console.error(`[discord-voice-bot] audio player error: ${error.message}`);
  isPlaying = false;
  playNext();
});

main().catch((error) => {
  console.error(`[discord-voice-bot] fatal: ${error.message}`);
  process.exit(1);
});

async function main() {
  ensureTtsFormat(ttsFormat);

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", async () => {
    console.log(
      `[discord-voice-bot] connected as ${client.user?.username} (${client.user?.id}), voice_channel=${DISCORD_VOICE_CHANNEL_ID}`,
    );
    console.log(
      `[discord-voice-bot] routing default_target=${defaultTargetLanguage || "-"}, language_pairs=${languagePairsToCsv(languagePairs) || "-"}, user_targets=${userTargetsToCsv(userTargetLanguages) || "-"}`,
    );
    if (allowedUserIds.size > 0) {
      console.log(
        `[discord-voice-bot] strict-user-mode enabled, allowed_users=${Array.from(allowedUserIds).join(",")}`,
      );
    }
    if (requireStartCommand) {
      console.log(
        `[discord-voice-bot] start-command mode enabled, active=false, commands=${Array.from(startCommands).join(",")}`,
      );
    }

    await connectVoiceChannel();
  });

  client.on("messageCreate", (message) => {
    void handleMessageCommand(message).catch((error) => {
      console.error(`[discord-voice-bot] command error: ${error.message}`);
    });
  });

  client.on("error", (error) => {
    console.error(`[discord-voice-bot] client error: ${error.message}`);
  });

  await client.login(DISCORD_BOT_TOKEN);
}

async function connectVoiceChannel() {
  const channel = await client.channels.fetch(DISCORD_VOICE_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error("DISCORD_VOICE_CHANNEL_ID must point to a guild voice channel");
  }

  voiceConnection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  voiceConnection.on("error", (error) => {
    console.error(`[discord-voice-bot] voice connection error: ${error.message}`);
  });

  voiceConnection.on(VoiceConnectionStatus.Disconnected, () => {
    console.warn("[discord-voice-bot] voice disconnected");
  });

  await entersState(voiceConnection, VoiceConnectionStatus.Ready, 30000);
  voiceConnection.subscribe(audioPlayer);

  const receiver = voiceConnection.receiver;
  receiver.speaking.on("start", (userId) => {
    void handleUserSpeaking(receiver, userId).catch((error) => {
      console.error(`[discord-voice-bot] receive error: ${error.message}`);
    });
  });

  console.log(`[discord-voice-bot] joined voice channel ${channel.name} (${channel.id})`);
}

async function handleMessageCommand(message) {
  if (!message || message.author?.bot) return;
  if (!message.content || !message.content.trim()) return;

  if (DISCORD_CONTROL_CHANNEL_ID && message.channelId !== DISCORD_CONTROL_CHANNEL_ID) return;

  const text = message.content.trim();
  const normalized = normalizeCommand(text);
  const isControlUser = allowedUserIds.size === 0 || allowedUserIds.has(message.author.id);

  if (normalized.startsWith(`${BOT_COMMAND_PREFIX} `) || normalized === BOT_COMMAND_PREFIX) {
    if (!isControlUser) return;
    await handlePrefixedCommand(normalized.slice(BOT_COMMAND_PREFIX.length).trim(), message.channelId);
    return;
  }

  if (!isControlUser) return;

  if (startCommands.has(normalized)) {
    translationEnabled = true;
    await sendControlMessage(message.channelId, "Voice translation started.");
    return;
  }

  if (stopCommands.has(normalized)) {
    translationEnabled = false;
    await sendControlMessage(message.channelId, "Voice translation stopped.");
    return;
  }

  if (statusCommands.has(normalized)) {
    await sendControlMessage(message.channelId, renderStatus());
  }
}

async function handlePrefixedCommand(rawArgs, channelId) {
  const args = rawArgs.split(/\s+/).filter(Boolean);
  const action = normalizeCommand(args[0] || "help");

  if (action === "help") {
    await sendControlMessage(
      channelId,
      `Commands: ${BOT_COMMAND_PREFIX} help | ${BOT_COMMAND_PREFIX} start | ${BOT_COMMAND_PREFIX} stop | ${BOT_COMMAND_PREFIX} status | ${BOT_COMMAND_PREFIX} join | ${BOT_COMMAND_PREFIX} leave | ${BOT_COMMAND_PREFIX} set <key> <value>`,
    );
    return;
  }

  if (action === "start") {
    translationEnabled = true;
    await sendControlMessage(channelId, "Voice translation started.");
    return;
  }

  if (action === "stop") {
    translationEnabled = false;
    await sendControlMessage(channelId, "Voice translation stopped.");
    return;
  }

  if (action === "status") {
    await sendControlMessage(channelId, renderStatus());
    return;
  }

  if (action === "join") {
    await connectVoiceChannel();
    await sendControlMessage(channelId, "Joined voice channel.");
    return;
  }

  if (action === "leave") {
    if (voiceConnection) {
      voiceConnection.destroy();
      voiceConnection = null;
    }
    await sendControlMessage(channelId, "Left voice channel.");
    return;
  }

  if (action === "set") {
    const key = normalizeCommand(args[1] || "");
    const value = args.slice(2).join(" ").trim();
    if (!key || !value) {
      await sendControlMessage(
        channelId,
        `Usage: ${BOT_COMMAND_PREFIX} set <key> <value>. Example: ${BOT_COMMAND_PREFIX} set language_pairs ro:en,en:ro`,
      );
      return;
    }

    const result = applyRuntimeSetting(key, value);
    if (!result.ok) {
      await sendControlMessage(channelId, `Invalid setting: ${result.error}`);
      return;
    }

    await sendControlMessage(channelId, `Updated ${key} = ${result.value}`);
    return;
  }

  await sendControlMessage(channelId, `Unknown command. Use ${BOT_COMMAND_PREFIX} help`);
}

function renderStatus() {
  return [
    `voice_translation=${translationEnabled ? "ON" : "OFF"}`,
    `voice_channel=${DISCORD_VOICE_CHANNEL_ID}`,
    `queue=${playbackQueue.length}`,
    `model=${openAiModel}`,
    `transcribe_model=${transcribeModel}`,
    `tts_model=${ttsModel}`,
    `tts_voice=${ttsVoice}`,
    `tts_format=${ttsFormat}`,
    `silence_ms=${speechSilenceMs}`,
    `language_pairs=${languagePairsToCsv(languagePairs) || "-"}`,
    `default_target=${defaultTargetLanguage || "-"}`,
    `user_targets=${userTargetsToCsv(userTargetLanguages) || "-"}`,
  ].join(" | ");
}

function applyRuntimeSetting(key, value) {
  try {
    switch (key) {
      case "language_pairs":
        languagePairs = parseLanguagePairsStrict(value, true);
        return { ok: true, value: languagePairsToCsv(languagePairs) || "-" };
      case "default_target_language":
        defaultTargetLanguage = parseLanguageTokenStrict(value, true);
        return { ok: true, value: defaultTargetLanguage || "-" };
      case "user_target_languages":
        userTargetLanguages = parseUserTargetLanguagesStrict(value, true);
        return { ok: true, value: userTargetsToCsv(userTargetLanguages) || "-" };
      case "tts_voice":
        ttsVoice = value.trim();
        return { ok: true, value: ttsVoice };
      case "tts_model":
        ttsModel = value.trim();
        return { ok: true, value: ttsModel };
      case "transcribe_model":
        transcribeModel = value.trim();
        return { ok: true, value: transcribeModel };
      case "silence_ms":
        speechSilenceMs = parsePositiveIntStrict(value);
        return { ok: true, value: String(speechSilenceMs) };
      case "voice_min_pcm_bytes":
        voiceMinPcmBytes = parsePositiveIntStrict(value);
        return { ok: true, value: String(voiceMinPcmBytes) };
      default:
        return {
          ok: false,
          error:
            "key not supported. Use: language_pairs, default_target_language, user_target_languages, tts_voice, tts_model, transcribe_model, silence_ms, voice_min_pcm_bytes",
        };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function sendControlMessage(channelId, text) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    content: String(text || "").slice(0, 1900),
    allowedMentions: {
      parse: [],
    },
  });
}

async function handleUserSpeaking(receiver, userId) {
  if (!translationEnabled) return;
  if (!client.user) return;
  if (userId === client.user.id) return;
  if (allowedUserIds.size > 0 && !allowedUserIds.has(userId)) return;
  if (activeSpeakers.has(userId)) return;

  activeSpeakers.add(userId);

  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: speechSilenceMs,
    },
  });

  const decoder = new prism.opus.Decoder({
    frameSize: 960,
    channels: 2,
    rate: 48000,
  });

  const pcmChunks = [];
  let totalBytes = 0;
  let tooLarge = false;
  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    activeSpeakers.delete(userId);

    if (tooLarge) {
      console.warn(`[discord-voice-bot] ignored long speech chunk for user ${userId}`);
      return;
    }

    if (totalBytes < voiceMinPcmBytes) return;

    const pcmBuffer = Buffer.concat(pcmChunks);
    await processUtterance(userId, pcmBuffer);
  };

  decoder.on("data", (chunk) => {
    if (tooLarge) return;
    pcmChunks.push(chunk);
    totalBytes += chunk.length;

    if (totalBytes > voiceMaxPcmBytes) {
      tooLarge = true;
      opusStream.destroy();
      decoder.destroy();
    }
  });

  decoder.once("end", () => {
    void finalize().catch((error) => {
      console.error(`[discord-voice-bot] finalize error: ${error.message}`);
    });
  });

  decoder.once("close", () => {
    void finalize().catch((error) => {
      console.error(`[discord-voice-bot] finalize error: ${error.message}`);
    });
  });

  decoder.once("error", (error) => {
    console.error(`[discord-voice-bot] decoder error: ${error.message}`);
    void finalize().catch(() => {});
  });

  opusStream.once("error", (error) => {
    console.error(`[discord-voice-bot] opus stream error: ${error.message}`);
    void finalize().catch(() => {});
  });

  opusStream.pipe(decoder);
}

async function processUtterance(userId, pcmBuffer) {
  try {
    const wavBuffer = pcm16leToWav(pcmBuffer, 48000, 2, 16);
    const transcription = await transcribeAudio(wavBuffer);
    const inputText = String(transcription.text || "").trim();

    if (!inputText) return;

    const forcedTargetLanguage = resolveForcedTargetLanguage(userId);
    const translated = await translateText(inputText, forcedTargetLanguage);

    if (!translated.should_reply || !translated.translated_text) return;

    const speechBuffer = await synthesizeSpeech(translated.translated_text);
    enqueueSpeech(speechBuffer, {
      userId,
      detectedLanguage: translated.detected_language,
      targetLanguage: translated.target_language,
      text: translated.translated_text,
    });

    if (textFeedbackEnabled && DISCORD_CONTROL_CHANNEL_ID) {
      const label = `[${translated.detected_language}->${translated.target_language}]`;
      await sendControlMessage(DISCORD_CONTROL_CHANNEL_ID, `${label} ${translated.translated_text}`);
    }
  } catch (error) {
    console.error(`[discord-voice-bot] processing error: ${error.message}`);
  }
}

function enqueueSpeech(buffer, meta) {
  playbackQueue.push({ buffer, meta });
  playNext();
}

function playNext() {
  if (isPlaying) return;
  if (!voiceConnection) return;
  if (playbackQueue.length === 0) return;

  const item = playbackQueue.shift();
  const stream = Readable.from(item.buffer);
  const inputType = ttsFormat === "opus" ? StreamType.OggOpus : StreamType.Arbitrary;

  const resource = createAudioResource(stream, { inputType });
  isPlaying = true;
  audioPlayer.play(resource);
}

async function transcribeAudio(wavBuffer) {
  const form = new FormData();
  form.append("file", new Blob([wavBuffer], { type: "audio/wav" }), `voice-${Date.now()}.wav`);
  form.append("model", transcribeModel);

  const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${text}`);
  }

  return (await response.json()) || { text: "" };
}

async function translateText(text, forcedTargetLanguage) {
  const response = await openAiJsonRequest("POST", "/chat/completions", {
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

async function synthesizeSpeech(text) {
  const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ttsModel,
      voice: ttsVoice,
      response_format: ttsFormat,
      input: String(text || "").slice(0, 3900),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI speech failed (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function openAiJsonRequest(method, path, body) {
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

function resolveForcedTargetLanguage(userId) {
  const perUserTarget = userTargetLanguages.get(userId);
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

function isDiscordId(value) {
  return /^\d{10,25}$/.test(String(value || ""));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[discord-voice-bot] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function ensureTtsFormat(value) {
  const supported = new Set(["opus", "mp3", "wav", "aac", "flac", "pcm"]);
  if (!supported.has(value)) {
    throw new Error(`OPENAI_TTS_FORMAT invalid: ${value}. Supported: ${Array.from(supported).join(",")}`);
  }
  if (value !== "opus") {
    console.warn(
      `[discord-voice-bot] OPENAI_TTS_FORMAT=${value}. For best Discord playback compatibility use opus.`,
    );
  }
}

function pcm16leToWav(pcmBuffer, sampleRate, channels, bitDepth) {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}
