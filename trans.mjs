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

Notes:
  - Config file: .trans.env (auto-created from .trans.env.example if missing)
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

function upsertConfigValue(key, value) {
  const normalizedValue = String(value ?? "");
  const lines = fs.existsSync(CONFIG_FILE)
    ? fs.readFileSync(CONFIG_FILE, "utf8").split(/\r?\n/)
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
  fs.writeFileSync(CONFIG_FILE, `${finalLines.join("\n")}\n`, "utf8");
}

function readConfig() {
  return parseEnvFile(CONFIG_FILE);
}

function readConfigValue(key) {
  const cfg = readConfig();
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

function isClearValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "clear" || normalized === "none" || normalized === "-";
}

function syncLanguagePairsFromInOut() {
  const inLang = normalizeLang(readConfigValue("TRANS_LANG_IN"));
  const outLang = normalizeLang(readConfigValue("TRANS_LANG_OUT"));

  if (!inLang || !outLang) return;
  if (!validateLang(inLang)) fail(`invalid TRANS_LANG_IN: ${inLang}`);
  if (!validateLang(outLang)) fail(`invalid TRANS_LANG_OUT: ${outLang}`);
  if (inLang === outLang) fail("TRANS_LANG_IN and TRANS_LANG_OUT must be different");

  upsertConfigValue("TRANS_LANG_IN", inLang);
  upsertConfigValue("TRANS_LANG_OUT", outLang);
  upsertConfigValue("LANGUAGE_PAIRS", `${inLang}:${outLang},${outLang}:${inLang}`);
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

function buildRuntimeEnv(config) {
  const runtime = { ...process.env, ...config };

  const inLang = normalizeLang(config.TRANS_LANG_IN || runtime.TRANS_LANG_IN || "");
  const outLang = normalizeLang(config.TRANS_LANG_OUT || runtime.TRANS_LANG_OUT || "");
  if (inLang && outLang && inLang !== outLang) {
    runtime.LANGUAGE_PAIRS = `${inLang}:${outLang},${outLang}:${inLang}`;
  }

  return runtime;
}

function tailLogLines(linesCount) {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", "utf8");
    return "";
  }

  const content = fs.readFileSync(LOG_FILE, "utf8");
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

function setLangInCmd(value) {
  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail(`invalid language: ${value}`);

  upsertConfigValue("TRANS_LANG_IN", normalized);
  syncLanguagePairsFromInOut();
  info(`updated TRANS_LANG_IN=${normalized}`);
}

function setLangOutCmd(value) {
  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail(`invalid language: ${value}`);

  upsertConfigValue("TRANS_LANG_OUT", normalized);
  syncLanguagePairsFromInOut();
  info(`updated TRANS_LANG_OUT=${normalized}`);
}

function setUsersCmd(value) {
  if (!validateUserList(value)) fail("invalid user list format (use id1,id2,...)");
  upsertConfigValue("DISCORD_ALLOWED_USER_IDS", value);
  info("updated DISCORD_ALLOWED_USER_IDS");
}

function setChannelCmd(value) {
  if (!validateDiscordId(value)) fail("invalid channel id");
  upsertConfigValue("DISCORD_CHANNEL_ID", value);
  upsertConfigValue("DISCORD_TARGET_USER_ID", "");
  info(`updated DISCORD_CHANNEL_ID=${value}`);
  info("cleared DISCORD_TARGET_USER_ID (channel mode active)");
}

function setTargetUserCmd(value) {
  if (!validateDiscordId(value)) fail("invalid user id");
  upsertConfigValue("DISCORD_TARGET_USER_ID", value);
  upsertConfigValue("DISCORD_CHANNEL_ID", "");
  info(`updated DISCORD_TARGET_USER_ID=${value}`);
  info("cleared DISCORD_CHANNEL_ID (dm mode active)");
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

function setLanguagePairsCmd(value) {
  if (isClearValue(value)) {
    upsertConfigValue("LANGUAGE_PAIRS", "");
    info("cleared LANGUAGE_PAIRS");
    return;
  }

  const normalized = normalizeLanguagePairs(value);
  upsertConfigValue("LANGUAGE_PAIRS", normalized);
  info(`updated LANGUAGE_PAIRS=${normalized}`);
}

function setDefaultTargetCmd(value) {
  if (isClearValue(value)) {
    upsertConfigValue("DEFAULT_TARGET_LANGUAGE", "");
    info("cleared DEFAULT_TARGET_LANGUAGE");
    return;
  }

  const normalized = normalizeLang(value);
  if (!validateLang(normalized)) fail("invalid language code");

  upsertConfigValue("DEFAULT_TARGET_LANGUAGE", normalized);
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

function setUserTargetsCmd(value) {
  if (isClearValue(value)) {
    upsertConfigValue("DISCORD_USER_TARGET_LANGUAGES", "");
    info("cleared DISCORD_USER_TARGET_LANGUAGES");
    return;
  }

  const normalized = normalizeUserTargets(value);
  upsertConfigValue("DISCORD_USER_TARGET_LANGUAGES", normalized);
  info(`updated DISCORD_USER_TARGET_LANGUAGES=${normalized}`);
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
    default:
      fail(`unknown set key: ${key}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
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
