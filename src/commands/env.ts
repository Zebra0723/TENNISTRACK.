// Environment-variable management commands.

import { stdin } from "node:process";
import { logger, color } from "../lib/logger.js";
import { askSecret, confirm } from "../lib/prompt.js";
import {
  parseEnvFile,
  parseEnvLine,
  upsertEnvLine,
  envKeys,
} from "../lib/envParser.js";
import {
  readFileSafe,
  writeFileWithBackup,
  exists,
} from "../lib/filesystem.js";
import { ensureSecretsIgnored, envLocalIgnored } from "../lib/gitSafety.js";
import { isPublicName, isDangerousPublicSecret, looksPrivate, maskValue } from "../lib/secrets.js";
import { vercelInstalled, vercelLoggedIn, vercelEnvAdd, readVercelLink } from "../lib/vercelCli.js";

const ENV_LOCAL = ".env.local";
const ENV_EXAMPLE = ".env.example";

// Read a multi-line block from stdin (for pasting several vars at once).
function readStdinBlock(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (c) => (data += c));
    stdin.on("end", () => resolve(data));
    stdin.resume();
  });
}

// Warn (without printing the value) about naming issues for a key.
function warnAboutName(key: string): void {
  if (isDangerousPublicSecret(key)) {
    logger.warn(
      `${color.bold(key)} looks like a PRIVATE secret but is named with a public prefix.`,
    );
    logger.hint(
      "Anything starting with NEXT_PUBLIC_ (or VITE_/PUBLIC_) is bundled into the browser and visible to everyone. Rename it without that prefix if it must stay secret.",
    );
  } else if (isPublicName(key)) {
    logger.hint(`${key} is a PUBLIC value — it will be visible in the browser. That's expected for URLs and anon keys.`);
  } else if (looksPrivate(key)) {
    logger.hint(`${key} looks like a private secret — keep it server-side only.`);
  }
}

// Core: add a single KEY/value to .env.local and a placeholder to .env.example.
function addOneVar(key: string, value: string): { addedExample: boolean } {
  const localBefore = readFileSafe(ENV_LOCAL) ?? "";
  const localAfter = upsertEnvLine(localBefore, key, value);
  writeFileWithBackup(ENV_LOCAL, localAfter);

  const exampleBefore = readFileSafe(ENV_EXAMPLE) ?? "";
  const hadKey = envKeys(exampleBefore).includes(key);
  const exampleAfter = upsertEnvLine(exampleBefore, key, "");
  writeFileWithBackup(ENV_EXAMPLE, exampleAfter);

  return { addedExample: !hadKey };
}

// `setup-agent env add KEY=value`
export async function envAdd(assignment: string): Promise<void> {
  let key: string;
  let value: string;

  const parsed = parseEnvLine(assignment);
  if (parsed) {
    key = parsed.key;
    value = parsed.value;
  } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(assignment.trim())) {
    key = assignment.trim();
    value = await askSecret(`Enter the value for ${key} (input hidden):`);
  } else {
    logger.error(`Could not understand "${assignment}". Use the form KEY=value.`);
    return;
  }

  if (!value) {
    logger.warn(`No value provided for ${key}. Added the key with an empty value — fill it in later.`);
  }

  const { addedExample } = addOneVar(key, value);
  const added = ensureSecretsIgnored();

  logger.success(`Saved ${color.bold(key)} to ${ENV_LOCAL} (value ${maskValue(value)}).`);
  if (addedExample) logger.success(`Added a safe placeholder for ${key} to ${ENV_EXAMPLE}.`);
  if (added.length) logger.success(`Made sure ${added.join(", ")} are ignored by Git so your secrets stay off GitHub.`);
  warnAboutName(key);
  logger.blank();
  logger.info("Done. Your real value is only in .env.local (never printed, never committed).");
}

// `setup-agent env add-bulk` — paste several KEY=value lines.
export async function envAddBulk(): Promise<void> {
  logger.heading("Add multiple environment variables");
  if (stdin.isTTY) {
    logger.info("Paste your KEY=value lines below. When finished, press Enter then Ctrl+D.");
    logger.blank();
  }
  const block = await readStdinBlock();
  const vars = parseEnvFile(block);
  if (!vars.length) {
    logger.warn("No valid KEY=value lines found. Nothing was changed.");
    return;
  }

  for (const { key, value } of vars) {
    addOneVar(key, value);
    logger.success(`${key} -> ${ENV_LOCAL} (${maskValue(value)})`);
    warnAboutName(key);
  }
  const added = ensureSecretsIgnored();
  if (added.length) logger.success(`Ensured ${added.join(", ")} are gitignored.`);
  logger.blank();
  logger.info(`Added ${vars.length} variable(s) to ${ENV_LOCAL} and placeholders to ${ENV_EXAMPLE}.`);
}

