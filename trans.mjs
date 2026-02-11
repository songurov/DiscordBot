#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const ROOT_DIR = path.dirname(scriptPath);
const CONFIG_FILE = process.env.TRANS_CONFIG_FILE || path.join(ROOT_DIR, ".trans.env");
const CONFIG_EXAMPLE = path.join(ROOT_DIR, ".trans.env.example");
const PID_FILE = process.env.TRANS_PID_FILE || path.join(ROOT_DIR, ".trans.pid");
const LOG_FILE = process.env.TRANS_LOG_FILE || path.join(ROOT_DIR, ".trans.log");
const BOT_SCRIPT = path.join(ROOT_DIR, "scripts", "discord-translate-bot.mjs");
const VOICE_CONFIG_FILE = process.env.VTRANS_CONFIG_FILE || path.join(ROOT_DIR, ".vtrans.env");
const VOICE_CONFIG_EXAMPLE = path.join(ROOT_DIR, ".vtrans.env.example");
const VOICE_PID_FILE = process.env.VTRANS_PID_FILE || path.join(ROOT_DIR, ".vtrans.pid");
const VOICE_LOG_FILE = process.env.VTRANS_LOG_FILE || path.join(ROOT_DIR, ".vtrans.log");
const VOICE_BOT_SCRIPT = path.join(ROOT_DIR, "scripts", "discord-voice-translate-bot.mjs");
const VOICE_TTS_FORMATS = new Set(["opus", "mp3", "wav", "aac", "flac", "pcm"]);

function usage() {
  console.log(`Usage:
  trans start
  trans stop
  trans restart
  trans status
  trans show
  trans logs [lines]

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

Voice mode:
  trans voice init
  trans voice start|stop|restart|status|show|logs [lines]
  trans voice kick|leave
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
  trans voice set model <openai_chat_model>
  trans voice set transcribe-model <openai_stt_model>
  trans voice set tts-model <openai_tts_model>
  trans voice set tts-voice <voice_name>
  trans voice set tts-format <opus|mp3|wav|aac|flac|pcm>
  trans voice set require-start-command <true|false>
  trans voice set silence-ms <number>
  trans voice set min-bytes <number>
  trans voice set max-bytes <number>
  trans voice set text-feedback <true|false>

Notes:
  - Config file: .trans.env (auto-created from .trans.env.example if missing)
  - Voice config file: .vtrans.env (auto-created from .vtrans.env.example if missing)
  - On start, if TRANS_LANG_IN and TRANS_LANG_OUT are set, LANGUAGE_PAIRS is auto-generated.
  - Linux/macOS local run: ./trans start
  - Windows local run: trans.cmd start
`);
}

function info(message) {
  console.log(`[trans] ${message}`);
}

function fail(message) {
  console.error(`[trans] error: ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureConfigFile(options = {}) {
  const { failIfCreated = false } = options;

  if (fs.existsSync(CONFIG_FILE)) {
    return false;
  }

  if (!fs.existsSync(CONFIG_EXAMPLE)) {
    fail(`missing ${CONFIG_FILE} and template ${CONFIG_EXAMPLE}`);
  }

  fs.copyFileSync(CONFIG_EXAMPLE, CONFIG_FILE);
  info(`created ${CONFIG_FILE} from template`);

  if (failIfCreated) {
    fail(`fill real keys in ${CONFIG_FILE}, then run: trans start`);
  }

  return true;
}

function ensureVoiceConfigFile(options = {}) {
  const { failIfCreated = false } = options;

  if (fs.existsSync(VOICE_CONFIG_FILE)) {
    return false;
  }

  if (!fs.existsSync(VOICE_CONFIG_EXAMPLE)) {
    fail(`missing ${VOICE_CONFIG_FILE} and template ${VOICE_CONFIG_EXAMPLE}`);
  }

  fs.copyFileSync(VOICE_CONFIG_EXAMPLE, VOICE_CONFIG_FILE);
  info(`created ${VOICE_CONFIG_FILE} from template`);

  if (failIfCreated) {
    fail(`fill real keys in ${VOICE_CONFIG_FILE}, then run: trans voice start`);
  }

  return true;
}

function parseEnvValue(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";

  const quotedDouble = value.startsWith('"') && value.endsWith('"');
  const quotedSingle = value.startsWith("'") && value.endsWith("'");
  if ((quotedDouble || quotedSingle) && value.length >= 2) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    result[key] = parseEnvValue(rawValue);
  }

  return result;
}

function upsertConfigValue(key, value, filePath = CONFIG_FILE) {
  const normalizedValue = String(value ?? "");
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];

  const regex = new RegExp(`^\\s*(?:export\\s+)?${escapeRegex(key)}\\s*=`);
  let updated = false;

  for (let i = 0; i < lines.length; i += 1) {
    if (regex.test(lines[i])) {
      lines[i] = `${key}=${normalizedValue}`;
      updated = true;
      break;
    }
  }

  if (!updated) {
    lines.push(`${key}=${normalizedValue}`);
  }

  const finalLines = lines.filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ""));
  fs.writeFileSync(filePath, `${finalLines.join("\n")}\n`, "utf8");
}

function readConfig(filePath = CONFIG_FILE) {
  return parseEnvFile(filePath);
}

function readConfigValue(key, filePath = CONFIG_FILE) {
  const cfg = readConfig(filePath);
  return String(cfg[key] ?? "");
}

function normalizeLang(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function validateLang(value) {
  return /^[a-z][a-z0-9-]{1,31}$/.test(value);
}

function validateDiscordId(value) {
  return /^[0-9]{10,25}$/.test(value);
}

function validateUserList(value) {
  return /^[0-9]{10,25}(,[0-9]{10,25})*$/.test(value);
}

function parsePositiveIntStrict(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail("value must be a positive integer");
  }
  return String(parsed);
}

function parseBooleanStrict(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return "true";
  if (["0", "false", "no", "n", "off"].includes(normalized)) return "false";
  fail("value must be true/false");
}

function isClearValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "clear" || normalized === "none" || normalized === "-";
}

function syncLanguagePairsFromInOut(filePath = CONFIG_FILE) {
  const inLang = normalizeLang(readConfigValue("TRANS_LANG_IN", filePath));
  const outLang = normalizeLang(readConfigValue("TRANS_LANG_OUT", filePath));

  if (!inLang || !outLang) return;
  if (!validateLang(inLang)) fail(`invalid TRANS_LANG_IN: ${inLang}`);
  if (!validateLang(outLang)) fail(`invalid TRANS_LANG_OUT: ${outLang}`);
  if (inLang === outLang) fail("TRANS_LANG_IN and TRANS_LANG_OUT must be different");

  upsertConfigValue("TRANS_LANG_IN", inLang, filePath);
  upsertConfigValue("TRANS_LANG_OUT", outLang, filePath);
  upsertConfigValue("LANGUAGE_PAIRS", `${inLang}:${outLang},${outLang}:${inLang}`, filePath);
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const raw = fs.readFileSync(PID_FILE, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return pid;
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function isRunning() {
  const pid = readPid();
  if (!pid) return false;
  return isPidRunning(pid);
}

function clearPidFile() {
  if (fs.existsSync(PID_FILE)) {
    fs.rmSync(PID_FILE);
  }
}

function readVoicePid() {
  if (!fs.existsSync(VOICE_PID_FILE)) return null;
  const raw = fs.readFileSync(VOICE_PID_FILE, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return pid;
}

function isVoiceRunning() {
  const pid = readVoicePid();
  if (!pid) return false;
  return isPidRunning(pid);
}

function clearVoicePidFile() {
  if (fs.existsSync(VOICE_PID_FILE)) {
    fs.rmSync(VOICE_PID_FILE);
  }
}

function maskSecret(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function looksLikePlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized.startsWith("paste_") ||
    normalized.startsWith("your_") ||
    normalized.startsWith("replace_") ||
    normalized === "changeme"
  );
}

function validateStartConfig(config) {
  const botToken = String(config.DISCORD_BOT_TOKEN ?? "").trim();
  const openAiKey = String(config.OPENAI_API_KEY ?? "").trim();
  const channelId = String(config.DISCORD_CHANNEL_ID ?? "").trim();
  const targetUserId = String(config.DISCORD_TARGET_USER_ID ?? "").trim();

  if (!botToken) fail(`DISCORD_BOT_TOKEN is empty in ${CONFIG_FILE}`);
  if (!openAiKey) fail(`OPENAI_API_KEY is empty in ${CONFIG_FILE}`);

  if (looksLikePlaceholder(botToken)) {
    fail(`DISCORD_BOT_TOKEN looks like template value. Set real token in ${CONFIG_FILE}`);
  }
  if (looksLikePlaceholder(openAiKey)) {
    fail(`OPENAI_API_KEY looks like template value. Set real key in ${CONFIG_FILE}`);
  }

  if (!channelId && !targetUserId) {
    fail(`set DISCORD_CHANNEL_ID or DISCORD_TARGET_USER_ID in ${CONFIG_FILE}`);
  }

  if (channelId && !validateDiscordId(channelId)) {
    fail("DISCORD_CHANNEL_ID is not valid");
  }

  if (targetUserId && !validateDiscordId(targetUserId)) {
    fail("DISCORD_TARGET_USER_ID is not valid");
  }
}

function validateVoiceStartConfig(config) {
  const botToken = String(config.DISCORD_BOT_TOKEN ?? "").trim();
  const openAiKey = String(config.OPENAI_API_KEY ?? "").trim();
  const voiceChannelId = String(config.DISCORD_VOICE_CHANNEL_ID ?? "").trim();

  if (!botToken) fail(`DISCORD_BOT_TOKEN is empty in ${VOICE_CONFIG_FILE}`);
  if (!openAiKey) fail(`OPENAI_API_KEY is empty in ${VOICE_CONFIG_FILE}`);

  if (looksLikePlaceholder(botToken)) {
    fail(`DISCORD_BOT_TOKEN looks like template value. Set real token in ${VOICE_CONFIG_FILE}`);
  }
  if (looksLikePlaceholder(openAiKey)) {
    fail(`OPENAI_API_KEY looks like template value. Set real key in ${VOICE_CONFIG_FILE}`);
  }

  if (!voiceChannelId) {
    fail(`set DISCORD_VOICE_CHANNEL_ID in ${VOICE_CONFIG_FILE}`);
  }
  if (!validateDiscordId(voiceChannelId)) {
    fail("DISCORD_VOICE_CHANNEL_ID is not valid");
  }

  const controlChannelId = String(config.DISCORD_CONTROL_CHANNEL_ID ?? "").trim();
  if (controlChannelId && !validateDiscordId(controlChannelId)) {
    fail("DISCORD_CONTROL_CHANNEL_ID is not valid");
  }
}

function buildRuntimeEnv(config) {
  const runtime = { ...process.env, ...config };

  const inLang = normalizeLang(config.TRANS_LANG_IN || runtime.TRANS_LANG_IN || "");
  const outLang = normalizeLang(config.TRANS_LANG_OUT || runtime.TRANS_LANG_OUT || "");
  if (inLang && outLang && inLang !== outLang) {
    runtime.LANGUAGE_PAIRS = `${inLang}:${outLang},${outLang}:${inLang}`;
  }

  return runtime;
}

function tailLogLines(linesCount, logFile = LOG_FILE) {
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, "", "utf8");
    return "";
  }

  const content = fs.readFileSync(logFile, "utf8");
  if (!content) return "";

  const rows = content.split(/\r?\n/);
  if (rows.length > 0 && rows[rows.length - 1] === "") {
    rows.pop();
  }

  return rows.slice(-linesCount).join("\n");
}

async function startCmd() {
  ensureConfigFile({ failIfCreated: true });

  if (isRunning()) {
    info(`already running (pid ${readPid()})`);
    return;
  }

  if (!fs.existsSync(BOT_SCRIPT)) {
    fail(`bot script not found: ${BOT_SCRIPT}`);
  }

  syncLanguagePairsFromInOut();
  const config = readConfig();
  validateStartConfig(config);

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const logFd = fs.openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [BOT_SCRIPT], {
    cwd: ROOT_DIR,
    env: buildRuntimeEnv(config),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  if (!child.pid) {
    fail("failed to start process (missing pid)");
  }

  fs.writeFileSync(PID_FILE, `${child.pid}\n`, "utf8");

  await sleep(1000);

  if (isRunning()) {
    info(`started (pid ${readPid()})`);
    info(`log file: ${LOG_FILE}`);
    return;
  }

  info("failed to start; showing last log lines");
  const tail = tailLogLines(50);
  if (tail) console.log(tail);
  process.exit(1);
}

async function stopCmd() {
  const pid = readPid();
  if (!pid || !isPidRunning(pid)) {
    clearPidFile();
    info("already stopped");
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore and continue waiting check
    }
  }

  for (let i = 0; i < 10; i += 1) {
    await sleep(1000);
    if (!isPidRunning(pid)) {
      clearPidFile();
      info("stopped");
      return;
    }
  }

  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }

    for (let i = 0; i < 3; i += 1) {
      await sleep(500);
      if (!isPidRunning(pid)) {
        clearPidFile();
        info("stopped");
        return;
      }
    }
  }

  fail(`process ${pid} did not stop cleanly; stop manually if needed`);
}

async function restartCmd() {
  await stopCmd();
  await startCmd();
}

function statusCmd() {
  if (isRunning()) {
    info(`running (pid ${readPid()})`);
  } else {
    info("stopped");
  }

  info(`config: ${CONFIG_FILE}`);
  info(`log: ${LOG_FILE}`);
}

function showCmd() {
  ensureConfigFile();
  const cfg = readConfig();

  info(`DISCORD_BOT_TOKEN=${maskSecret(cfg.DISCORD_BOT_TOKEN)}`);
  info(`OPENAI_API_KEY=${maskSecret(cfg.OPENAI_API_KEY)}`);
  info(`DISCORD_CHANNEL_ID=${cfg.DISCORD_CHANNEL_ID || ""}`);
  info(`DISCORD_TARGET_USER_ID=${cfg.DISCORD_TARGET_USER_ID || ""}`);
  info(`DISCORD_ALLOWED_USER_IDS=${cfg.DISCORD_ALLOWED_USER_IDS || ""}`);
  info(`TRANS_LANG_IN=${cfg.TRANS_LANG_IN || ""}`);
  info(`TRANS_LANG_OUT=${cfg.TRANS_LANG_OUT || ""}`);
  info(`LANGUAGE_PAIRS=${cfg.LANGUAGE_PAIRS || ""}`);
  info(`DEFAULT_TARGET_LANGUAGE=${cfg.DEFAULT_TARGET_LANGUAGE || ""}`);
  info(`DISCORD_USER_TARGET_LANGUAGES=${cfg.DISCORD_USER_TARGET_LANGUAGES || ""}`);
}

function logsCmd(linesArg) {
  const raw = String(linesArg || "60").trim();
  if (!/^[0-9]+$/.test(raw)) {
    fail("logs value must be numeric");
  }

  const count = Number.parseInt(raw, 10);
  const tail = tailLogLines(count);
  if (tail) console.log(tail);
}

function setLangInCmd(value, filePath = CONFIG_FILE) {
  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail(`invalid language: ${value}`);

  upsertConfigValue("TRANS_LANG_IN", normalized, filePath);
  syncLanguagePairsFromInOut(filePath);
  info(`updated TRANS_LANG_IN=${normalized}`);
}

function setLangOutCmd(value, filePath = CONFIG_FILE) {
  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail(`invalid language: ${value}`);

  upsertConfigValue("TRANS_LANG_OUT", normalized, filePath);
  syncLanguagePairsFromInOut(filePath);
  info(`updated TRANS_LANG_OUT=${normalized}`);
}

function setUsersCmd(value, filePath = CONFIG_FILE, key = "DISCORD_ALLOWED_USER_IDS") {
  if (!validateUserList(value)) fail("invalid user list format (use id1,id2,...)");
  upsertConfigValue(key, value, filePath);
  info(`updated ${key}`);
}

function setChannelCmd(
  value,
  filePath = CONFIG_FILE,
  channelKey = "DISCORD_CHANNEL_ID",
  clearKey = "DISCORD_TARGET_USER_ID",
) {
  if (!validateDiscordId(value)) fail("invalid channel id");
  upsertConfigValue(channelKey, value, filePath);
  info(`updated ${channelKey}=${value}`);
  if (clearKey) {
    upsertConfigValue(clearKey, "", filePath);
    info(`cleared ${clearKey} (channel mode active)`);
  }
}

function setTargetUserCmd(
  value,
  filePath = CONFIG_FILE,
  targetKey = "DISCORD_TARGET_USER_ID",
  clearKey = "DISCORD_CHANNEL_ID",
) {
  if (!validateDiscordId(value)) fail("invalid user id");
  upsertConfigValue(targetKey, value, filePath);
  upsertConfigValue(clearKey, "", filePath);
  info(`updated ${targetKey}=${value}`);
  info(`cleared ${clearKey} (dm mode active)`);
}

function normalizeLanguagePairs(raw) {
  const items = String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (items.length === 0) {
    fail("language-pairs cannot be empty");
  }

  const normalized = [];

  for (const item of items) {
    const parts = item.split(":");
    if (parts.length !== 2) {
      fail(`invalid pair format: ${item}`);
    }

    const src = normalizeLang(parts[0]);
    const dst = normalizeLang(parts[1]);

    if (!validateLang(src)) fail(`invalid source language in pair: ${item}`);
    if (!validateLang(dst)) fail(`invalid target language in pair: ${item}`);
    if (src === dst) fail(`source and target must be different: ${item}`);

    normalized.push(`${src}:${dst}`);
  }

  return normalized.join(",");
}

function setLanguagePairsCmd(value, filePath = CONFIG_FILE) {
  if (isClearValue(value)) {
    upsertConfigValue("LANGUAGE_PAIRS", "", filePath);
    info("cleared LANGUAGE_PAIRS");
    return;
  }

  const normalized = normalizeLanguagePairs(value);
  upsertConfigValue("LANGUAGE_PAIRS", normalized, filePath);
  info(`updated LANGUAGE_PAIRS=${normalized}`);
}

function setDefaultTargetCmd(value, filePath = CONFIG_FILE) {
  if (isClearValue(value)) {
    upsertConfigValue("DEFAULT_TARGET_LANGUAGE", "", filePath);
    info("cleared DEFAULT_TARGET_LANGUAGE");
    return;
  }

  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail("invalid language code");

  upsertConfigValue("DEFAULT_TARGET_LANGUAGE", normalized, filePath);
  info(`updated DEFAULT_TARGET_LANGUAGE=${normalized}`);
}

function normalizeUserTargets(raw) {
  const items = String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (items.length === 0) {
    fail("user-targets cannot be empty");
  }

  const normalized = [];

  for (const item of items) {
    const parts = item.split(":");
    if (parts.length !== 2) {
      fail(`invalid user-target format: ${item}`);
    }

    const userId = String(parts[0] || "").trim();
    const language = normalizeLang(parts[1]);

    if (!validateDiscordId(userId)) fail(`invalid user id in entry: ${item}`);
    if (!validateLang(language)) fail(`invalid language in entry: ${item}`);

    normalized.push(`${userId}:${language}`);
  }

  return normalized.join(",");
}

function setUserTargetsCmd(value, filePath = CONFIG_FILE) {
  if (isClearValue(value)) {
    upsertConfigValue("DISCORD_USER_TARGET_LANGUAGES", "", filePath);
    info("cleared DISCORD_USER_TARGET_LANGUAGES");
    return;
  }

  const normalized = normalizeUserTargets(value);
  upsertConfigValue("DISCORD_USER_TARGET_LANGUAGES", normalized, filePath);
  info(`updated DISCORD_USER_TARGET_LANGUAGES=${normalized}`);
}

function setOpenAiKeyCmd(value, filePath = CONFIG_FILE) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("openai key cannot be empty");
  upsertConfigValue("OPENAI_API_KEY", normalized, filePath);
  info("updated OPENAI_API_KEY");
}

function setDiscordTokenCmd(value, filePath = CONFIG_FILE) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("discord token cannot be empty");
  upsertConfigValue("DISCORD_BOT_TOKEN", normalized, filePath);
  info("updated DISCORD_BOT_TOKEN");
}

function setCmd(key, value) {
  ensureConfigFile();

  if (!key) fail("missing set key");
  if (!value) fail("missing set value");

  switch (key) {
    case "lang-in":
    case "in":
      setLangInCmd(value);
      return;
    case "lang-out":
    case "out":
      setLangOutCmd(value);
      return;
    case "users":
      setUsersCmd(value);
      return;
    case "channel":
      setChannelCmd(value);
      return;
    case "target-user":
    case "dm-user":
      setTargetUserCmd(value);
      return;
    case "language-pairs":
    case "pairs":
      setLanguagePairsCmd(value);
      return;
    case "default-target":
      setDefaultTargetCmd(value);
      return;
    case "user-targets":
      setUserTargetsCmd(value);
      return;
    case "openai-key":
    case "openai":
    case "openai_api_key":
      setOpenAiKeyCmd(value);
      return;
    case "discord-token":
    case "discord":
    case "bot-token":
    case "discord_bot_token":
      setDiscordTokenCmd(value);
      return;
    default:
      fail(`unknown set key: ${key}`);
  }
}

function setVoiceControlChannelCmd(value) {
  if (isClearValue(value)) {
    upsertConfigValue("DISCORD_CONTROL_CHANNEL_ID", "", VOICE_CONFIG_FILE);
    info("cleared DISCORD_CONTROL_CHANNEL_ID");
    return;
  }

  if (!validateDiscordId(value)) fail("invalid control channel id");
  upsertConfigValue("DISCORD_CONTROL_CHANNEL_ID", value, VOICE_CONFIG_FILE);
  info(`updated DISCORD_CONTROL_CHANNEL_ID=${value}`);
}

function setVoiceModelCmd(value) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("model cannot be empty");
  upsertConfigValue("OPENAI_MODEL", normalized, VOICE_CONFIG_FILE);
  info(`updated OPENAI_MODEL=${normalized}`);
}

function setVoiceTranscribeModelCmd(value) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("transcribe model cannot be empty");
  upsertConfigValue("OPENAI_TRANSCRIBE_MODEL", normalized, VOICE_CONFIG_FILE);
  info(`updated OPENAI_TRANSCRIBE_MODEL=${normalized}`);
}

function setVoiceTtsModelCmd(value) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("tts model cannot be empty");
  upsertConfigValue("OPENAI_TTS_MODEL", normalized, VOICE_CONFIG_FILE);
  info(`updated OPENAI_TTS_MODEL=${normalized}`);
}

function setVoiceTtsVoiceCmd(value) {
  const normalized = String(value || "").trim();
  if (!normalized) fail("tts voice cannot be empty");
  upsertConfigValue("OPENAI_TTS_VOICE", normalized, VOICE_CONFIG_FILE);
  info(`updated OPENAI_TTS_VOICE=${normalized}`);
}

function setVoiceTtsFormatCmd(value) {
  const normalized = normalizeLang(value);
  if (!VOICE_TTS_FORMATS.has(normalized)) {
    fail(`tts format must be one of: ${Array.from(VOICE_TTS_FORMATS).join(",")}`);
  }
  upsertConfigValue("OPENAI_TTS_FORMAT", normalized, VOICE_CONFIG_FILE);
  info(`updated OPENAI_TTS_FORMAT=${normalized}`);
}

function setVoiceRequireStartCmd(value) {
  const normalized = parseBooleanStrict(value);
  upsertConfigValue("REQUIRE_START_COMMAND", normalized, VOICE_CONFIG_FILE);
  info(`updated REQUIRE_START_COMMAND=${normalized}`);
}

function setVoiceSilenceMsCmd(value) {
  const normalized = parsePositiveIntStrict(value);
  upsertConfigValue("SPEECH_SILENCE_MS", normalized, VOICE_CONFIG_FILE);
  info(`updated SPEECH_SILENCE_MS=${normalized}`);
}

function setVoiceMinBytesCmd(value) {
  const normalized = parsePositiveIntStrict(value);
  upsertConfigValue("VOICE_MIN_PCM_BYTES", normalized, VOICE_CONFIG_FILE);
  info(`updated VOICE_MIN_PCM_BYTES=${normalized}`);
}

function setVoiceMaxBytesCmd(value) {
  const normalized = parsePositiveIntStrict(value);
  upsertConfigValue("VOICE_MAX_PCM_BYTES", normalized, VOICE_CONFIG_FILE);
  info(`updated VOICE_MAX_PCM_BYTES=${normalized}`);
}

function setVoiceTextFeedbackCmd(value) {
  const normalized = parseBooleanStrict(value);
  upsertConfigValue("VOICE_TEXT_FEEDBACK", normalized, VOICE_CONFIG_FILE);
  info(`updated VOICE_TEXT_FEEDBACK=${normalized}`);
}

function setVoiceCmd(key, value) {
  ensureVoiceConfigFile();

  if (!key) fail("missing voice set key");
  if (!value) fail("missing voice set value");

  switch (key) {
    case "lang-in":
    case "in":
      setLangInCmd(value, VOICE_CONFIG_FILE);
      return;
    case "lang-out":
    case "out":
      setLangOutCmd(value, VOICE_CONFIG_FILE);
      return;
    case "users":
      setUsersCmd(value, VOICE_CONFIG_FILE, "VOICE_ALLOWED_USER_IDS");
      return;
    case "channel":
      setChannelCmd(value, VOICE_CONFIG_FILE, "DISCORD_VOICE_CHANNEL_ID", "");
      return;
    case "control-channel":
      setVoiceControlChannelCmd(value);
      return;
    case "language-pairs":
    case "pairs":
      setLanguagePairsCmd(value, VOICE_CONFIG_FILE);
      return;
    case "default-target":
      setDefaultTargetCmd(value, VOICE_CONFIG_FILE);
      return;
    case "user-targets":
      setUserTargetsCmd(value, VOICE_CONFIG_FILE);
      return;
    case "openai-key":
    case "openai":
    case "openai_api_key":
      setOpenAiKeyCmd(value, VOICE_CONFIG_FILE);
      return;
    case "discord-token":
    case "discord":
    case "bot-token":
    case "discord_bot_token":
      setDiscordTokenCmd(value, VOICE_CONFIG_FILE);
      return;
    case "model":
    case "openai-model":
    case "chat-model":
      setVoiceModelCmd(value);
      return;
    case "transcribe-model":
    case "stt-model":
      setVoiceTranscribeModelCmd(value);
      return;
    case "tts-model":
      setVoiceTtsModelCmd(value);
      return;
    case "tts-voice":
      setVoiceTtsVoiceCmd(value);
      return;
    case "tts-format":
      setVoiceTtsFormatCmd(value);
      return;
    case "require-start-command":
      setVoiceRequireStartCmd(value);
      return;
    case "silence-ms":
      setVoiceSilenceMsCmd(value);
      return;
    case "min-bytes":
      setVoiceMinBytesCmd(value);
      return;
    case "max-bytes":
      setVoiceMaxBytesCmd(value);
      return;
    case "text-feedback":
      setVoiceTextFeedbackCmd(value);
      return;
    default:
      fail(`unknown voice set key: ${key}`);
  }
}

function initVoiceCmd() {
  const created = ensureVoiceConfigFile();
  if (!created) {
    info(`voice config already exists: ${VOICE_CONFIG_FILE}`);
  }
}

async function startVoiceCmd() {
  ensureVoiceConfigFile({ failIfCreated: true });

  if (isVoiceRunning()) {
    info(`voice already running (pid ${readVoicePid()})`);
    return;
  }

  if (!fs.existsSync(VOICE_BOT_SCRIPT)) {
    fail(`voice bot script not found: ${VOICE_BOT_SCRIPT}`);
  }

  syncLanguagePairsFromInOut(VOICE_CONFIG_FILE);
  const config = readConfig(VOICE_CONFIG_FILE);
  validateVoiceStartConfig(config);

  fs.mkdirSync(path.dirname(VOICE_LOG_FILE), { recursive: true });
  const logFd = fs.openSync(VOICE_LOG_FILE, "a");

  const child = spawn(process.execPath, [VOICE_BOT_SCRIPT], {
    cwd: ROOT_DIR,
    env: buildRuntimeEnv(config),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  if (!child.pid) {
    fail("failed to start voice process (missing pid)");
  }

  fs.writeFileSync(VOICE_PID_FILE, `${child.pid}\n`, "utf8");
  await sleep(1000);

  if (isVoiceRunning()) {
    info(`voice started (pid ${readVoicePid()})`);
    info(`voice log file: ${VOICE_LOG_FILE}`);
    return;
  }

  info("voice failed to start; showing last log lines");
  const tail = tailLogLines(60, VOICE_LOG_FILE);
  if (tail) console.log(tail);
  process.exit(1);
}

async function stopVoiceCmd() {
  const pid = readVoicePid();
  if (!pid || !isPidRunning(pid)) {
    clearVoicePidFile();
    info("voice already stopped");
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore and continue waiting check
    }
  }

  for (let i = 0; i < 10; i += 1) {
    await sleep(1000);
    if (!isPidRunning(pid)) {
      clearVoicePidFile();
      info("voice stopped");
      return;
    }
  }

  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }

    for (let i = 0; i < 3; i += 1) {
      await sleep(500);
      if (!isPidRunning(pid)) {
        clearVoicePidFile();
        info("voice stopped");
        return;
      }
    }
  }

  fail(`voice process ${pid} did not stop cleanly; stop manually if needed`);
}

async function restartVoiceCmd() {
  await stopVoiceCmd();
  await startVoiceCmd();
}

function statusVoiceCmd() {
  if (isVoiceRunning()) {
    info(`voice running (pid ${readVoicePid()})`);
  } else {
    info("voice stopped");
  }

  info(`voice config: ${VOICE_CONFIG_FILE}`);
  info(`voice log: ${VOICE_LOG_FILE}`);
}

function showVoiceCmd() {
  ensureVoiceConfigFile();
  const cfg = readConfig(VOICE_CONFIG_FILE);

  info(`DISCORD_BOT_TOKEN=${maskSecret(cfg.DISCORD_BOT_TOKEN)}`);
  info(`OPENAI_API_KEY=${maskSecret(cfg.OPENAI_API_KEY)}`);
  info(`DISCORD_VOICE_CHANNEL_ID=${cfg.DISCORD_VOICE_CHANNEL_ID || ""}`);
  info(`DISCORD_CONTROL_CHANNEL_ID=${cfg.DISCORD_CONTROL_CHANNEL_ID || ""}`);
  info(`VOICE_ALLOWED_USER_IDS=${cfg.VOICE_ALLOWED_USER_IDS || ""}`);
  info(`TRANS_LANG_IN=${cfg.TRANS_LANG_IN || ""}`);
  info(`TRANS_LANG_OUT=${cfg.TRANS_LANG_OUT || ""}`);
  info(`LANGUAGE_PAIRS=${cfg.LANGUAGE_PAIRS || ""}`);
  info(`DEFAULT_TARGET_LANGUAGE=${cfg.DEFAULT_TARGET_LANGUAGE || ""}`);
  info(`DISCORD_USER_TARGET_LANGUAGES=${cfg.DISCORD_USER_TARGET_LANGUAGES || ""}`);
  info(`OPENAI_MODEL=${cfg.OPENAI_MODEL || ""}`);
  info(`OPENAI_TRANSCRIBE_MODEL=${cfg.OPENAI_TRANSCRIBE_MODEL || ""}`);
  info(`OPENAI_TTS_MODEL=${cfg.OPENAI_TTS_MODEL || ""}`);
  info(`OPENAI_TTS_VOICE=${cfg.OPENAI_TTS_VOICE || ""}`);
  info(`OPENAI_TTS_FORMAT=${cfg.OPENAI_TTS_FORMAT || ""}`);
  info(`SPEECH_SILENCE_MS=${cfg.SPEECH_SILENCE_MS || ""}`);
  info(`VOICE_MIN_PCM_BYTES=${cfg.VOICE_MIN_PCM_BYTES || ""}`);
  info(`VOICE_MAX_PCM_BYTES=${cfg.VOICE_MAX_PCM_BYTES || ""}`);
  info(`REQUIRE_START_COMMAND=${cfg.REQUIRE_START_COMMAND || ""}`);
  info(`VOICE_TEXT_FEEDBACK=${cfg.VOICE_TEXT_FEEDBACK || ""}`);
}

function logsVoiceCmd(linesArg) {
  const raw = String(linesArg || "60").trim();
  if (!/^[0-9]+$/.test(raw)) {
    fail("voice logs value must be numeric");
  }

  const count = Number.parseInt(raw, 10);
  const tail = tailLogLines(count, VOICE_LOG_FILE);
  if (tail) console.log(tail);
}

async function voiceMain(args) {
  const command = args[0] || "help";

  switch (command) {
    case "init":
      initVoiceCmd();
      return;
    case "kick":
    case "leave":
      await stopVoiceCmd();
      return;
    case "start":
      await startVoiceCmd();
      return;
    case "stop":
      await stopVoiceCmd();
      return;
    case "restart":
      await restartVoiceCmd();
      return;
    case "status":
      statusVoiceCmd();
      return;
    case "show":
      showVoiceCmd();
      return;
    case "logs":
      logsVoiceCmd(args[1] || "60");
      return;
    case "set": {
      const key = args[1] || "";
      const value = args.slice(2).join(" ").trim();
      setVoiceCmd(key, value);
      return;
    }
    case "help":
    case "-h":
    case "--help":
      usage();
      return;
    default:
      fail(`unknown voice command: ${command}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "voice":
    case "call":
      await voiceMain(args.slice(1));
      return;
    case "start":
      await startCmd();
      return;
    case "stop":
      await stopCmd();
      return;
    case "restart":
      await restartCmd();
      return;
    case "status":
      statusCmd();
      return;
    case "show":
      showCmd();
      return;
    case "logs":
      logsCmd(args[1] || "60");
      return;
    case "set": {
      const key = args[1] || "";
      const value = args.slice(2).join(" ").trim();
      setCmd(key, value);
      return;
    }
    case "help":
    case "-h":
    case "--help":
      usage();
      return;
    default:
      fail(`unknown command: ${command}`);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