// `setup-agent env check`
export async function envCheck(): Promise<void> {
  logger.heading("Environment variable check");

  const localKeys = new Set(envKeys(readFileSafe(ENV_LOCAL) ?? ""));
  const exampleKeys = new Set(envKeys(readFileSafe(ENV_EXAMPLE) ?? ""));

  if (!exists(ENV_LOCAL) && !exists(ENV_EXAMPLE)) {
    logger.info("No .env.local or .env.example found yet. Use `setup-agent env add KEY=value` to start.");
    return;
  }

  const missingInLocal = [...exampleKeys].filter((k) => !localKeys.has(k));
  const missingInExample = [...localKeys].filter((k) => !exampleKeys.has(k));

  if (missingInLocal.length) {
    logger.warn(`These keys are in ${ENV_EXAMPLE} but missing from your ${ENV_LOCAL}:`);
    missingInLocal.forEach((k) => logger.info(`  • ${k}`));
    logger.hint("Add them with `setup-agent env add KEY=value` so the app has what it needs.");
  } else {
    logger.success(`Every key in ${ENV_EXAMPLE} is present in ${ENV_LOCAL}.`);
  }

  if (missingInExample.length) {
    logger.info(`\nThese keys are only in ${ENV_LOCAL} (consider documenting them in ${ENV_EXAMPLE}):`);
    missingInExample.forEach((k) => logger.info(`  • ${k}`));
  }

  const dangerous = [...localKeys, ...exampleKeys].filter(isDangerousPublicSecret);
  if (dangerous.length) {
    logger.blank();
    logger.warn("These keys look like private secrets but use a public prefix (they'd leak to the browser):");
    dangerous.forEach((k) => logger.info(`  • ${k}`));
  }

  logger.blank();
  if (envLocalIgnored()) {
    logger.success(".env.local is ignored by Git — your secrets won't be uploaded.");
  } else {
    logger.warn(".env.local is NOT ignored by Git! Run `setup-agent doctor --fix` to fix this before pushing.");
  }
}

// Shared implementation for pushing env vars to Vercel (used by env + vercel cmds).
export async function envSyncVercel(opts: { target?: string } = {}): Promise<void> {
  logger.heading("Sync environment variables to Vercel");

  if (!vercelInstalled()) {
    logger.error("The Vercel CLI isn't installed.");
    logger.hint("Install it with:  npm i -g vercel   then run `setup-agent connect vercel`.");
    return;
  }
  if (!(await vercelLoggedIn())) {
    logger.error("You're not logged in to Vercel.");
    logger.hint("Log in with:  vercel login");
    return;
  }
  if (!readVercelLink().linked) {
    logger.warn("This project isn't linked to a Vercel project yet.");
    logger.hint("Run `setup-agent vercel link` first, then try again.");
    return;
  }

  const vars = parseEnvFile(readFileSafe(ENV_LOCAL) ?? "");
  if (!vars.length) {
    logger.warn(`No variables found in ${ENV_LOCAL}. Nothing to sync.`);
    return;
  }

  // Choose target environment(s).
  const target = (opts.target ?? "preview").toLowerCase();
  const valid = ["development", "preview", "production"];
  if (!valid.includes(target)) {
    logger.error(`Unknown target "${target}". Choose one of: ${valid.join(", ")}.`);
    return;
  }

  if (target === "production") {
    const ok = await confirm(
      `You're about to push ${vars.length} variable(s) to ${color.bold("PRODUCTION")}. Continue?`,
    );
    if (!ok) {
      logger.info("Cancelled. Nothing was pushed to production.");
      return;
    }
  }

  logger.info(`Pushing ${vars.length} variable(s) to the ${color.bold(target)} environment...`);
  logger.blank();

  let added = 0;
  let skipped = 0;
  for (const { key, value } of vars) {
    // Guard: don't silently push a private secret that is named public.
    if (isDangerousPublicSecret(key)) {
      const ok = await confirm(`${key} looks like a private secret with a public name. Push it anyway?`);
      if (!ok) {
        logger.info(`  ${key}: skipped`);
        skipped++;
        continue;
      }
    }
    const res = await vercelEnvAdd(key, value, target as "development" | "preview" | "production");
    if (res.ok) {
      logger.success(`  ${key} -> ${target} (${maskValue(value)})`);
      added++;
    } else if (res.message === "already exists") {
      logger.info(`  ${key}: already set on Vercel (${maskValue(value)}) — skipped`);
      skipped++;
    } else {
      logger.warn(`  ${key}: could not sync`);
      skipped++;
    }
  }

  logger.blank();
  logger.info(`Synced ${added} variable(s) to ${target}. ${skipped} skipped. No secret values were printed.`);
  if (added > 0) logger.hint("Redeploy on Vercel for the new variables to take effect.");
}
